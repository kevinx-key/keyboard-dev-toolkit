"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Save, Upload, FolderOpen } from "lucide-react";
import { useKeyboardEditor, type StepConfig } from "../hooks/useKeyboardEditor";
import TopBar from "./TopBar";
import FloatingToolbar, { type SpecialKeyDef } from "./FloatingToolbar";
import KeyboardCanvas from "./KeyboardCanvas";
import ToolBelt from "./ToolBelt";
import AiFloatingPanel from "./AiFloatingPanel";
import PlateSection from "./PlateSection";
import SwitchFoamSection from "./SwitchFoamSection";
import PCBSection from "./PCBSection";
import SwitchPadSection from "./SwitchPadSection";
import BottomFoamSection from "./BottomFoamSection";
import PricingSection from "./PricingSection";
import HelpDialog from "./HelpDialog";
import BackupDialog from "./BackupDialog";
import ProjectBackupDialog from "./ProjectBackupDialog";
import StpExportOverlay from "./StpExportOverlay";
import QmkExportOverlay from "./QmkExportOverlay";
import { downloadJSON, downloadSVG, downloadPNG, downloadJPG, exportSVG, renderSVGToBlob, exportJSON } from "../lib/kle-export";
import { installGlobalErrorHandler, addLog, downloadLog } from "../lib/error-logger";
import { SAMPLES, ALL_PRESETS } from "../data/presets";
import { getRawRows, parseKLEJSON, parseLayoutJSON } from "../lib/kle-serial";
import { getPlatform, saveFile, openExternal, APP_VERSION } from "../lib/platform-bridge";
import { initPluginSystem } from "../plugins";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import type { KLEMeta } from "../lib/kle-types";
import { DEFAULT_META, getDecalConfig } from "../lib/kle-types";
import type { PlateRotationOverrides } from "../lib/plate-export";
import type { PCBSwitchRotations, PCBStabRotations, PCBConfig } from "../lib/pcb-export";
import type { PlateSettings, FoamSettings, PadSettings, BottomFoamSettings } from "../lib/editor-settings";
import {
  DEFAULT_PCB_CONFIG,
  DEFAULT_PLATE_SETTINGS,
  DEFAULT_FOAM_SETTINGS,
  DEFAULT_PAD_SETTINGS,
  DEFAULT_BOTTOM_FOAM_SETTINGS,
} from "../lib/editor-settings";
import { computePCBBounds } from "../lib/pcb-export";
import { useProjectPersistence } from "../hooks/useProjectPersistence";
import { useStpExport } from "../hooks/useStpExport";
import { CompatLayerProvider } from "../lib/compat-layer";
import { serializeProjectFile } from "../lib/project-serial";
import type { PlateOrderInfo } from "../lib/checkout-payload";

declare global {
  interface Window {
    downloadLog?: typeof downloadLog;
  }
}

// Complex sample names that should get the keycap top effect.
const COMPLEX_SAMPLE_EFFECT: Record<string, string> = {};
for (const s of SAMPLES) {
  const n = s.name.toLowerCase();
  if (n === "apple wireless" || n === "programmer's keyboard") continue;
  COMPLEX_SAMPLE_EFFECT[n] = (n === "gb: ccng" || n === "stealth black") ? "linear" : "radial";
}

export default function EditorPage() {
  const { t } = useI18n();
  // step config for keyboard shortcuts
  const stepRef = useRef<StepConfig>({ move: 0.25, size: 0.25, rotate: 15 });
  const [, forceUpdate] = useState(0);

  const editor = useKeyboardEditor(stepRef);
  const { state, moveSelected } = editor;
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [backupDialogOpen, setBackupDialogOpen] = useState(false);
  const { theme } = useTheme();
  const [projectRotations, setProjectRotations] = useState<PlateRotationOverrides>({});
  const [projectSwitchRots, setProjectSwitchRots] = useState<PCBSwitchRotations>({});
  const [projectStabRots, setProjectStabRots] = useState<PCBStabRotations>({});
  const [projectPcbConfig, setProjectPcbConfig] = useState<PCBConfig>({ ...DEFAULT_PCB_CONFIG });
  // ── 各编辑器设置（受控，便于「保存全部」完整持久化 + 刷新自动恢复） ──
  const [plateConfig, setPlateConfig] = useState<PlateSettings>({ ...DEFAULT_PLATE_SETTINGS });
  const [foamConfig, setFoamConfig] = useState<FoamSettings>({ ...DEFAULT_FOAM_SETTINGS });
  const [padConfig, setPadConfig] = useState<PadSettings>({ ...DEFAULT_PAD_SETTINGS });
  const [bottomFoamConfig, setBottomFoamConfig] = useState<BottomFoamSettings>({ ...DEFAULT_BOTTOM_FOAM_SETTINGS });

  // PCB 成品板框尺寸（mm）——计价「从 PCB 编辑器取尺寸」的唯一数据源
  const pcbBounds = useMemo(
    () => computePCBBounds(state.layout, projectPcbConfig),
    [state.layout, projectPcbConfig],
  );

  // 一键下单：定位板报价上报（PlateSection → 此处 → PricingSection 合并下单）
  const [plateOrder, setPlateOrder] = useState<PlateOrderInfo | null>(null);
  const handlePlateOrderChange = useCallback((info: PlateOrderInfo | null) => setPlateOrder(info), []);

  // 一键下单：订单快照用完整项目文件（与「保存全部」同格式，生产端可回载继续）
  const getProjectJson = useCallback((): unknown => {
    try {
      const json = serializeProjectFile({
        name: state.layout.meta.name || "Keyboard",
        layout: state.layout,
        kLayout: getRawRows(state.layout),
        plateRotations: projectRotations,
        plateConfig,
        switchRotations: projectSwitchRots,
        stabRotations: projectStabRots,
        pcbConfig: projectPcbConfig,
        foamConfig,
        padConfig,
        bottomFoamConfig,
        decal: (() => {
          const d = getDecalConfig(state.layout.meta);
          return d ? { image: d.image, scale: d.scale, x: d.x, y: d.y, dim: d.dim, opacity: d.opacity, natW: d.natW, natH: d.natH } : null;
        })(),
      });
      return JSON.parse(json);
    } catch {
      return { kLayout: getRawRows(state.layout) };
    }
  }, [state.layout, projectRotations, plateConfig, projectSwitchRots, projectStabRots, projectPcbConfig, foamConfig, padConfig, bottomFoamConfig]);

  // 跨区域选中互斥：任意一处（画布/定位板/轴间棉/PCB）选中时，其余区域一律清空，只保留最新一处。
  type SelectionSource = "canvas" | "plate" | "foam" | "pcb";
  const [activeSelSource, setActiveSelSource] = useState<SelectionSource | null>(null);

  // STP export state
  const {
    stpExporting,
    stpProgress,
    handleStpProgress,
    handleStpExportingChange,
  } = useStpExport();

  // QMK export state
  const [qmkOverlayVisible, setQmkOverlayVisible] = useState(false);

  const qmkKeyProps = state.layout.keys.map(k => ({
    x: k.x, y: k.y, w: k.w, h: k.h,
    labels: k.labels, d: k.d,
    r: k.r, rx: k.rx, ry: k.ry,
    c: k.c, t: k.t,
  }));

  // Auto-load first default preset (Default 60%) as default layout
  const autoLoadDoneRef = useRef(false);
  useEffect(() => {
    if (autoLoadDoneRef.current) return;
    if (state.layout.keys.length === 0 && ALL_PRESETS.length > 0) {
      const defaultPreset = ALL_PRESETS[0]!;
      const keys = parseLayoutJSON(defaultPreset.data);
      const meta: KLEMeta = { ...DEFAULT_META, name: defaultPreset.name, backcolor: "#eeeeee" };
      editor.loadLayout({ meta, keys, _sourceCache: defaultPreset.data as unknown[] });
    }
    autoLoadDoneRef.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Project persistence
  const {
    projectBkDialogOpen,
    setProjectBkDialogOpen,
    projectBackupList,
    handleSaveAll,
    handleUploadAll,
    handleOpenProjectBackup,
    handleRestoreFromProjectBackup,
  } = useProjectPersistence({
    layout: state.layout,
    loadLayout: editor.loadLayout,
    plateRotations: projectRotations,
    switchRotations: projectSwitchRots,
    stabRotations: projectStabRots,
    pcbConfig: projectPcbConfig,
    plateConfig,
    foamConfig,
    padConfig,
    bottomFoamConfig,
    setPlateRotations: setProjectRotations,
    setSwitchRotations: setProjectSwitchRots,
    setStabRotations: setProjectStabRots,
    setPcbConfig: setProjectPcbConfig,
    setPlateConfig,
    setFoamConfig,
    setPadConfig,
    setBottomFoamConfig,
  });

  // Install global error logger + init plugin system
  useEffect(() => {
    installGlobalErrorHandler();
    window.downloadLog = downloadLog;
    initPluginSystem();
    addLog({ type: "info", message: "EditorPage mounted — error logger installed" });
  }, []);

  // F1 / ? keyboard shortcut to open help dialog
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "F1" || e.key === "?") {
        e.preventDefault();
        setHelpDialogOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Download handlers ──

  const handleDownloadJSON = async () => {
    if (getPlatform() === "tauri") {
      const json = exportJSON(state.layout);
      await saveFile(json, {
        defaultName: `${state.layout.meta.name || "keyboard-layout"}.json`,
        mimeType: "application/json",
      });
    } else {
      downloadJSON(state.layout);
    }
  };

  const handleDownloadSVG = async () => {
    if (getPlatform() === "tauri") {
      const svg = exportSVG(state.layout, 2);
      await saveFile(svg, {
        defaultName: `${state.layout.meta.name || "keyboard-layout"}.svg`,
        mimeType: "image/svg+xml",
      });
    } else {
      downloadSVG(state.layout, 2);
    }
  };

  const handleDownloadPNG = async (scale: number) => {
    if (getPlatform() === "tauri") {
      const blob = await renderSVGToBlob(state.layout, scale, "png");
      if (blob) {
        await saveFile(blob, {
          defaultName: `${state.layout.meta.name || "keyboard-layout"}@${scale}x.png`,
          mimeType: "image/png",
        });
      }
    } else {
      downloadPNG(state.layout, scale);
    }
  };

  const handleDownloadJPG = async () => {
    if (getPlatform() === "tauri") {
      const blob = await renderSVGToBlob(state.layout, 1, "jpeg", 0.92);
      if (blob) {
        await saveFile(blob, {
          defaultName: `${state.layout.meta.name || "keyboard-layout"}.jpg`,
          mimeType: "image/jpeg",
        });
      }
    } else {
      downloadJPG(state.layout, 1);
    }
  };

  const handleDownloadThumb = async () => {
    await handleDownloadPNG(0.5);
  };

  const handleAddSpecialKey = (keyDef: SpecialKeyDef) => {
    editor.addSpecialKey(keyDef);
  };

  const handleOpenBackup = () => setBackupDialogOpen(true);
  const handleRestoreFromBackup = (json: string) => {
    try {
      const data = JSON.parse(json);
      const layout = parseKLEJSON(data);
      if (layout) editor.loadLayout(layout);
    } catch (e) {
      addLog({ type: "error", message: "handleRestoreFromBackup: invalid backup data", stack: (e as Error)?.stack });
    }
  };

  const handleInsertChar = (char: string) => {
    if (state.selectedIds.length > 0) {
      const firstId = state.selectedIds[0]!;
      const idx = parseInt(firstId);
      const key = state.layout.keys[idx];
      if (!key) return;
      const newLabels = [...key.labels];
      newLabels[4] = (newLabels[4] || "") + char;
      editor.setProp([firstId], "labels", newLabels);
    }
  };

  // SYNC THEME TO DOCUMENT CLASS
  useEffect(() => {
    document.documentElement.classList.remove(
      "theme-classic", "theme-dark", "theme-material", "theme-future", "theme-business"
    );
    document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);

  // 鸣谢 · 友链（页脚）
  const linkGroups = useMemo(() => ([
    {
      title: t("footer.origin"),
      items: [
        { label: "Keyboard Layout Editor", url: "http://www.keyboard-layout-editor.com/", desc: t("footer.descKle") },
        { label: "builder.swillkb.com", url: "http://builder.swillkb.com/", desc: t("footer.descSwillkb") },
      ],
    },
    {
      title: t("footer.site"),
      items: [
        { label: "kindlestar.online", url: "https://kindlestar.online/", desc: t("footer.descOfficialSite") },
        { label: t("footer.onlinePreview"), url: "https://kevinx-key.github.io/keyboard-dev-toolkit/", desc: t("footer.descOnlinePreview") },
        { label: t("footer.github"), url: "https://github.com/kevinx-key/keyboard-dev-toolkit", desc: t("footer.codeOnGitHub") },
        { label: t("footer.issuesLabel"), url: "https://github.com/kevinx-key/keyboard-dev-toolkit/issues", desc: t("footer.issuesDesc") },
        { label: "Discord", url: "https://discord.gg/ztQnqW5MTd", desc: t("footer.discordDesc") },
      ],
    },
    {
      title: t("footer.community"),
      items: [
        { label: "zFrontier 装备前线", url: "https://www.zfrontier.com/", desc: t("footer.descCommunityZf") },
        { label: "Geekhack", url: "https://geekhack.org/index.php", desc: t("footer.descCommunityGh") },
        { label: "r/mechmarket", url: "https://www.reddit.com/r/mechmarket/", desc: t("footer.descCommunityMechmarket") },
      ],
    },
  ]), [t]);

  return (
    <CompatLayerProvider>
      {/* ═══ TopBar — 品牌名 + 语言/主题（右对齐） ═══ */}
      <TopBar />
      {/* 内部滚动容器（block 流：子区块保持自然高度，不被 flex 压缩） */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>

        {/* ═══ Canvas Area with Toolbar (正常流，非悬浮) ═══ */}
        <div className="kle-canvas-area" style={{
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          backgroundColor: "var(--theme-canvas-area)",
        }}>
          {/* HUD 数据标签（future 主题显示） */}
          <div className="kle-hud-overlay" aria-hidden="true">
            <span className="kle-data-label">GRID 32px · {state.layout.keys.length} KEYS</span>
          </div>

          {/* FloatingToolbar — 正常文档流（画布上方整行） */}
          <div style={{ flexShrink: 0 }}>
            <FloatingToolbar
              canUndo={state.undoStack.length > 0}
              canRedo={state.redoStack.length > 0}
              hasSelection={state.selectedIds.length > 0}
              hasClipboard={state.clipboard !== null}
              stepConfig={stepRef.current}
              layoutName={state.layout.meta.name}
              onStepChange={(steps) => { stepRef.current = steps; forceUpdate(n => n + 1); }}
              onAddKeys={editor.addKeys}
              onAddSpecialKey={handleAddSpecialKey}
              onDelete={editor.deleteSelected}
              onUndo={editor.undo}
              onRedo={editor.redo}
              onCut={editor.cut}
              onCopy={editor.copy}
              onPaste={editor.paste}
              onLoadLayout={editor.loadLayout}
              onDownloadJSON={handleDownloadJSON}
              onDownloadSVG={handleDownloadSVG}
              onDownloadPNG={handleDownloadPNG}
              onDownloadJPG={handleDownloadJPG}
              onDownloadThumb={handleDownloadThumb}
            />
          </div>

          {/* KeyboardCanvas（画布随配列内容定高，整页滚动查看下方区块） */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <KeyboardCanvas
              keys={state.layout.keys}
              selectedIds={state.selectedIds}
              onSelectKey={(id, additive) => {
                setActiveSelSource("canvas");
                if (additive) { editor.toggleSelection(id); }
                else { editor.setSelection([id]); }
              }}
              onSelectArea={(ids) => { setActiveSelSource("canvas"); editor.setSelection(ids); }}
              onClearSelection={editor.clearSelection}
              onMoveKeys={(dx, dy) => moveSelected(dx, dy)}
              backgroundColor={state.layout.meta.backcolor}
              texture={state.layout.meta.background || undefined}
              radii={state.layout.meta.radii || undefined}
              css={state.layout.meta.css || undefined}
              keycapTopEffect={COMPLEX_SAMPLE_EFFECT[(state.layout.meta.name || "").toLowerCase()] || ""}
              decal={getDecalConfig(state.layout.meta)}
              onDelete={editor.deleteSelected}
              onCopy={editor.copy}
              onCut={editor.cut}
              onPaste={editor.paste}
              onSetProp={editor.setProp}
              onAddKeys={editor.addKeys}
              infoHint={
                state.selectedIds.length > 0
                  ? t("canvas.hintSelected").replace("{{n}}", String(state.selectedIds.length))
                  : t("canvas.hintF1")
              }
            />
          </div>
        </div>

        {/* ═══ ToolBelt — replaces PropertiesPanel ═══ */}
        <ToolBelt
          keys={state.layout.keys}
          selectedIds={state.selectedIds}
          meta={state.layout.meta}
          layout={state.layout}
          onSetProp={editor.setProp}
          onSetMeta={editor.setMeta}
          onLoadLayout={editor.loadLayout}
          onOpenBackup={handleOpenBackup}
          onInsertChar={handleInsertChar}
        />

        {/* ═══ Plate Section ═══ */}
        <PlateSection
          layout={state.layout}
          config={plateConfig}
          setConfig={setPlateConfig}
          rotationOverrides={projectRotations}
          setRotationOverrides={setProjectRotations}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
          onClearCanvasSelection={editor.clearSelection}
          activeSelSource={activeSelSource}
          onActivateSelection={() => setActiveSelSource("plate")}
          onPlateOrderChange={handlePlateOrderChange}
        />

        {/* ═══ Switch Foam Section（轴间棉） ═══ */}
        <SwitchFoamSection
          layout={state.layout}
          config={foamConfig}
          setConfig={setFoamConfig}
          rotationOverrides={projectRotations}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
        />

        {/* ═══ PCB Section ═══ */}
        <PCBSection
          layout={state.layout}
          switchRotations={projectSwitchRots}
          setSwitchRotations={setProjectSwitchRots}
          stabRotations={projectStabRots}
          setStabRotations={setProjectStabRots}
          pcbConfig={projectPcbConfig}
          setPcbConfig={setProjectPcbConfig}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
          onClearCanvasSelection={editor.clearSelection}
          activeSelSource={activeSelSource}
          onActivateSelection={() => setActiveSelSource("pcb")}
        />

        {/* ═══ Switch Pad Section（轴下垫，依托 PCB 配置） ═══ */}
        <SwitchPadSection
          layout={state.layout}
          pcbConfig={projectPcbConfig}
          switchRotations={projectSwitchRots}
          stabRotations={projectStabRots}
          config={padConfig}
          setConfig={setPadConfig}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
        />

        {/* ═══ Bottom Foam Section（底棉，依托 PCB 配置） ═══ */}
        <BottomFoamSection
          layout={state.layout}
          pcbConfig={projectPcbConfig}
          switchRotations={projectSwitchRots}
          config={bottomFoamConfig}
          setConfig={setBottomFoamConfig}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
        />

        {/* ═══ Pricing Section ═══ */}
        <PricingSection
          layout={state.layout}
          rgbEnabled={projectPcbConfig.needLed}
          pcbSize={pcbBounds}
          getProjectJson={getProjectJson}
          plateOrder={plateOrder}
        />

        {/* ═══ Footer Actions ═══ */}
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          padding: "14px 12px 16px 12px",
          borderTop: "1px solid var(--theme-border-light)",
          margin: "8px 12px 0 12px",
        }}>
          <button onClick={handleSaveAll}
            data-testid="footer-save-all"
            title={t("tip.footerSaveAll")}
            className="kle-btn kle-btn-success btn-hover-accent"
            style={{ padding: "8px 24px", fontWeight: 600, cursor: "pointer" }}
          >
            <Save size={14} strokeWidth={2} /> {t("footer.saveAll")}
          </button>
          <button onClick={handleUploadAll}
            data-testid="footer-upload-all"
            title={t("tip.footerUploadAll")}
            className="kle-btn btn-hover-surface"
            style={{ padding: "8px 24px", fontWeight: 600, cursor: "pointer" }}
          >
            <Upload size={14} strokeWidth={2} /> {t("footer.uploadAll")}
          </button>
          <button onClick={handleOpenProjectBackup}
            data-testid="footer-open-backup"
            title={t("tip.openBackup")}
            className="kle-btn btn-hover-surface"
            style={{ padding: "8px 24px", fontWeight: 600, cursor: "pointer", color: "var(--theme-warning)" }}
          >
            <FolderOpen size={14} strokeWidth={2} /> {t("backup.openBtn")}
          </button>
        </div>

        {/* ═══ Acknowledgments & Links（鸣谢 · 友链） ═══ */}
        <div style={{
          borderTop: "1px solid var(--theme-border-light)",
          margin: "8px 12px 0 12px",
          padding: "18px 12px 6px 12px",
        }}>
          <div style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: "var(--theme-text)" }}>
            {t("footer.thanksTitle")}
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "var(--theme-text-dim)", margin: "4px 0 16px 0" }}>
            {t("footer.thanksLead")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "18px 48px" }}>
            {linkGroups.map((group) => (
              <div key={group.title} style={{ minWidth: 150 }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--theme-text-muted)", marginBottom: 8 }}>
                  {group.title}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {group.items.map((item) => (
                    <li key={item.url}>
                      <a
                        href={item.url}
                        onClick={(e) => { e.preventDefault(); void openExternal(item.url); }}
                        title={item.url}
                        style={{ fontSize: 12, fontWeight: 600, color: "var(--theme-primary)", textDecoration: "none", cursor: "pointer" }}
                      >
                        {item.label}
                      </a>
                      <div style={{ fontSize: 10, color: "var(--theme-text-dim)", marginTop: 2 }}>
                        {item.desc}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Version Bar ═══ */}
        <div style={{
          textAlign: "center",
          padding: "4px 12px 8px 12px",
          fontSize: 10,
          color: "var(--theme-text-dim)",
          fontFamily: "var(--theme-font-mono)",
          letterSpacing: 0.5,
          opacity: 0.6,
        }}>
          Keyboard Dev Toolkit v{APP_VERSION}
        </div>
      </div>

      {/* ── Overlays — all preserved ── */}
      <StpExportOverlay visible={stpExporting} progress={stpProgress} />

      <QmkExportOverlay
        visible={qmkOverlayVisible}
        keyProps={qmkKeyProps}
        keyboardName={state.layout.meta.name}
        onClose={() => setQmkOverlayVisible(false)}
      />

      <HelpDialog
        open={helpDialogOpen}
        onClose={() => setHelpDialogOpen(false)}
      />
      <BackupDialog
        open={backupDialogOpen}
        onClose={() => setBackupDialogOpen(false)}
        onRestore={handleRestoreFromBackup}
      />

      <ProjectBackupDialog
        open={projectBkDialogOpen}
        backupList={projectBackupList}
        onClose={() => setProjectBkDialogOpen(false)}
        onRestore={handleRestoreFromProjectBackup}
      />

      <AiFloatingPanel layout={state.layout} onAiCommit={editor.commitLayout} />
    </CompatLayerProvider>
  );
}

EditorPage.displayName = "EditorPage";

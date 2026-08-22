"use client";

import { useState, useEffect, useRef } from "react";
import { Save, Upload, FolderOpen, Zap } from "lucide-react";
import { useKeyboardEditor, type StepConfig } from "../hooks/useKeyboardEditor";
import TopBar from "./TopBar";
import FloatingToolbar, { type SpecialKeyDef } from "./FloatingToolbar";
import KeyboardCanvas from "./KeyboardCanvas";
import ToolBelt from "./ToolBelt";
import PlateSection from "./PlateSection";
import PCBSection from "./PCBSection";
import HelpDialog from "./HelpDialog";
import BackupDialog from "./BackupDialog";
import ProjectBackupDialog from "./ProjectBackupDialog";
import StpExportOverlay from "./StpExportOverlay";
import QmkExportOverlay from "./QmkExportOverlay";
import { downloadJSON, downloadSVG, downloadPNG, downloadJPG, exportSVG, renderSVGToBlob } from "../lib/kle-export";
import { installGlobalErrorHandler, addLog, downloadLog } from "../lib/error-logger";
import { SAMPLES, ALL_PRESETS } from "../data/presets";
import { getRawRows, parseKLEJSON, parseLayoutJSON } from "../lib/kle-serial";
import { getPlatform, saveFile, APP_VERSION } from "../lib/platform-bridge";
import { initPluginSystem } from "../plugins";
import { useTheme } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import type { KLEMeta } from "../lib/kle-types";
import { DEFAULT_META } from "../lib/kle-types";
import type { PlateRotationOverrides } from "../lib/plate-export";
import type { PCBSwitchRotations, PCBStabRotations, PCBConfig } from "../lib/pcb-export";
import { useProjectPersistence } from "../hooks/useProjectPersistence";
import { useStpExport } from "../hooks/useStpExport";

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
  const [projectPcbConfig, setProjectPcbConfig] = useState<PCBConfig>({
    solderType: "socket", needStab: true, needLed: false, edgeDistance: 5,
    needTypeC: false, need4P: false, needMCU: false,
    typeCX: -1.5, typeCY: 16, fourPX: 196, fourPY: 17.5, mcuX: 91, mcuY: 62,
    typeCRot: 270, fourPRot: 270, mcuRot: 45,
  });

  // Cross-region selection sync
  const [clearNonCanvasEpoch, setClearNonCanvasEpoch] = useState(0);
  useEffect(() => {
    if (state.selectedIds.length > 0) {
      setClearNonCanvasEpoch(n => n + 1);
    }
  }, [state.selectedIds.length]);

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

  // Auto-load ANSI 104 as default layout
  const autoLoadDoneRef = useRef(false);
  useEffect(() => {
    if (autoLoadDoneRef.current) return;
    if (state.layout.keys.length === 0 && ALL_PRESETS.length > 0) {
      const ansi104 = ALL_PRESETS[0]!;
      const keys = parseLayoutJSON(ansi104.data);
      const meta: KLEMeta = { ...DEFAULT_META, name: ansi104.name, backcolor: "#eeeeee" };
      editor.loadLayout({ meta, keys, _sourceCache: ansi104.data as unknown[] });
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
    setPlateRotations: setProjectRotations,
    setSwitchRotations: setProjectSwitchRots,
    setStabRotations: setProjectStabRots,
    setPcbConfig: setProjectPcbConfig,
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
      const rows = getRawRows(state.layout);
      const json = JSON.stringify(rows);
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

  return (
    <>
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
                if (additive) { editor.toggleSelection(id); }
                else { editor.setSelection([id]); }
              }}
              onSelectArea={(ids) => editor.setSelection(ids)}
              onClearSelection={editor.clearSelection}
              onMoveKeys={(dx, dy) => moveSelected(dx, dy)}
              backgroundColor={state.layout.meta.backcolor}
              texture={state.layout.meta.background || undefined}
              radii={state.layout.meta.radii || undefined}
              css={state.layout.meta.css || undefined}
              keycapTopEffect={COMPLEX_SAMPLE_EFFECT[(state.layout.meta.name || "").toLowerCase()] || ""}
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
          rotationOverrides={projectRotations}
          setRotationOverrides={setProjectRotations}
          onStpExportingChange={handleStpExportingChange}
          onStpProgress={handleStpProgress}
          onClearCanvasSelection={editor.clearSelection}
          clearNonCanvasEpoch={clearNonCanvasEpoch}
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
          clearNonCanvasEpoch={clearNonCanvasEpoch}
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
          <button onClick={() => setQmkOverlayVisible(true)}
            data-testid="footer-qmk"
            title={t("tip.footerQmk")}
            className="kle-btn btn-hover-accent"
            style={{ padding: "8px 24px", fontWeight: 700, cursor: "pointer", letterSpacing: 0.3 }}
          >
            <Zap size={14} strokeWidth={2} /> {t("footer.qmkBtn")}
          </button>
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
    </>
  );
}

EditorPage.displayName = "EditorPage";

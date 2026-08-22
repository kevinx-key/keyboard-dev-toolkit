"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Grid3x3, ClipboardList, Loader2, Package, FileDown, FileCode2 } from "lucide-react";
import { generatePCB } from "../lib/pcb-export";
import type { PCBConfig, PCBResult, PCBSwitchRotations, PCBStabRotations, SolderType } from "../lib/pcb-export";
import type { KLELayout } from "../lib/kle-types";
import type { MatrixResult } from "../lib/matrix-types";
import { useI18n } from "../lib/i18n";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";
import InteractivePCBPreview from "./InteractivePCBPreview";
import { assignMatrix, keyPropsToKLEKeys } from "../lib/matrix-core";
import { isQmkExportEnabled } from "../plugins";

// ─── Constants ──────────────────────────────────────────

const DEFAULT_PCB_CONFIG: PCBConfig = {
  solderType: "socket",
  needStab: true,
  needLed: false,
  edgeDistance: 5,
  needTypeC: false,
  need4P: false,
  needMCU: false,
  typeCX: -1.5,
  typeCY: 16,
  fourPX: 196,
  fourPY: 17.5,
  mcuX: 91,
  mcuY: 62,
  typeCRot: 270,
  fourPRot: 270,
  mcuRot: 45,
};

interface PCBSectionProps {
  layout: KLELayout;
  switchRotations: PCBSwitchRotations;
  setSwitchRotations: React.Dispatch<React.SetStateAction<PCBSwitchRotations>>;
  stabRotations: PCBStabRotations;
  setStabRotations: React.Dispatch<React.SetStateAction<PCBStabRotations>>;
  pcbConfig?: PCBConfig;
  setPcbConfig?: React.Dispatch<React.SetStateAction<PCBConfig>>;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
  /** Issue 3: Clear canvas selection when user selects in PCB */
  onClearCanvasSelection?: () => void;
  /** Issue 3: Incremented when canvas selection changes — clears local selection */
  clearNonCanvasEpoch?: number;
}

const MODEL_LINKS_DEF: { labelKey: string; filename: string | null }[] = [
  { labelKey: "model.typec", filename: "type-c-connector-3d.stp" },


  { labelKey: "model.hotswap", filename: "hotswap-pcb.step" },
  { labelKey: "model.4p", filename: "4p-connector-3d.stp" },
  { labelKey: "model.mcu", filename: "mcu-3d.step" },
  { labelKey: "model.switch", filename: "switch.step" },
  { labelKey: "model.stab", filename: null },
];

export default function PCBSection({
  layout,
  switchRotations, setSwitchRotations,
  stabRotations, setStabRotations,
  pcbConfig: externalConfig, setPcbConfig: externalSetConfig,
  onStpExportingChange,
  onStpProgress,
  onClearCanvasSelection,
  clearNonCanvasEpoch,
}: PCBSectionProps) {
  const { t } = useI18n();

  // Controlled or internal config
  const isControlled = externalConfig !== undefined && externalSetConfig !== undefined;
  const [internalConfig, internalSetConfig] = useState<PCBConfig>({ ...DEFAULT_PCB_CONFIG });
  const config = isControlled ? externalConfig! : internalConfig;
  const setConfig = isControlled ? externalSetConfig! : internalSetConfig;

  const update = <K extends keyof PCBConfig>(key: K, value: PCBConfig[K]) =>
    setConfig(c => ({ ...c, [key]: value }));

  const [drawn, setDrawn] = useState(false);

  // ── Interactive preview state (selection only — rotations from parent) ──
  const [selectedSwitchId, setSelectedSwitchId] = useState<string | null>(null);
  const [selectedStabId, setSelectedStabId] = useState<string | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);

  // Issue 3: Clear local selection when canvas selection changes
  useEffect(() => {
    setSelectedSwitchId(null);
    setSelectedStabId(null);
    setSelectedComponentId(null);
  }, [clearNonCanvasEpoch]);

  const handleDraw = useCallback(() => {
    if (layout.keys.length > 0) {
      const next = !drawn;
      setDrawn(next);
      if (!next) {
        setSwitchRotations({});
        setStabRotations({});
        setSelectedSwitchId(null);
        setSelectedStabId(null);
        setSelectedComponentId(null);
      }
    }
  }, [layout.keys.length, drawn, setSwitchRotations, setStabRotations]);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modelDownloading, setModelDownloading] = useState<Record<string, boolean>>({});
  const [modelMsg, setModelMsg] = useState<{ modelKey: string; ok: boolean; text: string } | null>(null);

  const pcbResult = useMemo((): PCBResult | null => {
    if (!drawn || layout.keys.length === 0) return null;
    return generatePCB(layout, config, switchRotations, stabRotations);
  }, [drawn, config, layout, switchRotations, stabRotations]);

  // ── Matrix mode state ──
  const [matrixMode, setMatrixMode] = useState(false);
  const matrixResult = useMemo((): MatrixResult | null => {
    if (!matrixMode || layout.keys.length === 0) return null;
    const kl = keyPropsToKLEKeys(layout.keys);
    return assignMatrix(kl);
  }, [matrixMode, layout.keys]);

  const orphanCount = useMemo(() => {
    if (!matrixResult) return 0;
    const orphans = new Set<number>();
    for (const a of matrixResult.assignments) {
      const sameRow = matrixResult.assignments.filter(a2 => a2.key.y === a.key.y);
      const sorted = [...sameRow].sort((a, b) => a.key.x - b.key.x);
      const idx = sorted.findIndex(s => s.key === a.key);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        if (prev && a.key.x < prev.key.x + prev.key.w - 0.01) {
          orphans.add(matrixResult.assignments.indexOf(a));
        }
      }
    }
    return orphans.size;
  }, [matrixResult]);

  const handleStpExport = useCallback(async () => {
    if (!pcbResult?.stpData) return;
    setConverting(true);
    setStpMsg(null);
    onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(pcbResult.stpData, 1.6, `${name}_pcb.stp`, onStpProgress);
    onStpExportingChange?.(false);
    setConverting(false);
    // cancelled by user — clear spinner, no message
    if (!result.success && result.message === "cancelled") {
      return;
    }
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [pcbResult, layout.meta.name, onStpExportingChange, t]);

  const handleSvgExport = useCallback(async () => {
    if (!pcbResult?.svg) return;
    setSvgSaving(true);
    setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(pcbResult.svg, {
      defaultName: `${name}_pcb.svg`,
      mimeType: "image/svg+xml",
    });
    setSvgSaving(false);
    if (path === null) return; // cancelled or web fallback
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [pcbResult, layout.meta.name, t]);

  const [kicadSaving, setKicadSaving] = useState(false);
  const [kicadMsg, setKicadMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // KiCad/立创EDA 导出为 Pro 功能：同一 Pro 开关控制，动态加载避免免费版打包
  const kicadExportEnabled = isQmkExportEnabled();

  const handleKicadExport = useCallback(async () => {
    if (!matrixResult) return;
    setKicadSaving(true);
    setKicadMsg(null);
    if (!kicadExportEnabled) {
      setKicadSaving(false);
      setKicadMsg({ ok: false, text: t("export.kicadProOnly") });
      return;
    }
    const name = layout.meta.name || "keyboard";
    try {
      const { generateKicadPCB } = await import("../lib/kicad-export");
      const kicadPcbContent = generateKicadPCB(layout.keys, matrixResult, {
        solderType: config.solderType,
        edgeDistance: config.edgeDistance,
        keyboardName: name,
      });
      const path = await saveFile(kicadPcbContent, {
        defaultName: `${name}.kicad_pcb`,
        mimeType: "text/plain",
      });
      setKicadSaving(false);
      if (path === null) return; // cancelled
      setKicadMsg({ ok: true, text: t("export.kicadSuccess").replace("{{path}}", path) });
    } catch (err) {
      setKicadSaving(false);
      setKicadMsg({ ok: false, text: t("export.failPrefix").replace("{{err}}", err instanceof Error ? err.message : t("export.unknownErr")) });
    }
  }, [layout.keys, layout.meta.name, matrixResult, config, kicadExportEnabled, t]);

  const handleDxfExport = useCallback(async () => {
    if (!pcbResult?.dxf) return;
    setDxfSaving(true);
    setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(pcbResult.dxf, {
      defaultName: `${name}_pcb.dxf`,
      mimeType: "application/dxf",
    });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [pcbResult, layout.meta.name, t]);

  const handleModelDownload = useCallback(async (modelKey: string, filename: string) => {
    setModelDownloading(prev => ({ ...prev, [modelKey]: true }));
    setModelMsg(null);
    try {
      const response = await fetch(`/models/${filename}`);
      if (!response.ok) throw new Error(t("export.downloadFailed").replace("{{status}}", String(response.status)));
      const blob = await response.blob();
      const path = await saveFile(blob, {
        defaultName: filename,
        mimeType: "application/step",
      });
      if (path) {
        setModelMsg({ modelKey, ok: true, text: t("export.modelSuccess").replace("{{file}}", filename).replace("{{path}}", path) });
      }
    } catch (err) {
      setModelMsg({
        modelKey, ok: false,
        text: t("export.modelFail").replace("{{file}}", filename).replace("{{err}}", err instanceof Error ? err.message : t("export.unknownErr")),
      });
    } finally {
      setModelDownloading(prev => ({ ...prev, [modelKey]: false }));
    }
  }, [t]);

  // ── Interactive preview handlers ──
  // Issue 3: When selecting in PCB, clear canvas selection to prevent dual control
  const handleSelectSwitch = useCallback((id: string | null) => {
    setSelectedSwitchId(id);
    setSelectedStabId(null);
    setSelectedComponentId(null);
    if (id !== null) onClearCanvasSelection?.();
  }, [onClearCanvasSelection]);

  const handleSelectStab = useCallback((id: string | null) => {
    setSelectedStabId(id);
    setSelectedSwitchId(null);
    setSelectedComponentId(null);
    if (id !== null) onClearCanvasSelection?.();
  }, [onClearCanvasSelection]);

  const handleSpaceRotate = useCallback((id: string) => {
    if (id.startsWith("stab-")) {
      setStabRotations(prev => ({
        ...prev,
        [id]: ((prev[id] || 0) + 90) % 360,
      }));
    } else if (id.startsWith("switch-")) {
      setSwitchRotations(prev => ({
        ...prev,
        [id]: ((prev[id] || 0) + 90) % 360,
      }));
    } else if (id === "type-c") {
      setConfig(prev => ({ ...prev, typeCRot: ((prev.typeCRot || 0) + 45) % 360 }));
    } else if (id === "4p") {
      setConfig(prev => ({ ...prev, fourPRot: ((prev.fourPRot || 0) + 45) % 360 }));
    } else if (id === "mcu") {
      setConfig(prev => ({ ...prev, mcuRot: ((prev.mcuRot || 0) + 45) % 360 }));
    }
  }, [setStabRotations, setSwitchRotations, setConfig]);

  const handleSelectComponent = useCallback((id: string | null) => {
    setSelectedComponentId(id);
    setSelectedSwitchId(null);
    setSelectedStabId(null);
    if (id !== null) onClearCanvasSelection?.();
  }, [onClearCanvasSelection]);

  const handleMoveComponent = useCallback((id: string, dx: number, dy: number) => {
    setConfig(prev => {
      if (id === "type-c") {
        return { ...prev, typeCX: prev.typeCX + dx, typeCY: prev.typeCY + dy };
      } else if (id === "4p") {
        return { ...prev, fourPX: prev.fourPX + dx, fourPY: prev.fourPY + dy };
      } else if (id === "mcu") {
        return { ...prev, mcuX: prev.mcuX + dx, mcuY: prev.mcuY + dy };
      }
      return prev;
    });
  }, [setConfig]);

  const keyCount = layout.keys.filter((k) => !k.d).length;
  const selectedPcbKeyInfo = useMemo(() => {
    if (!selectedSwitchId || !selectedSwitchId.startsWith("switch-")) return null;
    const idx = parseInt(selectedSwitchId.replace("switch-", ""), 10);
    if (isNaN(idx) || idx < 0 || idx >= layout.keys.length) return null;
    const key = layout.keys[idx];
    if (!key || key.d) return null;
    return `  ${t("canvas.infoPos")} X:${key.x.toFixed(1)} Y:${key.y.toFixed(1)}  ${t("canvas.infoRot")}:${key.r || 0}°`;
  }, [layout.keys, selectedSwitchId, t]);

  const selectedComponentInfo = useMemo(() => {
    if (!selectedComponentId) return null;
    let label = "";
    let x: number, y: number, rot: number;
    switch (selectedComponentId) {
      case "type-c":
        label = "Type-C";
        x = config.typeCX;
        y = config.typeCY;
        rot = config.typeCRot;
        break;
      case "4p":
        label = "4P";
        x = config.fourPX;
        y = config.fourPY;
        rot = config.fourPRot;
        break;
      case "mcu":
        label = "MCU";
        x = config.mcuX;
        y = config.mcuY;
        rot = config.mcuRot;
        break;
      default:
        return null;
    }
    return `  ${label} — ${t("canvas.infoPos")} X:${x.toFixed(1)} Y:${y.toFixed(1)}  ${t("canvas.infoRot")}:${rot}°`;
  }, [selectedComponentId, config, t]);

  return (
    <div className="kle-panel" style={{
      border: "1px solid var(--theme-border)", borderRadius: "var(--theme-radius-md)",
      margin: "8px 12px", backgroundColor: "var(--theme-surface)",
      position: "relative", paddingTop: 6,
    }}>
      {/* Region label */}
      <div style={{
        position: "absolute", top: -8, left: 10,
        backgroundColor: "var(--theme-surface)", padding: "0 6px",
        fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)",
        letterSpacing: 0.5,
      }}>
        {t("pcb.editorLabel")}
      </div>

      {/* ── PCB Config Bar ── */}
      <div style={{ padding: "10px 12px 4px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "end", marginBottom: 6 }}>
          {/* 轴体焊接方式 */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>{t("pcb.solderType")}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {([
                { value: "socket" as SolderType, label: t("pcb.solderSocket") },
                { value: "sunken" as SolderType, label: t("pcb.solderSunken") },
                { value: "stepped" as SolderType, label: t("pcb.solderStepped") },
              ]).map(opt => (
                <label key={opt.value} title={t("tip.pcbSolder")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.solderType === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.solderType === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="solderType" checked={config.solderType === opt.value}
                    onChange={() => update("solderType", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* 边缘距离 */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>{t("pcb.edgeDist")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <input type="number" value={config.edgeDistance} min={0} max={30} step={0.5}
                title={t("tip.pcbEdge")}
                onChange={e => update("edgeDistance", parseFloat(e.target.value) || 0)}
                style={{ width: 55, padding: "3px 4px", fontSize: 12, borderRadius: 4, border: "1px solid var(--theme-border-input)" }} />
              <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
            </div>
          </div>

          {/* 轴灯孔 */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>{t("pcb.needLed")}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ value: true, label: t("pcb.ledYes") }, { value: false, label: t("pcb.ledNo") }].map(opt => (
                <label key={String(opt.value)} title={t("tip.pcbLed")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.needLed === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.needLed === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="needLed" checked={config.needLed === opt.value}
                    onChange={() => update("needLed", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* 卫星轴孔 */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>{t("pcb.needStab")}</span>
            <div style={{ display: "flex", gap: 4 }}>
              {[{ value: true, label: t("pcb.stabYes") }, { value: false, label: t("pcb.stabNo") }].map(opt => (
                <label key={String(opt.value)} title={t("tip.pcbStabHoles")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.needStab === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.needStab === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="needStab" checked={config.needStab === opt.value}
                    onChange={() => update("needStab", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Type-C */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>Type-C</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[{ value: true, label: t("pcb.ledYes") }, { value: false, label: t("pcb.ledNo") }].map(opt => (
                <label key={String(opt.value)} title={t("tip.pcbTypeC")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.needTypeC === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.needTypeC === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="needTypeC" checked={config.needTypeC === opt.value}
                    onChange={() => update("needTypeC", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
              {config.needTypeC && (
                <span style={{ display: "flex", gap: 2, fontSize: 11 }} title={t("tip.pcbCoord")}>
                  X:<input type="number" value={config.typeCX} min={-100} max={300} step={0.5} title={t("tip.pcbCoord")}
                    onChange={e => update("typeCX", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  Y:<input type="number" value={config.typeCY} min={-100} max={300} step={0.5}
                    onChange={e => update("typeCY", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  R:<input type="number" value={config.typeCRot} min={0} max={359} step={1}
                    onChange={e => update("typeCRot", (parseFloat(e.target.value) || 0) % 360)}
                    style={{ width: 40, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                </span>
              )}
            </div>
          </div>

          {/* 4P 连接器 */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>4P Connector</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[{ value: true, label: t("pcb.ledYes") }, { value: false, label: t("pcb.ledNo") }].map(opt => (
                <label key={String(opt.value)} title={t("tip.pcb4p")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.need4P === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.need4P === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="need4P" checked={config.need4P === opt.value}
                    onChange={() => update("need4P", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
              {config.need4P && (
                <span style={{ display: "flex", gap: 2, fontSize: 11 }} title={t("tip.pcbCoord")}>
                  X:<input type="number" value={config.fourPX} max={300} step={0.5} title={t("tip.pcbCoord")}
                    onChange={e => update("fourPX", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  Y:<input type="number" value={config.fourPY} max={300} step={0.5}
                    onChange={e => update("fourPY", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  R:<input type="number" value={config.fourPRot} min={0} max={359} step={1}
                    onChange={e => update("fourPRot", (parseFloat(e.target.value) || 0) % 360)}
                    style={{ width: 40, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                </span>
              )}
            </div>
          </div>

          {/* MCU */}
          <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontWeight: 500 }}>MCU</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[{ value: true, label: t("pcb.ledYes") }, { value: false, label: t("pcb.ledNo") }].map(opt => (
                <label key={String(opt.value)} title={t("tip.pcbMcu")} style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  padding: "3px 8px", fontSize: 12, borderRadius: 4,
                  border: config.needMCU === opt.value ? "1px solid var(--theme-success)" : "1px solid var(--theme-border-input)",
                  backgroundColor: config.needMCU === opt.value ? "var(--theme-success-soft)" : "transparent",
                  cursor: "pointer", userSelect: "none",
                }}>
                  <input type="radio" name="needMCU" checked={config.needMCU === opt.value}
                    onChange={() => update("needMCU", opt.value)}
                    style={{ margin: 0, accentColor: "var(--theme-success)" }} />
                  {opt.label}
                </label>
              ))}
              {config.needMCU && (
                <span style={{ display: "flex", gap: 2, fontSize: 11 }} title={t("tip.pcbCoord")}>
                  X:<input type="number" value={config.mcuX} max={300} step={0.5} title={t("tip.pcbCoord")}
                    onChange={e => update("mcuX", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  Y:<input type="number" value={config.mcuY} max={300} step={0.5}
                    onChange={e => update("mcuY", parseFloat(e.target.value) || 0)}
                    style={{ width: 45, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                  R:<input type="number" value={config.mcuRot} min={0} max={359} step={1}
                    onChange={e => update("mcuRot", (parseFloat(e.target.value) || 0) % 360)}
                    style={{ width: 40, padding: "1px 3px", fontSize: 11, borderRadius: 3, border: "1px solid var(--theme-border-input)" }} />
                </span>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Drawing PCB + Reset buttons (centered on own row) ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "2px 12px 10px 12px", borderBottom: "1px solid var(--theme-border-light)" }}>
        <button onClick={handleDraw} disabled={layout.keys.length === 0}
          title={drawn ? t("tip.resetPlate") : t("tip.pcbDraw")}
          className={layout.keys.length > 0 ? (drawn ? "btn-hover-draw-orange" : "btn-hover-draw-green") : ""}
          style={{
            padding: "6px 28px", fontSize: 13, fontWeight: 600,
            border: "none", borderRadius: 5,
            backgroundColor: layout.keys.length > 0
              ? (drawn ? "var(--theme-warning)" : "var(--theme-success)") : "var(--theme-border-input)",
            color: "var(--theme-text-inverse)", cursor: layout.keys.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          {drawn ? t("pcb.close") : t("pcb.drawingPCB")}
        </button>
        {drawn && (
          <button onClick={handleDraw}
            title={t("tip.resetPlate")}
            className="kle-btn"
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
            {t("pcb.reset")}
          </button>
        )}
      </div>

      {/* ── Matrix mode + LCEDA export row ── */}
      {drawn && (
        <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "6px 12px", borderBottom: "1px solid var(--theme-border-light)" }}>
          <button onClick={() => setMatrixMode(m => !m)}
            title={t("tip.pcbMatrix")}
            className="kle-btn"
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 600,
              border: "none", borderRadius: "var(--theme-radius-sm)",
              backgroundColor: matrixMode ? "var(--theme-accent)" : "var(--theme-accent-soft)",
              color: matrixMode ? "#fff" : "var(--theme-accent)",
              cursor: "pointer",
            }}
          >
            {matrixMode ? <><Grid3x3 size={13} /> {t("pcb.matrixClose")}</> : <><Grid3x3 size={13} /> {t("pcb.matrixAssign")}</>}
          </button>
          <button onClick={handleKicadExport}
            disabled={kicadSaving || !matrixResult}
            className="kle-btn"
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 600,
              border: "none", borderRadius: "var(--theme-radius-sm)",
              backgroundColor: kicadSaving ? "var(--theme-primary-soft)" : "var(--theme-primary-soft)",
              color: !matrixResult ? "var(--theme-text-dim)" : "var(--theme-primary)",
              cursor: !matrixResult ? "not-allowed" : kicadSaving ? "wait" : "pointer",
              opacity: !matrixResult ? 0.5 : 1,
              animation: kicadSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
            title={t("tip.pcbKicad")}
          >
            {kicadSaving ? <><Loader2 size={13} className="kle-spin" /> {t("pcb.generating")}</> : <><ClipboardList size={13} /> {t("pcb.kicadExport")}</>}
          </button>
        </div>
      )}

      {/* ── Preview Area ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {drawn && pcbResult && pcbResult.svg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <InteractivePCBPreview
              svg={pcbResult.svg}
              switchRegions={pcbResult.switchRegions || []}
              stabRegions={pcbResult.stabRegions || []}
              componentRegions={pcbResult.componentRegions || []}
              selectedSwitchId={selectedSwitchId}
              selectedStabId={selectedStabId}
              selectedComponentId={selectedComponentId}
              onSelectSwitch={handleSelectSwitch}
              onSelectStab={handleSelectStab}
              onSelectComponent={handleSelectComponent}
              onSpaceRotate={handleSpaceRotate}
              onMoveComponent={handleMoveComponent}
              switchRotations={switchRotations}
              stabRotations={stabRotations}
              componentRotations={{ typeCRot: config.typeCRot, fourPRot: config.fourPRot, mcuRot: config.mcuRot }}
              showMatrix={matrixMode}
              matrixResult={matrixResult ?? undefined}
              layoutKeys={layout.keys}
            />

            {/* Stats */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text)", fontWeight: 500 }}>
                {t("pcb.boardSize")}：{pcbResult.width.toFixed(1)} × {pcbResult.height.toFixed(1)} mm
                {"      "}{t("pcb.keyCount")}：{keyCount}
                {"      "}{t("pcb.stabCount")}:{pcbResult.stabCount}
                {matrixMode && matrixResult && (
                  <>{"      "}{t("pcb.matrixLabel")}: {matrixResult.matrixRows}×{matrixResult.matrixCols} | {t("pcb.orphanKeys")}: {orphanCount}</>
                )}
                {selectedPcbKeyInfo}{selectedComponentInfo}
              </span>
              <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-light)" }} />

              <button onClick={handleSvgExport} disabled={svgSaving}
                title={t("tip.expSvg")}
                className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                  border: "1px solid var(--theme-primary)",
                  backgroundColor: svgSaving ? "var(--theme-primary-soft)" : "var(--theme-primary)",
                  color: svgSaving ? "var(--theme-primary)" : "#fff", cursor: svgSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: svgSaving ? 0.7 : 1,
                  animation: svgSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {svgSaving ? <><Loader2 size={12} className="kle-spin" /> {t("pcb.converting")}</> : <><FileCode2 size={12} /> SVG</>}
              </button>
              <button onClick={handleDxfExport} disabled={dxfSaving}
                title={t("tip.expDxf")}
                className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                  border: "1px solid var(--theme-success)",
                  backgroundColor: dxfSaving ? "var(--theme-success-soft)" : "var(--theme-success)",
                  color: dxfSaving ? "var(--theme-success)" : "#fff", cursor: dxfSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: dxfSaving ? 0.7 : 1,
                  animation: dxfSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {dxfSaving ? <><Loader2 size={12} className="kle-spin" /> {t("pcb.converting")}</> : <><FileDown size={12} /> DXF</>}
              </button>
              {pcbResult.stpData && (
                <button onClick={handleStpExport} disabled={converting}
                  title={t("tip.expStp")}
                  className="kle-btn"
                  style={{
                    padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                    border: "1px solid var(--theme-warning)",
                    backgroundColor: converting ? "var(--theme-warning-soft)" : "var(--theme-warning-soft)",
                    color: "var(--theme-warning)", cursor: converting ? "wait" : "pointer",
                    fontWeight: 600, fontSize: 12, opacity: converting ? 0.7 : 1,
                    animation: converting ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                  }}>
                  {converting ? <><Loader2 size={13} className="kle-spin" /> {t("pcb.converting")}</> : <><Package size={13} /> {t("pcb.exportStp")}</>}
                </button>
              )}
            </div>
            {/* STP status message */}
            {stpMsg && (
              <div style={{
                padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
                backgroundColor: stpMsg.ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
                color: stpMsg.ok ? "var(--theme-success)" : "var(--theme-danger)",
                border: stpMsg.ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {stpMsg.text}
              </div>
            )}

            {/* SVG status message */}
            {svgMsg && (
              <div style={{
                padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
                backgroundColor: svgMsg.ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
                color: svgMsg.ok ? "var(--theme-success)" : "var(--theme-danger)",
                border: svgMsg.ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {svgMsg.text}
              </div>
            )}
            {/* DXF status message */}
            {dxfMsg && (
              <div style={{
                padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
                backgroundColor: dxfMsg.ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
                color: dxfMsg.ok ? "var(--theme-success)" : "var(--theme-danger)",
                border: dxfMsg.ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {dxfMsg.text}
              </div>
            )}

            {/* KiCad export status message */}
            {kicadMsg && (
              <div style={{
                padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
                backgroundColor: kicadMsg.ok ? "var(--theme-primary-soft)" : "var(--theme-danger-soft)",
                color: kicadMsg.ok ? "var(--theme-primary)" : "var(--theme-danger)",
                border: kicadMsg.ok ? "1px solid var(--theme-primary-border)" : "1px solid var(--theme-danger-border)",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {kicadMsg.text}
              </div>
            )}

            {/* STP 导出按钮加载动效（@keyframes 已提取到 globals.css） */}
          </div>
        ) : drawn ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)" }}>{t("pcb.noData")}</div>
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>
            {t("pcb.note")}
          </div>
        )}

        {/* ── Model Download Buttons (always visible) ── */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6,
          justifyContent: "center", padding: "8px 12px 10px 12px",
          borderTop: "1px solid var(--theme-border-light)",
          width: "100%",
        }}>
          {MODEL_LINKS_DEF.map((model) => {
            const hasFile = model.filename !== null;
            const label = t(model.labelKey);
            const isDownloading = modelDownloading[model.labelKey] || false;
            return (
              <button key={model.labelKey}
                onClick={() => {
                  if (hasFile && model.filename) {
                    handleModelDownload(model.labelKey, model.filename);
                  }
                }}
                disabled={!hasFile || isDownloading}
                title={!hasFile ? t("tip.modelDl") : isDownloading ? t("tip.modelDl") : `${t("tip.modelDl")}: ${model.filename}`}
                style={{
                  padding: "4px 12px", fontSize: 11,
                  borderRadius: "var(--theme-radius-sm)",
                  border: !hasFile ? "1px dashed var(--theme-border-input)"
                    : isDownloading ? "1px solid var(--theme-warning)"
                    : "1px solid var(--theme-warning-border)",
                  backgroundColor: !hasFile ? "var(--theme-bg-alt)"
                    : isDownloading ? "var(--theme-warning-soft)"
                    : "var(--theme-warning-soft)",
                  color: !hasFile ? "var(--theme-text-dim)"
                    : isDownloading ? "var(--theme-warning)"
                    : "var(--theme-warning)",
                  cursor: !hasFile ? "not-allowed" : isDownloading ? "wait" : "pointer",
                  fontWeight: 500,
                  animation: isDownloading ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {isDownloading ? <><Loader2 size={13} className="kle-spin" /> {t("pcb.downloading")}</> : <><Package size={13} /> {label}</>}
              </button>
            );
          })}
          {/* Model download status message */}
          {modelMsg && (
            <div style={{
              padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
              backgroundColor: modelMsg.ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
              color: modelMsg.ok ? "var(--theme-success)" : "var(--theme-danger)",
              border: modelMsg.ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              width: "100%",
            }}>
              {modelMsg.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

PCBSection.displayName = "PCBSection";

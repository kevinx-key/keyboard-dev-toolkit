"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Loader2, Package, FileDown, FileCode2 } from "lucide-react";
import { generatePlate } from "../lib/plate-export";
import type { PlateConfig, PlateResult, PlateRotationOverrides } from "../lib/plate-export";
import type { KLELayout } from "../lib/kle-types";
import { useI18n } from "../lib/i18n";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";
import InteractivePlatePreview from "./InteractivePlatePreview";

// ─── PlateConfig extended with swillkb controls ──────────

export interface PlateSectionConfig extends PlateConfig {
  caseType: "" | "poker" | "sandwich";
  fillet: number;
  lineColor: string;
  lineWeight: number;
  dmz: number;
  padEnabled: boolean;
  filletEnabled: boolean;
  kerfEnabled: boolean;
  u1Enabled: boolean;
  lineColorEnabled: boolean;
  lineWeightEnabled: boolean;
  customPolygons: string;
}

const DEFAULT_PLATE_CONFIG: PlateSectionConfig = {
  switchType: 1, stabType: 1, caseType: "", u1: 19.05, kerf: 0,
  topPad: 0, leftPad: 0, rightPad: 0, bottomPad: 0, xGrow: 0, yGrow: 0,
  fillet: 1, lineColor: "#000000", lineWeight: 0.05, dmz: 5,
  padEnabled: false, filletEnabled: false, kerfEnabled: false,
  u1Enabled: false, lineColorEnabled: false, lineWeightEnabled: false,
  customPolygons: "",
};

interface PlateSectionProps {
  layout: KLELayout;
  rotationOverrides: PlateRotationOverrides;
  setRotationOverrides: React.Dispatch<React.SetStateAction<PlateRotationOverrides>>;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
  /** Issue 3: Clear canvas selection when user selects in plate */
  onClearCanvasSelection?: () => void;
  /** Issue 3: Incremented when canvas selection changes — clears local selection */
  clearNonCanvasEpoch?: number;
}

export default function PlateSection({ layout, rotationOverrides, setRotationOverrides, onStpExportingChange, onStpProgress, onClearCanvasSelection, clearNonCanvasEpoch }: PlateSectionProps) {
  const { t } = useI18n();
  const [config, setConfig] = useState<PlateSectionConfig>({ ...DEFAULT_PLATE_CONFIG });
  const [drawn, setDrawn] = useState(false);

  const effectiveConfig = useMemo((): PlateConfig => {
    const c = config;
    return {
      switchType: c.switchType, stabType: c.stabType,
      u1: c.u1Enabled ? c.u1 : 19.05, kerf: c.kerfEnabled ? c.kerf : 0,
      topPad: c.padEnabled ? c.topPad : 0, leftPad: c.padEnabled ? c.leftPad : 0,
      rightPad: c.padEnabled ? c.rightPad : 0, bottomPad: c.padEnabled ? c.bottomPad : 0,
      xGrow: c.xGrow, yGrow: c.yGrow,
      fillet: c.filletEnabled ? c.fillet : 0,
    };
  }, [config]);

  // ── Interactive preview state (selection only — rotations from parent) ──
  const [selectedKeyIdx, setSelectedKeyIdx] = useState<number | null>(null);

  const plateResult = useMemo((): PlateResult | null => {
    if (!drawn || layout.keys.length === 0) return null;
    return generatePlate(layout, effectiveConfig, rotationOverrides);
  }, [drawn, effectiveConfig, layout, rotationOverrides]);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Issue 3: Clear local selection when canvas selection changes
  useEffect(() => {
    setSelectedKeyIdx(null);
  }, [clearNonCanvasEpoch]);

  const handleDraw = useCallback(() => {
    if (layout.keys.length > 0) {
      const next = !drawn;
      setDrawn(next);
      if (!next) {
        // Reset rotation state when closing
        setRotationOverrides({});
        setSelectedKeyIdx(null);
      }
    }
  }, [layout.keys.length, drawn, setRotationOverrides]);

  const handleStpExport = useCallback(async () => {
    if (!plateResult?.stpData) return;
    setConverting(true);
    setStpMsg(null);
    onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(plateResult.stpData, 1.5, `${name}_plate.stp`, onStpProgress);
    onStpExportingChange?.(false);
    setConverting(false);
    // cancelled by user — clear spinner, no message
    if (!result.success && result.message === "cancelled") {
      return;
    }
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [plateResult, layout.meta.name, onStpExportingChange, t]);

  const handleSvgExport = useCallback(async () => {
    if (!plateResult?.svg) return;
    setSvgSaving(true);
    setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(plateResult.svg, {
      defaultName: `${name}_plate.svg`,
      mimeType: "image/svg+xml",
    });
    setSvgSaving(false);
    if (path === null) return;
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [plateResult, layout.meta.name, t]);

  const handleDxfExport = useCallback(async () => {
    if (!plateResult?.dxf) return;
    setDxfSaving(true);
    setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(plateResult.dxf, {
      defaultName: `${name}_plate.dxf`,
      mimeType: "application/dxf",
    });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [plateResult, layout.meta.name, t]);

  // ── Interactive preview handlers ──
  // Issue 3: When selecting in plate, clear canvas selection to prevent dual control
  const handleSelectKey = useCallback((idx: number | null) => {
    setSelectedKeyIdx(idx);
    if (idx !== null) onClearCanvasSelection?.();
  }, [onClearCanvasSelection]);

  const handleSpaceRotate = useCallback((idx: number) => {
    setRotationOverrides(prev => ({
      ...prev,
      [idx]: ((prev[idx] || 0) + 90) % 360,
    }));
  }, [setRotationOverrides]);

  const update = <K extends keyof PlateSectionConfig>(key: K, value: PlateSectionConfig[K]) =>
    setConfig(c => ({ ...c, [key]: value }));

  const selectedPlateKeyInfo = useMemo(() => {
    if (selectedKeyIdx === null || selectedKeyIdx < 0 || selectedKeyIdx >= layout.keys.length) return null;
    const key = layout.keys[selectedKeyIdx];
    if (!key || key.d) return null;
    return `  ${t("canvas.infoPos")} X:${key.x.toFixed(1)} Y:${key.y.toFixed(1)}  ${t("canvas.infoRot")}:${key.r || 0}°`;
  }, [layout.keys, selectedKeyIdx, t]);
  const keyCount = layout.keys.filter((k) => !k.d).length;
  const stabCount = useMemo(() => layout.keys.filter((k) => {
    if (k.d) return false;
    return Math.max(k.w || 1, k.h || 1) >= 2;
  }).length, [layout.keys]);

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
        {t("plate.editorLabel")}
      </div>

      {/* ── Config bar ── */}
      <div style={{ padding: "10px 12px 4px 12px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6, alignItems: "end" }}>
          <ConfigSelect label={t("plate.switchType")} tip={t("tip.plSwitch")} value={config.switchType}
            options={[{ value: 1, label: "MX" }, { value: 2, label: "MX+Alps" }, { value: 3, label: "MX-H" }, { value: 4, label: "Alps" }]}
            onChange={v => update("switchType", v as 1 | 2 | 3 | 4)}
          />
          <ConfigSelect label={t("plate.stabType")} tip={t("tip.plStab")} value={config.stabType}
            options={[{ value: 0, label: t("plate.stabNone") }, { value: 1, label: "Cherry+Costar" }, { value: 2, label: "Cherry" }, { value: 5, label: t("plate.stabFuling") }]}
            onChange={v => update("stabType", v as 0 | 1 | 2 | 3 | 4 | 5)}
          />
          <ConfigSelect label={t("plate.caseType")} tip={t("tip.plCase")} value={config.caseType}
            options={[{ value: "", label: t("plate.caseNone") }, { value: "poker", label: "Poker — 60%" }, { value: "sandwich", label: "Sandwich" }]}
            onChange={v => update("caseType", v as "" | "poker" | "sandwich")}
          />
          <ConfigNumber label={t("plate.unit")} tip={t("tip.plUnit")} value={config.u1} enabled={config.u1Enabled} onToggle={v => update("u1Enabled", v)} onChange={v => update("u1", v)} min={10} max={30} />
          <ConfigNumber label={t("plate.kerf")} tip={t("tip.plKerf")} value={config.kerf} enabled={config.kerfEnabled} onToggle={v => update("kerfEnabled", v)} onChange={v => update("kerf", v)} min={0} max={2} step={0.05} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6, alignItems: "end" }}>
          <ConfigNumber label={t("plate.padTop")} tip={t("tip.plPad")} value={config.topPad} enabled={config.padEnabled} onToggle={v => update("padEnabled", v)} onChange={v => update("topPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padLeft")} tip={t("tip.plPad")} value={config.leftPad} enabled={config.padEnabled} onChange={v => update("leftPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padRight")} tip={t("tip.plPad")} value={config.rightPad} enabled={config.padEnabled} onChange={v => update("rightPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padBottom")} tip={t("tip.plPad")} value={config.bottomPad} enabled={config.padEnabled} onChange={v => update("bottomPad", v)} min={0} max={30} />
          <ConfigColor label={t("plate.lineColor")} tip={t("tip.plLineColor")} value={config.lineColor} enabled={config.lineColorEnabled} onToggle={v => update("lineColorEnabled", v)} onChange={v => update("lineColor", v)} />
          <ConfigNumber label={t("plate.lineWeight")} tip={t("tip.plLineWeight")} value={config.lineWeight} enabled={config.lineWeightEnabled} onToggle={v => update("lineWeightEnabled", v)} onChange={v => update("lineWeight", v)} min={0} max={1} step={0.01} />
          <ConfigNumber label={t("plate.fillet")} tip={t("tip.plFillet")} value={config.fillet} enabled={config.filletEnabled} onToggle={v => update("filletEnabled", v)} onChange={v => update("fillet", v)} min={0} max={20} step={0.5} unit="mm" />
        </div>
      </div>

      {/* ── Drawing Plate + Reset buttons (centered on own row) ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "2px 12px 10px 12px", borderBottom: "1px solid var(--theme-border-light)" }}>
        <button onClick={handleDraw} disabled={layout.keys.length === 0}
          title={drawn ? t("tip.resetPlate") : t("tip.drawPlate")}
          className={layout.keys.length > 0 ? (drawn ? "btn-hover-draw-orange" : "btn-hover-draw-green") : ""}
          style={{
            padding: "6px 28px", fontSize: 13, fontWeight: 600,
            border: "none", borderRadius: 5,
            backgroundColor: layout.keys.length > 0
            ? (drawn ? "var(--theme-warning)" : "var(--theme-success)") : "var(--theme-border-input)",
            color: "var(--theme-text-inverse)", cursor: layout.keys.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          {drawn ? t("pcb.close") : t("plate.drawing")}
        </button>
        {drawn && (
          <button onClick={handleDraw}
            title={t("tip.resetPlate")}
            className="kle-btn"
            style={{
              padding: "6px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}>
            {t("plate.reset")}
          </button>
        )}
      </div>

      {/* ── Preview area ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {drawn && plateResult && plateResult.svg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <InteractivePlatePreview
              svg={plateResult.svg}
              regions={plateResult.regions}
              selectedKeyIdx={selectedKeyIdx}
              onSelectKey={handleSelectKey}
              onSpaceRotate={handleSpaceRotate}
              rotations={rotationOverrides}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text)", fontWeight: 500 }}>
                {t("plate.boardSize")}：{plateResult.width.toFixed(1)} × {plateResult.height.toFixed(1)} mm
                {"      "}{t("plate.keyCount")}：{keyCount}
                {"      "}{t("plate.stabCount")}：{stabCount}
                {selectedPlateKeyInfo}
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
                {svgSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileCode2 size={12} /> SVG</>}
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
                {dxfSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileDown size={12} /> DXF</>}
              </button>
              {plateResult.stpData && (
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
                  {converting ? <><Loader2 size={13} className="kle-spin" /> {t("plate.converting")}</> : <><Package size={13} /> {t("plate.exportStp")}</>}
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

            {/* STP 导出按钮加载动效（@keyframes 已提取到 globals.css） */}
          </div>
        ) : drawn ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)" }}>{t("plate.noData")}</div>
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>
            {t("plate.hint")}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Config UI Helpers ─────────────────────────────────

function ConfigSelect({ label, tip, value, options, onChange }: {
  label: string; tip?: string; value: number | string; options: { value: number | string; label: string }[];
  onChange: (v: number | string) => void;
}) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)" }}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} title={tip}
        style={{ padding: "3px 6px", fontSize: 12, borderRadius: 4, border: "1px solid var(--theme-border-input)", minWidth: 90 }}>
        {options.map(o => <option key={String(o.value)} value={o.value as string | number}>{o.label}</option>)}
      </select>
    </label>
  );
}

function ConfigNumber({ label, tip, value, onChange, enabled, onToggle, min, max, step, unit }: {
  label: string; tip?: string; value: number; onChange: (v: number) => void;
  enabled?: boolean; onToggle?: (v: boolean) => void; min?: number; max?: number; step?: number;
  unit?: string;
}) {
  const isActive = enabled !== undefined ? enabled : true;
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)", opacity: isActive ? 1 : 0.5 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}{onToggle && <input type="checkbox" checked={enabled} title={tip} onChange={e => onToggle(e.target.checked)} style={{ margin: 0, cursor: "pointer" }} />}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <input type="number" value={value} min={min} max={max} step={step ?? 0.5} disabled={!isActive} title={tip}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={{ width: 55, padding: "2px 4px", fontSize: 12, borderRadius: 4, border: "1px solid var(--theme-border-input)", backgroundColor: isActive ? "var(--theme-input-bg)" : "var(--theme-input-bg-disabled)" }} />
        {unit && <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>{unit}</span>}
      </span>
    </label>
  );
}

function ConfigColor({ label, tip, value, onChange, enabled, onToggle }: {
  label: string; tip?: string; value: string; onChange: (v: string) => void; enabled: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)", opacity: enabled ? 1 : 0.5 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {label}
        <input type="checkbox" checked={enabled} title={tip} onChange={e => onToggle(e.target.checked)} style={{ margin: 0, cursor: "pointer" }} />
      </span>
      <input type="color" value={value} disabled={!enabled} title={tip}
        onChange={e => onChange(e.target.value)}
        style={{ width: 44, height: 24, padding: 0, border: "1px solid var(--theme-border-input)", borderRadius: 4, cursor: enabled ? "pointer" : "not-allowed" }} />
    </label>
  );
}

PlateSection.displayName = "PlateSection";

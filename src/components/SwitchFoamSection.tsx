"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, Package, FileDown, FileCode2 } from "lucide-react";
import { generateSwitchFoam } from "../lib/switch-foam-export";
import type { SwitchFoamConfig } from "../lib/switch-foam-export";
import type { PlateResult, PlateRotationOverrides } from "../lib/plate-export";
import type { KLELayout } from "../lib/kle-types";
import { useI18n } from "../lib/i18n";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";
import InteractivePlatePreview from "./InteractivePlatePreview";

// ─── Section config (PlateSectionConfig 的棉片精简版) ─────

interface SwitchFoamSectionConfig extends SwitchFoamConfig {
  padEnabled: boolean;
  kerfEnabled: boolean;
  u1Enabled: boolean;
}

const DEFAULT_SWITCH_FOAM_SECTION_CONFIG: SwitchFoamSectionConfig = {
  switchType: 1, stabType: 1, u1: 19.05, kerf: 0,
  topPad: 0, leftPad: 0, rightPad: 0, bottomPad: 0,
  xGrow: 0, yGrow: 0, fillet: 1, thickness: 3,
  padEnabled: false, kerfEnabled: false, u1Enabled: false,
};

interface SwitchFoamSectionProps {
  layout: KLELayout;
  rotationOverrides: PlateRotationOverrides;
  setRotationOverrides: React.Dispatch<React.SetStateAction<PlateRotationOverrides>>;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
  onClearCanvasSelection?: () => void;
}

export default function SwitchFoamSection({
  layout, rotationOverrides, setRotationOverrides,
  onStpExportingChange, onStpProgress, onClearCanvasSelection,
}: SwitchFoamSectionProps) {
  const { t } = useI18n();
  const [config, setConfig] = useState<SwitchFoamSectionConfig>({ ...DEFAULT_SWITCH_FOAM_SECTION_CONFIG });
  const [drawn, setDrawn] = useState(false);

  const effectiveConfig = useMemo((): SwitchFoamConfig => {
    const c = config;
    return {
      switchType: c.switchType, stabType: c.stabType,
      u1: c.u1Enabled ? c.u1 : 19.05, kerf: c.kerfEnabled ? c.kerf : 0,
      topPad: c.padEnabled ? c.topPad : 0, leftPad: c.padEnabled ? c.leftPad : 0,
      rightPad: c.padEnabled ? c.rightPad : 0, bottomPad: c.padEnabled ? c.bottomPad : 0,
      xGrow: c.xGrow, yGrow: c.yGrow,
      fillet: c.fillet,
      thickness: c.thickness,
    };
  }, [config]);

  const [selectedKeyIdx, setSelectedKeyIdx] = useState<number | null>(null);

  const foamResult = useMemo((): PlateResult | null => {
    if (!drawn || layout.keys.length === 0) return null;
    return generateSwitchFoam(layout, effectiveConfig, rotationOverrides);
  }, [drawn, effectiveConfig, layout, rotationOverrides]);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 注意：旋转覆盖与定位板共享（同一 projectRotations），关闭时不清空，避免误清定位板。
  const handleDraw = useCallback(() => {
    if (layout.keys.length > 0) {
      setDrawn((d) => !d);
      setSelectedKeyIdx(null);
    }
  }, [layout.keys.length]);

  const handleStpExport = useCallback(async () => {
    if (!foamResult?.stpData) return;
    setConverting(true);
    setStpMsg(null);
    onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(foamResult.stpData, config.thickness, `${name}_switch_foam.stp`, onStpProgress);
    onStpExportingChange?.(false);
    setConverting(false);
    if (!result.success && result.message === "cancelled") return;
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [foamResult, config.thickness, layout.meta.name, onStpExportingChange, onStpProgress, t]);

  const handleSvgExport = useCallback(async () => {
    if (!foamResult?.svg) return;
    setSvgSaving(true);
    setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.svg, {
      defaultName: `${name}_switch_foam.svg`,
      mimeType: "image/svg+xml",
    });
    setSvgSaving(false);
    if (path === null) return;
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

  const handleDxfExport = useCallback(async () => {
    if (!foamResult?.dxf) return;
    setDxfSaving(true);
    setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.dxf, {
      defaultName: `${name}_switch_foam.dxf`,
      mimeType: "application/dxf",
    });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

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

  const update = <K extends keyof SwitchFoamSectionConfig>(key: K, value: SwitchFoamSectionConfig[K]) =>
    setConfig(c => ({ ...c, [key]: value }));

  const selectedFoamKeyInfo = useMemo(() => {
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
        {t("foam.editorLabel")}
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
          <ConfigNumber label={t("foam.thickness")} tip={t("tip.foamThickness")} value={config.thickness} onChange={v => update("thickness", v)} min={0.5} max={20} step={0.5} unit="mm" />
          <ConfigNumber label={t("plate.unit")} tip={t("tip.plUnit")} value={config.u1} enabled={config.u1Enabled} onToggle={v => update("u1Enabled", v)} onChange={v => update("u1", v)} min={10} max={30} />
          <ConfigNumber label={t("plate.kerf")} tip={t("tip.plKerf")} value={config.kerf} enabled={config.kerfEnabled} onToggle={v => update("kerfEnabled", v)} onChange={v => update("kerf", v)} min={0} max={2} step={0.05} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6, alignItems: "end" }}>
          <ConfigNumber label={t("plate.padTop")} tip={t("tip.plPad")} value={config.topPad} enabled={config.padEnabled} onToggle={v => update("padEnabled", v)} onChange={v => update("topPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padLeft")} tip={t("tip.plPad")} value={config.leftPad} enabled={config.padEnabled} onChange={v => update("leftPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padRight")} tip={t("tip.plPad")} value={config.rightPad} enabled={config.padEnabled} onChange={v => update("rightPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.padBottom")} tip={t("tip.plPad")} value={config.bottomPad} enabled={config.padEnabled} onChange={v => update("bottomPad", v)} min={0} max={30} />
          <ConfigNumber label={t("plate.fillet")} tip={t("tip.plFillet")} value={config.fillet} onChange={v => update("fillet", v)} min={0} max={20} step={0.1} unit="mm" />
        </div>
      </div>

      {/* ── Draw / Reset buttons ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "2px 12px 10px 12px", borderBottom: "1px solid var(--theme-border-light)" }}>
        <button onClick={handleDraw} disabled={layout.keys.length === 0}
          title={drawn ? t("tip.resetFoam") : t("tip.drawFoam")}
          className={layout.keys.length > 0 ? (drawn ? "btn-hover-draw-orange" : "btn-hover-draw-green") : ""}
          style={{
            padding: "6px 28px", fontSize: 13, fontWeight: 600,
            border: "none", borderRadius: 5,
            backgroundColor: layout.keys.length > 0
            ? (drawn ? "var(--theme-warning)" : "var(--theme-success)") : "var(--theme-border-input)",
            color: "var(--theme-text-inverse)", cursor: layout.keys.length > 0 ? "pointer" : "not-allowed",
          }}
        >
          {drawn ? t("pcb.close") : t("foam.drawing")}
        </button>
        {drawn && (
          <button onClick={handleDraw} title={t("tip.resetFoam")} className="kle-btn"
            style={{ padding: "6px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
            {t("plate.reset")}
          </button>
        )}
      </div>

      {/* ── Preview area ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {drawn && foamResult && foamResult.svg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <InteractivePlatePreview
              svg={foamResult.svg}
              regions={foamResult.regions}
              selectedKeyIdx={selectedKeyIdx}
              onSelectKey={handleSelectKey}
              onSpaceRotate={handleSpaceRotate}
              rotations={rotationOverrides}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text)", fontWeight: 500 }}>
                {t("plate.boardSize")}：{foamResult.width.toFixed(1)} × {foamResult.height.toFixed(1)} mm
                {"      "}{t("plate.keyCount")}：{keyCount}
                {"      "}{t("plate.stabCount")}：{stabCount}
                {selectedFoamKeyInfo}
              </span>
              <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-light)" }} />
              <button onClick={handleSvgExport} disabled={svgSaving} title={t("tip.expSvg")}
                className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                  border: "1px solid var(--theme-primary)",
                  backgroundColor: svgSaving ? "var(--theme-primary-soft)" : "var(--theme-primary)",
                  color: svgSaving ? "var(--theme-primary)" : "var(--theme-text-inverse)", cursor: svgSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: svgSaving ? 0.7 : 1,
                  animation: svgSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {svgSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileCode2 size={12} /> SVG</>}
              </button>
              <button onClick={handleDxfExport} disabled={dxfSaving} title={t("tip.expDxf")}
                className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                  border: "1px solid var(--theme-success)",
                  backgroundColor: dxfSaving ? "var(--theme-success-soft)" : "var(--theme-success)",
                  color: dxfSaving ? "var(--theme-success)" : "var(--theme-text-inverse)", cursor: dxfSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: dxfSaving ? 0.7 : 1,
                  animation: dxfSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {dxfSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileDown size={12} /> DXF</>}
              </button>
              {foamResult.stpData && (
                <button onClick={handleStpExport} disabled={converting} title={t("tip.expStp")}
                  className="kle-btn"
                  style={{
                    padding: "5px 14px", borderRadius: "var(--theme-radius-sm)",
                    border: "1px solid var(--theme-warning)",
                    backgroundColor: "var(--theme-warning-soft)",
                    color: "var(--theme-warning)", cursor: converting ? "wait" : "pointer",
                    fontWeight: 600, fontSize: 12, opacity: converting ? 0.7 : 1,
                    animation: converting ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                  }}>
                  {converting ? <><Loader2 size={13} className="kle-spin" /> {t("plate.converting")}</> : <><Package size={13} /> {t("plate.exportStp")}</>}
                </button>
              )}
            </div>

            {stpMsg && <StatusMsg ok={stpMsg.ok} text={stpMsg.text} />}
            {svgMsg && <StatusMsg ok={svgMsg.ok} text={svgMsg.text} />}
            {dxfMsg && <StatusMsg ok={dxfMsg.ok} text={dxfMsg.text} />}
          </div>
        ) : drawn ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)" }}>{t("foam.noData")}</div>
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>
            {t("foam.hint")}
          </div>
        )}
      </div>
    </div>
  );
}

SwitchFoamSection.displayName = "SwitchFoamSection";

// ─── Small UI helpers ──────────────────────────────────

function StatusMsg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div style={{
      padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
      backgroundColor: ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
      color: ok ? "var(--theme-success)" : "var(--theme-danger)",
      border: ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
      whiteSpace: "pre-wrap", wordBreak: "break-word",
    }}>
      {text}
    </div>
  );
}

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

"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, Package, FileDown, FileCode2 } from "lucide-react";
import { generateSwitchFoam } from "../lib/switch-foam-export";
import type { SwitchFoamConfig } from "../lib/switch-foam-export";
import type { PlateResult, PlateRotationOverrides } from "../lib/plate-export";
import type { KLELayout } from "../lib/kle-types";
import { useI18n } from "../lib/i18n";
import { useCompatMarkedIndices } from "../lib/compat-layer";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";
import type { FoamSettings } from "../lib/editor-settings";
import InteractivePlatePreview from "./InteractivePlatePreview";

interface SwitchFoamSectionProps {
  layout: KLELayout;
  /** 轴间棉设置（受控） */
  config: FoamSettings;
  setConfig: React.Dispatch<React.SetStateAction<FoamSettings>>;
  /** 旋转方向来自定位板编辑器（轴间棉依托定位板生成，不接受自定义旋转/选中） */
  rotationOverrides: PlateRotationOverrides;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
}

export default function SwitchFoamSection({
  layout, config, setConfig, rotationOverrides,
  onStpExportingChange, onStpProgress,
}: SwitchFoamSectionProps) {
  const { t } = useI18n();
  const { markedIndices: compatDimIndices } = useCompatMarkedIndices(layout.keys);
  const { fillet, holeFillet, minFeature, thickness } = config;
  const setFillet = useCallback((v: number) => setConfig((c) => ({ ...c, fillet: v })), [setConfig]);
  const setHoleFillet = useCallback((v: number) => setConfig((c) => ({ ...c, holeFillet: v })), [setConfig]);
  const setMinFeature = useCallback((v: number) => setConfig((c) => ({ ...c, minFeature: v })), [setConfig]);
  const setThickness = useCallback((v: number) => setConfig((c) => ({ ...c, thickness: v })), [setConfig]);
  const [drawn, setDrawn] = useState(false);

  const effectiveConfig = useMemo((): SwitchFoamConfig => ({
    switchType: 1, stabType: 1, u1: 19.05, kerf: 0,
    topPad: 0, leftPad: 0, rightPad: 0, bottomPad: 0, xGrow: 0, yGrow: 0,
    fillet,
    holeFillet,
    minFeature,
    thickness,
  }), [fillet, holeFillet, minFeature, thickness]);

  const foamResult = useMemo((): PlateResult | null => {
    if (!drawn || layout.keys.length === 0) return null;
    return generateSwitchFoam(layout, effectiveConfig, rotationOverrides, compatDimIndices);
  }, [drawn, effectiveConfig, layout, rotationOverrides, compatDimIndices]);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleDraw = useCallback(() => {
    if (layout.keys.length > 0) { setDrawn((d) => !d); }
  }, [layout.keys.length]);

  const handleStpExport = useCallback(async () => {
    if (!foamResult?.stpData) return;
    setConverting(true); setStpMsg(null); onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(foamResult.stpData, thickness, `${name}_switch_foam.stp`, onStpProgress);
    onStpExportingChange?.(false); setConverting(false);
    if (!result.success && result.message === "cancelled") return;
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [foamResult, thickness, layout.meta.name, onStpExportingChange, onStpProgress, t]);

  const handleSvgExport = useCallback(async () => {
    if (!foamResult?.svg) return;
    setSvgSaving(true); setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.svg, { defaultName: `${name}_switch_foam.svg`, mimeType: "image/svg+xml" });
    setSvgSaving(false);
    if (path === null) return;
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

  const handleDxfExport = useCallback(async () => {
    if (!foamResult?.dxf) return;
    setDxfSaving(true); setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.dxf, { defaultName: `${name}_switch_foam.dxf`, mimeType: "application/dxf" });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

  const numInput: React.CSSProperties = {
    width: 60, padding: "2px 4px", fontSize: 12, borderRadius: 4,
    border: "1px solid var(--theme-border-input)", backgroundColor: "var(--theme-input-bg)",
  };
  const fieldLabel: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)" };

  return (
    <div className="kle-panel" style={{
      border: "1px solid var(--theme-border)", borderRadius: "var(--theme-radius-md)",
      margin: "8px 12px", backgroundColor: "var(--theme-surface)", position: "relative", paddingTop: 6,
    }}>
      <div style={{
        position: "absolute", top: -8, left: 10, backgroundColor: "var(--theme-surface)", padding: "0 6px",
        fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: 0.5,
      }}>
        {t("foam.editorLabel")}
      </div>

      {/* ── Config bar (only Fillet + STP thickness) ── */}
      <div style={{ padding: "10px 12px 4px 12px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={fieldLabel}>
          <span>{t("fillet.holes")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={holeFillet} min={0} max={20} step={0.5} title={t("tip.filletHoles")}
              onChange={(e) => setHoleFillet(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
        <label style={fieldLabel}>
          <span>{t("foam.minFeature")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={minFeature} min={0} max={10} step={0.5} title={t("tip.foamMinFeature")}
              onChange={(e) => setMinFeature(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
        <label style={fieldLabel}>
          <span>{t("fillet.outer")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={fillet} min={0} max={20} step={0.5} title={t("tip.filletOuter")}
              onChange={(e) => setFillet(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
        <label style={fieldLabel}>
          <span>{t("bottom.thickness")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={thickness} min={0.5} max={20} step={0.5}
              onChange={(e) => setThickness(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
      </div>

      {/* ── Draw / Reset ── */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "2px 12px 10px 12px", borderBottom: "1px solid var(--theme-border-light)" }}>
        <button onClick={handleDraw} disabled={layout.keys.length === 0}
          className={layout.keys.length > 0 ? (drawn ? "btn-hover-draw-orange" : "btn-hover-draw-green") : ""}
          style={{
            padding: "6px 28px", fontSize: 13, fontWeight: 600, border: "none", borderRadius: 5,
            backgroundColor: layout.keys.length > 0 ? (drawn ? "var(--theme-warning)" : "var(--theme-success)") : "var(--theme-border-input)",
            color: "var(--theme-text-inverse)", cursor: layout.keys.length > 0 ? "pointer" : "not-allowed",
          }}>
          {drawn ? t("pcb.close") : t("foam.drawing")}
        </button>
        {drawn && (
          <button onClick={handleDraw} className="kle-btn" style={{ padding: "6px 18px", fontSize: 12, cursor: "pointer" }}>
            {t("plate.reset")}
          </button>
        )}
      </div>

      {/* ── Preview ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {drawn && foamResult && foamResult.svg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <InteractivePlatePreview
              svg={foamResult.svg}
              regions={foamResult.regions}
              selectedKeyIdx={null}
              rotations={rotationOverrides}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text)", fontWeight: 500 }}>
                {t("plate.boardSize")}：{foamResult.width.toFixed(1)} × {foamResult.height.toFixed(1)} mm
              </span>
              <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-light)" }} />
              <button onClick={handleSvgExport} disabled={svgSaving} title={t("tip.expSvg")} className="kle-btn"
                style={{ padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-primary)", backgroundColor: svgSaving ? "var(--theme-primary-soft)" : "var(--theme-primary)", color: svgSaving ? "var(--theme-primary)" : "var(--theme-text-inverse)", cursor: svgSaving ? "wait" : "pointer", fontWeight: 600, fontSize: 12, opacity: svgSaving ? 0.7 : 1, animation: svgSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none" }}>
                {svgSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileCode2 size={12} /> SVG</>}
              </button>
              <button onClick={handleDxfExport} disabled={dxfSaving} title={t("tip.expDxf")} className="kle-btn"
                style={{ padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-success)", backgroundColor: dxfSaving ? "var(--theme-success-soft)" : "var(--theme-success)", color: dxfSaving ? "var(--theme-success)" : "var(--theme-text-inverse)", cursor: dxfSaving ? "wait" : "pointer", fontWeight: 600, fontSize: 12, opacity: dxfSaving ? 0.7 : 1, animation: dxfSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none" }}>
                {dxfSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileDown size={12} /> DXF</>}
              </button>
              {foamResult.stpData && (
                <button onClick={handleStpExport} disabled={converting} title={t("tip.expStp")} className="kle-btn"
                  style={{ padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-warning)", backgroundColor: "var(--theme-warning-soft)", color: "var(--theme-warning)", cursor: converting ? "wait" : "pointer", fontWeight: 600, fontSize: 12, opacity: converting ? 0.7 : 1, animation: converting ? "stp-pulse 0.8s ease-in-out infinite" : "none" }}>
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
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>{t("foam.hint")}</div>
        )}
      </div>
    </div>
  );
}

SwitchFoamSection.displayName = "SwitchFoamSection";

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

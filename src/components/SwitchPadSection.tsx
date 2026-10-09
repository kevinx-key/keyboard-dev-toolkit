"use client";

import { useState, useMemo, useCallback } from "react";
import { Loader2, Package, FileDown, FileCode2 } from "lucide-react";
import { generateSwitchPad, DEFAULT_PAD_FILLET } from "../lib/switch-pad-export";
import type { SwitchPadConfig } from "../lib/switch-pad-export";
import type { PCBConfig, PCBSwitchRotations, PCBStabRotations } from "../lib/pcb-export";
import type { KLELayout } from "../lib/kle-types";
import { useI18n } from "../lib/i18n";
import { sanitizeSvg } from "../lib/sanitize";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";

const PAD_THICKNESS = 0.1; // 轴下垫厚度 (mm)，用于 STP 挤出

interface SwitchPadSectionProps {
  layout: KLELayout;
  pcbConfig: PCBConfig;
  switchRotations: PCBSwitchRotations;
  stabRotations: PCBStabRotations;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
}

export default function SwitchPadSection({
  layout, pcbConfig, switchRotations, stabRotations, onStpExportingChange, onStpProgress,
}: SwitchPadSectionProps) {
  const { t } = useI18n();
  const [edgeDistance, setEdgeDistance] = useState(pcbConfig.edgeDistance);

  const padResult = useMemo(() => {
    if (layout.keys.length === 0) return null;
    const cfg: SwitchPadConfig = {
      solderType: pcbConfig.solderType,
      needStab: pcbConfig.needStab,
      needLed: pcbConfig.needLed,
      edgeDistance,
      fillet: DEFAULT_PAD_FILLET,
    };
    const r = generateSwitchPad(layout, cfg, switchRotations, stabRotations);
    return r.svg ? r : null;
  }, [layout, pcbConfig.solderType, pcbConfig.needStab, pcbConfig.needLed, edgeDistance, switchRotations, stabRotations]);

  const safeSvg = useMemo(() => (padResult?.svg ? sanitizeSvg(padResult.svg) : ""), [padResult]);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleStpExport = useCallback(async () => {
    if (!padResult?.stpData) return;
    setConverting(true);
    setStpMsg(null);
    onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(padResult.stpData, PAD_THICKNESS, `${name}_switch_pad.stp`, onStpProgress);
    onStpExportingChange?.(false);
    setConverting(false);
    if (!result.success && result.message === "cancelled") return;
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [padResult, layout.meta.name, onStpExportingChange, onStpProgress, t]);

  const handleSvgExport = useCallback(async () => {
    if (!padResult?.svg) return;
    setSvgSaving(true);
    setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(padResult.svg, { defaultName: `${name}_switch_pad.svg`, mimeType: "image/svg+xml" });
    setSvgSaving(false);
    if (path === null) return;
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [padResult, layout.meta.name, t]);

  const handleDxfExport = useCallback(async () => {
    if (!padResult?.dxf) return;
    setDxfSaving(true);
    setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(padResult.dxf, { defaultName: `${name}_switch_pad.dxf`, mimeType: "application/dxf" });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [padResult, layout.meta.name, t]);

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
        {t("pad.editorLabel")}
      </div>

      {/* ── Config bar (only Edge Distance) ── */}
      <div style={{ padding: "10px 12px 4px 12px" }}>
        <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)" }}>
          <span>{t("pad.edgeDistance")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={edgeDistance} min={0} max={50} step={0.5} title={t("tip.padEdge")}
              onChange={(e) => setEdgeDistance(parseFloat(e.target.value) || 0)}
              style={{ width: 60, padding: "2px 4px", fontSize: 12, borderRadius: 4, border: "1px solid var(--theme-border-input)", backgroundColor: "var(--theme-input-bg)" }} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
      </div>

      {/* ── Preview + exports ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {padResult && safeSvg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ maxWidth: "100%", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: safeSvg }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: 12, color: "var(--theme-text)", fontWeight: 500 }}>
                {t("plate.boardSize")}：{padResult.width.toFixed(1)} × {padResult.height.toFixed(1)} mm
              </span>
              <div style={{ width: 1, height: 20, backgroundColor: "var(--theme-border-light)" }} />
              <button onClick={handleSvgExport} disabled={svgSaving} title={t("tip.expSvg")} className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-primary)",
                  backgroundColor: svgSaving ? "var(--theme-primary-soft)" : "var(--theme-primary)",
                  color: svgSaving ? "var(--theme-primary)" : "var(--theme-text-inverse)", cursor: svgSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: svgSaving ? 0.7 : 1,
                  animation: svgSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {svgSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileCode2 size={12} /> SVG</>}
              </button>
              <button onClick={handleDxfExport} disabled={dxfSaving} title={t("tip.expDxf")} className="kle-btn"
                style={{
                  padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-success)",
                  backgroundColor: dxfSaving ? "var(--theme-success-soft)" : "var(--theme-success)",
                  color: dxfSaving ? "var(--theme-success)" : "var(--theme-text-inverse)", cursor: dxfSaving ? "wait" : "pointer",
                  fontWeight: 600, fontSize: 12, opacity: dxfSaving ? 0.7 : 1,
                  animation: dxfSaving ? "stp-pulse 0.8s ease-in-out infinite" : "none",
                }}>
                {dxfSaving ? <><Loader2 size={12} className="kle-spin" /> {t("plate.converting")}</> : <><FileDown size={12} /> DXF</>}
              </button>
              {padResult.stpData && (
                <button onClick={handleStpExport} disabled={converting} title={t("tip.expStp")} className="kle-btn"
                  style={{
                    padding: "5px 14px", borderRadius: "var(--theme-radius-sm)", border: "1px solid var(--theme-warning)",
                    backgroundColor: "var(--theme-warning-soft)", color: "var(--theme-warning)", cursor: converting ? "wait" : "pointer",
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
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>
            {t("pad.hint")}
          </div>
        )}
      </div>
    </div>
  );
}

SwitchPadSection.displayName = "SwitchPadSection";

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

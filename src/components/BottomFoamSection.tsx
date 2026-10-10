"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Loader2, Package, FileDown, FileCode2, Plus, Trash2 } from "lucide-react";
import { generateBottomFoam } from "../lib/bottom-foam-export";
import type { BottomFoamConfig } from "../lib/bottom-foam-export";
import type { PCBConfig, PCBSwitchRotations, CustomRect } from "../lib/pcb-export";
import type { KLELayout } from "../lib/kle-types";
import type { BottomFoamSettings } from "../lib/editor-settings";
import { useI18n } from "../lib/i18n";
import { useCompatMarkedIndices } from "../lib/compat-layer";
import { sanitizeSvg } from "../lib/sanitize";
import { exportSTP } from "../lib/stp-export";
import type { StpProgressEvent } from "../lib/stp-export";
import { saveFile } from "../lib/platform-bridge";

const U = 19.05;

interface BottomFoamSectionProps {
  layout: KLELayout;
  pcbConfig: PCBConfig;
  switchRotations: PCBSwitchRotations;
  /** 底棉设置（受控） */
  config: BottomFoamSettings;
  setConfig: React.Dispatch<React.SetStateAction<BottomFoamSettings>>;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
}

export default function BottomFoamSection({
  layout, pcbConfig, switchRotations, config, setConfig, onStpExportingChange, onStpProgress,
}: BottomFoamSectionProps) {
  const { t } = useI18n();
  const { markedIndices: compatDimIndices } = useCompatMarkedIndices(layout.keys);
  const { thickness, holeFillet, outerFillet, minFeature, thinWall, customRects } = config;
  const setThickness = useCallback((v: number) => setConfig((c) => ({ ...c, thickness: v })), [setConfig]);
  const setHoleFillet = useCallback((v: number) => setConfig((c) => ({ ...c, holeFillet: v })), [setConfig]);
  const setOuterFillet = useCallback((v: number) => setConfig((c) => ({ ...c, outerFillet: v })), [setConfig]);
  const setMinFeature = useCallback((v: number) => setConfig((c) => ({ ...c, minFeature: v })), [setConfig]);
  const setThinWall = useCallback((v: number) => setConfig((c) => ({ ...c, thinWall: v })), [setConfig]);
  const setCustomRects = useCallback((updater: React.SetStateAction<CustomRect[]>) => {
    setConfig((c) => ({
      ...c,
      customRects: typeof updater === "function"
        ? (updater as (prev: CustomRect[]) => CustomRect[])(c.customRects)
        : updater,
    }));
  }, [setConfig]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // 新矩形默认落在键盘中心
  const defaultCenter = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
    for (const k of layout.keys) {
      if (k.d) continue; n++;
      const x = k.x, y = k.y, w = k.w || 1, h = k.h || 1;
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w; if (y + h > maxY) maxY = y + h;
    }
    if (!n) return { x: 50, y: 50 };
    return { x: (minX + maxX) / 2 * U, y: (minY + maxY) / 2 * U };
  }, [layout.keys]);

  const foamResult = useMemo(() => {
    if (layout.keys.length === 0 && customRects.length === 0) return null;
    const cfg: BottomFoamConfig = {
      solderType: pcbConfig.solderType,
      needLed: pcbConfig.needLed,
      needTypeC: pcbConfig.needTypeC, typeCX: pcbConfig.typeCX, typeCY: pcbConfig.typeCY, typeCRot: pcbConfig.typeCRot,
      need4P: pcbConfig.need4P, fourPX: pcbConfig.fourPX, fourPY: pcbConfig.fourPY, fourPRot: pcbConfig.fourPRot,
      needMCU: pcbConfig.needMCU, mcuX: pcbConfig.mcuX, mcuY: pcbConfig.mcuY, mcuRot: pcbConfig.mcuRot,
      edgeDistance: pcbConfig.edgeDistance,
      holeFillet,
      outerFillet,
      minFeature,
      thinWall,
      customRects,
    };
    const r = generateBottomFoam(layout, cfg, switchRotations, compatDimIndices);
    return r.svg ? r : null;
  }, [layout, pcbConfig, switchRotations, customRects, compatDimIndices, holeFillet, outerFillet, minFeature, thinWall]);

  const safeSvg = useMemo(() => (foamResult?.svg ? sanitizeSvg(foamResult.svg) : ""), [foamResult]);

  // ── 叠加层测量 (对齐 base SVG + 拖拽比例 mm/px) ──
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlay, setOverlay] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [mmPerPx, setMmPerPx] = useState(1);
  useEffect(() => {
    const measure = () => {
      const el = containerRef.current?.querySelector('[data-role="foam-svg"] svg');
      if (!el || !containerRef.current || !foamResult) return;
      const r = el.getBoundingClientRect();
      const p = containerRef.current.getBoundingClientRect();
      setOverlay({ left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height });
      const svgW = foamResult.width + foamResult.pad * 2;
      if (r.width > 0 && svgW > 0) setMmPerPx(svgW / r.width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [foamResult]);

  // ── 拖拽 ──
  const dragRef = useRef<{ i: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const handleRectDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedIdx(i);
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { i, x: e.clientX, y: e.clientY, cx: customRects[i]!.cx, cy: customRects[i]!.cy };
  };
  const handleRectMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const i = d.i;
    setCustomRects((rs) => rs.map((r, k) => k === i
      ? { ...r, cx: d.cx + (e.clientX - d.x) * mmPerPx, cy: d.cy + (e.clientY - d.y) * mmPerPx }
      : r));
  };
  const handleRectUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    const el = e.target as Element;
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  const addRect = useCallback(() => {
    setCustomRects((rs) => [...rs, { cx: defaultCenter.x, cy: defaultCenter.y, w: 10, h: 10, r: 1, rot: 0 }]);
    setSelectedIdx(customRects.length);
  }, [defaultCenter, customRects.length]);
  const deleteRect = useCallback((i: number) => {
    setCustomRects((rs) => rs.filter((_, k) => k !== i));
    setSelectedIdx(null);
  }, []);
  const updateRect = useCallback((patch: Partial<CustomRect>) => {
    if (selectedIdx === null) return;
    setCustomRects((rs) => rs.map((r, k) => (k === selectedIdx ? { ...r, ...patch } : r)));
  }, [selectedIdx]);

  // ── 导出 ──
  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [svgSaving, setSvgSaving] = useState(false);
  const [svgMsg, setSvgMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dxfSaving, setDxfSaving] = useState(false);
  const [dxfMsg, setDxfMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleStpExport = useCallback(async () => {
    if (!foamResult?.stpData) return;
    setConverting(true); setStpMsg(null);
    onStpExportingChange?.(true);
    const name = layout.meta.name || "keyboard";
    const result = await exportSTP(foamResult.stpData, thickness, `${name}_bottom_foam.stp`, onStpProgress);
    onStpExportingChange?.(false); setConverting(false);
    if (!result.success && result.message === "cancelled") return;
    const stpText = result.message === "DESKTOP_REQUIRED" ? t("export.requireDesktop") : result.message;
    setStpMsg({ ok: result.success, text: stpText });
  }, [foamResult, thickness, layout.meta.name, onStpExportingChange, onStpProgress, t]);

  const handleSvgExport = useCallback(async () => {
    if (!foamResult?.svg) return;
    setSvgSaving(true); setSvgMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.svg, { defaultName: `${name}_bottom_foam.svg`, mimeType: "image/svg+xml" });
    setSvgSaving(false);
    if (path === null) return;
    setSvgMsg({ ok: true, text: t("export.svgSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

  const handleDxfExport = useCallback(async () => {
    if (!foamResult?.dxf) return;
    setDxfSaving(true); setDxfMsg(null);
    const name = layout.meta.name || "keyboard";
    const path = await saveFile(foamResult.dxf, { defaultName: `${name}_bottom_foam.dxf`, mimeType: "application/dxf" });
    setDxfSaving(false);
    if (path === null) return;
    setDxfMsg({ ok: true, text: t("export.dxfSuccess").replace("{{path}}", path) });
  }, [foamResult, layout.meta.name, t]);

  const numInput: React.CSSProperties = {
    width: 58, padding: "2px 4px", fontSize: 12, borderRadius: 4,
    border: "1px solid var(--theme-border-input)", backgroundColor: "var(--theme-input-bg)",
  };
  const fieldLabel: React.CSSProperties = { display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11, color: "var(--theme-text-muted)" };
  const sel = selectedIdx !== null ? customRects[selectedIdx] : null;

  const svgW = foamResult ? foamResult.width + foamResult.pad * 2 : 0;
  const svgH = foamResult ? foamResult.height + foamResult.pad * 2 : 0;
  const vx = (x: number) => (foamResult ? x - foamResult.minX + foamResult.pad : 0);
  const vy = (y: number) => (foamResult ? y - foamResult.minY + foamResult.pad : 0);

  return (
    <div className="kle-panel" style={{
      border: "1px solid var(--theme-border)", borderRadius: "var(--theme-radius-md)",
      margin: "8px 12px", backgroundColor: "var(--theme-surface)", position: "relative", paddingTop: 6,
    }}>
      <div style={{
        position: "absolute", top: -8, left: 10, backgroundColor: "var(--theme-surface)", padding: "0 6px",
        fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: 0.5,
      }}>
        {t("bottom.editorLabel")}
      </div>

      {/* ── Config bar ── */}
      <div style={{ padding: "10px 12px 4px 12px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <span style={{ fontSize: 11, color: "var(--theme-text-muted)", paddingBottom: 4 }}>
          {t("bottom.edgeDistance")}：{pcbConfig.edgeDistance} mm　（{t("pad.followPcb")}）
        </span>
        <label style={fieldLabel}>
          <span>{t("bottom.thickness")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={thickness} min={0.1} max={20} step={0.1} title={t("tip.bottomThickness")}
              onChange={(e) => setThickness(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
        <label style={fieldLabel}>
          <span>{t("fillet.holes")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={holeFillet} min={0} max={20} step={0.5} title={t("tip.filletHoles")}
              onChange={(e) => setHoleFillet(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
        <label style={fieldLabel}>
          <span>{t("fillet.outer")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={outerFillet} min={0} max={20} step={0.5} title={t("tip.filletOuter")}
              onChange={(e) => setOuterFillet(parseFloat(e.target.value) || 0)} style={numInput} />
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
          <span>{t("foam.thinWall")}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input type="number" value={thinWall} min={0} max={5} step={0.1} title={t("tip.foamThinWall")}
              onChange={(e) => setThinWall(parseFloat(e.target.value) || 0)} style={numInput} />
            <span style={{ fontSize: 10, color: "var(--theme-text-muted)" }}>mm</span>
          </span>
        </label>
      </div>

      {/* ── Rectangle editor ── */}
      <div style={{ padding: "6px 12px", borderTop: "1px solid var(--theme-border-light)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 150 }}>
          <button onClick={addRect} className="kle-btn"
            style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", fontSize: 12, border: "1px solid var(--theme-border-input)", borderRadius: 5, background: "var(--theme-surface)", color: "var(--theme-text)", cursor: "pointer" }}>
            <Plus size={12} /> {t("bottom.addRect")}
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 110, overflowY: "auto" }}>
            {customRects.map((r, i) => (
              <div key={i} onClick={() => setSelectedIdx(i)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "2px 6px", fontSize: 11,
                  borderRadius: 4, cursor: "pointer",
                  background: i === selectedIdx ? "var(--theme-primary-soft)" : "var(--theme-surface-2)",
                  border: "1px solid " + (i === selectedIdx ? "var(--theme-primary)" : "var(--theme-border-light)"),
                }}>
                <span>#{i + 1} {r.w}×{r.h}</span>
                <Trash2 size={11} style={{ opacity: 0.6 }} onClick={(e) => { e.stopPropagation(); deleteRect(i); }} />
              </div>
            ))}
            {customRects.length === 0 && <span style={{ fontSize: 11, color: "var(--theme-text-dim)" }}>{t("bottom.noRect")}</span>}
          </div>
        </div>

        {sel && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}><span>X (mm)</span>
              <input type="number" value={+sel.cx.toFixed(2)} step={0.5} onChange={(e) => updateRect({ cx: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
            <label style={fieldLabel}><span>Y (mm)</span>
              <input type="number" value={+sel.cy.toFixed(2)} step={0.5} onChange={(e) => updateRect({ cy: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
            <label style={fieldLabel}><span>{t("bottom.rectW")}</span>
              <input type="number" value={sel.w} min={0.5} step={0.5} onChange={(e) => updateRect({ w: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
            <label style={fieldLabel}><span>{t("bottom.rectH")}</span>
              <input type="number" value={sel.h} min={0.5} step={0.5} onChange={(e) => updateRect({ h: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
            <label style={fieldLabel}><span>{t("bottom.rectR")}</span>
              <input type="number" value={sel.r} min={0} step={0.5} onChange={(e) => updateRect({ r: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
            <label style={fieldLabel}><span>{t("bottom.rectRot")}</span>
              <input type="number" value={sel.rot} step={15} onChange={(e) => updateRect({ rot: parseFloat(e.target.value) || 0 })} style={numInput} /></label>
          </div>
        )}
      </div>

      {/* ── Preview + exports ── */}
      <div className="kle-frame-holo" style={{ padding: 12, overflow: "hidden" }}>
        {foamResult && safeSvg ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div ref={containerRef} style={{ position: "relative", display: "inline-block", maxWidth: "100%", overflow: "hidden" }}>
              <div data-role="foam-svg" dangerouslySetInnerHTML={{ __html: safeSvg }} />
              {overlay && (
                <svg viewBox={`0 0 ${svgW} ${svgH}`}
                  style={{ position: "absolute", left: overlay.left, top: overlay.top, width: overlay.width, height: overlay.height, pointerEvents: "none" }}>
                  {customRects.map((r, i) => (
                    <rect key={i}
                      x={vx(r.cx) - r.w / 2} y={vy(r.cy) - r.h / 2} width={r.w} height={r.h}
                      transform={r.rot ? `rotate(${r.rot} ${vx(r.cx)} ${vy(r.cy)})` : undefined}
                      fill="transparent"
                      stroke={i === selectedIdx ? "var(--theme-primary)" : "var(--theme-warning)"}
                      strokeWidth={1.5} strokeDasharray="5,3"
                      style={{ pointerEvents: "all", cursor: "move" }}
                      onPointerDown={handleRectDown(i)}
                      onPointerMove={handleRectMove}
                      onPointerUp={handleRectUp}
                    />
                  ))}
                </svg>
              )}
            </div>
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
        ) : (
          <div style={{ padding: 30, textAlign: "center", color: "var(--theme-text-dim)", fontSize: 13 }}>
            {t("bottom.hint")}
          </div>
        )}
      </div>
    </div>
  );
}

BottomFoamSection.displayName = "BottomFoamSection";

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

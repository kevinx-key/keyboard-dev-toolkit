"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import type { PCBPreviewRegion, PCBComponentRegion } from "../lib/pcb-export";
import type { KeyProps } from "../lib/kle-types";
import type { MatrixResult } from "../lib/matrix-types";
import { U_MM } from "../lib/coordinate-system";
import { sanitizeSvg } from "../lib/sanitize";
import { useI18n } from "../lib/i18n";

// ─── Props ──────────────────────────────────────────────

interface InteractivePCBPreviewProps {
  svg: string;
  switchRegions: PCBPreviewRegion[];
  stabRegions: PCBPreviewRegion[];
  componentRegions: PCBComponentRegion[];
  selectedSwitchId: string | null;
  selectedStabId: string | null;
  selectedComponentId: string | null;
  onSelectSwitch: (id: string | null) => void;
  onSelectStab: (id: string | null) => void;
  onSelectComponent: (id: string | null) => void;
  onSpaceRotate: (id: string) => void;
  onMoveComponent: (id: string, dx: number, dy: number) => void;
  switchRotations?: Record<string, number>;
  stabRotations?: Record<string, number>;
  componentRotations?: { typeCRot?: number; fourPRot?: number; mcuRot?: number };
  /** Matrix overlay mode */
  showMatrix?: boolean;
  /** Matrix assignment result (required when showMatrix=true) */
  matrixResult?: MatrixResult;
  /** Layout keys for matrix coordinate calculation (required when showMatrix=true) */
  layoutKeys?: KeyProps[];
}

// ─── Component ──────────────────────────────────────────

export default function InteractivePCBPreview({
  svg,
  switchRegions,
  stabRegions,
  componentRegions,
  selectedSwitchId,
  selectedStabId,
  selectedComponentId,
  onSelectSwitch,
  onSelectStab,
  onSelectComponent,
  onSpaceRotate,
  onMoveComponent,
  switchRotations,
  stabRotations,
  componentRotations,
  showMatrix = false,
  matrixResult,
  layoutKeys,
}: InteractivePCBPreviewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({ display: "none" });

  // SVG 消毒 — 纵深防御
  const safeSvg = useMemo(() => sanitizeSvg(svg), [svg]);

  const viewBox = safeSvg.match(/viewBox\s*=\s*["']([^"']+)["']/)?.[1] || "0 0 100 100";

  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const svgEl = containerRef.current.querySelector('[data-role="pcb-preview-svg"] svg');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const parentRect = containerRef.current.getBoundingClientRect();
      setOverlayStyle({
        position: "absolute",
        left: rect.left - parentRect.left,
        top: rect.top - parentRect.top,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [svg]);

  // Space → rotate; Arrow keys → move component
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedComponentId !== null) {
        if (e.code === "Space") {
          e.preventDefault();
          onSpaceRotate(selectedComponentId);
          return;
        }
        const STEP = 0.5;
        let dx = 0, dy = 0;
        switch (e.code) {
          case "ArrowRight": dx = STEP; break;
          case "ArrowLeft": dx = -STEP; break;
          case "ArrowDown": dy = STEP; break;
          case "ArrowUp": dy = -STEP; break;
          default: return;
        }
        e.preventDefault();
        onMoveComponent(selectedComponentId, dx, dy);
        return;
      }

      if (e.code === "Space") {
        if (selectedStabId !== null) {
          e.preventDefault();
          onSpaceRotate(selectedStabId);
        } else if (selectedSwitchId !== null) {
          e.preventDefault();
          onSpaceRotate(selectedSwitchId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedStabId, selectedSwitchId, selectedComponentId, onSpaceRotate, onMoveComponent]);

  const isStabSelected = selectedStabId !== null;
  const isCompSelected = selectedComponentId !== null;

  const selectedRegion = selectedStabId
    ? stabRegions.find(r => r.id === selectedStabId)
    : selectedSwitchId
      ? switchRegions.find(r => r.id === selectedSwitchId)
      : selectedComponentId
        ? componentRegions.find(r => r.id === selectedComponentId)
        : null;

  const selectedLabel = selectedStabId
    ? t("pcb.stabN").replace("{{n}}", String((stabRegions.find(r => r.id === selectedStabId)?.keyIndex ?? 0) + 1))
    : selectedSwitchId
      ? t("pcb.switchN").replace("{{n}}", String((switchRegions.find(r => r.id === selectedSwitchId)?.keyIndex ?? 0) + 1))
      : selectedComponentId === "type-c" ? t("pcb.typeCConn")
        : selectedComponentId === "4p" ? t("pcb.fourPConn")
          : selectedComponentId === "mcu" ? "MCU"
            : null;

  const selectedRotation = selectedStabId
    ? (stabRotations?.[selectedStabId] || 0)
    : selectedSwitchId
      ? (switchRotations?.[selectedSwitchId] || 0)
      : 0;

  const selectedComponentRotation = selectedComponentId === "type-c"
    ? (componentRotations?.typeCRot ?? 0)
    : selectedComponentId === "4p"
      ? (componentRotations?.fourPRot ?? 0)
      : selectedComponentId === "mcu"
        ? (componentRotations?.mcuRot ?? 0)
        : 0;

  const highlightColor = isStabSelected ? "var(--theme-warning)" : isCompSelected ? "var(--theme-danger)" : "var(--theme-primary)";

  // ── Matrix overlay: 胶囊徽章尺寸（Tailwind/Flowbite pill-badge 风格）──
  const MATRIX_FONT_SIZE = 2;    // 原 9 → 6 → 再缩 2/3
  const MATRIX_CHAR_W = MATRIX_FONT_SIZE * 0.57;  // 页面 UI 字体下每字符估宽（em≈0.57）
  const MATRIX_PAD_X = MATRIX_FONT_SIZE * 0.53;
  const MATRIX_PILL_H = MATRIX_FONT_SIZE * 1.58;
  const MATRIX_BOTTOM_GAP = 1.6;   // 徽章距按键底边距离

  const matrixLabels: Array<{ key: KeyProps; cx: number; by: number; label: string }> = useMemo(() => {
    if (!showMatrix || !matrixResult || !layoutKeys) return [];
    const nonDecal = layoutKeys.filter((k: KeyProps) => !k.d);
    if (nonDecal.length === 0) return [];
    const edge = 5;
    const pad = 5;
    const minKx = Math.min(...nonDecal.map((k: KeyProps) => k.x));
    const minKy = Math.min(...nonDecal.map((k: KeyProps) => k.y));
    const boardMinX = minKx * U_MM - edge;
    const boardMinY = minKy * U_MM - edge;

    return matrixResult.assignments
      .map((a) => {
        const key = nonDecal.find((k: KeyProps) =>
          Math.abs(k.x - a.key.x) < 0.01 && Math.abs(k.y - a.key.y) < 0.01 &&
          Math.abs((k.w || 1) - a.key.w) < 0.01 && Math.abs((k.h || 1) - a.key.h) < 0.01
        );
        if (!key) return null;
        // cx = 按键水平中心；by = 按键底边 Y（徽章贴底、左右居中）
        const cx = ((key.x + (key.w || 1) / 2) * U_MM - boardMinX + pad);
        const by = ((key.y + (key.h || 1)) * U_MM - boardMinY + pad);
        return { key, cx, by, label: `R${a.row},${a.col}` };
      })
      .filter(Boolean) as Array<{ key: KeyProps; cx: number; by: number; label: string }>;
  }, [showMatrix, matrixResult, layoutKeys]);

  // Orphan detection: keys with overlapping X positions
  const orphanIdxSet: Set<number> = useMemo(() => {
    if (!matrixLabels.length || !matrixResult) return new Set();
    const orphans = new Set<number>();
    for (const a of matrixResult.assignments) {
      const sameRow = matrixResult.assignments.filter((a2) => a2.key.y === a.key.y);
      const sorted = [...sameRow].sort((a, b) => a.key.x - b.key.x);
      const idx = sorted.findIndex((s) => s.key === a.key);
      if (idx > 0) {
        const prev = sorted[idx - 1];
        if (prev && a.key.x < prev.key.x + prev.key.w - 0.01) {
          const ki = matrixResult.assignments.indexOf(a);
          if (ki >= 0) orphans.add(ki);
        }
      }
    }
    return orphans;
  }, [matrixLabels, matrixResult]);

  return (
    <div style={{ userSelect: "none" }}>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        {/* Render SVG 消毒后 */}
        <div data-role="pcb-preview-svg" dangerouslySetInnerHTML={{ __html: safeSvg }} />

        <svg viewBox={viewBox} style={overlayStyle}>
          {stabRegions.map(r => (
            <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
              fill="transparent" style={{ cursor: "pointer", pointerEvents: "all" }}
              onClick={(e) => {
                e.stopPropagation();
                // 如果点击位置落在某个 switch 区域内，选 switch 而非 stab
                const svgEl = (e.currentTarget as SVGElement).ownerSVGElement;
                if (svgEl) {
                  const pt = svgEl.createSVGPoint();
                  pt.x = e.clientX; pt.y = e.clientY;
                  const ctm = svgEl.getScreenCTM()?.inverse();
                  if (ctm) {
                    const svgPt = pt.matrixTransform(ctm);
                    const hitSwitch = switchRegions.some(sr =>
                      svgPt.x >= sr.x && svgPt.x <= sr.x + sr.w &&
                      svgPt.y >= sr.y && svgPt.y <= sr.y + sr.h
                    );
                    if (hitSwitch) {
                      const hit = switchRegions.find(sr =>
                        svgPt.x >= sr.x && svgPt.x <= sr.x + sr.w &&
                        svgPt.y >= sr.y && svgPt.y <= sr.y + sr.h
                      );
                      if (hit) {
                        onSelectStab(null);
                        onSelectComponent(null);
                        onSelectSwitch(selectedSwitchId === hit.id ? null : hit.id);
                        return;
                      }
                    }
                  }
                }
                onSelectSwitch(null);
                onSelectComponent(null);
                onSelectStab(selectedStabId === r.id ? null : r.id);
              }}
            />
          ))}
          {switchRegions.map(r => (
            <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
              fill="transparent" style={{ cursor: "pointer", pointerEvents: "all" }}
              onClick={(e) => { e.stopPropagation(); onSelectStab(null); onSelectComponent(null); onSelectSwitch(selectedSwitchId === r.id ? null : r.id); }}
            />
          ))}
          {componentRegions.map(r => (
            <rect key={r.id} x={r.x} y={r.y} width={r.w} height={r.h}
              fill="transparent" style={{ cursor: "pointer", pointerEvents: "all" }}
              onClick={(e) => { e.stopPropagation(); onSelectSwitch(null); onSelectStab(null); onSelectComponent(selectedComponentId === r.id ? null : r.id); }}
            />
          ))}

          {selectedRegion && (
            <rect x={selectedRegion.x - 2.5} y={selectedRegion.y - 2.5}
              width={selectedRegion.w + 5} height={selectedRegion.h + 5}
              fill="none" stroke={highlightColor} strokeWidth={3}
              strokeDasharray="6,4" rx={2} style={{ pointerEvents: "none" }}
            />
          )}

          {matrixLabels.map((ml, i) => {
            const isOrphan = orphanIdxSet.has(i);
            const pillW = ml.label.length * MATRIX_CHAR_W + MATRIX_PAD_X * 2;
            const pillX = ml.cx - pillW / 2;
            const pillY = ml.by - MATRIX_PILL_H - MATRIX_BOTTOM_GAP;
            return (
              <g key={`matrix-${i}`}>
                {/* 胶囊徽章：半透明深色底 + 同色系细描边（参考 Tailwind/Flowbite pill badge） */}
                <rect
                  x={pillX} y={pillY} width={pillW} height={MATRIX_PILL_H} rx={MATRIX_PILL_H / 2}
                  style={{
                    pointerEvents: "none",
                    fill: isOrphan ? "rgba(var(--theme-warning-rgb), 0.88)" : "rgba(15,23,42,0.62)",
                    stroke: isOrphan ? "rgba(var(--theme-warning-rgb), 0.45)" : "rgba(255,255,255,0.38)",
                    strokeWidth: 1,
                  }}
                />
                <text
                  x={ml.cx} y={pillY + MATRIX_PILL_H / 2 + MATRIX_FONT_SIZE * 0.35}
                  textAnchor="middle" fill="var(--theme-text-inverse)"
                  fontSize={MATRIX_FONT_SIZE}
                  fontWeight={600}
                  letterSpacing={0.2}
                  fontFamily="var(--theme-font-ui)"
                  style={{ pointerEvents: "none" }}
                >
                  {ml.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selectedLabel && (
        <div style={{
          marginTop: 6, fontSize: 12, color: highlightColor, fontWeight: 500,
          textAlign: "center", padding: "4px 10px",
          backgroundColor: isCompSelected ? "rgba(var(--theme-danger-rgb), 0.08)"
            : isStabSelected ? "rgba(var(--theme-warning-rgb), 0.10)"
            : "rgba(var(--theme-primary-rgb), 0.08)",
          borderRadius: "var(--theme-radius-sm)",
          border: isCompSelected ? "1px solid rgba(var(--theme-danger-rgb), 0.35)"
            : isStabSelected ? "1px solid rgba(var(--theme-warning-rgb), 0.40)"
            : "1px solid rgba(var(--theme-primary-rgb), 0.35)",
        }}>
          <Crosshair size={13} style={{ flexShrink: 0, opacity: 0.8 }} /> {t("pcb.selectedInfo").replace("{{label}}", selectedLabel)}
          {isCompSelected
            ? t("pcb.rotCompHint").replace("{{deg}}", String(selectedComponentRotation))
            : t("pcb.rotKeyHint").replace("{{deg}}", String(selectedRotation))}
        </div>
      )}
    </div>
  );
}
InteractivePCBPreview.displayName = "InteractivePCBPreview";

"use client";

import { useEffect, useRef, useMemo, useState } from "react";
import { Crosshair } from "lucide-react";
import type { PreviewRegion } from "../lib/plate-export";
import { sanitizeSvg } from "../lib/sanitize";
import { useI18n } from "../lib/i18n";

// ─── Props ──────────────────────────────────────────────

interface InteractivePlatePreviewProps {
  svg: string;
  regions: PreviewRegion[];
  selectedKeyIdx: number | null;
  onSelectKey: (idx: number | null) => void;
  onSpaceRotate: (idx: number) => void;
  rotations?: Record<number, number>;
}

// ─── Component ──────────────────────────────────────────

export default function InteractivePlatePreview({
  svg,
  regions,
  selectedKeyIdx,
  onSelectKey,
  onSpaceRotate,
  rotations,
}: InteractivePlatePreviewProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({ display: "none" });

  // SVG 消毒 — 纵深防御，strip 脚本/事件/javascript: URL
  const safeSvg = useMemo(() => sanitizeSvg(svg), [svg]);

  // Parse viewBox from SVG string for overlay SVG
  const viewBox = safeSvg.match(/viewBox\s*=\s*["']([^"']+)["']/)?.[1] || "0 0 100 100";

  // Measure rendered base SVG for overlay alignment
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const svgEl = containerRef.current.querySelector('[data-role="plate-preview-svg"] svg');
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

  // Space key → rotate selected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && selectedKeyIdx !== null) {
        e.preventDefault();
        onSpaceRotate(selectedKeyIdx);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedKeyIdx, onSpaceRotate]);

  const selectedRegion = selectedKeyIdx !== null
    ? regions.find(r => r.keyIndex === selectedKeyIdx)
    : null;

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
        <div data-role="plate-preview-svg" dangerouslySetInnerHTML={{ __html: safeSvg }} />

        {/* Overlay SVG — positioned exactly over the rendered base SVG */}
        <svg viewBox={viewBox} style={overlayStyle}>
          {regions.map(r => (
            <rect
              key={r.id}
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill="transparent"
              style={{ cursor: "pointer", pointerEvents: "all" }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectKey(selectedKeyIdx === r.keyIndex ? null : r.keyIndex);
              }}
            />
          ))}

          {selectedKeyIdx !== null && selectedRegion && (
            <g
              transform={`rotate(${rotations?.[selectedKeyIdx] || 0}, ${selectedRegion.centerX}, ${selectedRegion.centerY})`}
              style={{ pointerEvents: "none" }}
            >
              <rect
                x={selectedRegion.baseX - 2} y={selectedRegion.baseY - 2}
                width={selectedRegion.baseW + 4} height={selectedRegion.baseH + 4}
                fill="none" stroke="var(--theme-primary)" strokeWidth={2.5}
                strokeDasharray="6,4" rx={2}
              />
            </g>
          )}
        </svg>
      </div>

      {selectedKeyIdx !== null && selectedRegion && (
        <div style={{
          marginTop: 6, fontSize: 12, color: "var(--theme-primary)", fontWeight: 500,
          textAlign: "center", padding: "4px 10px",
          backgroundColor: "rgba(var(--theme-primary-rgb), 0.08)", borderRadius: "var(--theme-radius-sm)",
          border: "1px solid rgba(var(--theme-primary-rgb), 0.35)",
        }}>
          <Crosshair size={13} style={{ flexShrink: 0, opacity: 0.8 }} /> {t("plate.selKeyN").replace("{{n}}", String(selectedKeyIdx + 1))}
          {" · "}{t("plate.curRot")}: {rotations?.[selectedKeyIdx] || 0}°
          {" · "}{t("plate.pressSpacePre")} <kbd className="kle-kbd" style={{
            padding: "1px 5px", borderRadius: 3,
            fontSize: 11,
          }}>Space</kbd> {t("plate.pressSpacePost")}
        </div>
      )}
    </div>
  );
}
InteractivePlatePreview.displayName = "InteractivePlatePreview";

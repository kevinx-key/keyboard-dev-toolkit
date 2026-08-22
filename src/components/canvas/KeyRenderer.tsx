"use client";

import { Fragment } from "react";
import type { KeyProps } from "../../lib/kle-types";
import { KEY_UNIT, KEY_GAP } from "../../lib";
import { KEY_TOP_LEFT, KEY_TOP_TOP, KEY_RX, STEPPED_NOTCH_RATIO, getKeyStrokeColor, getKeyFaceColor } from "../../lib/key-renderer";
import { computeLShapeSvgPath } from "../../lib/lshape-path";
import { rotatedBbox } from "../../lib/geometry-utils";
import LabelRenderer from "./LabelRenderer";

interface KeyRendererProps {
  keyData: KeyProps;
  index: number;
  isSelected: boolean;
  preview?: boolean;
  readOnly?: boolean;
  keycapTopEffect?: string;
  matchesFilter: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Render a single key — body, face, effects, labels, selection indicator.
 * All dimension computations are derived from the key properties.
 */
export default function KeyRenderer({
  keyData,
  index,
  isSelected,
  preview = false,
  readOnly,
  keycapTopEffect,
  matchesFilter,
  onContextMenu,
}: KeyRendererProps) {
  // ── Dimension extraction ──
  const x2 = keyData.x2 || 0;
  const y2 = keyData.y2 || 0;
  const w2 = keyData.w2 || 0;
  const h2 = keyData.h2 || 0;
  const hasExt = (w2 > 0 || h2 > 0) && (x2 !== 0 || y2 !== 0);
  const useW2 = !!keyData.l && w2 > keyData.w && !x2 && !y2 && !h2;

  const effW = useW2 ? w2 : keyData.w;
  const effH = keyData.h;
  const effX2 = hasExt ? x2 : 0;
  const effY2 = hasExt ? y2 : 0;
  const effW2 = hasExt ? w2 : 0;
  const effH2 = hasExt ? h2 : 0;

  const minX = hasExt ? Math.min(0, effX2) : 0;
  const minY = hasExt ? Math.min(0, effY2) : 0;
  const maxX = hasExt ? Math.max(effW, effX2 + effW2) : effW;
  const maxY = hasExt ? Math.max(effH, effY2 + effH2) : effH;

  let bboxL = (keyData.x + minX) * KEY_UNIT + KEY_GAP;
  let bboxT = (keyData.y + minY) * KEY_UNIT + KEY_GAP;
  let bboxW = (maxX - minX) * KEY_UNIT - KEY_GAP * 2;
  let bboxH = (maxY - minY) * KEY_UNIT - KEY_GAP * 2;

  // ── Rotated key bbox ──
  const hasRotation = !!keyData.r;
  if (hasRotation) {
    const rotCX =
      keyData.rx !== 0
        ? keyData.rx * KEY_UNIT
        : (keyData.x + keyData.w / 2) * KEY_UNIT;
    const rotCY =
      keyData.ry !== 0
        ? keyData.ry * KEY_UNIT
        : (keyData.y + keyData.h / 2) * KEY_UNIT;
    const rb = rotatedBbox(
      (keyData.x + minX) * KEY_UNIT,
      (keyData.y + minY) * KEY_UNIT,
      (maxX - minX) * KEY_UNIT,
      (maxY - minY) * KEY_UNIT,
      rotCX,
      rotCY,
      keyData.r,
    );
    bboxL = rb.x + KEY_GAP;
    bboxT = rb.y + KEY_GAP;
    bboxW = rb.w - KEY_GAP * 2;
    bboxH = rb.h - KEY_GAP * 2;
  }

  // ── Body positioning within wrapper ──
  const kbLeft = (0 - minX) * KEY_UNIT;
  const kbTop = (0 - minY) * KEY_UNIT;
  const kbWidth = effW * KEY_UNIT - KEY_GAP * 2;
  const kbHeight = effH * KEY_UNIT - KEY_GAP * 2;
  const bodyOffX = (keyData.x + minX) * KEY_UNIT + KEY_GAP - bboxL;
  const bodyOffY = (keyData.y + minY) * KEY_UNIT + KEY_GAP - bboxT;
  const extLeft = hasExt ? (effX2 - minX) * KEY_UNIT : 0;
  const extTop = hasExt ? (effY2 - minY) * KEY_UNIT : 0;
  const extWidth = hasExt ? effW2 * KEY_UNIT - KEY_GAP * 2 : 0;
  const extHeight = hasExt ? effH2 * KEY_UNIT - KEY_GAP * 2 : 0;

  // ── Visual state flags ──
  const isDecal = !!keyData.d;
  const isGhosted = keyData.g;
  const isDSA = !!(keyData.p && keyData.p.includes("DSA"));
  const isLinearEffect = keycapTopEffect === "linear";
  const hasTopEffect = isDSA || !!keycapTopEffect;
  const gradColor = isDSA ? "rgb(72, 53, 39)" : "rgba(0,0,0,0.35)";

  // ── Face dimensions ──
  const stepped = !!keyData.l;
  const KTOP_TOP = isDSA ? 4 : KEY_TOP_TOP;

  // For rotated L‑shaped keys, bodyOffX/bodyOffY are non‑zero (rotated bbox shift)
  // but the SVG body is drawn at (kbLeft,kbTop) WITHOUT bodyOffX compensation.
  // The face must therefore also use kbLeft/kbTop directly, not bodyOffX+kbLeft.
  const faceOrigX = hasExt ? kbLeft : bodyOffX + kbLeft;
  const faceOrigY = hasExt ? kbTop : bodyOffY + kbTop;

  const faceLeft = faceOrigX + KEY_TOP_LEFT;
  const faceTop = faceOrigY + KTOP_TOP;
  const faceWidth = stepped
    ? useW2
      ? keyData.w * KEY_UNIT - KEY_GAP * 2 - KEY_TOP_LEFT * 2
      : kbWidth - KEY_TOP_LEFT * 2 - kbWidth * STEPPED_NOTCH_RATIO
    : kbWidth - KEY_TOP_LEFT * 2;
  const faceHeight = kbHeight - 12;
  const ktopRadius = isDSA ? 8 : 3;
  // Issue 2: Default keycap color #cccccc → top face should be white, not lightened gray
  const lightBg = keyData.c && keyData.c !== "#cccccc" ? getKeyFaceColor(keyData.c) : "#ffffff";

  // ── L-shaped SVG path ──
  const lShapePath = hasExt
    ? computeLShapeSvgPath(
        kbLeft, kbTop, kbWidth, kbHeight,
        extLeft, extTop, extWidth, extHeight,
        bboxW, bboxH, KEY_RX,
      )
    : "";

  // ── Wrapper style (position, rotation, clip-path) ──
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: bboxL,
    top: bboxT,
    width: bboxW,
    height: bboxH,
    cursor: readOnly || preview ? "default" : "pointer",
    zIndex: isSelected ? 5 : 1,
    opacity: isDecal
      ? 0.6
      : isGhosted
        ? 0.4
        : matchesFilter
          ? 1
          : 0.3,
    ...(hasExt ? { clipPath: `path("${lShapePath}")` } : {}),
    // L 形拼接缝补偿：GPU 合成 + 微扩展防止 0.5px 抗锯齿缝隙
    // L 形拼接缝补偿（仅非旋转键）：translateZ 激活 GPU 合成消除 0.5px 抗锯齿缝隙
    ...(hasExt && !keyData.r ? { transform: "translateZ(0)" } : {}),
    ...(hasExt ? { WebkitBackfaceVisibility: "hidden" as const } : {}),
    overflow: hasRotation ? "visible" : undefined,
    pointerEvents: "auto",
  };
  const originX = keyData.r ? (
    (keyData.rx !== 0 || keyData.ry !== 0)
      ? keyData.rx * KEY_UNIT - bboxL
      : (keyData.x + minX + (maxX - minX) / 2) * KEY_UNIT - bboxL
  ) : 0;
  const originY = keyData.r ? (
    (keyData.rx !== 0 || keyData.ry !== 0)
      ? keyData.ry * KEY_UNIT - bboxT
      : (keyData.y + minY + (maxY - minY) / 2) * KEY_UNIT - bboxT
  ) : 0;
  // SVG overlay is at (bboxL-3, bboxT-3), so origin is offset by +3
  const originX_svg = originX + 3;
  const originY_svg = originY + 3;
  if (keyData.r) {
    wrapperStyle.transform = `rotate(${keyData.r}deg)`;
    wrapperStyle.transformOrigin = `${originX}px ${originY}px`;
  }

  return (
    <Fragment>
      {/* L-shaped key: selected SVG outline overlay */}
      {isSelected && !preview && hasExt && (
        <svg
          style={{
            position: "absolute",
            left: bboxL - 3,
            top: bboxT - 3,
            width: bboxW + 6,
            height: bboxH + 6,
            zIndex: 10,
            pointerEvents: "none",
            // SVG overlay is a sibling of the wrapper — must rotate independently
            ...(hasRotation && keyData.r ? {
              transform: `rotate(${keyData.r}deg)`,
              transformOrigin: `${originX_svg}px ${originY_svg}px`,
            } : {}),
          }}
          viewBox={`${-3} ${-3} ${bboxW + 6} ${bboxH + 6}`}
        >
          <path
            d={lShapePath}
            fill="none"
            stroke="var(--theme-primary)"
            strokeWidth={3}
          />
        </svg>
      )}

      {/* Key wrapper */}
      <div
        data-key-index={index}
        onContextMenu={onContextMenu}
        style={wrapperStyle}
      >
        {!isDecal ? (
          <>
            {hasExt && !stepped ? (
              // ── L-shaped non-stepped key (e.g., ISO Enter) ──
              <>
                <svg
                  style={{
                    position: "absolute", left: 0, top: 0,
                    width: bboxW, height: bboxH,
                    zIndex: 1, pointerEvents: "none", overflow: "visible",
                  }}
                >
                  <path
                    d={lShapePath}
                    fill={keyData.c || "#cccccc"}
                    stroke={getKeyStrokeColor(keyData.c || "#cccccc")}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </svg>
                {/* Main face */}
                <div
                  style={{
                    position: "absolute",
                    left: faceOrigX + KEY_TOP_LEFT,
                    top: faceOrigY + KTOP_TOP,
                    width: kbWidth - KEY_TOP_LEFT * 2,
                    height: kbHeight - 12,
                    backgroundColor: lightBg,
                    borderRadius: ktopRadius,
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                />
                {/* Extension face */}
                <div
                  style={{
                    position: "absolute",
                    left: extLeft + KEY_TOP_LEFT,
                    top: extTop + KTOP_TOP,
                    width: Math.max(0, extWidth - KEY_TOP_LEFT * 2),
                    height: Math.max(0, extHeight - KEY_TOP_LEFT * 2),
                    backgroundColor: lightBg,
                    borderRadius: ktopRadius,
                    zIndex: 3,
                    pointerEvents: "none",
                  }}
                />
              </>
            ) : hasExt && stepped ? (
              // ── L-shaped stepped key (e.g., stepped Caps Lock with extension) ──
              <>
                <svg
                  style={{
                    position: "absolute", left: 0, top: 0,
                    width: bboxW, height: bboxH,
                    zIndex: 1, pointerEvents: "none", overflow: "visible",
                  }}
                >
                  <path
                    d={lShapePath}
                    fill={keyData.c || "#cccccc"}
                    stroke={getKeyStrokeColor(keyData.c || "#cccccc")}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                </svg>
                {/* Stepped main face */}
                <div
                  style={{
                    position: "absolute",
                    left: faceOrigX + KEY_TOP_LEFT,
                    top: faceOrigY + KTOP_TOP,
                    width: kbWidth - KEY_TOP_LEFT * 2,
                    height: kbHeight - 12,
                    backgroundColor: lightBg,
                    borderRadius: ktopRadius,
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                />
              </>
            ) : (
              // ── Standard rectangular key ──
              <>
                {/* Body */}
                <div
                  style={{
                    position: "absolute",
                    left: bodyOffX,
                    top: bodyOffY,
                    width: kbWidth,
                    height: kbHeight,
                    backgroundColor: keyData.c || "#cccccc",
                    borderRadius: KEY_RX,
                    border: `1px solid ${getKeyStrokeColor(keyData.c || "#cccccc")}`,
                    boxSizing: "border-box",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                    pointerEvents: "none",
                  }}
                />
                {/* Face with optional top effect (DSA gradient, linear, radial) */}
                <div
                  style={{
                    position: "absolute",
                    left: faceLeft,
                    top: faceTop,
                    width: faceWidth,
                    height: faceHeight,
                    backgroundColor: lightBg,
                    backgroundImage: hasTopEffect
                      ? isLinearEffect
                        ? `linear-gradient(90deg, ${gradColor} 0%, transparent 30%, transparent 70%, ${gradColor} 100%)`
                        : keyData.n
                          ? `radial-gradient(${gradColor} 50%, transparent 60%)`
                          : `radial-gradient(${gradColor} 30%, transparent 90%)`
                      : undefined,
                    opacity: hasTopEffect ? 0.2 : undefined,
                    borderRadius: ktopRadius,
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                />
                {/* Face border */}
                <div
                  style={{
                    position: "absolute",
                    left: faceLeft,
                    top: faceTop,
                    width: faceWidth,
                    height: faceHeight,
                    border: "1px solid rgba(0,0,0,0.2)",
                    boxSizing: "border-box",
                    borderRadius: ktopRadius,
                    zIndex: 2,
                    pointerEvents: "none",
                  }}
                />
              </>
            )}
            {/* Homing bump */}
            {keyData.n && (
              <div
                style={{
                  position: "absolute",
                  bottom: 4,
                  left: bodyOffX + kbWidth / 2,
                  transform: "translateX(-50%)",
                  width: 8,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: "rgba(0,0,0,0.4)",
                  zIndex: 4,
                  pointerEvents: "none",
                }}
              />
            )}
          </>
        ) : null}

        {/* ── Labels ── */}
        <LabelRenderer
          labels={keyData.labels}
          isDecal={isDecal}
          faceLeft={faceLeft}
          faceTop={faceTop}
          faceWidth={faceWidth}
          faceHeight={faceHeight}
          bboxW={bboxW}
          bboxH={bboxH}
          keyData={keyData}
        />

        {/* ── Selected indicator (for non-L-shaped keys) ── */}
        {isSelected && !preview && !hasExt && (
          hasRotation ? (
            <div
              style={{
                position: "absolute",
                left: bodyOffX - 1,
                top: bodyOffY - 1,
                width: kbWidth + 2,
                height: kbHeight + 2,
                borderRadius: 6,
                border: "2px solid var(--theme-primary)",
                boxShadow: "0 0 0 2px rgba(51,122,183,0.3)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                left: -1,
                top: -1,
                width: "calc(100% + 2px)",
                height: "calc(100% + 2px)",
                borderRadius: 6,
                border: "2px solid var(--theme-primary)",
                boxShadow: "0 0 0 2px rgba(51,122,183,0.3)",
                zIndex: 10,
                pointerEvents: "none",
              }}
            />
          )
        )}
      </div>
    </Fragment>
  );
}
KeyRenderer.displayName = "KeyRenderer";

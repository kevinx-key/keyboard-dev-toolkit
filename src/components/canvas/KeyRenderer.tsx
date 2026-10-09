"use client";

import { Fragment, useId } from "react";
import type { KeyProps, DecalConfig } from "../../lib/kle-types";
import { KEY_UNIT, KEY_GAP } from "../../lib";
import { KEY_TOP_LEFT, KEY_TOP_TOP, KEY_RX, STEPPED_NOTCH_RATIO, getKeyStrokeColor, getKeyFaceColor } from "../../lib/key-renderer";
import { computeLShapeSvgPath } from "../../lib/lshape-path";
import { rotatedBbox } from "../../lib/geometry-utils";
import { lighten, mixColor } from "../../lib/color-utils";
import { isValidHexColor } from "../../lib/sanitize";
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
  /** Global image decal (base64). Rendered as per-key background, clipped to the keycap. */
  decal?: DecalConfig | null;
  /** 兼容层：键帽覆盖色（null = 不上色） */
  compatColor?: string | null;
  /** 兼容层：覆盖色不透明度（0..1） */
  compatOpacity?: number;
  /** 兼容层：参照键（命中穿透，不拦截指针事件） */
  compatSkipped?: boolean;
  /** 兼容层：叠放 z 值（置顶/中性/垫底） */
  compatZ?: number;
}

/** Build a linear-gradient CSS string for a two-color key. */
function keyGradient(angle: number, from: string, to: string): string {
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
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
  decal,
  compatColor = null,
  compatOpacity = 1,
  compatSkipped = false,
  compatZ = 1,
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
  const rawFace = keyData.c && keyData.c !== "#cccccc" ? getKeyFaceColor(keyData.c) : "#ffffff";
  const rawBase = keyData.c || "#cccccc";

  // ── 兼容层：把标记色混入键帽底色/顶面（保留立体顶面与图例，不覆盖整键） ──
  const compatFace = compatColor ? mixColor(compatColor, "rgb(255,255,255)", 0.5) : null;
  const baseC = compatColor ? mixColor(rawBase, compatColor, compatOpacity) : rawBase;
  const lightBg = compatColor && compatFace ? mixColor(rawFace, compatFace, compatOpacity) : rawFace;

  // ── Two-color gradient (per key；兼容着色时用纯色，避免渐变干扰) ──
  const hasGradient = !compatColor && !!(keyData.c2 && isValidHexColor(keyData.c2));
  const gradAngle = typeof keyData.cang === "number" ? keyData.cang : 135;
  const bodyGradient = hasGradient ? keyGradient(gradAngle, baseC, keyData.c2!) : undefined;
  const faceGradient = hasGradient
    ? keyGradient(gradAngle, lighten(baseC, 18), lighten(keyData.c2!, 18))
    : undefined;

  // ── Image decal: per-key background sampling (content-space coordinates) ──
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bodyImgX = keyData.x * KEY_UNIT + KEY_GAP;
  const bodyImgY = keyData.y * KEY_UNIT + KEY_GAP;
  const faceImgX = bodyImgX + KEY_TOP_LEFT;
  const faceImgY = bodyImgY + KTOP_TOP;
  const decalSize = decal ? `${(decal.natW || 512) * decal.scale}px ${(decal.natH || 512) * decal.scale}px` : "";
  const decalOpacity = decal && decal.opacity < 1 ? decal.opacity : undefined;
  const bodyDecalStyle: React.CSSProperties = decal ? {
    backgroundImage: `linear-gradient(rgba(0,0,0,${decal.dim}), rgba(0,0,0,${decal.dim})), url(${decal.image})`,
    backgroundSize: `100% 100%, ${decalSize}`,
    backgroundPosition: `0 0, ${decal.x - bodyImgX}px ${decal.y - bodyImgY}px`,
    backgroundRepeat: "no-repeat, no-repeat",
    opacity: decalOpacity,
  } : {};
  const faceDecalStyle: React.CSSProperties = decal ? {
    backgroundImage: `url(${decal.image})`,
    backgroundSize: decalSize,
    backgroundPosition: `${decal.x - faceImgX}px ${decal.y - faceImgY}px`,
    backgroundRepeat: "no-repeat",
    opacity: decalOpacity,
  } : {};

  // ── L-shaped SVG path ──
  const lShapePath = hasExt
    ? computeLShapeSvgPath(
        kbLeft, kbTop, kbWidth, kbHeight,
        extLeft, extTop, extWidth, extHeight,
        bboxW, bboxH, KEY_RX,
      )
    : "";

  // ── L-shape fill + defs (gradient / decal pattern) ──
  const gradVec = (a: number) => {
    const rad = (a * Math.PI) / 180;
    const vx = Math.sin(rad), vy = -Math.cos(rad);
    return { x1: 0.5 - vx / 2, y1: 0.5 - vy / 2, x2: 0.5 + vx / 2, y2: 0.5 + vy / 2 };
  };
  const lShapeFill = decal
    ? `url(#kkdecal-${uid})`
    : hasGradient
      ? `url(#kkgrad-${uid})`
      : baseC;
  const lShapeDefs = (
    <defs>
      {hasGradient && (
        <linearGradient id={`kkgrad-${uid}`} {...gradVec(gradAngle)}>
          <stop offset="0%" stopColor={baseC} />
          <stop offset="100%" stopColor={keyData.c2!} />
        </linearGradient>
      )}
      {decal && (
        <pattern
          id={`kkdecal-${uid}`}
          patternUnits="userSpaceOnUse"
          x={decal.x - bboxL}
          y={decal.y - bboxT}
          width={(decal.natW || 512) * decal.scale}
          height={(decal.natH || 512) * decal.scale}
        >
          <image
            href={decal.image}
            x={decal.x - bboxL}
            y={decal.y - bboxT}
            width={(decal.natW || 512) * decal.scale}
            height={(decal.natH || 512) * decal.scale}
            preserveAspectRatio="none"
            opacity={decal.opacity}
          />
        </pattern>
      )}
    </defs>
  );

  // ── Wrapper style (position, rotation, clip-path) ──
  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: bboxL,
    top: bboxT,
    width: bboxW,
    height: bboxH,
    cursor: readOnly || preview ? "default" : "pointer",
    zIndex: isSelected ? 5 : compatZ,
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
    // 兼容层参照键不拦截指针事件（右键/悬停落到下层重叠键）
    pointerEvents: compatSkipped ? "none" : "auto",
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
                  {lShapeDefs}
                  <path
                    d={lShapePath}
                    fill={lShapeFill}
                    stroke={getKeyStrokeColor(baseC)}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  {decal && <path d={lShapePath} fill={`rgba(0,0,0,${decal.dim})`} opacity={decal.opacity} />}
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
                    ...(decal ? faceDecalStyle : hasGradient ? { backgroundImage: faceGradient } : {}),
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
                    ...(decal ? faceDecalStyle : hasGradient ? { backgroundImage: faceGradient } : {}),
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
                  {lShapeDefs}
                  <path
                    d={lShapePath}
                    fill={lShapeFill}
                    stroke={getKeyStrokeColor(baseC)}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  {decal && <path d={lShapePath} fill={`rgba(0,0,0,${decal.dim})`} opacity={decal.opacity} />}
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
                    ...(decal ? faceDecalStyle : hasGradient ? { backgroundImage: faceGradient } : {}),
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
                    backgroundColor: baseC,
                    ...(decal ? bodyDecalStyle : hasGradient ? { backgroundImage: bodyGradient } : {}),
                    borderRadius: KEY_RX,
                    border: `1px solid ${getKeyStrokeColor(baseC)}`,
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
                    ...(decal
                      ? faceDecalStyle
                      : hasGradient
                        ? { backgroundImage: faceGradient }
                        : hasTopEffect
                          ? {
                              backgroundImage: isLinearEffect
                                ? `linear-gradient(90deg, ${gradColor} 0%, transparent 30%, transparent 70%, ${gradColor} 100%)`
                                : keyData.n
                                  ? `radial-gradient(${gradColor} 50%, transparent 60%)`
                                  : `radial-gradient(${gradColor} 30%, transparent 90%)`,
                              opacity: 0.2,
                            }
                          : {}),
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

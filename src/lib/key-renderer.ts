/**
 * Unified Key Renderer
 *
 * Single source of truth for rendering keyboard keys as SVG.
 * Used by both:
 *   1. kle-export.ts (exportSVG — SVG string generation)
 *   2. KeyboardCanvas.tsx (interactive canvas rendering via dangerouslySetInnerHTML)
 *
 * Design principle: one rendering path, consistent visual output.
 */

import type { KeyProps } from "./kle-types";
import { KEY_UNIT, KEY_GAP } from "./kle-parser";
import { parseLabelColor } from "./kle-types";
import { isValidHexColor } from "./sanitize";
import { computeLShapeSvgPath } from "./lshape-path";
import { lighten, darken } from "./color-utils";

// ═══════════════════════════════════════════════════════════
// ── Shared Constants ──
// ═══════════════════════════════════════════════════════════

/** Keycap body border-radius in px */
export const KEY_RX = 5;

/** Keycap top face left inset in px */
export const KEY_TOP_LEFT = 7;

/** Keycap top face top inset in px */
export const KEY_TOP_TOP = 4;

/** Keycap top face border-radius in px */
export const KEY_TOP_RADIUS = 4;

/** Maximum ratio of keycap height used for the highlight gradient strip */
export const KEY_HIGHLIGHT_MAX_RATIO = 0.4;

/** Maximum px of the highlight gradient strip */
export const KEY_HIGHLIGHT_MAX_PX = 12;

/** Stepped (Caps Lock) notch width as ratio of total body width */
export const STEPPED_NOTCH_RATIO = 0.28;

/** Grid line color for export SVG */
export const GRID_COLOR = "#e8e8e8";

/** Grid line stroke-width for export SVG */
export const GRID_LINE_WIDTH = 0.5;

// ═══════════════════════════════════════════════════════════
// ── Shared Color Computation ──
// ═══════════════════════════════════════════════════════════

/** Compute the key body stroke color from the base color. */
export function getKeyStrokeColor(c: string): string {
  return darken(c, 25);
}

/** Compute the key face (top) lightened color from the base color. */
export function getKeyFaceColor(c: string): string {
  return lighten(c, 18);
}

/** Compute the CSS linear-gradient for key body. */
export function getKeyBodyGradient(c: string): string {
  return `linear-gradient(180deg, ${lighten(c, 18)} 0%, ${c} 25%, ${darken(c, 12)} 80%, ${darken(c, 22)} 100%)`;
}

/** Compute the stepped notch overlay color. */
export function getSteppedNotchColor(c: string): string {
  return darken(c, 10);
}

/** Compute the stepped notch width in pixels from the body width. */
export function getSteppedNotchWidth(pw: number): number {
  return pw * STEPPED_NOTCH_RATIO;
}

// ═══════════════════════════════════════════════════════════
// ── LABEL_STYLES (CSS-compatible, shared with LabelRenderer) ──
// ═══════════════════════════════════════════════════════════

/**
 * CSS style objects for all 12 KLE label positions.
 *
 * KLE position map:
 *   0=top-left,     1=top-center,    2=top-right,
 *   3=center-left,  4=center-center, 5=center-right,
 *   6=bottom-left,  7=bottom-center, 8=bottom-right,
 *   9=front-center, 10=front-left,   11=front-right
 */
export const LABEL_STYLES_CSS: readonly {
  top?: number | string;
  left?: number | string;
  right?: number | string;
  bottom?: number | string;
  transform?: string;
  textAlign?: "left" | "center" | "right";
  lineHeight?: number;
  whiteSpace?: "nowrap";
}[] = [
  { top: 1, left: 2, textAlign: "left" },
  { top: 1, left: "50%", transform: "translateX(-50%)", textAlign: "center" },
  { top: 1, right: 2, textAlign: "right" },
  { top: "50%", left: 2, transform: "translateY(-50%)", textAlign: "left" },
  { top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" },
  { top: "50%", right: 2, transform: "translateY(-50%)", textAlign: "right" },
  { bottom: 1, left: 2, textAlign: "left" },
  { bottom: 1, left: "50%", transform: "translateX(-50%)", textAlign: "center" },
  { bottom: 1, right: 2, textAlign: "right" },
  { bottom: -4, left: "50%", transform: "translateX(-50%)", textAlign: "center", lineHeight: 1, whiteSpace: "nowrap" },
  { bottom: -4, left: 2, textAlign: "left", lineHeight: 1, whiteSpace: "nowrap" },
  { bottom: -4, right: 2, textAlign: "right", lineHeight: 1, whiteSpace: "nowrap" },
];

/** Escape XML special characters (for safe SVG text content). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Get the primary readable label for a key (favors center → top-center → top-left → bottom-center). */
export function getLabelText(labels: string[]): string {
  return labels[4] || labels[1] || labels[0] || labels[7] || "";
}

// ═══════════════════════════════════════════════════════════
// ── SVG Defs Builder ──
// ═══════════════════════════════════════════════════════════

/** Build SVG <defs> section — creates linear gradients for all unique key colors. */
export function buildDefs(keys: KeyProps[]): string {
  const colors = new Set<string>();
  for (const k of keys) {
    if (k.c && isValidHexColor(k.c)) colors.add(k.c);
  }
  let defs = "";
  for (const c of colors) {
    const id = `grad_${c.replace("#", "")}`;
    defs += `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${lighten(c, 18)}" />
      <stop offset="25%" stop-color="${c}" />
      <stop offset="80%" stop-color="${darken(c, 12)}" />
      <stop offset="100%" stop-color="${darken(c, 22)}" />
    </linearGradient>`;
  }
  // Highlight gradient (shared across all keys)
  defs += `<linearGradient id="key-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.3)" />
    <stop offset="50%" stop-color="rgba(255,255,255,0)" />
  </linearGradient>`;
  return defs;
}

// ═══════════════════════════════════════════════════════════
// ── Label Position Table ──
// ═══════════════════════════════════════════════════════════

export interface LabelPosition {
  lx: number;
  ly: number;
  anchor: string;
  fontSize: number;
}

/**
 * Compute label positions for all 12 KLE positions.
 *
 * KLE position map:
 *   0=top-left,     1=top-center,    2=top-right,
 *   3=center-left,  4=center-center, 5=center-right,
 *   6=bottom-left,  7=bottom-center, 8=bottom-right,
 *   9=front-center, 10=front-left,   11=front-right
 */
export function getLabelPositions(
  px: number, py: number,
  pw: number, ph: number,
  cx: number, cy: number,
): LabelPosition[] {
  return [
    // 0=top-left, 1=top-center, 2=top-right
    { lx: px + 5, ly: py + 10, anchor: "start", fontSize: 9 },
    { lx: cx, ly: py + 10, anchor: "middle", fontSize: 9 },
    { lx: px + pw - 5, ly: py + 10, anchor: "end", fontSize: 9 },
    // 3=center-left, 4=center-center, 5=center-right
    { lx: px + 5, ly: cy + 3, anchor: "start", fontSize: 11 },
    { lx: cx, ly: cy + 3, anchor: "middle", fontSize: 11 },
    { lx: px + pw - 5, ly: cy + 3, anchor: "end", fontSize: 11 },
    // 6=bottom-left, 7=bottom-center, 8=bottom-right
    { lx: px + 5, ly: py + ph - 6, anchor: "start", fontSize: 9 },
    { lx: cx, ly: py + ph - 6, anchor: "middle", fontSize: 9 },
    { lx: px + pw - 5, ly: py + ph - 6, anchor: "end", fontSize: 9 },
    // 9=front-center, 10=front-left, 11=front-right
    { lx: cx, ly: py + ph + 11, anchor: "middle", fontSize: 7 },
    { lx: px + 5, ly: py + ph + 11, anchor: "start", fontSize: 7 },
    { lx: px + pw - 5, ly: py + ph + 11, anchor: "end", fontSize: 7 },
  ];
}

// ═══════════════════════════════════════════════════════════
// ── Keycap Body Renderer (Inner elements, no wrapping <g>) ──
// ═══════════════════════════════════════════════════════════

/**
 * Render a single key's body/cap as SVG elements (no labels, no wrapping <g>).
 * Produces rects, paths, and shapes for the keycap visual.
 *
 * The caller (renderKeyToSVG) is responsible for wrapping in a `<g>` element
 * with rotation/ghost/decal attributes.
 *
 * @param k      Key properties
 * @param x      Pixel X position (already multiplied by KEY_UNIT)
 * @param y      Pixel Y position (already multiplied by KEY_UNIT)
 * @param w      Width in key units
 * @param h      Height in key units
 */
export function renderKeyCapToSVG(
  k: KeyProps,
  x: number, y: number,
  w: number, h: number,
): string {
  const c = k.c && isValidHexColor(k.c) ? k.c : "#c8c8c8";
  const gid = `grad_${c.replace("#", "")}`;
  const gap = KEY_GAP;
  const rx = KEY_RX;

  const px = x + gap;
  const py = y + gap;
  const pw = w * KEY_UNIT - gap * 2;
  const ph = h * KEY_UNIT - gap * 2;
  const cx = px + pw / 2;

  let body = "";

  // Shadow
  body += `<rect x="${px}" y="${py + 1}" width="${pw}" height="${ph}" rx="${rx}" fill="rgba(0,0,0,0.12)" />`;

  // Keycap body with gradient
  const fillRef = gid ? `url(#${gid})` : c;
  body += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${rx}" fill="${fillRef}" stroke="${darken(c, 25)}" stroke-width="0.8" />`;

  // Top highlight (3D effect)
  body += `<rect x="${px}" y="${py}" width="${pw}" height="${Math.min(ph * KEY_HIGHLIGHT_MAX_RATIO, KEY_HIGHLIGHT_MAX_PX)}" rx="${rx}" fill="url(#key-highlight)" />`;

  // Stepped key notch (Caps Lock style)
  if (k.l) {
    const stepW = pw * STEPPED_NOTCH_RATIO;
    body += `<rect x="${px}" y="${py}" width="${stepW}" height="${ph}" rx="${rx}" fill="${darken(c, 10)}" />`;
    body += `<rect x="${px + stepW - 1}" y="${py}" width="1" height="${ph}" fill="rgba(0,0,0,0.06)" />`;
  }

  // Homing bump
  if (k.n) {
    body += `<rect x="${cx - 4}" y="${py + ph - 6}" width="8" height="3.5" rx="2" fill="rgba(0,0,0,0.3)" />`;
  }

  return body;
}

// ═══════════════════════════════════════════════════════════
// ── Non-rectangular key extension (L-shape) Renderer ──
// ═══════════════════════════════════════════════════════════

/**
 * Render the L-shaped extension (w2/h2) as SVG elements.
 * Returns empty string if the key has no extension.
 *
 * @param k      Key properties
 * @param x      Pixel X position
 * @param y      Pixel Y position
 * @param w      Width in key units
 * @param h      Height in key units
 * @param labels 12-position label array (for extension label fallback)
 * @param rotAttr Rotation transform attribute string (empty string if no rotation)
 */
export function renderKeyExtensionToSVG(
  k: KeyProps,
  x: number, y: number,
  w: number, h: number,
  labels: string[],
  rotAttr: string,
): string {
  if (!(k.w2 > 0 || k.h2 > 0)) return "";

  const c = k.c && isValidHexColor(k.c) ? k.c : "#c8c8c8";
  const t = k.t && isValidHexColor(k.t) ? k.t : "#000000";
  const gid = `grad_${c.replace("#", "")}`;
  const fillRef = gid ? `url(#${gid})` : c;

  const aw = w * KEY_UNIT, ah = h * KEY_UNIT;
  const ax = x, ay = y;
  const bw = (k.w2 || 0) * KEY_UNIT, bh = (k.h2 || 0) * KEY_UNIT;
  const bx = x + (k.x2 || 0) * KEY_UNIT, by = y + (k.y2 || 0) * KEY_UNIT;
  if (!(bw > 0 && bh > 0)) return "";

  // bounding box of the L-shape
  const extLeft = Math.min(ax, bx);
  const extTop = Math.min(ay, by);
  const extRight = Math.max(ax + aw, bx + bw);
  const extBottom = Math.max(ay + ah, by + bh);
  const extW = extRight - extLeft;
  const extH = extBottom - extTop;
  const lPath = computeLShapeSvgPath(ax, ay, aw, ah, bx, by, bw, bh, extW, extH, KEY_RX);

  let ext = "";
  // shadow
  ext += `<g${rotAttr}><path d="${lPath}" transform="translate(0,1)" fill="rgba(0,0,0,0.12)" />`;
  // body with fill + stroke
  ext += `<path d="${lPath}" fill="${fillRef}" stroke="${darken(c, 25)}" stroke-width="0.8" />`;
  // label on extension center
  const c2x = (bx + bw / 2), c2y = by + bh / 2;
  const primaryText = getLabelText(labels);
  if (primaryText) {
    ext += `<text x="${c2x + KEY_GAP}" y="${c2y + 1}" text-anchor="middle" dominant-baseline="central" font-size="9" fill="${t}" font-family="Monaco, monospace" font-weight="600">${esc(primaryText)}</text>`;
  }
  ext += "</g>";

  return ext;
}

// ═══════════════════════════════════════════════════════════
// ── Labels Renderer (SVG <text> elements) ──
// ═══════════════════════════════════════════════════════════

/**
 * Render all 12 label positions as SVG <text> elements.
 *
 * @param k      Key properties (for text color, font sizing)
 * @param x      Pixel X position (already multiplied by KEY_UNIT)
 * @param y      Pixel Y position (already multiplied by KEY_UNIT)
 * @param w      Width in key units
 * @param h      Height in key units
 * @param labels 12-position label array
 */
export function renderLabelsToSVG(
  k: KeyProps,
  x: number, y: number,
  w: number, h: number,
  labels: string[],
): string {
  const t = k.t && isValidHexColor(k.t) ? k.t : "#000000";
  const gap = KEY_GAP;

  const px = x + gap;
  const py = y + gap;
  const pw = w * KEY_UNIT - gap * 2;
  const ph = h * KEY_UNIT - gap * 2;
  const cx = px + pw / 2;
  const cy = py + ph / 2;

  let labelsSvg = "";
  const positions = getLabelPositions(px, py, pw, ph, cx, cy);

  for (let pos = 0; pos < Math.min(labels.length, 12); pos++) {
    const raw = labels[pos];
    if (!raw) continue;
    const lp = positions[pos];
    if (!lp) continue;
    const isCenter = pos === 4;
    const parsed = parseLabelColor(raw);
    const labelColor = parsed.color || t;
    const fs = isCenter
      ? Math.max(8, Math.min(13, pw / (parsed.text.length + 1) * 1.6))
      : lp.fontSize;
    labelsSvg += `<text x="${lp.lx}" y="${lp.ly}" text-anchor="${lp.anchor}" dominant-baseline="${isCenter ? "central" : "auto"}" font-size="${fs}" fill="${labelColor}" font-family="Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace" font-weight="600">${esc(parsed.text)}</text>`;
  }

  // Fallback empty indicator
  if (!labels.some(l => l)) {
    labelsSvg += `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" font-size="7" fill="rgba(0,0,0,0.15)" font-family="monospace">—</text>`;
  }

  return labelsSvg;
}

// ═══════════════════════════════════════════════════════════
// ── Full Key Renderer (Body + Labels) ──
// ═══════════════════════════════════════════════════════════

/**
 * Render a complete key as SVG elements — body (3D cap effect, shadow,
 * stepped notch, homing bump, L-shape extension) + all 12 label positions.
 *
 * Produces a single string with:
 *   <g rotation/ghost/decal>  ← body group with transform
 *     (body rects, highlight, stepped notch, homing bump)
 *     (all label <text> elements — INSIDE the rotation group)
 *   </g>
 *   (L-shape extension with its own rotation group)
 */
export function renderKeyToSVG(
  k: KeyProps,
  x: number, y: number,
  w: number, h: number,
  labels: string[],
  isDecal: boolean,
  isGhosted: boolean,
  _i: number,
): string {
  const r = k.r || 0;
  // M4: When rx/ry specify a cluster rotation center, use it instead of the key's own center
  const rotRx = (k.rx || 0) * KEY_UNIT;
  const rotRy = (k.ry || 0) * KEY_UNIT;
  const rotOriginX = (rotRx !== 0 || rotRy !== 0) ? rotRx : (x + w / 2) * KEY_UNIT;
  const rotOriginY = (rotRx !== 0 || rotRy !== 0) ? rotRy : (y + h / 2) * KEY_UNIT;
  const rotAttr = r ? ` transform="rotate(${r} ${rotOriginX} ${rotOriginY})"` : "";

  let result = "";

  // Main body group (rotation, ghost, decal attributes)
  result += `<g${rotAttr}${isGhosted ? ' opacity="0.4"' : ""}${isDecal ? ' stroke-dasharray="3,2"' : ""}>`;

  // Body elements (rects, shapes)
  result += renderKeyCapToSVG(k, x, y, w, h);

  // Label text elements (INSIDE the rotation group so they rotate with the key)
  result += renderLabelsToSVG(k, x, y, w, h, labels);

  result += "</g>";

  // Non-rectangular key extension (separate group with own rotation)
  result += renderKeyExtensionToSVG(k, x, y, w, h, labels, rotAttr);

  return result;
}

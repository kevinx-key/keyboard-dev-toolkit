/**
 * Unified Coordinate System for KLE Editor
 *
 * Provides conversion functions between key units (ku), pixels (px),
 * and millimeters (mm), plus layout bounds and rotation helpers.
 *
 * Constants:
 *   U_MM        = 19.05  — standard key unit width in mm
 *   KEY_UNIT_PX = 54     — standard key unit width in pixels (canvas)
 *   MM_PER_PX   = U_MM / KEY_UNIT_PX  — mm per pixel
 */

import type { KeyProps } from "./kle-types";

// ─── Constants ──────────────────────────────────────────

export const U_MM = 19.05;
export const KEY_UNIT_PX = 54;
export const MM_PER_PX = U_MM / KEY_UNIT_PX;

// ─── Point type ─────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

// ─── Origin mode ────────────────────────────────────────

export type OriginMode = "legacy" | "first-key-center";

// ─── Layout bounds result ───────────────────────────────

export interface LayoutBounds {
  /** Minimum X in mm */
  minX: number;
  /** Minimum Y in mm */
  minY: number;
  /** Maximum X in mm */
  maxX: number;
  /** Maximum Y in mm */
  maxY: number;
  /** Width in mm (maxX - minX) */
  width: number;
  /** Height in mm (maxY - minY) */
  height: number;
  /** Origin X in mm (for coordinate offset) */
  originX: number;
  /** Origin Y in mm (for coordinate offset) */
  originY: number;
}

// ─── Conversion functions ───────────────────────────────

/** Convert key units to pixels */
export function kuToPx(ku: number): number {
  return ku * KEY_UNIT_PX;
}

/** Convert key units to millimeters */
export function kuToMm(ku: number): number {
  return ku * U_MM;
}

/** Convert millimeters to pixels */
export function mmToPx(mm: number): number {
  return mm / MM_PER_PX;
}

/** Convert pixels to millimeters */
export function pxToMm(px: number): number {
  return px * MM_PER_PX;
}

// ─── Rotation ───────────────────────────────────────────

/**
 * Rotate a point around an origin by `deg` degrees (counter-clockwise).
 * Returns a new point; does not mutate the input.
 */
export function rotatePoint(
  p: Point,
  deg: number,
  origin: Point,
): Point {
  if (deg === 0 || deg % 360 === 0) return { x: p.x, y: p.y };
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Rotate multiple points around an origin (mutates in place for performance).
 * To avoid mutation, clone the array before calling.
 */
export function rotatePoints(
  pts: Point[],
  deg: number,
  origin: Point,
): void {
  if (deg === 0 || deg % 360 === 0) return;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  for (const p of pts) {
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    p.x = origin.x + dx * cos - dy * sin;
    p.y = origin.y + dx * sin + dy * cos;
  }
}

// ─── M17 修复：共享 bbox 计算 ─────────────────────────────

/**
 * 返回键位的外包围盒（key units），正确处理 L 形 w2/h2 扩展。
 *
 * 由 keyCenterInMm 和 layoutBounds 共用，消除重复逻辑。
 */
function computeKeyBBoxInUnits(key: KeyProps): { left: number; top: number; right: number; bottom: number } {
  const kw = key.w || 1;
  const kh = key.h || 1;
  const kx = key.x ?? 0;
  const ky = key.y ?? 0;

  let left = kx;
  let top = ky;
  let right = kx + kw;
  let bottom = ky + kh;

  if (
    (key.w2 || 0) > 0 &&
    (key.h2 || 0) > 0 &&
    ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)
  ) {
    left = Math.min(left, kx + (key.x2 || 0));
    top = Math.min(top, ky + (key.y2 || 0));
    right = Math.max(right, kx + (key.x2 || 0) + (key.w2 || 0));
    bottom = Math.max(bottom, ky + (key.y2 || 0) + (key.h2 || 0));
  }

  return { left, top, right, bottom };
}

// ─── Key center ─────────────────────────────────────────

/**
 * Compute the center of a key in millimeters.
 * Handles w2/h2 extensions (L-shaped keys).
 * Correctly accounts for negative x2/y2 offsets.
 */
export function keyCenterInMm(key: KeyProps): Point {
  const { left, top, right, bottom } = computeKeyBBoxInUnits(key);
  return {
    x: (left + (right - left) / 2) * U_MM,
    y: (top + (bottom - top) / 2) * U_MM,
  };
}

/**
 * Compute the effective width of a key in key units (handles w2/h2).
 * Returns the bounding box width, correctly handling negative x2.
 */
export function keyEffectiveW(key: KeyProps): number {
  const kw = key.w || 1;
  const kx = key.x ?? 0;
  if ((key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)) {
    const extLeft = kx + (key.x2 || 0);
    const extRight = kx + (key.x2 || 0) + (key.w2 || 0);
    const minLeft = Math.min(kx, extLeft);
    const maxRight = Math.max(kx + kw, extRight);
    return maxRight - minLeft;
  }
  return kw;
}

/**
 * Compute the effective height of a key in key units (handles w2/h2).
 * Returns the bounding box height, correctly handling negative y2.
 */
export function keyEffectiveH(key: KeyProps): number {
  const kh = key.h || 1;
  const ky = key.y ?? 0;
  if ((key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)) {
    const extTop = ky + (key.y2 || 0);
    const extBottom = ky + (key.y2 || 0) + (key.h2 || 0);
    const minTop = Math.min(ky, extTop);
    const maxBottom = Math.max(ky + kh, extBottom);
    return maxBottom - minTop;
  }
  return kh;
}

// ─── Layout bounds ──────────────────────────────────────

/**
 * Compute layout bounds from keys.
 *
 * In `legacy` mode (default):
 *   - origin = (minX, minY) of all keys in mm
 *   - This preserves backward compatibility: all outputs are identical
 *     to pre-refactor behavior.
 *
 * In `first-key-center` mode:
 *   - origin = keyCenterInMm(keys[0]) of the first non-decal key
 *   - All coordinates shift relative to the first key's center.
 *   - Keys at negative positions are still visible.
 */
// ─── M18 新增：旋转感知统一布局边界 ─────────────────────────

/**
 * 计算键盘配列的旋转感知外框边界（key units）。
 *
 * 对每个键：
 *   1. 计算有效包围盒（含 w2/h2 L 形扩展）
 *   2. 取得四个角点
 *   3. 如果键有旋转，将四个角绕旋转原点旋转
 *   4. 取所有角点的全局 minX/maxX/minY/maxY
 *
 * @param keys          键数组
 * @param includeDecals 是否计入透明装饰键（默认 false，PCB/Plate 忽略；Canvas 需要 true）
 * @returns 外框边界（key units）
 */
export function computeLayoutBBoxInUnits(
  keys: KeyProps[],
  includeDecals = false,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const k of keys) {
    if (!includeDecals && k.d) continue;

    const { left, top, right, bottom } = computeKeyBBoxInUnits(k);

    // 四个角点
    let corners: Point[] = [
      { x: left, y: top },
      { x: right, y: top },
      { x: left, y: bottom },
      { x: right, y: bottom },
    ];

    // 应用旋转（KLE 约定：r>0 = SVG 顺时针 = rotatePoint 在 Y↓ 坐标系中为顺时针）
    if (k.r && k.r % 360 !== 0) {
      const useKeyCenter = !k.rx && !k.ry;
      const ox = useKeyCenter ? left + (right - left) / 2 : (k.rx ?? 0);
      const oy = useKeyCenter ? top + (bottom - top) / 2 : (k.ry ?? 0);
      corners = corners.map((c) => rotatePoint(c, k.r, { x: ox, y: oy }));
    }

    for (const c of corners) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x > maxX) maxX = c.x;
      if (c.y > maxY) maxY = c.y;
    }
  }

  // 空数组保护
  if (minX === Infinity) { minX = 0; minY = 0; maxX = 0; maxY = 0; }

  return { minX, minY, maxX, maxY };
}

export function layoutBounds(
  keys: KeyProps[],
  originMode: OriginMode = "legacy",
): LayoutBounds {
  if (keys.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, originX: 0, originY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const k of keys) {
    const { left, top, right, bottom } = computeKeyBBoxInUnits(k);

    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  // Convert key units to mm
  const minXmm = minX * U_MM;
  const minYmm = minY * U_MM;
  const maxXmm = maxX * U_MM;
  const maxYmm = maxY * U_MM;

  // Determine origin based on mode
  let originX: number;
  let originY: number;

  if (originMode === "first-key-center") {
    const center = keyCenterInMm(keys[0]!);
    originX = center.x;
    originY = center.y;
  } else {
    // Legacy: origin = top-left (minX, minY) of all keys
    originX = minXmm;
    originY = minYmm;
  }

  return {
    minX: minXmm,
    minY: minYmm,
    maxX: maxXmm,
    maxY: maxYmm,
    width: maxXmm - minXmm,
    height: maxYmm - minYmm,
    originX,
    originY,
  };
}

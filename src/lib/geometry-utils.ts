/**
 * Shared Geometry Utilities
 *
 * Single source of truth for geometry computation functions:
 * - rotatedBbox: bounding box of a rotated rectangle
 *
 * Rotation primitives (rotatePoint, rotatePoints) and key center
 * computation (keyCenterInMm) live in coordinate-system.ts.
 */

import { rotatePoint } from "./coordinate-system";

// ═══════════════════════════════════════════════════════════
// ── Rotated Bounding Box ──
// ═══════════════════════════════════════════════════════════

/**
 * Compute the axis-aligned bounding box of a rotated rectangle.
 *
 * @param cx       Rectangle left X (pixels)
 * @param cy       Rectangle top Y (pixels)
 * @param cw       Rectangle width (pixels)
 * @param ch       Rectangle height (pixels)
 * @param ox       Rotation origin X (pixels)
 * @param oy       Rotation origin Y (pixels)
 * @param angleDeg Rotation angle in degrees (counter-clockwise)
 * @returns        Bounding box { x, y, w, h } in pixels
 */
export function rotatedBbox(
  cx: number,
  cy: number,
  cw: number,
  ch: number,
  ox: number,
  oy: number,
  angleDeg: number,
): { x: number; y: number; w: number; h: number } {
  const corners = [
    rotatePoint({ x: cx, y: cy }, angleDeg, { x: ox, y: oy }),
    rotatePoint({ x: cx + cw, y: cy }, angleDeg, { x: ox, y: oy }),
    rotatePoint({ x: cx, y: cy + ch }, angleDeg, { x: ox, y: oy }),
    rotatePoint({ x: cx + cw, y: cy + ch }, angleDeg, { x: ox, y: oy }),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

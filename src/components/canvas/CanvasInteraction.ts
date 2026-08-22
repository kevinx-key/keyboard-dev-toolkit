/**
 * Canvas Interaction Utilities
 *
 * Pure functions for keyboard canvas hit testing and interaction calculations.
 * Extracted from KeyboardCanvas.tsx for modularity.
 */
import type { KeyProps } from "../../lib/kle-types";
import { getPrimaryLabel } from "../../lib/kle-types";
import { KEY_UNIT } from "../../lib";

/** Determine which visual category a key belongs to based on its primary label */
export function getKeyCategory(key: KeyProps): string {
  if (key.d) return "Decals";
  const label = getPrimaryLabel(key.labels) || "";
  const cleanLabel = label.trim();
  if (!cleanLabel) return "Specials";
  if (/^[A-Za-z]$/.test(cleanLabel)) return "Alphas";
  if (/^\d$/.test(cleanLabel)) return "Numbers";
  if (/^[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]$/.test(cleanLabel)) return "Punctuation";
  if (/^F\d{1,2}$/i.test(cleanLabel)) return "Function";
  return "Specials";
}

/**
 * Hit-test a single point (in key units) against all keys in reverse z-order.
 * Returns the index of the topmost key under the point, or null.
 * Accepts pixel coordinates and converts internally.
 */
export function hitTestKey(
  posX: number,
  posY: number,
  keys: KeyProps[],
): number | null {
  const ux = posX / KEY_UNIT;
  const uy = posY / KEY_UNIT;
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i]!;
    let testX = ux;
    let testY = uy;
    // Inverse-rotate the test point if key is rotated
    if (k.r) {
      const ox = k.rx !== 0 ? k.rx : k.x + k.w / 2;
      const oy = k.ry !== 0 ? k.ry : k.y + k.h / 2;
      const rad = (-k.r * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const dx = ux - ox;
      const dy = uy - oy;
      testX = ox + dx * cos - dy * sin;
      testY = oy + dx * sin + dy * cos;
    }
    if (testX >= k.x && testX < k.x + k.w && testY >= k.y && testY < k.y + k.h) {
      return i;
    }
    // L 形按键延伸区域 (x2/y2/w2/h2 — ISO Enter, Big-Ass Enter 等)
    if (k.x2 !== undefined && k.y2 !== undefined && k.w2 !== undefined && k.h2 !== undefined) {
      const extX = k.x + k.x2;
      const extY = k.y + k.y2;
      if (testX >= extX && testX < extX + k.w2 && testY >= extY && testY < extY + k.h2) {
        return i;
      }
    }
  }
  return null;
}

/**
 * Find all keys that intersect a rectangular selection area (in pixels).
 * Returns an array of key index strings.
 */
export function getKeysInArea(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  keys: KeyProps[],
): string[] {
  const minX = Math.min(startX, currentX);
  const maxX = Math.max(startX, currentX);
  const minY = Math.min(startY, currentY);
  const maxY = Math.max(startY, currentY);
  const hitIds: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const kx = k.x * KEY_UNIT;
    const ky = k.y * KEY_UNIT;
    const kw = k.w * KEY_UNIT;
    const kh = k.h * KEY_UNIT;
    if (kx < maxX && kx + kw > minX && ky < maxY && ky + kh > minY) {
      hitIds.push(String(i));
      continue;
    }
    // L 形按键延伸区域 (x2/y2/w2/h2)
    if (k.x2 !== undefined && k.y2 !== undefined && k.w2 !== undefined && k.h2 !== undefined) {
      const ekx = (k.x + k.x2) * KEY_UNIT;
      const eky = (k.y + k.y2) * KEY_UNIT;
      const ekw = k.w2 * KEY_UNIT;
      const ekh = k.h2 * KEY_UNIT;
      if (ekx < maxX && ekx + ekw > minX && eky < maxY && eky + ekh > minY) {
        hitIds.push(String(i));
      }
    }
  }
  return hitIds;
}

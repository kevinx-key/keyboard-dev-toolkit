/**
 * Shared Color Utilities
 *
 * Single source of truth for color manipulation functions used across
 * key rendering, canvas display, and export modules.
 */

// ═══════════════════════════════════════════════════════════
// ── Color Helpers ──
// ═══════════════════════════════════════════════════════════

/** Lighten a hex color by percentage (0–100). Returns "rgb(r,g,b)" string. */
export function lighten(hex: string, pct: number): string {
  if (!hex) return hex;
  const n = parseInt(hex.replace("#", ""), 16);
  if (isNaN(n)) return hex;
  const r = Math.min(255, (n >> 16) + Math.round((255 - (n >> 16)) * pct / 100));
  const g = Math.min(255, ((n >> 8) & 0xff) + Math.round((255 - ((n >> 8) & 0xff)) * pct / 100));
  const b = Math.min(255, (n & 0xff) + Math.round((255 - (n & 0xff)) * pct / 100));
  return `rgb(${r},${g},${b})`;
}

/** Darken a hex color by percentage (0–100). Returns "rgb(r,g,b)" string. */
export function darken(hex: string, pct: number): string {
  if (!hex) return hex;
  const n = parseInt(hex.replace("#", ""), 16);
  if (isNaN(n)) return hex;
  const r = Math.round((n >> 16) * (1 - pct / 100));
  const g = Math.round(((n >> 8) & 0xff) * (1 - pct / 100));
  const b = Math.round((n & 0xff) * (1 - pct / 100));
  return `rgb(${r},${g},${b})`;
}

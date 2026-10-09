/**
 * Shared Color Utilities
 *
 * Single source of truth for color manipulation functions used across
 * key rendering, canvas display, and export modules.
 *
 * Accepts both "#rgb"/"#rrggbb" hex and "rgb(r,g,b)" strings.
 */

// ═══════════════════════════════════════════════════════════
// ── Color Helpers ──
// ═══════════════════════════════════════════════════════════

/** Parse "#rgb" | "#rrggbb" | "rgb(r,g,b)" | "rgba(r,g,b,..)" into [r,g,b], else null. */
function parseRgb(color: string): [number, number, number] | null {
  if (!color) return null;
  const s = color.trim();
  if (s.startsWith("#")) {
    const h = s.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(h)) {
      return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
    }
    if (/^[0-9a-fA-F]{6}$/.test(h)) {
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    return null;
  }
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return [parseInt(m[1]!, 10), parseInt(m[2]!, 10), parseInt(m[3]!, 10)];
  return null;
}

/** Lighten a color by percentage (0–100). Returns "rgb(r,g,b)" string. */
export function lighten(color: string, pct: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color;
  const f = (v: number) => Math.min(255, v + Math.round((255 - v) * pct / 100));
  return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}

/** Darken a color by percentage (0–100). Returns "rgb(r,g,b)" string. */
export function darken(color: string, pct: number): string {
  const rgb = parseRgb(color);
  if (!rgb) return color;
  const f = (v: number) => Math.round(v * (1 - pct / 100));
  return `rgb(${f(rgb[0])},${f(rgb[1])},${f(rgb[2])})`;
}

/** Blend color a → b by t (0 = a, 1 = b). Returns "rgb(r,g,b)". */
export function mixColor(a: string, b: string, t: number): string {
  const ca = parseRgb(a);
  const cb = parseRgb(b);
  if (!ca || !cb) return t >= 0.5 ? b : a;
  const blend = (x: number, y: number) => Math.round(x * (1 - t) + y * t);
  return `rgb(${blend(ca[0], cb[0])},${blend(ca[1], cb[1])},${blend(ca[2], cb[2])})`;
}

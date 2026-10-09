/**
 * Color conversion utilities — single source of truth for color model conversion
 * used by the color picker UI (hex / RGB / CMYK / HSV) and the quick-color input.
 *
 * Storage convention: keys always store hex (`#rrggbb` or `#rrggbbaa`).
 * RGB / CMYK / HSV are only used for display and input parsing.
 */

export interface RGB { r: number; g: number; b: number; a?: number }
export interface CMYK { c: number; m: number; y: number; k: number }
export interface HSV { h: number; s: number; v: number }

const clamp255 = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

/** Expand `#rgb`/`#rgba` to 6/8 digit form and lowercase. Returns null if invalid. */
export function normalizeHex(hex: string): string | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().toLowerCase();
  if (!h.startsWith("#")) h = "#" + h;
  const body = h.slice(1);
  if (!/^[0-9a-f]+$/.test(body)) return null;
  if (body.length === 3 || body.length === 4) {
    const expanded = body.split("").map((c) => c + c).join("");
    return "#" + expanded;
  }
  if (body.length === 6 || body.length === 8) return "#" + body;
  return null;
}

/** Parse a hex color into RGBA (0-255, a in 0-1). Returns null if invalid. */
export function hexToRgb(hex: string): RGB | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  const body = n.slice(1);
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  const a = body.length === 8 ? parseInt(body.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

/** Convert RGBA to `#rrggbb` (or `#rrggbbaa` when alpha < 1). */
export function rgbToHex(rgb: RGB): string {
  const r = clamp255(rgb.r).toString(16).padStart(2, "0");
  const g = clamp255(rgb.g).toString(16).padStart(2, "0");
  const b = clamp255(rgb.b).toString(16).padStart(2, "0");
  const a = rgb.a == null ? 1 : Math.max(0, Math.min(1, rgb.a));
  if (a >= 1) return `#${r}${g}${b}`;
  const aa = Math.round(a * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}${aa}`;
}

/** RGB → CMYK. Values are 0-100 (percent). */
export function rgbToCmyk(rgb: RGB): CMYK {
  const r = clamp255(rgb.r) / 255;
  const g = clamp255(rgb.g) / 255;
  const b = clamp255(rgb.b) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

/** CMYK (0-100 percent) → RGB (0-255). */
export function cmykToRgb(cmyk: CMYK): RGB {
  const c = Math.max(0, Math.min(100, cmyk.c)) / 100;
  const m = Math.max(0, Math.min(100, cmyk.m)) / 100;
  const y = Math.max(0, Math.min(100, cmyk.y)) / 100;
  const k = Math.max(0, Math.min(100, cmyk.k)) / 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

/** RGB → HSV (h 0-360, s/v 0-100). */
export function rgbToHsv(rgb: RGB): HSV {
  const r = clamp255(rgb.r) / 255;
  const g = clamp255(rgb.g) / 255;
  const b = clamp255(rgb.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(max * 100) };
}

/** HSV (h 0-360, s/v 0-100) → RGB (0-255). */
export function hsvToRgb(hsv: HSV): RGB {
  const h = ((hsv.h % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, hsv.s)) / 100;
  const v = Math.max(0, Math.min(100, hsv.v)) / 100;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** Convenience: hex → CMYK (0-100). */
export function hexToCmyk(hex: string): CMYK | null {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToCmyk(rgb) : null;
}

/** Convenience: CMYK → hex. */
export function cmykToHex(cmyk: CMYK): string {
  return rgbToHex(cmykToRgb(cmyk));
}

/**
 * Parse a free-form color string into a normalized hex color.
 *
 * Accepted inputs:
 *   - hex:  `#fff`, `#ffffff`, `#ffffffaa` (leading `#` optional)
 *   - rgb:  `rgb(255,0,0)`, `rgb(255 0 0)`, `rgba(255,0,0,0.5)`, percentages
 *   - cmyk: `cmyk(0,100,100,0)` or `cmyk(0%,100%,100%,0%)`
 *
 * Returns `#rrggbb` / `#rrggbbaa` or null when unparseable.
 */
export function parseColorInput(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const s = input.trim().toLowerCase();

  // Hex
  if (/^#?[0-9a-f]{3,8}$/.test(s)) return normalizeHex(s);

  // rgb()/rgba()
  const rgbMatch = s.match(/^rgba?\(([^)]*)\)$/);
  if (rgbMatch) {
    const tokens = rgbMatch[1]!.split(/[,\s/]+/).filter((p) => p.length > 0);
    if (tokens.length < 3) return null;
    const channel = (t: string): number => {
      const n = parseFloat(t);
      if (!Number.isFinite(n)) return NaN;
      return t.endsWith("%") ? clamp255((n / 100) * 255) : clamp255(n);
    };
    const r = channel(tokens[0]!), g = channel(tokens[1]!), b = channel(tokens[2]!);
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
    let a = 1;
    if (tokens[3] !== undefined) {
      const an = parseFloat(tokens[3]);
      if (Number.isFinite(an)) a = tokens[3].endsWith("%") ? an / 100 : an;
    }
    return rgbToHex({ r, g, b, a });
  }

  // cmyk()
  const cmykMatch = s.match(/^cmyk\(([^)]*)\)$/);
  if (cmykMatch) {
    const tokens = cmykMatch[1]!.split(/[,\s/]+/).filter((p) => p.length > 0);
    const nums = tokens.map((t) => parseFloat(t));
    if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null;
    // Accept both 0-1 and 0-100 ranges: if all values are within 0-1, treat as fractions.
    const useFraction = nums.every((n) => n >= 0 && n <= 1);
    const cmyk: CMYK = {
      c: useFraction ? nums[0]! * 100 : nums[0]!,
      m: useFraction ? nums[1]! * 100 : nums[1]!,
      y: useFraction ? nums[2]! * 100 : nums[2]!,
      k: useFraction ? nums[3]! * 100 : nums[3]!,
    };
    return cmykToHex(cmyk);
  }

  return null;
}

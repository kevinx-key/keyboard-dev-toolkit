import type { KLELayout, KeyProps } from "./kle-types";
import { parseLabelColor } from "./kle-types";
import { KEY_UNIT } from "./kle-parser";
import { getRawRows, parseKLEJSON } from "./kle-serial";
import { isValidHexColor } from "./sanitize";
import { computeLShapeSvgPath } from "./lshape-path";
import { lighten, darken } from "./color-utils";
import { esc, getLabelText } from "./key-renderer";

/** Build SVG defs section — creates gradients for all unique key colors */
function buildDefs(keys: KeyProps[]): string {
  const colors = new Set<string>();
  for (const k of keys) {
    if (k.c && isValidHexColor(k.c)) colors.add(k.c);
  }
  let defs = "";
  for (const c of colors) {
    const id = `grad_${c.replace("#", "")}`;
    defs += `<linearGradient id="${id}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${lighten(c, 15)}" />
      <stop offset="30%" stop-color="${c}" />
      <stop offset="85%" stop-color="${darken(c, 10)}" />
      <stop offset="100%" stop-color="${darken(c, 18)}" />
    </linearGradient>`;
  }
  // Highlight gradient
  defs += `<linearGradient id="key-highlight" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="rgba(255,255,255,0.35)" />
    <stop offset="50%" stop-color="rgba(255,255,255,0)" />
  </linearGradient>`;
  return defs;
}

// ── M6 修复：renderKey 拆分为子函数 ──

/** 渲染键帽阴影 */
function renderKeyShadow(px: number, py: number, pw: number, ph: number, rx: number): string {
  return `<rect x="${px}" y="${py + 1}" width="${pw}" height="${ph}" rx="${rx}" fill="rgba(0,0,0,0.15)" />`;
}

/** 渲染键帽本体（渐变、高光、阶梯 notch、home bump） */
function renderKeyBody(
  k: KeyProps, px: number, py: number, pw: number, ph: number, rx: number,
  cx: number, c: string, fillRef: string,
): string {
  let html = `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${rx}" fill="${fillRef}" stroke="${darken(c, 20)}" stroke-width="0.8" />`;
  html += `<rect x="${px}" y="${py}" width="${pw}" height="${Math.min(ph * 0.45, 10)}" rx="${rx}" fill="url(#key-highlight)" />`;
  if (k.l) {
    const stepW = pw * 0.25;
    html += `<rect x="${px}" y="${py}" width="${stepW}" height="${ph}" rx="${rx}" fill="${darken(c, 8)}" />`;
    html += `<rect x="${px + stepW - 1}" y="${py}" width="1" height="${ph}" fill="rgba(0,0,0,0.08)" />`;
  }
  if (k.n) {
    html += `<rect x="${cx - 4}" y="${py + ph - 6}" width="8" height="3" rx="1.5" fill="rgba(0,0,0,0.35)" />`;
  }
  return html;
}

/** 渲染键帽标签（全部 12 个位置 + 回退空指示器） */
function renderKeyLabels(
  labels: string[], px: number, py: number, pw: number, ph: number,
  cx: number, cy: number, t: string,
): string {
  if (labels.length === 0) return "";
  let html = "";
  const labelPositions: { lx: number; ly: number; anchor: string; fs: number }[] = [
    { lx: px + 5, ly: py + 10, anchor: "start", fs: 9 },
    { lx: cx, ly: py + 10, anchor: "middle", fs: 9 },
    { lx: px + pw - 5, ly: py + 10, anchor: "end", fs: 9 },
    { lx: px + 5, ly: cy + 3, anchor: "start", fs: 11 },
    { lx: cx, ly: cy + 3, anchor: "middle", fs: 11 },
    { lx: px + pw - 5, ly: cy + 3, anchor: "end", fs: 11 },
    { lx: px + 5, ly: py + ph - 6, anchor: "start", fs: 9 },
    { lx: cx, ly: py + ph - 6, anchor: "middle", fs: 9 },
    { lx: px + pw - 5, ly: py + ph - 6, anchor: "end", fs: 9 },
    { lx: cx, ly: py + ph + 11, anchor: "middle", fs: 7 },
    { lx: px + 5, ly: py + ph + 11, anchor: "start", fs: 7 },
    { lx: px + pw - 5, ly: py + ph + 11, anchor: "end", fs: 7 },
  ];

  for (let pos = 0; pos < Math.min(labels.length, 12); pos++) {
    const raw = labels[pos];
    if (!raw) continue;
    const lp = labelPositions[pos];
    if (!lp) continue;
    const isCenter = pos === 4;
    const parsed = parseLabelColor(raw);
    const labelColor = parsed.color || t;
    const fs = isCenter ? Math.max(8, Math.min(13, pw / (parsed.text.length + 1) * 1.6)) : lp.fs;
    html += `<text x="${lp.lx}" y="${lp.ly}" text-anchor="${lp.anchor}" dominant-baseline="${isCenter ? "central" : "auto"}" font-size="${fs}" fill="${labelColor}" font-family="Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace" font-weight="600">${esc(parsed.text)}</text>`;
  }

  if (!labels.some(l => l)) {
    html += `<text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central" font-size="7" fill="rgba(0,0,0,0.15)" font-family="monospace">—</text>`;
  }
  return html;
}

/** 渲染 L 形键扩展区域 */
function renderKeyLShape(
  k: KeyProps, x: number, y: number, w: number, h: number,
  fillRef: string, c: string, t: string, gap: number, rotAttr: string, labels: string[],
): string {
  if (!(k.w2 > 0 || k.h2 > 0)) return "";
  const aw = w * KEY_UNIT, ah = h * KEY_UNIT;
  const ax = x, ay = y;
  const bw = (k.w2 || 0) * KEY_UNIT, bh = (k.h2 || 0) * KEY_UNIT;
  const bx = x + (k.x2 || 0) * KEY_UNIT, by = y + (k.y2 || 0) * KEY_UNIT;
  if (!(bw > 0 && bh > 0)) return "";
  const extL = Math.min(ax, bx), extT = Math.min(ay, by);
  const extR = Math.max(ax + aw, bx + bw), extB = Math.max(ay + ah, by + bh);
  const extW = extR - extL, extH = extB - extT;
  const lPath = computeLShapeSvgPath(ax, ay, aw, ah, bx, by, bw, bh, extW, extH, 4);
  let html = `<g${rotAttr}><path d="${lPath}" transform="translate(0,1)" fill="rgba(0,0,0,0.15)" />`;
  html += `<path d="${lPath}" fill="${fillRef}" stroke="${darken(c, 20)}" stroke-width="0.8" />`;
  const c2x = bx + bw / 2, c2y = by + bh / 2;
  const primaryText = getLabelText(labels);
  if (primaryText) {
    html += `<text x="${c2x + gap}" y="${c2y + 1}" text-anchor="middle" dominant-baseline="central" font-size="9" fill="${t}" font-family="Monaco, monospace" font-weight="600">${esc(primaryText)}</text>`;
  }
  html += "</g>";
  return html;
}

/** Render a single key as SVG elements */
function renderKey(
  k: KeyProps,
  x: number,
  y: number,
  w: number,
  h: number,
  labels: string[],
  isDecal: boolean,
  isGhosted: boolean,
  _i: number,
): string {
  const c = k.c && isValidHexColor(k.c) ? k.c : "#cccccc";
  const t = k.t && isValidHexColor(k.t) ? k.t : "#000000";
  const r = k.r || 0;
  const fillRef = `grad_${c.replace("#", "")}`;
  const gap = 2;
  const rx = 4;

  const px = x + gap;
  const py = y + gap;
  const pw = w * KEY_UNIT - gap * 2;
  const ph = h * KEY_UNIT - gap * 2;
  const cx = px + pw / 2;
  const cy = py + ph / 2;
  const rotAttr = r ? ` transform="rotate(${r} ${(x + w / 2) * KEY_UNIT} ${(y + h / 2) * KEY_UNIT})"` : "";

  let group = `<g${rotAttr}${isGhosted ? ' opacity="0.4"' : ""}${isDecal ? ' stroke-dasharray="3,2"' : ""}>`;

  group += renderKeyShadow(px, py, pw, ph, rx);
  group += renderKeyBody(k, px, py, pw, ph, rx, cx, c, `url(#${fillRef})`);
  group += renderKeyLabels(labels, px, py, pw, ph, cx, cy, t);
  group += "</g>";

  group += renderKeyLShape(k, x, y, w, h, `url(#${fillRef})`, c, t, gap, rotAttr, labels);

  return group;
}

// ── Main export ──

/**
 * Serialize layout to JSON string.
 *
 * NOTE: Output is standard compact JSON (single-line array of arrays),
 * NOT the native JS-array-literal format (one row per line
 * with trailing commas). If you need the native format, post-process
 * the output with:
 *   .replace(/],\[/g, "],\n[").replace(/^\[/,"").replace(/\]$/,"")
 *
 * Example output:
 *   ["Esc",{"x":1},"F1","F2"],[{"y":0.5},"~\n`","!\n1"]
 */
export function exportJSON(layout: KLELayout): string {
  const data = getRawRows(layout);
  if (data.length === 0) return "[]";
  const items = data.map((item: unknown) => JSON.stringify(item));
  return "[" + items.join(",") + "]";
}

/** Trigger browser download of JSON file */
export function downloadJSON(layout: KLELayout, filename?: string): void {
  const json = exportJSON(layout);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `${layout.meta.name || "keyboard-layout"}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open file picker and load JSON layout */
export function uploadJSON(): Promise<KLELayout | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Format 1: KLE native layouts.json format (array of rows)
        if (Array.isArray(data)) {
          const layout = parseKLEJSON(data);
          if (layout && layout.keys.length > 0) {
            // raw rows data already set by parser
            resolve(layout);
            return;
          }
        }

        // Format 2: Internal format { meta, keys } (backward compat)
        if (data && data.keys) {
          // Destructure to drop _sourceCache without mutating the original object
          const { _sourceCache: _unused, ...cleanLayout } = data as KLELayout;
          resolve(cleanLayout as KLELayout);
          return;
        }

        resolve(null);
      } catch (e) { console.error("uploadJSON: failed to parse file", e); resolve(null); }
      // Clean up the temporary input element
      input.remove();
    };
    input.click();
  });
}

/** Grid line color */
const GRID_COLOR = "#e8e8e8";
const GRID_LINE_WIDTH = 0.5;

/**
 * Export a layout as an SVG string with 3D keycap effects.
 * @param scale Multiplier for output resolution (1 = standard, 2 = 2x, etc.)
 */
export function exportSVG(layout: KLELayout, scale: number = 1): string {
  const { keys, meta } = layout;
  if (keys.length === 0) return "";

  const PADDING = 20;
  const U = KEY_UNIT;

  // Calculate bounds
  let maxX = 0, maxY = 0;
  for (const k of keys) {
    maxX = Math.max(maxX, (k.x + k.w) * U + PADDING);
    maxY = Math.max(maxY, (k.y + k.h) * U + PADDING);
  }
  // Also check w2/h2 extents
  for (const k of keys) {
    if (k.w2 > 0 || k.h2 > 0) {
      maxX = Math.max(maxX, (k.x + k.x2 + (k.w2 || 0)) * U + PADDING);
      maxY = Math.max(maxY, (k.y + k.y2 + (k.h2 || 0)) * U + PADDING);
    }
  }

  const sw = Math.ceil(maxX * scale);
  const sh = Math.ceil(maxY * scale);
  const bgColor = meta.backcolor || "#ffffff";

  // Build grid
  let grid = "";
  const gridStep = U;
  for (let gx = 0; gx <= maxX; gx += gridStep) {
    grid += `<line x1="${gx}" y1="0" x2="${gx}" y2="${maxY}" stroke="${GRID_COLOR}" stroke-width="${GRID_LINE_WIDTH}" />`;
  }
  for (let gy = 0; gy <= maxY; gy += gridStep) {
    grid += `<line x1="0" y1="${gy}" x2="${maxX}" y2="${gy}" stroke="${GRID_COLOR}" stroke-width="${GRID_LINE_WIDTH}" />`;
  }

  // Defs
  const defs = buildDefs(keys);

  // Render keys
  let keyElements = "";
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    keyElements += renderKey(k, k.x * U, k.y * U, k.w, k.h, k.labels || [], !!k.d, !!k.g, i);
  }

  const label = meta.name ? esc(meta.name) : "Keyboard Layout";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${maxX} ${maxY}" width="${sw}" height="${sh}" style="max-width:100%;height:auto" role="img" aria-label="${label}">
  <defs>${defs}</defs>
  <!-- Background -->
  <rect width="100%" height="100%" fill="${bgColor}" rx="6" />
  <!-- Grid -->
  <g opacity="0.6">${grid}</g>
  <!-- Keys (rendered bottom-to-top for depth order) -->
  ${keyElements}
  <!-- Attribution -->
  <text x="${maxX - 4}" y="${maxY - 4}" text-anchor="end" font-size="7" fill="#ccc" font-family="sans-serif">Generated by Keyboard Dev Toolkit</text>
</svg>`;

  return svg;
}

/** Download SVG with 3D effects */
export function downloadSVG(layout: KLELayout, scale: number = 2): void {
  const svg = exportSVG(layout, scale);
  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${layout.meta.name || "keyboard-layout"}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download PNG at a given scale using canvas rendering */
export function downloadPNG(layout: KLELayout, scale: number = 2): void {
  const svgString = exportSVG(layout, scale);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    canvas.toBlob((pngBlob) => {
      if (!pngBlob) return;
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = `${layout.meta.name || "keyboard-layout"}@${scale}x.png`;
      a.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  img.onerror = () => { URL.revokeObjectURL(url); };
  img.src = url;
}

/** Download JPG at a given scale by rendering SVG to canvas and exporting as JPEG */
export function downloadJPG(layout: KLELayout, scale: number = 1): void {
  const svgString = exportSVG(layout, scale);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const img = new Image();
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    canvas.toBlob((jpgBlob) => {
      if (!jpgBlob) return;
      const jpgUrl = URL.createObjectURL(jpgBlob);
      const a = document.createElement("a");
      a.href = jpgUrl;
      a.download = `${layout.meta.name || "keyboard-layout"}@${scale}x.jpg`;
      a.click();
      URL.revokeObjectURL(jpgUrl);
    }, "image/jpeg", 0.92);
  };
  img.onerror = () => { URL.revokeObjectURL(url); };
  img.src = url;
}

/**
 * Render a layout to a PNG/JPEG Blob via canvas.
 * Used by Tauri save path (native dialog) — returns a Blob for saveFile().
 */
export function renderSVGToBlob(
  layout: KLELayout,
  scale: number,
  format: "png" | "jpeg",
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const svgString = exportSVG(layout, scale);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) { resolve(null); return; }
    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (format === "jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      canvas.toBlob((resultBlob) => { resolve(resultBlob); }, format === "jpeg" ? "image/jpeg" : "image/png", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

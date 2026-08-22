/**
 * Plate & Case Drawing Engine
 *
 * Generates keyboard plate CAD directly from KLE layout data.
 * No iframe, no external dependency.
 *
 * Features:
 * - MX switch cutouts (14×14mm)
 * - Stabilizer cutouts (Cherry/Costar/Fuling)
 * - Configurable edge padding
 * - SVG preview
 * - DXF export
 */

import polygonClipping from "polygon-clipping";
import type { KLELayout } from "./kle-types";
import type { StpExtrudeData } from "./stp-export";
import { getStabOffset } from "./stab-offsets";
import { rotatePoint, rotatePoints, computeLayoutBBoxInUnits } from "./coordinate-system";

// ─── Types ──────────────────────────────────────────────

export interface PlateConfig {
  /** Switch cutout type: 1=MX, 2=MX+Alps, 3=MX-H, 4=Alps */
  switchType: 1 | 2 | 3 | 4;
  /** Stabilizer type: 0=None, 1=Cherry+Costar, 2=Cherry, 3=Costar, 4=Alps, 5=Fuling */
  stabType: 0 | 1 | 2 | 3 | 4 | 5;
  /** Key unit in mm (default 19.05) */
  u1: number;
  /** Kerf compensation (mm) */
  kerf: number;
  /** Edge padding (mm) - top, left, right, bottom */
  topPad: number;
  leftPad: number;
  rightPad: number;
  bottomPad: number;
  /** Extra grow on X/Y */
  xGrow: number;
  yGrow: number;
  /** Corner fillet radius (mm, 0 = sharp) */
  fillet: number;
}

// ─── Interactive preview types ──────────────────────────

export interface PreviewRegion {
  /** Unique id, e.g. "key-0" */
  id: string;
  /** Index into keyInfos (0-based, skip decal keys) */
  keyIndex: number;
  type: "key";
  /** Post-override AABB in SVG viewport coordinates (for hit-testing) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual centre (post-KLE rotation) in SVG viewport coordinates */
  centerX: number;
  centerY: number;
  /** Pre-override AABB in SVG viewport coordinates (for selection indicator rotation) */
  baseX: number;
  baseY: number;
  baseW: number;
  baseH: number;
}

/** Key-info-index → rotation angle in degrees (0 / 90 / 180 / 270) */
export interface PlateRotationOverrides {
  [keyInfoIndex: number]: number;
}

export interface PlateResult {
  svg: string;
  dxf: string;
  width: number;
  height: number;
  area: number;
  cutPathLength: number;
  /**
   * 3D 挤出几何数据 —— 供 stp-export 使用。
   * 所有坐标均为绝对 mm，与 DXF 空间一致。
   * 定位板的厚度为 1.5mm，由调用方指定。
   */
  stpData: StpExtrudeData | null;
  /** Hit-test regions for interactive preview */
  regions: PreviewRegion[];
}

// ─── Default config ─────────────────────────────────────

const DEFAULT_CONFIG: PlateConfig = {
  switchType: 1,
  stabType: 1,
  u1: 19.05,
  kerf: 0,
  topPad: 0,
  leftPad: 0,
  rightPad: 0,
  bottomPad: 0,
  xGrow: 0,
  yGrow: 0,
  fillet: 0,
};

// ─── Switch cutout polygons (mm, relative to key center) ──

function getSwitchPolygon(type: PlateConfig["switchType"], kerfHalf: number): { x: number; y: number }[] {
  const l = kerfHalf;
  switch (type) {
    case 1: // MX
      return [
        { x: 7 + l, y: -7 - l },
        { x: 7 + l, y: 7 + l },
        { x: -7 - l, y: 7 + l },
        { x: -7 - l, y: -7 - l },
      ];
    case 2: // MX+Alps
      return [
        { x: 7 + l, y: -7 - l }, { x: 7 + l, y: -6.4 - l },
        { x: 7.8 + l, y: -6.4 - l }, { x: 7.8 + l, y: 6.4 + l },
        { x: 7 + l, y: 6.4 + l }, { x: 7 + l, y: 7 + l },
        { x: -7 - l, y: 7 + l }, { x: -7 - l, y: 6.4 + l },
        { x: -7.8 - l, y: 6.4 + l }, { x: -7.8 - l, y: -6.4 - l },
        { x: -7 - l, y: -6.4 - l }, { x: -7 - l, y: -7 - l },
      ];
    case 3: // MX-H
      return [
        { x: 7 + l, y: -7 - l }, { x: 7 + l, y: -6 - l },
        { x: 7.8 + l, y: -6 - l }, { x: 7.8 + l, y: -2.9 - l },
        { x: 7 + l, y: -2.9 - l }, { x: 7 + l, y: 2.9 + l },
        { x: 7.8 + l, y: 2.9 + l }, { x: 7.8 + l, y: 6 + l },
        { x: 7 + l, y: 6 + l }, { x: 7 + l, y: 7 + l },
        { x: -7 - l, y: 7 + l }, { x: -7 - l, y: 6 + l },
        { x: -7.8 - l, y: 6 + l }, { x: -7.8 - l, y: 2.9 + l },
        { x: -7 - l, y: 2.9 + l }, { x: -7 - l, y: -2.9 - l },
        { x: -7.8 - l, y: -2.9 - l }, { x: -7.8 - l, y: -6 - l },
        { x: -7 - l, y: -6 - l }, { x: -7 - l, y: -7 - l },
      ];
    case 4: // Alps
      return [
        { x: 7.8 + l, y: -6.4 - l },
        { x: 7.8 + l, y: 6.4 + l },
        { x: -7.8 - l, y: 6.4 + l },
        { x: -7.8 - l, y: -6.4 - l },
      ];
    default:
      return [];
  }
}

// ─── Cherry+CStar stabilizer polygon (universal) ────────
function getStabPolygonCherryCostar(
  offset: number, kerfHalf: number, isTall: boolean,
): { x: number; y: number }[] {
  const o = kerfHalf;
  // Kerf expands hole outward for ALL directions
  const outer = 3.375 + o, inner = 1.65 - o, top = -2.3 - o, bot = 6.77 + o;
  const pts = [
    { x: offset - outer, y: top },
    { x: offset - outer, y: -5.53 - o },
    { x: offset - inner, y: -5.53 - o },
    { x: offset - inner, y: -6.45 - o },
    { x: offset + inner, y: -6.45 - o },
    { x: offset + inner, y: -5.53 - o },
    { x: offset + outer, y: -5.53 - o },
    { x: offset + outer, y: top },
    { x: offset + 4.2 - o, y: top },
    { x: offset + 4.2 - o, y: 0.5 - o },
    { x: offset + outer, y: 0.5 - o },
    { x: offset + outer, y: bot },
    { x: offset + inner, y: bot },
    { x: offset + inner, y: 7.75 - o },
    { x: offset - inner, y: 7.75 - o },
    { x: offset - inner, y: bot },
    { x: offset - outer, y: bot },
    { x: offset - outer, y: 2.3 - o },
    { x: -offset + outer, y: 2.3 - o },
    { x: -offset + outer, y: bot },
    { x: -offset + inner, y: bot },
    { x: -offset + inner, y: 7.75 - o },
    { x: -offset - inner, y: 7.75 - o },
    { x: -offset - inner, y: bot },
    { x: -offset - outer, y: bot },
    { x: -offset - outer, y: 0.5 - o },
    { x: -offset - 4.2 + o, y: 0.5 - o },
    { x: -offset - 4.2 + o, y: top },
    { x: -offset - outer, y: top },
    { x: -offset - outer, y: -5.53 - o },
    { x: -offset - inner, y: -5.53 - o },
    { x: -offset - inner, y: -6.45 - o },
    { x: -offset + inner, y: -6.45 - o },
    { x: -offset + inner, y: -5.53 - o },
    { x: -offset + outer, y: -5.53 - o },
    { x: -offset + outer, y: top },
  ];
  if (isTall) rotatePoints(pts, 90, { x: 0, y: 0 });
  return pts;
}

// ─── Cherry-only stabilizer polygon ─────────────────────
function getStabPolygonCherry(
  offset: number, kerfHalf: number, isTall: boolean,
): { x: number; y: number }[] {
  const o = kerfHalf;
  const outer = 3.375 + o, inner = 1.65 - o, top = -2.3 - o, bot = 6.77 + o;
  const pts = [
    { x: offset - outer, y: top },
    { x: offset - outer, y: -5.53 - o },
    { x: offset + outer, y: -5.53 - o },
    { x: offset + outer, y: top },
    { x: offset + 4.2 - o, y: top },
    { x: offset + 4.2 - o, y: 0.5 - o },
    { x: offset + outer, y: 0.5 - o },
    { x: offset + outer, y: bot },
    { x: offset + inner, y: bot },
    { x: offset + inner, y: 7.97 - o },
    { x: offset - inner, y: 7.97 - o },
    { x: offset - inner, y: bot },
    { x: offset - outer, y: bot },
    { x: offset - outer, y: 2.3 - o },
    { x: -offset + outer, y: 2.3 - o },
    { x: -offset + outer, y: bot },
    { x: -offset + inner, y: bot },
    { x: -offset + inner, y: 7.97 - o },
    { x: -offset - inner, y: 7.97 - o },
    { x: -offset - inner, y: bot },
    { x: -offset - outer, y: bot },
    { x: -offset - outer, y: 0.5 - o },
    { x: -offset - 4.2 + o, y: 0.5 - o },
    { x: -offset - 4.2 + o, y: top },
    { x: -offset - outer, y: top },
    { x: -offset - outer, y: -5.53 - o },
    { x: -offset + outer, y: -5.53 - o },
    { x: -offset + outer, y: top },
  ];
  if (isTall) rotatePoints(pts, 90, { x: 0, y: 0 });
  return pts;
}

// ─── Fuling (腹灵) stabilizer polygon ───────────────────
function getFulingStabPolygon(
  offset: number, kerfHalf: number, isTall: boolean,
): { x: number; y: number }[][] {
  const k = kerfHalf;
  // Y-direction kerf signs corrected (expand hole outward)
  const rPath = [
    { x: offset - 3.35 + k, y: +6.75 + k }, { x: offset + 3.35 - k, y: +6.75 + k },
    { x: offset + 3.35 - k, y: +4.00 + k }, { x: offset + 4.55 - k, y: +4.00 + k },
    { x: offset + 4.55 - k, y: +0.50 + k }, { x: offset + 3.35 - k, y: +0.50 + k },
    { x: offset + 3.35 - k, y: -5.55 - k }, { x: offset + 1.55 - k, y: -5.55 - k },
    { x: offset + 1.55 - k, y: -6.75 - k }, { x: offset - 1.55 + k, y: -6.75 - k },
    { x: offset - 1.55 + k, y: -5.55 - k }, { x: offset - 3.35 + k, y: -5.55 - k },
    { x: offset - 3.35 + k, y: +6.75 + k },
  ];
  const lPath = [
    { x: -offset + 3.35 - k, y: +6.75 + k }, { x: -offset - 3.35 + k, y: +6.75 + k },
    { x: -offset - 3.35 + k, y: +4.00 + k }, { x: -offset - 4.55 + k, y: +4.00 + k },
    { x: -offset - 4.55 + k, y: +0.50 + k }, { x: -offset - 3.35 + k, y: +0.50 + k },
    { x: -offset - 3.35 + k, y: -5.55 - k }, { x: -offset - 1.55 + k, y: -5.55 - k },
    { x: -offset - 1.55 + k, y: -6.75 - k }, { x: -offset + 1.55 - k, y: -6.75 - k },
    { x: -offset + 1.55 - k, y: -5.55 - k }, { x: -offset + 3.35 - k, y: -5.55 - k },
    { x: -offset + 3.35 - k, y: +6.75 + k },
  ];
  const rChan = [
    { x: 7.0 + k, y: 0.5 + k }, { x: offset - 2.5 - k, y: 0.5 + k },
    { x: offset - 2.5 - k, y: 4.0 + k }, { x: 7.0 + k, y: 4.0 + k },
  ];
  const lChan = [
    { x: -offset + 2.5 + k, y: 0.5 + k }, { x: -7.0 - k, y: 0.5 + k },
    { x: -7.0 - k, y: 4.0 + k }, { x: -offset + 2.5 + k, y: 4.0 + k },
  ];
  const result = [rPath, lPath, rChan, lChan];
  for (const poly of result) { if (isTall) rotatePoints(poly, 90, { x: 0, y: 0 }); }
  return result;
}

// ─── 2D helpers ─────────────────────────────────────────

function translatePoints(pts: { x: number; y: number }[], dx: number, dy: number) {
  for (const p of pts) { p.x += dx; p.y += dy; }
}

function polygonPerimeter(pts: { x: number; y: number }[]): number {
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dx = pts[j]!.x - pts[i]!.x;
    const dy = pts[j]!.y - pts[i]!.y;
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

// ─── Boolean geometry helpers (dwb-layout polygon-ops.ts pattern) ──

type ClipPoint = [number, number];
type ClipRing = ClipPoint[];
type ClipPoly = ClipRing[];   // polygon = array of rings

/** Convert {x,y}[] to polygon-clipping format MultiPolygon [[[x,y],...]] */
function pathToMP(pts: { x: number; y: number }[]): ClipPoly[] {
  if (pts.length < 2) return [];
  return [[pts.map((p) => [p.x, p.y] as ClipPoint)]];
}

/** Convert polygon-clipping MultiPolygon result back to {x,y}[][] */
function mpToPaths(mp: ClipPoly[]): { x: number; y: number }[][] {
  const result: { x: number; y: number }[][] = [];
  for (const polygon of mp) {
    for (const ring of polygon) {
      const path = ring.map(([x, y]) => ({ x, y }));
      if (path.length > 2) result.push(path);
    }
  }
  return result;
}

/** Boolean union of multiple polygons (sequential merge, matches dwb-layout) */
function unionAll(polys: { x: number; y: number }[][]): { x: number; y: number }[][] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return [polys[0]!];
  let result = pathToMP(polys[0]!);
  for (let i = 1; i < polys.length; i++) {
    result = polygonClipping.union(result, pathToMP(polys[i]!));
  }
  return mpToPaths(result);
}

// ─── Main plate generation ──────────────────────────────

export function generatePlate(
  layout: KLELayout,
  config?: Partial<PlateConfig>,
  rotationOverrides?: PlateRotationOverrides,
): PlateResult {
  const cfg: PlateConfig = { ...DEFAULT_CONFIG, ...config };
  const { keys, meta } = layout;
  const kerfHalf = cfg.kerf / 2;
  const U = cfg.u1;

  if (keys.length === 0) {
    return { svg: "", dxf: "", width: 0, height: 0, area: 0, cutPathLength: 0, stpData: null, regions: [] };
  }

  type KeyInfo = {
    cx: number; cy: number; kw: number; kh: number;
    rx: number; ry: number; rot: number; isTall: boolean;
    /** Visual center after KLE layout rotation (mm) */
    visualCx: number; visualCy: number;
  };

  const keyInfos: KeyInfo[] = [];

  for (const k of keys) {
    const kw = k.w, kh = k.h;
    let actualW = kw, actualH = kh;
    let cx = (k.x + kw / 2) * U;
    let cy = (k.y + kh / 2) * U;

    if (k.w2 > 0 && k.h2 > 0 && (k.x2 !== 0 || k.y2 !== 0)) {
      const ext_right = k.x + (k.x2 || 0) + (k.w2 || 0);
      const ext_bottom = k.y + (k.y2 || 0) + (k.h2 || 0);
      actualW = Math.max(kw, ext_right - k.x);
      actualH = Math.max(kh, ext_bottom - k.y);
      cx = (k.x + actualW / 2) * U;
      cy = (k.y + actualH / 2) * U;
    }

    const rx = (k.rx || 0) * U, ry = (k.ry || 0) * U;
    const isTall = actualH > actualW;

    // Compute visual center after KLE rotation
    let visualCx = cx;
    let visualCy = cy;
    if ((k.r || 0) % 360 !== 0) {
      const rotOriginX = (rx !== 0 || ry !== 0) ? rx : cx;
      const rotOriginY = (rx !== 0 || ry !== 0) ? ry : cy;
      const vc = rotatePoint({ x: cx, y: cy }, k.r || 0, { x: rotOriginX, y: rotOriginY });
      visualCx = vc.x;
      visualCy = vc.y;
    }

    if (!k.d) {
      keyInfos.push({ cx, cy, kw: actualW, kh: actualH, rx, ry, rot: k.r || 0, isTall, visualCx, visualCy });
    }
  }

  // 使用旋转感知共享函数计算外框边界
  const bbox = computeLayoutBBoxInUnits(keys);
  const plateMargin = 2; // 轴体开槽最小余量 (mm)
  let minX = bbox.minX * U - plateMargin;
  let minY = bbox.minY * U - plateMargin;
  let maxX = bbox.maxX * U + plateMargin;
  let maxY = bbox.maxY * U + plateMargin;

  // 应用定向 padding
  minX -= cfg.leftPad; minY -= cfg.topPad;
  maxX += cfg.rightPad; maxY += cfg.bottomPad;

  const plateW = maxX - minX;
  const plateH = maxY - minY;

  // Collect all cutouts — boolean union (switch + stab merged into one ring per key)
  const allSwitchHoles: { x: number; y: number }[][] = [];
  const allMergedHoles: { x: number; y: number }[][] = [];
  let totalCutLen = 0;

  // Regions accumulator: keyinfo-index → bounding polygon coords
  const regionAccums = new Map<number, {
    minX: number; minY: number; maxX: number; maxY: number;
    cx: number; cy: number;
    preMinX: number; preMinY: number; preMaxX: number; preMaxY: number;
  }>();

  for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
    const ki = keyInfos[keyIndex]!;
    const keyPolys: { x: number; y: number }[][] = [];

    // Switch cutout
    const swPts = getSwitchPolygon(cfg.switchType, kerfHalf);
    if (swPts.length === 0) continue;

    if (ki.isTall) rotatePoints(swPts, 90, { x: 0, y: 0 });
    translatePoints(swPts, ki.cx, ki.cy);
    if (ki.rot !== 0) {
      const rotOrigin = (ki.rx !== 0 || ki.ry !== 0) ? { x: ki.rx, y: ki.ry } : { x: ki.cx, y: ki.cy };
      rotatePoints(swPts, ki.rot, rotOrigin);
    }
    if (ki.kw === 6 || (ki.isTall && ki.kh === 6)) translatePoints(swPts, cfg.u1 / 2, 0);

    keyPolys.push(swPts);
    allSwitchHoles.push(swPts);

    // Stabilizer cutout
    const stabSize = ki.isTall ? ki.kh : ki.kw;
    const needStab = stabSize >= 2 && cfg.stabType > 0 && cfg.stabType <= 5;

    if (needStab) {
      const stabOffset = getStabOffset(stabSize);
      if (stabOffset !== null) {
        if (cfg.stabType === 5) {
          for (const path of getFulingStabPolygon(stabOffset, kerfHalf, ki.isTall)) {
            translatePoints(path, ki.cx, ki.cy);
            if (ki.rot !== 0) {
              const ro = (ki.rx !== 0 || ki.ry !== 0) ? { x: ki.rx, y: ki.ry } : { x: ki.cx, y: ki.cy };
              rotatePoints(path, ki.rot, ro);
            }
            keyPolys.push(path);
          }
        } else if (cfg.stabType === 2) {
          const stabPts = getStabPolygonCherry(stabOffset, kerfHalf, ki.isTall);
          translatePoints(stabPts, ki.cx, ki.cy);
          if (ki.rot !== 0) {
            const ro = (ki.rx !== 0 || ki.ry !== 0) ? { x: ki.rx, y: ki.ry } : { x: ki.cx, y: ki.cy };
            rotatePoints(stabPts, ki.rot, ro);
          }
          keyPolys.push(stabPts);
        } else {
          const stabPts = getStabPolygonCherryCostar(stabOffset, kerfHalf, ki.isTall);
          translatePoints(stabPts, ki.cx, ki.cy);
          if (ki.rot !== 0) {
            const ro = (ki.rx !== 0 || ki.ry !== 0) ? { x: ki.rx, y: ki.ry } : { x: ki.cx, y: ki.cy };
            rotatePoints(stabPts, ki.rot, ro);
          }
          keyPolys.push(stabPts);
        }
      }
    }

    // Boolean union: merge all polys for this key into one continuous ring
    const merged = unionAll(keyPolys);

    // ── Pre-override AABB (post-KLE rotation, before user override rotation) ──
    const preAcc = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const poly of merged) {
      for (const p of poly) {
        if (p.x < preAcc.minX) preAcc.minX = p.x;
        if (p.y < preAcc.minY) preAcc.minY = p.y;
        if (p.x > preAcc.maxX) preAcc.maxX = p.x;
        if (p.y > preAcc.maxY) preAcc.maxY = p.y;
      }
    }

    // 用户覆盖旋转：在 KLE 变换之后，但固定绕 ki.visualCx/ki.visualCy（KLE 旋转后的视觉中心）
    const rotAngle = rotationOverrides?.[keyIndex];
    if (rotAngle && rotAngle % 360 !== 0) {
      for (const poly of merged) {
        rotatePoints(poly, rotAngle, { x: ki.visualCx, y: ki.visualCy });
      }
    }

    for (const poly of merged) {
      allMergedHoles.push(poly);
      totalCutLen += polygonPerimeter(poly);
    }

    // Accumulate region bounding boxes — post-override AABB for hit-testing, plus pre-override for selection indicator
    const acc = regionAccums.get(keyIndex) || {
      minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity,
      cx: ki.visualCx, cy: ki.visualCy,
      preMinX: Infinity, preMinY: Infinity, preMaxX: -Infinity, preMaxY: -Infinity,
    };
    for (const poly of merged) {
      for (const p of poly) {
        if (p.x < acc.minX) acc.minX = p.x;
        if (p.y < acc.minY) acc.minY = p.y;
        if (p.x > acc.maxX) acc.maxX = p.x;
        if (p.y > acc.maxY) acc.maxY = p.y;
      }
    }
    // Pre-override AABB (from before the override rotation was applied above)
    acc.preMinX = Math.min(acc.preMinX, preAcc.minX);
    acc.preMinY = Math.min(acc.preMinY, preAcc.minY);
    acc.preMaxX = Math.max(acc.preMaxX, preAcc.maxX);
    acc.preMaxY = Math.max(acc.preMaxY, preAcc.maxY);
    regionAccums.set(keyIndex, acc);
  }

  // ── SVG generation ──
  const pad = 5;
  const svgW = plateW + pad * 2;
  const svgH = plateH + pad * 2;

  function ptsToPath(pts: { x: number; y: number }[]): string {
    if (pts.length < 3) return "";
    return pts.map((p, i) => {
      const cmd = i === 0 ? "M" : "L";
      return `${cmd}${(p.x - minX + pad).toFixed(3)},${(p.y - minY + pad).toFixed(3)}`;
    }).join("") + "Z";
  }

  const filletR = cfg.fillet > 0 ? cfg.fillet : 0;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path{vector-effect:non-scaling-stroke}</style>
  <rect x="${pad}" y="${pad}" width="${plateW}" height="${plateH}" rx="${filletR}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>
  <g fill="#fff" stroke="#888" stroke-width="0.3">`;

  for (const hole of allMergedHoles) {
    svg += `<path d="${ptsToPath(hole)}"/>`;
  }

  svg += `</g>
</svg>`;

  // ── DXF generation ──
  const dxf = buildDXF(allMergedHoles, plateW, plateH, filletR, minX, minY, pad, keys.length, (meta.name || "").replace(/[<>"']/g, ""));

  // ── 构建 STP 3D 挤出几何数据 ──
  // 所有坐标均为绝对 mm，与 DXF/SVG 的 offset 无关
  const stpData: StpExtrudeData = {
    // 外边界矩形 (Y 已翻转，对齐 CAD 坐标系)
    boundary: [
      [minX, -minY],
      [maxX, -minY],
      [maxX, -maxY],
      [minX, -maxY],
    ],
    // 多边形孔洞: Y 翻转（SVG 预览 Y↓ → DXF/STP 标准 Y↑）
    polyHoles: allMergedHoles.map((poly) => poly.map((p) => [p.x, -p.y])),
    // 定位板没有圆形独立孔洞 (所有孔洞都是多边形)
    circleHoles: [],
  };

  // ── Build hit-test regions (SVG viewport coordinates) ──
  const regions: PreviewRegion[] = [];
  for (const [keyIndex, acc] of regionAccums) {
    if (acc.minX === Infinity) continue;
    regions.push({
      id: `key-${keyIndex}`,
      keyIndex,
      type: "key",
      x: acc.minX - minX + pad,
      y: acc.minY - minY + pad,
      w: acc.maxX - acc.minX,
      h: acc.maxY - acc.minY,
      centerX: acc.cx - minX + pad,
      centerY: acc.cy - minY + pad,
      baseX: acc.preMinX - minX + pad,
      baseY: acc.preMinY - minY + pad,
      baseW: acc.preMaxX - acc.preMinX,
      baseH: acc.preMaxY - acc.preMinY,
    });
  }

  return {
    svg,
    dxf,
    width: plateW,
    height: plateH,
    area: plateW * plateH / 100,
    cutPathLength: totalCutLen,
    stpData,
    regions,
  };
}

// ─── DXF Builder ────────────────────────────────────────

/** Generate vertex points along a quarter-arc for fillet approximation */
function arcPoints(
  cx: number, cy: number, r: number,
  startAngle: number, endAngle: number, segments: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const step = (endAngle - startAngle) / segments;
  for (let i = 1; i <= segments; i++) {
    const a = startAngle + step * i;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function buildDXF(
  allHoles: { x: number; y: number }[][],
  plateW: number, plateH: number, filletR: number,
  originX: number, originY: number, pad: number,
  _keyCount: number, _layoutName: string,
): string {
  const lines: string[] = [];
  const w = (s: string | number) => { lines.push(s.toString()); };

  w(0); w("SECTION"); w(2); w("HEADER");
  w(9); w("$ACADVER"); w(1); w("AC1009");
  w(9); w("$INSBASE"); w(10); w("0.0"); w(20); w("0.0"); w(30); w("0.0");
  w(9); w("$EXTMIN"); w(10); w("0.0"); w(20); w("0.0"); w(30); w("0.0");
  w(9); w("$EXTMAX"); w(10); w("1000.0"); w(20); w("1000.0"); w(30); w("0.0");
  w(0); w("ENDSEC");

  w(0); w("SECTION"); w(2); w("TABLES");
  w(0); w("TABLE"); w(2); w("LAYER"); w(5); w("2"); w(70); w("4");
  w(0); w("LAYER"); w(5); w("10"); w(2); w("0"); w(70); w("0"); w(62); w("7"); w(6); w("Continuous");
  w(0); w("LAYER"); w(5); w("11"); w(2); w("PLATE"); w(70); w("0"); w(62); w("1"); w(6); w("Continuous");
  w(0); w("LAYER"); w(5); w("12"); w(2); w("CUT"); w(70); w("0"); w(62); w("5"); w(6); w("Continuous");
  w(0); w("ENDTAB"); w(0); w("ENDSEC");

  w(0); w("SECTION"); w(2); w("ENTITIES");

  function addPolyline(pts: { x: number; y: number }[], layer: string) {
    if (pts.length < 3) return;
    w(0); w("POLYLINE");
    w(8); w(layer);
    w(66); w("1");
    w(70); w("1");
    w(40); w("0.0"); w(41); w("0.0");
    for (const p of pts) {
      w(0); w("VERTEX");
      w(8); w(layer);
      // DXF coordinates = SVG_viewport_coord - origin + pad = absolute mm
      w(10); w((p.x - originX + pad).toFixed(4));
      w(20); w((-(p.y - originY + pad)).toFixed(4));
      w(30); w("0.0");
    }
    w(0); w("SEQEND");
  }

  // Generate rounded rectangle plate outline with fillet
  const x0 = pad;
  const y0 = pad;
  const x1 = pad + plateW;
  const y1 = pad + plateH;
  const r = Math.min(filletR || 0, plateW / 2, plateH / 2);
  const ARC_SEGMENTS = 4; // 4 segments per 90° arc for smooth approximation

  const platePts: { x: number; y: number }[] = [];

  if (r > 0) {
    // Top edge: left → right, with fillet arcs at corners
    platePts.push({ x: x0 + r, y: y0 }); // Top-left start
    platePts.push({ x: x1 - r, y: y0 }); // Top-right end
    // Top-right fillet arc (clockwise)
    platePts.push(...arcPoints(x1 - r, y0 + r, r, -Math.PI / 2, 0, ARC_SEGMENTS));
    // Right edge
    platePts.push({ x: x1, y: y1 - r });
    // Bottom-right fillet arc
    platePts.push(...arcPoints(x1 - r, y1 - r, r, 0, Math.PI / 2, ARC_SEGMENTS));
    // Bottom edge
    platePts.push({ x: x0 + r, y: y1 });
    // Bottom-left fillet arc
    platePts.push(...arcPoints(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, ARC_SEGMENTS));
    // Left edge
    platePts.push({ x: x0, y: y0 + r });
    // Top-left fillet arc
    platePts.push(...arcPoints(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, ARC_SEGMENTS));
  } else {
    // No fillet: simple rectangle
    platePts.push({ x: x0, y: y0 });
    platePts.push({ x: x1, y: y0 });
    platePts.push({ x: x1, y: y1 });
    platePts.push({ x: x0, y: y1 });
  }

  addPolyline(platePts, "PLATE");

  for (const pts of allHoles) addPolyline(pts, "CUT");

  w(0); w("ENDSEC"); w(0); w("EOF");
  return lines.join("\r\n");
}

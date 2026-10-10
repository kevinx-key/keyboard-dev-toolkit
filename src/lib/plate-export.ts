/**
 * Plate & Case Drawing Engine
 *
 * Generates keyboard plate CAD directly from KLE layout data.
 * No iframe, no external dependency.
 *
 * Features:
 * - MX switch cutouts (14×14mm)
 * - Stabilizer cutouts (Cherry / PCB stab / Fuling)
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
  /** Switch cutout type: 1=MX（当前仅开放 MX；2=MX+Alps, 3=MX-H, 4=Alps 保留备用） */
  switchType: 1 | 2 | 3 | 4;
  /** Stabilizer type: 0=None, 1=Cherry, 2=PCB stab, 3=Fuling(腹灵) */
  stabType: 0 | 1 | 2 | 3;
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

/** 生成选项：在复用同一管道的前提下切换形态（如轴间棉） */
export interface PlateGenOptions {
  /** 卫星轴孔改用「矩形（按当前复杂多边形的最大外包围盒）+ 顶部连接横槽」 */
  foamStab?: boolean;
  /** 「圆角」：对所有挖孔（外框以外的图形）的直角施加的圆角半径 (mm) */
  holeFillet?: number;
  /** 短边开槽阈值 (mm)：轮廓上长度小于此值的短边，沿相邻垂边（取其较短者）方向开矩形槽消除，反复迭代至收敛（须在圆角之前）。0 = 关闭 */
  minFeature?: number;
  /** 兼容层：这些键（layout.keys 下标）的挖孔额外以浅灰重绘（预览区分用，不影响 DXF/STP） */
  compatKeyIndices?: Set<number>;
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

// ─── 通用几何辅助（kerf 偏移 / 圆角矩形） ───────────────

/** 多边形有向面积（用于判定绕向；CCW 为正） */
function signedArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i]!.x * pts[j]!.y - pts[j]!.x * pts[i]!.y;
  }
  return a / 2;
}

/**
 * 将多边形整体沿外法线偏移 d（正 d = 挖孔扩大，用于 kerf 补偿）。
 * 顶点按两邻边角平分线做 miter 外移；对直角/轴对齐多边形精确。
 */
function offsetPolygonOutward(
  pts: { x: number; y: number }[], d: number,
): { x: number; y: number }[] {
  if (d === 0 || pts.length < 3) return pts;
  const n = pts.length;
  const orient = signedArea(pts) >= 0 ? 1 : -1; // CCW → 外法线在边右侧
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    let e1x = cur.x - prev.x, e1y = cur.y - prev.y;
    let e2x = next.x - cur.x, e2y = next.y - cur.y;
    const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push({ x: cur.x, y: cur.y }); continue; }
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = e1y * orient, n1y = -e1x * orient;
    const n2x = e2y * orient, n2y = -e2x * orient;
    let bx = n1x + n2x, by = n1y + n2y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { out.push({ x: cur.x + n1x * d, y: cur.y + n1y * d }); continue; }
    bx /= bl; by /= bl;
    const cosHalf = Math.max(0.2, n1x * bx + n1y * by); // 限制极端 miter
    const m = d / cosHalf;
    out.push({ x: cur.x + bx * m, y: cur.y + by * m });
  }
  return out;
}

/** 轴对齐圆角矩形顶点（cx,cy 为中心，w×h，圆角 r）；r≤0 退化为直角矩形 */
function roundedRectPoints(
  cx: number, cy: number, w: number, h: number, r: number, seg = 6,
): { x: number; y: number }[] {
  const hw = w / 2, hh = h / 2;
  const rr = Math.min(r, hw, hh);
  if (rr <= 1e-9) {
    return [
      { x: cx + hw, y: cy - hh }, { x: cx + hw, y: cy + hh },
      { x: cx - hw, y: cy + hh }, { x: cx - hw, y: cy - hh },
    ];
  }
  const pts: { x: number; y: number }[] = [];
  const arc = (ox: number, oy: number, a0: number, a1: number) => {
    for (let s = 0; s <= seg; s++) {
      const a = a0 + (a1 - a0) * (s / seg);
      pts.push({ x: ox + Math.cos(a) * rr, y: oy + Math.sin(a) * rr });
    }
  };
  arc(cx + hw - rr, cy + hh - rr, 0, Math.PI / 2);              // 右下
  arc(cx - hw + rr, cy + hh - rr, Math.PI / 2, Math.PI);        // 左下
  arc(cx - hw + rr, cy - hh + rr, Math.PI, Math.PI * 1.5);      // 左上
  arc(cx + hw - rr, cy - hh + rr, Math.PI * 1.5, Math.PI * 2);  // 右上
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

// ─── PCB stab（板载卫星轴）开孔 ─────────────────────────
// 尺寸：7.75(X 宽) × 15(Y 长) mm、R1 圆角；两孔相对轴心左右对称，
//       相对轴体方框沿 Y 下错 1.5mm；2u 高度键帽整体以轴心顺时针转 90°。
const PCB_STAB_W = 7.75;
const PCB_STAB_H = 15;
const PCB_STAB_R = 1;
const PCB_STAB_DY = 1.5;

function getPCBStabPolygons(
  offset: number, kerfHalf: number, isTall: boolean,
): { x: number; y: number }[][] {
  const polys = [
    roundedRectPoints(offset, PCB_STAB_DY, PCB_STAB_W, PCB_STAB_H, PCB_STAB_R),
    roundedRectPoints(-offset, PCB_STAB_DY, PCB_STAB_W, PCB_STAB_H, PCB_STAB_R),
  ].map((p) => offsetPolygonOutward(p, kerfHalf));
  if (isTall) for (const p of polys) rotatePoints(p, 90, { x: 0, y: 0 });
  return polys;
}

// ─── Fuling (腹灵) stabilizer cutout ────────────────────
// 依据 L:\k星工作室\标准文件\定位板腹灵开孔.dxf 反推：
//  · 2u/2.75u：2u 画法（stab 上下边缘开槽与轴孔相连）
//  · ≥3u：大键画法（stab 体 + 中间横槽连到轴孔）
//  · 孔位（中心距）沿用 Cherry 标准 getStabOffset；顶点相对轴心（已含 offset）。

/** 大键 FL 轮廓（≥3u）：右半 + 镜像左半 + 连接横槽 */
function flLargeShape(offset: number): { x: number; y: number }[][] {
  const right: [number, number][] = [
    [offset - 3.95, -5.50], [offset - 3.95, 6.80], [offset - 2.15, 6.80],
    [offset - 2.15, 8.00], [offset + 0.95, 8.00], [offset + 0.95, 6.80],
    [offset + 2.75, 6.80], [offset + 2.75, 0.75], [offset + 3.95, 0.75],
    [offset + 3.95, -2.75], [offset + 2.75, -2.75], [offset + 2.75, -5.50],
  ];
  const chanR: [number, number][] = [
    [7, -2.50], [offset - 2.0, -2.50], [offset - 2.0, 2.00], [7, 2.00],
  ];
  const mirror = (p: [number, number][]): [number, number][] => p.map(([x, y]) => [-x, y]);
  const toPts = (p: [number, number][]) => p.map(([x, y]) => ({ x, y }));
  return [toPts(right), toPts(mirror(right)), toPts(chanR), toPts(mirror(chanR))];
}

/** 2u FL 轮廓：右半 + 镜像左半（连接台阶在 stab 上下边缘） */
function fl2uShape(offset: number): { x: number; y: number }[][] {
  const sw = 6; // 略伸入轴孔（轴孔边缘 x=7），确保布尔合并
  const right: [number, number][] = [
    [sw, 5.30], [offset - 3.95, 5.30], [offset - 3.95, 6.80], [offset - 2.15, 6.80],
    [offset - 2.15, 8.00], [offset + 0.95, 8.00], [offset + 0.95, 6.80], [offset + 2.75, 6.80],
    [offset + 2.75, 0.75], [offset + 3.95, 0.75], [offset + 3.95, -2.75], [offset + 2.75, -2.75],
    [offset + 2.75, -5.50], [offset - 3.95, -5.50], [offset - 3.95, -4.00], [sw, -4.00],
  ];
  const mirror = (p: [number, number][]): [number, number][] => p.map(([x, y]) => [-x, y]);
  const toPts = (p: [number, number][]) => p.map(([x, y]) => ({ x, y }));
  return [toPts(right), toPts(mirror(right))];
}

function getFulingStabPolygon(
  offset: number, kerfHalf: number, isTall: boolean, stabSize: number,
): { x: number; y: number }[][] {
  const raw = stabSize < 3 ? fl2uShape(offset) : flLargeShape(offset);
  const polys = raw.map((p) => offsetPolygonOutward(p, kerfHalf));
  if (isTall) for (const p of polys) rotatePoints(p, 90, { x: 0, y: 0 });
  return polys;
}

// ─── 轴间棉（foam）卫星轴孔：矩形 + 顶部连接横槽 ─────────

/**
 * 轴间棉专用卫星轴孔：把复杂的 Cherry/Costar/Fuling 多边形简化为
 * 两个矩形（取当前复杂多边形的最大外边界），并加一条上移到
 * 轴孔顶部（y = -7）的横向连接槽，使轴孔与两侧卫星轴孔连通。
 */
function getFoamStabPolygons(
  offset: number, kerfHalf: number, isTall: boolean,
): { x: number; y: number }[][] {
  const o = kerfHalf;
  // 矩形外边界：顶部与轴孔/横槽顶部(-7)齐平，避免台阶
  const outerEdge = 3.375; // 靠近轴孔一侧
  const innerEdge = 4.2;   // 外侧
  const top = -7;
  const bot = 7.75;

  const rightRect = [
    { x: offset - outerEdge - o, y: top - o },
    { x: offset + innerEdge + o, y: top - o },
    { x: offset + innerEdge + o, y: bot + o },
    { x: offset - outerEdge - o, y: bot + o },
  ];
  const leftRect = [
    { x: -offset - innerEdge - o, y: top - o },
    { x: -offset + outerEdge + o, y: top - o },
    { x: -offset + outerEdge + o, y: bot + o },
    { x: -offset - innerEdge - o, y: bot + o },
  ];
  // 连接横槽：顶部与轴孔/卫星轴孔顶部齐平，高度 4mm，横向连通两侧矩形与轴孔
  const barTop = -7 - o;
  const barBot = barTop + 4;
  const bar = [
    { x: -offset + outerEdge + o, y: barTop },
    { x: offset - outerEdge - o, y: barTop },
    { x: offset - outerEdge - o, y: barBot },
    { x: -offset + outerEdge + o, y: barBot },
  ];

  const polys = [rightRect, leftRect, bar];
  if (isTall) for (const p of polys) rotatePoints(p, 90, { x: 0, y: 0 });
  return polys;
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

/** Boolean union of multiple polygons (single clipping op) */
function unionAll(polys: { x: number; y: number }[][]): { x: number; y: number }[][] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return [polys[0]!];
  const [first, ...rest] = polys;
  const result = polygonClipping.union(pathToMP(first!), ...rest.map((p) => pathToMP(p)));
  return mpToPaths(result);
}

/** 有向面积的 2 倍（>0 = CCW）。用于判定轮廓的内/外侧。 */
function ringArea2(poly: { x: number; y: number }[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/**
 * 短边开槽（须在圆角之前调用）：
 * 对挖孔轮廓中长度 < minFeature(mm) 的短边 E，沿其法线朝**材料侧**并入一个矩形槽 ——
 * 槽宽 = 该短边长度；槽长 = 两侧相邻「垂边」中**较短**者。
 *
 * 槽长必须取较短者：垂边是槽延伸方向上最先遇到的边界，取较长者会让槽越过近端垂边、
 * 朝远端多切一大段，事后在近端留下更细的 <minFeature 边（表现为大量细小间隔）。
 * 一次开槽后可能又生出新的 <minFeature 短边，故反复迭代直至收敛（实测 ≤3 轮）。
 */
function slotShortEdgesOnce(
  polys: { x: number; y: number }[][],
  minFeature: number,
  clipMP: ClipPoly[] | null,
): { polys: { x: number; y: number }[][]; changed: boolean } {
  const slots: { x: number; y: number }[][] = [];
  const EPS = 0.02;
  for (const poly of polys) {
    const n = poly.length;
    if (n < 3) continue;
    const ccw = ringArea2(poly) > 0; // 外环 CCW；内环 CW
    for (let i = 0; i < n; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % n]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len <= 1e-6 || len >= minFeature) continue;
      const prev = poly[(i - 1 + n) % n]!;
      const next = poly[(i + 2) % n]!;
      // 垂边（相邻边）：取较短者作为槽长 → 槽停在最近的垂边处，不越界
      const adjLen = Math.min(Math.hypot(a.x - prev.x, a.y - prev.y), Math.hypot(next.x - b.x, next.y - b.y));
      if (adjLen <= 1e-6) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      // 材料侧法线：CCW 外环外部在右法线；CW 内环外部在左法线
      const ox = ccw ? uy : -uy;
      const oy = ccw ? -ux : ux;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const hw = len / 2;
      slots.push([
        { x: cx - ux * hw - ox * EPS, y: cy - uy * hw - oy * EPS },
        { x: cx + ux * hw - ox * EPS, y: cy + uy * hw - oy * EPS },
        { x: cx + ux * hw + ox * adjLen, y: cy + uy * hw + oy * adjLen },
        { x: cx - ux * hw + ox * adjLen, y: cy - uy * hw + oy * adjLen },
      ]);
    }
  }
  if (slots.length === 0) return { polys, changed: false };
  // 槽必须保持在 clipMP（本键组包围盒）内，避免开槽贯通到不相交的相邻按键区
  let use = slots;
  if (clipMP) {
    use = [];
    for (const s of slots) {
      for (const r of mpToPaths(polygonClipping.intersection(pathToMP(s), clipMP))) {
        if (r.length >= 3) use.push(r);
      }
    }
    if (use.length === 0) return { polys, changed: false };
  }
  return { polys: unionAll([...polys, ...use]), changed: true };
}

/** 反复短边开槽直至无 <minFeature 短边（或达到迭代上限）。clipBox 限定槽的范围。 */
function slotShortEdges(
  polys: { x: number; y: number }[][],
  minFeature: number,
  clipBox?: { minX: number; minY: number; maxX: number; maxY: number },
): { x: number; y: number }[][] {
  if (minFeature <= 0) return polys;
  let clipMP: ClipPoly[] | null = null;
  if (clipBox) {
    const ring: ClipRing = [
      [clipBox.minX, clipBox.minY],
      [clipBox.maxX, clipBox.minY],
      [clipBox.maxX, clipBox.maxY],
      [clipBox.minX, clipBox.maxY],
      [clipBox.minX, clipBox.minY],
    ];
    clipMP = [[ring]];
  }
  let cur = polys;
  for (let iter = 0; iter < 8; iter++) {
    const r = slotShortEdgesOnce(cur, minFeature, clipMP);
    if (!r.changed) break;
    cur = r.polys;
  }
  return cur;
}

/** 一组多边形的包围盒 */
function bboxOf(polys: { x: number; y: number }[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const p of poly) {
    if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** 两组多边形是否有实际重叠（bbox 粗筛 + 精确求交，面积 > 0） */
function groupsOverlap(a: { x: number; y: number }[][], b: { x: number; y: number }[][]): boolean {
  const ba = bboxOf(a), bb = bboxOf(b);
  if (ba.maxX <= bb.minX + 1e-6 || bb.maxX <= ba.minX + 1e-6) return false;
  if (ba.maxY <= bb.minY + 1e-6 || bb.maxY <= ba.minY + 1e-6) return false;
  const geoms = [...a.map(pathToMP), ...b.map(pathToMP)];
  const inter = polygonClipping.intersection(geoms[0]!, ...geoms.slice(1));
  let area = 0;
  for (const poly of inter) for (const ring of poly) area += Math.abs(ringArea2(ring.map(([x, y]) => ({ x, y }))));
  return area > 0.01;
}

/**
 * 跨键合并 + 短边开槽清理。
 * 先把**相互重叠的键**聚成连通分量，分量内合并各键挖孔后开槽；槽体被限制在该分量包围盒内 ——
 * 因此只会消除「本键与其相交键」之间的 <minFeature 短边，不会贯通到不相交的其他按键区。
 */
function cleanMergeComponents(
  groups: { x: number; y: number }[][][],
  minFeature: number,
): { x: number; y: number }[][] {
  if (groups.length === 0) return [];
  if (minFeature <= 0) return unionAll(groups.flat());
  const n = groups.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]!]!; x = parent[x]!; } return x; };
  const uni = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (groupsOverlap(groups[i]!, groups[j]!)) uni(i, j);
  const comps = new Map<number, { x: number; y: number }[][]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const c = comps.get(r);
    if (c) c.push(...groups[i]!); else comps.set(r, [...groups[i]!]);
  }
  const results: { x: number; y: number }[][] = [];
  const PAD = 0.5;
  for (const polys of comps.values()) {
    const merged = unionAll(polys);
    if (merged.length === 0) continue;
    const box = bboxOf(merged);
    results.push(...slotShortEdges(merged, minFeature, { minX: box.minX - PAD, minY: box.minY - PAD, maxX: box.maxX + PAD, maxY: box.maxY + PAD }));
  }
  return unionAll(results);
}

/** 把多边形每个顶点替换为半径 r 的圆角（用折线近似圆弧；凸/凹角均适用） */
export function filletPolygon(
  pts: { x: number; y: number }[], r: number, segments = 4,
): { x: number; y: number }[] {
  if (r <= 0 || pts.length < 3) return pts;
  // 去除重复/首尾闭合点（否则重合顶点会被当作零长边而漏掉圆角）
  const v: { x: number; y: number }[] = [];
  for (const p of pts) {
    const q = v[v.length - 1];
    if (!q || Math.hypot(p.x - q.x, p.y - q.y) > 1e-6) v.push(p);
  }
  while (v.length > 1 && Math.hypot(v[0]!.x - v[v.length - 1]!.x, v[0]!.y - v[v.length - 1]!.y) <= 1e-6) v.pop();
  const n = v.length;
  if (n < 3) return pts;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const cur = v[i]!;
    const prev = v[(i - 1 + n) % n]!;
    const next = v[(i + 1) % n]!;
    let e1x = prev.x - cur.x, e1y = prev.y - cur.y;
    let e2x = next.x - cur.x, e2y = next.y - cur.y;
    const l1 = Math.hypot(e1x, e1y), l2 = Math.hypot(e2x, e2y);
    if (l1 < 1e-9 || l2 < 1e-9) { out.push(cur); continue; }
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const theta = Math.acos(Math.max(-1, Math.min(1, e1x * e2x + e1y * e2y)));
    if (theta < 1e-4 || theta > Math.PI - 1e-4) { out.push(cur); continue; } // 共线
    const t = Math.min(r / Math.tan(theta / 2), l1 / 2, l2 / 2);
    if (t <= 1e-9) { out.push(cur); continue; }
    const p1 = { x: cur.x + e1x * t, y: cur.y + e1y * t };
    const p2 = { x: cur.x + e2x * t, y: cur.y + e2y * t };
    let bx = e1x + e2x, by = e1y + e2y;
    const bl = Math.hypot(bx, by);
    if (bl < 1e-9) { out.push(cur); continue; }
    bx /= bl; by /= bl;
    const d = r / Math.sin(theta / 2);
    const ccx = cur.x + bx * d, ccy = cur.y + by * d;
    const a1 = Math.atan2(p1.y - ccy, p1.x - ccx);
    const a2 = Math.atan2(p2.y - ccy, p2.x - ccx);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    out.push(p1);
    for (let s = 1; s < segments; s++) {
      const a = a1 + da * (s / segments);
      out.push({ x: ccx + r * Math.cos(a), y: ccy + r * Math.sin(a) });
    }
    out.push(p2);
  }
  return out;
}

// ─── Main plate generation ──────────────────────────────

export function generatePlate(
  layout: KLELayout,
  config?: Partial<PlateConfig>,
  rotationOverrides?: PlateRotationOverrides,
  options?: PlateGenOptions,
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
    /** 阶梯键 (KLE `l`)，轴孔相对几何中心左移 0.25u */
    stepped: boolean;
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
      keyInfos.push({ cx, cy, kw: actualW, kh: actualH, rx, ry, rot: k.r || 0, isTall, stepped: !!k.l, visualCx, visualCy });
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
  /** 每个键合并后的挖孔（按键分组，供按「相交键组」清理短边用） */
  const keyHoleGroups: { x: number; y: number }[][][] = [];
  const compatKeyGroups: { x: number; y: number }[][][] = [];
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

    // 阶梯键 (KLE `l`)：轴孔相对键帽几何中心左移 0.25u（同 builder.swillkb）
    if (ki.stepped) translatePoints(swPts, -0.25 * U, 0);

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
    const needStab = stabSize >= 2 && cfg.stabType > 0 && cfg.stabType <= 3;

    if (needStab) {
      const stabOffset = getStabOffset(stabSize);
      if (stabOffset !== null) {
        const place = (path: { x: number; y: number }[]) => {
          translatePoints(path, ki.cx, ki.cy);
          if (ki.rot !== 0) {
            const ro = (ki.rx !== 0 || ki.ry !== 0) ? { x: ki.rx, y: ki.ry } : { x: ki.cx, y: ki.cy };
            rotatePoints(path, ki.rot, ro);
          }
          keyPolys.push(path);
        };
        if (options?.foamStab) {
          for (const path of getFoamStabPolygons(stabOffset, kerfHalf, ki.isTall)) place(path);
        } else if (cfg.stabType === 3) {
          // FL 腹灵
          for (const path of getFulingStabPolygon(stabOffset, kerfHalf, ki.isTall, stabSize)) place(path);
        } else if (cfg.stabType === 2) {
          // PCB stab
          for (const path of getPCBStabPolygons(stabOffset, kerfHalf, ki.isTall)) place(path);
        } else {
          // Cherry only
          place(getStabPolygonCherry(stabOffset, kerfHalf, ki.isTall));
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
      totalCutLen += polygonPerimeter(poly);
    }
    keyHoleGroups.push(merged);
    if (options?.compatKeyIndices?.has(keyIndex)) compatKeyGroups.push(merged);

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

  // 跨键合并 + 短边开槽清理（按「相交键组」进行，槽不越出本键组包围盒）
  const allMergedHoles = cleanMergeComponents(keyHoleGroups, options?.minFeature ?? 0);

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

  const outerR = cfg.fillet > 0 ? cfg.fillet : 0;

  // 「圆角」：对所有挖孔（外框以外的图形）施加圆角
  const holeR = options?.holeFillet ?? 0;
  const holesFinal = holeR > 0
    ? allMergedHoles.map((poly) => filletPolygon(poly, holeR, 4))
    : allMergedHoles;

  // 兼容层：兼容键的挖孔合并后以浅灰重绘（仅 SVG 预览，不影响 DXF/STP）
  const compatMerged = cleanMergeComponents(compatKeyGroups, options?.minFeature ?? 0);
  const compatFinal = holeR > 0
    ? compatMerged.map((poly) => filletPolygon(poly, holeR, 4))
    : compatMerged;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path{vector-effect:non-scaling-stroke}</style>
  <rect x="${pad}" y="${pad}" width="${plateW}" height="${plateH}" rx="${outerR}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>
  <g fill="#fff" stroke="#888" stroke-width="0.3">`;

  for (const hole of holesFinal) {
    svg += `<path d="${ptsToPath(hole)}"/>`;
  }
  svg += `</g>`;

  if (compatFinal.length > 0) {
    svg += `
  <g fill="lightgray" stroke="#888" stroke-width="0.3">`;
    for (const hole of compatFinal) {
      svg += `<path d="${ptsToPath(hole)}"/>`;
    }
    svg += `</g>`;
  }

  svg += `
</svg>`;

  // ── DXF generation ──
  const dxf = buildDXF(holesFinal, plateW, plateH, outerR, minX, minY, pad, keys.length, (meta.name || "").replace(/[<>"']/g, ""));

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
    polyHoles: holesFinal.map((poly) => poly.map((p) => [p.x, -p.y])),
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

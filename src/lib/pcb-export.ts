/**
 * PCB Drawing Engine
 *
 * Generates keyboard PCB (mounting hole pattern) SVGs directly from KLE layout data.
 * Based on kindlestar-pcba-shopify CAD preview pattern, refactored for React.
 *
 * Features:
 * - Three solder types: 热插拔 (hotswap), 焊接 (solder/THT), 磁轴 (magnetic)
 * - MX-compatible switch hole patterns
 * - Stabilizer cutouts (Cherry/Costar style)
 * - Configurable edge distance
 * - SVG preview
 * - DXF export
 */

import type { KLELayout } from "./kle-types";
import type { StpExtrudeData, ModelPlacement } from "./stp-export";
import { getStabOffset } from "./stab-offsets";
import { rotatePoint, computeLayoutBBoxInUnits } from "./coordinate-system";
import { TYPEC_ICON, TYPEC_HOLES, MCU_ICON } from "./component-icons";
import polygonClipping from "polygon-clipping";

// ─── Hole boolean-union helpers (跨键合并重叠钻孔) ────────

type Pt2 = [number, number];
type ClipRing = Pt2[];
type ClipPoly = ClipRing[];

/** 一个钻孔圆（cx/cy 为 SVG 视口坐标；sX/sY 为 STP 绝对 mm 坐标） */
interface HoleCircle { cx: number; cy: number; r: number; sX: number; sY: number }

function pathToMP(pts: Pt2[]): ClipPoly[] {
  if (pts.length < 2) return [];
  return [[pts.map((p) => [p[0], p[1]] as Pt2)]];
}
function mpToPaths(mp: ClipPoly[]): Pt2[][] {
  const out: Pt2[][] = [];
  for (const poly of mp) {
    for (const ring of poly) {
      const path = ring.map(([x, y]) => [x, y] as Pt2);
      if (path.length > 2) out.push(path);
    }
  }
  return out;
}
/** 多个多边形单次布尔并集 */
function unionPolys(polys: Pt2[][]): Pt2[][] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return [polys[0]!];
  const [first, ...rest] = polys;
  const res = polygonClipping.union(pathToMP(first!), ...rest.map((p) => pathToMP(p)));
  return mpToPaths(res);
}
/** 圆 → 多边形（N 边形近似） */
function circleToPoly(cx: number, cy: number, r: number, seg = 32): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
/** 若环是一个正圆（所有顶点到圆心等距）则还原为圆，否则返回 null */
function circleFromRing(ring: Pt2[]): { cx: number; cy: number; r: number } | null {
  // 去掉重复/首尾闭合点，否则质心偏移会误判为非圆
  const v: Pt2[] = [];
  for (const p of ring) {
    const q = v[v.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) v.push(p);
  }
  while (v.length > 1 && Math.hypot(v[0]![0] - v[v.length - 1]![0], v[0]![1] - v[v.length - 1]![1]) <= 1e-6) v.pop();
  if (v.length < 8) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of v) { sx += x; sy += y; }
  const cx = sx / v.length, cy = sy / v.length;
  let r = 0;
  for (const [x, y] of v) r += Math.hypot(x - cx, y - cy);
  r /= v.length;
  if (r < 1e-6) return null;
  for (const [x, y] of v) if (Math.abs(Math.hypot(x - cx, y - cy) - r) > 1e-3) return null;
  return { cx, cy, r };
}
function ringPathD(pts: Pt2[]): string {
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`).join("") + "Z";
}

// ─── Types ──────────────────────────────────────────────

export type SolderType = "socket" | "sunken" | "stepped";

export interface PCBConfig {
  /** Solder type: socket=热插拔, sunken=沉板(焊接), stepped=梯孔(磁轴) */
  solderType: SolderType;
  /** Include stabilizer holes */
  needStab: boolean;
  /** Include switch LED square hole */
  needLed: boolean;
  /** Edge distance from nearest switch hole to board edge (mm) */
  edgeDistance: number;
  /** 「外框圆角」：PCB 板框四角圆角半径 (mm, 0 = 直角) */
  outerFillet?: number;
  /** Include Type-C connector model (STP only) */
  needTypeC: boolean;
  /** Include 4P connector model (STP only) */
  need4P: boolean;
  /** Include MCU model (STP only) */
  needMCU: boolean;
  /** Type-C position X (mm from board left) */
  typeCX: number;
  /** Type-C position Y (mm from board top) */
  typeCY: number;
  /** 4P connector position X (mm from board left) */
  fourPX: number;
  /** 4P connector position Y (mm from board top) */
  fourPY: number;
  /** MCU position X (mm from board left) */
  mcuX: number;
  /** MCU position Y (mm from board top) */
  mcuY: number;
  /** Type-C rotation (degrees, around own center Z) */
  typeCRot: number;
  /** 4P rotation (degrees, around own center Z) */
  fourPRot: number;
  /** MCU rotation (degrees, around own center Z) */
  mcuRot: number;
}

// ─── Interactive preview types ──────────────────────────

export interface PCBPreviewRegion {
  /** Unique id, e.g. "switch-0" or "stab-0" */
  id: string;
  /** Index into keyInfos */
  keyIndex: number;
  /** 'switch' = switch holes group (5 holes + LED), 'stab' = stabilizer hole group (4 holes) */
  type: "switch" | "stab";
  /** Bounding box in SVG viewport coordinates */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation centre in SVG viewport coordinates */
  centerX: number;
  centerY: number;
}

/** Region-id → rotation angle in degrees for the switch hole group */
export interface PCBSwitchRotations {
  [id: string]: number;
}

/** Region-id → rotation angle in degrees for the stabilizer hole group */
export interface PCBStabRotations {
  [id: string]: number;
}

export interface PCBComponentRegion {
  /** Unique id, e.g. "type-c" or "4p" */
  id: string;
  /** 'typec' or '4p' */
  type: "typec" | "4p" | "mcu";
  /** Bounding box in SVG viewport coordinates */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Position in absolute mm (Y-up, for STP) */
  absX: number;
  absY: number;
}

export interface PCBResult {
  svg: string;
  dxf: string;
  /** Board width in mm */
  width: number;
  /** Board height in mm */
  height: number;
  /** Number of non-decal keys */
  keyCount: number;
  /** Number of stabilizer positions */
  stabCount: number;
  /**
   * 3D 挤出几何数据 —— 供 stp-export 使用。
   * 所有坐标均为绝对 mm。PCB 厚度为 1.6mm，由调用方指定。
   */
  stpData: StpExtrudeData | null;
  /** Hit-test regions for switch hole groups (interactive preview) */
  switchRegions: PCBPreviewRegion[];
  /** Hit-test regions for stabilizer hole groups (interactive preview) */
  stabRegions: PCBPreviewRegion[];
  /** Hit-test regions for Type-C / 4P connector outlines */
  componentRegions: PCBComponentRegion[];
}

// ─── Constants ──────────────────────────────────────────

const U = 19.05; // Standard key unit in mm
const MX_CENTER_R = 2; // Center switch hole radius (mm)
const MX_OFFSET_R = 0.85; // Small offset hole radius

// Hotswap radii: same as THT but top holes enlarged to 3mm dia (r=1.5)
const SOCKET_RADII = [MX_CENTER_R, MX_OFFSET_R, MX_OFFSET_R, 1.5, 1.5];

// Solder/THT hole pattern (relative to key center)
interface Offset { x: number; y: number }

const THT_HOLES: Offset[] = [
  { x: 0, y: 0 },           // Center (4mm dia -> r=2)
  { x: -5.08, y: 0 },       // Left (1.7mm dia -> r=0.85)
  { x: 5.08, y: 0 },        // Right (1.7mm dia -> r=0.85)
  { x: -3.81, y: -2.54 },   // Top-left (1.5mm dia -> r=0.75)
  { x: 2.54, y: -5.08 },    // Top-right (1.5mm dia -> r=0.75)
];
const THT_RADII = [MX_CENTER_R, MX_OFFSET_R, MX_OFFSET_R, 0.75, 0.75];

// Stepped (magnetic) uses center + side holes only (no top holes)
const MAGNETIC_HOLES: Offset[] = [
  { x: 0, y: 0 },           // Center (3.6mm -> r=1.8)
  { x: -5.08, y: 0 },       // Left (1.7mm -> r=0.85)
  { x: 5.08, y: 0 },        // Right (1.7mm -> r=0.85)
];
const MAGNETIC_RADII = [1.8, 0.85, 0.85];

// ─── 2D helpers ─────────────────────────────────────────

/** Convert relative-to-center outline to SVG polygon points string */
function outlinePoints(outline: [number, number][], cx: number, cy: number): string {
  return outline.map(([dx, dy]) => `${(cx + dx).toFixed(3)},${(cy + dy).toFixed(3)}`).join(' ');
}

// ═══════════════════════════════════════════════════════════════════
// 3D 模型 Z 轴俯视外轮廓 (从 STP 文件 XY 投影凸包提取)
// 坐标相对模型中心, SVG 坐标系 (Y 向下)
// ═══════════════════════════════════════════════════════════════════

/// 4P JST 连接器外轮廓 (D 形, 取自 DXF, 中心化坐标)
const FOURP_OUTLINE: [number, number][] = [
  [-2.177, -2.520], [2.177, -2.520], [2.177, -2.821], [3.439, -2.821],
  [3.439, -0.936],  [3.088, -0.936], [3.088, 1.994],  [1.834, 1.994],
  [1.834, 2.821],   [1.161, 2.821],  [1.161, 1.994],  [0.838, 1.994],
  [0.838, 2.821],   [0.165, 2.821],  [0.165, 1.994],  [-0.160, 1.994],
  [-0.160, 2.821],  [-0.833, 2.821], [-0.833, 1.994], [-1.165, 1.994],
  [-1.165, 2.821],  [-1.839, 2.821], [-1.839, 1.994], [-3.146, 1.994],
  [-3.146, -0.936], [-3.439, -0.936], [-3.439, -2.821], [-2.177, -2.821],
  [-2.177, -2.520],
];

/// 椭圆角圆角矩形 → 多边形 (画稿原始单位, 0.01mm; Y 向下)
/// 用于 Type-C 4 个「跑道圆」挖孔 (rx/ry 为椭圆角半径)
function roundedRectPoly(
  x: number, y: number, w: number, h: number, rx: number, ry: number, seg = 8,
): [number, number][] {
  const RX = Math.min(rx, w / 2), RY = Math.min(ry, h / 2);
  const pts: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      pts.push([cx + RX * Math.cos(a), cy + RY * Math.sin(a)]);
    }
  };
  arc(x + w - RX, y + RY, -Math.PI / 2, 0);        // 右上
  arc(x + w - RX, y + h - RY, 0, Math.PI / 2);     // 右下
  arc(x + RX, y + h - RY, Math.PI / 2, Math.PI);   // 左下
  arc(x + RX, y + RY, Math.PI, Math.PI * 1.5);     // 左上
  return pts;
}

// ─── Hotswap 轴座挖孔 (据用户 DXF drw0004.dxf) ─────────────
// 挖孔外形 = 圆角矩形 (键中心相对坐标, SVG Y 向下);
// DXF 中的 5 个圆 (r2 中心 / 2×r1.5 / 2×r0.85) 是轴孔对位基准, 挖孔时剔除, 不参与切割。
const HOTSWAP_CUT = { x0: -8.16, y0: -7.043, x1: 6.89, y1: 2.3, r: 1.0 };

/** hotswap 挖孔多边形 (圆角矩形, 键中心相对坐标)。r 缺省取 HOTSWAP_CUT.r，可由「圆角」控制。 */
function hotswapCutout(r = HOTSWAP_CUT.r, seg = 6): [number, number][] {
  const { x0, y0, x1, y1 } = HOTSWAP_CUT;
  const R = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const pts: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
  };
  arc(x1 - R, y0 + R, -Math.PI / 2, 0);        // 右上
  arc(x1 - R, y1 - R, 0, Math.PI / 2);         // 右下
  arc(x0 + R, y1 - R, Math.PI / 2, Math.PI);   // 左下
  arc(x0 + R, y0 + R, Math.PI, Math.PI * 1.5); // 左上
  return pts;
}

// ─── 自定义圆角矩形挖孔 (底棉矩形编辑器) ─────────────────

export interface CustomRect {
  /** 中心 (绝对 mm, Y 向下) */
  cx: number; cy: number;
  w: number; h: number;
  /** 圆角半径 (mm) */
  r: number;
  /** 旋转角度 (度) */
  rot: number;
}

/** 生成圆角矩形多边形 (中心 cx,cy; 可旋转; 绝对 mm) */
export function roundedRectPolygon(cx: number, cy: number, w: number, h: number, r: number, rot = 0, seg = 6): [number, number][] {
  const hw = w / 2, hh = h / 2, R = Math.min(Math.max(r, 0), hw, hh);
  const local: [number, number][] = [];
  const arc = (ax: number, ay: number, a0: number, a1: number) => {
    for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * (i / seg); local.push([ax + R * Math.cos(a), ay + R * Math.sin(a)]); }
  };
  arc(hw - R, -hh + R, -Math.PI / 2, 0);
  arc(hw - R, hh - R, 0, Math.PI / 2);
  arc(-hw + R, hh - R, Math.PI / 2, Math.PI);
  arc(-hw + R, -hh + R, Math.PI, Math.PI * 1.5);
  return local.map(([dx, dy]) => {
    const rr = rot % 360 !== 0 ? rotatePoint({ x: dx, y: dy }, rot, { x: 0, y: 0 }) : { x: dx, y: dy };
    return [cx + rr.x, cy + rr.y] as [number, number];
  });
}

// ─── Main PCB generation ────────────────────────────────


// ─── M3 抽取：计算键位位置和边界 ──────────────────────────

interface KeyInfo {
  cx: number; cy: number; kw: number; kh: number;
  rot: number; rx: number; ry: number; isTall: boolean;
  hasStab: boolean;
  /** Visual center after KLE cluster rotation (mm) */
  visualCx: number; visualCy: number;
  /** Switch footprint center (mm)：阶梯键 (l) 相对视觉中心左移 0.25u，其余同 visual */
  swCx: number; swCy: number;
}

function computePCBKeyPositions(
  keys: import("./kle-types").KeyProps[],
  config: PCBConfig, U: number,
): { keyInfos: KeyInfo[]; holeMinX: number; holeMinY: number; holeMaxX: number; holeMaxY: number; stabCount: number } {
  const keyInfos: KeyInfo[] = [];
  let holeMinX = Infinity, holeMinY = Infinity, holeMaxX = -Infinity, holeMaxY = -Infinity;
  let stabCount = 0;

  for (const k of keys) {
    if (k.d) continue;
    const kw = k.w || 1;
    const kh = k.h || 1;
    let actualW = kw, actualH = kh;
    let cx = (k.x + kw / 2) * U;
    let cy = (k.y + kh / 2) * U;

    if ((k.w2 || 0) > 0 && (k.h2 || 0) > 0 && ((k.x2 || 0) !== 0 || (k.y2 || 0) !== 0)) {
      const extRight = k.x + (k.x2 || 0) + (k.w2 || 0);
      const extBottom = k.y + (k.y2 || 0) + (k.h2 || 0);
      actualW = Math.max(kw, extRight - k.x);
      actualH = Math.max(kh, extBottom - k.y);
      cx = (k.x + actualW / 2) * U;
      cy = (k.y + actualH / 2) * U;
    }

    const isTall = actualH > actualW;
    const size = isTall ? actualH : actualW;
    const hasStab = config.needStab && size >= 2;
    if (hasStab) stabCount++;

    // 旋转后视觉中心——绕 cluster rotation origin 旋转后的实际位置
    const rot = k.r || 0;
    const rx = (k.rx || 0) * U;
    const ry = (k.ry || 0) * U;
    let visualCx = cx, visualCy = cy;
    if (rot % 360 !== 0) {
      const rotOriginX = (rx !== 0 || ry !== 0) ? rx : cx;
      const rotOriginY = (rx !== 0 || ry !== 0) ? ry : cy;
      const vc = rotatePoint({ x: cx, y: cy }, rot, { x: rotOriginX, y: rotOriginY });
      visualCx = vc.x;
      visualCy = vc.y;
    }

    // 使用视觉中心计算孔位边界
    const halfW = (actualW * U) / 2;
    const halfH = (actualH * U) / 2;
    if (visualCx - halfW - config.edgeDistance < holeMinX) holeMinX = visualCx - halfW - config.edgeDistance;
    if (visualCy - halfH - config.edgeDistance < holeMinY) holeMinY = visualCy - halfH - config.edgeDistance;
    if (visualCx + halfW + config.edgeDistance > holeMaxX) holeMaxX = visualCx + halfW + config.edgeDistance;
    if (visualCy + halfH + config.edgeDistance > holeMaxY) holeMaxY = visualCy + halfH + config.edgeDistance;

    // 开关焊盘/轴座中心：阶梯键 (KLE `l`) 相对视觉中心左移 0.25u（同 builder.swillkb）
    let swCx = visualCx, swCy = visualCy;
    if (k.l) {
      let sox = -0.25 * U, soy = 0;
      if (isTall) { const t = sox; sox = -soy; soy = t; }
      if (rot % 360 !== 0) { const r = rotatePoint({ x: sox, y: soy }, rot, { x: 0, y: 0 }); sox = r.x; soy = r.y; }
      swCx += sox; swCy += soy;
    }

    keyInfos.push({
      cx, cy, kw: actualW, kh: actualH,
      rot, rx, ry, isTall, hasStab, visualCx, visualCy, swCx, swCy,
    });
  }

  return { keyInfos, holeMinX, holeMinY, holeMaxX, holeMaxY, stabCount };
}

/** 由键孔位边界计算 PCB 成品板框尺寸（mm）—— 计价器与 PCB 编辑器共用的唯一板框数据源 */
function computePCBBoundsFromExtents(
  keys: import("./kle-types").KeyProps[],
  config: PCBConfig, edge: number,
  holeMinX: number, holeMinY: number, holeMaxX: number, holeMaxY: number,
): { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number } {
  // 旋转感知边界——用于板框大小（扩大板框以覆盖旋转键的角点）
  const bboxKu = computeLayoutBBoxInUnits(keys);
  const boardMinX = Math.min(holeMinX, bboxKu.minX * U - edge);
  const boardMinY = Math.min(holeMinY, bboxKu.minY * U - edge);
  const boardMaxX = Math.max(holeMaxX, bboxKu.maxX * U + edge);
  const boardMaxY = Math.max(holeMaxY, bboxKu.maxY * U + edge);
  // 扩展板框以包含组件（Type-C 故意排除——伸出板边）
  const expanded = expandPCBComponentBoundary(config, edge, boardMinX, boardMinY, boardMaxX, boardMaxY);
  return {
    width: expanded.maxX - expanded.minX,
    height: expanded.maxY - expanded.minY,
    minX: expanded.minX, minY: expanded.minY,
    maxX: expanded.maxX, maxY: expanded.maxY,
  };
}

/**
 * 计算 PCB 成品板框尺寸（mm）—— 计价「从 PCB 编辑器取尺寸」的唯一数据源。
 * 与 generatePCB 的 boardW/boardH 完全一致（含边距、旋转感知边界、组件扩展）。空配列返回 null。
 */
export function computePCBBounds(
  layout: KLELayout,
  config: PCBConfig,
): { width: number; height: number } | null {
  const { keys } = layout;
  if (keys.length === 0) return null;
  const { holeMinX, holeMinY, holeMaxX, holeMaxY } = computePCBKeyPositions(keys, config, U);
  return computePCBBoundsFromExtents(keys, config, config.edgeDistance, holeMinX, holeMinY, holeMaxX, holeMaxY);
}

// ─── 轴下垫几何（从 PCB 配置派生，绝对 mm，Y 向下） ─────────

export interface SwitchPadGeometry {
  /** 开关孔 + 卫星轴孔（绝对 mm，Y 向下） */
  circles: { x: number; y: number; r: number }[];
  /** LED 方孔等多边形（绝对 mm，Y 向下） */
  polys: [number, number][][];
  /** 片材包围盒（含 Edge Distance），绝对 mm */
  minX: number; minY: number; maxX: number; maxY: number;
  /** 兼容层：兼容键的孔（浅灰重绘用） */
  compatCircles?: { x: number; y: number; r: number }[];
  compatPolys?: [number, number][][];
}

/**
 * 轴下垫孔位：按 PCB 配置派生开关孔/卫星轴孔/LED 方孔。
 *  - socket（热插拔）轴体上方两个 3mm 大圆 → 1mm 直径
 *  - 不含 4P/TypeC/MCU
 *  - 片材边界 = 键位包围盒 + Edge Distance
 */
export function computeSwitchPadGeometry(
  layout: KLELayout,
  opts: { solderType: SolderType; needStab: boolean; needLed: boolean; edgeDistance: number },
  switchRotations?: PCBSwitchRotations,
  stabRotations?: PCBStabRotations,
  compatKeyIndices?: Set<number>,
): SwitchPadGeometry {
  const circles: { x: number; y: number; r: number }[] = [];
  const polys: [number, number][][] = [];
  const compatCircles: { x: number; y: number; r: number }[] = [];
  const compatPolys: [number, number][][] = [];
  const { keys } = layout;
  if (keys.length === 0) return { circles, polys, compatCircles, compatPolys, minX: 0, minY: 0, maxX: 0, maxY: 0 };

  const posConfig: PCBConfig = {
    solderType: opts.solderType, needStab: opts.needStab, needLed: opts.needLed,
    edgeDistance: opts.edgeDistance,
    needTypeC: false, need4P: false, needMCU: false,
    typeCX: 0, typeCY: 0, fourPX: 0, fourPY: 0, mcuX: 0, mcuY: 0,
    typeCRot: 0, fourPRot: 0, mcuRot: 0,
  };
  const { keyInfos, holeMinX, holeMinY, holeMaxX, holeMaxY } = computePCBKeyPositions(keys, posConfig, U);

  // 轴孔半径：socket 的两个上方大孔 (3mm→1mm) 用 0.5
  const switchRadii = opts.solderType === "socket"
    ? [MX_CENTER_R, MX_OFFSET_R, MX_OFFSET_R, 0.5, 0.5]
    : opts.solderType === "stepped" ? MAGNETIC_RADII : THT_RADII;
  const switchOffsets = opts.solderType === "stepped" ? MAGNETIC_HOLES : THT_HOLES;

  for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
    const ki = keyInfos[keyIndex]!;
    const swRot = switchRotations?.[`switch-${keyIndex}`] || 0;
    const stRot = stabRotations?.[`stab-${keyIndex}`] || 0;
    const cStart = circles.length, pStart = polys.length;

    for (let i = 0; i < switchOffsets.length; i++) {
      let ox = switchOffsets[i]!.x, oy = switchOffsets[i]!.y;
      if (ki.isTall) { const t = ox; ox = -oy; oy = t; }
      if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      if (swRot) { const r = rotatePoint({ x: ox, y: oy }, swRot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      circles.push({ x: ki.swCx + ox, y: ki.swCy + oy, r: switchRadii[i]! });
    }

    if (opts.needLed) {
      const ledW = 3.9, ledH = 3.5;
      let ox = 0, oy = 3.35 + ledH / 2;
      if (ki.isTall) { const t = ox; ox = -oy; oy = t; }
      if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      if (swRot) { const r = rotatePoint({ x: ox, y: oy }, swRot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      const ledAngle = ki.rot + (ki.isTall ? 90 : 0) + swRot;
      const cx = ki.swCx + ox, cy = ki.swCy + oy;
      const local: [number, number][] = [[-ledW / 2, -ledH / 2], [ledW / 2, -ledH / 2], [ledW / 2, ledH / 2], [-ledW / 2, ledH / 2]];
      polys.push(local.map(([dx, dy]) => {
        const r = ledAngle % 360 !== 0 ? rotatePoint({ x: dx, y: dy }, ledAngle, { x: 0, y: 0 }) : { x: dx, y: dy };
        return [cx + r.x, cy + r.y] as [number, number];
      }));
    }

    if (ki.hasStab) {
      const size = ki.isTall ? ki.kh : ki.kw;
      const stabOff = getStabOffset(size);
      if (stabOff !== null) {
        const offsets: [number, number, number][] = [
          [-stabOff, -7.1, 1.5], [-stabOff, 8.3, 2], [stabOff, -7.1, 1.5], [stabOff, 8.3, 2],
        ];
        for (const [bx, by, r0] of offsets) {
          let ox = bx, oy = by;
          if (ki.isTall) { const t = ox; ox = -oy; oy = t; }
          if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
          if (stRot) { const r = rotatePoint({ x: ox, y: oy }, stRot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
          circles.push({ x: ki.visualCx + ox, y: ki.visualCy + oy, r: r0 });
        }
      }
    }

    if (compatKeyIndices?.has(keyIndex)) {
      for (let k = cStart; k < circles.length; k++) compatCircles.push(circles[k]!);
      for (let k = pStart; k < polys.length; k++) compatPolys.push(polys[k]!);
    }
  }

  return { circles, polys, compatCircles, compatPolys, minX: holeMinX, minY: holeMinY, maxX: holeMaxX, maxY: holeMaxY };
}

// ─── 底棉几何（从 PCB 配置派生，绝对 mm，Y 向下） ─────────

export interface BottomFoamGeometry {
  /** 所有挖孔（绝对 mm，Y 向下） */
  polys: [number, number][][];
  minX: number; minY: number; maxX: number; maxY: number;
  /** 兼容层：兼容键的挖孔（浅灰重绘用） */
  compatPolys?: [number, number][][];
}

/**
 * 底棉挖孔：
 *  - socket（热插拔）→ 每键一个轴座挖孔（圆角矩形，据 DXF drw0004.dxf；轴孔圆仅对位不切割）
 *  - RGB 方孔
 *  - TypeC / 4P / MCU 轮廓孔
 * 不含开关孔 / 卫星轴孔；片材边界 = 孔位包围盒 + Edge Distance。
 */
export function computeBottomFoamGeometry(
  layout: KLELayout,
  opts: {
    solderType: SolderType; needLed: boolean;
    needTypeC: boolean; typeCX: number; typeCY: number; typeCRot: number;
    need4P: boolean; fourPX: number; fourPY: number; fourPRot: number;
    needMCU: boolean; mcuX: number; mcuY: number; mcuRot: number;
    edgeDistance: number;
    /** 「圆角」：hotswap 轴座与组件挖孔圆角矩形的半径 (mm) */
    holeFillet: number;
    customRects?: CustomRect[];
  },
  switchRotations?: PCBSwitchRotations,
  compatKeyIndices?: Set<number>,
): BottomFoamGeometry {
  const polys: [number, number][][] = [];
  const compatPolys: [number, number][][] = [];
  const { keys } = layout;

  // 组件挖孔：以组件中心为心的圆角矩形（圆角取「圆角」值）
  const compRect = (cx: number, cy: number, w: number, h: number, rot: number, r = opts.holeFillet) => {
    polys.push(roundedRectPolygon(cx, cy, w, h, r, rot));
  };

  if (keys.length > 0) {
    const posConfig: PCBConfig = {
      solderType: opts.solderType, needStab: false, needLed: opts.needLed, edgeDistance: 0,
      needTypeC: false, need4P: false, needMCU: false,
      typeCX: 0, typeCY: 0, fourPX: 0, fourPY: 0, mcuX: 0, mcuY: 0, typeCRot: 0, fourPRot: 0, mcuRot: 0,
    };
    const { keyInfos } = computePCBKeyPositions(keys, posConfig, U);
    const hotswapHole = hotswapCutout(opts.holeFillet);
    for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
      const ki = keyInfos[keyIndex]!;
      const swRot = switchRotations?.[`switch-${keyIndex}`] || 0;
      const angle = ki.rot + (ki.isTall ? 90 : 0) + swRot;
      const pStart = polys.length;
      const tf = (pts: [number, number][]) => pts.map(([dx, dy]) => {
        const r = angle % 360 !== 0 ? rotatePoint({ x: dx, y: dy }, angle, { x: 0, y: 0 }) : { x: dx, y: dy };
        return [ki.swCx + r.x, ki.swCy + r.y] as [number, number];
      });
      const ledW = 3.9, ledH = 3.5;
      const lox = 0, loy = 3.35 + ledH / 2;

      if (opts.solderType === "socket") polys.push(tf(hotswapHole));

      if (opts.needLed) {
        polys.push(tf(([[-ledW / 2, -ledH / 2], [ledW / 2, -ledH / 2], [ledW / 2, ledH / 2], [-ledW / 2, ledH / 2]] as [number, number][])
          .map(([dx, dy]) => [lox + dx, loy + dy] as [number, number])));
      }

      // 只打通 RGB 方孔与轴座孔之间的薄桥 (仅靠轴体一侧, 不越出两者范围)
      if (opts.solderType === "socket" && opts.needLed) {
        const yA = HOTSWAP_CUT.y1 - 0.2;          // 探入轴座孔 (与轴座孔重叠)
        const yB = (loy - ledH / 2) + 0.2;         // 探入 RGB 方孔 (与 RGB 重叠)
        polys.push(tf([[-ledW / 2, yA], [ledW / 2, yA], [ledW / 2, yB], [-ledW / 2, yB]]));
      }

      if (compatKeyIndices?.has(keyIndex)) {
        for (let k = pStart; k < polys.length; k++) compatPolys.push(polys[k]!);
      }
    }
  }

  if (opts.needTypeC) compRect(opts.typeCX + 9.33 / 2, opts.typeCY + 5.70 / 2, 9, 9, opts.typeCRot);
  if (opts.need4P) compRect(opts.fourPX + 6.88 / 2, opts.fourPY + 5.64 / 2, 7, 7, opts.fourPRot);
  if (opts.needMCU) compRect(opts.mcuX + 9.68 / 2, opts.mcuY + 9.68 / 2, 8.5, 8.5, opts.mcuRot);
  for (const cr of opts.customRects ?? []) {
    polys.push(roundedRectPolygon(cr.cx, cr.cy, cr.w, cr.h, cr.r, cr.rot));
  }

  if (polys.length === 0) return { polys, compatPolys, minX: 0, minY: 0, maxX: 0, maxY: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
  }
  minX -= opts.edgeDistance; minY -= opts.edgeDistance;
  maxX += opts.edgeDistance; maxY += opts.edgeDistance;
  return { polys, compatPolys, minX, minY, maxX, maxY };
}

/** M3 抽取：扩展 PCB 边界以包含组件（Type-C/4P/MCU） */
function expandPCBComponentBoundary(
  config: PCBConfig, edge: number,
  minX: number, minY: number, maxX: number, maxY: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  // Type-C deliberately excluded — extends outside the PCB board edge
  if (config.need4P) {
    const fpW = 6.88, fpH = 5.64;
    const fpRight = config.fourPX + fpW;
    const fpBottom = config.fourPY + fpH;
    if (config.fourPX - edge < minX) minX = config.fourPX - edge;
    if (config.fourPY - edge < minY) minY = config.fourPY - edge;
    if (fpRight + edge > maxX) maxX = fpRight + edge;
    if (fpBottom + edge > maxY) maxY = fpBottom + edge;
  }
  if (config.needMCU) {
    const mcuW = MCU_ICON.viewW * 0.01, mcuH = MCU_ICON.viewH * 0.01;
    const mcuRight = config.mcuX + mcuW;
    const mcuBottom = config.mcuY + mcuH;
    if (config.mcuX - edge < minX) minX = config.mcuX - edge;
    if (config.mcuY - edge < minY) minY = config.mcuY - edge;
    if (mcuRight + edge > maxX) maxX = mcuRight + edge;
    if (mcuBottom + edge > maxY) maxY = mcuBottom + edge;
  }
  return { minX, minY, maxX, maxY };
}

/** M3 抽取：构建 PCB 预览区域 */
function buildPCBPreviewRegions(
  keyInfos: KeyInfo[],
  switchRegionAccums: Map<number, { minX: number; minY: number; maxX: number; maxY: number }>,
  stabRegionAccums: Map<number, { minX: number; minY: number; maxX: number; maxY: number }>,
  minX: number, minY: number, pad: number,
): { switchRegions: PCBPreviewRegion[]; stabRegions: PCBPreviewRegion[] } {
  const switchRegions: PCBPreviewRegion[] = [];
  for (const [keyIndex, acc] of switchRegionAccums) {
    if (acc.minX === Infinity) continue;
    const ki = keyInfos[keyIndex];
    if (!ki) continue;
    switchRegions.push({
      id: `switch-${keyIndex}`,
      keyIndex,
      type: "switch",
      x: acc.minX, y: acc.minY,
      w: acc.maxX - acc.minX, h: acc.maxY - acc.minY,
      centerX: ki.visualCx - minX + pad,
      centerY: ki.visualCy - minY + pad,
    });
  }
  const stabRegions: PCBPreviewRegion[] = [];
  for (const [keyIndex, acc] of stabRegionAccums) {
    if (acc.minX === Infinity) continue;
    const ki = keyInfos[keyIndex];
    if (!ki) continue;
    stabRegions.push({
      id: `stab-${keyIndex}`,
      keyIndex,
      type: "stab",
      x: acc.minX, y: acc.minY,
      w: acc.maxX - acc.minX, h: acc.maxY - acc.minY,
      centerX: ki.visualCx - minX + pad,
      centerY: ki.visualCy - minY + pad,
    });
  }
  return { switchRegions, stabRegions };
}

export function generatePCB(
  layout: KLELayout,
  config: PCBConfig,
  switchRotations?: PCBSwitchRotations,
  stabRotations?: PCBStabRotations,
  compatKeyIndices?: Set<number>,
): PCBResult {
  const { keys } = layout;
  const edge = config.edgeDistance;

  if (keys.length === 0) {
    return { svg: "", dxf: "", width: 0, height: 0, keyCount: 0, stabCount: 0, stpData: null, switchRegions: [], stabRegions: [], componentRegions: [] };
  }

  // M3: Compute key positions via extracted helper
  const { keyInfos, holeMinX, holeMinY, holeMaxX, holeMaxY, stabCount } = computePCBKeyPositions(keys, config, U);

  // 板框尺寸（含边距/旋转感知/组件扩展）——与 computePCBBounds 同一数据源
  const {
    width: boardW, height: boardH,
    minX: boardAbsMinX, minY: boardAbsMinY,
    maxX: boardAbsMaxX, maxY: boardAbsMaxY,
  } = computePCBBoundsFromExtents(keys, config, edge, holeMinX, holeMinY, holeMaxX, holeMaxY);
  const keyCount = keyInfos.length;

  // 孔位偏移基准：用非旋转边界的 minX/minY（保持键位位置不变）
  const holeOffX = holeMinX;
  const holeOffY = holeMinY;

  // Generate SVG paths
  const pad = 5;
  const svgW = boardW + pad * 2;
  const svgH = boardH + pad * 2;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path,circle,rect{vector-effect:non-scaling-stroke}</style>
  <!-- FR4 base panel -->
  <rect x="${pad}" y="${pad}" width="${boardW}" height="${boardH}" fill="#7ec87a" stroke="#5a9e56" stroke-width="0.5" rx="${config.outerFillet ?? 0}"/>
  <!-- Copper pour area -->
  <rect x="${pad + 1}" y="${pad + 1}" width="${boardW - 2}" height="${boardH - 2}" fill="none" stroke="#6db86a" stroke-width="0.2"/>
  <!-- Holes group: white fill, transparent interior via mask -->
  <g fill="rgba(255,255,255,0.85)" stroke="#aaa" stroke-width="0.15">`;

  // DXF builder
  const dxfLines: string[] = [];
  const dxf = (s: string | number) => { dxfLines.push(s.toString()); };

  dxf(0); dxf("SECTION"); dxf(2); dxf("HEADER");
  dxf(9); dxf("$ACADVER"); dxf(1); dxf("AC1009");
  dxf(9); dxf("$INSBASE"); dxf(10); dxf("0.0"); dxf(20); dxf("0.0"); dxf(30); dxf("0.0");
  dxf(9); dxf("$EXTMIN"); dxf(10); dxf("0.0"); dxf(20); dxf("0.0"); dxf(30); dxf("0.0");
  dxf(9); dxf("$EXTMAX"); dxf(10); dxf("1000.0"); dxf(20); dxf("1000.0"); dxf(30); dxf("0.0");
  dxf(0); dxf("ENDSEC");
  dxf(0); dxf("SECTION"); dxf(2); dxf("TABLES");
  dxf(0); dxf("TABLE"); dxf(2); dxf("LAYER"); dxf(5); dxf("2"); dxf(70); dxf("2");
  dxf(0); dxf("LAYER"); dxf(5); dxf("10"); dxf(2); dxf("0"); dxf(70); dxf("0"); dxf(62); dxf("7"); dxf(6); dxf("Continuous");
  dxf(0); dxf("ENDTAB"); dxf(0); dxf("ENDSEC");
  dxf(0); dxf("SECTION"); dxf(2); dxf("ENTITIES");

  // Board outline
  function dxfRect(x: number, y: number, w: number, h: number) {
    dxf(0); dxf("POLYLINE"); dxf(8); dxf("0"); dxf(66); dxf("1"); dxf(70); dxf("1");
    dxf(40); dxf("0.0"); dxf(41); dxf("0.0");
    const pts = [
      [x + pad, y + pad], [x + w + pad, y + pad],
      [x + w + pad, y + h + pad], [x + pad, y + h + pad],
    ];
    for (const [px, py] of pts) {
      dxf(0); dxf("VERTEX"); dxf(8); dxf("0");
      dxf(10); dxf(px!.toFixed(4)); dxf(20); dxf((-py!).toFixed(4)); dxf(30); dxf("0.0");
    }
    dxf(0); dxf("SEQEND");
  }
  dxfRect(0, 0, boardW, boardH);

  /** Add a closed polygon to DXF (viewport coords, Y-down) */
  function dxfPolygon(pts: [number, number][]) {
    dxf(0); dxf("POLYLINE"); dxf(8); dxf("0"); dxf(66); dxf("1"); dxf(70); dxf("1");
    dxf(40); dxf("0.0"); dxf(41); dxf("0.0");
    for (const [px, py] of pts) {
      dxf(0); dxf("VERTEX"); dxf(8); dxf("0");
      dxf(10); dxf(px.toFixed(4)); dxf(20); dxf((-py).toFixed(4)); dxf(30); dxf("0.0");
    }
    dxf(0); dxf("SEQEND");
  }

  // ── STP 3D 数据收集器 (绝对 mm，用于 cadrum 挤出) ──
  const stpCircleHoles: [number, number, number][] = [];
  const stpPolyHoles: [number, number][][] = [];
  // 本次所有轴的开关/卫星轴钻孔（延后统一输出，便于跨键布尔合并）
  const holeShapes: HoleCircle[] = [];
  // 兼容层：这些键的孔/元件以浅灰重绘（仅 SVG 预览，不影响 DXF/STP）
  const compatHoleShapes: HoleCircle[] = [];
  const compatLedRects: { x: number; y: number; w: number; h: number; angle: number }[] = [];

  // ── Region accumulators (viewport coords: p.x - minX + pad) ──
  type RegionAcc = { minX: number; minY: number; maxX: number; maxY: number };
  const switchRegionAccums = new Map<number, RegionAcc>();
  const stabRegionAccums = new Map<number, RegionAcc>();

  // Apply rotation override to (ox, oy) around (0, 0)
  function applyRot(ox: number, oy: number, angle: number): { x: number; y: number } {
    if (!angle || angle % 360 === 0) return { x: ox, y: oy };
    return rotatePoint({ x: ox, y: oy }, angle, { x: 0, y: 0 });
  }

  // Accumulate a point into a region bbox (viewport coords)
  function accPt(acc: RegionAcc, absX: number, absY: number) {
    if (absX < acc.minX) acc.minX = absX;
    if (absY < acc.minY) acc.minY = absY;
    if (absX > acc.maxX) acc.maxX = absX;
    if (absY > acc.maxY) acc.maxY = absY;
  }

  // RGB 3D placements collected during key loop (merged into modelPlacements later)
  const rgbPlacements: ModelPlacement[] = [];

  // Draw holes for each key
  for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
    const ki = keyInfos[keyIndex]!;
    const swRot = switchRotations?.[`switch-${keyIndex}`] || 0;
    const stRot = stabRotations?.[`stab-${keyIndex}`] || 0;

    // ── Switch holes ──
    const holes: { ox: number; oy: number; r: number }[] = [];

    switch (config.solderType) {
      case "socket":
        for (let i = 0; i < THT_HOLES.length; i++) {
          holes.push({ ox: THT_HOLES[i]!.x, oy: THT_HOLES[i]!.y, r: SOCKET_RADII[i]! });
        }
        break;
      case "sunken":
        for (let i = 0; i < THT_HOLES.length; i++) {
          holes.push({ ox: THT_HOLES[i]!.x, oy: THT_HOLES[i]!.y, r: THT_RADII[i]! });
        }
        break;
      case "stepped":
        for (let i = 0; i < MAGNETIC_HOLES.length; i++) {
          holes.push({ ox: MAGNETIC_HOLES[i]!.x, oy: MAGNETIC_HOLES[i]!.y, r: MAGNETIC_RADII[i]! });
        }
        break;
    }

    // Switch region accumulator
    const swAcc = switchRegionAccums.get(keyIndex) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    for (const h of holes) {
      let ox = h.ox, oy = h.oy;
      if (ki.isTall) { const tmp = ox; ox = -oy; oy = tmp; }
      if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      // Apply user switch rotation override
      if (swRot) { const r = applyRot(ox, oy, swRot); ox = r.x; oy = r.y; }

      const absX = ki.swCx + ox - holeOffX + pad;
      const absY = ki.swCy + oy - holeOffY + pad;

      // 收集（延后统一布尔输出）
      holeShapes.push({ cx: absX, cy: absY, r: h.r, sX: ki.swCx + ox, sY: -(ki.swCy + oy) });
      if (compatKeyIndices?.has(keyIndex)) {
        compatHoleShapes.push({ cx: absX, cy: absY, r: h.r, sX: 0, sY: 0 });
      }

      // Accumulate bbox (circle extents)
      accPt(swAcc, absX - h.r, absY - h.r);
      accPt(swAcc, absX + h.r, absY + h.r);
    }

    // LED square hole
    if (config.needLed) {
      const ledW = 3.9, ledH = 3.5;
      let ledOx = 0, ledOy = 3.35 + ledH / 2;
      if (ki.isTall) { const tmp = ledOx; ledOx = -ledOy; ledOy = tmp; }
      if (ki.rot !== 0) { const r = rotatePoint({ x: ledOx, y: ledOy }, ki.rot, { x: 0, y: 0 }); ledOx = r.x; ledOy = r.y; }
      if (swRot) { const r = applyRot(ledOx, ledOy, swRot); ledOx = r.x; ledOy = r.y; }

      const absX = ki.swCx + ledOx - holeOffX + pad;
      const absY = ki.swCy + ledOy - holeOffY + pad;

      // Total LED orientation angle (CW, SVG convention)
      const ledAngle = ki.rot + (ki.isTall ? 90 : 0) + swRot;
      const needLedRot = ledAngle && ledAngle % 360 !== 0;

      if (compatKeyIndices?.has(keyIndex)) {
        compatLedRects.push({ x: absX, y: absY, w: ledW, h: ledH, angle: ledAngle });
      }

      // SVG — rotate rect around its centre
      if (needLedRot) {
        svg += `<g transform="rotate(${ledAngle} ${absX.toFixed(3)} ${absY.toFixed(3)})">`;
      }
      svg += `<rect x="${(absX - ledW / 2).toFixed(3)}" y="${(absY - ledH / 2).toFixed(3)}" width="${ledW}" height="${ledH}" rx="0.2"/>`;
      if (needLedRot) {
        svg += `</g>`;
      }

      // DXF — rotate corner vertices around LED centre
      const ledLocal: [number, number][] = [
        [-ledW / 2, -ledH / 2], [ledW / 2, -ledH / 2],
        [ledW / 2, ledH / 2], [-ledW / 2, ledH / 2],
      ];
      const ledDxfPts = ledLocal.map(([dx, dy]) => {
        const r = needLedRot
          ? rotatePoint({ x: dx, y: dy }, ledAngle, { x: 0, y: 0 })
          : { x: dx, y: dy };
        return [absX + r.x, absY + r.y] as [number, number];
      });
      dxf(0); dxf("POLYLINE"); dxf(8); dxf("0"); dxf(66); dxf("1"); dxf(70); dxf("1");
      dxf(40); dxf("0.0"); dxf(41); dxf("0.0");
      for (const [px, py] of ledDxfPts) {
        dxf(0); dxf("VERTEX"); dxf(8); dxf("0");
        dxf(10); dxf(px!.toFixed(4)); dxf(20); dxf((-py!).toFixed(4)); dxf(30); dxf("0.0");
      }
      dxf(0); dxf("SEQEND");

      // STP 3D LED rect — rotate vertices around LED centre (Y-up coords)
      const ledAbsX = ki.swCx + ledOx;
      const ledAbsY = ki.swCy + ledOy;
      stpPolyHoles.push(
        ledLocal.map(([dx, dy]) => {
          const r = needLedRot
            ? rotatePoint({ x: dx, y: dy }, ledAngle, { x: 0, y: 0 })
            : { x: dx, y: dy };
          return [ledAbsX + r.x, -(ledAbsY + r.y)] as [number, number];
        }),
      );

      // RGB 3D model placement at LED hole position (collected for later use)
      rgbPlacements.push({
        type: "rgb" as const,
        x: ledAbsX,
        y: -ledAbsY,
        rotation: ledAngle,
        zOffset: 0,
        flip: false,
      });

      // Accumulate LED rect extents (use rotated corners' bounds)
      for (const [px, py] of ledDxfPts) {
        accPt(swAcc, px!, py!);
      }
    }

    switchRegionAccums.set(keyIndex, swAcc);

    // ── Stabilizer holes ──
    if (ki.hasStab) {
      const size = ki.isTall ? ki.kh : ki.kw;
      const stabOff = getStabOffset(size);
      if (stabOff !== null) {
        const stAcc = stabRegionAccums.get(keyIndex) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        const stabOffsets: Offset[] = [
          { x: -stabOff, y: -7.1 }, { x: -stabOff, y: 8.3 },
          { x: stabOff, y: -7.1 }, { x: stabOff, y: 8.3 },
        ];
        const stabRadii = [1.5, 2, 1.5, 2];

        for (let si = 0; si < stabOffsets.length; si++) {
          let ox = stabOffsets[si]!.x, oy = stabOffsets[si]!.y;
          if (ki.isTall) { const tmp = ox; ox = -oy; oy = tmp; }
          if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
          // Apply user stab rotation override
          if (stRot) { const r = applyRot(ox, oy, stRot); ox = r.x; oy = r.y; }

          const absX = ki.visualCx + ox - holeOffX + pad;
          const absY = ki.visualCy + oy - holeOffY + pad;
          const r = stabRadii[si]!;
          holeShapes.push({ cx: absX, cy: absY, r, sX: ki.visualCx + ox, sY: -(ki.visualCy + oy) });
          if (compatKeyIndices?.has(keyIndex)) {
            compatHoleShapes.push({ cx: absX, cy: absY, r, sX: 0, sY: 0 });
          }

          accPt(stAcc, absX - r, absY - r);
          accPt(stAcc, absX + r, absY + r);
        }
        stabRegionAccums.set(keyIndex, stAcc);
      }
    }
  }

  // ── 输出开关/卫星轴钻孔（跨键布尔合并：错位重合的孔合并为同一孔） ──
  if (holeShapes.length > 0) {
    let overlap = false;
    for (let i = 0; i < holeShapes.length && !overlap; i++) {
      const a = holeShapes[i]!;
      for (let j = i + 1; j < holeShapes.length; j++) {
        const b = holeShapes[j]!;
        if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - 1e-6) { overlap = true; break; }
      }
    }
    if (!overlap) {
      // 无重叠：逐个原样输出圆孔
      for (const s of holeShapes) {
        svg += `<circle cx="${s.cx.toFixed(3)}" cy="${s.cy.toFixed(3)}" r="${s.r}"/>`;
        dxf(0); dxf("CIRCLE"); dxf(8); dxf("0");
        dxf(10); dxf(s.cx.toFixed(4)); dxf(20); dxf((-s.cy).toFixed(4)); dxf(30); dxf("0.0");
        dxf(40); dxf(s.r.toFixed(4));
        stpCircleHoles.push([s.sX, s.sY, s.r]);
      }
    } else {
      // 有重叠：布尔合并后输出（孤立圆仍还原为圆，合并后的异形输出多边形）
      const rings = unionPolys(holeShapes.map((s) => circleToPoly(s.cx, s.cy, s.r)));
      for (const ring of rings) {
        const c = circleFromRing(ring);
        if (c) {
          svg += `<circle cx="${c.cx.toFixed(3)}" cy="${c.cy.toFixed(3)}" r="${c.r.toFixed(3)}"/>`;
          dxf(0); dxf("CIRCLE"); dxf(8); dxf("0");
          dxf(10); dxf(c.cx.toFixed(4)); dxf(20); dxf((-c.cy).toFixed(4)); dxf(30); dxf("0.0");
          dxf(40); dxf(c.r.toFixed(4));
          stpCircleHoles.push([c.cx + holeOffX - pad, -(c.cy + holeOffY - pad), c.r]);
        } else {
          svg += `<path d="${ringPathD(ring)}"/>`;
          dxfPolygon(ring);
          stpPolyHoles.push(ring.map(([x, y]) => [x + holeOffX - pad, -(y + holeOffY - pad)] as Pt2));
        }
      }
    }
  }

  svg += `</g>`;

  // 兼容层：兼容键的孔/元件以浅灰重绘（仅 SVG 预览，不影响 DXF/STP）
  if (compatHoleShapes.length > 0 || compatLedRects.length > 0) {
    svg += `
  <g fill="lightgray" stroke="#aaa" stroke-width="0.15">`;
    if (compatHoleShapes.length > 0) {
      const rings = unionPolys(compatHoleShapes.map((s) => circleToPoly(s.cx, s.cy, s.r)));
      for (const ring of rings) {
        const c = circleFromRing(ring);
        if (c) svg += `<circle cx="${c.cx.toFixed(3)}" cy="${c.cy.toFixed(3)}" r="${c.r.toFixed(3)}"/>`;
        else svg += `<path d="${ringPathD(ring)}"/>`;
      }
    }
    for (const r of compatLedRects) {
      if (r.angle && r.angle % 360 !== 0) {
        svg += `<g transform="rotate(${r.angle} ${r.x.toFixed(3)} ${r.y.toFixed(3)})">`;
        svg += `<rect x="${(r.x - r.w / 2).toFixed(3)}" y="${(r.y - r.h / 2).toFixed(3)}" width="${r.w}" height="${r.h}" rx="0.2"/>`;
        svg += `</g>`;
      } else {
        svg += `<rect x="${(r.x - r.w / 2).toFixed(3)}" y="${(r.y - r.h / 2).toFixed(3)}" width="${r.w}" height="${r.h}" rx="0.2"/>`;
      }
    }
    svg += `</g>`;
  }

  // ── Component outlines: Type-C / 4P ──
  const componentRegions: PCBComponentRegion[] = [];
  const modelPlacements: ModelPlacement[] = [];

  // Collect T4 placements (one per key — default, unconditional)
  for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
    const ki = keyInfos[keyIndex]!;
    modelPlacements.push({
      type: "t4",
      x: ki.visualCx,
      y: -ki.visualCy,
      rotation: ki.rot + (ki.isTall ? 90 : 0) + (switchRotations?.[`switch-${keyIndex}`] || 0),
      zOffset: 0,
    });
  }

  // Collect hotswap placements (one per key when solderType is "socket")
  if (config.solderType === "socket") {
    for (let keyIndex = 0; keyIndex < keyInfos.length; keyIndex++) {
      const ki = keyInfos[keyIndex]!;
      // Hotswap in STP coordinates (Y-up = -cy)
      modelPlacements.push({
        type: "hotswap",
        x: ki.visualCx,
        y: -ki.visualCy,
        rotation: ki.rot + (ki.isTall ? 90 : 0) + (switchRotations?.[`switch-${keyIndex}`] || 0),
        zOffset: 0, // sits on PCB bottom
      });
    }
  }

  // Type-C connector (预览图标 + 4 个「跑道圆」真实挖孔)
  if (config.needTypeC) {
    const tcW = TYPEC_ICON.viewW * 0.01;   // 9.56 mm
    const tcH = TYPEC_ICON.viewH * 0.01;   // 7.959 mm
    const tcAbsX = config.typeCX;
    const tcAbsY = config.typeCY;
    const tcVpx = tcAbsX - holeOffX + pad;
    const tcVpy = tcAbsY - holeOffY + pad;
    const tcCx = (tcVpx + tcW / 2);
    const tcCy = (tcVpy + tcH / 2);
    const tcRot = config.typeCRot || 0;
    const SCALE = 0.01; // 画稿单位 → mm
    const cenX = TYPEC_ICON.viewW / 2;
    const cenY = TYPEC_ICON.viewH / 2;
    // 画稿坐标 → 以元件中心为原点的 mm，并绕中心旋转
    const toCenter = (px: number, py: number) => {
      const mx = (px - cenX) * SCALE;
      const my = (py - cenY) * SCALE;
      return tcRot % 360 !== 0 ? rotatePoint({ x: mx, y: my }, tcRot, { x: 0, y: 0 }) : { x: mx, y: my };
    };
    const iconTf = `translate(${tcCx.toFixed(3)} ${tcCy.toFixed(3)}) rotate(${tcRot}) scale(${SCALE}) translate(${(-cenX).toFixed(3)} ${(-cenY).toFixed(3)})`;

    // 预览：外壳 + 12 引脚 + TYPE-C 文字（仅 SVG，不切割）
    svg += `<g transform="${iconTf}"><defs>${TYPEC_ICON.defs}</defs>${TYPEC_ICON.markup}</g>`;
    // 预览：4 个跑道圆画成白孔（压在外壳之上，视觉即挖穿）
    svg += `<g transform="${iconTf}" fill="rgba(255,255,255,0.85)" stroke="#aaa" stroke-width="0.15">`;
    for (const [hx, hy, hw, hh, hrx, hry] of TYPEC_HOLES) {
      svg += `<rect x="${hx}" y="${hy}" width="${hw}" height="${hh}" rx="${hrx}" ry="${hry}"/>`;
    }
    svg += `</g>`;

    // 4 跑道圆 → DXF 切割 + STP 挖孔（Type-C 唯一的真实制造几何）
    for (const [hx, hy, hw, hh, hrx, hry] of TYPEC_HOLES) {
      const poly = roundedRectPoly(hx, hy, hw, hh, hrx, hry).map(([px, py]) => {
        const r = toCenter(px, py);
        return [tcCx + r.x, tcCy + r.y] as [number, number]; // viewport 坐标
      });
      dxfPolygon(poly);
      stpPolyHoles.push(poly.map(([x, y]) => [x + holeOffX - pad, -(y + holeOffY - pad)] as [number, number]));
    }

    componentRegions.push({
      id: "type-c",
      type: "typec",
      x: tcVpx, y: tcVpy, w: tcW, h: tcH,
      absX: tcAbsX, absY: tcAbsY,
    });

    modelPlacements.push({
      type: "typec",
      x: tcAbsX + 8.5 / 2,     // 保持旧值：3D 摆放不变
      y: -tcAbsY - 5.5 / 2,    // 保持旧值
      rotation: -tcRot, // 取反: SVG=CW, cadrum 翻转后=CCW
      zOffset: 0,
      flip: true, // flipped so pins point up toward PCB
    });
  }

  // 4P connector outline
  if (config.need4P) {
    const fpW = 6.88, fpH = 5.64; // 取自 DXF
    const fpAbsX = config.fourPX;
    const fpAbsY = config.fourPY;
    const fpVpx = fpAbsX - holeOffX + pad;
    const fpVpy = fpAbsY - holeOffY + pad;
    const fpCx = (fpVpx + fpW / 2);
    const fpCy = (fpVpy + fpH / 2);
    const fpRot = config.fourPRot || 0;

    svg += `<g transform="rotate(${fpRot} ${fpCx.toFixed(3)} ${fpCy.toFixed(3)})">`;
    // D 形外轮廓 (取自 DXF)
    svg += `<polygon points="${outlinePoints(FOURP_OUTLINE, fpCx, fpCy)}" fill="#d4d4d4" stroke="#666" stroke-width="0.3"/>`;
    // 4P 文字：叠印在图标中心，随图标一起旋转（在旋转组内）
    svg += `<text x="${fpCx.toFixed(3)}" y="${fpCy.toFixed(3)}" text-anchor="middle" dominant-baseline="central" font-size="3" fill="#888" font-family="sans-serif">4P</text>`;
    svg += `</g>`;

    // ── DXF: 4P ──
    {
      const bodyCorners: [number, number][] = FOURP_OUTLINE.map(([dx, dy]) => [fpCx + dx, fpCy + dy]);
      const bodyPts = fpRot % 360 !== 0
        ? bodyCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, fpRot, { x: fpCx, y: fpCy }); return [r.x, r.y] as [number, number]; })
        : bodyCorners;
      dxfPolygon(bodyPts);
    }

    componentRegions.push({
      id: "4p",
      type: "4p",
      x: fpVpx, y: fpVpy, w: fpW, h: fpH,
      absX: fpAbsX, absY: fpAbsY,
    });

    modelPlacements.push({
      type: "4p",
      x: fpAbsX + fpW / 2,
      y: -fpAbsY - fpH / 2,
      rotation: -fpRot, // 取反: SVG=CW, cadrum 翻转后=CCW
      zOffset: 0, // TODO: adjust after measuring model height
      flip: true, // flipped so pins point up toward PCB
    });
  }

  // MCU (预览图标，不切割)
  if (config.needMCU) {
    const mcuW = MCU_ICON.viewW * 0.01;   // 9.33 mm
    const mcuH = MCU_ICON.viewH * 0.01;   // 9.33 mm
    const mcuAbsX = config.mcuX;
    const mcuAbsY = config.mcuY;
    const mcuVpx = mcuAbsX - holeOffX + pad;
    const mcuVpy = mcuAbsY - holeOffY + pad;
    const mcuCx = (mcuVpx + mcuW / 2);
    const mcuCy = (mcuVpy + mcuH / 2);
    const mcuRot = config.mcuRot || 0;
    const SCALE = 0.01;
    const cenX = MCU_ICON.viewW / 2;
    const cenY = MCU_ICON.viewH / 2;
    const iconTf = `translate(${mcuCx.toFixed(3)} ${mcuCy.toFixed(3)}) rotate(${mcuRot}) scale(${SCALE}) translate(${(-cenX).toFixed(3)} ${(-cenY).toFixed(3)})`;

    // 预览：芯片体 + 4 边引脚 + Pin1 圆点 + MCU 文字（仅 SVG，不切割）
    svg += `<g transform="${iconTf}"><defs>${MCU_ICON.defs}</defs>${MCU_ICON.markup}</g>`;

    componentRegions.push({
      id: "mcu",
      type: "mcu",
      x: mcuVpx, y: mcuVpy, w: mcuW, h: mcuH,
      absX: mcuAbsX, absY: mcuAbsY,
    });

    modelPlacements.push({
      type: "mcu",
      x: mcuAbsX + 9.68 / 2,   // 保持旧值：3D 摆放不变
      y: -mcuAbsY - 9.68 / 2,  // 保持旧值
      rotation: -mcuRot, // 取反: SVG=CW, cadrum 翻转后=CCW
      zOffset: 0,
      flip: true, // 顶面底面翻转
    });
  }

  svg += `\n</svg>`;

  dxf(0); dxf("ENDSEC"); dxf(0); dxf("EOF");

  // Merge RGB placements (collected during key loop) into model placements
  if (rgbPlacements.length > 0) {
    modelPlacements.push(...rgbPlacements);
  }

  // ── 构建 STP 3D 挤出几何数据 (绝对 mm) ──
  const stpData: StpExtrudeData = {
    boundary: [
      [boardAbsMinX, -boardAbsMinY], [boardAbsMaxX, -boardAbsMinY],
      [boardAbsMaxX, -boardAbsMaxY], [boardAbsMinX, -boardAbsMaxY],
    ],
    polyHoles: stpPolyHoles,
    circleHoles: stpCircleHoles,
    modelPlacements: modelPlacements.length > 0 ? modelPlacements : undefined,
  };

  // ── Build hit-test regions (M3: extracted call) ──
  const { switchRegions, stabRegions } = buildPCBPreviewRegions(
    keyInfos, switchRegionAccums, stabRegionAccums, holeOffX, holeOffY, pad,
  );
  return {
    svg,
    dxf: dxfLines.join("\r\n"),
    width: boardW,
    height: boardH,
    keyCount,
    stabCount,
    stpData,
    switchRegions,
    stabRegions,
    componentRegions,
  };
}

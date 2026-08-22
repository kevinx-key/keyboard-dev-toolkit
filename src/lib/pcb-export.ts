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

/// MCU 封装外轮廓 (取自 DXF, 9.68×9.68mm, 含四角特征)
const MCU_OUTLINE: [number, number][] = [
  [-3.310, 3.440], [-2.063, 3.440], [-0.932, 3.440], [0.069, 3.440],
  [1.071, 3.440],  [2.072, 4.840],  [3.403, 3.324],  [3.403, 2.069],
  [3.403, 0.937],  [3.403, -0.064], [3.403, -1.065], [4.840, -2.066],
  [3.286, -3.415], [2.072, -3.415], [0.940, -3.415], [-0.061, -3.415],
  [-1.062, -3.415], [-2.063, -4.840], [-3.426, -3.298], [-3.426, -2.066],
  [-3.426, -0.935], [-3.426, 0.067], [-3.426, 1.068], [-4.840, 2.069],
  [-3.310, 3.440],
];

/// TypeC 连接器外轮廓 (取自 DXF 屏蔽壳, 21 点, 含两侧卡扣凹槽)
const TYPEC_OUTLINE: [number, number][] = [
  [-4.663, -2.849], [4.663, -2.849], [4.663, -0.940], [4.428, -1.059],
  [3.931, -1.059],  [3.639, -0.766], [3.639, 0.535],  [3.931, 0.828],
  [4.428, 0.828],   [4.663, 0.708],  [4.663, 2.849],  [-4.663, 2.849],
  [-4.663, 0.753],  [-4.470, 0.828], [-4.003, 0.828], [-3.711, 0.535],
  [-3.711, -0.766], [-4.003, -1.059], [-4.470, -1.059], [-4.663, -0.984],
  [-4.663, -2.849],
];

/// TypeC 连接器引脚 (12 个: 4 宽屏蔽/GND + 8 窄信号)
const TYPEC_PINS: [number, number, number, number][] = [
  [-3.234, 4.629, 0.673, 1.18],  // 左屏蔽
  [-2.436, 4.629, 0.673, 1.18],  // 左屏蔽
  [2.364, 4.629, 0.673, 1.18],   // 右屏蔽
  [3.162, 4.629, 0.673, 1.18],   // 右屏蔽
  [1.719, 4.629, 0.390, 1.18],
  [1.213, 4.629, 0.390, 1.18],
  [0.714, 4.629, 0.390, 1.18],
  [0.219, 4.629, 0.390, 1.18],
  [-0.287, 4.629, 0.390, 1.18],
  [-0.786, 4.629, 0.390, 1.18],
  [-1.286, 4.629, 0.390, 1.18],
  [-1.785, 4.629, 0.390, 1.18],
];

/// TypeC 螺丝固定孔 (2 个)
const TYPEC_SCREW_HOLES: [number, number, number][] = [
  [-2.926, 3.557, 0.322],
  [2.854, 3.557, 0.322],
];

// ─── Main PCB generation ────────────────────────────────


// ─── M3 抽取：计算键位位置和边界 ──────────────────────────

interface KeyInfo {
  cx: number; cy: number; kw: number; kh: number;
  rot: number; rx: number; ry: number; isTall: boolean;
  hasStab: boolean;
  /** Visual center after KLE cluster rotation (mm) */
  visualCx: number; visualCy: number;
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

    keyInfos.push({
      cx, cy, kw: actualW, kh: actualH,
      rot, rx, ry, isTall, hasStab, visualCx, visualCy,
    });
  }

  return { keyInfos, holeMinX, holeMinY, holeMaxX, holeMaxY, stabCount };
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
    const mcuW = 9.68, mcuH = 9.68;
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
): PCBResult {
  const { keys } = layout;
  const edge = config.edgeDistance;

  if (keys.length === 0) {
    return { svg: "", dxf: "", width: 0, height: 0, keyCount: 0, stabCount: 0, stpData: null, switchRegions: [], stabRegions: [], componentRegions: [] };
  }

  // M3: Compute key positions via extracted helper
  const { keyInfos, holeMinX, holeMinY, holeMaxX, holeMaxY, stabCount } = computePCBKeyPositions(keys, config, U);

  // 旋转感知边界——用于板框大小（扩大板框以覆盖旋转键的角点）
  const bboxKu = computeLayoutBBoxInUnits(keys);
  const boardMinX = Math.min(holeMinX, bboxKu.minX * U - edge);
  const boardMinY = Math.min(holeMinY, bboxKu.minY * U - edge);
  const boardMaxX = Math.max(holeMaxX, bboxKu.maxX * U + edge);
  const boardMaxY = Math.max(holeMaxY, bboxKu.maxY * U + edge);

  // M3: Expand board boundary to include components
  const expanded = expandPCBComponentBoundary(config, edge, boardMinX, boardMinY, boardMaxX, boardMaxY);
  const boardW = expanded.maxX - expanded.minX;
  const boardH = expanded.maxY - expanded.minY;
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
  <rect x="${pad}" y="${pad}" width="${boardW}" height="${boardH}" fill="#7ec87a" stroke="#5a9e56" stroke-width="0.5" rx="3"/>
  <!-- Copper pour area -->
  <rect x="${pad + 1}" y="${pad + 1}" width="${boardW - 2}" height="${boardH - 2}" fill="none" stroke="#6db86a" stroke-width="0.2"/>
  <!-- Holes group: white fill, transparent interior via mask -->
  <g fill="rgba(255,255,255,0.85)" stroke="#aaa" stroke-width="0.15">`;

  // DXF builder
  const dxfLines: string[] = [];
  let dxf = (s: string | number) => { dxfLines.push(s.toString()); };

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
  /** Add a line to DXF (viewport coords, Y-down) */
  function dxfLine(x1: number, y1: number, x2: number, y2: number) {
    dxf(0); dxf("LINE"); dxf(8); dxf("0");
    dxf(10); dxf(x1.toFixed(4)); dxf(20); dxf((-y1).toFixed(4)); dxf(30); dxf("0.0");
    dxf(11); dxf(x2.toFixed(4)); dxf(21); dxf((-y2).toFixed(4)); dxf(31); dxf("0.0");
  }

  // ── STP 3D 数据收集器 (绝对 mm，用于 cadrum 挤出) ──
  const stpCircleHoles: [number, number, number][] = [];
  const stpPolyHoles: [number, number][][] = [];

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
    let swAcc = switchRegionAccums.get(keyIndex) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

    for (const h of holes) {
      let ox = h.ox, oy = h.oy;
      if (ki.isTall) { const tmp = ox; ox = -oy; oy = tmp; }
      if (ki.rot !== 0) { const r = rotatePoint({ x: ox, y: oy }, ki.rot, { x: 0, y: 0 }); ox = r.x; oy = r.y; }
      // Apply user switch rotation override
      if (swRot) { const r = applyRot(ox, oy, swRot); ox = r.x; oy = r.y; }

      const absX = ki.visualCx + ox - holeOffX + pad;
      const absY = ki.visualCy + oy - holeOffY + pad;

      // SVG
      svg += `<circle cx="${absX.toFixed(3)}" cy="${absY.toFixed(3)}" r="${h.r}"/>`;
      // DXF
      dxf(0); dxf("CIRCLE"); dxf(8); dxf("0");
      dxf(10); dxf(absX.toFixed(4)); dxf(20); dxf((-absY).toFixed(4)); dxf(30); dxf("0.0");
      dxf(40); dxf(h.r.toFixed(4));
      // STP
      stpCircleHoles.push([ki.visualCx + ox, -(ki.visualCy + oy), h.r]);

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

      const absX = ki.visualCx + ledOx - holeOffX + pad;
      const absY = ki.visualCy + ledOy - holeOffY + pad;

      // Total LED orientation angle (CW, SVG convention)
      const ledAngle = ki.rot + (ki.isTall ? 90 : 0) + swRot;
      const needLedRot = ledAngle && ledAngle % 360 !== 0;

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
      const ledAbsX = ki.visualCx + ledOx;
      const ledAbsY = ki.visualCy + ledOy;
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
        let stAcc = stabRegionAccums.get(keyIndex) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
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
          svg += `<circle cx="${absX.toFixed(3)}" cy="${absY.toFixed(3)}" r="${r}"/>`;
          dxf(0); dxf("CIRCLE"); dxf(8); dxf("0");
          dxf(10); dxf(absX.toFixed(4)); dxf(20); dxf((-absY).toFixed(4)); dxf(30); dxf("0.0");
          dxf(40); dxf(r.toFixed(4));
          stpCircleHoles.push([ki.visualCx + ox, -(ki.visualCy + oy), r]);

          accPt(stAcc, absX - r, absY - r);
          accPt(stAcc, absX + r, absY + r);
        }
        stabRegionAccums.set(keyIndex, stAcc);
      }
    }
  }

  svg += `</g>`;

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

  // Type-C connector outline
  if (config.needTypeC) {
    const tcW = 9.33, tcH = 5.70; // 取自 DXF 全屏蔽壳轮廓
    const tcTotalH = 8.07; // 含引脚总高
    const tcCenterW = 8.5; // 位置校准用（保持旧值不偏移模型）
    const tcAbsX = config.typeCX;
    const tcAbsY = config.typeCY;
    const tcVpx = tcAbsX - holeOffX + pad;
    const tcVpy = tcAbsY - holeOffY + pad;
    const tcCx = (tcVpx + tcW / 2);
    const tcCy = (tcVpy + tcH / 2);
    const tcRot = config.typeCRot || 0;

    svg += `<g transform="rotate(${tcRot} ${tcCx.toFixed(3)} ${tcCy.toFixed(3)})">`;
    // 金属屏蔽壳轮廓 (取自 DXF, 21 点含卡扣槽)
    svg += `<polygon points="${outlinePoints(TYPEC_OUTLINE, tcCx, tcCy)}" fill="#c0c0c0" stroke="#666" stroke-width="0.3"/>`;
    // 11 根引脚 (2 宽 GND + 9 窄信号)
    for (const [dx, dy, w, h] of TYPEC_PINS) {
      const px = tcCx + dx;
      const py = tcCy + dy;
      // 引脚在 SVG 中朝向下方 (dy 为正, 在 body 下方)
      svg += `<rect x="${(px - w/2).toFixed(3)}" y="${(py - h/2).toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" fill="#888" stroke="#666" stroke-width="0.15"/>`;
    }
    // 2 个螺丝固定孔
    for (const [hx, hy, hr] of TYPEC_SCREW_HOLES) {
      const shCx = tcCx + hx;
      const shCy = tcCy + hy;
      svg += `<circle cx="${shCx.toFixed(3)}" cy="${shCy.toFixed(3)}" r="${hr.toFixed(3)}" fill="none" stroke="#666" stroke-width="0.2"/>`;
    }
    // Label
    svg += `<text x="${tcCx.toFixed(3)}" y="${(tcVpy - 0.5).toFixed(3)}" text-anchor="middle" font-size="3" fill="#888" font-family="sans-serif">Type-C</text>`;
    svg += `</g>`;

    // ── DXF: Type-C ──
    {
      // Body outline (取自 DXF, 21 点含卡扣槽)
      const bodyCorners: [number, number][] = TYPEC_OUTLINE.map(([dx, dy]) => [tcCx + dx, tcCy + dy]);
      const bodyPts = tcRot % 360 !== 0
        ? bodyCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, tcRot, { x: tcCx, y: tcCy }); return [r.x, r.y] as [number, number]; })
        : bodyCorners;
      dxfPolygon(bodyPts);
      // 11 pins
      for (const [dx, dy, w, h] of TYPEC_PINS) {
        const px = tcCx + dx - w/2;
        const py = tcCy + dy - h/2;
        const pinCorners: [number, number][] = [
          [px, py], [px + w, py], [px + w, py + h], [px, py + h],
        ];
        const pinPts = tcRot % 360 !== 0
          ? pinCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, tcRot, { x: tcCx, y: tcCy }); return [r.x, r.y] as [number, number]; })
          : pinCorners;
        dxfPolygon(pinPts);
      }
      // 2 screw holes as 16-segment polygons
      for (const [hx, hy, hr] of TYPEC_SCREW_HOLES) {
        const shCx = tcCx + hx;
        const shCy = tcCy + hy;
        const segs = 16;
        const holeCorners: [number, number][] = [];
        for (let s = 0; s < segs; s++) {
          const a = (s / segs) * Math.PI * 2;
          holeCorners.push([shCx + Math.cos(a) * hr, shCy + Math.sin(a) * hr]);
        }
        const holePts = tcRot % 360 !== 0
          ? holeCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, tcRot, { x: tcCx, y: tcCy }); return [r.x, r.y] as [number, number]; })
          : holeCorners;
        dxfPolygon(holePts);
      }
    }

    componentRegions.push({
      id: "type-c",
      type: "typec",
      x: tcVpx, y: tcVpy, w: tcW, h: tcTotalH,
      absX: tcAbsX, absY: tcAbsY,
    });

    modelPlacements.push({
      type: "typec",
      x: tcAbsX + tcCenterW / 2,
      y: -tcAbsY - 5.5 / 2, // 保持校准用旧 tcH=5.5
      rotation: -tcRot, // 取反: SVG=CW, cadrum 翻转后=CCW
      zOffset: 0, // TODO: adjust after measuring model height
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
    svg += `<text x="${fpCx.toFixed(3)}" y="${(fpVpy - 1).toFixed(3)}" text-anchor="middle" font-size="3" fill="#888" font-family="sans-serif">4P</text>`;
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

  // MCU outline
  if (config.needMCU) {
    const mcuW = 9.68, mcuH = 9.68; // 取自 DXF
    const mcuHalfW = mcuW / 2;
    const mcuAbsX = config.mcuX;
    const mcuAbsY = config.mcuY;
    const mcuVpx = mcuAbsX - holeOffX + pad;
    const mcuVpy = mcuAbsY - holeOffY + pad;
    const mcuCx = (mcuVpx + mcuW / 2);
    const mcuCy = (mcuVpy + mcuH / 2);
    const mcuRot = config.mcuRot || 0;

    svg += `<g transform="rotate(${mcuRot} ${mcuCx.toFixed(3)} ${mcuCy.toFixed(3)})">`;
    // 封装外轮廓 (取自 DXF)
    svg += `<polygon points="${outlinePoints(MCU_OUTLINE, mcuCx, mcuCy)}" fill="#d4e4f5" stroke="#4a7db5" stroke-width="0.3"/>`;
    // Pin 1 定位标记 (L 形线, 基于 DXF 轮廓)
    svg += `<line x1="${(mcuCx - mcuHalfW).toFixed(3)}" y1="${(mcuCy - mcuHalfW).toFixed(3)}" x2="${(mcuCx - mcuHalfW + 1).toFixed(3)}" y2="${(mcuCy - mcuHalfW).toFixed(3)}" stroke="#2a5d8f" stroke-width="0.4"/>`;
    svg += `<line x1="${(mcuCx - mcuHalfW).toFixed(3)}" y1="${(mcuCy - mcuHalfW).toFixed(3)}" x2="${(mcuCx - mcuHalfW).toFixed(3)}" y2="${(mcuCy - mcuHalfW + 1).toFixed(3)}" stroke="#2a5d8f" stroke-width="0.4"/>`;
    // 引脚焊盘 (每边 6 个)
    const pinLen = 0.6, pinWid = 0.35;
    const pinSpan = 8.0, pinPitch = pinSpan / 5;
    const pinStart = -pinSpan / 2;
    // 顶部/底部
    for (let pi = 0; pi < 6; pi++) {
      const px = mcuCx + pinStart + pi * pinPitch;
      svg += `<rect x="${(px - pinWid/2).toFixed(3)}" y="${(mcuCy - mcuHalfW - pinLen/2).toFixed(3)}" width="${pinWid.toFixed(3)}" height="${pinLen.toFixed(3)}" fill="#2a5d8f" rx="0.08"/>`;
      svg += `<rect x="${(px - pinWid/2).toFixed(3)}" y="${(mcuCy + mcuHalfW - pinLen/2).toFixed(3)}" width="${pinWid.toFixed(3)}" height="${pinLen.toFixed(3)}" fill="#2a5d8f" rx="0.08"/>`;
    }
    // 左右
    for (let pi = 0; pi < 6; pi++) {
      const py = mcuCy + pinStart + pi * pinPitch;
      svg += `<rect x="${(mcuCx - mcuHalfW - pinLen/2).toFixed(3)}" y="${(py - pinWid/2).toFixed(3)}" width="${pinLen.toFixed(3)}" height="${pinWid.toFixed(3)}" fill="#2a5d8f" rx="0.08"/>`;
      svg += `<rect x="${(mcuCx + mcuHalfW - pinLen/2).toFixed(3)}" y="${(py - pinWid/2).toFixed(3)}" width="${pinLen.toFixed(3)}" height="${pinWid.toFixed(3)}" fill="#2a5d8f" rx="0.08"/>`;
    }
    svg += `<text x="${mcuCx.toFixed(3)}" y="${(mcuCy + 1.0).toFixed(3)}" text-anchor="middle" font-size="2.5" fill="#4a7db5" font-family="sans-serif" font-weight="bold">MCU</text>`;
    svg += `</g>`;

    // ── DXF: MCU ──
    {
      const bodyCorners: [number, number][] = MCU_OUTLINE.map(([dx, dy]) => [mcuCx + dx, mcuCy + dy]);
      const bodyPts = mcuRot % 360 !== 0
        ? bodyCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, mcuRot, { x: mcuCx, y: mcuCy }); return [r.x, r.y] as [number, number]; })
        : bodyCorners;
      dxfPolygon(bodyPts);

      // Pin1 mark lines
      {
        let p1 = { x: mcuCx - mcuHalfW, y: mcuCy - mcuHalfW }, p2 = { x: mcuCx - mcuHalfW + 1, y: mcuCy - mcuHalfW };
        let q1 = { x: mcuCx - mcuHalfW, y: mcuCy - mcuHalfW }, q2 = { x: mcuCx - mcuHalfW, y: mcuCy - mcuHalfW + 1 };
        if (mcuRot % 360 !== 0) {
          p1 = rotatePoint(p1, mcuRot, { x: mcuCx, y: mcuCy });
          p2 = rotatePoint(p2, mcuRot, { x: mcuCx, y: mcuCy });
          q1 = rotatePoint(q1, mcuRot, { x: mcuCx, y: mcuCy });
          q2 = rotatePoint(q2, mcuRot, { x: mcuCx, y: mcuCy });
        }
        dxfLine(p1.x, p1.y, p2.x, p2.y);
        dxfLine(q1.x, q1.y, q2.x, q2.y);
      }

      // Pin pads: 12 rects (6 top, 6 bottom, 6 left, 6 right — 24 pads)
      const pinLen = 0.6, pinWid = 0.35;
      const pinSpan = 8.0, pinPitch = pinSpan / 5;
      const pinStart = -pinSpan / 2;
      for (let pi = 0; pi < 6; pi++) {
        const px = mcuCx + pinStart + pi * pinPitch;
        // Top edge pad
        const topCorners: [number, number][] = [
          [px - pinWid/2, mcuCy - mcuHalfW - pinLen/2],
          [px + pinWid/2, mcuCy - mcuHalfW - pinLen/2],
          [px + pinWid/2, mcuCy - mcuHalfW + pinLen/2],
          [px - pinWid/2, mcuCy - mcuHalfW + pinLen/2],
        ];
        const topPts = mcuRot % 360 !== 0
          ? topCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, mcuRot, { x: mcuCx, y: mcuCy }); return [r.x, r.y] as [number, number]; })
          : topCorners;
        dxfPolygon(topPts);
        // Bottom edge pad
        const botCorners: [number, number][] = [
          [px - pinWid/2, mcuCy + mcuHalfW - pinLen/2],
          [px + pinWid/2, mcuCy + mcuHalfW - pinLen/2],
          [px + pinWid/2, mcuCy + mcuHalfW + pinLen/2],
          [px - pinWid/2, mcuCy + mcuHalfW + pinLen/2],
        ];
        const botPts = mcuRot % 360 !== 0
          ? botCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, mcuRot, { x: mcuCx, y: mcuCy }); return [r.x, r.y] as [number, number]; })
          : botCorners;
        dxfPolygon(botPts);
      }
      for (let pi = 0; pi < 6; pi++) {
        const py = mcuCy + pinStart + pi * pinPitch;
        // Left edge pad
        const leftCorners: [number, number][] = [
          [mcuCx - mcuHalfW - pinLen/2, py - pinWid/2],
          [mcuCx - mcuHalfW + pinLen/2, py - pinWid/2],
          [mcuCx - mcuHalfW + pinLen/2, py + pinWid/2],
          [mcuCx - mcuHalfW - pinLen/2, py + pinWid/2],
        ];
        const leftPts = mcuRot % 360 !== 0
          ? leftCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, mcuRot, { x: mcuCx, y: mcuCy }); return [r.x, r.y] as [number, number]; })
          : leftCorners;
        dxfPolygon(leftPts);
        // Right edge pad
        const rightCorners: [number, number][] = [
          [mcuCx + mcuHalfW - pinLen/2, py - pinWid/2],
          [mcuCx + mcuHalfW + pinLen/2, py - pinWid/2],
          [mcuCx + mcuHalfW + pinLen/2, py + pinWid/2],
          [mcuCx + mcuHalfW - pinLen/2, py + pinWid/2],
        ];
        const rightPts = mcuRot % 360 !== 0
          ? rightCorners.map(([x, y]) => { const r = rotatePoint({ x, y }, mcuRot, { x: mcuCx, y: mcuCy }); return [r.x, r.y] as [number, number]; })
          : rightCorners;
        dxfPolygon(rightPts);
      }
    }

    componentRegions.push({
      id: "mcu",
      type: "mcu",
      x: mcuVpx, y: mcuVpy, w: mcuW, h: mcuH,
      absX: mcuAbsX, absY: mcuAbsY,
    });

    modelPlacements.push({
      type: "mcu",
      x: mcuAbsX + mcuW / 2,
      y: -mcuAbsY - mcuH / 2,
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
      [expanded.minX, -expanded.minY], [expanded.maxX, -expanded.minY],
      [expanded.maxX, -expanded.maxY], [expanded.minX, -expanded.maxY],
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

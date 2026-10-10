/**
 * 底棉 (Bottom Foam) 生成引擎
 *
 * 依托 PCB 编辑器生成，但形状更简单：只挖需要避让的孔——
 *  1. hotswap 轴座（solder=socket 时）按轴座模型 Z 投影外扩
 *  2. RGB 方孔（needLed）
 *  3. TypeC / 4P / MCU 轮廓孔
 * 不含开关孔 / 卫星轴孔。片材外形 = 孔位包围盒 + Edge Distance（矩形 + 圆角）。
 * 重叠孔做跨键布尔合并。
 */

import polygonClipping from "polygon-clipping";
import type { KLELayout } from "./kle-types";
import type { StpExtrudeData } from "./stp-export";
import type { SolderType, PCBSwitchRotations } from "./pcb-export";
import { computeBottomFoamGeometry } from "./pcb-export";
import type { CustomRect } from "./pcb-export";
import { cleanupCutoutHoles } from "./plate-export";

export interface BottomFoamConfig {
  solderType: SolderType;
  needLed: boolean;
  needTypeC: boolean; typeCX: number; typeCY: number; typeCRot: number;
  need4P: boolean; fourPX: number; fourPY: number; fourPRot: number;
  needMCU: boolean; mcuX: number; mcuY: number; mcuRot: number;
  /** 片材边距 (mm) */
  edgeDistance: number;
  /** 「圆角」：所有挖孔（外框以外的图形）圆角半径 (mm, 0 = 直角) */
  holeFillet: number;
  /** 「外框圆角」：片材外框四角圆角半径 (mm, 0 = 直角) */
  outerFillet: number;
  /** 短边开槽阈值 (mm)：消除交错开孔产生的 <此值 短边/碎边；0 = 关闭。默认 2 */
  minFeature?: number;
  /** 轴孔间薄壁阈值 (mm)：轴孔与轴孔间距 <此值时连通（切掉薄壁）；0 = 关闭。默认 0.4 */
  thinWall?: number;
  /** 用户自定义圆角矩形挖孔 */
  customRects?: CustomRect[];
}

/** 默认圆角 (mm) 与 STP 厚度 (mm) */
export const DEFAULT_BOTTOM_FOAM_FILLET = 0;
export const DEFAULT_BOTTOM_FOAM_THICKNESS = 3;

export interface BottomFoamResult {
  svg: string;
  dxf: string;
  width: number;
  height: number;
  stpData: StpExtrudeData | null;
  /** 视口原点信息 (供交互式矩形编辑器叠加层对齐) */
  minX: number;
  minY: number;
  pad: number;
}

type Pt2 = [number, number];
type ClipRing = Pt2[];
type ClipPoly = ClipRing[];

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
function unionPolys(polys: Pt2[][]): Pt2[][] {
  if (polys.length === 0) return [];
  if (polys.length === 1) return [polys[0]!];
  const [first, ...rest] = polys;
  const res = polygonClipping.union(pathToMP(first!), ...rest.map((p) => pathToMP(p)));
  return mpToPaths(res);
}

/**
 * 消除「轴孔与轴孔间」小于 gap(mm) 的薄壁。
 * 做法：找出分属不同挖孔、**互相平行且投影重叠、间距 ≤ gap** 的两条边，之间并入一个矩形连接块
 * （沿边方向 = 投影重叠段，垂直方向 = 两边间距）。只增补连接矩形，不改动其余边界 ——
 * 因此打通后所有转角仍是直角，不会产生圆弧近似折线造成的细小凸起。
 */
function closeThinWalls(holes: Pt2[][], gap: number): Pt2[][] {
  if (gap <= 0 || holes.length < 2) return holes;
  const M = 0.2; // 向两侧挖孔内延伸的余量，确保布尔并集连通
  const connectors: Pt2[][] = [];
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      const A = holes[i]!, B = holes[j]!;
      const ba = aabb(A), bb = aabb(B);
      const gx = Math.max(0, Math.max(bb[0] - ba[2], ba[0] - bb[2]));
      const gy = Math.max(0, Math.max(bb[1] - ba[3], ba[1] - bb[3]));
      if (Math.hypot(gx, gy) > gap) continue; // 包围盒太远
      for (let a = 0; a < A.length; a++) {
        const p1 = A[a]!, p2 = A[(a + 1) % A.length]!;
        const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        if (L < 1e-9) continue;
        const dx = (p2[0] - p1[0]) / L, dy = (p2[1] - p1[1]) / L;
        for (let b = 0; b < B.length; b++) {
          const q1 = B[b]!, q2 = B[(b + 1) % B.length]!;
          const L2 = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]);
          if (L2 < 1e-9) continue;
          const ex = (q2[0] - q1[0]) / L2, ey = (q2[1] - q1[1]) / L2;
          if (Math.abs(dx * ex + dy * ey) < 0.996) continue; // 不平行
          const rx = q1[0] - p1[0], ry = q1[1] - p1[1];
          const perpSigned = -dy * rx + dx * ry;
          const perpDist = Math.abs(perpSigned);
          if (perpDist > gap || perpDist < 1e-6) continue;
          const tq1 = rx * dx + ry * dy;
          const tq2 = (q2[0] - p1[0]) * dx + (q2[1] - p1[1]) * dy;
          const o0 = Math.max(0, Math.min(tq1, tq2));
          const o1 = Math.min(L, Math.max(tq1, tq2));
          if (o1 - o0 < 0.05) continue; // 投影无重叠
          const sgn = perpSigned >= 0 ? 1 : -1;
          const ux = sgn * -dy, uy = sgn * dx; // 由 A 指向 B 的单位法线
          const e0x = p1[0] + dx * o0, e0y = p1[1] + dy * o0;
          const e1x = p1[0] + dx * o1, e1y = p1[1] + dy * o1;
          connectors.push([
            [e0x - ux * M, e0y - uy * M],
            [e1x - ux * M, e1y - uy * M],
            [e1x + ux * (perpDist + M), e1y + uy * (perpDist + M)],
            [e0x + ux * (perpDist + M), e0y + uy * (perpDist + M)],
          ]);
        }
      }
    }
  }
  if (connectors.length === 0) return holes;
  return unionPolys([...holes, ...connectors]);
}
function aabb(pts: Pt2[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
function anyOverlap(polys: Pt2[][]): boolean {
  const boxes = polys.map(aabb);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1])) return true;
    }
  }
  return false;
}

export function generateBottomFoam(
  layout: KLELayout,
  config: BottomFoamConfig,
  switchRotations?: PCBSwitchRotations,
  compatKeyIndices?: Set<number>,
): BottomFoamResult {
  const geo = computeBottomFoamGeometry(layout, config, switchRotations, compatKeyIndices);
  const width = geo.maxX - geo.minX;
  const height = geo.maxY - geo.minY;
  if (geo.polys.length === 0 || width <= 0 || height <= 0) {
    return { svg: "", dxf: "", width: 0, height: 0, stpData: null, minX: 0, minY: 0, pad: 0 };
  }

  const merged = anyOverlap(geo.polys) ? unionPolys(geo.polys) : geo.polys;
  // 1) 短边开槽 + 丢弃被包围的悬空块（作用于**原始**挖孔）。
  //    圆角模式（holeFillet>0）几何含圆弧折线，开槽会削坏圆角 → 仅直角模式开槽；丢悬空块始终执行。
  const minFeature = config.minFeature ?? 2;
  const slotMin = (config.holeFillet ?? 0) > 0 ? 0 : minFeature;
  const work = cleanupCutoutHoles(
    merged.map((poly) => poly.map(([x, y]) => ({ x, y }))),
    slotMin,
  ).map((poly) => poly.map((p) => [p.x, p.y] as Pt2));
  // 2) 消除轴孔与轴孔间 <thinWall 的薄壁（定向矩形架桥，仅增补连接块、不改其余边界；
  //    连接块端部与两条对边对齐，不产生新的短边）。
  const thinWall = config.thinWall ?? 0.4;
  const holes = thinWall > 0 ? closeThinWalls(work, thinWall) : work;

  const pad = 5;
  const svgW = width + pad * 2;
  const svgH = height + pad * 2;
  // 「外框圆角」
  const outerR = Math.min(config.outerFillet > 0 ? config.outerFillet : 0, width / 2, height / 2);
  const vx = (x: number) => (x - geo.minX + pad).toFixed(3);
  const vy = (y: number) => (y - geo.minY + pad).toFixed(3);

  // ── SVG ──
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path{vector-effect:non-scaling-stroke}</style>
  <rect x="${pad}" y="${pad}" width="${width}" height="${height}" rx="${outerR}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>
  <g fill="#fff" stroke="#888" stroke-width="0.3">`;
  for (const poly of holes) {
    const d = poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${vx(x)},${vy(y)}`).join("") + "Z";
    svg += `<path d="${d}"/>`;
  }
  svg += `</g>`;

  // 兼容层：兼容键的挖孔以浅灰重绘（仅 SVG 预览，不影响 DXF/STP）
  const compatRaw = geo.compatPolys ?? [];
  if (compatRaw.length > 0) {
    const compatMerged = anyOverlap(compatRaw) ? unionPolys(compatRaw) : compatRaw;
    const compatClean = cleanupCutoutHoles(
      compatMerged.map((poly) => poly.map(([x, y]) => ({ x, y }))),
      slotMin,
    ).map((poly) => poly.map((p) => [p.x, p.y] as Pt2));
    const compatHoles = thinWall > 0 ? closeThinWalls(compatClean, thinWall) : compatClean;
    svg += `
  <g fill="lightgray" stroke="#888" stroke-width="0.3">`;
    for (const poly of compatHoles) {
      const d = poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${vx(x)},${vy(y)}`).join("") + "Z";
      svg += `<path d="${d}"/>`;
    }
    svg += `</g>`;
  }

  svg += `
</svg>`;

  // ── DXF ──
  const dxf = buildDXF(geo, holes, width, height, outerR);

  // ── STP ──
  const stpData: StpExtrudeData = {
    boundary: [
      [geo.minX, -geo.minY], [geo.maxX, -geo.minY],
      [geo.maxX, -geo.maxY], [geo.minX, -geo.maxY],
    ],
    polyHoles: holes.map((poly) => poly.map(([x, y]) => [x, -y] as [number, number])),
    circleHoles: [],
  };

  return { svg, dxf, width, height, stpData, minX: geo.minX, minY: geo.minY, pad };
}

// ─── DXF builder ────────────────────────────────────────

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, seg: number): [number, number][] {
  const pts: [number, number][] = [];
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function buildDXF(
  geo: { minX: number; minY: number; maxX: number; maxY: number },
  holes: Pt2[][], width: number, height: number, filletR: number,
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
  w(0); w("TABLE"); w(2); w("LAYER"); w(5); w("2"); w(70); w("3");
  w(0); w("LAYER"); w(5); w("10"); w(2); w("0"); w(70); w("0"); w(62); w("7"); w(6); w("Continuous");
  w(0); w("LAYER"); w(5); w("11"); w(2); w("FOAM"); w(70); w("0"); w(62); w("1"); w(6); w("Continuous");
  w(0); w("LAYER"); w(5); w("12"); w(2); w("CUT"); w(70); w("0"); w(62); w("5"); w(6); w("Continuous");
  w(0); w("ENDTAB"); w(0); w("ENDSEC");
  w(0); w("SECTION"); w(2); w("ENTITIES");

  const toDxf = (x: number, y: number): [number, number] => [x - geo.minX, -(y - geo.minY)];

  function addPoly(pts: Pt2[], layer: string) {
    if (pts.length < 3) return;
    w(0); w("POLYLINE"); w(8); w(layer); w(66); w("1"); w(70); w("1"); w(40); w("0.0"); w(41); w("0.0");
    for (const [x, y] of pts) {
      const [dx, dy] = toDxf(x, y);
      w(0); w("VERTEX"); w(8); w(layer);
      w(10); w(dx.toFixed(4)); w(20); w(dy.toFixed(4)); w(30); w("0.0");
    }
    w(0); w("SEQEND");
  }

  const x0 = geo.minX, y0 = geo.minY, x1 = geo.maxX, y1 = geo.maxY;
  const r = Math.min(filletR, width / 2, height / 2);
  const SEG = 4;
  const rect: Pt2[] = [];
  if (r > 0) {
    rect.push([x0 + r, y0], [x1 - r, y0]);
    rect.push(...arcPoints(x1 - r, y0 + r, r, -Math.PI / 2, 0, SEG));
    rect.push([x1, y1 - r]);
    rect.push(...arcPoints(x1 - r, y1 - r, r, 0, Math.PI / 2, SEG));
    rect.push([x0 + r, y1]);
    rect.push(...arcPoints(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, SEG));
    rect.push([x0, y0 + r]);
    rect.push(...arcPoints(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, SEG));
  } else {
    rect.push([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
  }
  addPoly(rect, "FOAM");

  for (const poly of holes) addPoly(poly, "CUT");

  w(0); w("ENDSEC"); w(0); w("EOF");
  return lines.join("\r\n");
}

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
import { filletPolygon } from "./plate-export";

export interface BottomFoamConfig {
  solderType: SolderType;
  needLed: boolean;
  needTypeC: boolean; typeCX: number; typeCY: number; typeCRot: number;
  need4P: boolean; fourPX: number; fourPY: number; fourPRot: number;
  needMCU: boolean; mcuX: number; mcuY: number; mcuRot: number;
  /** 片材边距 (mm) */
  edgeDistance: number;
  /** 外形圆角半径 (mm, 0 = 直角) */
  fillet: number;
  /** 用户自定义圆角矩形挖孔 */
  customRects?: CustomRect[];
}

/** 默认外形圆角 (mm) 与 STP 厚度 (mm) */
export const DEFAULT_BOTTOM_FOAM_FILLET = 1;
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
): BottomFoamResult {
  const geo = computeBottomFoamGeometry(layout, config, switchRotations);
  const width = geo.maxX - geo.minX;
  const height = geo.maxY - geo.minY;
  if (geo.polys.length === 0 || width <= 0 || height <= 0) {
    return { svg: "", dxf: "", width: 0, height: 0, stpData: null, minX: 0, minY: 0, pad: 0 };
  }

  const merged = anyOverlap(geo.polys) ? unionPolys(geo.polys) : geo.polys;
  // 合并后所有直角 → 圆角 (R config.fillet)
  const holes = config.fillet > 0
    ? merged.map((p) => filletPolygon(p.map(([x, y]) => ({ x, y })), config.fillet, 4).map((q) => [q.x, q.y] as Pt2))
    : merged;

  const pad = 5;
  const svgW = width + pad * 2;
  const svgH = height + pad * 2;
  const filletR = Math.min(config.fillet > 0 ? config.fillet : 0, width / 2, height / 2);
  const vx = (x: number) => (x - geo.minX + pad).toFixed(3);
  const vy = (y: number) => (y - geo.minY + pad).toFixed(3);

  // ── SVG ──
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path{vector-effect:non-scaling-stroke}</style>
  <rect x="${pad}" y="${pad}" width="${width}" height="${height}" rx="${filletR}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>
  <g fill="#fff" stroke="#888" stroke-width="0.3">`;
  for (const poly of holes) {
    const d = poly.map(([x, y], i) => `${i === 0 ? "M" : "L"}${vx(x)},${vy(y)}`).join("") + "Z";
    svg += `<path d="${d}"/>`;
  }
  svg += `</g>
</svg>`;

  // ── DXF ──
  const dxf = buildDXF(geo, holes, width, height, filletR);

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

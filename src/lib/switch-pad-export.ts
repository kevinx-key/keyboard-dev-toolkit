/**
 * 轴下垫 (Under-Switch Pad) 生成引擎
 *
 * 依托 PCB 编辑器生成：读取 PCB 的 solder type / 卫星轴 / RGB 设置，
 * 对应生成开关孔、卫星轴孔、LED 方孔（socket 上方两个 3mm 大圆 → 1mm 直径），
 * 不含 4P/TypeC/MCU；片材外形 = 键位包围盒 + Edge Distance（矩形 + 圆角）。
 *
 * 错位重合的轴：所有孔做跨键布尔合并（而非叠加）。
 */

import polygonClipping from "polygon-clipping";
import type { KLELayout } from "./kle-types";
import type { StpExtrudeData } from "./stp-export";
import type { SolderType, PCBSwitchRotations, PCBStabRotations } from "./pcb-export";
import { computeSwitchPadGeometry } from "./pcb-export";
import type { SwitchPadGeometry } from "./pcb-export";

export interface SwitchPadConfig {
  solderType: SolderType;
  needStab: boolean;
  needLed: boolean;
  /** 片材边距 (mm) */
  edgeDistance: number;
  /** 外形圆角半径 (mm, 0 = 直角) */
  fillet: number;
}

/** 默认外框圆角 (mm) */
export const DEFAULT_PAD_FILLET = 0;

export interface SwitchPadResult {
  svg: string;
  dxf: string;
  width: number;
  height: number;
  /** SVG 用户坐标原点偏移（mm），供叠加层对齐 */
  minX: number;
  minY: number;
  /** SVG 边距（mm） */
  pad: number;
  stpData: StpExtrudeData | null;
}

// ─── 孔几何 / 布尔合并 ──────────────────────────────────

type Shape = { kind: "circle"; x: number; y: number; r: number } | { kind: "poly"; pts: [number, number][] };
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
function circleToPoly(x: number, y: number, r: number, seg = 32): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
  }
  return pts;
}
function circleFromRing(ring: Pt2[]): { x: number; y: number; r: number } | null {
  const v: Pt2[] = [];
  for (const p of ring) {
    const q = v[v.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) v.push(p);
  }
  while (v.length > 1 && Math.hypot(v[0]![0] - v[v.length - 1]![0], v[0]![1] - v[v.length - 1]![1]) <= 1e-6) v.pop();
  if (v.length < 8) return null;
  let sx = 0, sy = 0;
  for (const [x, y] of v) { sx += x; sy += y; }
  const x = sx / v.length, y = sy / v.length;
  let r = 0;
  for (const [px, py] of v) r += Math.hypot(px - x, py - y);
  r /= v.length;
  if (r < 1e-6) return null;
  for (const [px, py] of v) if (Math.abs(Math.hypot(px - x, py - y) - r) > 1e-3) return null;
  return { x, y, r };
}
function shapeAabb(s: Shape): [number, number, number, number] {
  if (s.kind === "circle") return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of s.pts) {
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
/** 任一两个孔的外包围盒相交 → 需要布尔合并（保守判定） */
function anyOverlap(shapes: Shape[]): boolean {
  const boxes = shapes.map(shapeAabb);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j]!;
      if (!(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1])) return true;
    }
  }
  return false;
}
/** 布尔合并所有孔；孤立的正圆还原为圆，其余输出多边形 */
function unionShapes(shapes: Shape[]): Shape[] {
  const polys = shapes.map((s) => (s.kind === "circle" ? circleToPoly(s.x, s.y, s.r) : s.pts));
  return unionPolys(polys).map((ring): Shape => {
    const c = circleFromRing(ring);
    return c ? { kind: "circle", x: c.x, y: c.y, r: c.r } : { kind: "poly", pts: ring };
  });
}

export function generateSwitchPad(
  layout: KLELayout,
  config: SwitchPadConfig,
  switchRotations?: PCBSwitchRotations,
  stabRotations?: PCBStabRotations,
  compatKeyIndices?: Set<number>,
): SwitchPadResult {
  const geo = computeSwitchPadGeometry(layout, config, switchRotations, stabRotations, compatKeyIndices);
  const width = geo.maxX - geo.minX;
  const height = geo.maxY - geo.minY;
  if ((geo.circles.length === 0 && geo.polys.length === 0) || width <= 0 || height <= 0) {
    return { svg: "", dxf: "", width: 0, height: 0, minX: 0, minY: 0, pad: 5, stpData: null };
  }

  const shapes: Shape[] = [
    ...geo.circles.map((c): Shape => ({ kind: "circle", x: c.x, y: c.y, r: c.r })),
    ...geo.polys.map((pts): Shape => ({ kind: "poly", pts })),
  ];
  const emitShapes = anyOverlap(shapes) ? unionShapes(shapes) : shapes;

  const pad = 5;
  const svgW = width + pad * 2;
  const svgH = height + pad * 2;
  const filletR = Math.min(config.fillet > 0 ? config.fillet : 0, width / 2, height / 2);
  const vx = (x: number) => (x - geo.minX + pad).toFixed(3);
  const vy = (y: number) => (y - geo.minY + pad).toFixed(3);

  // ── SVG ──
  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW.toFixed(1)} ${svgH.toFixed(1)}" width="${svgW.toFixed(1)}mm" height="${svgH.toFixed(1)}mm" style="max-width:100%;height:auto">
  <style>path,circle{vector-effect:non-scaling-stroke}</style>
  <rect x="${pad}" y="${pad}" width="${width}" height="${height}" rx="${filletR}" fill="#e8e8e8" stroke="#bbb" stroke-width="0.5"/>
  <g fill="#fff" stroke="#888" stroke-width="0.3">`;
  for (const s of emitShapes) {
    if (s.kind === "circle") {
      svg += `<circle cx="${vx(s.x)}" cy="${vy(s.y)}" r="${s.r.toFixed(3)}"/>`;
    } else {
      const d = s.pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${vx(x)},${vy(y)}`).join("") + "Z";
      svg += `<path d="${d}"/>`;
    }
  }
  svg += `</g>`;

  // 兼容层：兼容键的孔以浅灰重绘（仅 SVG 预览，不影响 DXF/STP）
  const compatShapes: Shape[] = [
    ...(geo.compatCircles ?? []).map((c): Shape => ({ kind: "circle", x: c.x, y: c.y, r: c.r })),
    ...(geo.compatPolys ?? []).map((pts): Shape => ({ kind: "poly", pts })),
  ];
  if (compatShapes.length > 0) {
    const grayShapes = anyOverlap(compatShapes) ? unionShapes(compatShapes) : compatShapes;
    svg += `
  <g fill="lightgray" stroke="#888" stroke-width="0.3">`;
    for (const s of grayShapes) {
      if (s.kind === "circle") {
        svg += `<circle cx="${vx(s.x)}" cy="${vy(s.y)}" r="${s.r.toFixed(3)}"/>`;
      } else {
        svg += `<path d="${s.pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${vx(x)},${vy(y)}`).join("") + "Z"}"/>`;
      }
    }
    svg += `</g>`;
  }

  svg += `
</svg>`;

  // ── DXF ──
  const dxf = buildDXF(emitShapes, geo, width, height, filletR);

  // ── STP ──
  const circleHoles: [number, number, number][] = [];
  const polyHoles: [number, number][][] = [];
  for (const s of emitShapes) {
    if (s.kind === "circle") circleHoles.push([s.x, -s.y, s.r]);
    else polyHoles.push(s.pts.map(([x, y]) => [x, -y] as [number, number]));
  }
  const stpData: StpExtrudeData = {
    boundary: [
      [geo.minX, -geo.minY], [geo.maxX, -geo.minY],
      [geo.maxX, -geo.maxY], [geo.minX, -geo.maxY],
    ],
    polyHoles,
    circleHoles,
  };

  return { svg, dxf, width, height, minX: geo.minX, minY: geo.minY, pad, stpData };
}

// ─── DXF builder (片材圆角外框 + 圆孔 + 多边形孔) ──────────

function arcPoints(cx: number, cy: number, r: number, a0: number, a1: number, seg: number): [number, number][] {
  const pts: [number, number][] = [];
  const step = (a1 - a0) / seg;
  for (let i = 1; i <= seg; i++) {
    const a = a0 + step * i;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function buildDXF(shapes: Shape[], geo: SwitchPadGeometry, width: number, height: number, filletR: number): string {
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
  w(0); w("LAYER"); w(5); w("11"); w(2); w("PAD"); w(70); w("0"); w(62); w("1"); w(6); w("Continuous");
  w(0); w("LAYER"); w(5); w("12"); w(2); w("CUT"); w(70); w("0"); w(62); w("5"); w(6); w("Continuous");
  w(0); w("ENDTAB"); w(0); w("ENDSEC");
  w(0); w("SECTION"); w(2); w("ENTITIES");

  const toDxf = (x: number, y: number): [number, number] => [x - geo.minX, -(y - geo.minY)];

  function addPoly(pts: [number, number][], layer: string) {
    if (pts.length < 3) return;
    w(0); w("POLYLINE"); w(8); w(layer); w(66); w("1"); w(70); w("1"); w(40); w("0.0"); w(41); w("0.0");
    for (const [x, y] of pts) {
      const [dx, dy] = toDxf(x, y);
      w(0); w("VERTEX"); w(8); w(layer);
      w(10); w(dx.toFixed(4)); w(20); w(dy.toFixed(4)); w(30); w("0.0");
    }
    w(0); w("SEQEND");
  }

  // 圆角矩形外框
  const x0 = geo.minX, y0 = geo.minY, x1 = geo.maxX, y1 = geo.maxY;
  const r = Math.min(filletR, width / 2, height / 2);
  const SEG = 4;
  const rect: [number, number][] = [];
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
  addPoly(rect, "PAD");

  for (const s of shapes) {
    if (s.kind === "circle") {
      const [dx, dy] = toDxf(s.x, s.y);
      w(0); w("CIRCLE"); w(8); w("CUT");
      w(10); w(dx.toFixed(4)); w(20); w(dy.toFixed(4)); w(30); w("0.0");
      w(40); w(s.r.toFixed(4));
    } else {
      addPoly(s.pts, "CUT");
    }
  }

  w(0); w("ENDSEC"); w(0); w("EOF");
  return lines.join("\r\n");
}

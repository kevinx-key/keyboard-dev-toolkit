import { describe, it, expect } from 'vitest';
import { generateBottomFoam, DEFAULT_BOTTOM_FOAM_THICKNESS } from '@/lib/bottom-foam-export';
import type { BottomFoamConfig } from '@/lib/bottom-foam-export';
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from '@/lib/kle-types';

function mk(o: Partial<KeyProps> = {}): KeyProps { return { ...DEFAULT_PROPS, ...o }; }
function layout(keys: KeyProps[]): KLELayout { return { meta: { ...DEFAULT_META, name: "BF" }, keys }; }

const BASE: BottomFoamConfig = {
  solderType: "socket", needLed: false,
  needTypeC: false, typeCX: 0, typeCY: 0, typeCRot: 0,
  need4P: false, fourPX: 0, fourPY: 0, fourPRot: 0,
  needMCU: false, mcuX: 0, mcuY: 0, mcuRot: 0,
  edgeDistance: 3, holeFillet: 1, outerFillet: 1,
};
const TWO = [mk({ x: 0, y: 0 }), mk({ x: 1, y: 0 })];

describe("generateBottomFoam", () => {
  it("default STP thickness constant is 3mm", () => {
    expect(DEFAULT_BOTTOM_FOAM_THICKNESS).toBe(3);
  });

  it("returns empty for empty layout", () => {
    const r = generateBottomFoam(layout([]), BASE);
    expect(r.svg).toBe("");
    expect(r.stpData).toBeNull();
  });

  it("socket: one hotswap cutout per key, no switch/stab holes", () => {
    const r = generateBottomFoam(layout(TWO), BASE);
    expect(r.stpData!.polyHoles.length).toBe(2);
    expect(r.stpData!.circleHoles.length).toBe(0);
  });

  it("非 hotswap（sunken）无孔 → 空结果", () => {
    const r = generateBottomFoam(layout(TWO), { ...BASE, solderType: "sunken" });
    expect(r.svg).toBe("");
    expect(r.stpData).toBeNull();
  });

  it("needLed adds one square hole per key", () => {
    const r = generateBottomFoam(layout(TWO), { ...BASE, solderType: "sunken", needLed: true });
    expect(r.stpData!.polyHoles.length).toBe(2); // 2 LED (无轴座孔)
  });

  it("socket + needLed: hotswap 与 RGB 贯通合并", () => {
    const r = generateBottomFoam(layout(TWO), { ...BASE, needLed: true });
    expect(r.stpData!.polyHoles.length).toBe(2); // 每键 hotswap+LED+连接条 → 1
  });

  it("adds TypeC / 4P / MCU outline holes", () => {
    const withMc = generateBottomFoam(layout(TWO), { ...BASE, needMCU: true, mcuX: 200, mcuY: 200 });
    expect(withMc.stpData!.polyHoles.length).toBe(3); // 2 hotswap + 1 MCU
    const connectors = generateBottomFoam(layout(TWO), { ...BASE, solderType: "sunken", needTypeC: true, need4P: true, fourPX: 200, fourPY: 200 });
    expect(connectors.stpData!.polyHoles.length).toBe(2); // TypeC + 4P (分开摆放)
  });

  it("boolean-merges overlapping hotswap cutouts", () => {
    const spaced = generateBottomFoam(layout([mk({ x: 0, y: 0 }), mk({ x: 1, y: 0 })]), BASE);
    const overlap = generateBottomFoam(layout([mk({ x: 0, y: 0 }), mk({ x: 0.4, y: 0 })]), BASE);
    expect(spaced.stpData!.polyHoles.length).toBe(2);
    expect(overlap.stpData!.polyHoles.length).toBeLessThan(2);
  });

  it("DXF contains foam outline + cut polylines", () => {
    const r = generateBottomFoam(layout(TWO), BASE);
    expect(r.dxf).toContain("SECTION");
    expect(r.dxf).toContain("FOAM");
    expect(r.dxf).toContain("CUT");
    expect(r.dxf).toContain("POLYLINE");
  });

  it("adds user custom rectangles (rounded, rotatable)", () => {
    const r = generateBottomFoam(layout(TWO), { ...BASE, customRects: [{ cx: 100, cy: 100, w: 10, h: 6, r: 1, rot: 30 }] });
    expect(r.stpData!.polyHoles.length).toBe(3); // 2 hotswap + 1 custom
  });

  it("hotswap 圆角矩形的四角随「圆角」(holeFillet) 变化", () => {
    const a = generateBottomFoam(layout(TWO), { ...BASE, holeFillet: 0 }).svg;
    const b = generateBottomFoam(layout(TWO), { ...BASE, holeFillet: 2 }).svg;
    expect(a).not.toBe(b);
  });

  it("matches snapshot", () => {
    expect(generateBottomFoam(layout(TWO), { ...BASE, needLed: true })).toMatchSnapshot();
  });
});

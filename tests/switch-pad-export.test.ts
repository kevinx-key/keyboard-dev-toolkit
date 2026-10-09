import { describe, it, expect } from 'vitest';
import { generateSwitchPad } from '@/lib/switch-pad-export';
import type { SwitchPadConfig } from '@/lib/switch-pad-export';
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from '@/lib/kle-types';

function mk(overrides: Partial<KeyProps> = {}): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}
function layout(keys: KeyProps[]): KLELayout {
  return { meta: { ...DEFAULT_META, name: "PadTest" }, keys };
}
const KEYS = [mk({ x: 0, y: 0 }), mk({ x: 1, y: 0 }), mk({ x: 0, y: 1, w: 2 }), mk({ x: 2, y: 0 })];
const BASE: SwitchPadConfig = { solderType: "sunken", needStab: true, needLed: false, edgeDistance: 3, fillet: 1 };

function radiiCount(radii: number[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of radii) { const k = String(r); m[k] = (m[k] ?? 0) + 1; }
  return m;
}

describe("generateSwitchPad", () => {
  it("returns empty result for empty layout", () => {
    const r = generateSwitchPad(layout([]), BASE);
    expect(r.svg).toBe("");
    expect(r.dxf).toBe("");
    expect(r.width).toBe(0);
    expect(r.stpData).toBeNull();
  });

  it("socket: 轴体上方两个 3mm 大圆 → 1mm 直径", () => {
    const r = generateSwitchPad(layout(KEYS), { ...BASE, solderType: "socket" });
    const radii = r.stpData!.circleHoles.map((h) => h[2]);
    const c = radiiCount(radii);
    // 4 键 × 2 个上方大孔 = 8 个 → r=0.5 (1mm 直径)
    expect(c["0.5"]).toBe(8);
    // 不应再有热插拔原 3mm 大圆 (r=1.5) 的开关孔；仅卫星轴孔仍有 r=1.5
    expect(c["1.5"]).toBe(2);
  });

  it("sunken 不改变上方大孔 (保持 r=0.75)", () => {
    const r = generateSwitchPad(layout(KEYS), { ...BASE, solderType: "sunken" });
    const c = radiiCount(r.stpData!.circleHoles.map((h) => h[2]));
    expect(c["0.5"]).toBeUndefined();
    expect(c["0.75"]).toBe(8);
  });

  it("generates LED square holes only when needLed", () => {
    expect(generateSwitchPad(layout(KEYS), { ...BASE, needLed: false }).stpData!.polyHoles.length).toBe(0);
    expect(generateSwitchPad(layout(KEYS), { ...BASE, needLed: true }).stpData!.polyHoles.length).toBe(KEYS.length);
  });

  it("sheet size = key bbox + 2 × edgeDistance", () => {
    const r = generateSwitchPad(layout(KEYS), { ...BASE, edgeDistance: 3 });
    // 3u × 2u = 57.15 × 38.1 ; + 2×3 = 63.15 × 44.1
    expect(r.width).toBeCloseTo(57.15 + 6, 1);
    expect(r.height).toBeCloseTo(38.1 + 6, 1);
  });

  it("DXF contains sheet outline + cut circles", () => {
    const r = generateSwitchPad(layout(KEYS), BASE);
    expect(r.dxf).toContain("SECTION");
    expect(r.dxf).toContain("PAD");
    expect(r.dxf).toContain("CUT");
    expect(r.dxf).toContain("CIRCLE");
    expect(r.dxf).toContain("POLYLINE");
  });

  it("boolean-merges overlapping keys' holes; spaced keys stay as circles", () => {
    const mkLay = (xs: number[]) => layout(xs.map((x) => mk({ x, y: 0 })));
    const paths = (svg: string) => (svg.match(/<path/g) || []).length;
    expect(paths(generateSwitchPad(mkLay([0, 1]), BASE).svg)).toBe(0);
    expect(paths(generateSwitchPad(mkLay([0, 0.5]), BASE).svg)).toBeGreaterThan(0);
  });

  it("matches snapshot", () => {
    expect(generateSwitchPad(layout(KEYS), { ...BASE, solderType: "socket", needLed: true })).toMatchSnapshot();
  });
});

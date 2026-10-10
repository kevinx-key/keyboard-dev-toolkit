import { describe, it, expect } from 'vitest';
import { generateSwitchFoam, DEFAULT_FOAM_THICKNESS } from '@/lib/switch-foam-export';
import type { SwitchFoamConfig } from '@/lib/switch-foam-export';
import { generatePlate } from '@/lib/plate-export';
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from '@/lib/kle-types';

// ─── Fixture builders (mirrors tests/plate-export.test.ts) ───────────

function mkKey(overrides: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}

function key1u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1, h: 1 });
}

function key125u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1.25, h: 1 });
}

/** ISO Enter: L-shape, 2u tall */
function isoEnter(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 });
}

function spacebar(x: number, y: number, w: number): KeyProps {
  return mkKey({ x, y, w, h: 1 });
}

function makeLayout(keys: KeyProps[], name = "Test"): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

const FIXTURE_LAYOUT = makeLayout([
  key1u(0, 0),
  key1u(1, 0),
  key1u(2, 0),
  key125u(0, 1),
  isoEnter(1.25, 1),
], "switch-foam-fixture");

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe("generateSwitchFoam", () => {
  it("exposes a default thickness constant of 3mm", () => {
    expect(DEFAULT_FOAM_THICKNESS).toBe(3);
  });

  it("returns empty result for layout with no keys", () => {
    const empty = generateSwitchFoam(makeLayout([]));
    expect(empty.svg).toBe("");
    expect(empty.dxf).toBe("");
    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
    expect(empty.stpData).toBeNull();
    expect(empty.regions).toEqual([]);
  });

  it("diverges from the plate geometry (矩形卫星轴孔 + 顶部横槽 + 圆角)", () => {
    const wide = makeLayout([spacebar(0, 0, 6.25)]);
    const foam = generateSwitchFoam(wide);
    const plate = generatePlate(wide);
    expect(foam.svg).not.toBe(plate.svg);
    expect(foam.dxf).not.toBe(plate.dxf);
    expect(foam.cutPathLength).not.toBe(plate.cutPathLength);
  });

  it("outer fillet (default 0) applies to the frame; override honored", () => {
    const layout = makeLayout([spacebar(0, 0, 6.25)]);
    expect(generateSwitchFoam(layout).svg).toContain('rx="0"');
    const cfg: Partial<SwitchFoamConfig> = { fillet: 3 };
    expect(generateSwitchFoam(layout, cfg).svg).toContain('rx="3"');
  });

  it("thickness does not affect 2D geometry (only used for 3D extrusion)", () => {
    const thin = generateSwitchFoam(FIXTURE_LAYOUT, { thickness: 1 });
    const thick = generateSwitchFoam(FIXTURE_LAYOUT, { thickness: 9 });
    expect(thin.svg).toBe(thick.svg);
    expect(thin.dxf).toBe(thick.dxf);
  });

  it("kerf compensation enlarges cutouts", () => {
    const withKerf = generateSwitchFoam(makeLayout([key1u(0, 0)]), { kerf: 0.2 });
    const noKerf = generateSwitchFoam(makeLayout([key1u(0, 0)]));
    expect(withKerf.cutPathLength).toBeGreaterThan(noKerf.cutPathLength);
  });

  it("stabType=0 removes stabilizer cutouts for wide keys", () => {
    const withStab = generateSwitchFoam(makeLayout([spacebar(0, 0, 6.25)]), { stabType: 1 });
    const noStab = generateSwitchFoam(makeLayout([spacebar(0, 0, 6.25)]), { stabType: 0 });
    expect(noStab.cutPathLength).toBeLessThan(withStab.cutPathLength);
  });

  it("boolean-merges overlapping keys into a single hole (no stacking)", () => {
    expect(generateSwitchFoam(makeLayout([key1u(0, 0), key1u(1, 0)])).stpData!.polyHoles.length).toBe(2);
    expect(generateSwitchFoam(makeLayout([key1u(0, 0), key1u(0.5, 0)])).stpData!.polyHoles.length).toBe(1);
  });

  it("short-edge slotting runs before fillet and keeps geometry valid", () => {
    // 交错产生短边时，短边开槽会把它们消除；这里确保生成不崩且 SVG/DXF 非空
    const r = generateSwitchFoam(makeLayout([key1u(0, 0), key1u(1, 0)]));
    expect(r.svg).toContain("<svg");
    expect((r.stpData?.polyHoles.length ?? 0) + (r.stpData?.circleHoles.length ?? 0)).toBeGreaterThan(0);
  });

  it("removes every sub-2mm short edge (slot stops at the nearest perpendicular edge)", () => {
    // 回归：ISO Enter 等交错开孔产生的 {0.75,1.525}mm 短边必须被完全消除，
    // 且短边开槽不得越过垂边继续切削（否则会残留细小的轴间间隔）。
    const holes = generateSwitchFoam(FIXTURE_LAYOUT).stpData!.polyHoles;
    let shortest = Infinity;
    for (const poly of holes) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
        if (len > 1e-6 && len < shortest) shortest = len;
      }
    }
    expect(shortest).toBeGreaterThanOrEqual(2 - 1e-6);
  });

  it("short-edge cleanup never bridges to a non-overlapping neighbor row (syrin65 regression)", () => {
    // 7u 空格 + 重叠的兼容常规 RAlt 同属一个键组；空格旋转 180° 曾使清理通道贯通到
    // 上方不相交的另一行按键。修复后：任何挖孔的纵向跨度都不得超过单键高度量级。
    const layout = makeLayout([
      mkKey({ x: 0, y: 0, w: 7, h: 1 }),      // 7u 空格
      mkKey({ x: 6, y: 0, w: 1.25, h: 1 }),   // 重叠的兼容常规 RAlt（同组）
      key1u(6.25, 2),                          // 两行之上、与之不相交的按键
    ], "syrin-regression");
    const r = generateSwitchFoam(layout, { minFeature: 2 }, { 0: 180 });
    let tallest = 0;
    for (const poly of r.stpData!.polyHoles) {
      const ys = poly.map((p) => p[1]);
      tallest = Math.max(tallest, Math.max(...ys) - Math.min(...ys));
    }
    expect(tallest).toBeLessThan(30);
  });

  it("minFeature config controls short-edge slotting (0 = off)", () => {
    const shortestEdge = (r: ReturnType<typeof generateSwitchFoam>) => {
      let m = Infinity;
      for (const poly of r.stpData!.polyHoles) {
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
          const len = Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
          if (len > 1e-6 && len < m) m = len;
        }
      }
      return m;
    };
    expect(shortestEdge(generateSwitchFoam(FIXTURE_LAYOUT, { minFeature: 0 }))).toBeLessThan(2);
    expect(shortestEdge(generateSwitchFoam(FIXTURE_LAYOUT, { minFeature: 2 }))).toBeGreaterThanOrEqual(2 - 1e-6);
  });

  it("matches snapshot", () => {
    expect(generateSwitchFoam(FIXTURE_LAYOUT)).toMatchSnapshot();
  });
});

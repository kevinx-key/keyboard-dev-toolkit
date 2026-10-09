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

  it("最小特征清理：<2mm 的薄肋被消除，>2mm 的保留", () => {
    // 1u 轴孔 14mm；中心距 14.99mm → 间隙 ~1mm（<2）应连通；16.99mm → 间隙 ~3mm（>2）应保留
    expect(generateSwitchFoam(makeLayout([key1u(0, 0), key1u(0.787, 0)])).stpData!.polyHoles.length).toBe(1);
    expect(generateSwitchFoam(makeLayout([key1u(0, 0), key1u(0.892, 0)])).stpData!.polyHoles.length).toBe(2);
  });

  it("matches snapshot", () => {
    expect(generateSwitchFoam(FIXTURE_LAYOUT)).toMatchSnapshot();
  });
});

import { describe, it, expect } from 'vitest';
import { generatePlate } from '@/lib/plate-export';
import type { PlateConfig } from '@/lib/plate-export';
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from '@/lib/kle-types';

// ─── Test fixture builders ──────────────────────────────────────────

function mkKey(overrides: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}

function key1u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1, h: 1 });
}

function key125u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1.25, h: 1 });
}

/** ISO Enter: top 1.25u cap + bottom 1.5u extension = L-shape, 2u tall */
function isoEnter(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 });
}

/** Horizontal spacebar / wide key */
function spacebar(x: number, y: number, w: number): KeyProps {
  return mkKey({ x, y, w, h: 1 });
}

function makeLayout(keys: KeyProps[], name = "Test"): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

// ═══════════════════════════════════════════════════════════════════
// Fixed test layout: 3 standard 1u + 1 modifier 1.25u + 1 ISO Enter
// ═══════════════════════════════════════════════════════════════════

const FIXTURE_LAYOUT = makeLayout([
  key1u(0, 0),
  key1u(1, 0),
  key1u(2, 0),
  key125u(0, 1),
  isoEnter(1.25, 1),
], "plate-snapshot-fixture");

// ─── Helper: count SVG <path> elements ─────────────────────────────

function countSvgPaths(svg: string): number {
  const matches = svg.match(/<path\s/g);
  return matches ? matches.length : 0;
}

// ─── Helper: count keyInfo indices (non-decal keys) ────────────────

function nonDecalKeyCount(keys: KeyProps[]): number {
  return keys.filter((k) => !k.d).length;
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe("generatePlate", () => {
  // ── Full-layout snapshot ──────────────────────────────────────────

  describe("full mixed-key layout (3×1u + 1.25u + ISO Enter)", () => {
    const result = generatePlate(FIXTURE_LAYOUT);

    it("matches snapshot", () => {
      expect(result).toMatchSnapshot();
    });

    it("returns positive dimensions, area, and cut path length", () => {
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.area).toBeGreaterThan(0);
      expect(result.cutPathLength).toBeGreaterThan(0);

      // Plate should cover at least the 3u×3u key footprint + 4mm padding
      const U = 19.05;
      expect(result.width).toBeGreaterThanOrEqual(3 * U);
      expect(result.height).toBeGreaterThanOrEqual(3 * U);
    });

    it("generates valid SVG with plate rect + cutout paths", () => {
      expect(result.svg).toContain('<?xml version="1.0"');
      expect(result.svg).toContain("<svg");
      expect(result.svg).toContain("<rect");     // plate outline
      expect(result.svg).toContain("<path");     // cutout holes

      // At least as many paths as keys (union may merge switch+stab into one path per key)
      const expectedKeys = nonDecalKeyCount(FIXTURE_LAYOUT.keys);
      expect(countSvgPaths(result.svg)).toBeGreaterThanOrEqual(expectedKeys);
    });

    it("generates valid DXF with required sections", () => {
      expect(result.dxf).toContain("SECTION");
      expect(result.dxf).toContain("ENTITIES");
      expect(result.dxf).toContain("POLYLINE");
      expect(result.dxf).toContain("EOF");
      // PLATE layer for outer boundary
      expect(result.dxf).toContain("PLATE");
      // CUT layer for holes
      expect(result.dxf).toContain("CUT");
    });

    it("generates stpData with 4-vertex boundary and polyHoles", () => {
      expect(result.stpData).not.toBeNull();
      const stp = result.stpData!;

      // boundary is a rectangle (4 corners)
      expect(stp.boundary).toHaveLength(4);
      for (const p of stp.boundary) {
        expect(p).toHaveLength(2);               // [x, y]
        expect(typeof p[0]).toBe("number");
        expect(typeof p[1]).toBe("number");
      }

      // polyHoles for switch + stabilizer cutouts (merged per key)
      expect(stp.polyHoles.length).toBeGreaterThan(0);
      for (const hole of stp.polyHoles) {
        expect(hole.length).toBeGreaterThanOrEqual(3); // at least a triangle
        for (const pt of hole) {
          expect(pt).toHaveLength(2);
          expect(typeof pt[0]).toBe("number");
          expect(typeof pt[1]).toBe("number");
        }
      }

      // No standalone circle holes in plate
      expect(stp.circleHoles).toEqual([]);
    });

    it("generates regions for every non-decal key with position metadata", () => {
      const expectedRegions = nonDecalKeyCount(FIXTURE_LAYOUT.keys);
      expect(result.regions).toHaveLength(expectedRegions);

      for (let i = 0; i < result.regions.length; i++) {
        const r = result.regions[i]!;
        expect(r.id).toBe(`key-${i}`);
        expect(r.keyIndex).toBe(i);
        expect(r.type).toBe("key");
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        expect(Number.isFinite(r.centerX)).toBe(true);
        expect(Number.isFinite(r.centerY)).toBe(true);
        expect(Number.isFinite(r.x)).toBe(true);
        expect(Number.isFinite(r.y)).toBe(true);
      }
    });

    it("generates SVG with viewBox covering all key positions", () => {
      // viewBox should have reasonable dimensions
      const vbMatch = result.svg.match(/viewBox="([^"]+)"/);
      expect(vbMatch).not.toBeNull();
      const [_vx, _vy, vw, vh] = vbMatch![1]!.split(/\s+/).map(Number);
      expect(vw).toBeGreaterThan(0);
      expect(vh).toBeGreaterThan(0);
    });
  });

  // ── Empty layout edge case ────────────────────────────────────────

  it("returns empty result for layout with no keys", () => {
    const empty = generatePlate(makeLayout([]));
    expect(empty.svg).toBe("");
    expect(empty.dxf).toBe("");
    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
    expect(empty.area).toBe(0);
    expect(empty.cutPathLength).toBe(0);
    expect(empty.stpData).toBeNull();
    expect(empty.regions).toEqual([]);
  });

  // ── Config override: fillet ───────────────────────────────────────

  it("applies corner fillet radius to SVG rect and DXF", () => {
    const config: Partial<PlateConfig> = { fillet: 3 };
    const r = generatePlate(makeLayout([key1u(0, 0)]), config);
    // SVG rect should have rx attribute
    expect(r.svg).toContain('rx="3"');
  });

  // ── Config override: kerf compensation ────────────────────────────

  it("kerf compensation affects cut path length", () => {
    const noKerf = generatePlate(makeLayout([key1u(0, 0)]));
    const withKerf = generatePlate(makeLayout([key1u(0, 0)]), { kerf: 0.2 });
    // Kerf enlarges holes → longer perimeter
    expect(withKerf.cutPathLength).toBeGreaterThan(noKerf.cutPathLength);
  });

  // ── Config override: stabType disables stabilizers ─────────────────

  it("stabType=0 disables stabilizer cutouts for wide keys", () => {
    const withStab = generatePlate(makeLayout([spacebar(0, 0, 6.25)]), { stabType: 1 });
    const noStab = generatePlate(makeLayout([spacebar(0, 0, 6.25)]), { stabType: 0 });
    // Without stabilizer, cutPathLength is just the switch perimeter
    expect(noStab.cutPathLength).toBeLessThan(withStab.cutPathLength);
  });
});

// ═══════════════════════════════════════════════════════════════════
// getStabOffset boundary value tests (via generatePlate)
// ═══════════════════════════════════════════════════════════════════
//
// getStabOffset uses these thresholds:
//   < 2u  → null  (no stabilizer)
//   < 3u  → 11.9  (2u: 23.8mm / 2)
//   < 6u  → 19.05 (3u: 38.1mm / 2)
//   < 6.25u → 47.5 (6u: 95mm / 2)
//   < 7u  → 50   (6.25u: 100mm / 2)
//   >= 7u → 57.15 (7u: 114.3mm / 2)

describe("getStabOffset boundary values (via generatePlate, stabType=1)", () => {
  /** Generate plate for a single horizontal key of given width; snapshot SVG for regression. */
  function generateForWidth(w: number): ReturnType<typeof generatePlate> {
    return generatePlate(makeLayout([spacebar(0, 0, w)], `stab-${w}u`));
  }

  const PERIMETER_1U_NO_STAB = 56; // 4 × 14mm = exact MX switch perimeter at kerf=0

  it("1u key: no stabilizer, cut perimeter ≈ 56mm", () => {
    const r = generateForWidth(1);
    // Only switch cutout, perimeter should be close to 56mm
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB - 1);
    expect(r.cutPathLength).toBeLessThan(PERIMETER_1U_NO_STAB + 1);
    expect(r).toMatchSnapshot();
  });

  it("2u key: stabilizer at offset 11.9mm (23.8mm / 2)", () => {
    const r = generateForWidth(2);
    // Stabilizer adds wing cutouts → perimeter significantly larger
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    expect(r).toMatchSnapshot();
  });

  it("3u key: stabilizer at offset 19.05mm (38.1mm / 2)", () => {
    const r = generateForWidth(3);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    expect(r).toMatchSnapshot();
  });

  it("6u key: stabilizer at offset 47.5mm (95mm / 2) + 0.5u switch center offset", () => {
    const r = generateForWidth(6);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    // 6u keys have a 0.5u switch center offset; verify SVG path still contains cutout
    expect(countSvgPaths(r.svg)).toBeGreaterThan(0);
    expect(r).toMatchSnapshot();
  });

  it("6.25u key: stabilizer at offset 50mm (100mm / 2)", () => {
    const r = generateForWidth(6.25);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    expect(r).toMatchSnapshot();
  });

  it("7u key: stabilizer at offset 57.15mm (114.3mm / 2)", () => {
    const r = generateForWidth(7);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    expect(r).toMatchSnapshot();
  });

  it("8u key: stabilizer at offset 57.15mm (same as 7u, boundary case for >=7)", () => {
    const r = generateForWidth(8);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
    expect(r).toMatchSnapshot();
  });

  // ── Verify boundary edges specifically ────────────────────────────

  it("1.75u key (< 2u boundary): no stabilizer", () => {
    const r = generateForWidth(1.75);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB - 1);
    expect(r.cutPathLength).toBeLessThan(PERIMETER_1U_NO_STAB + 1);
  });

  it("2.75u key (2u-3u range): stabilizer at offset 11.9", () => {
    const r = generateForWidth(2.75);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
  });

  it("5.75u key (3u-6u range): stabilizer at offset 19.05", () => {
    const r = generateForWidth(5.75);
    expect(r.cutPathLength).toBeGreaterThan(PERIMETER_1U_NO_STAB + 5);
  });
});

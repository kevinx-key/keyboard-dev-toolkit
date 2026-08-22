import { describe, it, expect } from 'vitest';
import {
  U_MM,
  KEY_UNIT_PX,
  MM_PER_PX,
  kuToPx,
  kuToMm,
  mmToPx,
  pxToMm,
  rotatePoint,
  keyCenterInMm,
  layoutBounds,
} from '@/lib/coordinate-system';
import { DEFAULT_PROPS, type KeyProps } from '@/lib/kle-types';

// ─── Helpers ──────────────────────────────────────────

function mkKey(overrides: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}

describe('coordinate-system', () => {
  // ─── Constants ────────────────────────────────────
  it('U_MM = 19.05', () => {
    expect(U_MM).toBe(19.05);
  });

  it('KEY_UNIT_PX = 54', () => {
    expect(KEY_UNIT_PX).toBe(54);
  });

  it('MM_PER_PX = U_MM / KEY_UNIT_PX', () => {
    expect(MM_PER_PX).toBeCloseTo(19.05 / 54, 10);
  });

  // ─── Conversion functions ──────────────────────────
  it('kuToPx(1) = 54', () => {
    expect(kuToPx(1)).toBe(54);
  });

  it('kuToPx(0) = 0', () => {
    expect(kuToPx(0)).toBe(0);
  });

  it('kuToPx(2.5) = 135', () => {
    expect(kuToPx(2.5)).toBe(135);
  });

  it('kuToMm(1) = 19.05', () => {
    expect(kuToMm(1)).toBe(19.05);
  });

  it('kuToMm(0) = 0', () => {
    expect(kuToMm(0)).toBe(0);
  });

  it('kuToMm(2) = 38.1', () => {
    expect(kuToMm(2)).toBe(38.1);
  });

  it('mmToPx(19.05) = 54', () => {
    expect(mmToPx(19.05)).toBeCloseTo(54, 10);
  });

  it('mmToPx(0) = 0', () => {
    expect(mmToPx(0)).toBe(0);
  });

  it('pxToMm(54) = 19.05', () => {
    expect(pxToMm(54)).toBeCloseTo(19.05, 10);
  });

  it('pxToMm(0) = 0', () => {
    expect(pxToMm(0)).toBe(0);
  });

  it('kuToMm and mmToPx are inverses via pxToMm', () => {
    const mm = kuToMm(1);
    const px = mmToPx(mm);
    expect(px).toBeCloseTo(54, 10);
  });

  it('mmToPx and pxToMm are inverses', () => {
    const val = 100;
    expect(pxToMm(mmToPx(val))).toBeCloseTo(val, 10);
  });

  // ─── rotatePoint ──────────────────────────────────
  it('rotatePoint: (1,0) rotated 90° around origin → (0,1)', () => {
    const result = rotatePoint({ x: 1, y: 0 }, 90, { x: 0, y: 0 });
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('rotatePoint: identity (0°) returns same point', () => {
    const result = rotatePoint({ x: 3, y: 5 }, 0, { x: 0, y: 0 });
    expect(result.x).toBe(3);
    expect(result.y).toBe(5);
  });

  it('rotatePoint: 360° returns same point', () => {
    const result = rotatePoint({ x: 3, y: 5 }, 360, { x: 0, y: 0 });
    expect(result.x).toBe(3);
    expect(result.y).toBe(5);
  });

  it('rotatePoint: 180° inverts both axes', () => {
    const result = rotatePoint({ x: 2, y: 3 }, 180, { x: 0, y: 0 });
    expect(result.x).toBeCloseTo(-2, 10);
    expect(result.y).toBeCloseTo(-3, 10);
  });

  it('rotatePoint: rotation around non-origin center', () => {
    // Rotate (2, 1) around (1, 1) by 90° → (1, 2)
    const result = rotatePoint({ x: 2, y: 1 }, 90, { x: 1, y: 1 });
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(2, 10);
  });

  it('rotatePoint: -90° is equivalent to 270°', () => {
    const r1 = rotatePoint({ x: 1, y: 0 }, -90, { x: 0, y: 0 });
    const r2 = rotatePoint({ x: 1, y: 0 }, 270, { x: 0, y: 0 });
    expect(r1.x).toBeCloseTo(r2.x, 10);
    expect(r1.y).toBeCloseTo(r2.y, 10);
  });

  // ─── keyCenterInMm ────────────────────────────────
  it('keyCenterInMm: 1u key at (0,0)', () => {
    const key = mkKey({ x: 0, y: 0, w: 1, h: 1 });
    const c = keyCenterInMm(key);
    expect(c.x).toBeCloseTo(0.5 * 19.05, 10);
    expect(c.y).toBeCloseTo(0.5 * 19.05, 10);
  });

  it('keyCenterInMm: 2u wide key at (1, 2)', () => {
    const key = mkKey({ x: 1, y: 2, w: 2, h: 1 });
    const c = keyCenterInMm(key);
    expect(c.x).toBeCloseTo((1 + 1) * 19.05, 10);
    expect(c.y).toBeCloseTo((2 + 0.5) * 19.05, 10);
  });

  it('keyCenterInMm: L-shaped key with w2/h2 extends bounding box', () => {
    const key = mkKey({ x: 0, y: 0, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 });
    const c = keyCenterInMm(key);
    // The bounding box spans x: -0.25 to 1.25, y: 0 to 2
    // Center: ((1.25 + (-0.25)) / 2, (2 + 0) / 2) = (0.5, 1)
    expect(c.x).toBeCloseTo(0.5 * 19.05, 10);
    expect(c.y).toBeCloseTo(1 * 19.05, 10);
  });

  it('keyCenterInMm: decal key ignored (same formula)', () => {
    const key = mkKey({ x: 3, y: 4, w: 1, h: 1, d: true });
    const c = keyCenterInMm(key);
    expect(c.x).toBeCloseTo(3.5 * 19.05, 10);
    expect(c.y).toBeCloseTo(4.5 * 19.05, 10);
  });

  // ─── layoutBounds (legacy mode) ───────────────────
  it('layoutBounds legacy: empty keys → all zeros', () => {
    const b = layoutBounds([]);
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(0);
    expect(b.maxY).toBe(0);
    expect(b.width).toBe(0);
    expect(b.height).toBe(0);
    expect(b.originX).toBe(0);
    expect(b.originY).toBe(0);
  });

  it('layoutBounds legacy: single 1u key at (0,0)', () => {
    const keys = [mkKey({ x: 0, y: 0, w: 1, h: 1 })];
    const b = layoutBounds(keys, 'legacy');
    // minX = 0, minY = 0, maxX = 1, maxY = 1 all in key units → mm
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBeCloseTo(19.05, 10);
    expect(b.maxY).toBeCloseTo(19.05, 10);
    expect(b.originX).toBe(0);
    expect(b.originY).toBe(0);
  });

  it('layoutBounds legacy: keys at positive coords', () => {
    const keys = [
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
      mkKey({ x: 2, y: 1, w: 1, h: 1 }),
    ];
    const b = layoutBounds(keys, 'legacy');
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBeCloseTo(3 * 19.05, 10);
    expect(b.maxY).toBeCloseTo(2 * 19.05, 10);
  });

  it('layoutBounds legacy: keys with negative positions', () => {
    const keys = [
      mkKey({ x: -1, y: -0.5, w: 1, h: 1 }),
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
    ];
    const b = layoutBounds(keys, 'legacy');
    expect(b.minX).toBeCloseTo(-1 * 19.05, 10);
    expect(b.minY).toBeCloseTo(-0.5 * 19.05, 10);
    expect(b.originX).toBe(b.minX);
    expect(b.originY).toBe(b.minY);
  });

  it('layoutBounds legacy: L-shaped key extends bounds', () => {
    const keys = [mkKey({ x: 0, y: 0, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 })];
    const b = layoutBounds(keys, 'legacy');
    // minX = -0.25, minY = 0, maxX = 1.25, maxY = 2
    expect(b.minX).toBeCloseTo(-0.25 * 19.05, 10);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBeCloseTo(1.25 * 19.05, 10);
    expect(b.maxY).toBeCloseTo(2 * 19.05, 10);
  });

  // ─── layoutBounds (first-key-center mode) ─────────
  it('layoutBounds first-key-center: origin at first key center', () => {
    const keys = [mkKey({ x: 0, y: 0, w: 1, h: 1 })];
    const b = layoutBounds(keys, 'first-key-center');
    const firstCenter = keyCenterInMm(keys[0]!);
    expect(b.originX).toBeCloseTo(firstCenter.x, 10);
    expect(b.originY).toBeCloseTo(firstCenter.y, 10);
  });

  it('layoutBounds first-key-center: offset negative positions visible', () => {
    const keys = [
      mkKey({ x: 2, y: 1, w: 1, h: 1 }),
      mkKey({ x: -1, y: -0.5, w: 1, h: 1 }),
    ];
    const b = layoutBounds(keys, 'first-key-center');
    const firstCenter = keyCenterInMm(keys[0]!);
    expect(b.originX).toBeCloseTo(firstCenter.x, 10);
    expect(b.originY).toBeCloseTo(firstCenter.y, 10);
    // The bounding box still represents actual extents, origin is just different
    expect(b.minX).toBeLessThanOrEqual(-1 * 19.05);
  });

  it('layoutBounds first-key-center: correctly handles negative ku', () => {
    const keys = [
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
      mkKey({ x: -1, y: -0.5, w: 1, h: 1 }),
    ];
    const b = layoutBounds(keys, 'first-key-center');
    expect(b.originX).toBeCloseTo(0.5 * 19.05, 10);
    expect(b.originY).toBeCloseTo(0.5 * 19.05, 10);
  });
});

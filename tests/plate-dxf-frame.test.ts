import { describe, it, expect } from 'vitest';
import { generatePlate } from '@/lib/plate-export';
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from '@/lib/kle-types';

// 回归：#3 定位板 DXF 外框与轴孔错位。
// 根因：buildDXF 外框顶点曾按「视口坐标」(pad..pad+plateW) 生成，却被 addPolyline
// 再次做「绝对 mm → 视口」变换 (-origin+pad)，导致外框整体偏移 (pad-minX)。
// 断言：外框与轴孔共处同一坐标系（外框紧贴板尺寸、包含全部轴孔，对称布局下中心重合）。

const PAD = 5;

function mkKey(overrides: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}
function key1u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1, h: 1 });
}
function makeLayout(keys: KeyProps[], name = 'Test'): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

interface Poly { layer: string; pts: [number, number][] }

function parsePolylines(dxf: string): Poly[] {
  const lines = dxf.split(/\r?\n/);
  const polys: Poly[] = [];
  let cur: Poly | null = null;
  let curX: number | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i]!.trim();
    const val = lines[i + 1]!.trim();
    if (code === '0') {
      if (val === 'POLYLINE') { cur = { layer: '', pts: [] }; polys.push(cur); }
      else if (val !== 'VERTEX') { cur = null; }
    } else if (code === '8' && cur && cur.layer === '') {
      cur.layer = val;
    } else if (code === '10' && cur) {
      curX = Number(val);
    } else if (code === '20' && cur && curX !== null) {
      cur.pts.push([curX, Number(val)]);
      curX = null;
    }
  }
  return polys;
}

function bbox(pts: [number, number][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

describe('plate DXF frame alignment (#3)', () => {
  it('外框紧贴板尺寸、包含全部轴孔（对称布局中心重合）', () => {
    const result = generatePlate(makeLayout([key1u(0, 0), key1u(1, 0), key1u(2, 0)]));
    const polys = parsePolylines(result.dxf);

    const frame = polys.find((p) => p.layer === 'PLATE');
    const holes = polys.filter((p) => p.layer === 'CUT');
    expect(frame, 'DXF 应含 PLATE 外框').toBeTruthy();
    expect(holes.length, 'DXF 应含 CUT 轴孔').toBeGreaterThan(0);

    const fb = bbox(frame!.pts);
    const hb = bbox(holes.flatMap((h) => h.pts));

    // 外框尺寸 == 板尺寸，且起点恰为 pad（证明未被二次偏移）
    expect(fb.maxX - fb.minX).toBeCloseTo(result.width, 3);
    expect(fb.maxY - fb.minY).toBeCloseTo(result.height, 3);
    expect(fb.minX).toBeCloseTo(PAD, 3);
    expect(fb.maxX).toBeCloseTo(PAD + result.width, 3);

    // 对称布局：外框与轴孔中心必须重合
    expect(fb.cx).toBeCloseTo(hb.cx, 3);
    expect(fb.cy).toBeCloseTo(hb.cy, 3);

    // 所有轴孔必须落在外框内
    expect(hb.minX).toBeGreaterThanOrEqual(fb.minX - 1e-6);
    expect(hb.maxX).toBeLessThanOrEqual(fb.maxX + 1e-6);
    expect(hb.minY).toBeGreaterThanOrEqual(fb.minY - 1e-6);
    expect(hb.maxY).toBeLessThanOrEqual(fb.maxY + 1e-6);
  });

  it('非对称 padding：外框仍为 (origin + 板尺寸)，且包含全部轴孔', () => {
    const layout = makeLayout([
      key1u(0, 0),
      mkKey({ x: 1, y: 0, w: 1.25, h: 1 }),
      mkKey({ x: 0, y: 1, w: 6.25, h: 1 }),
    ]);
    const result = generatePlate(layout, { leftPad: 10, topPad: 5, rightPad: 3, bottomPad: 2 });
    const polys = parsePolylines(result.dxf);

    const fb = bbox(polys.find((p) => p.layer === 'PLATE')!.pts);
    const hb = bbox(polys.filter((p) => p.layer === 'CUT').flatMap((h) => h.pts));

    expect(fb.maxX - fb.minX).toBeCloseTo(result.width, 3);
    expect(fb.maxY - fb.minY).toBeCloseTo(result.height, 3);
    expect(fb.minX).toBeCloseTo(PAD, 3);

    expect(hb.minX).toBeGreaterThanOrEqual(fb.minX - 1e-6);
    expect(hb.maxX).toBeLessThanOrEqual(fb.maxX + 1e-6);
    expect(hb.minY).toBeGreaterThanOrEqual(fb.minY - 1e-6);
    expect(hb.maxY).toBeLessThanOrEqual(fb.maxY + 1e-6);
  });
});

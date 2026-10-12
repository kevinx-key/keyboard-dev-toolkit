/**
 * GH60 板框几何测试
 *
 * 覆盖两个来源：
 * 1. src/data/gh60.ts —— 固定外轮廓 / 螺丝槽 / Type-C 位置常量；
 * 2. src/lib/pcb-export.ts —— boardShape: "gh60" 分支（getGH60Board / generatePCB / computePCBBounds）。
 *
 * 全部为纯数据断言（approx 比较），不依赖 DOM。
 */

import { describe, it, expect } from 'vitest';
import { GH60_OUTLINE, GH60_SLOTS, GH60_TYPEC } from '@/data/gh60';
import { getGH60Board, generatePCB, computePCBBounds } from '@/lib/pcb-export';
import type { PCBConfig } from '@/lib/pcb-export';
import { parseKLEJSON } from '@/lib/kle-serial';
import type { KLELayout } from '@/lib/kle-types';
import { ALL_PRESETS } from '@/data/presets';

type Pt = [number, number];

/** 点集包围盒（编辑器坐标 mm） */
function bbox(points: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** GH60 外轮廓期望包围盒（mm） */
const GH60_MIN: Pt = [2.0631, 0.1250];
const GH60_MAX: Pt = [284.2587, 94.9254];
const GH60_WIDTH = GH60_MAX[0] - GH60_MIN[0];   // 282.1956

/** 构建「Default 60%」预设的 KLELayout */
function default60Layout(): KLELayout {
  const preset = ALL_PRESETS.find((p) => p.name === 'Default 60%');
  if (!preset) throw new Error('preset not found: Default 60%');
  const layout = parseKLEJSON(preset.data);
  if (!layout) throw new Error('parseKLEJSON failed for Default 60%');
  return layout;
}

/** GH60 基准 PCB 配置（boardShape 由各用例另行指定） */
const baseCfg: PCBConfig = {
  solderType: 'socket',
  needStab: true,
  needLed: false,
  edgeDistance: 0,
  needTypeC: true,
  typeCX: GH60_TYPEC.x,
  typeCY: GH60_TYPEC.y,
  typeCRot: GH60_TYPEC.rot,
  need4P: false,
  needMCU: false,
  fourPX: 0, fourPY: 0, fourPRot: 0,
  mcuX: 0, mcuY: 0, mcuRot: 0,
};

const gh60Cfg: PCBConfig = { ...baseCfg, boardShape: 'gh60' };

// ========================================================================
// 1. 固定几何常量（src/data/gh60.ts）
// ========================================================================

describe('GH60 固定几何 (src/data/gh60.ts)', () => {
  it('GH60_OUTLINE 为 34 点闭合外轮廓', () => {
    expect(GH60_OUTLINE).toHaveLength(34);
  });

  it('GH60_OUTLINE 包围盒 ≈ (2.0631, 0.1250)-(284.2587, 94.9254)', () => {
    const b = bbox(GH60_OUTLINE);
    expect(b.minX).toBeCloseTo(GH60_MIN[0], 2);
    expect(b.minY).toBeCloseTo(GH60_MIN[1], 2);
    expect(b.maxX).toBeCloseTo(GH60_MAX[0], 2);
    expect(b.maxY).toBeCloseTo(GH60_MAX[1], 2);
  });

  it('GH60_SLOTS 为 6 个闭合多边形', () => {
    expect(GH60_SLOTS).toHaveLength(6);
  });

  it('GH60_TYPEC 常量等于固定 Type-C 位置/朝向', () => {
    expect(GH60_TYPEC).toEqual({ x: 13.7971, y: -1.3063, rot: 0 });
  });

  it('getGH60Board(0, 0) 返回同一外轮廓（包围盒一致）与 6 个槽', () => {
    const board = getGH60Board(0, 0);
    expect(board.outline).toHaveLength(34);
    expect(board.slots).toHaveLength(6);

    const b = bbox(board.outline);
    expect(b.minX).toBeCloseTo(GH60_MIN[0], 2);
    expect(b.minY).toBeCloseTo(GH60_MIN[1], 2);
    expect(b.maxX).toBeCloseTo(GH60_MAX[0], 2);
    expect(b.maxY).toBeCloseTo(GH60_MAX[1], 2);
  });

  it('edge 参数使外轮廓外扩（Edge Distance = 外框偏移量）', () => {
    const b = bbox(getGH60Board(3, 0).outline);
    expect(b.minX).toBeLessThan(GH60_MIN[0] - 2.5);
    expect(b.maxX).toBeGreaterThan(GH60_MAX[0] + 2.5);
  });
});

// ========================================================================
// 2. boardShape: "gh60" 分支
// ========================================================================

describe('generatePCB / computePCBBounds — boardShape "gh60"', () => {
  it('computePCBBounds 板框 ≈ 282.20 × 94.80', () => {
    const bounds = computePCBBounds(default60Layout(), gh60Cfg);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeCloseTo(282.20, 1);
    expect(bounds!.height).toBeCloseTo(94.80, 1);
  });

  it('generatePCB 尺寸一致，svg 含 <path 且 dxf 含多个 POLYLINE', () => {
    const result = generatePCB(default60Layout(), gh60Cfg);
    expect(result.width).toBeCloseTo(282.20, 1);
    expect(result.height).toBeCloseTo(94.80, 1);

    // 多边形外轮廓
    expect(result.svg).toContain('<path');

    // 外轮廓 + 6 螺丝槽 → 多于一条 POLYLINE
    const polylineCount = (result.dxf.match(/\bPOLYLINE\b/g) || []).length;
    expect(polylineCount).toBeGreaterThan(1);
  });

  it('boardShape 缺省时尺寸不等于 GH60（分支确实改变输出）', () => {
    const auto = generatePCB(default60Layout(), { ...baseCfg });
    expect(Math.abs(auto.width - GH60_WIDTH)).toBeGreaterThan(0.1);
  });

  it('boardShape "auto" 时尺寸不等于 GH60（分支确实改变输出）', () => {
    const auto = generatePCB(default60Layout(), { ...baseCfg, boardShape: 'auto' });
    expect(Math.abs(auto.width - GH60_WIDTH)).toBeGreaterThan(0.1);
  });
});

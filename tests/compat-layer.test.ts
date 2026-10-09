import { describe, it, expect } from 'vitest';
import {
  parseViaCompatTag,
  compatStackZ,
  compatVariantIndices,
  applyCompatToLabels,
  compatLabelSlot,
  COMPAT_Z_NEUTRAL,
  COMPAT_Z_TOP,
  COMPAT_Z_BELOW,
  VIA_OPTION_LABEL_SLOT,
  DEFAULT_PROPS,
  DEFAULT_META,
  type KeyProps,
  type KLELayout,
} from '@/lib/kle-types';
import { editorReducer } from '@/lib/kle-reducer';
import { mixColor, lighten, darken } from '@/lib/color-utils';
import { parseKLEJSON } from '@/lib/kle-serial';
import { keyPropsToIntermediate } from '@/lib/kle-parser';
import { hitTestKey, getKeysInArea } from '@/components/canvas/CanvasInteraction';
import { generatePlate } from '@/lib/plate-export';
import { generateSwitchPad } from '@/lib/switch-pad-export';
import { generateBottomFoam } from '@/lib/bottom-foam-export';
import { generatePCB } from '@/lib/pcb-export';

// ── VIA 兼容标记解析 ────────────────────────────────────

describe('parseViaCompatTag', () => {
  it('解析 slot3 的 "<option>,<value>"', () => {
    expect(parseViaCompatTag(['4,0', '', '', '2,1'])).toEqual({ option: 2, value: 1 });
    expect(parseViaCompatTag(['4,0', '', '', '2,0'])).toEqual({ option: 2, value: 0 });
    expect(parseViaCompatTag(['4,0', '', '', ' 2 , 1 '])).toEqual({ option: 2, value: 1 });
  });

  it('非标记 / 缺失返回 null', () => {
    expect(parseViaCompatTag(['4,0', '', '', 'x'])).toBeNull();
    expect(parseViaCompatTag(['4,0'])).toBeNull();
    expect(parseViaCompatTag(['4,0', '', '', ''])).toBeNull();
    expect(parseViaCompatTag(['4,0', '', '', '2,5'])).toBeNull();
  });

  it('slot 常量为 3', () => {
    expect(VIA_OPTION_LABEL_SLOT).toBe(3);
  });
});

// ── 颜色混合（兼容着色用） ──────────────────────────────

describe('mixColor / lighten / darken 支持 rgb()', () => {
  it('mixColor 混合 hex 与 rgb 输入', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgb(128,128,128)');
    expect(mixColor('rgb(0,0,0)', 'rgb(255,255,255)', 0)).toBe('rgb(0,0,0)');
    expect(mixColor('rgb(0,0,0)', 'rgb(255,255,255)', 1)).toBe('rgb(255,255,255)');
  });

  it('lighten / darken 接受 rgb() 输入', () => {
    expect(lighten('rgb(0,0,0)', 100)).toBe('rgb(255,255,255)');
    expect(darken('rgb(255,255,255)', 100)).toBe('rgb(0,0,0)');
  });
});

// ── 组号（option index）写回标签槽 ──────────────────────

describe('applyCompatToLabels / compatLabelSlot', () => {
  const labels = Array(12).fill('');

  it('align=4 时槽位为 8', () => {
    expect(compatLabelSlot(4)).toBe(8);
  });

  it('写入 "<组号>,<值>"', () => {
    expect(applyCompatToLabels(labels, 4, 1, 2)[8]).toBe('2,1');
    expect(applyCompatToLabels(labels, 4, 0, undefined)[8]).toBe('0,0');
  });

  it('compat 为 undefined 时清空标记槽', () => {
    const withTag = applyCompatToLabels(labels, 4, 1, 3);
    expect(withTag[8]).toBe('3,1');
    expect(applyCompatToLabels(withTag, 4, undefined, 3)[8]).toBe('');
  });
});

describe('reducer SET_PROP 兼容字段同步标签', () => {
  const mkState = () => ({
    layout: { meta: { ...DEFAULT_META }, keys: [{ ...DEFAULT_PROPS, labels: Array(12).fill('') }] },
    selectedIds: ['0'], clipboard: null, undoStack: [], redoStack: [], isDirty: false,
  });

  it('设置 compat=1 → 标签槽写 0,1', () => {
    const next = editorReducer(mkState(), { type: 'SET_PROP', ids: ['0'], prop: 'compat', value: 1 });
    expect(next.layout.keys[0]!.compat).toBe(1);
    expect(next.layout.keys[0]!.labels[8]).toBe('0,1');
  });

  it('设置 compatOption=3 → 标签槽更新为 3,1', () => {
    let state = editorReducer(mkState(), { type: 'SET_PROP', ids: ['0'], prop: 'compat', value: 1 });
    state = editorReducer(state, { type: 'SET_PROP', ids: ['0'], prop: 'compatOption', value: 3 });
    expect(state.layout.keys[0]!.compatOption).toBe(3);
    expect(state.layout.keys[0]!.labels[8]).toBe('3,1');
  });
});

// ── 需要浅灰标记的键集合（其他编辑器） ──────────────────

describe('compatVariantIndices', () => {
  const keys: Pick<KeyProps, 'compat'>[] = [{ compat: undefined }, { compat: 0 }, { compat: 1 }, { compat: 1 }];

  it('开：仅标记兼容按键（compat=1）', () => {
    expect([...compatVariantIndices(keys, true)]).toEqual([2, 3]);
  });

  it('关：空集', () => {
    expect(compatVariantIndices(keys, false).size).toBe(0);
  });
});

// ── 导出器：兼容键的真实图形以浅灰重绘（不再是方块遮罩） ──

describe('导出器浅灰重绘兼容键几何', () => {
  const k = (over: Partial<KeyProps> = {}): KeyProps => ({ ...DEFAULT_PROPS, ...over });
  const layout: KLELayout = {
    meta: { ...DEFAULT_META, name: 'CompatExport' },
    keys: [k({ x: 0, y: 0 }), k({ x: 1, y: 0 }), k({ x: 0, y: 1 })],
  };
  const gray = (s: string) => s.includes('fill="lightgray"');
  const pcbs = { solderType: 'sunken' as const, needStab: false, needLed: false, edgeDistance: 3,
    needTypeC: false, need4P: false, needMCU: false,
    typeCX: 0, typeCY: 0, fourPX: 0, fourPY: 0, mcuX: 0, mcuY: 0, typeCRot: 0, fourPRot: 0, mcuRot: 0 };

  it('generatePlate：默认无灰，指定兼容键后出现浅灰组', () => {
    expect(gray(generatePlate(layout, {}).svg)).toBe(false);
    expect(gray(generatePlate(layout, {}, undefined, { compatKeyIndices: new Set([1]) }).svg)).toBe(true);
  });

  it('generatePlate：圆角(挖孔) 与 外框圆角 可分别控制', () => {
    const noHole = generatePlate(layout, {}).svg;
    const withHole = generatePlate(layout, {}, undefined, { holeFillet: 2 }).svg;
    expect(noHole).not.toBe(withHole);
    expect(generatePlate(layout, { fillet: 3 }).svg).toContain('rx="3"');
  });

  it('generateSwitchPad：指定兼容键后出现浅灰组', () => {
    const cfg = { solderType: 'sunken' as const, needStab: true, needLed: false, edgeDistance: 3, fillet: 1 };
    expect(gray(generateSwitchPad(layout, cfg).svg)).toBe(false);
    expect(gray(generateSwitchPad(layout, cfg, undefined, undefined, new Set([1])).svg)).toBe(true);
  });

  it('generateBottomFoam：指定兼容键后出现浅灰组', () => {
    const cfg = { solderType: 'socket' as const, needLed: true,
      needTypeC: false, typeCX: 0, typeCY: 0, typeCRot: 0,
      need4P: false, fourPX: 0, fourPY: 0, fourPRot: 0,
      needMCU: false, mcuX: 0, mcuY: 0, mcuRot: 0, edgeDistance: 3, holeFillet: 1, outerFillet: 0 };
    expect(gray(generateBottomFoam(layout, cfg).svg)).toBe(false);
    expect(gray(generateBottomFoam(layout, cfg, undefined, new Set([1])).svg)).toBe(true);
  });

  it('generatePCB：指定兼容键后出现浅灰组', () => {
    expect(gray(generatePCB(layout, { ...pcbs, needStab: true }).svg)).toBe(false);
    expect(gray(generatePCB(layout, { ...pcbs, needStab: true }, undefined, undefined, new Set([1])).svg)).toBe(true);
  });
});

// ── 兼容层叠放层次（随开关切换） ───────────────────────

describe('compatStackZ', () => {
  it('普通键恒为中性', () => {
    expect(compatStackZ(undefined, true)).toBe(COMPAT_Z_NEUTRAL);
    expect(compatStackZ(undefined, false)).toBe(COMPAT_Z_NEUTRAL);
  });

  it('开：兼容按键(1)置顶、兼容常规键(0)垫底', () => {
    expect(compatStackZ(1, true)).toBe(COMPAT_Z_TOP);
    expect(compatStackZ(0, true)).toBe(COMPAT_Z_BELOW);
  });

  it('关：兼容常规键(0)置顶、兼容按键(1)垫底', () => {
    expect(compatStackZ(0, false)).toBe(COMPAT_Z_TOP);
    expect(compatStackZ(1, false)).toBe(COMPAT_Z_BELOW);
  });
});

// ── 兼容层命中：变淡键不可选中，点击落到下层重叠键 ──────

describe('hitTestKey / getKeysInArea 跳过变淡键', () => {
  const k = (over: Partial<KeyProps> = {}): KeyProps => ({ ...DEFAULT_PROPS, ...over });
  // 两个完全重叠的键：index 1 在 index 0 之上
  const overlap = [k({ x: 0, y: 0 }), k({ x: 0, y: 0 })];

  it('默认返回最上层键', () => {
    expect(hitTestKey(27, 27, overlap)).toBe(1);
  });

  it('跳过变淡键后返回下层键', () => {
    expect(hitTestKey(27, 27, overlap, new Set([1]))).toBe(0);
    expect(hitTestKey(27, 27, overlap, new Set([0]))).toBe(1);
  });

  it('全部变淡时无可命中键', () => {
    expect(hitTestKey(27, 27, overlap, new Set([0, 1]))).toBeNull();
  });

  it('框选排除变淡键', () => {
    expect(getKeysInArea(0, 0, 54, 54, overlap)).toEqual(['0', '1']);
    expect(getKeysInArea(0, 0, 54, 54, overlap, new Set([1]))).toEqual(['0']);
  });
});

// ── 导入解析 + 写回往返 ─────────────────────────────────

function labelStrings(layout: KLELayout): string[] {
  return keyPropsToIntermediate(layout)
    .flat()
    .filter((x): x is string => typeof x === 'string');
}

describe('VIA compat ⇄ KeyProps 往返', () => {
  it('导入时解析 compat / compatOption', () => {
    const data = [
      ['4,0\n\n\n2,1', '4,0\n\n\n2,0', '4,2'],
    ];
    const layout = parseKLEJSON(data);
    expect(layout).not.toBeNull();
    const keys = layout!.keys;
    expect(keys[0]!.compat).toBe(1);
    expect(keys[0]!.compatOption).toBe(2);
    expect(keys[1]!.compat).toBe(0);
    expect(keys[1]!.compatOption).toBe(2);
    // 无标记 → 常规键
    expect(keys[2]!.compat).toBeUndefined();
  });

  it('导出时把 compat 写回标签（保留 option）', () => {
    const data = [['4,0\n\n\n2,1']];
    const layout = parseKLEJSON(data)!;
    expect(labelStrings(layout)).toContain('4,0\n\n\n2,1');

    // 改为兼容常规键 → 值变 0，option 仍为 2
    layout.keys[0]!.compat = 0;
    expect(labelStrings(layout)).toContain('4,0\n\n\n2,0');
  });

  it('从兼容键重置回常规键时清空标记槽', () => {
    const data = [['4,0\n\n\n2,1']];
    const layout = parseKLEJSON(data)!;
    layout.keys[0]!.compat = undefined;
    const labels = labelStrings(layout);
    expect(labels.some((l) => l.includes('2,1'))).toBe(false);
  });

  it('槽位被普通图例占用时不覆盖图例', () => {
    // align=4 下序列槽 3 映射到归一化位置 8（右下角）
    const labels = Array(12).fill('');
    labels[8] = 'LGD';
    const key: KeyProps = { ...DEFAULT_PROPS, labels, compat: 1 };
    const layout: KLELayout = { meta: { ...DEFAULT_META }, keys: [key] };
    const out = labelStrings(layout);
    expect(out.some((l) => l.includes('LGD'))).toBe(true);
    expect(out.some((l) => l.includes('0,1'))).toBe(false);
  });
});

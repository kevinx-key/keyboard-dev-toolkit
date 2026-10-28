/**
 * 键帽模型匹配 / 装配落位守卫（STP 装配图「键帽」部件，2026-10）
 *
 * 规格（机主定稿）：
 *   1. 模型名 `r{行}-{宽}u.stp`——`r{行}` 是键帽高度（R1–R4），`{宽}u` 是键帽宽度；
 *      按**画布键帽宽度**（KLE `w`）匹配，库里没有的宽度一律回落该行 1u 键帽。
 *   2. 行高强制规则：F 区 + 数字行 = R1；QWER = R2；ASD = R3；ZXC 与 Ctrl/空格行 = R4。
 *   3. 落位：键帽「内部圆柱 Z 轴底面轴心」与**定位板开孔顶面中心** XY 完全一致、Z 高 6.6mm。
 *
 * 本文件守住三件事：
 *   - 宽度 → 模型名的匹配与回落；
 *   - 行高判定（图例锚点 + 无图例时的位置兜底）；
 *   - **孔心一致性**：`switchHoleCenterMm` 必须与 `generatePlate` 真正挖出来的
 *     轴孔中心逐字节同点（阶梯键 / 高键 / 6u 空格 / 旋转键全覆盖），防止两处漂移。
 */
import { describe, expect, it } from "vitest";
import {
  KEYCAP_LIFT_Z,
  KEYCAP_WIDTHS_BY_ROW,
  SPACE_WIDTHS,
  buildKeycapPlacements,
  hasKeycapModel,
  isIsoEnterKey,
  keycapModelFor,
  keycapModelName,
  keycapWidthSlug,
  resolveKeycapRows,
  spaceKeycapName,
  specialKeycap,
  switchHoleCenterMm,
} from "../src/lib/keycap-models";
import type { KeycapRow } from "../src/lib/keycap-models";
import { generatePlate } from "../src/lib/plate-export";
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from "../src/lib/kle-types";
import { DICT, type Lang } from "../src/lib/i18n";

const U = 19.05;

function mkKey(overrides: Partial<KeyProps>): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}

function makeLayout(keys: KeyProps[], name = "keycap-test"): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

/** 带图例的 1u 键（用于行高锚点判定） */
function legendKey(x: number, y: number, legend: string): KeyProps {
  const labels = Array(12).fill("");
  labels[0] = legend;
  return mkKey({ x, y, w: 1, h: 1, labels });
}

// ═══════════════════════════════════════════════════════════════════
// 1. 宽度 → 模型名
// ═══════════════════════════════════════════════════════════════════

describe("键帽模型名（r{行}-{宽}u）", () => {
  it("宽度片段省略小数点：1 → 1、1.25 → 125、6.25 → 625", () => {
    expect(keycapWidthSlug(1)).toBe("1");
    expect(keycapWidthSlug(1.25)).toBe("125");
    expect(keycapWidthSlug(1.5)).toBe("15");
    expect(keycapWidthSlug(1.75)).toBe("175");
    expect(keycapWidthSlug(2)).toBe("2");
    expect(keycapWidthSlug(2.25)).toBe("225");
    expect(keycapWidthSlug(2.5)).toBe("25");
    expect(keycapWidthSlug(2.75)).toBe("275");
    expect(keycapWidthSlug(6.25)).toBe("625");
  });

  it("每行实际提供的宽度全部命中库中模型（稀疏表）", () => {
    for (const row of [1, 2, 3, 4] as KeycapRow[]) {
      const widths = KEYCAP_WIDTHS_BY_ROW[row];
      expect(widths.length, `R${row} 宽度表不应为空`).toBeGreaterThan(0);
      for (const w of widths) {
        expect(hasKeycapModel(row, w), `R${row} 缺 ${w}u`).toBe(true);
        expect(keycapModelName(row, w)).toBe(`R${row}-${keycapWidthSlug(w)}u`);
      }
    }
    // 本套模型就是稀疏的：R1 只有 1u / 2u
    expect([...KEYCAP_WIDTHS_BY_ROW[1]]).toEqual([1, 2]);
    expect([...KEYCAP_WIDTHS_BY_ROW[3]]).toEqual([1, 1.25, 1.5, 1.75, 2, 2.25]);
  });

  it("空格只走 spc-* 模型（6.25 / 6 / 7u），其余宽度回落该行 1u", () => {
    expect(SPACE_WIDTHS).toEqual([6.25, 6, 7]);
    expect(spaceKeycapName(6.25)).toBe("spc-625u");
    expect(spaceKeycapName(6)).toBe("spc-6u");
    expect(spaceKeycapName(7)).toBe("spc-7u");
    expect(spaceKeycapName(6.5)).toBeNull();
    // 空格在 R4 行带里也不会被当成 R4-625u
    expect(keycapModelName(4, 6.25)).toBe("R4-1u");
    expect(keycapModelFor(mkKey({ x: 0, y: 0, w: 6.25, h: 1 }), 4)).toBe("spc-625u");
    expect(keycapModelFor(mkKey({ x: 0, y: 0, w: 7, h: 1 }), 4)).toBe("spc-7u");
  });

  it("库中没有的「奇怪宽度」一律回落该行 1u", () => {
    for (const odd of [3, 2.5, 1.125, 0.5, 10]) {
      expect(keycapModelName(2, odd), `${odd}u 应回落 1u`).toBe("R2-1u");
      expect(hasKeycapModel(2, odd)).toBe(false);
    }
    // R1 没有 1.25u / 1.5u / 1.75u / 2.25u —— 全部回落 1u
    for (const odd of [1.25, 1.5, 1.75, 2.25, 2.5, 2.75]) {
      expect(keycapModelName(1, odd), `R1 无 ${odd}u`).toBe("R1-1u");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1b. 特殊模型（阶梯 / home F·J·5 / ISO Enter）
// ═══════════════════════════════════════════════════════════════════

describe("特殊模型匹配（阶梯 / sculpted / home / 小键盘 Enter·+ / ISO Enter）", () => {
  /** 阶梯 Caps Lock：KLE `l` */
  const steppedCaps = mkKey({ x: 0, y: 0, w: 1.75, h: 1, l: true });
  /** 普通 1.75u Caps Lock（不阶梯） */
  const plainCaps = mkKey({ x: 0, y: 0, w: 1.75, h: 1 });
  /** ISO Enter：高键 + L 形 + 底部 1.5u（与 presets 里的编码一致） */
  const isoEnter = mkKey({ x: 0, y: 0, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 });
  /** big-ass enter：底部 2.25u —— 不是 ISO，不该命中 R3-iso */
  const bigAss = mkKey({ x: 0, y: 0, w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75 });
  /** 小键盘 Enter：1u 宽 × 2u 高 */
  const padEnter = mkKey({ x: 0, y: 0, w: 1, h: 2 });
  /** 小键盘 +：1u 宽 × 2u 高 */
  const padPlus = mkKey({ x: 0, y: 0, w: 1, h: 2 });

  it("阶梯键（KLE l）→ R3-175stepped；不阶梯的同宽键仍走常规", () => {
    expect(specialKeycap(steppedCaps, 3)).toBe("stepped");
    expect(keycapModelFor(steppedCaps, 3)).toBe("R3-175stepped");
    expect(specialKeycap(plainCaps, 3)).toBeNull();
    expect(keycapModelFor(plainCaps, 3)).toBe("R3-175u");
  });

  it("ISO Enter → R3-iso；big-ass enter（底部 2.25u）不误判", () => {
    expect(isIsoEnterKey(isoEnter)).toBe(true);
    expect(keycapModelFor(isoEnter, 3)).toBe("R3-iso");
    expect(isIsoEnterKey(bigAss)).toBe(false);
    expect(keycapModelFor(bigAss, 3)).not.toBe("R3-iso");
  });

  it("小键盘 Enter（1u×2u）→ R3-enter；R2 行带的 1u×2u → R2-2u+", () => {
    expect(specialKeycap(padEnter, 3)).toBe("enter");
    expect(keycapModelFor(padEnter, 3)).toBe("R3-enter");
    // 104 配列里小键盘 Enter 跨 ZXC 行与底排 → 行带落在 R4
    expect(specialKeycap(padEnter, 4)).toBe("enter");
    expect(keycapModelFor(padEnter, 4)).toBe("R3-enter");
    expect(specialKeycap(padPlus, 2)).toBe("plus");
    expect(keycapModelFor(padPlus, 2)).toBe("R2-2u+");
    // 普通 1u 键不会命中
    expect(specialKeycap(mkKey({ x: 0, y: 0, w: 1, h: 1 }), 3)).toBeNull();
    // 2u 宽的键（非 1u 高键）也不命中
    expect(specialKeycap(mkKey({ x: 0, y: 0, w: 2, h: 1 }), 3)).toBeNull();
  });

  it("sculpted → R3-1sculpted（仅 R3 的 1u）", () => {
    const sculpt = mkKey({ x: 0, y: 0, w: 1, h: 1, sculpted: true });
    expect(specialKeycap(sculpt, 3)).toBe("sculpted");
    expect(keycapModelFor(sculpt, 3)).toBe("R3-1sculpted");
    // 其它行 / 其它宽度：没有 sculpted 模型 → 常规
    expect(specialKeycap(sculpt, 2)).toBeNull();
    expect(keycapModelFor(mkKey({ x: 0, y: 0, w: 1.5, h: 1, sculpted: true }), 3)).toBe("R3-15u");
  });

  it("home 优先于 sculpted（F/J/5 的凸点是功能，sculpted 只是外形）", () => {
    const fSculpted = mkKey({
      x: 0, y: 0, w: 1, h: 1, sculpted: true,
      labels: ["F", ...Array(11).fill("")],
    });
    expect(specialKeycap(fSculpted, 3)).toBe("home");
    expect(keycapModelFor(fSculpted, 3)).toBe("R3-home");
  });

  it("勾「定位凸点」属性（n）的键 → R3-home", () => {
    const anyKey = mkKey({ x: 0, y: 0, w: 1, h: 1, n: true, labels: ["A", ...Array(11).fill("")] });
    expect(specialKeycap(anyKey, 3)).toBe("home");
    expect(keycapModelFor(anyKey, 3)).toBe("R3-home");
    // 非 R3 行没有 home 模型 → 常规
    expect(specialKeycap(anyKey, 4)).toBeNull();
  });

  it("R3 行的 F / J / 5 → R3-home", () => {
    for (const legend of ["F", "J", "5"]) {
      const k = legendKey(0, 0, legend);
      expect(specialKeycap(k, 3), `${legend} 应命中 home`).toBe("home");
      expect(keycapModelFor(k, 3)).toBe("R3-home");
    }
  });

  it("只有 R3 行才判 home：其它行的 F / J / 5 不命中", () => {
    for (const row of [1, 2, 4] as const) {
      expect(specialKeycap(legendKey(0, 0, "F"), row)).toBeNull();
      expect(specialKeycap(legendKey(0, 0, "J"), row)).toBeNull();
      expect(specialKeycap(legendKey(0, 0, "5"), row)).toBeNull();
    }
  });

  it("数字行的「5」（图例为 %/5 两行）不算 home；键盘区其它键也不受影响", () => {
    const numberRow5 = mkKey({
      x: 0, y: 0, w: 1, h: 1,
      labels: ["%\n5", ...Array(11).fill("")],
    });
    expect(specialKeycap(numberRow5, 3)).toBeNull();
    // A / S / D / G / H 等普通 home 行键不带凸点
    for (const legend of ["A", "S", "D", "G", "H", "K", "L"]) {
      expect(specialKeycap(legendKey(0, 0, legend), 3)).toBeNull();
    }
  });

  it("带色号前缀 / 多行图例也能识别（#ff0000:F）", () => {
    const colored = mkKey({ x: 0, y: 0, w: 1, h: 1, labels: ["#ff0000:F", ...Array(11).fill("")] });
    expect(specialKeycap(colored, 3)).toBe("home");
  });

  it("buildKeycapPlacements：特殊模型计数 + 名称正确", () => {
    const layout = makeLayout([
      legendKey(0, 0, "1"), legendKey(1, 0, "2"),
      legendKey(0, 1, "Q"), legendKey(1, 1, "W"),
      legendKey(0, 2, "A"), mkKey({ x: 1, y: 2, w: 1, h: 1, l: true, labels: Array(12).fill("") }),
      legendKey(2, 2, "F"), legendKey(3, 2, "J"), legendKey(4, 2, "5"),
      mkKey({ x: 5, y: 2, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25, labels: Array(12).fill("") }),
      mkKey({ x: 6, y: 2, w: 1, h: 2, labels: Array(12).fill("") }),          // 小键盘 Enter
      mkKey({ x: 7, y: 2, w: 1, h: 1, sculpted: true, labels: Array(12).fill("") }), // sculpted
      legendKey(0, 3, "Z"), legendKey(1, 3, "X"),
      mkKey({ x: 2, y: 3, w: 6.25, h: 1, labels: Array(12).fill("") }),       // 空格
    ]);
    const plan = buildKeycapPlacements(layout, { x: 0, y: 0 });
    const names = plan.placements.map((p) => p.name);
    expect(names).toContain("R3-175stepped");
    expect(names.filter((n) => n === "R3-home")).toHaveLength(3); // F / J / 5
    expect(names).toContain("R3-iso");
    expect(names).toContain("R3-enter");
    expect(names).toContain("R3-1sculpted");
    expect(names).toContain("spc-625u");
    expect(plan.specialCount).toBe(7); // stepped + 3 home + iso + enter + sculpted
    expect(plan.fallbackCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. 行高判定
// ═══════════════════════════════════════════════════════════════════

/** F 区 + 数字行 + 三行字母 + 底排：完整 6 行带 104 风格配列骨架 */
function fullRowLayout(): KLELayout {
  const keys: KeyProps[] = [];
  // y=0 F 区
  keys.push(legendKey(0, 0, "Esc"), legendKey(2, 0, "F1"), legendKey(3, 0, "F2"));
  // y=1 数字行
  for (const [i, l] of ["1", "2", "3", "4", "5"].entries()) keys.push(legendKey(i, 1, l));
  // y=2 QWER
  for (const [i, l] of ["Q", "W", "E", "R", "T"].entries()) keys.push(legendKey(i, 2, l));
  // y=3 ASD
  for (const [i, l] of ["A", "S", "D", "F", "G"].entries()) keys.push(legendKey(i, 3, l));
  // y=4 ZXC
  for (const [i, l] of ["Z", "X", "C", "V", "B"].entries()) keys.push(legendKey(i, 4, l));
  // y=5 底排（ctrl / 空格）
  keys.push(legendKey(0, 5, "Ctrl"), mkKey({ x: 1.25, y: 5, w: 6.25, h: 1 }));
  return makeLayout(keys);
}

/** 取每个键的行高，按「行带 → 行高」压缩（同带内应完全一致） */
function rowsByBand(layout: KLELayout): KeycapRow[] {
  const { rows } = resolveKeycapRows(layout);
  const byY = new Map<number, Set<KeycapRow>>();
  layout.keys.forEach((k, i) => {
    const r = rows[i];
    if (r === null || r === undefined) return;
    if (!byY.has(k.y)) byY.set(k.y, new Set());
    byY.get(k.y)!.add(r);
  });
  return [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, set]) => {
      expect(set.size, "同一行带内行高必须一致").toBe(1);
      return [...set][0]!;
    });
}

describe("行高判定（图例锚点）", () => {
  it("F 区与数字行 = R1，QWER = R2，ASD = R3，ZXC 与底排 = R4", () => {
    const layout = fullRowLayout();
    const res = resolveKeycapRows(layout);
    expect(res.source).toBe("label");
    expect(res.bandCount).toBe(6);
    expect(rowsByBand(layout)).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it("60% 配列（无 F 区）：数字行 = R1，底排 = R4", () => {
    const keys: KeyProps[] = [];
    for (const [i, l] of ["1", "2", "3"].entries()) keys.push(legendKey(i, 0, l));
    for (const [i, l] of ["Q", "W", "E"].entries()) keys.push(legendKey(i, 1, l));
    for (const [i, l] of ["A", "S", "D"].entries()) keys.push(legendKey(i, 2, l));
    for (const [i, l] of ["Z", "X", "C"].entries()) keys.push(legendKey(i, 3, l));
    keys.push(legendKey(0, 4, "Ctrl"));
    const layout = makeLayout(keys);
    expect(resolveKeycapRows(layout).source).toBe("label");
    expect(rowsByBand(layout)).toEqual([1, 2, 3, 4, 4]);
  });

  it("多行带（F 区 + 数字行）整段归 R1；底排多行整段归 R4", () => {
    const keys: KeyProps[] = [];
    keys.push(legendKey(0, 0, "F1"), legendKey(1, 0, "F2"));
    keys.push(legendKey(0, 1, "1"), legendKey(1, 1, "2"));
    keys.push(legendKey(0, 2, "Q"), legendKey(1, 2, "W"));
    keys.push(legendKey(0, 3, "A"), legendKey(1, 3, "S"));
    keys.push(legendKey(0, 4, "Z"), legendKey(1, 4, "X"));
    keys.push(legendKey(0, 5, "Alt"), legendKey(1, 5, "Alt"));
    keys.push(legendKey(0, 6, "Space"), legendKey(1, 6, "Space"));
    const layout = makeLayout(keys);
    // 7 个行带：R1 段（F + 数字）+ R2 + R3 + R4 段（ZXC / Alt / Space）
    expect(resolveKeycapRows(layout).source).toBe("label");
    expect(rowsByBand(layout)).toEqual([1, 1, 2, 3, 4, 4, 4]);
  });

  it("每行只有 2 个字母键时仍能认定锚点（≥2 即算）", () => {
    const keys: KeyProps[] = [];
    keys.push(legendKey(0, 0, "Q"), legendKey(1, 0, "W"));
    keys.push(legendKey(0, 1, "A"), legendKey(1, 1, "S"));
    keys.push(legendKey(0, 2, "Z"), legendKey(1, 2, "X"));
    const layout = makeLayout(keys);
    const res = resolveKeycapRows(layout);
    expect(res.source).toBe("label");
    expect(rowsByBand(layout)).toEqual([2, 3, 4]);
  });

  it("同类字母只有 1 键时不误判锚点（回落到位置规则）", () => {
    const keys: KeyProps[] = [];
    keys.push(legendKey(0, 0, "Q"));
    keys.push(legendKey(0, 1, "A"));
    keys.push(legendKey(0, 2, "Z"));
    const layout = makeLayout(keys);
    const res = resolveKeycapRows(layout);
    expect(res.source).toBe("position");
    expect(rowsByBand(layout)).toEqual([3, 4, 4]);
  });
});

describe("行高判定（无图例时的位置兜底）", () => {
  it("六个行带 → R1/R1/R2/R3/R4/R4（末两带 R4、其上 R3、再上 R2、更上 R1）", () => {
    const keys: KeyProps[] = [];
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++) keys.push(mkKey({ x: col, y: row, w: 1, h: 1 }));
    }
    const layout = makeLayout(keys);
    const res = resolveKeycapRows(layout);
    expect(res.source).toBe("position");
    expect(rowsByBand(layout)).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it("五个行带（无 F 区）→ R1/R2/R3/R4/R4", () => {
    const keys: KeyProps[] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) keys.push(mkKey({ x: col, y: row, w: 1, h: 1 }));
    }
    expect(rowsByBand(makeLayout(keys))).toEqual([1, 2, 3, 4, 4]);
  });

  it("decal 键不给键帽；空配列不炸", () => {
    const layout = makeLayout([
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
      mkKey({ x: 1, y: 0, w: 1, h: 1, d: true }),
    ]);
    const res = resolveKeycapRows(layout);
    expect(res.rows[1]).toBeNull();
    expect(res.rows[0]).not.toBeNull();
    expect(resolveKeycapRows(makeLayout([])).rows).toEqual([]);
  });

  it("缺省宽度 (w 未定义/0) 的键不参与", () => {
    const layout = makeLayout([mkKey({ x: 0, y: 0, w: 0, h: 1 })]);
    expect(resolveKeycapRows(layout).rows[0]).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. 落位：孔心与定位板实际挖孔逐点一致
// ═══════════════════════════════════════════════════════════════════

/** 多边形顶点质心（孔心：正方/矩形挖孔顶点质心即几何中心；去掉闭合重复末点） */
function centroid(ring: [number, number][]): { x: number; y: number } {
  const pts =
    ring.length > 1 &&
    ring[0]![0] === ring[ring.length - 1]![0] &&
    ring[0]![1] === ring[ring.length - 1]![1]
      ? ring.slice(0, -1)
      : ring;
  const n = pts.length;
  return {
    x: pts.reduce((s, p) => s + p[0], 0) / n,
    y: pts.reduce((s, p) => s + p[1], 0) / n,
  };
}

describe("键帽原点 = 定位板开孔顶面中心", () => {
  // 覆盖所有会改变轴孔落位的特殊情况：普通键 / 阶梯 Caps / ISO Enter（高键）/
  // 6u 空格（孔右移 0.5u）/ 旋转键（绕 rx,ry）/ decal（不参与）
  const TRICKY_LAYOUT = makeLayout([
    mkKey({ x: 0, y: 0, w: 1, h: 1 }),
    mkKey({ x: 1, y: 0, w: 1.25, h: 1 }),
    mkKey({ x: 0, y: 1, w: 1.75, h: 1, l: true }), // 阶梯键
    mkKey({ x: 2, y: 1, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 }), // ISO Enter
    mkKey({ x: 0, y: 2, w: 6, h: 1 }), // 6u 空格：轴孔右移 0.5u
    mkKey({ x: 6, y: 2, w: 1, h: 1, r: 25, rx: 6.5, ry: 3 }), // 旋转键
    mkKey({ x: 8, y: 2, w: 1, h: 1, d: true }), // decal：无键帽
  ], "keycap-hole-center");

  it("每一颗参与键帽的键，孔心都能在 generatePlate 的 stpData 挖孔里找到同点", () => {
    const plate = generatePlate(TRICKY_LAYOUT, {
      switchType: 1,
      stabType: 0, // 关卫星轴孔 → 每键恰好一个方形轴孔，质心即孔心
      u1: U,
      kerf: 0,
      topPad: 0,
      leftPad: 0,
      rightPad: 0,
      bottomPad: 0,
      xGrow: 0,
      yGrow: 0,
      fillet: 0,
    });
    const holes = plate.stpData!.polyHoles;
    expect(holes.length).toBe(TRICKY_LAYOUT.keys.filter((k) => !k.d).length);

    const holeCenters = holes.map((h) => {
      const c = centroid(h as [number, number][]);
      return { x: c.x, y: -c.y }; // stpData 的 Y 已翻转 → 还原成 SVG 空间 Y↓
    });

    for (const key of TRICKY_LAYOUT.keys.filter((k) => !k.d)) {
      const mine = switchHoleCenterMm(key, U);
      const hit = holeCenters.find(
        (c) => Math.abs(c.x - mine.x) < 1e-6 && Math.abs(c.y - mine.y) < 1e-6,
      );
      expect(
        hit,
        `键 (x=${key.x}, y=${key.y}, w=${key.w}, l=${key.l}) 的孔心 ${JSON.stringify(mine)} 不在挖孔列表中`,
      ).toBeTruthy();
    }
  });

  it("6u 空格的孔心相对键几何中心右移 0.5u（与 plate-export 同规则）", () => {
    const key = mkKey({ x: 0, y: 0, w: 6, h: 1 });
    const center = switchHoleCenterMm(key, U);
    expect(center.x).toBeCloseTo((3 + 0.5) * U, 9);
    expect(center.y).toBeCloseTo(0.5 * U, 9);
  });

  it("阶梯键（l）孔心左移 0.25u", () => {
    const key = mkKey({ x: 0, y: 0, w: 1.75, h: 1, l: true });
    expect(switchHoleCenterMm(key, U).x).toBeCloseTo((1.75 / 2 - 0.25) * U, 9);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. buildKeycapPlacements：装配坐标系落位
// ═══════════════════════════════════════════════════════════════════

describe("buildKeycapPlacements", () => {
  it("以 esc 键中心为原点：X = 孔心X − origin.x，Y = origin.y − 孔心Y", () => {
    const layout = makeLayout([
      legendKey(0, 0, "`"), legendKey(1, 0, "1"), legendKey(2, 0, "2"),
      legendKey(0, 1, "Q"), legendKey(1, 1, "W"), legendKey(2, 1, "E"),
      legendKey(0, 2, "A"), legendKey(1, 2, "S"), legendKey(2, 2, "D"),
      legendKey(0, 3, "Z"), legendKey(1, 3, "X"), legendKey(2, 3, "C"),
      legendKey(0, 4, "Ctrl"), legendKey(1, 4, "Alt"), legendKey(2, 4, "Space"),
    ]);
    const esc = { x: 0.5 * U, y: 0.5 * U };
    const plan = buildKeycapPlacements(layout, esc);
    expect(plan.total).toBe(15);
    expect(plan.rowSource).toBe("label");
    expect(plan.rowCounts).toEqual({ 1: 3, 2: 3, 3: 3, 4: 6 });
    expect(plan.placements[0]).toEqual({ name: "R1-1u", x: 0, y: 0, rotation: 0 });
    // 右移 1u：装配坐标 X = 19.05（Y 不变）
    expect(plan.placements[1]!.x).toBeCloseTo(U, 9);
    expect(plan.placements[1]!.y).toBeCloseTo(0, 9);
    // 下移一行（KLE y↓）→ 装配坐标 Y 变负（Y↑ = 远使用者方向）
    expect(plan.placements[3]!.y).toBeCloseTo(-U, 9);
  });

  it("行高与宽度统计 + 回落计数", () => {
    const layout = makeLayout([
      legendKey(0, 0, "1"), legendKey(1, 0, "2"),
      legendKey(0, 1, "Q"), legendKey(1, 1, "W"),
      legendKey(0, 2, "A"), legendKey(1, 2, "S"),
      legendKey(0, 3, "Z"), legendKey(1, 3, "X"),
      mkKey({ x: 2, y: 3, w: 2.5, h: 1 }), // R4 没有 2.5u → 回落 1u
      mkKey({ x: 0, y: 4, w: 7, h: 1 }),   // 7u 空格 → spc-7u（不算回落）
    ]);
    const plan = buildKeycapPlacements(layout, { x: 0, y: 0 });
    expect(plan.rowCounts).toEqual({ 1: 2, 2: 2, 3: 2, 4: 4 });
    expect(plan.fallbackCount).toBe(1);
    const names = plan.placements.map((p) => p.name);
    expect(names[names.length - 2]).toBe("R4-1u"); // 2.5u 回落
    expect(names[names.length - 1]).toBe("spc-7u"); // 空格走 spc
  });

  it("旋转键带上自身旋转角（绕键帽轴心）", () => {
    const layout = makeLayout([
      legendKey(0, 0, "Q"), legendKey(1, 0, "W"),
      mkKey({ x: 2, y: 0, w: 1, h: 1, r: -15, rx: 1, ry: 1 }),
    ]);
    const plan = buildKeycapPlacements(layout, { x: 0, y: 0 });
    expect(plan.placements[2]!.rotation).toBe(-15);
  });

  it("6.25u 空格匹配 spc-625u", () => {
    const layout = makeLayout([
      legendKey(0, 0, "Z"), legendKey(1, 0, "X"),
      mkKey({ x: 0, y: 1, w: 6.25, h: 1 }),
    ]);
    const plan = buildKeycapPlacements(layout, { x: 0, y: 0 });
    expect(plan.placements[2]!.name).toBe("spc-625u");
    expect(plan.fallbackCount).toBe(0);
  });

  it("升降高度常量与云端 stp.rs 约定一致（6.6mm）", () => {
    expect(KEYCAP_LIFT_Z).toBe(6.6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. UI 文案（9 语言齐备）
// ═══════════════════════════════════════════════════════════════════

describe("键帽相关文案（9 语言）", () => {
  const ALL_LANGS: Lang[] = ["en", "zh", "zh-HK", "ko", "ja", "ru", "fr", "pt", "es"];

  it("assembly.capsHint / capsFallback / capsRowByPosition / capsPaused 各语言齐备", () => {
    for (const key of [
      "assembly.capsHint",
      "assembly.capsFallback",
      "assembly.capsRowByPosition",
      "assembly.capsPaused", // 键帽装配暂停提示（模型修正中）
    ]) {
      for (const lang of ALL_LANGS) {
        expect(DICT[key]?.[lang], `${key} 缺 ${lang}`).toBeTruthy();
      }
    }
  });

  it("assembly.capsMatched 含 {{total}}/{{r1}}..{{r4}} 占位符", () => {
    for (const lang of ALL_LANGS) {
      const s = DICT["assembly.capsMatched"]?.[lang] ?? "";
      for (const ph of ["{{total}}", "{{r1}}", "{{r2}}", "{{r3}}", "{{r4}}"]) {
        expect(s, `capsMatched 缺 ${ph} (${lang})`).toContain(ph);
      }
    }
  });

  it("assembly.capsFallback 含 {{count}} 占位符", () => {
    for (const lang of ALL_LANGS) {
      expect(DICT["assembly.capsFallback"]?.[lang], `缺 {{count}} (${lang})`).toContain("{{count}}");
    }
  });
});

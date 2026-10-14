/**
 * 轴体装配落位守卫（STP 装配图「轴体」部件，2026-10）
 *
 * 规格（机主定稿）：
 *   1. 模型 = `switch_asm_MIT.stp`；「轴心点」= Ø3.85 轴心柱轴线 × 12.6385×13.5689 底面 的交点；
 *   2. 装配时轴心点与 **PCB 对应轴孔的上顶面圆心 XYZ 三轴重合**；
 *   3. 模型左右 Ø1.45 定位柱柱心对齐 PCB 轴孔左右两定位孔孔心（±5.08）；
 *   4. 每个按键一颗轴体。
 *
 * 本文件守住三件事：
 *   - **落位与 PCB 实际挖孔逐点一致**（`switch-model.ts` 复刻的 `swCx/swCy` 与真实
 *     `generatePCB(...).stpData.circleHoles` 对齐，含阶梯键 / 高键 / 旋转键）；
 *   - **旋转语义**：`r + 高键 90° + 用户开关旋转覆盖`，并用「±5.08 定位孔的连线方向」
 *     反向验证（这条连线就是轴体定位柱的朝向）；
 *   - 装配坐标系落位（X = 孔心X − origin.x、Y = origin.y − 孔心Y、Z = PCB 顶面）。
 */
import { describe, expect, it } from "vitest";
import {
  buildSwitchPlacements,
  isTallKey,
  pcbSwitchCenterMm,
  switchRotationSvg,
} from "../src/lib/switch-model";
import { generatePCB } from "../src/lib/pcb-export";
import type { PCBConfig } from "../src/lib/pcb-export";
import { DEFAULT_META, DEFAULT_PROPS, type KLELayout, type KeyProps } from "../src/lib/kle-types";
import { DICT, type Lang } from "../src/lib/i18n";

const U = 19.05;
const PCB_TOP_Z = -5.0;

function mkKey(o: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, ...o };
}

function makeLayout(keys: KeyProps[], name = "switch-test"): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

const PCB_CFG: PCBConfig = {
  solderType: "sunken", // THT 孔型：中心 r2 + 左右 r0.85 + 两个 r0.75
  needStab: false, // 关卫星轴，保证每键恰好 5 个轴孔
  needLed: false,
  edgeDistance: 3,
  needTypeC: false,
  need4P: false,
  needMCU: false,
  typeCX: 0, typeCY: 0, fourPX: 0, fourPY: 0, mcuX: 0, mcuY: 0,
  typeCRot: 0, fourPRot: 0, mcuRot: 0,
};

/** 从 PCB 的 stpData 圆孔里找基准孔 */
function holesOf(layout: KLELayout, keyIndex: number, switchRotations?: Record<string, number>) {
  const pcb = generatePCB(layout, PCB_CFG, switchRotations ?? {});
  const holes = (pcb.stpData?.circleHoles ?? []) as [number, number, number][];
  const key = layout.keys[keyIndex]!;
  const c = pcbSwitchCenterMm(key, U);
  const centerAsm = { x: c.x, y: -c.y };
  const centerHole = holes.find(
    (h) => Math.abs(h[2] - 2) < 1e-9 && Math.hypot(h[0] - centerAsm.x, h[1] - centerAsm.y) < 1e-6,
  );
  return { holes, centerAsm, centerHole };
}

// ═══════════════════════════════════════════════════════════════════
// 1. 与 PCB 实际挖孔逐点一致
// ═══════════════════════════════════════════════════════════════════

describe("轴体落位 = PCB 轴孔上顶面圆心", () => {
  // 覆盖：普通键 / 阶梯 Caps / ISO Enter（高键）/ 旋转键 / 6.25u 空格
  const LAYOUT = makeLayout([
    mkKey({ x: 0, y: 0, w: 1, h: 1 }),
    mkKey({ x: 1.5, y: 0, w: 1.75, h: 1, l: true }), // 阶梯键
    mkKey({ x: 0, y: 1, w: 1.25, h: 1, x2: -0.25, y2: 1, w2: 1.5, h2: 1 }), // ISO Enter（高键）
    mkKey({ x: 3, y: 1, w: 1.25, h: 1, r: 25, rx: 4, ry: 2 }), // 旋转键
    mkKey({ x: 0, y: 3, w: 6.25, h: 1 }), // 空格
  ], "switch-holes");

  it("每键的中心轴孔（r=2）正好落在复刻出的中心上", () => {
    for (let i = 0; i < LAYOUT.keys.length; i++) {
      const { centerHole } = holesOf(LAYOUT, i);
      expect(centerHole, `键 #${i} 找不到中心轴孔`).toBeTruthy();
    }
  });

  it("左右 Ø1.45 定位柱（PCB 侧 r=0.85 孔）距中心 5.08，且连线方向 = 轴体旋转", () => {
    for (let i = 0; i < LAYOUT.keys.length; i++) {
      const key = LAYOUT.keys[i]!;
      const { holes, centerAsm } = holesOf(LAYOUT, i);
      const pins = holes.filter(
        (h) => Math.abs(h[2] - 0.85) < 1e-9 && Math.hypot(h[0] - centerAsm.x, h[1] - centerAsm.y) < 5.08 + 0.5,
      );
      expect(pins.length, `键 #${i} 的定位孔数量`).toBe(2);
      for (const p of pins) {
        const d = Math.hypot(p[0] - centerAsm.x, p[1] - centerAsm.y);
        expect(d, `键 #${i} 定位孔距中心`).toBeCloseTo(5.08, 9);
      }
      // 两孔中点 = 轴线交点
      const mid = { x: (pins[0]![0] + pins[1]![0]) / 2, y: (pins[0]![1] + pins[1]![1]) / 2 };
      expect(Math.hypot(mid.x - centerAsm.x, mid.y - centerAsm.y)).toBeLessThan(1e-6);

      // 连线方向：装配坐标系（Y↑）里应为 CCW 的 −θ（θ = SVG 顺时针旋转）
      const theta = switchRotationSvg(key, i) * Math.PI / 180;
      const want = { x: 5.08 * Math.cos(-theta), y: 5.08 * Math.sin(-theta) };
      const dir = { x: pins[1]![0] - centerAsm.x, y: pins[1]![1] - centerAsm.y };
      const ok = Math.hypot(dir.x - want.x, dir.y - want.y) < 1e-6;
      const flipped = Math.hypot(dir.x + want.x, dir.y + want.y) < 1e-6;
      expect(ok || flipped, `键 #${i} 定位柱连线方向与旋转不符 (θ=${theta * 180 / Math.PI}°)`).toBe(true);
    }
  });

  it("阶梯键的轴孔中心比几何中心左移 0.25u（与 PCB 一致）", () => {
    const stepped = LAYOUT.keys[1]!;
    const normal = mkKey({ x: 1.5, y: 0, w: 1.75, h: 1 });
    expect(pcbSwitchCenterMm(normal, U).x - pcbSwitchCenterMm(stepped, U).x).toBeCloseTo(0.25 * U, 9);
  });

  it("高键（ISO Enter）判定 + 90° 旋转", () => {
    const iso = LAYOUT.keys[2]!;
    expect(isTallKey(iso)).toBe(true);
    expect(switchRotationSvg(iso, 2) % 360).toBe(90);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. 旋转规则
// ═══════════════════════════════════════════════════════════════════

describe("轴体旋转 = 键旋转 + 高键 90° + 开关旋转覆盖", () => {
  it("普通键：直接用键旋转（SVG 约定）", () => {
    const k = mkKey({ x: 0, y: 0, w: 1, h: 1, r: 30 });
    expect(switchRotationSvg(k, 0)).toBe(30);
  });

  it("用户开关旋转覆盖参与叠加", () => {
    const k = mkKey({ x: 0, y: 0, w: 1, h: 1, r: 10 });
    expect(switchRotationSvg(k, 7, { "switch-7": -15 })).toBe(-5);
    expect(switchRotationSvg(k, 8, { "switch-7": -15 })).toBe(10); // 只作用于该键
  });

  it("覆盖也作用于 PCB 实际挖孔（两端一致）", () => {
    const layout = makeLayout([mkKey({ x: 0, y: 0, w: 1, h: 1 })]);
    const { holes, centerAsm } = holesOf(layout, 0, { "switch-0": 90 });
    const pins = holes.filter((h) => Math.abs(h[2] - 0.85) < 1e-9);
    // 旋转 90°（SVG 顺时针）→ 装配系里定位柱沿 Y 轴排布
    expect(Math.abs(pins[0]![0] - centerAsm.x)).toBeLessThan(1e-6);
    expect(Math.abs(Math.abs(pins[0]![1] - centerAsm.y) - 5.08)).toBeLessThan(1e-6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. 装配坐标系落位
// ═══════════════════════════════════════════════════════════════════

describe("buildSwitchPlacements", () => {
  it("每键一颗；X = 孔心X − origin.x，Y = origin.y − 孔心Y，Z = PCB 顶面", () => {
    const layout = makeLayout([
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
      mkKey({ x: 1, y: 0, w: 1, h: 1 }),
      mkKey({ x: 0, y: 1, w: 1, h: 1 }),
    ]);
    const esc = { x: 0.5 * U, y: 0.5 * U };
    const plan = buildSwitchPlacements(layout, esc, PCB_TOP_Z);
    expect(plan.total).toBe(3);
    expect(plan.placements[0]!.x).toBeCloseTo(0, 9);
    expect(plan.placements[0]!.y).toBeCloseTo(0, 9);
    expect(plan.placements[0]!.z).toBe(PCB_TOP_Z);
    expect(plan.placements[1]!.x).toBeCloseTo(U, 9);
    expect(plan.placements[2]!.y).toBeCloseTo(-U, 9); // SVG Y↓ → 装配 Y↑
  });

  it("decal 键与零宽键不装轴", () => {
    const layout = makeLayout([
      mkKey({ x: 0, y: 0, w: 1, h: 1 }),
      mkKey({ x: 1, y: 0, w: 1, h: 1, d: true }),
      mkKey({ x: 2, y: 0, w: 0, h: 1 }),
    ]);
    const plan = buildSwitchPlacements(layout, { x: 0, y: 0 }, PCB_TOP_Z);
    expect(plan.total).toBe(1);
  });

  it("空配列不炸", () => {
    expect(buildSwitchPlacements(makeLayout([]), { x: 0, y: 0 }, PCB_TOP_Z).placements).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. UI 文案（9 语言齐备）
// ═══════════════════════════════════════════════════════════════════

describe("轴体相关文案（9 语言）", () => {
  const ALL_LANGS: Lang[] = ["en", "zh", "zh-HK", "ko", "ja", "ru", "fr", "pt", "es"];

  it("assembly.switchesHint / switchesMatched 各语言齐备", () => {
    for (const key of ["assembly.switchesHint", "assembly.switchesMatched"]) {
      for (const lang of ALL_LANGS) {
        expect(DICT[key]?.[lang], `${key} 缺 ${lang}`).toBeTruthy();
      }
    }
  });

  it("switchesMatched 含 {{total}} 占位符", () => {
    for (const lang of ALL_LANGS) {
      expect(DICT["assembly.switchesMatched"]?.[lang]).toContain("{{total}}");
    }
  });
});

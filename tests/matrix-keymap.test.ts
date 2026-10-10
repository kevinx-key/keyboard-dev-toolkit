/**
 * 矩阵（Key Matrix）+ QMK 社区版导出 测试
 *
 * 覆盖：
 * - computeKeyMatrices 几何自动分配 / 用户覆盖 / 兼容按键列 +1
 * - keyToKeycode 图例映射（Shift 数字 → 基础数字键；左右修饰键；空格回退）
 * - buildExportModel 排除兼容按键、按物理行分组
 * - generateKeymapC（第 0 层 + 空第 1 层、kindlestar studio 署名）
 * - generateKeyboardJson（manufacturer + layouts.LAYOUT.layout）
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_PROPS, DEFAULT_META } from "@/lib/kle-types";
import type { KeyProps } from "@/lib/kle-types";
import { computeKeyMatrices, matrixSize, findMatrixCollisions } from "@/lib/key-matrix";
import { keyToKeycode } from "@/lib/qmk-keycodes";
import { buildExportModel, generateKeymapC, generateKeyboardJson } from "@/lib/qmk-export-community";
import { serializeKLE, parseKLE } from "@/lib/kle-parser";
import { serializeKLEJSON, parseKLEJSON } from "@/lib/kle-serial";

function mk(overrides?: Partial<KeyProps>): KeyProps {
  return { ...DEFAULT_PROPS, ...overrides };
}

/** 一行键：从 x=0 起依次 1u 排布。 */
function row(y: number, labels: string[], startX = 0): KeyProps[] {
  return labels.map((label, i) =>
    mk({ x: startX + i, y, labels: [label, "", "", "", label, "", "", "", "", "", "", ""] }),
  );
}

describe("computeKeyMatrices", () => {
  it("左上角第一键为 (0,0)，行列按零起计数", () => {
    const keys = [...row(0, ["Esc", "1", "2"]), ...row(1, ["Tab", "Q", "W"])];
    const m = computeKeyMatrices(keys);
    expect(m[0]).toMatchObject({ row: 0, col: 0 });
    expect(m[3]).toMatchObject({ row: 1, col: 0 });
    expect(matrixSize(m)).toEqual({ rows: 2, cols: 3 });
  });

  it("用户覆盖字段优先于几何分配", () => {
    const keys = [...row(0, ["Esc", "1"])];
    keys[1] = { ...keys[1]!, matrixRow: 4, matrixCol: 9 };
    const m = computeKeyMatrices(keys);
    expect(m[1]).toMatchObject({ row: 4, col: 9, overridden: true });
  });

  it("兼容按键列 = 兼容常规键列 + 1（同组同位置，多个依次递增）", () => {
    const keys = [
      mk({ x: 0, y: 0, w: 1 }),
      mk({ x: 1, y: 0, w: 2, compat: 0, compatOption: 0 }), // 2u 常规键
      mk({ x: 1, y: 0, w: 1, compat: 1, compatOption: 0 }), // split 1
      mk({ x: 2, y: 0, w: 1, compat: 1, compatOption: 0 }), // split 2
      mk({ x: 3, y: 0, w: 1 }),
    ];
    const m = computeKeyMatrices(keys);
    expect(m[1]!.col).toBe(1);
    expect(m[2]!.col).toBe(2);
    expect(m[3]!.col).toBe(3);
    expect(findMatrixCollisions(m)).toHaveLength(0);
  });
});

describe("keyToKeycode", () => {
  it("数字行 Shift 图例映射到基础数字键（KC_1 而非 KC_EXLM）", () => {
    const k = mk({ x: 0, y: 0, labels: ["!", "", "", "", "", "", "1", "", "", "", "", ""] });
    expect(keyToKeycode(k, true)).toBe("KC_1");
  });

  it("左右修饰键按物理位置判定", () => {
    const shift = mk({ labels: ["", "", "", "", "Shift", "", "", "", "", "", "", ""] });
    expect(keyToKeycode(shift, true)).toBe("KC_LSFT");
    expect(keyToKeycode(shift, false)).toBe("KC_RSFT");
  });

  it("空图例的宽键（空格）回退 KC_SPC", () => {
    const space = mk({ w: 6.25, labels: Array(12).fill("") });
    expect(keyToKeycode(space, true)).toBe("KC_SPC");
  });

  it("Esc / Backspace 命名键映射", () => {
    expect(keyToKeycode(mk({ labels: ["", "", "", "", "Esc", "", "", "", "", "", "", ""] }), true)).toBe("KC_ESC");
    expect(keyToKeycode(mk({ labels: ["", "", "", "", "Backspace", "", "", "", "", "", "", ""] }), true)).toBe("KC_BSPC");
  });
});

describe("QMK 社区版导出", () => {
  const keys = [
    ...row(0, ["Esc", "1", "2"]),
    ...row(1, ["Tab", "Q", "W"]),
  ];
  const meta = { ...DEFAULT_META, name: "TestBoard" };

  it("导出模型按物理行分组", () => {
    const model = buildExportModel(keys);
    expect(model.entries.map((e) => e.code)).toEqual([
      "KC_ESC", "KC_1", "KC_2",
      "KC_TAB", "KC_Q", "KC_W",
    ]);
    expect(model.rowGroups).toHaveLength(2);
  });

  it("keymap.c 含 kindlestar studio 署名、LAYOUT 与空第 1 层", () => {
    const c = generateKeymapC(buildExportModel(keys));
    expect(c).toContain("kindlestar studio");
    expect(c).not.toContain("ai03");
    expect(c).toContain("#include QMK_KEYBOARD_H");
    expect(c).toContain("[0] = LAYOUT(");
    expect(c).toContain("[1] = LAYOUT(");
    expect(c).toContain("KC_ESC");
    expect(c).toContain("_______");
  });

  it("keyboard.json 为完整文件并含 layouts.LAYOUT.layout", () => {
    const json = generateKeyboardJson(buildExportModel(keys), meta, keys);
    const parsed = JSON.parse(json);
    expect(parsed.manufacturer).toBe("kindlestar studio");
    expect(parsed.keyboard_name).toBe("TestBoard");
    expect(parsed.layouts.LAYOUT.layout[0]).toEqual({ matrix: [0, 0], x: 0, y: 0 });
    expect(parsed.matrix_pins.rows).toHaveLength(2);
    expect(parsed.matrix_pins.cols).toHaveLength(3);
  });

  it("兼容按键（compat=1）不进入导出", () => {
    const withCompat = [
      ...row(0, ["Esc", "1", "2"]),
      mk({ x: 0, y: 1, w: 1, compat: 1, compatOption: 0, labels: ["", "", "", "", "X", "", "", "", "", "", "", ""] }),
    ];
    const model = buildExportModel(withCompat);
    expect(model.entries.map((e) => e.index)).not.toContain(3);
  });
});

describe("矩阵覆盖持久化（刷新 / 自动保存 / 项目文件）", () => {
  it("经 KLE hash 往返保留覆盖（刷新优先走 hash 路径）", () => {
    const keys = [...row(0, ["Esc", "1", "2"])];
    keys[1] = { ...keys[1]!, matrixRow: 2, matrixCol: 7 };
    const layout = { meta: { ...DEFAULT_META }, keys };

    const raw = serializeKLE(layout);
    const back = parseKLE(raw);

    expect(back.keys[1]).toMatchObject({ matrixRow: 2, matrixCol: 7 });
    // 未覆盖的键不应被写入字段
    expect(back.keys[0]!.matrixRow).toBeUndefined();
    expect(back.keys[2]!.matrixCol).toBeUndefined();
  });

  it("经 KLE JSON 往返保留覆盖（项目文件路径）", () => {
    const keys = [...row(0, ["Esc", "1"])];
    keys[0] = { ...keys[0]!, matrixRow: 5, matrixCol: 3 };
    const layout = { meta: { ...DEFAULT_META }, keys };

    const json = serializeKLEJSON(layout) as unknown[];
    const back = parseKLEJSON(json);

    expect(back!.keys[0]).toMatchObject({ matrixRow: 5, matrixCol: 3 });
  });

  it("覆盖在导出中具最高优先级（几何重算后被覆盖值生效）", () => {
    const keys = [...row(0, ["Esc", "1", "2"])];
    keys[2] = { ...keys[2]!, matrixRow: 9, matrixCol: 0 };
    const m = computeKeyMatrices(keys);
    expect(m[2]).toMatchObject({ row: 9, col: 0, overridden: true });
    // 其余键仍是几何自动分配
    expect(m[0]).toMatchObject({ row: 0, col: 0, overridden: false });
  });
});

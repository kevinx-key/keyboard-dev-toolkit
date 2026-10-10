/**
 * QMK 社区版导出 — 由当前配列生成 keymap.c 与 keyboard.json（layout 项）。
 *
 * - keymap.c：第 0 层按物理行排布 KC 键值；第 1 层为空（_______）。
 *   版权行署名 kindlestar studio。排除兼容按键（compat=1）。
 * - keyboard.json：完整文件骨架 + layouts.LAYOUT.layout 数组（matrix/x/y）。
 *
 * 键值通过 qmk-keycodes 从键帽图例推导；矩阵通过 key-matrix 计算（含覆盖与兼容规则）。
 */

import type { KeyProps, KLEMeta } from "./kle-types";
import { computeKeyMatrices, matrixSize, type KeyMatrixInfo } from "./key-matrix";
import { keyToKeycode, isResolvedKeycode } from "./qmk-keycodes";

const PHYS_ROW_TOL = 0.5;

export interface ExportEntry {
  /** 原始 keys 数组下标 */
  index: number;
  code: string;
  row: number;
  col: number;
}

export interface ExportModel {
  entries: ExportEntry[];
  /** 每个物理行在 entries 中的下标集合（用于 keymap.c 换行） */
  rowGroups: number[][];
  matrixRows: number;
  matrixCols: number;
  matrices: KeyMatrixInfo[];
  /** 未识别键值的键下标 */
  unresolved: number[];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 按物理行分组（y 容忍 0.5），行按 y 升序、行内按 x 升序。 */
function groupByPhysicalRow(indices: number[], keys: KeyProps[]): number[][] {
  const sorted = [...indices].sort((a, b) => (keys[a]!.y ?? 0) - (keys[b]!.y ?? 0));
  const groups: number[][] = [];
  let current: number[] = [];
  let currentY: number | null = null;

  for (const i of sorted) {
    const y = keys[i]!.y ?? 0;
    if (currentY === null || Math.abs(y - currentY) < PHYS_ROW_TOL) {
      current.push(i);
      if (currentY === null) currentY = y;
    } else {
      groups.push(current);
      current = [i];
      currentY = y;
    }
  }
  if (current.length > 0) groups.push(current);

  for (const g of groups) g.sort((a, b) => (keys[a]!.x ?? 0) - (keys[b]!.x ?? 0));
  groups.sort((a, b) => (keys[a[0]!]!.y ?? 0) - (keys[b[0]!]!.y ?? 0));
  return groups;
}

/** 构建导出模型（keymap.c 与 keyboard.json 共用）。 */
export function buildExportModel(keys: KeyProps[]): ExportModel {
  const matrices = computeKeyMatrices(keys);
  const size = matrixSize(matrices);

  if (keys.length === 0) {
    return { entries: [], rowGroups: [], matrixRows: 0, matrixCols: 0, matrices, unresolved: [] };
  }

  // 键中心 X 相对键盘中线，用于左右修饰键判定
  let minX = Infinity;
  let maxX = -Infinity;
  for (const k of keys) {
    minX = Math.min(minX, k.x ?? 0);
    maxX = Math.max(maxX, (k.x ?? 0) + (k.w ?? 1));
  }
  const centerX = (minX + maxX) / 2;

  // 排除兼容按键（compat=1）
  const exportIndices = keys.map((_, i) => i).filter((i) => keys[i]!.compat !== 1);
  const groups = groupByPhysicalRow(exportIndices, keys);

  const entries: ExportEntry[] = [];
  const rowGroups: number[][] = [];
  const unresolved: number[] = [];

  for (const group of groups) {
    const groupPositions: number[] = [];
    for (const i of group) {
      const k = keys[i]!;
      const isLeft = ((k.x ?? 0) + (k.w ?? 1) / 2) <= centerX;
      const code = keyToKeycode(k, isLeft);
      if (!isResolvedKeycode(code)) unresolved.push(i);
      const m = matrices[i] ?? { row: 0, col: 0, overridden: false };
      groupPositions.push(entries.length);
      entries.push({ index: i, code, row: m.row, col: m.col });
    }
    rowGroups.push(groupPositions);
  }

  return {
    entries,
    rowGroups,
    matrixRows: size.rows,
    matrixCols: size.cols,
    matrices,
    unresolved,
  };
}

const INDENT = "        "; // 8 spaces — 与 QMK 参考文件对齐

/** 生成 keymap.c 文本。 */
export function generateKeymapC(model: ExportModel): string {
  const year = new Date().getFullYear();
  const layer0 = model.entries.map((e) => e.code);
  const width = Math.max(9, ...layer0.map((c) => c.length + 2), "_______".length + 2);

  const formatRow = (tokens: string[]): string => {
    const body = tokens.map((t) => `${t},`.padEnd(width)).join("");
    return INDENT + body.trimEnd();
  };

  const lines0: string[] = [];
  const lines1: string[] = [];
  for (const group of model.rowGroups) {
    const tokens0 = group.map((p) => model.entries[p]!.code);
    const tokens1 = group.map(() => "_______");
    lines0.push(formatRow(tokens0));
    lines1.push(formatRow(tokens1));
  }

  return [
    `/* Copyright ${year} kindlestar studio */`,
    `/* SPDX-License-Identifier: GPL-2.0-or-later */`,
    ``,
    `#include QMK_KEYBOARD_H`,
    ``,
    `const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {`,
    ``,
    `    [0] = LAYOUT(`,
    ...lines0,
    `    ),`,
    ``,
    `    [1] = LAYOUT(`,
    ...lines1,
    `    )`,
    ``,
    `};`,
    ``,
  ].join("\n");
}

/** 生成完整 keyboard.json 文本（含 layouts.LAYOUT.layout）。 */
export function generateKeyboardJson(model: ExportModel, meta: KLEMeta, keys: KeyProps[]): string {
  const cols = Array.from({ length: model.matrixCols }, (_, i) => `COL${i}`);
  const rows = Array.from({ length: model.matrixRows }, (_, i) => `ROW${i}`);
  const jstr = (s: string): string => JSON.stringify(s);

  const layoutLines = model.entries.map((e) => {
    const k = keys[e.index]!;
    const parts = [
      `"matrix": [${e.row}, ${e.col}]`,
      `"x": ${round2(k.x ?? 0)}`,
      `"y": ${round2(k.y ?? 0)}`,
    ];
    if ((k.w ?? 1) > 1) parts.push(`"w": ${round2(k.w ?? 1)}`);
    if ((k.h ?? 1) > 1) parts.push(`"h": ${round2(k.h ?? 1)}`);
    return `                {${parts.join(", ")}}`;
  });

  return [
    `{`,
    `    "manufacturer": "kindlestar studio",`,
    `    "keyboard_name": ${jstr(meta.name || "Keyboard")},`,
    `    "maintainer": "kindlestar",`,
    `    "diode_direction": "COL2ROW",`,
    `    "processor": "RP2040",`,
    `    "matrix_pins": {`,
    `        "cols": [${cols.map(jstr).join(", ")}],`,
    `        "rows": [${rows.map(jstr).join(", ")}]`,
    `    },`,
    `    "layouts": {`,
    `        "LAYOUT": {`,
    `            "layout": [`,
    layoutLines.join(",\n"),
    `            ]`,
    `        }`,
    `    }`,
    `}`,
    ``,
  ].join("\n");
}


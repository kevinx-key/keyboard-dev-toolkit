/**
 * Key Matrix — 编辑器用的「每键矩阵位置」计算。
 *
 * 与 matrix-core.ts 的关系：
 *   - matrix-core.assignMatrix 是纯几何算法（PCB 预览/导出共用），不感知编辑器状态；
 *   - 本模块在其结果之上叠加两条编辑器规则，得到「每个按键最终生效的 (row,col)」：
 *       1) 兼容按键（compat=1）列 = 其配对的兼容常规键（compat=0）列 + 1（同组 + 同物理位置）
 *       2) 每键可选覆盖字段 matrixRow / matrixCol（用户在「矩阵」页手动指定）
 *
 * 设计：结果实时派生（keys 变化即重新计算），无覆盖的键永远自动跟随几何。
 */

import type { KeyProps } from "./kle-types";
import type { KLEKey } from "./matrix-types";
import { assignMatrix, keyPropsToKLEKeys } from "./matrix-core";

/** 物理行容忍偏差（key units）—— 与 KLE 行分组约定一致 */
const PHYS_ROW_TOL = 0.5;

export interface KeyMatrixInfo {
  row: number;
  col: number;
  /** true = 用户手动覆盖（matrixRow/matrixCol 至少一项已设置） */
  overridden: boolean;
}

/**
 * 计算每个按键最终生效的矩阵位置，返回数组下标与传入 keys 一一对应。
 */
export function computeKeyMatrices(keys: KeyProps[]): KeyMatrixInfo[] {
  if (keys.length === 0) return [];

  const kleKeys = keyPropsToKLEKeys(keys);
  const result: KeyMatrixInfo[] = kleKeys.map(() => ({ row: 0, col: 0, overridden: false }));

  // 1) 几何自动分配
  const base = assignMatrix(kleKeys);
  for (const a of base.assignments) {
    const i = typeof a.key.index === "number" ? a.key.index : kleKeys.indexOf(a.key);
    if (i >= 0 && i < result.length) {
      result[i] = { row: a.row, col: a.col, overridden: false };
    }
  }

  // 2) 兼容按键列 +1
  applyCompatColumns(keys, result);

  // 3) 用户覆盖（最后应用，优先级最高）
  keys.forEach((k, i) => {
    const info = result[i]!;
    const hasRow = typeof k.matrixRow === "number";
    const hasCol = typeof k.matrixCol === "number";
    if (hasRow || hasCol) {
      result[i] = {
        row: hasRow ? (k.matrixRow as number) : info.row,
        col: hasCol ? (k.matrixCol as number) : info.col,
        overridden: true,
      };
    }
  });

  return result;
}

/**
 * 兼容按键列规则：
 *   在同一 compatOption 组内，为每个 compat=1（兼容按键）找到物理位置重叠的
 *   compat=0（兼容常规键），令其列 = 常规键列 + 1；同组多个兼容键依次 +1 避免冲突。
 */
function applyCompatColumns(keys: KeyProps[], result: KeyMatrixInfo[]): void {
  const regularsByOption = new Map<number, number[]>();
  const variantsByOption = new Map<number, number[]>();

  keys.forEach((k, i) => {
    if (k.compat === 0) {
      const opt = k.compatOption ?? 0;
      const arr = regularsByOption.get(opt) ?? [];
      arr.push(i);
      regularsByOption.set(opt, arr);
    } else if (k.compat === 1) {
      const opt = k.compatOption ?? 0;
      const arr = variantsByOption.get(opt) ?? [];
      arr.push(i);
      variantsByOption.set(opt, arr);
    }
  });

  for (const [opt, variantIdxs] of variantsByOption) {
    const regulars = regularsByOption.get(opt) ?? [];
    if (regulars.length === 0) continue;

    // 按物理 x 排序，保证同组兼容键从左到右依次 +1
    const ordered = [...variantIdxs].sort((a, b) => (keys[a]!.x ?? 0) - (keys[b]!.x ?? 0));

    for (const vi of ordered) {
      const vk = keys[vi]!;
      const match = regulars.find((ri) => {
        const rk = keys[ri]!;
        return samePhysicalRow(rk, vk) && overlapX(rk, vk);
      });
      if (match === undefined) continue;

      const baseRow = result[match]!.row;
      const baseCol = result[match]!.col;

      // 该行已占用的列（排除自身）
      const used = new Set<number>();
      result.forEach((r, i) => {
        if (i !== vi && r.row === baseRow) used.add(r.col);
      });

      let col = baseCol + 1;
      while (used.has(col)) col += 1;

      result[vi] = { row: baseRow, col, overridden: false };
    }
  }
}

function samePhysicalRow(a: KeyProps, b: KeyProps): boolean {
  return Math.abs((a.y ?? 0) - (b.y ?? 0)) <= PHYS_ROW_TOL;
}

function overlapX(a: KeyProps, b: KeyProps): boolean {
  const aRight = (a.x ?? 0) + (a.w ?? 1);
  const bRight = (b.x ?? 0) + (b.w ?? 1);
  return (a.x ?? 0) < bRight - 0.01 && (b.x ?? 0) < aRight - 0.01;
}

/** 统计重复占用的矩阵位置（同一 (row,col) 被多个键使用）。 */
export function findMatrixCollisions(
  matrices: KeyMatrixInfo[],
): Array<{ row: number; col: number; indices: number[] }> {
  const map = new Map<string, number[]>();
  matrices.forEach((m, i) => {
    const key = `${m.row},${m.col}`;
    const arr = map.get(key) ?? [];
    arr.push(i);
    map.set(key, arr);
  });
  const collisions: Array<{ row: number; col: number; indices: number[] }> = [];
  for (const [key, indices] of map) {
    if (indices.length > 1) {
      const [r, c] = key.split(",").map(Number);
      collisions.push({ row: r!, col: c!, indices });
    }
  }
  return collisions;
}

/** 供外部使用：从最终矩阵计算行列总数。 */
export function matrixSize(matrices: KeyMatrixInfo[]): { rows: number; cols: number } {
  let maxRow = -1;
  let maxCol = -1;
  for (const m of matrices) {
    if (m.row > maxRow) maxRow = m.row;
    if (m.col > maxCol) maxCol = m.col;
  }
  return { rows: maxRow + 1, cols: maxCol + 1 };
}

/** 便于调试/预览：把 KLEKey 也暴露出去（避免调用方再 import 类型）。 */
export type { KLEKey };

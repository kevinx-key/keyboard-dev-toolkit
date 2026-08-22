/**
 * Matrix Core — 矩阵分配核心引擎（公共库）
 *
 * 核心算法：将 KLE 键盘布局（物理坐标）转换为矩阵坐标。
 * 由 PCB 矩阵模式、KiCad 导出与 QMK 导出插件共用。
 *
 * 设计原则：
 * 1. 矩阵是逻辑的，不是物理的 — matrix[row,col] 只表示二极管交叉点
 * 2. 同行的键不一定同矩阵行（ai03 Vega: Delete [0,14] → [2,12] 孤儿键）
 * 3. 大键的列号只递增 1，不递增物理宽度
 * 4. 列可以跳过不连续（KBD75 方向键区域的列跳跃）
 *
 * 算法阶段：
 *   Phase 1 - Y 坐标分组 → 物理行
 *   Phase 2 - 物理行排序 → 矩阵行号
 *   Phase 3 - 逐行分配列号（含间隙检测）
 *   Phase 4 - 孤儿键检测与重分配
 *   Phase 5 - 矩阵压缩（可选）
 */

import type { KLEKey, MatrixAssignment, MatrixResult } from './matrix-types';

/* ============ 常量 ============ */

/** Y 坐标分组容忍偏差 (key units) */
const Y_TOLERANCE = 0.25;
/** 列间隙跳过阈值 (key units) */
const COL_GAP_THRESHOLD = 0.5;
/** 右边缘孤儿键 X 坐标阈值 */
const ORPHAN_X_THRESHOLD = 13;

/* ============ 主入口 ============ */

export function assignMatrix(keys: KLEKey[]): MatrixResult {
  if (keys.length === 0) {
    return { assignments: [], matrixRows: 0, matrixCols: 0 };
  }

  // Phase 1: Y 坐标分组 → 物理行
  const physicalRows = groupByY(keys, Y_TOLERANCE);

  // Phase 2: 排序 + 行号分配
  const sortedRows = physicalRows.sort((a, b) => {
    const ay = a[0]?.y ?? 0;
    const by = b[0]?.y ?? 0;
    return ay - by;
  });
  const allAssignments: MatrixAssignment[] = [];

  for (let rowIndex = 0; rowIndex < sortedRows.length; rowIndex++) {
    // Phase 3: 行内列分配
    const row = sortedRows[rowIndex];
    if (!row) continue;
    const rowAssignments = assignRowColumns(row, rowIndex);
    allAssignments.push(...rowAssignments);
  }

  // Phase 4: 孤儿键检测与重分配
  detectAndFixOrphans(allAssignments, sortedRows);

  // 计算矩阵尺寸
  const maxRow = allAssignments.reduce((m, a) => Math.max(m, a.row), -1);
  const maxCol = allAssignments.reduce((m, a) => Math.max(m, a.col), -1);

  return {
    assignments: allAssignments,
    matrixRows: maxRow + 1,
    matrixCols: maxCol + 1,
  };
}

/* ============ Phase 1: Y 坐标分组 ============ */

/**
 * 将按键按 Y 坐标分组为物理行
 * 容忍 ≤Y_TOLERANCE 的垂直偏差（旋转组或微小偏移）
 */
function groupByY(keys: KLEKey[], tolerance: number): KLEKey[][] {
  const sorted = [...keys].sort((a, b) => a.y - b.y);
  const rows: KLEKey[][] = [];
  let currentRow: KLEKey[] = [];
  const firstKey = sorted[0];
  let currentY = firstKey ? firstKey.y : 0;

  for (const key of sorted) {
    if (Math.abs(key.y - currentY) <= tolerance) {
      currentRow.push({ ...key, physicalRow: rows.length });
    } else {
      if (currentRow.length > 0) rows.push(currentRow);
      currentRow = [{ ...key, physicalRow: rows.length }];
      currentY = key.y;
    }
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows;
}

/* ============ Phase 3: 行内列分配 ============ */

/**
 * 为单行内的按键分配列号
 *
 * 规则:
 *   - 按键按 X 坐标升序排列
 *   - 每个按键分配递增的列号
 *   - 前置键右侧与当前键左侧有 >0.5U 间隙时，跳过对应列数
 *   - 大键 (w>1) 的物理宽度不额外消耗列号
 *   - 覆盖率测试: ai03 Vega、Keychron Q2、CannonKeys DB60
 */
function assignRowColumns(rowKeys: KLEKey[], rowIndex: number): MatrixAssignment[] {
  const sorted = [...rowKeys].sort((a, b) => a.x - b.x);
  const result: MatrixAssignment[] = [];
  let currentCol = 0;

  for (let i = 0; i < sorted.length; i++) {
    const key = sorted[i];
    if (!key) continue;

    if (i > 0) {
      const prev = sorted[i - 1];
      if (!prev) continue;
      const prevRightEdge = prev.x + prev.w;
      const gap = key.x - prevRightEdge;

      if (gap > COL_GAP_THRESHOLD) {
        // 有物理间隙 → 跳过列号
        currentCol += Math.ceil(gap);
      } else if (gap < -0.01) {
        // 按键重叠！这是孤儿键的标志
        // 先分配列号，孤儿检测阶段会重新处理
        currentCol += 1;
      } else {
        // 正常相邻
        currentCol += 1;
      }
    }

    result.push({ row: rowIndex, col: currentCol, key });
  }

  return result;
}

/* ============ Phase 4: 孤儿键检测 ============ */

interface OrphanCandidate {
  assignment: MatrixAssignment;
  physicalRowIndex: number;
  preferredRow: number;
}

/**
 * 检测并修复"孤儿键" — 那些物理位置在一个行但矩阵位置在另一行的键
 *
 * 案例: ai03 Vega Delete 键
 *   - 物理: x=14, y=0 (第一行右侧)
 *   - 矩阵: [2, 12] (第三行列12)
 *   - 原因: 被 2U Backspace 覆盖物理空间，实为右侧功能区
 */
function detectAndFixOrphans(
  assignments: MatrixAssignment[],
  physicalRows: KLEKey[][],
): void {
  const orphans = findOrphanCandidates(assignments, physicalRows);
  for (const orphan of orphans) {
    reassignOrphanKey(orphan, assignments, physicalRows);
  }
}

/**
 * 查找孤儿键候选项：
 * 1. 与其同物理行前一个键有重叠(负间隙)
 * 2. 位于键盘右边缘 (x ≥ ORPHAN_X_THRESHOLD)
 * 3. 其右边缘接近下一个物理行的起始
 */
function findOrphanCandidates(
  assignments: MatrixAssignment[],
  physicalRows: KLEKey[][],
): OrphanCandidate[] {
  const orphans: OrphanCandidate[] = [];

  for (let pi = 0; pi < physicalRows.length; pi++) {
    const keys = physicalRows[pi];
    if (!keys) continue;
    const sorted = [...keys].sort((a, b) => a.x - b.x);

    for (let ki = 0; ki < sorted.length; ki++) {
      const key = sorted[ki];
      if (!key) continue;
      const assign = assignments.find(
        (a) => a.key === key && a.row === pi,
      );
      if (!assign) continue;

      // 检测条件：
      // 1. 与前一键有重叠
      if (ki > 0) {
        const prev = sorted[ki - 1];
        if (!prev) continue;
        const prevRight = prev.x + prev.w;
        if (key.x < prevRight - 0.01) {
          // 重叠检测通过，检查其他条件
          if (key.x >= ORPHAN_X_THRESHOLD) {
            // 2. 在右边缘
            // 找垂直对齐的物理行
            const preferredRow = findVerticalAlignmentRow(key, physicalRows, pi);
            if (preferredRow !== pi) {
              orphans.push({
                assignment: assign,
                physicalRowIndex: pi,
                preferredRow,
              });
            }
          }
        }
      }

      // 独立检测：x ≥ 14 且为 1U 键，可能为 nav cluster 孤儿
      if (key.x >= ORPHAN_X_THRESHOLD && key.w <= 1 && key.h <= 1) {
        // 检查是否是当前行最右端的"额外"键
        const rowRightEdge = Math.max(...sorted.map((k) => k.x + k.w));
        if (key.x + key.w > rowRightEdge - 0.5) {
          // 标准 nav cluster 键：检查是否已正确对齐
          const alignedRow = findVerticalAlignmentRow(key, physicalRows, pi);
          if (alignedRow !== pi) {
            const existing = orphans.find((o) => o.assignment === assign);
            if (!existing) {
              orphans.push({
                assignment: assign,
                physicalRowIndex: pi,
                preferredRow: alignedRow,
              });
            }
          }
        }
      }
    }
  }

  return orphans;
}

/**
 * 找按键的垂直对齐行 — 看它在 Y 方向上最接近哪个物理行
 * 用于判断"这个在物理行 0 的键是否应该属于行 2"
 */
function findVerticalAlignmentRow(
  key: KLEKey,
  physicalRows: KLEKey[][],
  currentRowIndex: number,
): number {
  const keyCenterY = key.y + key.h / 2;

  // 排除当前行，找 Y 最接近的另一行
  let bestRow = currentRowIndex;
  let bestDist = Infinity;

  for (let ri = 0; ri < physicalRows.length; ri++) {
    if (ri === currentRowIndex) continue;
    const row = physicalRows[ri];
    if (!row) continue;
    const rowY = row[0]?.y ?? 0;
    const dist = Math.abs(keyCenterY - rowY);
    if (dist < bestDist) {
      bestDist = dist;
      bestRow = ri;
    }
  }

  // 如果找到的行在垂直范围内（偏差 ≤ 1.5U），使用它
  if (bestDist <= 1.5) return bestRow;
  return currentRowIndex;
}

/**
 * 重分配孤儿键到目标矩阵行
 *
 * 在目标行中找到下一个可用列号
 */
function reassignOrphanKey(
  orphan: OrphanCandidate,
  assignments: MatrixAssignment[],
  _physicalRows: KLEKey[][],
): void {
  const targetRow = orphan.preferredRow;

  // 找到目标行当前使用的所有列号
  const usedCols = new Set(
    assignments
      .filter((a) => a.row === targetRow)
      .map((a) => a.col),
  );

  // 从目标行最大列号+"跳跃"模式找可用列
  const targetAssignments = assignments.filter((a) => a.row === targetRow);
  const maxCol = targetAssignments.reduce((m, a) => Math.max(m, a.col), -1);

  // 找第一个可用列（从 maxCol + 1 开始，但如果 maxCol 附近有间隙则使用间隙）
  let availableCol = maxCol + 1;
  // 主行通常将最后一列保留给 nav cluster
  // 检查 1-2 列前是否有空位
  for (let c = maxCol - 1; c >= maxCol - 3 && c >= 0; c--) {
    if (!usedCols.has(c)) {
      availableCol = c;
      break;
    }
  }

  orphan.assignment.row = targetRow;
  orphan.assignment.col = availableCol;
}

/* ============ Phase 5: 矩阵压缩（可选） ============ */

/**
 * 压缩矩阵 — 移除稀疏列，减少 GPIO 使用
 *
 * 算法：检测列间隙，左移填平，保持行内相对顺序
 */
export function compressMatrix(assignments: MatrixAssignment[]): MatrixAssignment[] {
  // 已按行分组，找出每行使用的列号
  const rowCols = new Map<number, number[]>();
  for (const a of assignments) {
    if (!rowCols.has(a.row)) rowCols.set(a.row, []);
    rowCols.get(a.row)!.push(a.col);
  }

  // 收集所有使用的列
  const allCols = new Set(assignments.map((a) => a.col));
  const sortedCols = [...allCols].sort((a, b) => a - b);

  // 建立列号映射
  const colMap = new Map<number, number>();
  sortedCols.forEach((original, compressed) => {
    colMap.set(original, compressed);
  });

  return assignments.map((a) => ({
    ...a,
    col: colMap.get(a.col) ?? a.col,
  }));
}

/* ============ 工具函数 ============ */

/**
 * 从 KLE 的 KeyProps 数组构建 KLEKey 数组
 */
export function keyPropsToKLEKeys(
  keyProps: Array<{
    x: number;
    y: number;
    w?: number;
    h?: number;
    labels: string[];
    d?: boolean;
    r?: number;
    rx?: number;
    ry?: number;
    c?: string;
    t?: string;
  }>,
): KLEKey[] {
  return keyProps.map((kp) => ({
    x: kp.x,
    y: kp.y,
    w: kp.w ?? 1,
    h: kp.h ?? 1,
    labels: kp.labels ?? [],
    r: kp.r,
    rx: kp.rx,
    ry: kp.ry,
    d: kp.d,
    c: kp.c,
    t: kp.t,
    isDecal: kp.d === true,
  }));
}

/**
 * 将矩阵分配结果格式化为可读的字符串（用于调试/预览）
 */
export function formatMatrix(assignments: MatrixAssignment[]): string {
  const rowMap = new Map<number, string[]>();
  for (const a of assignments) {
    if (!rowMap.has(a.row)) rowMap.set(a.row, []);
    const label = a.key.labels[4]?.trim() || '?';
    rowMap.get(a.row)![a.col] = `${label}[${a.row},${a.col}]`;
  }

  const lines: string[] = [];
  for (const [row, cols] of [...rowMap.entries()].sort()) {
    const entries = cols
      .map((c, i) => c || `---[${row},${i}]`)
      .join(' | ');
    lines.push(`Row ${row}: ${entries}`);
  }
  return lines.join('\n');
}

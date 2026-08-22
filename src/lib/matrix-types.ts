/**
 * 矩阵分配公共类型
 *
 * 从 src/plugins/qmk-export/types.ts 提取，供 PCB 矩阵模式 + QMK 导出共用。
 */

/** 简化的 KLE 键表示（从 KeyProps 提取核心字段） */
export interface KLEKey {
  x: number;
  y: number;
  w: number;
  h: number;
  labels: string[];
  r?: number;     // 旋转角度
  rx?: number;    // 旋转中心 X
  ry?: number;    // 旋转中心 Y
  d?: boolean;    // decal (装饰键)
  c?: string;     // 颜色
  t?: string;     // 文本颜色
  isDecal: boolean;
  /** 物理行序号（从 KLE 数据推断） */
  physicalRow?: number;
}

/** 矩阵坐标分配 */
export interface MatrixAssignment {
  row: number;
  col: number;
  key: KLEKey;
}

/** 矩阵分配结果 */
export interface MatrixResult {
  assignments: MatrixAssignment[];
  matrixRows: number;
  matrixCols: number;
}

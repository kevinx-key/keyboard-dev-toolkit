/**
 * 轴间棉 (Between-Switch Foam) 生成引擎
 *
 * 形状规则（与定位板同形）：外轮廓 + 开关孔 + 稳定器孔。
 * 几何直接复用 generatePlate，只额外携带棉片厚度 thickness
 * （仅用于 STP 3D 挤出，不参与 2D 几何）。
 */

import { generatePlate } from "./plate-export";
import type { PlateConfig, PlateResult, PlateRotationOverrides } from "./plate-export";
import type { KLELayout } from "./kle-types";

export interface SwitchFoamConfig extends PlateConfig {
  /** 棉片厚度 (mm) —— 由调用方传给 exportSTP，不参与 2D 几何 */
  thickness: number;
  /** 「圆角」：所有挖孔（外框以外图形）的圆角半径 (mm)；外框圆角用继承的 fillet */
  holeFillet: number;
  /** 短边开槽阈值 (mm)：轮廓上短于此值的短边沿相邻垂边开槽消除；0 = 关闭。默认 2 */
  minFeature: number;
}

/** 默认棉片厚度 (mm) */
export const DEFAULT_FOAM_THICKNESS = 3;

const DEFAULT_SWITCH_FOAM_CONFIG: SwitchFoamConfig = {
  switchType: 1,
  stabType: 1,
  u1: 19.05,
  kerf: 0,
  topPad: 0,
  leftPad: 0,
  rightPad: 0,
  bottomPad: 0,
  xGrow: 0,
  yGrow: 0,
  fillet: 0,
  holeFillet: 0,
  minFeature: 2,
  thickness: DEFAULT_FOAM_THICKNESS,
};

/**
 * 生成轴间棉几何。返回结构与定位板一致（svg / dxf / stpData / regions）。
 * 与定位板的差异由 foamStab + holeFillet 控制：
 *  - 卫星轴孔 = 矩形（顶部与轴孔齐平）+ 顶部连接横槽（4mm）
 *  - 所有挖孔直角 → holeFillet 圆角；外框四角圆角用 cfg.fillet
 */
export function generateSwitchFoam(
  layout: KLELayout,
  config?: Partial<SwitchFoamConfig>,
  rotationOverrides?: PlateRotationOverrides,
  compatKeyIndices?: Set<number>,
): PlateResult {
  const cfg: SwitchFoamConfig = { ...DEFAULT_SWITCH_FOAM_CONFIG, ...config };
  return generatePlate(layout, cfg, rotationOverrides, {
    foamStab: true,
    holeFillet: cfg.holeFillet,
    minFeature: cfg.minFeature, // 交错开孔清理：消除 < minFeature 的薄肋/碎边
    compatKeyIndices,
  });
}

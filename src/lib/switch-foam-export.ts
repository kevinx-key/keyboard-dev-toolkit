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
  fillet: 1,
  thickness: DEFAULT_FOAM_THICKNESS,
};

/**
 * 生成轴间棉几何。返回结构与定位板一致（svg / dxf / stpData / regions）。
 * 与定位板的差异由 foamStab + cornerFillet 控制：
 *  - 卫星轴孔 = 矩形（顶部与轴孔齐平）+ 顶部连接横槽（4mm）
 *  - 所有元素直角 → cornerFillet（默认 1mm）圆角
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
    cornerFillet: cfg.fillet,
    compatKeyIndices,
  });
}

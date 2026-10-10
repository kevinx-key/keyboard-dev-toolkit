/**
 * Editor Settings — 各编辑区用户可调参数的集中类型与默认值。
 *
 * 目的：让「保存全部」项目文件能完整持久化 / 还原每个编辑器的配置，
 * 并让各 Section 受控化（config 由 EditorPage 持有）。
 * 这些类型均为 UI 层设置（不含导出引擎内部参数）。
 */

import type { PlateConfig } from "./plate-export";
import type { PCBConfig, CustomRect } from "./pcb-export";

/** 定位板编辑器设置（PlateConfig + 编辑器专属开关） */
export interface PlateSettings extends PlateConfig {
  fillet: number;
  lineColor: string;
  lineWeight: number;
  dmz: number;
  padEnabled: boolean;
  /** 「圆角」：外框以外的所有图形圆角 */
  holeFillet: number;
  kerfEnabled: boolean;
  u1Enabled: boolean;
  lineColorEnabled: boolean;
  lineWeightEnabled: boolean;
  customPolygons: string;
}

/** 轴间棉编辑器设置 */
export interface FoamSettings {
  fillet: number;
  holeFillet: number;
  minFeature: number;
  thickness: number;
}

/** 轴下垫编辑器设置 */
export interface PadSettings {
  outerFillet: number;
}

/** 底棉编辑器设置（含自定义圆角矩形） */
export interface BottomFoamSettings {
  thickness: number;
  holeFillet: number;
  outerFillet: number;
  minFeature: number;
  thinWall: number;
  customRects: CustomRect[];
}

export const DEFAULT_PLATE_SETTINGS: PlateSettings = {
  switchType: 1, stabType: 1, u1: 19.05, kerf: 0,
  topPad: 0, leftPad: 0, rightPad: 0, bottomPad: 0, xGrow: 0, yGrow: 0,
  // eslint-disable-next-line no-restricted-syntax -- 数据默认色值（非 UI 内联样式）
  fillet: 0, holeFillet: 0, lineColor: "#000000", lineWeight: 0.05, dmz: 5,
  padEnabled: false, kerfEnabled: false,
  u1Enabled: false, lineColorEnabled: false, lineWeightEnabled: false,
  customPolygons: "",
};

export const DEFAULT_FOAM_SETTINGS: FoamSettings = {
  fillet: 0, holeFillet: 0, minFeature: 2, thickness: 3,
};

export const DEFAULT_PAD_SETTINGS: PadSettings = { outerFillet: 0 };

export const DEFAULT_BOTTOM_FOAM_SETTINGS: BottomFoamSettings = {
  thickness: 3, holeFillet: 0, outerFillet: 0, minFeature: 2, thinWall: 0.4, customRects: [],
};

export const DEFAULT_PCB_CONFIG: PCBConfig = {
  solderType: "socket", needStab: true, needLed: false, edgeDistance: 5,
  outerFillet: 0,
  needTypeC: false, need4P: false, needMCU: false,
  typeCX: -1.5, typeCY: 16, fourPX: 196, fourPY: 17.5, mcuX: 91, mcuY: 62,
  typeCRot: 270, fourPRot: 270, mcuRot: 45,
};

/** 全部编辑器设置（项目文件持久化用） */
export interface EditorSettings {
  plate: PlateSettings;
  foam: FoamSettings;
  pad: PadSettings;
  bottomFoam: BottomFoamSettings;
}

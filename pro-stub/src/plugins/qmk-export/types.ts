/**
 * QMK Export 模块类型定义
 *
 * 定义矩阵分配、键值映射、引脚分配等所有子模块的共享类型
 */

/* ============ 导出配置 ============ */

export interface QmkExportConfig {
  keyboardName: string;
  manufacturer: string;
  maintainer: string;
  url: string;
  mcu: McuType;
  diodeDirection: 'COL2ROW' | 'ROW2COL';
  viaEnabled: boolean;
  encoderEnabled: boolean;
  features: QmkFeature[];
  layoutName: string;
  vid: string;
  pid: string;
  deviceVersion: string;
  /** 是否启用 OLED */
  oledEnabled: boolean;
}

export type McuType =
  | 'STM32F072'
  | 'STM32F411'
  | 'STM32L432'
  | 'RP2040'
  | 'NRF52840';

export type QmkFeature =
  | 'bootmagic'
  | 'extrakey'
  | 'mousekey'
  | 'nkro'
  | 'rgblight'
  | 'rgb_matrix'
  | 'backlight';

/* ============ 矩阵公共类型（从 src/lib/matrix-types 重导出） ============ */

export type { KLEKey, MatrixAssignment, MatrixResult } from "../../lib/matrix-types";

/* ============ 引脚分配 ============ */

export interface PinAssignment {
  colPins: string[];
  rowPins: string[];
}

export interface McuConfig {
  processor: string;
  bootloader: string;
  colPins: string[];
  rowPins: string[];
  eeprom: 'wear_leveling' | 'none';
  support: 'default' | 'partial';
}

/* ============ 键值映射 ============ */

export type KeycodeCategory =
  | 'basic'
  | 'modifier'
  | 'function'
  | 'nav'
  | 'layer'
  | 'media'
  | 'lighting'
  | 'advanced'
  | 'special';

export interface KeycodeEntry {
  legend: string;
  keycode: string;
  aliases: string[];
  category: KeycodeCategory;
}

/* ============ 配列检测 ============ */

export type LayoutType =
  | '60_ansi'
  | '60_ansi_split_rshift'
  | '60_iso'
  | '60_hhkb'
  | '60_tsangan'
  | '65_ansi_blocker'
  | '65_ansi_blocker_split_bs'
  | '65_ansi_blocker_tsangan'
  | '65_ansi_blocker_tsangan_split_bs'
  | '65_iso_blocker'
  | '65_iso_blocker_split_bs'
  | '65_iso_blocker_tsangan'
  | '65_iso_blocker_tsangan_split_bs'
  | '75_ansi'
  | '75_iso'
  | 'tkl_ansi'
  | 'tkl_iso'
  | 'tkl_f13_ansi'
  | 'tkl_f13_iso'
  | 'fullsize_ansi'
  | 'fullsize_iso'
  | 'custom';

export interface LayoutDetectionResult {
  type: LayoutType;
  keyCount: number;
  hasFKeys: boolean;
  hasNavCluster: boolean;
  hasArrowKeys: boolean;
  hasF13Plus: boolean;
}

/* ============ 布局选项（兼容键） ============ */

export interface LayoutOption {
  label: string;
  type: 'toggle' | 'choice';
  choices: string[];
  detected: boolean;
  /** 检测到此布局选项的键的位置 */
  affectedKeys?: string[];
}

export type BottomRowType = 'ansi' | 'tsangan' | 'hhkb' | 'wkl' | 'split_space';

export interface SplitKeyDetection {
  splitBackspace: boolean;
  isoEnter: boolean;
  splitLeftShift: boolean;
  splitRightShift: boolean;
  bottomRowType: BottomRowType;
}

/* ============ 编码器 ============ */

export interface EncoderConfig {
  pinA: string;
  pinB: string;
  resolution: number;
  /** 编码器在键盘中的位置索引 */
  position: number;
}

/* ============ 生成结果 ============ */

export interface GeneratedFile {
  /** 相对路径（如 "keyboard.json" / "keymaps/via/keymap.c"） */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件内容的编码方式 */
  encoding?: 'utf-8' | 'base64';
}

export interface QmkExportResult {
  files: GeneratedFile[];
  warnings: string[];
  matrixSize: { rows: number; cols: number };
  layoutType: LayoutType;
  layoutOptions: LayoutOption[];
}

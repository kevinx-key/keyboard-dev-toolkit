/**
 * 编辑器共享颜色常量 —— 颜色字面量的唯一落点。
 * UI 组件一律引用本模块（或 var(--theme-*)），禁止内联 #hex。
 * 本文件位于 src/lib/**，eslint no-restricted-syntax 对其放行（见 eslint.config.mjs）。
 */

export const WHITE = "#ffffff";
export const NEAR_WHITE = "#fff";
export const DARK_GRAY = "#333333";

/** 默认键帽底色（KLE 默认） */
export const DEFAULT_KEY_COLOR = "#c8c8c8";
/** 默认字符色 */
export const DEFAULT_LABEL_COLOR = "#1a1a1a";
/** 默认文字/取色器初值 */
export const DEFAULT_TEXT_COLOR = "#000000";
/** 默认画布/键盘背景色 */
export const DEFAULT_CANVAS_BG = "#eeeeee";

/** ColorsTab 快捷色板（暖色） */
export const WARM_COLORS = ["#d44040", "#e07030", "#f0c040", "#e8a030", "#c83030"];
/** ColorsTab 快捷色板（冷色） */
export const COLD_COLORS = ["#4080d4", "#40a080", "#6040a0", "#80b0e0", "#50c0b0"];
/** ColorsTab 快捷色板（中性色） */
export const NEUTRAL_COLORS = ["#c8c8c8", "#888888", "#2a2a2a", "#ffffff", "#e0e0d8"];
/** 字符色灰度快捷值 */
export const GRAYSCALE_PICKS = ["#000000", "#333333", "#666666", "#ffffff"];

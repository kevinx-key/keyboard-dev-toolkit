/**
 * 器件几何 —— 旋钮（EC11）与屏幕（OLED / LCD）
 *
 * 画布上「键位」不再只有开关：`KeyProps.knobDia` 存在 → 旋钮；`KeyProps.screenW` 存在 → 屏幕。
 * 两者都占用普通键位网格（x/y/w/h），但尺寸的真实来源是 mm：
 *   · 旋钮：直径（knobDia，默认 40mm），w/h 由直径换算并保持同步；
 *   · 屏幕：宽/高/圆角（screenW / screenH / screenR，mm，默认 2u × 3u）与出线方向 screenExit。
 *
 * 下方编辑器（定位板 / PCB / 轴间棉 / 轴下垫 / 底棉）统一按本模块的开槽规则出图：
 *   · 旋钮 → **17 × 17 mm 正方形**（居中于旋钮中心；PCB 后续会换成 DXF 异形槽 + 3D 模型）
 *   · 屏幕 → **出线槽**：以出线方向那条边为中心轴、对称 ±1.5mm（共 3mm 宽）、
 *            长度 = 该边边长（左右出线取高度，上下出线取宽度）的矩形
 *
 * 坐标约定与 plate-export / pcb-export 一致：绝对 mm，Y 向下（SVG 方向）。
 */

import type { DeviceKind, KeyProps, ScreenExit } from "./kle-types";
import { U_MM, rotatePoint } from "./coordinate-system";

// ─── 常量（mm） ───────────────────────────────────────────

/** 旋钮默认直径 (mm) */
export const KNOB_DEFAULT_DIA_MM = 40;

/** 旋钮在下方编辑器中的统一方孔边长 (mm) —— 17 × 17 */
export const KNOB_CUTOUT_MM = 17;

/** 屏幕出线槽宽度 (mm) —— 以出线边为中心轴，两侧各 1.5mm */
export const SCREEN_EXIT_SLOT_WIDTH_MM = 3;

/** 屏幕默认出线方向 */
export const SCREEN_DEFAULT_EXIT: ScreenExit = "bottom";

/** 屏幕默认宽度 = 2u (mm) */
export const SCREEN_DEFAULT_W_MM = 2 * U_MM;

/** 屏幕默认高度 = 3u (mm) */
export const SCREEN_DEFAULT_H_MM = 3 * U_MM;

/** 屏幕默认圆角半径 (mm) */
export const SCREEN_DEFAULT_RADIUS_MM = 1.5;

/** 屏幕尺寸允许范围 (mm) */
export const SCREEN_MIN_MM = 5;
export const SCREEN_MAX_MM = 300;

/** 出线方向（顺序即 UI 展示顺序：上、右、下、左） */
export const SCREEN_EXITS: readonly ScreenExit[] = ["top", "right", "bottom", "left"];

// ─── 类型 ────────────────────────────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/** 屏幕几何（绝对 mm，Y 向下） */
export interface ScreenGeometry {
  /** 屏幕中心 */
  cx: number;
  cy: number;
  /** 屏幕宽/高/圆角 (mm) */
  w: number;
  h: number;
  r: number;
  exit: ScreenExit;
}

/** 屏幕出线槽（相对屏幕中心的局部坐标，mm，未旋转） */
export interface SlotRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ─── 判定 ────────────────────────────────────────────────

/** 是否旋钮（knobDia 为有限正数即视为旋钮） */
export function isKnobKey(key: Pick<KeyProps, "knobDia">): boolean {
  return typeof key.knobDia === "number" && Number.isFinite(key.knobDia) && key.knobDia > 0;
}

/** 是否屏幕（screenW 为有限正数即视为屏幕） */
export function isScreenKey(key: Pick<KeyProps, "screenW">): boolean {
  return typeof key.screenW === "number" && Number.isFinite(key.screenW) && key.screenW > 0;
}

/** 器件类型；普通开关键返回 null（两者都有值时以旋钮优先） */
export function getDeviceKind(key: Pick<KeyProps, "knobDia" | "screenW">): DeviceKind | null {
  if (isKnobKey(key)) return "knob";
  if (isScreenKey(key)) return "screen";
  return null;
}

/** 归一化出线方向（非法值 → undefined） */
export function normalizeScreenExit(v: unknown): ScreenExit | undefined {
  return v === "top" || v === "right" || v === "bottom" || v === "left" ? v : undefined;
}

/** 是否为器件（旋钮 / 屏幕）—— 器件不是开关，下方编辑器不再出轴孔/卫星轴。 */
export function isDeviceKey(key: Pick<KeyProps, "knobDia" | "screenW">): boolean {
  return getDeviceKind(key) !== null;
}

// ─── 尺寸换算 ────────────────────────────────────────────

/** 键位几何中心（绝对 mm，Y 向下） */
export function keyCenterMm(key: Pick<KeyProps, "x" | "y" | "w" | "h">, u = U_MM): Pt {
  return { x: (key.x + (key.w || 1) / 2) * u, y: (key.y + (key.h || 1) / 2) * u };
}

/** 旋钮直径 (mm)；缺省 40 */
export function knobDiameterMm(key: Pick<KeyProps, "knobDia">): number {
  return isKnobKey(key) ? key.knobDia! : KNOB_DEFAULT_DIA_MM;
}

/** 直径 → 网格占位（key units，保留 4 位小数，保证往返精度） */
export function mmToUnits(mm: number, u = U_MM): number {
  return Math.round((mm / u) * 10000) / 10000;
}

/** 网格占位 → mm（保留 3 位小数） */
export function unitsToMm(units: number, u = U_MM): number {
  return Math.round(units * u * 1000) / 1000;
}

/** 屏幕几何（绝对 mm） */
export function getScreenGeometry(key: KeyProps, u = U_MM): ScreenGeometry {
  const c = keyCenterMm(key, u);
  return {
    cx: c.x,
    cy: c.y,
    w: isScreenKey(key) ? key.screenW! : (key.w || 1) * u,
    h: typeof key.screenH === "number" && Number.isFinite(key.screenH) && key.screenH > 0
      ? key.screenH
      : (key.h || 1) * u,
    r: typeof key.screenR === "number" && Number.isFinite(key.screenR) && key.screenR >= 0 ? key.screenR : 0,
    exit: key.screenExit ?? SCREEN_DEFAULT_EXIT,
  };
}

/** 屏幕圆角上限：不超过短边一半 */
export function clampScreenRadius(r: number, w: number, h: number): number {
  if (!Number.isFinite(r) || r <= 0) return 0;
  return Math.min(r, Math.min(w, h) / 2);
}

/**
 * 屏幕出线槽（相对屏幕中心的局部坐标，未旋转）。
 * 出线边为中心轴：槽沿该边全长，垂直方向对称 ±1.5mm（共 3mm）。
 */
export function screenSlotRectLocal(key: KeyProps): SlotRect {
  const g = getScreenGeometry(key);
  const half = SCREEN_EXIT_SLOT_WIDTH_MM / 2;
  const hw = g.w / 2;
  const hh = g.h / 2;
  switch (g.exit) {
    case "top":
      return { x0: -hw, y0: -hh - half, x1: hw, y1: -hh + half };
    case "bottom":
      return { x0: -hw, y0: hh - half, x1: hw, y1: hh + half };
    case "left":
      return { x0: -hw - half, y0: -hh, x1: -hw + half, y1: hh };
    case "right":
    default:
      return { x0: hw - half, y0: -hh, x1: hw + half, y1: hh };
  }
}

// ─── 多边形（绝对 mm，Y 向下） ────────────────────────────

/** 绕器件自身旋转原点旋转局部点（与画布 / 定位板同一约定）。 */
function placeLocal(key: KeyProps, local: Pt[], u: number): Pt[] {
  const c = keyCenterMm(key, u);
  const rot = key.r || 0;
  const hasOrigin = !!(key.rx || key.ry);
  const origin = hasOrigin ? { x: (key.rx || 0) * u, y: (key.ry || 0) * u } : c;
  return local.map((p) => {
    const abs = { x: c.x + p.x, y: c.y + p.y };
    return rot ? rotatePoint(abs, rot, origin) : abs;
  });
}

/** 旋钮开槽：17 × 17 mm 正方形（居中，随键旋转） */
export function knobCutoutPolygon(key: KeyProps, u = U_MM): Pt[] {
  const half = KNOB_CUTOUT_MM / 2;
  return placeLocal(key, [
    { x: -half, y: -half },
    { x: half, y: -half },
    { x: half, y: half },
    { x: -half, y: half },
  ], u);
}

/** 屏幕出线槽多边形（矩形，随键旋转） */
export function screenSlotPolygon(key: KeyProps, u = U_MM): Pt[] {
  const s = screenSlotRectLocal(key);
  return placeLocal(key, [
    { x: s.x0, y: s.y0 },
    { x: s.x1, y: s.y0 },
    { x: s.x1, y: s.y1 },
    { x: s.x0, y: s.y1 },
  ], u);
}

/**
 * 器件在下方编辑器（定位板 / PCB / 轴间棉 / 轴下垫 / 底棉）中的全部开槽。
 * 普通开关键返回空数组。
 */
export function deviceCutoutPolygons(key: KeyProps, u = U_MM): Pt[][] {
  const kind = getDeviceKind(key);
  if (kind === "knob") return [knobCutoutPolygon(key, u)];
  if (kind === "screen") return [screenSlotPolygon(key, u)];
  return [];
}

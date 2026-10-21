/**
 * 轴体装配落位（STP 装配图「轴体」部件）
 * ==================================================
 *
 * 模型：`switch_asm_MIT.stp`（私有仓 `keyboardstar-geometry/assets/switches/`，随容器镜像分发）
 * 服务端标定表：`SWITCH_AXIS_POINT`（见 `stp-service/src/stp.rs` 注释 —— 由 CREO 装配变换
 * 的设计值推出，并以「两个电脚 ↔ PCB 脚位逐点吻合」互为佐证）。
 *
 * 落位规则（机主定稿）：
 *   - 轴心点 = Ø3.85 轴心柱轴线 × 12.6385×13.5689 底面 的交点；
 *   - 装配时轴心点与 **PCB 对应轴孔的上顶面圆心 XYZ 三轴重合**；
 *   - 模型左右 Ø1.45 定位柱柱心对齐 PCB 轴孔左右两定位孔孔心（±5.08）。
 *
 * 因此这里要算的就是 **PCB 轴孔中心**（与 `pcb-export.ts` 逐字节同源：`swCx/swCy` =
 * 视觉中心 + 阶梯键偏移），以及 PCB 侧的开关旋转（`rot + isTall·90° + 用户开关旋转覆盖`）。
 * `tests/switch-model.test.ts` 对着真实 `generatePCB(...).stpData.circleHoles` 做交叉校验，
 * 防止两处漂移。
 */

import type { KLELayout, KeyProps } from "./kle-types";
import { rotatePoint } from "./coordinate-system";
import { isDeviceKey } from "./device-geometry";

/** 键位单位（PCB 侧固定 19.05 —— `pcb-export.ts` 的 `U`） */
const PCB_U = 19.05;

/** 轴体落位（服务端 contract，见 `CloudSwitchPlacement`） */
export interface SwitchPlacement {
  /** PCB 轴孔上顶面圆心 X（装配坐标系 mm） */
  x: number;
  /** PCB 轴孔上顶面圆心 Y（装配坐标系 mm） */
  y: number;
  /** PCB 轴孔上顶面圆心 Z（装配坐标系 mm；PCB 顶面 = −5.0） */
  z: number;
  /** 绕轴体自身轴线的旋转 (deg)。**SVG/KLE 约定：正 = 屏幕上顺时针**（服务端取负） */
  rotation: number;
}

export interface SwitchPlan {
  placements: SwitchPlacement[];
  /** 参与装配的键数（= 非 decal 键数） */
  total: number;
}

/** 键的有效宽高（含 KLE w2/h2 的 L 形扩展）——与 pcb-export 同源 */
function effectiveSize(key: KeyProps): { w: number; h: number } {
  const kw = key.w || 1;
  const kh = key.h || 1;
  if ((key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)) {
    const extRight = (key.x ?? 0) + (key.x2 || 0) + (key.w2 || 0);
    const extBottom = (key.y ?? 0) + (key.y2 || 0) + (key.h2 || 0);
    return {
      w: Math.max(kw, extRight - (key.x ?? 0)),
      h: Math.max(kh, extBottom - (key.y ?? 0)),
    };
  }
  return { w: kw, h: kh };
}

/** 键是否「高键」（实际高 > 实际宽）——PCB 会因此把整个轴孔阵列转 90° */
export function isTallKey(key: KeyProps): boolean {
  const { w, h } = effectiveSize(key);
  return h > w;
}

/**
 * PCB 轴孔阵列中心（绝对 mm，SVG 空间 Y↓）——**逐条对应** `pcb-export.computePCBKeyPositions`：
 * 视觉中心（绕 rx/ry 旋转后的键中心）→ 阶梯键 (KLE `l`) 再左移 0.25u（高键时该偏移随之转 90°）。
 */
export function pcbSwitchCenterMm(key: KeyProps, u1: number = PCB_U): { x: number; y: number } {
  const { w: actualW, h: actualH } = effectiveSize(key);
  const cx = ((key.x ?? 0) + actualW / 2) * u1;
  const cy = ((key.y ?? 0) + actualH / 2) * u1;

  let visualCx = cx;
  let visualCy = cy;
  const rot = key.r || 0;
  if (rot % 360 !== 0) {
    const rx = (key.rx || 0) * u1;
    const ry = (key.ry || 0) * u1;
    const origin = rx !== 0 || ry !== 0 ? { x: rx, y: ry } : { x: cx, y: cy };
    const vc = rotatePoint({ x: cx, y: cy }, rot, origin);
    visualCx = vc.x;
    visualCy = vc.y;
  }

  if (key.l) {
    const tall = actualH > actualW;
    let sox = -0.25 * u1;
    let soy = 0;
    if (tall) {
      const t = sox;
      sox = -soy;
      soy = t;
    }
    if (rot % 360 !== 0) {
      const r = rotatePoint({ x: sox, y: soy }, rot, { x: 0, y: 0 });
      sox = r.x;
      soy = r.y;
    }
    visualCx += sox;
    visualCy += soy;
  }

  return { x: visualCx, y: visualCy };
}

/**
 * PCB 侧开关旋转 (deg，SVG 约定：正 = 屏幕上顺时针)
 * = 键旋转 `r` + 高键 90°（PCB 把轴孔阵列整体转 90°）+ 用户对该键的开关旋转覆盖。
 */
export function switchRotationSvg(
  key: KeyProps,
  keyIndex: number,
  switchRotations?: Record<string, number>,
): number {
  const override = switchRotations?.[`switch-${keyIndex}`] ?? 0;
  return (key.r || 0) + (isTallKey(key) ? 90 : 0) + override;
}

/**
 * 生成整把键盘的轴体落位表（逐键一颗）。
 *
 * @param layout           KLE 配列
 * @param origin           装配原点（esc 键中心，绝对 mm，Y↓）——与 `AssemblySection` 的 dx/dy 同源
 * @param pcbTopZ          PCB 顶面 Z（装配坐标系；= 定位板顶面 − 板厚 − 板与 PCB 间隙 = −5.0）
 * @param switchRotations  PCB 编辑器里逐键的「开关旋转」覆盖（key = `switch-{layout.keys 下标}`）
 */
export function buildSwitchPlacements(
  layout: KLELayout,
  origin: { x: number; y: number },
  pcbTopZ: number,
  switchRotations?: Record<string, number>,
): SwitchPlan {
  const keys = layout.keys || [];
  const placements: SwitchPlacement[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    if (key.d) continue; // decal 不装轴
    if (isDeviceKey(key)) continue; // 旋钮 / 屏幕不装轴
    if (!(key.w > 0)) continue;
    const c = pcbSwitchCenterMm(key, PCB_U);
    placements.push({
      x: c.x - origin.x,
      y: origin.y - c.y, // SVG Y↓ → 装配 Y↑
      z: pcbTopZ,
      rotation: switchRotationSvg(key, i, switchRotations),
    });
  }

  return { placements, total: placements.length };
}

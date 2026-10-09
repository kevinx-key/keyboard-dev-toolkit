"use client";

/**
 * 兼容层（Compatibility Layer）共享状态。
 *
 * 兼容按键 = 同一键盘尺寸下，某些位置在「常规 / 兼容」两种装配间二选一。
 * 每个键的 compat 标志（0=兼容常规键 / 1=兼容按键 / undefined=常规键）存于 KeyProps；
 * 本 Context 负责「是否显示兼容标记 open + 标记不透明度 opacity」两个视图状态，
 * 供键盘画布、属性面板与 Plate/PCB/棉等编辑器统一读取：
 *   - 画布键帽：兼容按键→浅蓝、兼容常规键→浅绿（覆盖底色）
 *   - 其他编辑器：兼容键区域→浅灰标记
 *   - 显示标记时，兼容常规键（参照组）不拦截画布命中
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { KeyProps } from "./kle-types";
import { compatStackZ, compatVariantIndices, COMPAT_Z_BELOW, COMPAT_Z_NEUTRAL, COMPAT_KEY_COLOR, COMPAT_REGULAR_COLOR } from "./kle-types";

export const COMPAT_LS_OPEN = "kdt-compat-open";
export const COMPAT_LS_OPACITY = "kdt-compat-opacity";
/** 标记不透明度默认值（1 = 完全显示标记色） */
export const DEFAULT_COMPAT_OPACITY = 1;

export interface CompatLayerValue {
  /** 是否显示兼容标记（默认关闭） */
  open: boolean;
  /** 标记不透明度（0..1） */
  opacity: number;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  setOpacity: (v: number) => void;
  /** 参照组（垫底）在开/关标记时不拦截命中 */
  isDimmed: (key: Pick<KeyProps, "compat">) => boolean;
  /** 该键的叠放 z 值（置顶/中性/垫底） */
  compatZ: (key: Pick<KeyProps, "compat">) => number;
  /** 该键是否需要兼容标记（open 且带 compat 标志） */
  isCompatMarked: (key: Pick<KeyProps, "compat">) => boolean;
  /** 画布键帽覆盖色（null = 不上色） */
  canvasColor: (key: Pick<KeyProps, "compat">) => string | null;
}

const noop = () => {};
const CompatLayerContext = createContext<CompatLayerValue>({
  open: false,
  opacity: DEFAULT_COMPAT_OPACITY,
  setOpen: noop,
  toggle: noop,
  setOpacity: noop,
  isDimmed: () => false,
  compatZ: () => COMPAT_Z_NEUTRAL,
  isCompatMarked: () => false,
  canvasColor: () => null,
});

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return fallback;
  }
}

function readOpacity(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const n = raw === null ? NaN : parseFloat(raw);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
  } catch {
    return fallback;
  }
}

export function CompatLayerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState<boolean>(() => readBool(COMPAT_LS_OPEN, false));
  const [opacity, setOpacityState] = useState<number>(() => readOpacity(COMPAT_LS_OPACITY, DEFAULT_COMPAT_OPACITY));

  useEffect(() => {
    try { window.localStorage.setItem(COMPAT_LS_OPEN, open ? "1" : "0"); } catch (err) { console.warn("compat-layer: persist open flag failed", err); }
  }, [open]);

  useEffect(() => {
    try { window.localStorage.setItem(COMPAT_LS_OPACITY, String(opacity)); } catch (err) { console.warn("compat-layer: persist opacity failed", err); }
  }, [opacity]);

  const setOpen = useCallback((v: boolean) => setOpenState(v), []);
  const toggle = useCallback(() => setOpenState((v) => !v), []);
  const setOpacity = useCallback((v: number) => setOpacityState(Math.min(1, Math.max(0, v))), []);

  const isDimmed = useCallback(
    (key: Pick<KeyProps, "compat">) => compatStackZ(key.compat, open) === COMPAT_Z_BELOW,
    [open],
  );
  const compatZ = useCallback(
    (key: Pick<KeyProps, "compat">) => compatStackZ(key.compat, open),
    [open],
  );
  const isCompatMarked = useCallback(
    (key: Pick<KeyProps, "compat">) => open && key.compat !== undefined,
    [open],
  );
  const canvasColor = useCallback(
    (key: Pick<KeyProps, "compat">) => {
      if (!open || key.compat === undefined) return null;
      return key.compat === 1 ? COMPAT_KEY_COLOR : COMPAT_REGULAR_COLOR;
    },
    [open],
  );

  const value = useMemo(
    () => ({ open, opacity, setOpen, toggle, setOpacity, isDimmed, compatZ, isCompatMarked, canvasColor }),
    [open, opacity, setOpen, toggle, setOpacity, isDimmed, compatZ, isCompatMarked, canvasColor],
  );

  return <CompatLayerContext.Provider value={value}>{children}</CompatLayerContext.Provider>;
}

export function useCompatLayer(): CompatLayerValue {
  return useContext(CompatLayerContext);
}

/**
 * 便捷 hook：给一组键（按索引）算出当前需要「浅灰标记」的键索引集合。
 * 只标记**兼容按键（compat=1）**，与兼容常规键（compat=0，保持白色）区分开。
 * 供 Plate / PCB / 棉等预览层把兼容按键的真实图形单独以浅灰叠加。
 */
export function useCompatMarkedIndices(
  keys: Pick<KeyProps, "compat">[],
): { markedIndices: Set<number>; anyMarked: boolean } {
  const { open } = useCompatLayer();
  return useMemo(() => {
    const markedIndices = compatVariantIndices(keys, open);
    return { markedIndices, anyMarked: markedIndices.size > 0 };
  }, [keys, open]);
}

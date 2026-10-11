"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { analyzeCloud, geometryCloudEnabled, type CloudKind } from "./geometry-api";

export interface CloudGeometryState<T> {
  result: T | null;
  /** 云端生成中（保留上一次结果，不闪空） */
  busy: boolean;
  /** 已回落本地（离线/失败） */
  fallback: boolean;
}

const DEBOUNCE_MS = 400;

/**
 * 云端优先的高级几何生成（§G-B3 / M2a）。
 * - 在线：debounce 后调云端，返回权威结果；
 * - 离线 / 失败：回落本地 `localFallback()` 并置 `fallback=true`；
 * - `active=false`（未绘制 / 空布局）→ `result=null`。
 *
 * `snapshot` / `params` 须 JSON 可序列化（Set 先转数组）；以序列化签名去抖，
 * 抹平对象引用抖动，避免 effect 循环。
 */
export function useCloudGeometry<T>(
  kind: CloudKind,
  active: boolean,
  snapshot: unknown,
  params: Record<string, unknown>,
  localFallback: () => T,
): CloudGeometryState<T> {
  const [result, setResult] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [fallback, setFallback] = useState(false);

  const sig = useMemo(
    () => JSON.stringify({ active, kind, snapshot, params }),
    [active, kind, snapshot, params],
  );
  const inputs = useRef({ snapshot, params, localFallback, active });
  inputs.current = { snapshot, params, localFallback, active };
  const seq = useRef(0);

  useEffect(() => {
    const cur = inputs.current;
    if (!cur.active) {
      setResult(null);
      setBusy(false);
      setFallback(false);
      return;
    }
    if (!geometryCloudEnabled) {
      setBusy(false);
      setFallback(false);
      setResult(cur.localFallback());
      return;
    }

    const my = ++seq.current;
    const ac = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      const res = await analyzeCloud(kind, cur.snapshot, cur.params, ac.signal);
      if (my !== seq.current) return; // 已被更新的请求取代
      setBusy(false);
      if (res.ok) {
        setResult(res.result as T);
        setFallback(false);
      } else if (res.code !== "ABORTED") {
        setResult(cur.localFallback());
        setFallback(true);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [sig, kind]);

  return { result, busy, fallback };
}

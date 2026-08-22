"use client";

import { useEffect, useState } from "react";

/**
 * 纯 UI 辅助：延迟卸载实现离场动画（不触碰任何功能逻辑）。
 * open=true  → 挂载并在下一帧置 visible（触发入场动画）
 * open=false → 置 !visible（播放离场动画），ms 后卸载
 * 所有 setState 均在回调内（raf/timeout），避免 effect 内同步 setState。
 */
export function usePresence(open: boolean, ms = 160) {
  const [state, setState] = useState(() => ({ mounted: open, visible: open }));

  useEffect(() => {
    if (open) {
      const raf = requestAnimationFrame(() => setState(() => ({ mounted: true, visible: true })));
      return () => cancelAnimationFrame(raf);
    }
    const t1 = setTimeout(() => setState(s => ({ ...s, visible: false })), 0);
    const t2 = setTimeout(() => setState(s => ({ ...s, mounted: false })), ms);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open, ms]);

  return { mounted: state.mounted, visible: state.visible };
}

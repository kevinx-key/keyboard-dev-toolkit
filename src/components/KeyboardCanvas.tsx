"use client";

import { useCallback, useRef, useState, useMemo, useEffect, useId } from "react";
import { KEY_UNIT } from "../lib";
import type { KeyProps } from "../lib";
import { useI18n } from "../lib/i18n";
import { computeLayoutBBoxInUnits } from "../lib/coordinate-system";
import KeyRenderer from "./canvas/KeyRenderer";
import ContextMenu from "./canvas/ContextMenu";
import { getKeyCategory, hitTestKey, getKeysInArea } from "./canvas/CanvasInteraction";

interface KeyboardCanvasProps {
  keys: KeyProps[]; selectedIds: string[];
  onSelectKey: (id: string, additive: boolean) => void;
  onSelectArea: (ids: string[]) => void;
  onClearSelection: () => void;
  onMoveKeys: (dx: number, dy: number) => void;
  backgroundColor?: string; texture?: string; radii?: string;
  css?: string; categoryFilter?: string; preview?: boolean;
  unhideDecals?: boolean; readOnly?: boolean; keycapTopEffect?: string;
  onDelete?: () => void; onCopy?: () => void; onCut?: () => void;
  onPaste?: () => void; onDuplicate?: () => void;
  onSetProp?: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
  onAddKeys?: (count: number) => void;
  /** 追加到画布底部信息行右侧的提示文字（如 F1 快捷键 / 选中操作提示） */
  infoHint?: string;
}

const INFO_BAR_HEIGHT = 24;

export default function KeyboardCanvas({
  keys, selectedIds, onSelectKey, onSelectArea, onClearSelection, onMoveKeys,
  backgroundColor, texture, radii, css, categoryFilter = "All", preview = false,
  unhideDecals: _unhideDecals, readOnly, keycapTopEffect, onDelete, onCopy,
  onCut, onPaste, onDuplicate: _onDuplicate, onAddKeys, infoHint,
}: KeyboardCanvasProps) {
  const { t } = useI18n();
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{
    type: "select" | "move" | null;
    startX: number; startY: number;
    currentX: number; currentY: number;
  } | null>(null);
  /** Pending marquee start position — set on mousedown in empty area, activated on mousemove after 3px threshold */
  const pendingSelectRef = useRef<{ x: number; y: number } | null>(null);
  /** 用户手动平移后不再自动居中；布局签名变化时重置 */
  const userPannedRef = useRef(false);
  const sigRef = useRef("");
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; index: number | null;
  } | null>(null);

  // ── CSS injection (filtered) ──
  const cssId = useId();
  const safeCss = useMemo(() => {
    if (!css) return "";
    // 过滤危险 CSS 模式：url(), expression(), -moz-binding, javascript:
    return css
      .replace(/url\s*\(/gi, "url(/* filtered */")
      .replace(/expression\s*\(/gi, "expression(/* filtered */")
      .replace(/-moz-binding\s*:/gi, "-moz-binding: none")
      .replace(/javascript\s*:/gi, "/* javascript: filtered */");
  }, [css]);
  useEffect(() => {
    const existing = document.getElementById(cssId);
    if (safeCss) {
      if (existing) { existing.textContent = safeCss; }
      else { const s = document.createElement("style"); s.id = cssId; s.textContent = safeCss; document.head.appendChild(s); }
    } else if (existing) { existing.remove(); }
    return () => document.getElementById(cssId)?.remove();
  }, [safeCss, cssId]);

  // ── Dynamic background bounds（旋转感知+全键覆盖） ──
  const bgBounds = useMemo(() => {
    const pad = 0.3 * KEY_UNIT;
    if (!keys.length) return { left: 0, top: 0, width: 200, height: 200, offsetX: 10, offsetY: 10 };
    const bbox = computeLayoutBBoxInUnits(keys, true);
    const bgL = bbox.minX * KEY_UNIT - pad;
    const bgT = bbox.minY * KEY_UNIT - pad;
    return {
      left: bgL, top: bgT,
      width: (bbox.maxX - bbox.minX) * KEY_UNIT + pad * 2,
      height: (bbox.maxY - bbox.minY) * KEY_UNIT + pad * 2,
      offsetX: Math.max(0, -bgL), offsetY: Math.max(0, -bgT),
    };
  }, [keys]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const isFilterActive = categoryFilter !== "All";
  const selectedKeyInfo = useMemo(() => {
    if (selectedIds.length !== 1) return null;
    const idx = parseInt(selectedIds[0]!, 10);
    const key = keys[idx];
    if (!key) return null;
    return `  ${t("canvas.infoPos")} X:${key.x.toFixed(1)} Y:${key.y.toFixed(1)}  ${t("canvas.infoRot")}:${key.r || 0}°`;
  }, [keys, selectedIds, t]);
  const infoBarText = `${t("canvas.infoKeys")}: ${keys.length}  ${t("canvas.infoSelected")}: ${selectedIds.length}  ${t("canvas.infoZoom")}: ${Math.round(scale * 100)}%${selectedKeyInfo || ""}`;

  const closeMenu = () => setContextMenu(null);
  const handleContextDelete = () => { closeMenu(); onDelete?.(); };
  const handleContextCopy = () => { closeMenu(); onCopy?.(); };
  const handleContextCut = () => { closeMenu(); onCut?.(); };
  const handleContextPaste = () => { closeMenu(); onPaste?.(); };
  const handleContextDuplicate = () => { closeMenu(); onCopy?.(); queueMicrotask(() => onPaste?.()); };
  const handleContextSelectAll = () => { closeMenu(); onSelectArea(keys.map((_, i) => String(i))); };
  const handleContextAddRow = () => { closeMenu(); onAddKeys?.(1); };

  // ── Zoom: Ctrl+scroll（手动缩放后不再自动适配） ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    userPannedRef.current = true;
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.round(Math.max(0.25, Math.min(4, prev + delta)) * 100) / 100);
  }, []);

  useEffect(() => {
    const el = canvasWrapperRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── 自适应：把整个布局按比例缩放并居中放入画布（用户交互后不再自动调整） ──
  const applyFit = useCallback(() => {
    const el = canvasWrapperRef.current;
    if (!el || !keys.length) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40) return;
    const raw = Math.min(
      1,
      (rect.width - 24) / bgBounds.width,
      (rect.height - 12) / bgBounds.height,
    );
    const s = Math.max(0.25, Math.min(4, Math.round(raw * 100) / 100));
    const px = rect.width / 2 - (rect.width - bgBounds.width) / 2 - bgBounds.offsetX - s * (bgBounds.left + bgBounds.width / 2);
    const py = rect.height / 2 - (rect.height - bgBounds.height) / 2 - bgBounds.offsetY - s * (bgBounds.top + bgBounds.height / 2);
    setScale(s);
    setPanX(px);
    setPanY(py);
  }, [bgBounds, keys.length]);

  useEffect(() => {
    const sig = `${keys.length}|${bgBounds.left.toFixed(1)},${bgBounds.top.toFixed(1)},${bgBounds.width.toFixed(0)}x${bgBounds.height.toFixed(0)}`;
    if (sigRef.current !== sig) { sigRef.current = sig; userPannedRef.current = false; }
    if (userPannedRef.current || !keys.length) return;
    applyFit();
  }, [bgBounds, keys.length, applyFit]);

  // 窗口尺寸变化时重新适配
  useEffect(() => {
    const onResize = () => { if (!userPannedRef.current) applyFit(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [applyFit]);

  // ── Mouse handlers ──
  const getCanvasPos = (e: React.MouseEvent): { x: number; y: number } | null => {
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return null;
    // rect 已含 flex 居中偏移与 pan/zoom 变换后的视觉位置，直接逆缩放即可
    // （旧实现额外减 panX，在自适应居中设置非零 pan 后会导致命中测试错位）
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (document.activeElement && document.activeElement !== canvasWrapperRef.current) {
      (document.activeElement as HTMLElement)?.blur();
    }
    canvasWrapperRef.current?.focus();
    if (readOnly || preview) return;
    if (e.button === 1 || e.altKey) {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - panX, y: e.clientY - panY };
      return;
    }
    const pos = getCanvasPos(e);
    if (!pos) return;
    const hitIdx = hitTestKey(pos.x, pos.y, keys);
    if (hitIdx !== null) {
      e.stopPropagation();
      e.preventDefault();
      const isSelected = selectedSet.has(String(hitIdx));
      const state = { type: "move" as const, startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y };
      if (isSelected) {
        setDragState(state);
      } else {
        onSelectKey(String(hitIdx), e.ctrlKey || e.metaKey);
        setDragState(state);
      }
      return;
    }
    // Issue 1: Don't start marquee on mousedown — only activate after drag threshold in mousemove
    pendingSelectRef.current = { x: pos.x, y: pos.y };
  }, [readOnly, preview, selectedIds, panX, panY, keys, onSelectKey]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      userPannedRef.current = true;
      setPanX(e.clientX - panStartRef.current.x);
      setPanY(e.clientY - panStartRef.current.y);
      return;
    }
    const pos = getCanvasPos(e);
    if (!pos) return;
    // Issue 1: Activate marquee from pending select when drag threshold exceeded
    if (!dragState && pendingSelectRef.current) {
      const dx = Math.abs(pos.x - pendingSelectRef.current.x);
      const dy = Math.abs(pos.y - pendingSelectRef.current.y);
      if (dx > 3 || dy > 3) {
        setDragState({ type: "select", startX: pendingSelectRef.current.x, startY: pendingSelectRef.current.y, currentX: pos.x, currentY: pos.y });
        pendingSelectRef.current = null;
      }
      return;
    }
    if (!dragState) return;
    setDragState({ ...dragState, currentX: pos.x, currentY: pos.y });
  }, [dragState, isPanning]);

  const handleMouseUp = useCallback((_e: React.MouseEvent) => {
    if (isPanning) { setIsPanning(false); return; }
    // Issue 1: Simple click on empty area (pending select never activated) → clear selection
    if (!dragState && pendingSelectRef.current) {
      pendingSelectRef.current = null;
      onClearSelection();
      return;
    }
    if (!dragState) return;
    pendingSelectRef.current = null;
    if (dragState.type === "select") {
      const dx = Math.abs(dragState.currentX - dragState.startX);
      const dy = Math.abs(dragState.currentY - dragState.startY);
      if (dx < 3 && dy < 3) {
        onClearSelection();
      } else {
        onSelectArea(getKeysInArea(dragState.startX, dragState.startY, dragState.currentX, dragState.currentY, keys));
      }
    } else if (dragState.type === "move") {
      const dx = Math.round((dragState.currentX - dragState.startX) / KEY_UNIT * 4) / 4;
      const dy = Math.round((dragState.currentY - dragState.startY) / KEY_UNIT * 4) / 4;
      if (dx !== 0 || dy !== 0) onMoveKeys(dx, dy);
    }
    setDragState(null);
  }, [dragState, keys, onClearSelection, onSelectArea, onMoveKeys, isPanning]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const index = (e.currentTarget as HTMLElement).getAttribute("data-key-index");
    setContextMenu({ x: e.clientX, y: e.clientY, index: index !== null ? parseInt(index) : null });
  }, []);

  // ── Keyboard 0 to reset zoom ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "0" && !e.ctrlKey && !e.metaKey) { setScale(1); setPanX(0); setPanY(0); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const cursorStyle = isPanning ? "grabbing" : dragState?.type === "select" ? "crosshair" : "default";

  const resetZoom = () => {
    userPannedRef.current = false;
    applyFit();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", position: "relative" }} suppressHydrationWarning>
      {/* Canvas area（画布随配列定高；内容层水平+垂直居中） */}
      <div ref={canvasWrapperRef} tabIndex={0} onWheel={handleWheel} onMouseDown={handleCanvasMouseDown}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, index: null }); }}
        style={{ height: bgBounds.height + 40, flexShrink: 0, overflow: "hidden", position: "relative", cursor: cursorStyle, outline: "none" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div ref={contentRef} suppressHydrationWarning onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
            onMouseLeave={() => { if (isPanning) setIsPanning(false); setDragState(null); pendingSelectRef.current = null; }}
            style={{ position: "relative", transform: `translate(${bgBounds.offsetX}px,${bgBounds.offsetY}px) scale(${scale}) translate(${panX / scale}px,${panY / scale}px)`, transformOrigin: "0 0", width: bgBounds.width, height: bgBounds.height, flexShrink: 0, userSelect: "none" }}>
          {/* Background */}
          <div style={{ position: "absolute", left: bgBounds.left, top: bgBounds.top, width: bgBounds.width, height: bgBounds.height, backgroundColor: backgroundColor || "#eeeeee", backgroundImage: texture ? `url(${texture})` : undefined, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center", borderRadius: radii || 6, pointerEvents: "none" }} />

          {/* Keys */}
          {keys.map((key, i) => {
            const id = String(i);
            const matchesFilter = !isFilterActive || getKeyCategory(key) === categoryFilter;
            return <KeyRenderer key={id} keyData={key} index={i} isSelected={selectedSet.has(id)} preview={preview} readOnly={readOnly} keycapTopEffect={keycapTopEffect} matchesFilter={matchesFilter} onContextMenu={handleContextMenu} />;
          })}

          {/* Selection rectangle */}
          {dragState?.type === "select" && (
            <div style={{ position: "absolute", left: Math.min(dragState.startX, dragState.currentX), top: Math.min(dragState.startY, dragState.currentY), width: Math.abs(dragState.currentX - dragState.startX), height: Math.abs(dragState.currentY - dragState.startY), border: "1px dashed var(--theme-selected)", backgroundColor: "rgba(var(--theme-selected-rgb), 0.1)", zIndex: 100, pointerEvents: "none" }} />
          )}

          {/* Empty state */}
          {!keys.length && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "var(--theme-text-dim)", fontSize: 14, fontFamily: '"Segoe UI", Arial, sans-serif' }}>
              <div style={{ textAlign: "center" }}>
                <p>{t("canvas.emptyState1")}</p>
                <p style={{ fontSize: 12, marginTop: 8, color: "var(--theme-text-dim)" }}>{t("canvas.emptyState2")}</p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Info bar（整页宽信息行：键数统计居中 + 操作提示靠右） */}
      <div style={{ height: INFO_BAR_HEIGHT, flexShrink: 0, position: "relative", backgroundColor: "var(--theme-footer)", borderTop: "1px solid var(--theme-border)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 12px", fontSize: 12, color: "var(--theme-text-muted)", fontFamily: "Monaco, Menlo, 'Ubuntu Mono', Consolas, monospace", gap: 16 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>{infoBarText}</span>
        {mounted && scale !== 1 && (
          <button onClick={resetZoom} style={{ fontSize: 11, padding: "1px 6px", border: "1px solid var(--theme-border-input)", borderRadius: 3, background: "var(--theme-surface)", cursor: "pointer", color: "var(--theme-text)" }} title={t("canvas.resetZoom")}>{t("canvas.resetZoomBtn")}</button>
        )}
        {infoHint && <span style={{ position: "absolute", right: 12, opacity: 0.85 }}>{infoHint}</span>}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} hasSelection={contextMenu.index !== null && selectedSet.has(String(contextMenu.index))}
          onPaste={handleContextPaste} onClose={closeMenu} onDelete={handleContextDelete} onCopy={handleContextCopy} onCut={handleContextCut}
          onDuplicate={handleContextDuplicate} onSelectAll={handleContextSelectAll} onAddKey={handleContextAddRow}
          onResetZoom={() => { closeMenu(); resetZoom(); }} />
      )}
    </div>
  );
}

KeyboardCanvas.displayName = "KeyboardCanvas";

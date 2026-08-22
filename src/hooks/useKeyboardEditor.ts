/**
 * Main Keyboard Editor Hook
 * Combines state, selection, shortcuts, and clipboard
 */

"use client";

import { useReducer, useCallback, useEffect, useRef } from "react";
import { editorReducer, createInitialState, parseHashFragment, serializeKLE } from "../lib";
import type { KeyProps, KLEMeta, KLELayout } from "../lib";
import { parseKLE } from "../lib";
import { logger } from "../lib/error-logger";
import { DEFAULT_PROPS } from "../lib/kle-types";

const STORAGE_KEY = "custom-key-pcb-tool-layout";
const STORAGE_VERSION_KEY = "custom-key-pcb-tool-layout-version";
/**
 * Bump this when the layout serialization format changes
 * so old localStorage data doesn't cause stale bugs.
 *
 * v2: 2026-06-27 — fixed DEFAULT_PROPS.f (4→3), keyPropsToIntermediate
 *     rowBaseY tracking, sort tolerance >= 0.5
 * v3: 2026-06-29 — serializeKLE always re-derives from keys (no stale _sourceCache).
 *     keyPropsToIntermediate splits rows on rotation cluster change.
 */
const LAYOUT_VERSION = 3;

/** Migrate old-format keys (label/labelBottom/labelFront) to new 12-position labels */
function migrateOldFormat(layout: KLELayout): KLELayout {
  if (!layout || !layout.keys) return layout;
  let changed = false;
  const migratedKeys = layout.keys.map((k) => {
    // If key lacks the `labels` array, it's old format
    if (!Array.isArray((k as any).labels)) {
      changed = true;
      const old = k as any;
      const labels = Array(12).fill("");
      // Old fields: label→center-center(4), labelBottom→bottom-center(7), labelFront→front-center(9)
      if (old.label) labels[4] = String(old.label);
      if (old.labelBottom) labels[7] = String(old.labelBottom);
      if (old.labelFront) labels[9] = String(old.labelFront);
      return { ...DEFAULT_PROPS, ...k, labels };
    }
    return k;
  });
  return changed ? { ...layout, keys: migratedKeys } : layout;
}

export interface StepConfig {
  move: number;  // arrow key step (key units)
  size: number;  // [] ;' step (key units)
  rotate: number; // space step (degrees)
}

const DEFAULT_STEPS: StepConfig = { move: 0.25, size: 0.25, rotate: 15 };

export function useKeyboardEditor(stepRef?: { current: StepConfig }) {
  const [state, dispatch] = useReducer(editorReducer, null, () => {
    // Load from URL hash first, then localStorage
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash) {
        const raw = parseHashFragment(hash);
        if (raw) {
          try {
            const layout = parseKLE(raw);
            if (layout.keys.length > 0) {
              return { ...createInitialState(), layout };
            }
          } catch { logger.error("parseKLE from hash failed"); }
        }
      }
      // Try localStorage — only if version matches
      try {
        const version = localStorage.getItem(STORAGE_VERSION_KEY);
        if (version === String(LAYOUT_VERSION)) {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const layout = migrateOldFormat(JSON.parse(saved) as KLELayout);
            if (layout.keys) {
              return { ...createInitialState(), layout };
            }
          }
        } else {
          // Version mismatch — old data is stale, clear it
          localStorage.removeItem(STORAGE_KEY);
          localStorage.setItem(STORAGE_VERSION_KEY, String(LAYOUT_VERSION));
        }
      } catch { logger.error("localStorage load failed"); }
    }
    return createInitialState();
  });

  // Auto-save to URL hash and localStorage
  useEffect(() => {
    if (!state.isDirty) return;
    const timer = setTimeout(() => {
      try {
        const raw = serializeKLE(state.layout);
        if (typeof window !== "undefined") {
          window.location.hash = raw;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state.layout));
          localStorage.setItem(STORAGE_VERSION_KEY, String(LAYOUT_VERSION));
        }
      } catch { logger.error("auto-save failed"); }
    }, 500);
    return () => clearTimeout(timer);
  }, [state.layout, state.isDirty]);

  // Keyboard shortcuts — use ref for latest state to avoid stale closure
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const s = stateRef.current;

      // Don't handle shortcuts when typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const step = stepRef?.current || DEFAULT_STEPS;
      const selId = s.selectedIds.length > 0 ? parseInt(s.selectedIds[0]!) : -1;
      const selKey = selId >= 0 && selId < s.layout.keys.length ? s.layout.keys[selId]! : null;

      switch (true) {
        case key === "Delete" || key === "Backspace":
          e.preventDefault();
          dispatch({ type: "DELETE_SELECTED" });
          break;
        case ctrl && key === "z" && !e.shiftKey:
          e.preventDefault();
          dispatch({ type: "UNDO" });
          break;
        case ctrl && (key === "y" || (key === "z" && e.shiftKey)):
          e.preventDefault();
          dispatch({ type: "REDO" });
          break;
        case ctrl && key === "c":
          e.preventDefault();
          dispatch({ type: "COPY_SELECTED" });
          break;
        case ctrl && key === "x":
          e.preventDefault();
          dispatch({ type: "CUT_SELECTED" });
          break;
        case ctrl && key === "v":
          e.preventDefault();
          dispatch({ type: "PASTE" });
          break;
        case ctrl && key === "a":
          e.preventDefault();
          dispatch({
            type: "SET_SELECTION",
            ids: s.layout.keys.map((_, i) => String(i)),
          });
          break;
        case key === "ArrowUp":
          e.preventDefault();
          if (s.selectedIds.length > 0) dispatch({ type: "MOVE_SELECTED", dx: 0, dy: -step.move });
          break;
        case key === "ArrowDown":
          e.preventDefault();
          if (s.selectedIds.length > 0) dispatch({ type: "MOVE_SELECTED", dx: 0, dy: step.move });
          break;
        case key === "ArrowLeft":
          e.preventDefault();
          if (s.selectedIds.length > 0) dispatch({ type: "MOVE_SELECTED", dx: -step.move, dy: 0 });
          break;
        case key === "ArrowRight":
          e.preventDefault();
          if (s.selectedIds.length > 0) dispatch({ type: "MOVE_SELECTED", dx: step.move, dy: 0 });
          break;
        // [ ] → width step, ; ' → height step, space → rotate step
        case key === "[" && selKey !== null:
          e.preventDefault();
          dispatch({ type: "SET_PROP", ids: s.selectedIds, prop: "w", value: Math.max(0.25, (selKey.w || 1) - step.size) });
          break;
        case key === "]" && selKey !== null:
          e.preventDefault();
          dispatch({ type: "SET_PROP", ids: s.selectedIds, prop: "w", value: Math.min(20, (selKey.w || 1) + step.size) });
          break;
        case key === ";" && selKey !== null:
          e.preventDefault();
          dispatch({ type: "SET_PROP", ids: s.selectedIds, prop: "h", value: Math.max(0.25, (selKey.h || 1) - step.size) });
          break;
        case key === "'" && selKey !== null:
          e.preventDefault();
          dispatch({ type: "SET_PROP", ids: s.selectedIds, prop: "h", value: Math.min(20, (selKey.h || 1) + step.size) });
          break;
        case key === " " && selKey !== null && !(e.target instanceof SVGElement || e.target instanceof HTMLElement && e.target.closest?.('[data-preview]')):
          e.preventDefault();
          dispatch({ type: "SET_PROP", ids: s.selectedIds, prop: "r", value: ((selKey.r || 0) + step.rotate) % 360 });
          break;
        case key === "Escape":
          if (s.selectedIds.length > 0) {
            dispatch({ type: "CLEAR_SELECTION" });
          }
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadLayout = useCallback((layout: KLELayout) => {
    dispatch({ type: "LOAD_LAYOUT", layout });
  }, []);

  const loadRawData = useCallback((raw: string) => {
    const layout = parseKLE(raw);
    dispatch({ type: "LOAD_LAYOUT", layout });
  }, []);

  const setSelection = useCallback((ids: string[]) => {
    dispatch({ type: "SET_SELECTION", ids });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    dispatch({ type: "TOGGLE_SELECTION", id });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: "CLEAR_SELECTION" });
  }, []);

  // M15 修复：数字属性校验 — 防止 NaN/Infinity/null 穿透到 reducer
  const NUMERIC_PROPS = new Set(["x", "y", "w", "h", "x2", "y2", "w2", "h2", "r", "rx", "ry", "f", "f2", "displayWidth"]);
  const setProp = useCallback((ids: string[], prop: keyof KeyProps, value: unknown) => {
    if (NUMERIC_PROPS.has(prop) && (typeof value !== "number" || !isFinite(value))) {
      logger.error(`setProp: invalid numeric value for ${String(prop)}: ${String(value)}`);
      return;
    }
    dispatch({ type: "SET_PROP", ids, prop, value });
  }, []);

  const setMeta = useCallback((meta: Partial<KLEMeta>) => {
    dispatch({ type: "SET_META", meta });
  }, []);

  const addKeys = useCallback((count: number) => {
    dispatch({ type: "ADD_KEYS", count });
  }, []);

  const addSpecialKey = useCallback((props: Partial<KeyProps>) => {
    dispatch({ type: "ADD_SPECIAL_KEY", props });
  }, []);

  const deleteSelected = useCallback(() => {
    dispatch({ type: "DELETE_SELECTED" });
  }, []);

  const moveSelected = useCallback((dx: number, dy: number) => {
    dispatch({ type: "MOVE_SELECTED", dx, dy });
  }, []);

  const copy = useCallback(() => {
    dispatch({ type: "COPY_SELECTED" });
  }, []);

  const cut = useCallback(() => {
    dispatch({ type: "CUT_SELECTED" });
  }, []);

  const paste = useCallback(() => {
    dispatch({ type: "PASTE" });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  return {
    state,
    dispatch,
    loadLayout,
    loadRawData,
    setSelection,
    toggleSelection,
    clearSelection,
    setProp,
    setMeta,
    addKeys,
    addSpecialKey,
    deleteSelected,
    moveSelected,
    copy,
    cut,
    paste,
    undo,
    redo,
    selectedKeys: state.selectedIds
      .map((id) => parseInt(id))
      .filter((i) => !isNaN(i) && i >= 0 && i < state.layout.keys.length),
  };
}

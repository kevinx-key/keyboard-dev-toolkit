/**
 * KLE Editor State Reducer
 * Manages the editor state with full undo/redo history
 */

import type { EditorState, EditorAction, KeyProps, UndoSnapshot } from "./kle-types";
import { DEFAULT_PROPS, DEFAULT_META } from "./kle-types";

const MAX_HISTORY = 100;

export function createInitialState(): EditorState {
  return {
    layout: { meta: { ...DEFAULT_META }, keys: [] },
    selectedIds: [],
    clipboard: null,
    undoStack: [],
    redoStack: [],
    isDirty: false,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "LOAD_LAYOUT": {
      // Preserve _sourceCache from the loaded layout (set during parse/import)
      return {
        ...state,
        layout: action.layout,
        selectedIds: [],
        clipboard: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      };
    }

    case "SET_SELECTION": {
      return {
        ...state,
        selectedIds: [...action.ids],
      };
    }

    case "TOGGLE_SELECTION": {
      const id = action.id;
      const ids = state.selectedIds;
      if (ids.includes(id)) {
        return { ...state, selectedIds: ids.filter((i) => i !== id) };
      }
      return { ...state, selectedIds: [...ids, id] };
    }

    case "CLEAR_SELECTION": {
      return { ...state, selectedIds: [] };
    }

    case "SET_PROP": {
      const { ids, prop, value } = action;
      if (ids.length === 0) return state; // Empty selection is a no-op
      const newKeys = state.layout.keys.map((k, i) => {
        if (ids.includes(String(i))) {
          if (prop === "d" && value === true) {
            // Decal enabled: clear mutually exclusive states, follow KLE original behavior
            return { ...k, d: true, g: false, l: false, n: false, x2: 0, y2: 0, w2: 0, h2: 0 };
          }
          // g/l/n also clear d (all four flag types are mutually exclusive per KLE spec)
          if ((prop === "g" || prop === "l" || prop === "n") && value === true) {
            return { ...k, [prop]: true, d: false };
          }
          // 绕自身中心旋转：补偿 x/y 保持视觉中心不变
          if (prop === "r") {
            const kw = k.w ?? 1;
            const kh = k.h ?? 1;
            const cx = k.x + kw / 2;
            const cy = k.y + kh / 2;
            const oldR = k.r || 0;
            const oldRx = k.rx || 0;
            const oldRy = k.ry || 0;
            // 计算当前视觉中心（key center 绕 rx/ry 旋转后）
            const rad = (oldR * Math.PI) / 180;
            const dx = cx - oldRx;
            const dy = cy - oldRy;
            const vcx = oldRx + dx * Math.cos(rad) - dy * Math.sin(rad);
            const vcy = oldRy + dx * Math.sin(rad) + dy * Math.cos(rad);
            // 新位置：视觉中心不变，rx/ry 设为按键自身中心
            const rnd = (n: number) => Math.round(n * 100) / 100;
            return {
              ...k,
              x: rnd(vcx - kw / 2),
              y: rnd(vcy - kh / 2),
              r: value as number,
              rx: rnd(vcx),
              ry: rnd(vcy),
            };
          }
          return { ...k, [prop]: value };
        }
        return k;
      });
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        isDirty: true,
      });
    }

    case "SET_META": {
      return pushUndo(state, {
        layout: {
          ...state.layout,
          meta: { ...state.layout.meta, ...action.meta },
          _sourceCache: undefined,
        },
        isDirty: true,
      });
    }

    case "ADD_KEYS": {
      const newKeys = [...state.layout.keys];
      // new row below all existing keys, 0u gap between added keys
      const rowY = newKeys.reduce((m, k) => Math.max(m, (k.y ?? 0) + (k.h ?? 1)), 0);
      let nextX = 0;
      for (let i = 0; i < action.count; i++) {
        newKeys.push({
          ...DEFAULT_PROPS,
          x: round(nextX),
          y: rowY,
        });
        nextX += 1; // 1u each (0 gap)
      }
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        isDirty: true,
      });
    }

    case "ADD_SPECIAL_KEY": {
      const lastKey = state.layout.keys[state.layout.keys.length - 1];
      const x = lastKey ? (lastKey.x ?? 0) + (lastKey.w ?? 1) + 1.25 : 0;
      const y = lastKey ? (lastKey.y ?? 0) : 0;
      const newKey: KeyProps = { ...DEFAULT_PROPS, x, y, ...action.props };
      return pushUndo(state, {
        layout: { ...state.layout, keys: [...state.layout.keys, newKey], _sourceCache: undefined },
        isDirty: true,
      });
    }

    case "DELETE_SELECTED": {
      if (state.selectedIds.length === 0) return state; // Empty selection is a no-op
      const selectedSet = new Set(state.selectedIds);
      const newKeys = state.layout.keys.filter((_, i) => !selectedSet.has(String(i)));
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        selectedIds: [],
        isDirty: true,
      });
    }

    case "MOVE_SELECTED": {
      const { dx, dy } = action;
      if (state.selectedIds.length === 0) return state; // Empty selection is a no-op
      const selectedSet = new Set(state.selectedIds);
      const newKeys = state.layout.keys.map((k, i) => {
        if (selectedSet.has(String(i))) {
          return { ...k, x: round(k.x + dx), y: round(k.y + dy) };
        }
        return k;
      });
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        isDirty: true,
      });
    }

    case "COPY_SELECTED": {
      const selectedSet = new Set(state.selectedIds);
      const copied = state.layout.keys.filter((_, i) => selectedSet.has(String(i)));
      return {
        ...state,
        clipboard: copied.map((k) => ({ ...k })),
      };
    }

    case "CUT_SELECTED": {
      if (state.selectedIds.length === 0) return state; // Empty selection is a no-op
      const selectedSet = new Set(state.selectedIds);
      const copied: KeyProps[] = [];
      const newKeys = state.layout.keys.filter((_, i) => {
        if (selectedSet.has(String(i))) {
          copied.push({ ...state.layout.keys[i]! });
          return false;
        }
        return true;
      });
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        selectedIds: [],
        clipboard: copied,
        isDirty: true,
      });
    }

    case "PASTE": {
      if (!state.clipboard || state.clipboard.length === 0) return state;
      // paste flush below existing keys, normalizing clip Y to avoid cumulative gaps
      const bottomY = state.layout.keys.reduce((m, k) => Math.max(m, k.y + k.h), 0);
      const clipMinY = state.clipboard.reduce((m, k) => Math.min(m, k.y), Infinity);
      const newKeys = [
        ...state.layout.keys,
        ...state.clipboard.map((k) => ({
          ...k,
          x: round(k.x),
          y: round(k.y - clipMinY + bottomY),
        })),
      ];
      return pushUndo(state, {
        layout: { ...state.layout, keys: newKeys, _sourceCache: undefined },
        isDirty: true,
      });
    }

    case "UNDO": {
      if (state.undoStack.length === 0) return state;
      const prev = state.undoStack[state.undoStack.length - 1]!;
      const curSnapshot: UndoSnapshot = { layout: state.layout, selectedIds: state.selectedIds };
      return {
        ...state,
        layout: prev.layout,
        selectedIds: prev.selectedIds,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, curSnapshot],
        isDirty: true,
      };
    }

    case "REDO": {
      if (state.redoStack.length === 0) return state;
      const next = state.redoStack[state.redoStack.length - 1]!;
      const curSnapshot: UndoSnapshot = { layout: state.layout, selectedIds: state.selectedIds };
      return {
        ...state,
        layout: next.layout,
        selectedIds: next.selectedIds,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, curSnapshot],
        isDirty: true,
      };
    }

    case "MARK_CLEAN": {
      return { ...state, isDirty: false };
    }

    default:
      return state;
  }
}

function pushUndo(state: EditorState, changes: Partial<EditorState>): EditorState {
  const snapshot: UndoSnapshot = { layout: state.layout, selectedIds: state.selectedIds };
  const undoStack = [...state.undoStack, snapshot].slice(-MAX_HISTORY);
  return {
    ...state,
    ...changes,
    undoStack,
    redoStack: [],
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

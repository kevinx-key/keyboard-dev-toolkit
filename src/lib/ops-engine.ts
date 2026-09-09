/**
 * KDT Ops 引擎 — 配列操作序列（AI 工具层 MCP/CLI 与应用内 AI 面板共用）
 * 纯函数，零 Node/DOM 依赖。禁止引入 fs / path / react / @tauri 等任何东西。
 * 语义与 editorReducer 完全一致：每个 op 翻译成 reducer action 依次执行。
 * 2026-09 从 tools/core.ts 下沉而来，导出名与行为保持一致（唯一修正：add_key 补 12 元素 labels）。
 */
import type { EditorAction, EditorState, KLELayout } from "./kle-types";
import { createInitialState, editorReducer } from "./kle-reducer";

// ─── 操作序列（AI 友好寻址：扁平索引） ──────────────────────

const NUM_PROPS = new Set(["x", "y", "w", "h", "x2", "y2", "w2", "h2", "r", "rx", "ry", "align", "labelSize", "f2"]);
const BOOL_PROPS = new Set(["d", "g", "l", "n"]);
const STR_PROPS = new Set(["c", "t", "p", "sm", "sb", "st", "stab"]);

export type Op =
  | { op: "set_prop"; index: number | number[]; prop: string; value: unknown }
  | { op: "set_label"; index: number; label: string }
  | { op: "move"; index: number | number[]; dx: number; dy: number }
  | { op: "place"; index: number; x: number; y: number }
  | { op: "delete"; index: number | number[] }
  | { op: "add_key"; x: number; y: number; w?: number; h?: number; label?: string }
  | { op: "set_meta"; name?: string; author?: string; notes?: string };

export interface ApplyResult {
  layout: KLELayout;
  applied: number;
  errors: string[];
}

export function applyOps(input: KLELayout, ops: Op[]): ApplyResult {
  let state: EditorState = { ...createInitialState(), layout: input };
  const errors: string[] = [];
  let applied = 0;

  const dispatch = (action: EditorAction) => {
    state = editorReducer(state, action);
  };

  for (let oi = 0; oi < ops.length; oi++) {
    const op = ops[oi]!;
    const ctx = `ops[${oi}](${op.op})`;
    try {
      switch (op.op) {
        case "set_prop": {
          validateProp(op.prop, op.value);
          const ids = resolveIndexes(state.layout, op.index);
          if (ids.length === 0) throw new Error("目标为空");
          dispatch({ type: "SET_PROP", ids, prop: op.prop as never, value: op.value });
          break;
        }
        case "set_label": {
          const idx = oneIndex(state.layout, op.index);
          const labels = [...state.layout.keys[idx]!.labels];
          labels[0] = op.label;
          dispatch({ type: "SET_PROP", ids: [String(idx)], prop: "labels", value: labels });
          break;
        }
        case "move": {
          const ids = resolveIndexes(state.layout, op.index);
          if (ids.length === 0) throw new Error("目标为空");
          dispatch({ type: "SET_SELECTION", ids });
          dispatch({ type: "MOVE_SELECTED", dx: num(op.dx, "dx"), dy: num(op.dy, "dy") });
          break;
        }
        case "place": {
          const idx = oneIndex(state.layout, op.index);
          dispatch({ type: "SET_PROP", ids: [String(idx)], prop: "x", value: num(op.x, "x") });
          dispatch({ type: "SET_PROP", ids: [String(idx)], prop: "y", value: num(op.y, "y") });
          break;
        }
        case "delete": {
          const ids = resolveIndexes(state.layout, op.index);
          if (ids.length === 0) throw new Error("目标为空");
          dispatch({ type: "SET_SELECTION", ids });
          dispatch({ type: "DELETE_SELECTED" });
          break;
        }
        case "add_key": {
          const props: Record<string, unknown> = {
            x: num(op.x, "x"),
            y: num(op.y, "y"),
            labels: [op.label ?? "", "", "", "", "", "", "", "", "", "", "", ""],
          };
          if (op.w !== undefined) props.w = num(op.w, "w");
          if (op.h !== undefined) props.h = num(op.h, "h");
          dispatch({ type: "ADD_SPECIAL_KEY", props: props as never });
          break;
        }
        case "set_meta": {
          const meta: Record<string, string> = {};
          if (op.name !== undefined) meta.name = String(op.name);
          if (op.author !== undefined) meta.author = String(op.author);
          if (op.notes !== undefined) meta.notes = String(op.notes);
          if (Object.keys(meta).length === 0) throw new Error("set_meta 需要至少一个字段 name/author/notes");
          dispatch({ type: "SET_META", meta: meta as never });
          break;
        }
        default:
          throw new Error(`未知操作类型`);
      }
      applied++;
    } catch (e) {
      errors.push(`${ctx}: ${(e as Error).message}`);
    }
  }

  return { layout: state.layout, applied, errors };
}

function resolveIndexes(layout: KLELayout, spec: number | number[]): string[] {
  const arr = Array.isArray(spec) ? spec : [spec];
  return arr.map((i) => {
    const idx = Number(i);
    if (!Number.isInteger(idx) || idx < 0 || idx >= layout.keys.length) {
      throw new Error(`索引越界: ${JSON.stringify(i)}（共 ${layout.keys.length} 键）`);
    }
    return String(idx);
  });
}

function oneIndex(layout: KLELayout, index: number | undefined): number {
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= layout.keys.length) {
    throw new Error(`需要单个有效 index（共 ${layout.keys.length} 键），收到: ${JSON.stringify(index)}`);
  }
  return idx;
}

function validateProp(prop: string, value: unknown): void {
  if (prop === "labels") {
    if (!Array.isArray(value)) throw new Error("labels 需要 12 元素字符串数组");
    return;
  }
  if (prop === "fa" || prop === "textSize" || prop === "textColor") {
    if (!Array.isArray(value)) throw new Error(`${prop} 需要数组`);
    return;
  }
  if (NUM_PROPS.has(prop)) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${prop} 需要有限数字`);
    return;
  }
  if (BOOL_PROPS.has(prop)) {
    if (typeof value !== "boolean") throw new Error(`${prop} 需要 boolean`);
    return;
  }
  if (STR_PROPS.has(prop)) {
    if (typeof value !== "string") throw new Error(`${prop} 需要字符串`);
    return;
  }
  throw new Error(`不支持的属性 "${prop}"。可用: ${[...NUM_PROPS, ...BOOL_PROPS, ...STR_PROPS, "labels", "fa", "textSize", "textColor"].join(" ")}`);
}

function num(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${field} 需要数字`);
  return n;
}

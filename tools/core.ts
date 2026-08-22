/**
 * KDT AI Core — 无头核心层
 * MCP server / CLI / 应用内对话面板 共用的纯函数封装。
 * 禁止引入任何 DOM / React 依赖。
 */

import path from "node:path";
import fs from "node:fs";
import type { EditorAction, EditorState, KLELayout } from "../src/lib/kle-types";
import { createInitialState, editorReducer } from "../src/lib/kle-reducer";
import { parseKLEJSON, serializeKLEJSON } from "../src/lib/kle-serial";
import { serializeKLE } from "../src/lib/kle-parser";
import { exportSVG } from "../src/lib/kle-export";
import { computeLayoutBBoxInUnits } from "../src/lib/coordinate-system";
import { generatePCB, type PCBConfig } from "../src/lib/pcb-export";
import { generatePlate } from "../src/lib/plate-export";
import { ALL_PRESETS } from "../src/data/presets";

export const U_MM = 19.05;

// ─── 工作区（路径穿越守卫） ───────────────────────────────

export function resolveSafe(root: string, rel: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new Error(`路径越界（只允许工作区内）: ${rel}`);
  }
  return abs;
}

export function wsList(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string, depth: number) => {
    if (depth > 3 || out.length >= 500) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= 500) break;
      if (e.isFile() && /\.json$/i.test(e.name)) out.push(prefix + e.name);
      else if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`, depth + 1);
    }
  };
  walk(root, "", 0);
  return out.sort();
}

export function wsRead(root: string, rel: string): string {
  return fs.readFileSync(resolveSafe(root, rel), "utf8").replace(/^\uFEFF/, "");
}

export function wsWrite(root: string, rel: string, data: string): void {
  const abs = resolveSafe(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data, "utf8");
}

// ─── 布局 IO ─────────────────────────────────────────────

export function layoutFromRows(rows: unknown): KLELayout {
  const layout = parseKLEJSON(rows);
  if (!layout) throw new Error("无效的布局数据：期望数组格式 [[...行...], ...]，可选首元素为元数据对象");
  return layout;
}

export function rowsFromLayout(layout: KLELayout): unknown[] {
  return serializeKLEJSON(layout);
}

export function jsonFromLayout(layout: KLELayout): string {
  const rows = serializeKLEJSON(layout);
  const head: Record<string, string> = {};
  if (layout.meta.name && layout.meta.name !== "Untitled") head.name = layout.meta.name;
  if (layout.meta.author) head.author = layout.meta.author;
  return JSON.stringify(Object.keys(head).length > 0 ? [head, ...rows] : rows, null, 2);
}

/** URLON 原始数据（自带 ## 前缀，可直接作 URL hash） */
export function rawDataFromLayout(layout: KLELayout): string {
  return serializeKLE(layout);
}

export function shareUrl(layout: KLELayout, base = "http://localhost:3000/"): string {
  return `${base.replace(/\/?$/, "/")}#${serializeKLE(layout)}`;
}

// ─── 概览 / 校验 ─────────────────────────────────────────

export interface LayoutSummary {
  name: string;
  author: string;
  keyCount: number;
  decalCount: number;
  rowsApprox: number;
  widthU: number;
  heightU: number;
  widthMm: number;
  heightMm: number;
  stabCount: number;
}

export function summarize(layout: KLELayout): LayoutSummary {
  const keys = layout.keys;
  const realKeys = keys.filter((k) => !k.d);
  const ys = new Set(realKeys.map((k) => k.y));
  const bbox = computeLayoutBBoxInUnits(keys);
  return {
    name: layout.meta.name,
    author: layout.meta.author,
    keyCount: realKeys.length,
    decalCount: keys.length - realKeys.length,
    rowsApprox: ys.size,
    widthU: round2(bbox.maxX - bbox.minX),
    heightU: round2(bbox.maxY - bbox.minY),
    widthMm: round2((bbox.maxX - bbox.minX) * U_MM),
    heightMm: round2((bbox.maxY - bbox.minY) * U_MM),
    stabCount: realKeys.filter((k) => Math.max(k.w, k.h) >= 2).length,
  };
}

export function listKeys(layout: KLELayout, limit = 300): string[] {
  const lines: string[] = [];
  const n = Math.min(layout.keys.length, limit);
  for (let i = 0; i < n; i++) {
    const k = layout.keys[i]!;
    const label = k.labels.filter(Boolean)[0] || "·";
    lines.push(`#${i} "${label}" x=${k.x} y=${k.y} ${k.w}x${k.h}${k.d ? " [decal]" : ""}`);
  }
  if (layout.keys.length > n) lines.push(`… 其余 ${layout.keys.length - n} 键未列出`);
  return lines;
}

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
            labels: [op.label ?? ""],
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

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ─── 导出（free 范围：SVG / DXF） ─────────────────────────

export const DEFAULT_PCB_CONFIG: PCBConfig = {
  solderType: "socket",
  needStab: true,
  needLed: false,
  edgeDistance: 5,
  needTypeC: false,
  need4P: false,
  needMCU: false,
  typeCX: -1.5,
  typeCY: 16,
  fourPX: 196,
  fourPY: 17.5,
  mcuX: 91,
  mcuY: 62,
  typeCRot: 270,
  fourPRot: 270,
  mcuRot: 45,
};

export interface FreeExport {
  format: "layout-svg" | "pcb" | "plate";
  svg: string;
  dxf: string;
  widthMm: number;
  heightMm: number;
}

export function exportFree(layout: KLELayout, format: "layout-svg" | "pcb" | "plate"): FreeExport {
  if (format === "layout-svg") {
    const svg = exportSVG(layout, 2);
    return { format, svg, dxf: "", widthMm: round2(summarize(layout).widthMm), heightMm: round2(summarize(layout).heightMm) };
  }
  if (format === "pcb") {
    if (layout.keys.length === 0) throw new Error("布局为空，无法生成 PCB");
    const r = generatePCB(layout, DEFAULT_PCB_CONFIG);
    return { format, svg: r.svg, dxf: r.dxf, widthMm: round2(r.width), heightMm: round2(r.height) };
  }
  if (layout.keys.length === 0) throw new Error("布局为空，无法生成定位板");
  const r = generatePlate(layout);
  return { format, svg: r.svg, dxf: r.dxf, widthMm: round2(r.width), heightMm: round2(r.height) };
}

/** QMK/KiCad 属 Pro 功能，AI 层一律拒绝并给出提示文本 */
export function proBlocked(feature: string): string {
  return `${feature} 是 Pro 版功能，AI 工具层未开放。请在应用内购买/启用 Pro 后手动导出。`;
}

// ─── 预设模板 ────────────────────────────────────────────

export function listPresetNames(): string[] {
  return ALL_PRESETS.map((p) => p.name);
}

export function presetLayout(name: string): KLELayout {
  const preset = ALL_PRESETS.find((p) => p.name.toLowerCase() === name.toLowerCase());
  if (!preset) throw new Error(`未找到预设 "${name}"。可用: ${listPresetNames().join(", ")}`);
  return layoutFromRows(preset.data);
}

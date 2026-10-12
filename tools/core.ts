/**
 * KDT AI Core — 无头核心层
 * MCP server / CLI / 应用内对话面板 共用的纯函数封装。
 * 禁止引入任何 DOM / React 依赖。
 */

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { KLELayout } from "../src/lib/kle-types";
import { parseKLEJSON, serializeKLEJSON } from "../src/lib/kle-serial";
import { serializeKLE } from "../src/lib/kle-parser";
import { exportSVG } from "../src/lib/kle-export";
import { computeLayoutBBoxInUnits } from "../src/lib/coordinate-system";
import { generatePCB, type PCBConfig } from "../src/lib/pcb-export";
import { generatePlate } from "../src/lib/plate-export";
import { analyzeCloud } from "../src/lib/geometry-api";
import { ALL_PRESETS } from "../src/data/presets";

// ─── 云端几何地址（§G-B4：pcb/plate 云端优先） ──────────────
// best-effort：仅当显式 env 未设时，从仓库根 .env.local 兜底加载（Node ≥20.12）。
// 显式 KDT_GEOMETRY_API_BASE / NEXT_PUBLIC_GEOMETRY_API_BASE 始终优先；无则云端关闭、回落本地。
if (!process.env.KDT_GEOMETRY_API_BASE && !process.env.NEXT_PUBLIC_GEOMETRY_API_BASE && !process.env.VITEST) {
  try {
    const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(envPath);
  } catch (e) {
    void e; // 无 .env.local / Node 不支持 → 保持云端关闭
  }
}

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
    let line = `#${i} "${label}" x=${k.x} y=${k.y} w=${k.w} h=${k.h}`;
    if ((k.w2 || 0) > 0 || (k.h2 || 0) > 0 || (k.x2 || 0) !== 0 || (k.y2 || 0) !== 0) {
      line += ` L2(x2=${k.x2} y2=${k.y2} w2=${k.w2} h2=${k.h2})`; // non-rectangular second segment (L-shaped key)
    }
    if (k.d) line += " [decal]";
    lines.push(line);
  }
  if (layout.keys.length > n) lines.push(`... ${layout.keys.length - n} more keys omitted`);
  return lines;
}

// ─── 操作序列（AI 友好寻址：扁平索引） ──────────────────────
// 引擎已下沉至 src/lib/ops-engine.ts（与 AiTab 共用单一实现，含 add_key 12 元素 labels 修正），
// 此处再导出保持对外 API 不变。
export { applyOps, type ApplyResult, type Op } from "../src/lib/ops-engine";

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
  /** 结果来源：cloud=云端几何（完整），local=本地回落（§G-B4 精简子集） */
  source: "cloud" | "local";
}

/** 云端导出（pcb/plate）：未配置 / 失败 / 超时 → null（调用方回落本地）。 */
async function cloudExport(kind: "pcb" | "plate", layout: KLELayout): Promise<FreeExport | null> {
  const params = kind === "pcb"
    ? { config: DEFAULT_PCB_CONFIG, switchRotations: {}, stabRotations: {}, compatKeyIndices: [] }
    : {};
  let res: Awaited<ReturnType<typeof analyzeCloud>>;
  try {
    res = await analyzeCloud(kind, layout, params, AbortSignal.timeout(15000));
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const r = res.result as { svg?: string; dxf?: string; width?: number; height?: number } | null;
  if (!r || typeof r.svg !== "string" || typeof r.dxf !== "string") return null;
  return { format: kind, svg: r.svg, dxf: r.dxf, widthMm: round2(r.width ?? 0), heightMm: round2(r.height ?? 0), source: "cloud" };
}

/**
 * 导出（free 范围：SVG / DXF）。
 * §G-B4：pcb / plate 走云端（完整几何）优先，失败回落本地精简子集；layout-svg 纯本地。
 */
export async function exportFree(layout: KLELayout, format: "layout-svg" | "pcb" | "plate"): Promise<FreeExport> {
  if (format === "layout-svg") {
    const svg = exportSVG(layout, 2);
    return { format, svg, dxf: "", widthMm: round2(summarize(layout).widthMm), heightMm: round2(summarize(layout).heightMm), source: "local" };
  }
  if (layout.keys.length === 0) throw new Error(format === "pcb" ? "布局为空，无法生成 PCB" : "布局为空，无法生成定位板");

  const cloud = await cloudExport(format, layout);
  if (cloud) return cloud;

  // ── 本地回落（§G-B4 精简子集：PCB 无干涉；定位板仅 Cherry）──
  if (format === "pcb") {
    const r = generatePCB(layout, DEFAULT_PCB_CONFIG);
    return { format, svg: r.svg, dxf: r.dxf, widthMm: round2(r.width), heightMm: round2(r.height), source: "local" };
  }
  const r = generatePlate(layout);
  return { format, svg: r.svg, dxf: r.dxf, widthMm: round2(r.width), heightMm: round2(r.height), source: "local" };
}

/** QMK/KiCad are Pro-tier features: the AI tool layer always rejects them with this hint */
export function proBlocked(feature: string): string {
  return `${feature} is a Pro-tier feature and is not exposed to the AI tool layer. Enable Pro in the app and export manually.`;
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

/**
 * KDT MCP Server — stdio
 * 启动: npx tsx tools/mcp-server.ts （或 npm run kdt:mcp）
 * 工作区: 环境变量 KDT_WORKSPACE，默认 <cwd>/kdt-workspace
 */

import path from "node:path";
import fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  applyOps,
  exportFree,
  jsonFromLayout,
  layoutFromRows,
  listKeys,
  listPresetNames,
  presetLayout,
  shareUrl,
  summarize,
  wsList,
  wsRead,
  wsWrite,
} from "./core";

const WORKSPACE = path.resolve(process.env.KDT_WORKSPACE ?? path.join(process.cwd(), "kdt-workspace"));
fs.mkdirSync(WORKSPACE, { recursive: true });

function text(v: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] };
}

function fail(e: unknown): { content: [{ type: "text"; text: string }]; isError: true } {
  return { content: [{ type: "text", text: `错误: ${(e as Error).message}` }], isError: true };
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function parseJsonField(raw: string, what: string): Json {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as Json;
  } catch {
    throw new Error(`${what} 不是合法 JSON`);
  }
}

function summaryText(p: string, layout: ReturnType<typeof layoutFromRows>): string {
  const s = summarize(layout);
  return [
    `文件 ${p}`,
    `名称 "${s.name}" 作者 "${s.author}"`,
    `键数 ${s.keyCount}(装饰 ${s.decalCount}) 行≈${s.rowsApprox} 定位键≥2u: ${s.stabCount}`,
    `尺寸 ${s.widthU}u × ${s.heightU}u = ${s.widthMm}mm × ${s.heightMm}mm`,
  ].join("\n");
}

const server = new McpServer({ name: "kdt", version: "1.0.0" });

server.tool(
  "get_guide",
  "获取 KDT 键盘配列工具使用指南（KLE 行格式规范 + 操作示例）。第一次使用前必读。",
  {},
  async () => {
    const guidePath = path.join(import.meta.dirname ?? __dirname, "AI_GUIDE.md");
    try {
      return text(fs.readFileSync(guidePath, "utf8"));
    } catch {
      return text(fs.readFileSync(path.join(__dirname, "AI_GUIDE.md"), "utf8"));
    }
  },
);

server.tool(
  "list_presets",
  "列出可用的键盘预设模板（60%、ANSI 104、ErgoDox 等）",
  {},
  async () => text(listPresetNames()),
);

server.tool(
  "create_layout",
  "创建新布局并写入工作区文件。二选一：preset（预设名）或 rows_json（KLE 行格式 JSON 数组字符串，首元素可为 {name,author} 元数据）",
  {
    path: z.string().describe("工作区内目标文件路径，如 my65.json"),
    preset: z.string().optional(),
    rows_json: z.string().optional(),
  },
  async ({ path: p, preset, rows_json }) => {
    try {
      if (!preset === !rows_json) throw new Error("preset 与 rows_json 必须提供且只能提供一个");
      const layout = preset ? presetLayout(preset) : layoutFromRows(parseJsonField(rows_json!, "rows_json"));
      wsWrite(WORKSPACE, p, jsonFromLayout(layout));
      return text(summaryText(p, layout));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "read_layout",
  "读取布局文件的完整 KLE JSON（行格式），可选附带键位明细表",
  {
    path: z.string(),
    with_keys: z.boolean().optional().describe("附每个键的 #索引/标签/坐标/尺寸 明细"),
    keys_limit: z.number().int().positive().max(1000).optional(),
  },
  async ({ path: p, with_keys, keys_limit }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      let out = summaryText(p, layout) + "\n\n" + jsonFromLayout(layout);
      if (with_keys) out += "\n\n键位明细:\n" + listKeys(layout, keys_limit ?? 300).join("\n");
      return text(out);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "edit_layout",
  "对布局文件按顺序应用操作序列并写回（无状态：每次传全量 ops）。ops 见 get_guide。注意 delete 后索引立即重排。",
  {
    path: z.string(),
    ops_json: z.string().describe('操作数组 JSON，例 [{"op":"set_label","index":0,"label":"Esc"}]'),
    out_path: z.string().optional().describe("另存为新文件（缺省覆盖原文件）"),
  },
  async ({ path: p, ops_json, out_path }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      const ops = parseJsonField(ops_json, "ops_json");
      if (!Array.isArray(ops)) throw new Error("ops_json 必须是操作数组");
      const r = applyOps(layout, ops as never[]);
      const target = out_path ?? p;
      wsWrite(WORKSPACE, target, jsonFromLayout(r.layout));
      let out = `已应用 ${r.applied}/${ops.length} 条操作 → ${target}`;
      if (r.errors.length > 0) out += `\n失败详情:\n` + r.errors.map((e) => `- ${e}`).join("\n");
      out += "\n" + summaryText(target, r.layout);
      return text(out);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "export_layout",
  "导出 free 范围产物到工作区。format=layout-svg(配列图)/pcb(PCB开孔svg+dxf)/plate(定位板svg+dxf)。QMK/KiCad 为 Pro 功能不开放。",
  {
    path: z.string().describe("源布局文件"),
    format: z.enum(["layout-svg", "pcb", "plate"]),
    out_prefix: z.string().optional().describe("输出文件前缀，缺省为源文件去扩展名"),
  },
  async ({ path: p, format, out_prefix }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      const out = exportFree(layout, format);
      const base = out_prefix ?? p.replace(/\.json$/i, "");
      const written: string[] = [];
      wsWrite(WORKSPACE, `${base}.svg`, out.svg);
      written.push(`${base}.svg (${out.svg.length} 字节)`);
      if (out.dxf) {
        wsWrite(WORKSPACE, `${base}-${format}.dxf`, out.dxf);
        written.push(`${base}-${format}.dxf (${out.dxf.length} 字节)`);
      }
      return text(`导出完成 [${format}] ${out.widthMm}×${out.heightMm}mm:\n` + written.join("\n"));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "share_url",
  "生成可在网页端直接打开该配列的 URL hash 链接",
  {
    path: z.string(),
    base: z.string().optional().describe("应用地址，默认 http://localhost:3000/"),
  },
  async ({ path: p, base }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      return text(shareUrl(layout, base ?? "http://localhost:3000/"));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "list_workspace",
  "列出工作区内的全部 .json 文件",
  {},
  async () => {
    const files = wsList(WORKSPACE);
    return text(files.length > 0 ? files.join("\n") : "(空)");
  },
);

await server.connect(new StdioServerTransport());

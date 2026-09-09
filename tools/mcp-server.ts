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
  return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
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
    `File ${p}`,
    `Name "${s.name}" author "${s.author}"`,
    `Keys ${s.keyCount} (decals ${s.decalCount}) rows≈${s.rowsApprox} keys>=2u: ${s.stabCount}`,
    `Size ${s.widthU}u x ${s.heightU}u = ${s.widthMm}mm x ${s.heightMm}mm`,
  ].join("\n");
}

const server = new McpServer({ name: "kdt", version: "1.0.0" });

function readRepoDoc(rel: string): string {
  const here = import.meta.dirname ?? __dirname;
  const fromTools = path.join(here, rel);
  const fromRoot = path.join(here, "..", rel);
  try {
    return fs.readFileSync(fromTools, "utf8");
  } catch {
    return fs.readFileSync(fromRoot, "utf8");
  }
}

server.tool(
  "get_guide",
  "Read the KDT keyboard-layout guide (English): KLE row format spec, ops syntax, supported properties incl. x2/y2/w2/h2 L-shaped keys, presets, workflows, and agent conduct rules. Read it before the first use.",
  {},
  async () => text(readRepoDoc("AI_GUIDE.md")),
);

server.tool(
  "get_glossary",
  "Read the bilingual keyboard glossary (Chinese colloquial terms -> standard specs, e.g. 7字回车 = ISO inverted-L Enter). Consult it when the user names keys with Chinese colloquial terms.",
  {},
  async () => text(readRepoDoc("docs/ai-keyboard-glossary.md")),
);

server.tool(
  "list_presets",
  "List available keyboard preset templates (60%, ANSI 104, ISO 105, ErgoDox, ...)",
  {},
  async () => text(listPresetNames()),
);

server.tool(
  "create_layout",
  "Create a new layout and write it to a workspace file. Provide exactly one of: preset (preset name) or rows_json (KLE row-format JSON array string; first element may be a {name,author} metadata object)",
  {
    path: z.string().describe("Target file path inside the workspace, e.g. my65.json"),
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
  "Read a layout file's full KLE JSON (row format), optionally with a per-key listing (index/label/coordinates/size incl. L2 x2/y2/w2/h2 segment)",
  {
    path: z.string(),
    with_keys: z.boolean().optional().describe("Attach the per-key #index/label/x,y,w,h,L2 listing"),
    keys_limit: z.number().int().positive().max(1000).optional(),
  },
  async ({ path: p, with_keys, keys_limit }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      let out = summaryText(p, layout) + "\n\n" + jsonFromLayout(layout);
      if (with_keys) out += "\n\nKey listing:\n" + listKeys(layout, keys_limit ?? 300).join("\n");
      return text(out);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "edit_layout",
  "Apply an ordered op sequence to a layout file and write it back (stateless: send the FULL op batch every call). Ops are documented in get_guide. Note: indexes are re-indexed immediately after a delete.",
  {
    path: z.string(),
    ops_json: z.string().describe('Op array JSON, e.g. [{"op":"set_label","index":0,"label":"Esc"}]'),
    out_path: z.string().optional().describe("Write to a new file instead (default: overwrite the source)"),
  },
  async ({ path: p, ops_json, out_path }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      const ops = parseJsonField(ops_json, "ops_json");
      if (!Array.isArray(ops)) throw new Error("ops_json must be an op array");
      const r = applyOps(layout, ops as never[]);
      const target = out_path ?? p;
      wsWrite(WORKSPACE, target, jsonFromLayout(r.layout));
      let out = `Applied ${r.applied}/${ops.length} ops -> ${target}`;
      if (r.errors.length > 0) out += `\nFailed ops:\n` + r.errors.map((e) => `- ${e}`).join("\n");
      out += "\n" + summaryText(target, r.layout);
      return text(out);
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "export_layout",
  "Export free-tier artifacts to the workspace. format=layout-svg (layout picture) / pcb (PCB hole svg+dxf) / plate (plate cutout svg+dxf). QMK/KiCad are Pro-tier and not exposed.",
  {
    path: z.string().describe("Source layout file"),
    format: z.enum(["layout-svg", "pcb", "plate"]),
    out_prefix: z.string().optional().describe("Output file prefix; default: source file without extension"),
  },
  async ({ path: p, format, out_prefix }) => {
    try {
      const layout = layoutFromRows(parseJsonField(wsRead(WORKSPACE, p), p));
      const out = exportFree(layout, format);
      const base = out_prefix ?? p.replace(/\.json$/i, "");
      const written: string[] = [];
      wsWrite(WORKSPACE, `${base}.svg`, out.svg);
      written.push(`${base}.svg (${out.svg.length} bytes)`);
      if (out.dxf) {
        wsWrite(WORKSPACE, `${base}-${format}.dxf`, out.dxf);
        written.push(`${base}-${format}.dxf (${out.dxf.length} bytes)`);
      }
      return text(`Exported [${format}] ${out.widthMm}x${out.heightMm}mm:\n` + written.join("\n"));
    } catch (e) {
      return fail(e);
    }
  },
);

server.tool(
  "share_url",
  "Generate a URL hash that opens this layout directly in the web app",
  {
    path: z.string(),
    base: z.string().optional().describe("App URL, default http://localhost:3000/"),
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
  "List all .json files inside the workspace",
  {},
  async () => {
    const files = wsList(WORKSPACE);
    return text(files.length > 0 ? files.join("\n") : "(empty)");
  },
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();

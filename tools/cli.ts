/**
 * kdt CLI — 与 MCP server 共用 tools/core
 * 运行: npx tsx tools/cli.ts <命令> …（或 npm run kdt -- <命令>）
 */

import path from "node:path";
import fs from "node:fs";
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

const USAGE = `KDT 键盘配列工具 CLI（工作区: ${WORKSPACE}）

用法:
  npx tsx tools/cli.ts presets                     列出预设模板
  npx tsx tools/cli.ts files                       列出工作区文件
  npx tsx tools/cli.ts new <预设名|empty> <文件>    新建布局
  npx tsx tools/cli.ts show <文件> [--keys]         查看摘要/完整 JSON
  npx tsx tools/cli.ts edit <文件> --ops '<JSON>'   应用操作序列 [-o 输出文件]
  npx tsx tools/cli.ts export <文件> --format <fmt> 导出 layout-svg|pcb|plate
  npx tsx tools/cli.ts url <文件> [--base <URL>]    生成分享链接`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadArg(name: string): string {
  const v = arg(name);
  if (!v) {
    console.error(`缺少参数 ${name}`);
    process.exit(1);
  }
  return v;
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(USAGE);
    return;
  }

  switch (cmd) {
    case "presets":
      console.log(JSON.stringify(listPresetNames(), null, 2));
      return;

    case "files": {
      const files = wsList(WORKSPACE);
      console.log(files.length > 0 ? files.join("\n") : "(工作区为空)");
      return;
    }

    case "new": {
      const [src, file] = rest;
      if (!file) die("用法: kdt new <预设名|empty> <文件>");
      const layout = src === "empty" ? layoutFromRows([]) : presetLayout(src ?? "");
      wsWrite(WORKSPACE, file, jsonFromLayout(layout));
      printSummary(file, layout);
      return;
    }

    case "show": {
      const file = rest[0];
      if (!file) die("用法: kdt show <文件> [--keys]");
      const layout = layoutFromRows(JSON.parse(wsRead(WORKSPACE, file)));
      printSummary(file, layout);
      if (rest.includes("--keys")) console.log(listKeys(layout).join("\n"));
      else console.log(jsonFromLayout(layout));
      return;
    }

    case "edit": {
      const file = rest[0];
      if (!file) die("用法: kdt edit <文件> --ops-file <ops.json> [-o out]");
      const opsFile = arg("--ops-file");
      const opsRaw = (opsFile ? fs.readFileSync(opsFile, "utf8") : loadArg("--ops")).replace(/^\uFEFF/, "");
      const ops = JSON.parse(opsRaw);
      if (!Array.isArray(ops)) die("ops 必须是数组");
      const layout = layoutFromRows(JSON.parse(wsRead(WORKSPACE, file)));
      const r = applyOps(layout, ops);
      const target = arg("-o") ?? file;
      wsWrite(WORKSPACE, target, jsonFromLayout(r.layout));
      console.log(`已应用 ${r.applied}/${ops.length} → ${target}`);
      for (const e of r.errors) console.error(`- ${e}`);
      printSummary(target, r.layout);
      return;
    }

    case "export": {
      const file = rest[0];
      const format = loadArg("--format") as "layout-svg" | "pcb" | "plate";
      if (!file) die("用法: kdt export <文件> --format layout-svg|pcb|plate");
      const layout = layoutFromRows(JSON.parse(wsRead(WORKSPACE, file)));
      const out = exportFree(layout, format);
      const base = arg("-o") ?? file.replace(/\.json$/i, "");
      wsWrite(WORKSPACE, `${base}.svg`, out.svg);
      let line = `${base}.svg`;
      if (out.dxf) {
        wsWrite(WORKSPACE, `${base}-${format}.dxf`, out.dxf);
        line += ` + ${base}-${format}.dxf`;
      }
      console.log(`导出完成 [${format}] ${out.widthMm}×${out.heightMm}mm → ${line}`);
      return;
    }

    case "url": {
      const file = rest[0];
      if (!file) die("用法: kdt url <文件> [--base <URL>]");
      const layout = layoutFromRows(JSON.parse(wsRead(WORKSPACE, file)));
      console.log(shareUrl(layout, arg("--base") ?? "http://localhost:3000/"));
      return;
    }

    default:
      die(`未知命令 "${cmd}"\n${USAGE}`);
  }
}

function printSummary(file: string, layout: ReturnType<typeof layoutFromRows>): void {
  const s = summarize(layout);
  console.log(
    `[${path.basename(file)}] "${s.name}" 键数=${s.keyCount} 尺寸=${s.widthU}u×${s.heightU}u (${s.widthMm}×${s.heightMm}mm) 定位键=${s.stabCount}`,
  );
}

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

main();

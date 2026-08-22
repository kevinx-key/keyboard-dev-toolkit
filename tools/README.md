# KDT AI 工具层

## 快速开始

### CLI

```bash
npx tsx tools/cli.ts presets                    # 列出预设
npx tsx tools/cli.ts new "Default 60%" board.json  # 创建
npx tsx tools/cli.ts edit board.json --ops-file ops.json  # 编辑
npx tsx tools/cli.ts export board.json --format layout-svg  # 导出
npx tsx tools/cli.ts url board.json             # 生成分享链接
```

### MCP Server

工作区默认 `<cwd>/kdt-workspace/`，可通过环境变量 `KDT_WORKSPACE` 指定。

#### opencode（.opencode/config.json）

```json
{
  "mcp": {
    "kdt": {
      "command": "npx",
      "args": ["tsx", "K:/0AMAC/kle-editor/website-clone/tools/mcp-server.ts"],
      "env": { "KDT_WORKSPACE": "K:/0AMAC/kle-editor/website-clone/kdt-workspace" }
    }
  }
}
```

#### Claude Code（.claude/settings.json 或项目级）

```json
{
  "mcpServers": {
    "kdt": {
      "command": "npx",
      "args": ["tsx", "K:/0AMAC/kle-editor/website-clone/tools/mcp-server.ts"],
      "env": { "KDT_WORKSPACE": "K:/0AMAC/kle-editor/website-clone/kdt-workspace" }
    }
  }
}
```

#### Cursor / Windsurf（.cursor/mcp.json）

```json
{
  "mcpServers": {
    "kdt": {
      "command": "npx",
      "args": ["tsx", "K:/0AMAC/kle-editor/website-clone/tools/mcp-server.ts"],
      "env": { "KDT_WORKSPACE": "K:/0AMAC/kle-editor/website-clone/kdt-workspace" }
    }
  }
}
```

#### .mcp.json（项目根目录，已存在则合并）

```json
{
  "mcpServers": {
    "kdt": {
      "command": "npx",
      "args": ["tsx", "tools/mcp-server.ts"],
      "env": { "KDT_WORKSPACE": "kdt-workspace" }
    }
  }
}
```

## MCP 工具列表

| 工具 | 说明 |
|------|------|
| `get_guide` | 获取 AI 使用指南（KLE 格式规范 + ops 语法） |
| `list_presets` | 列出可用键盘预设模板 |
| `create_layout` | 用预设或行 JSON 创建布局文件 |
| `read_layout` | 读取布局文件（可选附键位明细） |
| `edit_layout` | 按 ops 序列修改布局（无状态，每次传全量） |
| `export_layout` | 导出 layout-svg / pcb / plate |
| `share_url` | 生成网页端分享链接 |
| `list_workspace` | 列出工作区文件 |

## 文件结构

```
tools/
  core.ts         ← 无头核心层（纯函数）
  mcp-server.ts   ← MCP stdio server
  cli.ts          ← kdt CLI
  AI_GUIDE.md     ← AI 使用指南（给 LLM 读）
  README.md       ← 本文件
tests/
  tools-core.test.ts  ← 核心层单测（18 用例）
  mcp-smoke.test.ts   ← MCP 兼容性验证（5 用例）
```

## 依赖

- `tsx` — TS 直接运行（无需编译）
- `@modelcontextprotocol/sdk` — MCP 协议 SDK
- `zod` — 参数校验
- `polygon-clipping` — 定位板布尔运算（已有依赖）

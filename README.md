# Keyboard Dev Toolkit

> A keyboard layout editor (KLE-compatible) with automatic PCB & plate generation — **100% client-side, zero upload**.
>
> KLE-compatible · KiCad-ready workflow · AGPL-3.0 open source

**中文说明见下方 [中文](#中文) 部分。**

---

## Why this tool

Every keystroke of your unreleased keyboard design stays **in your browser**. This app renders, edits and exports entirely on the client — there is no server that ever sees your layout. Static export, no telemetry, works offline.

Built as a modern re-implementation of [keyboard-layout-editor.com](https://www.keyboard-layout-editor.com)'s ideas (AngularJS 1.x era) on Next.js 16 / React 19 / TypeScript, fully compatible with the KLE data format. Thanks to Ian Prest and the KLE community for the original inspiration.

## Features

| Module | Community Edition (this repo) | Pro |
|--------|-------------------------------|-----|
| Layout editor — 12 label slots, rotated clusters, stepped/homing/decal keys | ✅ | ✅ |
| Canvas interactions — marquee select, drag, zoom/pan, context menu | ✅ | ✅ |
| PCB auto-generation — switch/stab placement, mounting holes | ✅ | ✅ |
| Plate generation + DXF export | ✅ | ✅ |
| Export JSON / SVG / PNG / JPG | ✅ | ✅ |
| STP (STEP) 3D model export | ✅ | ✅ |
| **KiCad `.kicad_pcb` export** | 🔒 | ✅ |
| **LCEDA (立创EDA) import workflow** | 🔒 | ✅ |
| **QMK firmware source generation** (keyboard.json / keymap.c / VIA) | 🔒 | ✅ |
| Manufacturing order pipeline (coming soon) | — | ✅ |

## Quick start

```bash
npm install     # postinstall injects community stubs automatically
npm run dev     # http://localhost:3000
```

Build & test:

```bash
npm run check             # lint + typecheck + production build
npx vitest run tests/     # unit tests
```

Desktop app (Tauri v2):

```bash
npm run tauri:dev
```

## How the Pro boundary works

This repository builds the **Community Edition** out of the box. Pro-only modules are physical placeholders (`pro-stub/`) that throw at runtime and never ship real logic:

```
src/plugins/qmk-export/index.ts   ← stub (types are real contracts)
src/lib/kicad-export.ts           ← stub
src/lib/lceda-export.ts           ← stub
```

The real implementations live in a private repository and are injected at build time by:

```bash
node scripts/fetch-pro.mjs        # requires PRO_REPO_TOKEN (maintainers only)
node scripts/fetch-pro.mjs --stub # back to community state
```

All Pro paths are git-ignored, so proprietary code can never leak into this repo by accident.

## Architecture (60 seconds)

```
KLE JSON / URL hash(##@@) / localStorage
  → parseKLE / parseKLEJSON   (lib/kle-parser.ts · kle-serial.ts)
  → KeyProps[]                (lib/kle-types.ts)
  → editorReducer             (lib/kle-reducer.ts — undo/redo)
  → KeyboardCanvas / ToolBelt / PlateSection / PCBSection
  → exports: JSON/SVG/PNG/JPG/DXF/STP · matrix core (lib/matrix-core.ts)
```

- `src/lib/matrix-core.ts` — geometry→matrix assignment engine (orphan-key detection included), shared by PCB preview, KiCad and QMK pipelines
- `src-tauri/` — Rust backend for STP generation
- `tests/` — 368+ vitest cases incl. KLE round-trip snapshots

## Contributing

PRs welcome! By opening a pull request you agree that your contribution is licensed under **AGPL-3.0**, and grant the maintainer a right to relicense future combined works (keeps dual-licensing possible). Please run `npm run check` before submitting.

Good first issues: i18n strings (`src/lib/i18n.tsx` — 9 languages, single file), canvas rendering perf, export format coverage.

## License & Trademark

- Code: **[GNU Affero General Public License v3.0](./LICENSE)** (AGPL-3.0-only). Any derivative — including hosted services — must be released under AGPL.
- "Keyboard Dev Toolkit", the K星 logo and wordmarks are trademarks of the K星团队. Forks must rename the product and may not present themselves as the original.
- KLE format compatibility is independent of keyboard-layout-editor.com; that site is not affiliated with this project.

---

## 中文

键盘配列编辑器（兼容 KLE 数据格式）+ 键盘 PCB / 定位板自动生成工具。

**核心卖点：全客户端渲染、静态导出——你的未发布设计永远不会离开浏览器。**

- 社区版（本仓）：编辑器 + PCB/定位板生成 + DXF/STP 导出，AGPL-3.0 开源
- 专业版：KiCad / 立创EDA / QMK 固件生产级导出（私有仓构建注入）
- 快速上手：`npm install && npm run dev`
- 贡献指引见上方英文部分；提交 PR 即表示同意 AGPL-3.0 授权条款

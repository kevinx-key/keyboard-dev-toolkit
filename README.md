# Keyboard Dev Toolkit

> All-in-one custom keyboard design tool that runs entirely in your browser — draw the layout, generate the plate, generate the PCB, and export the files you need to build it.

**KLE-compatible · 100% client-side · works offline · free & open source**

---

## What is this?

Keyboard Dev Toolkit is a keyboard design tool that runs **entirely in your browser**. Whether you're building a one-off custom keyboard for yourself or prototyping a PCB for mass production, the whole pipeline lives in one place:

1. **Draw the layout** — drag-and-drop key placement like KLE, with rotated clusters, stepped/homing/decal keys and more
2. **Generate the plate** — one-click plate geometry, exported as DXF for CNC / laser cutting
3. **Generate the PCB** — automatic switch, stabilizer and mounting-hole placement, producing the design files your PCB manufacturer needs
4. **Export 3D models** — production-grade STEP (STP) models of the PCB, the plate and the components on them, ready to import into any 3D software

Everything is computed locally in your browser — no server involved, fully usable offline.

## Why this tool

| Pain point | How we solve it |
|-----------|-----------------|
| KLE only draws layouts — no structural output | Plates and PCBs are generated automatically, turning drawings into manufacturable files |
| Reluctant to share unreleased designs | Runs 100% locally on your device — no server, fully offline |
| High switching costs to new tools | Fully KLE-compatible — import your existing layouts and migrate with zero friction |
| "Free" tools that are painful to use | Modern UI (Next.js / React): marquee select, drag, zoom/pan, undo/redo, context menus, 9 UI languages |
| No accurate 3D models for case design | Standard, production-grade, high-precision STEP models of the PCB and its components — no more guessing |
| Fragmented file formats | Unified exports: JSON / SVG / PNG / JPG / DXF / STEP |

## Features

### 🎨 Layout editor (keyboard canvas)
Full layout editing: 12 label slots, rotated key clusters, stepped/homing/decal keys, per-key colors and textures, marquee selection, drag, zoom/pan, context menu, undo/redo, 9 UI languages.

![Keyboard canvas editor](./docs/screenshots/editor-canvas.png)

### 🧩 Plate editor
Auto-generates plate geometry from your layout: per-key cutout size and rotation, screw mounting holes, DXF export ready for CNC / laser cutting.

![Plate editor](./docs/screenshots/plate-editor.png)

### 🔌 PCB editor
Auto-generates the PCB: switch footprints, stabilizer cutouts, mounting holes, and matrix wiring assignment (shared `matrix-core` engine with orphan-key detection) — export the design files and send them to your PCB manufacturer.

![PCB editor](./docs/screenshots/pcb-editor.png)

### 📐 Production-grade STEP models

Export **standard STEP (STP) 3D models** of both the PCB itself and the components on it — switches, stabilizers, and every part your design needs, all in one file set.

This matters more than it sounds: many keyboard designers get stuck at exactly this step, unable to find accurate models to import into their 3D software for case design — or worse, relying on rough approximations that silently produce wrong production files. Every model here is **standard, reliable, production-valid and high-precision**: what you see in your 3D software is what comes out of the factory, so your case, gaskets and enclosures fit the real product.

## Who is it for?

- **Custom keyboard enthusiasts** — design your own layout and get a machinable plate
- **Keyboard makers & indie developers** — from drawing to PCB, one tool
- **Small studios / startups** — fast prototyping before mass production; change the layout and the PCB follows
- **AI & automation workflows** — fully client-side, standard JSON data format, scriptable and callable by AI tools

## Getting started

### 🌐 Online (try it first)

Use the hosted web version directly in your browser — no installation needed.

### 🖥️ Desktop app

Windows, macOS and Linux installers are published on the [Releases](https://github.com/709208969/keyboard-dev-toolkit/releases) page (latest: **v1.0.26**):

| Platform | File |
|----------|------|
| 🪟 Windows x64 | `.exe` (NSIS installer) / `.msi` |
| 🍎 macOS Intel | `.dmg` (x86_64) |
| 🍎 macOS Apple Silicon | `.dmg` (arm64) |
| 🐧 Linux x64 | `.AppImage` |

> Note: installers are unsigned (open-source community builds). On Windows, SmartScreen may show "Unknown publisher" — click **More info → Run anyway**. On macOS, right-click → **Open** if "unverified developer" appears, or run `xattr -dr com.apple.quarantine "/Applications/Keyboard Dev Toolkit.app"`. Linux AppImage runs directly.

### 🛠️ Run it locally (step by step)

This guide walks you through running the app on your own computer. Total time: about 5 minutes.

**Step 1 — Install Node.js (v24 or newer)**

The app requires Node.js 24+. Download the installer from [nodejs.org](https://nodejs.org) (choose the latest LTS, which is v24 or newer) and run it — accept the defaults.

> On Windows, you can also use [nvm-windows](https://github.com/coreybutler/nvm-windows) or [fnm](https://github.com/Schniz/fnm) to manage Node versions.

Verify the installation by opening a terminal (Command Prompt / PowerShell / Terminal) and running:

```bash
node -v    # should print v24.x.x or newer
npm -v     # should print a version number
```

**Step 2 — Get the source code**

```bash
git clone https://github.com/709208969/keyboard-dev-toolkit.git
cd keyboard-dev-toolkit
```

> No Git? Install it from [git-scm.com](https://git-scm.com), or download the repository ZIP from the GitHub page and extract it.

**Step 3 — Install dependencies**

```bash
npm install
```

This may take a few minutes on first run. The `postinstall` step automatically prepares the community modules — no extra action needed.

**Step 4 — Start the app**

```bash
npm run dev
```

Wait until you see `Ready` / `Local: http://localhost:3000`, then open **http://localhost:3000** in your browser. Done!

**Optional — production build**

```bash
npm run build
npm start      # serves on http://localhost:3000
```

**Troubleshooting**

| Problem | Fix |
|---------|-----|
| `npm install` fails or times out | If you're in China, use a mirror: `npm config set registry https://registry.npmmirror.com`, then `npm install` again |
| Error about Node version (`engine node` mismatch) | Install Node 24+ (Step 1) — check with `node -v` |
| Port 3000 already in use | Run `npm run dev -- -p 3001` and open http://localhost:3001 |
| Blank page after starting | Hard-refresh (Ctrl+Shift+R) or clear the browser cache |
| Windows firewall prompt | Allow access — the app is local-only |

## Architecture (for AI & developers)

- **Stack**: Next.js 16 / React 19 / TypeScript 5 / Tailwind v4 + Tauri v2 (Rust) desktop shell
- **100% client-side**: static export, no backend, no server, works offline
- **Data flow**: `KLE JSON / URL hash(##@@) / localStorage → parseKLE → KeyProps[] → editorReducer (undo/redo) → canvas & generators → multi-format export`
- **matrix-core**: geometry → matrix assignment engine (with orphan-key detection), shared by the PCB preview and export pipelines
- **Compatibility**: bidirectional KLE data format — paste KLE JSON or share links directly in/out
- **Testing**: 443+ unit tests (incl. KLE round-trip snapshots) + Playwright E2E
- **i18n**: 9 languages built in

## FAQ

**Q: Can I import my existing KLE layouts?**
A: Yes. KLE JSON or URL share links import directly — no conversion needed.

**Q: Does the app need an internet connection?**
A: No. The app runs entirely in your browser on your device — no server involved, fully usable offline.

**Q: Can the exported files go straight to a fab?**
A: Yes. The plate DXF is machinable directly, and the PCB design files are ready to send to your PCB manufacturer.

## Contributing

PRs welcome! By opening a pull request you agree that your contribution is licensed under **AGPL-3.0**, and grant the maintainer a right to relicense future combined works (keeps dual-licensing possible). Please run `npm run check` before submitting.

Good first issues: i18n strings (9 languages), canvas rendering performance, export format coverage.

## License & Trademark

- Code: **[GNU Affero General Public License v3.0](./LICENSE)** (AGPL-3.0-only). Any derivative — including hosted services — must be released under AGPL.
- The project name "Keyboard Dev Toolkit" and the K星 logo belong to the K星 team. Forks and derived versions should use a different product name and must not present themselves as the original.
- KLE format compatibility is independent of keyboard-layout-editor.com; that site is not affiliated with this project. Thanks to Ian Prest and the KLE community for the original inspiration.

---

## 中文简介

键盘配列编辑器（兼容 KLE 数据格式）+ 键盘 PCB / 定位板自动生成工具，**全程本地运行、可离线使用**。

- 画配列 → 出定位板（DXF 直接加工）→ 生成 PCB（直接交给厂家制造）→ 导出 STEP 3D 模型
- **标准 STP 3D 模型**：PCB 板体与板上元器件（轴体、卫星轴等）均有高精度标准模型。很多作者卡在"拿不到准确的 3D 模型导入设计软件"这一步，或用了粗糙模型导致生产文件出错；我们的模型是标准的、可靠的生产有效模型，3D 软件里看到的与工厂实际生产出的产品一致，外壳、垫片、结构件按它设计不会偏差
- 浏览器即可使用，无需安装；已发布 Windows / macOS / Linux 三平台安装包，见 GitHub [Releases](https://github.com/709208969/keyboard-dev-toolkit/releases)
- 免费开源（AGPL-3.0），本地部署指南见上方英文部分

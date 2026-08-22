# Keyboard Dev Toolkit

> 从想法到 PCB 的一站式客制化键盘设计工具 — 画配列、出定位板、生成 PCB，全程在本地完成，你的设计永远不会离开你的电脑。

**KLE 数据格式兼容 · 100% 客户端运行 · 零上传零追踪 · 免费开源**

English summary below (see [English](#english-summary)).

---

## 这是什么？

Keyboard Dev Toolkit 是一款**浏览器里就能用的键盘设计软件**。无论你是想做一把自己用的客制化键盘，还是为量产设计 PCB，都可以用它完成整个流程：

1. **画配列** — 像 KLE 一样拖拽摆放键位，支持旋转群组、阶梯键、居中键等专业编辑
2. **生成定位板** — 一键生成定位板几何，直接导出 DXF 给 CNC/激光切割
3. **生成 PCB** — 自动计算轴体/卫星轴/螺丝孔位，导出工程文件给 KiCad / 立创EDA 打样
4. **输出固件** — 专业版可直接生成 QMK 固件源码，键盘画完就能刷

> 所有计算都在你的浏览器本地完成，**没有任何服务器**。未发布的设计不会上传到任何地方。

## 为什么选择它

| 痛点 | 我们怎么解决 |
|------|-------------|
| KLE 只能画图，不能出结构件 | 定位板 + PCB 一键生成，图纸直接变成可生产的文件 |
| 设计数据怕泄露（未发布的产品） | 100% 本地运行，零上传、零遥测、可离线使用 |
| 换工具学习成本高 | 完全兼容 KLE 数据格式，老配列直接导入，无缝迁移 |
| 开源免费但难用的工具 | 现代化界面（Next.js/React），拖拽、框选、撤销重做、缩放平移一应俱全 |
| 文件格式五花八门 | 统一导出 JSON / SVG / PNG / JPG / DXF / STEP / KiCad / 立创EDA / QMK |

## 核心功能

### 🎨 键盘画布编辑器
完整的配列编辑能力：12 个标签位、旋转按键簇、阶梯/居中/装饰键、按键颜色与纹理编辑、框选、拖拽、缩放平移、右键菜单、撤销/重做，支持 9 种界面语言。

![键盘画布编辑器](./docs/screenshots/editor-canvas.png)

### 🧩 定位板编辑器
根据配列自动生成定位板几何：计算每个按键的开孔尺寸与方向、螺丝孔位，支持 DXF 导出，直接对接 CNC / 激光切割加工。

![定位板编辑器](./docs/screenshots/plate-editor.png)

### 🔌 PCB 编辑器
自动生成 PCB：轴体焊盘、卫星轴孔、螺丝安装孔、矩阵连接关系（matrix core 自动分配），可导出 KiCad 工程文件或导入立创EDA 完成布线打样。

![PCB 编辑器](./docs/screenshots/pcb-editor.png)

## 适合谁？

- **客制化键盘玩家** — 设计自己的配列，出定位板找厂家加工
- **键盘发烧友 / 独立开发者** — 从画图到 PCB 打样到固件，一条龙
- **工作室 / 初创团队** — 量产前的快速原型验证，配列改了 PCB 跟着改
- **AI 与自动化工作流** — 全客户端架构、标准 JSON 数据格式，可被脚本和 AI 工具直接调用

## 快速开始

### 🌐 在线使用（推荐先体验）

访问在线版本即可使用，无需安装（Web 版提供全部免费功能）。

### 🖥️ 桌面版（即将发布）

Windows 安装版（`.exe`）即将在 Releases 发布：双击安装、离线可用、可直接打开本地文件。敬请关注 [Releases](https://github.com/709208969/keyboard-dev-toolkit/releases) 页面。

### 🛠️ 本地运行（开发者）

```bash
npm install     # 自动注入社区版组件
npm run dev     # 打开 http://localhost:3000
```

## 免费 vs 专业版

| 功能 | 社区版（本仓库 / Web 版） | 专业版 |
|------|:---:|:---:|
| 配列编辑器（12 标签位 / 旋转簇 / 阶梯键等） | ✅ | ✅ |
| 定位板生成 + DXF 导出 | ✅ | ✅ |
| PCB 生成（轴体/卫星轴/螺丝孔） | ✅ | ✅ |
| JSON / SVG / PNG / JPG 导出 | ✅ | ✅ |
| STEP 3D 模型导出 | ✅ | ✅ |
| **KiCad `.kicad_pcb` 导出** | 🔒 | ✅ |
| **立创EDA 导入工作流** | 🔒 | ✅ |
| **QMK 固件源码生成**（keyboard.json / keymap.c / VIA） | 🔒 | ✅ |
| 量产下单流程（即将上线） | — | ✅ |

社区版完全免费且开源（AGPL-3.0），专业版导出能力通过私有模块在构建时注入，本仓库永远不包含专业版逻辑。

## 技术特点（给 AI / 开发者参考）

- **架构**：Next.js 16 / React 19 / TypeScript 5 / Tailwind v4 + Tauri v2 (Rust) 桌面壳
- **纯客户端**：全静态导出，无后端、无服务器、可离线
- **数据流**：`KLE JSON / URL hash(##@@) / localStorage → parseKLE → KeyProps[] → editorReducer（撤销/重做）→ 画布与生成器 → 多格式导出`
- **matrix core**：几何 → 矩阵分配引擎（含孤儿按键检测），PCB 预览、KiCad、QMK 共用同一套矩阵逻辑
- **兼容性**：KLE 数据格式双向兼容，配列 JSON / URL 链接可直接互相导入导出
- **测试**：443+ 单元测试（含 KLE 往返快照）+ Playwright E2E
- **国际化**：内置 9 种语言

## 常见问题

**Q: 我的 KLE 配列能直接导入吗？**
A: 可以。KLE JSON、URL 分享链接均可直接导入，无需任何转换。

**Q: 设计数据安全吗？**
A: 安全。应用 100% 在浏览器本地运行，没有服务器，你的数据永远不会被上传。

**Q: 导出的文件能直接去厂家打样吗？**
A: 定位板 DXF 可直接加工；PCB 通过 KiCad / 立创EDA 工作流走完布线后即可投板。

## 贡献

欢迎 PR！提交 PR 即表示同意以 **AGPL-3.0** 授权你的贡献，并授予维护者对未来合并作品的再许可权（保障双许可模式的可行性）。提交前请运行 `npm run check`。

好上手的贡献方向：界面翻译（9 种语言）、画布渲染性能、导出格式覆盖。

## 许可证与商标

- 代码：[GNU Affero General Public License v3.0](./LICENSE)（AGPL-3.0-only）。任何衍生作品（包括在线托管服务）必须同样以 AGPL 发布。
- "Keyboard Dev Toolkit" 及 K星 logo、文字商标归 K星团队所有。Fork 需重命名产品，不得自称原版。
- 本项目的 KLE 格式兼容与 keyboard-layout-editor.com 相互独立，该网站与本项目无关联。感谢 Ian Prest 与 KLE 社区的启发。

---

## English Summary

**Keyboard Dev Toolkit** is a browser-based keyboard layout editor (fully KLE-compatible) that goes beyond drawing: it auto-generates **plates** (DXF export) and **PCBs** (KiCad / LCEDA workflow) from your layout, and the Pro edition even outputs ready-to-flash **QMK firmware source**.

- **100% client-side** — zero upload, zero telemetry, works offline. Your unreleased designs never leave your machine.
- **Free & open source** — Community Edition (this repo) is AGPL-3.0; Pro export modules are injected at build time from a private repo.
- **Desktop app** — Windows `.exe` installer coming soon to Releases.

Built on Next.js 16 / React 19 / TypeScript + Tauri v2. See the Chinese sections above for full feature details and screenshots.

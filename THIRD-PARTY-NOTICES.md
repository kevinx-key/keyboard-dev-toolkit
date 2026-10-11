# Third-Party Notices / 第三方组件声明

> Maintained for license-compliance of shipped builds (web, desktop Tauri).
> 本文件用于满足随产品分发时的第三方许可证声明义务（G-A6）。

This project is distributed under **AGPL-3.0-only** for its own source code
(see [LICENSE](./LICENSE)). It also includes or links the third-party
components listed below. Those components remain under their own licenses.

---

## 1. OpenCASCADE Technology (OCCT) — CAD kernel

The desktop (Tauri) build performs 3D geometry operations (extrusion, boolean
cut, STEP generation) by **statically linking the OpenCASCADE Technology CAD
kernel**, pulled in through the `cadrum` crate (see §2).

| | |
|---|---|
| Component | OpenCASCADE Technology (OCCT) |
| Version | 8.0.0 (statically linked via `cadrum` 0.8.13) |
| Copyright | Open CASCADE SAS and contributors |
| License | **GNU LGPL v2.1 only, with the Open CASCADE Exception 1.0** |
| SPDX identifier | `LGPL-2.1-only WITH OCCT-exception-1.0` |
| Full LGPL text | https://github.com/Open-Cascade-SAS/OCCT/blob/master/LICENSE_LGPL_21.txt |
| Exception text | https://spdx.org/licenses/OCCT-exception-1.0.html |

**What this means (summary, not legal advice):** OCCT is licensed under LGPL-2.1,
and the attached **OCCT Exception** expressly permits linking OCCT (including
**static** linking) into applications without the LGPL's relinking requirement
and without requiring the application's own source code to be released under
the LGPL. This project therefore statically links OCCT while keeping its own
application code under its own license.

**Obligations honoured:** this notice attributes OCCT, identifies its license,
and makes the full license + exception texts available (the links above, and
bundled with the desktop release). No OCCT source is modified by this project
beyond what the exception permits.

## 2. cadrum (Rust CAD bindings)

| | |
|---|---|
| Component | `cadrum` — Rust CAD library, statically links a headless OCCT build |
| Version | 0.8.13 (locked in `src-tauri/Cargo.lock`) |
| Upstream | https://github.com/lzpel/cadrum |
| License | **MIT** |
| Copyright | © 2026 cadrum Contributors |

The MIT license text is reproduced below:

```
MIT License

Copyright (c) 2026 cadrum Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 3. Other third-party dependencies

The application also depends on numerous npm (JavaScript/TypeScript) and Rust
crates. The authoritative dependency lists are:

- Web / frontend: `package.json` → `dependencies` / `devDependencies`
  (each package carries its own license, typically MIT / Apache-2.0 / ISC).
- Desktop shell: `src-tauri/Cargo.toml` + `src-tauri/Cargo.lock`.

To generate a full machine-readable inventory, run (when needed):

```bash
npx license-checker --summary        # npm dependency licenses
cd src-tauri && cargo license         # Rust dependency licenses (cargo-license)
```

> **TODO (tracked):** the desktop app has no in-app **About → Licenses** screen
> yet. Until one exists, this `THIRD-PARTY-NOTICES.md` (plus the linked license
> texts) is the canonical notice and must ship alongside the desktop binary.
> Adding the in-app screen is a separate UI task.

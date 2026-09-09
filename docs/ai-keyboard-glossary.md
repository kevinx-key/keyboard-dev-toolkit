# AI Keyboard Glossary (Chinese colloquial ↔ standard specs)

> Purpose: let any LLM (in-app AI assistant / MCP client / coding agent) map the Chinese
> colloquial keyboard terms users say in conversation onto real KLE key data (`w/h/r/rx/ry/x2/y2/w2/h2`).
> The web AI panel inlines a condensed version of this table in its system prompt; this file is the full version.
> Rule: if a term is genuinely ambiguous (e.g. 「大回车」), ask the user ONCE for row/column/width with a
> default option — never guess silently.

---

## 1. Enter family (most confusing)

| Colloquial (user says) | Standard name | Geometry (KLE / ops) |
|---|---|---|
| **一字回车** | ANSI Enter (US horizontal Enter) | Single key, one row, w≈2.25u (1.5u–2u on some compact rows), `w≈2.25, h=1` |
| **7字回车 / 7回 / 反L回车 / 倒L回车** | ISO Enter (EU inverted-L Enter) | Same encoding as the Enter in the **ISO 105 / ISO 60% presets**: `{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }` — ONE single key, 2 rows tall (`h=2`), its ~1.25u vertical bar hugs the right edge of the alnum block; the top row carries a left shoulder (second segment `w2=1.5 h2=1 x2:-0.25`, occupying the 1.5u slot that is normally the `\` key position). Row-relative `x:0.25` staggers the bar relative to the row above (in the presets this key is declared at the end of the Tab row and spans two rows down). Converting from an ANSI 2.25u horizontal Enter: move the `\` key that sits above the Enter (right of `]`) DOWN one row to the LEFT edge of the former Enter slot as a **1u** key (the slot the extra ISO key occupies — labeled `#~` on UK, `\` on US-ISO); the remaining right 1.25u of the old Enter slot becomes this key's vertical bar with `h=2`, reaching back up into the old `\` row. Note: ISO's true extra `\|` key lives on the LEFT-SHIFT row (left Shift shrinks from 2.25u to 1.25u with a 1u `\|` key next to it) — NOT beside the Enter |
| **大回车** | umbrella (context-dependent) | May mean the ISO inverted-L Enter or a wide horizontal Enter (2.25u+). **Ask the user once** (default: ISO) |
| **大屁股回车** | legacy AT big Enter | Historic term, rarely used in modern customs |

## 2. Spacebar / large keys

| Colloquial | Meaning | Common geometry |
|---|---|---|
| **空格（standard）** | single spacebar | `w=6.25` (mainstream) or `w=7` (7U, wide layouts) |
| **分裂空格** | bottom row split into 2–3 shorter bars | e.g. `2.25+2.75+2.25` (3 bars), `3+3` (2 bars), `2.75+2.25+2.25` — independent keys |
| **分裂退格 / 分离 Backspace** | backspace split into two 1u | both keys `w=1` |
| **分裂右 Shift** | right Shift split into two | e.g. `1.75 + 1` (common on 60/65%) |
| **左 Shift 2.25u** | ANSI left Shift | `w=2.25` |
| **左 Shift 1.25u + 额外键** | ISO (UK-style) left Shift | `w=1.25` left Shift + adjacent 1u `\|` key (`w=1`), total 2.25u |
| **右 Shift** | usually 2.75u on both ANSI and ISO | `w=2.75` |
| **大键位** | any key ≥2u | space/Shift/Enter/Backspace; KDT summaries count these as "keys>=2u" |
| **阶梯 Caps / Stepped Caps** | stepped Caps Lock | KLE flag `l:true` |
| **门牙** | extra small key left/above the arrows (custom slang) | 1u key, position varies — **ask the user where** |

## 3. Layout standards

| Term | Meaning | Key differences |
|---|---|---|
| **ANSI** | US layout | horizontal Enter, left Shift 2.25u |
| **ISO** | EU layout | inverted-L Enter (7字回车), left Shift 1.25u + extra 1u `\|` key |
| **JIS** | Japanese layout | inverted-L Enter, extra keys near the spacebar (ろ/無変換) |
| **Ortholinear / 正交配列** | fully grid-aligned | Planck, Preonic |
| **Split / 分裂键盘** | physically split halves | ErgoDox, Lily58, Corne (column stagger) |
| **Alice / Arisu** | angled ergonomic alnum | tilted alpha sections, two B positions, extra 1u on the right |

## 4. Layout & structure terms

- **旋钮 / 编码器 / 旋键 / knob / rotary encoder**: round dial — in KLE only expressible as a key/decal position and size; no real encoder events can be generated.
- **卫星轴（stabilizer）** / **平衡杆（wire）**: big-key hardware; does not change key geometry.
- **gasket / top mount / tray mount / o-ring**: case mounting styles — **no effect on layout geometry**.
- **热插拔（hotswap）** / **焊接（solder）**: switch mounting type — no geometry effect.
- **配列**: the key layout itself.
- **F 区 / 数字区 / 功能区**: top F1–F12 row; **方向键区 / nav cluster**: inverted-T arrows bottom-right + Delete/End/PgDn column.
- **竖列 / 行（row）/ 列（column）**: keys live on an (x, y) grid; x right, y down, unit = key width (1u = 19.05mm).

## 5. Quick size table

| Size | u value |
|---|---|
| 1u = 19.05mm | standard 1x1 |
| 1.25 / 1.5 / 1.75 | Ctrl / Tab / Caps families |
| 2.25 / 2.75 | ANSI left Shift / usual right Shift |
| 6.25 / 7 | standard spacebar / wide spacebar |

## 6. Example dialogue phrasings (models can reuse directly)

- 「把 7 字回车改成一字回车」→ find the ISO inverted-L Enter (h=2), change it to a `w≈2.25, h=1` horizontal key, and handle the left Shift (1.25u+`\|` → 2.25u) and the 1u key.
- 「加个分裂空格」→ replace one 6.25u spacebar with three keys `2.25+2.75+2.25` (ask the user for the exact split).
- 「把右 Shift 分裂」→ split a 2.75u into 1.75u + 1u (or 1.5+1.25; ask the user).

> Established 2026-09. If a term is ambiguous, always ask the user once before acting.

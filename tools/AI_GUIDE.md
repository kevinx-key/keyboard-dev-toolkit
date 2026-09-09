# KDT AI Guide (English)

> Read this guide to drive KDT through the MCP tools or the CLI: create layouts, edit keys, export SVG/DXF.

> **Terminology**: users name keys with Chinese hobbyist colloquialisms (e.g. 「7字回车」「分裂空格」「大回车」).
> The full bilingual mapping lives in `docs/ai-keyboard-glossary.md`. Consult it when the user uses such terms;
> if a term is genuinely ambiguous (e.g. 「大回车」), ask ONCE with a default instead of guessing.

## KLE Row Format (core data format)

A layout is a **JSON array**; every element is one row:

```json
[
  { "name": "My 65%", "author": "AI" },
  ["Esc", { "x": 1 }, "F1", "F2", "F3", "F4", { "x": 0.5 }, "F5", "F6", "F7", "F8"],
  [{ "y": 0.5 }, "~\n`", "!\n1", "@\n2", "#\n3"]
]
```

- **First element (optional)**: a metadata object (`name`, `author`, `notes`, `backcolor`, …).
  If the first element only carries key attributes (like `{x:1}`) it is a row attribute object, NOT metadata.
- **Later elements**: rows. A string is a key label; an object is an attribute set (sticky — applies to following keys too).
- **Labels**: `"\n"` separates the 12 label slots (main label + secondary labels). A plain string like `"Q"` or `"Esc"` sets the main label.
- **Multi-slot labels**: `"Q\n\n\n\n\n\nW"` means main label Q, slot-6 label W.

## Key Attributes (sticky object fields)

| Field | Type | Default | Meaning |
|-------|------|---------|---------|
| `x` | number | 0 | X offset (key units) |
| `y` | number | 0 | Y offset (key units) |
| `w` | number | 1 | Width (key units) |
| `h` | number | 1 | Height (key units) |
| `r` | number | 0 | Rotation (degrees) |
| `rx` | number | 0 | Rotation center X (key units) |
| `ry` | number | 0 | Rotation center Y (key units) |
| `c` | string | "#c8c8c8" | Background color (#rrggbb) |
| `t` | string | "#000000" | Text color |
| `d` | boolean | false | Decal key (no physical key) |
| `n` | boolean | false | Home-key nub |
| `l` | boolean | false | Stepped key (e.g. stepped Caps Lock) |
| `w2` | number | 0 | Non-rectangular key: second segment width |
| `h2` | number | 0 | Non-rectangular key: second segment height |
| `x2` | number | 0 | Non-rectangular key: second segment X offset |
| `y2` | number | 0 | Non-rectangular key: second segment Y offset |

> **Non-rectangular (L-shaped) keys** — a SINGLE key can carry a second segment `x2/y2/w2/h2`.
> This is how the ISO inverted-L "7字回车" Enter is modeled — exactly one key, e.g.
> `{ x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }` (identical to the Enter in the
> "ISO 105" / "ISO 60%" presets). Editing, SVG rendering, PCB and plate export all handle it.

## Ops Syntax

An op batch is a JSON array; each item is `{op, ...args}`. Ops apply in order; after a delete, indexes are re-indexed immediately.

### set_label — set the main label

```json
{"op": "set_label", "index": 0, "label": "Esc"}
```

### set_prop — set any attribute

```json
{"op": "set_prop", "index": [0, 1, 2], "prop": "w", "value": 1.5}
{"op": "set_prop", "index": 0, "prop": "r", "value": 90}
{"op": "set_prop", "index": 0, "prop": "c", "value": "#ff0000"}
{"op": "set_prop", "index": 69, "prop": "w2", "value": 1.5}
{"op": "set_prop", "index": 69, "prop": "x2", "value": -0.25}
```

Supported properties: `x y w h x2 y2 w2 h2 r rx ry align labelSize f2 c t d g l n p sm sb st stab labels fa textSize textColor`

### move — translate keys

```json
{"op": "move", "index": [0, 1, 2, 3], "dx": 0, "dy": 1}
```

### place — absolute positioning

```json
{"op": "place", "index": 5, "x": 6.25, "y": 1}
```

### delete — remove keys

```json
{"op": "delete", "index": [0, 5]}
```

### add_key — append a key

```json
{"op": "add_key", "x": 0, "y": 10, "w": 6.25, "label": "Space"}
```

### set_meta — change metadata

```json
{"op": "set_meta", "name": "Custom Layout", "author": "AI"}
```

## Preset Templates

| Name | Keys | Type |
|------|------|------|
| Default 60% | 61 | 60% ANSI |
| ANSI 104 | 104 | Full-size |
| ISO 105 | 105 | European layout |
| ErgoDox | 76 | Ergonomic |
| Atreus | 44 | Split ortholinear |
| Planck | 47 | Ortholinear 40% |
| Kinesis Advantage | 84 | Split concave |
| Keycool 84 | 84 | 75% |
| Leopold FC660m | 66 | 65% |

## Export Formats

| format | Output | Notes |
|--------|--------|-------|
| `layout-svg` | .svg | Layout visualization (keycaps + labels) |
| `pcb` | .svg + .dxf | PCB hole pattern (switches + stabilizers + LEDs) |
| `plate` | .svg + .dxf | Plate cutouts (switches + stabilizers) |

**Pro features** (QMK export, KiCad, STP) are NOT exposed to the AI tool layer.

## Typical Workflow (MCP)

```
1. get_guide (once) / list_presets
2. create_layout from a preset
3. read_layout (with_keys) to get real indexes
4. edit_layout set_label/set_prop/move/delete/place — batch related ops in one call
5. export_layout SVG/DXF to verify geometry
6. share_url for a browser-openable link
```

## Typical Workflow (CLI)

```bash
npx tsx tools/cli.ts presets
npx tsx tools/cli.ts new "Default 60%" my-board.json
echo '[{"op":"set_label","index":0,"label":"Esc"},{"op":"set_prop","index":0,"prop":"r","value":90}]' > ops.json
npx tsx tools/cli.ts edit my-board.json --ops-file ops.json
npx tsx tools/cli.ts export my-board.json --format layout-svg
npx tsx tools/cli.ts url my-board.json
```

## Coordinate System

- 1 key unit = 19.05mm (standard Cherry MX pitch)
- Origin is the top-left of the layout; X goes right, Y goes down
- A key's `(x, y)` is its top-left corner
- `r` rotates around `(rx, ry)`, usually the key's own center

## Agent Conduct (HARD)

- **Ground truth first**: index/coordinate claims may only come from the most recent `read_layout` (with_keys) result — never from memory.
- **Capability honesty**: the tool CAN express L-shaped/stepped keys through `x2/y2/w2/h2` on a single key (see above and the ISO 105 preset). Never claim the tool "cannot do X" from memory; verify against this guide, the glossary, or the source (`src/lib/ops-engine.ts`, `src/lib/kle-types.ts`).
- **Template over invention**: when a user asks for a shape that exists in a preset (e.g. ISO Enter), create that preset, `read_layout` its flat key attributes, and port them onto the target key.
- **Confirm once, act by default**: ask at most ONE clarifying question per user turn, with a default option attached; ask only about facts you cannot derive (which key an ambiguous term means, whether keys other than the named one may move). Never delegate geometry decisions to the user.
- **Report honestly**: tool outputs state how many ops applied. If some failed, tell the user which ones. Never claim an edit/export happened without a real tool result.
- **Verify**: after edits, run an export and sanity-check the reported geometry before declaring success.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, Eraser, Eye, EyeOff, History, MessageSquare, Plus, Send, Settings, Trash2, X } from "lucide-react";
import type { KLELayout } from "../lib/kle-types";
import { applyOps, type Op } from "../lib/ops-engine";
import { useI18n, LANG_LABELS } from "../lib/i18n";
import { computeLayoutBBoxInUnits } from "../lib/coordinate-system";
import { exportSVG } from "../lib/kle-export";
import { logger } from "../lib/error-logger";
import {
  layoutKey,
  newSessionId,
  sessionTitle,
  trimSession,
  windowHistory,
  type AiSession,
  type ChatMsg,
} from "../lib/ai-context";

const U_MM = 19.05;
const LS_BASE_URL = "kdt-ai-base-url";
const LS_MODEL = "kdt-ai-model";
const LS_API_KEY = "kdt-ai-api-key";
const LS_SESSIONS = "kdt-ai-sessions";
const LS_ACTIVE = "kdt-ai-active-session";
const LS_MSGS = "kdt-ai-msgs";

const BALL = 44;
const PANEL_W = 352;
const GAP = 12;

const iconBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  width: 24, height: 24, background: "none", border: "none",
  cursor: "pointer", color: "var(--theme-text-muted)", padding: 0,
};
const fieldStyle: React.CSSProperties = {
  fontSize: 12, padding: "3px 6px", background: "var(--theme-bg)",
  color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 3,
};

function summarize(layout: KLELayout): string {
  const keys = layout.keys;
  const real = keys.filter((k) => !k.d);
  const ys = new Set(real.map((k) => k.y));
  const bbox = computeLayoutBBoxInUnits(keys);
  const stabCount = real.filter((k) => Math.max(k.w, k.h) >= 2).length;
  const keyLines = keys.slice(0, 120).map((k, i) => {
    const label = k.labels.filter(Boolean)[0] || "·";
    let line = `#${i} "${label}" x=${k.x} y=${k.y} w=${k.w} h=${k.h}`;
    if ((k.w2 || 0) > 0 || (k.h2 || 0) > 0 || (k.x2 || 0) !== 0 || (k.y2 || 0) !== 0) {
      line += ` L2(x2=${k.x2} y2=${k.y2} w2=${k.w2} h2=${k.h2})`; // non-rectangular second segment (L-shaped key)
    }
    const rot = (k.r ?? 0) !== 0 ? ` r=${k.r} rx=${k.rx} ry=${k.ry}` : "";
    if (k.d) line += " [decal]";
    return line + rot;
  });
  return [
    `Layout "${layout.meta.name}" author "${layout.meta.author}"`,
    `Keys ${real.length} (decals ${keys.length - real.length}) rows≈${ys.size} keys>=2u: ${stabCount}`,
    `Size ${(bbox.maxX - bbox.minX).toFixed(1)}u x ${(bbox.maxY - bbox.minY).toFixed(1)}u = ${((bbox.maxX - bbox.minX) * U_MM).toFixed(0)}mm x ${((bbox.maxY - bbox.minY) * U_MM).toFixed(0)}mm`,
    `Key list (index | main label | x y w h | L2 = non-rectangular second segment | rotation):`,
    ...keyLines,
    keys.length > 120 ? `... ${keys.length - 120} more keys omitted` : "",
  ].filter(Boolean).join("\n");
}

const KEYBOARD_TERMS = `## TERMINOLOGY MAP (Chinese colloquial -> standard specs)
Users name keys with Chinese hobbyist terms. Understand these BEFORE editing. Chinese terms below are DATA (what the user says); specs are the ground truth you work with.

### Enter family (most confusing)
- 一字回车: ANSI horizontal Enter — one key, single row, w≈2.25u (1.5u~2u on compact rows), h=1.
- 7字回车 / 7回 / 反L回车 / 倒L回车 / ISO回车: ISO inverted-L Enter — ONE single key, h=2 (spans 2 rows), main segment ~1.25u wide, with a second segment (w2≈1.5, h2≈1, x2≈-0.25) forming a left shoulder on the top row. Encoding identical to the Enter key in the "ISO 105" / "ISO 60%" presets: {w:1.25,h:2,w2:1.5,h2:1,x2:-0.25} (x is row-relative in presets; in flat keys use read_layout coordinates). The tool fully supports this: set_prop accepts x2/y2/w2/h2 (see read_doc).
- 大回车: ambiguous umbrella term (usually means the ISO inverted-L Enter, sometimes a wide 2.25u+ horizontal Enter). Ask ONCE which one, with the ISO default.
- 大屁股回车: legacy AT-style big Enter, rare in modern customs.

### Modifiers & sizes
- 左Shift: ANSI 2.25u. ISO-UK style: 1.25u left Shift PLUS an extra 1u "|\\" key next to it (the extra ISO key lives on the Shift row, NOT beside the Enter). 右Shift is usually 2.75u (ANSI and ISO).
- 大键位: any key >=2u (space/shift/enter/backspace) that needs a stabilizer (卫星轴/平衡杆 — hardware, no geometry impact).
- 分裂空格 / split spacebar: bottom row split into 2-3 bars (e.g. 2.25+2.75+2.25 or 3+3) instead of one 6.25u/7u.
- 分裂退格 / split backspace: backspace split into two 1u keys.
- 分裂右Shift / split right shift: 2.75u split into e.g. 1.75u + 1u.
- 阶梯Caps / stepped Caps Lock: caps with stepped profile (KLE flag l:true).

### Boards & rest
- 方向键区 / nav cluster: arrow cluster bottom-right (inverted T) with Delete/End/PgDn above.
- Alice / Arisu: angled ergonomic alnum, two B positions, extra 1u on the right.
- ErgoDox / Lily58 / Corne: split column-stagger boards.
- 旋钮 / 编码器 / knob / rotary encoder: round dial — can only be represented as a key/decal position; no real encoder events.
- gasket 结构 / top mount / tray mount / o-ring: case mounting styles — NO effect on layout geometry. 热插拔 hotswap / 焊接 solder: switch type — NO geometry effect.
- Scale: 1u = 19.05mm.
Rule: if a term stays ambiguous after one check (e.g. 大回车), ask the user ONCE for row/column/width with a default option, then proceed. Do not guess silently.`;

const AI_QUICKREF = `KDT AI QUICK REFERENCE (built-in; read once at session start, or when unsure about capabilities)

MODEL OF THE LAYOUT
- The layout is a flat list of keys. The #N index shown by read_layout IS the index used in ops.
- A single key may carry a SECOND SEGMENT (x2, y2, w2, h2) that makes it non-rectangular:
  L-shaped / stepped keys. Editing (set_prop), SVG rendering, PCB and plate export all support it.
- Example — the ISO inverted-L "7-key" Enter is ONE key:
  main rect w=1.25 h=2, second segment w2=1.5 h2=1 x2=-0.25 (y2=0).
  This exact shape is used by the "ISO 105"/"ISO 60%" presets. To reproduce it on a real layout,
  first read_layout the target and its neighbors, then port the attributes onto the target key.

set_prop PROP LIST: x y w h x2 y2 w2 h2 r rx ry align labelSize f2 c t d g l n p sm sb st stab labels fa textSize textColor

OPS (applied in order; delete re-indexes immediately):
- set_label {"op","index","label"}   - set_prop {"op","index","prop","value"}
- move {"op","index","dx","dy"}      - place {"op","index","x","y"}
- delete {"op","index"}              - add_key {"op","x","y","w","h","label"}
- set_meta {"op","name","author","notes"}

WORKFLOW FOR CHANGING A KEY'S SHAPE (e.g. ANSI Enter -> ISO 7-key)
1. read_layout and inspect the target key AND its neighbors (what occupies the cells above/left).
2. An ISO Enter occupies TWO rows: its 1.25u vertical bar (h=2) plus a shoulder on the top row
   extending LEFT (the second segment w2=1.5 h2=1 x2=-0.25 area). The cells the shape needs must
   be free or belong to keys the user allows to move (a full ANSI->ISO conversion usually also
   moves the backslash key and shortens the left Shift to 1.25u + extra 1u "|\\" key).
3. If the user asked to touch NOTHING else and the required cells are occupied, do not silently
   edit other keys: explain in one line which cells are blocked (facts from read_layout) and ask
   permission ONCE with a default option.
4. Apply the change with edit_layout (batch related ops in one call), then export_svg to check
   the resulting bounding box/geometry.

GEOMETRY FACTS
- 1u = 19.05mm. Coordinates (x,y) are top-left, y grows downward.
- "7字回车" (ISO Enter) and "一字回车" (ANSI Enter) explanations are in the TERMINOLOGY section of your system prompt.`;

const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "read_layout",
      description:
        "Read the current layout state: summary + full key list with index/main label/x,y,w,h + L2 segment (x2/y2/w2/h2) for non-rectangular keys. MUST be called before any edit so indexes and coordinates come from real data, never from memory.",
      parameters: { type: "object" as const, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_doc",
      description:
        "Read the built-in English quick reference: layout model, supported set_prop properties (incl. x2/y2/w2/h2 L-shaped keys), ops syntax, and the workflow for shape changes such as ANSI->ISO Enter. Call it at session start or when unsure whether the tool supports something.",
      parameters: { type: "object" as const, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_layout",
      description:
        "Modify the layout. ops run in order; after a delete, indexes are re-indexed immediately. Supported op types: set_label, set_prop, move, place, delete, add_key, set_meta. set_prop accepts: x y w h x2 y2 w2 h2 r rx ry align labelSize f2 c t d g l n p sm sb st stab labels fa textSize textColor. The result reports how many ops applied and any errors.",
      parameters: {
        type: "object" as const,
        properties: {
          ops: {
            type: "array",
            description: "Ordered operation sequence. Example: [{op:'set_prop', index:69, prop:'w2', value:1.5}]",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["set_label", "set_prop", "move", "place", "delete", "add_key", "set_meta"] },
                index: { description: "Key index (number, or array of numbers for batch)" },
                prop: { type: "string", description: "Property name: x/y/w/h/x2/y2/w2/h2/r/rx/ry/align/labelSize/f2/c/t/d/g/l/n/p/sm/sb/st/stab/labels/fa/textSize/textColor" },
                value: { description: "Property value" },
                dx: { type: "number", description: "X offset" },
                dy: { type: "number", description: "Y offset" },
                x: { type: "number", description: "Absolute X (key units)" },
                y: { type: "number", description: "Absolute Y (key units)" },
                w: { type: "number", description: "Width (key units)" },
                h: { type: "number", description: "Height (key units)" },
                label: { type: "string", description: "Main label text" },
                name: { type: "string", description: "Layout name" },
                author: { type: "string", description: "Author" },
                notes: { type: "string", description: "Layout notes" },
              },
              required: ["op"],
            },
          },
        },
        required: ["ops"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_svg",
      description:
        "Export the current layout as an SVG visualization string (truncated). Use it AFTER edits to verify geometry (viewBox/size) before telling the user the change is done.",
      parameters: { type: "object" as const, properties: {} },
    },
  },
];

function freshSession(): AiSession {
  return { id: newSessionId(), title: "", msgs: [], createdAt: Date.now() };
}

function loadSessions(): AiSession[] {
  try {
    const raw = localStorage.getItem(LS_SESSIONS);
    if (raw) {
      const arr: unknown = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const ok = arr.filter((s): s is AiSession => !!s && typeof s === "object" && Array.isArray((s as AiSession).msgs));
        if (ok.length > 0) return ok;
      }
    }
    const old = localStorage.getItem(LS_MSGS);
    if (old) {
      const msgs: unknown = JSON.parse(old);
      if (Array.isArray(msgs) && msgs.length > 0) {
        const clean = msgs.filter((m): m is ChatMsg => !!m && typeof (m as ChatMsg).content === "string");
        const firstUser = clean.find((m) => m.role === "user");
        localStorage.removeItem(LS_MSGS);
        return [{ id: newSessionId(), title: sessionTitle(firstUser?.content ?? "") || "历史会话", msgs: trimSession(clean).msgs, createdAt: Date.now() }];
      }
      localStorage.removeItem(LS_MSGS);
    }
  } catch {
    logger.error("AI 会话数据损坏，已重建");
  }
  return [freshSession()];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

export default function AiFloatingPanel({ layout, onAiCommit }: { layout: KLELayout; onAiCommit: (l: KLELayout) => void }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    if (typeof window === "undefined") return { x: 16, y: 120 };
    return { x: 16, y: Math.max(16, Math.round(window.innerHeight / 2 - BALL / 2)) };
  });
  const [sessions, setSessions] = useState<AiSession[]>(loadSessions);
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem(LS_ACTIVE) ?? "");
  const [showList, setShowList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cleanedNote, setCleanedNote] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const layoutRef = useRef(layout);
  const dragRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const active = sessions.find((s) => s.id === activeId) ?? sessions[0];

  useEffect(() => {
    setBaseUrl(localStorage.getItem(LS_BASE_URL) ?? "https://api.deepseek.com/v1");
    setModel(localStorage.getItem(LS_MODEL) ?? "deepseek-chat");
    setApiKey(localStorage.getItem(LS_API_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;
    if (!sessions.some((s) => s.id === activeId)) setActiveId(sessions[0]!.id);
  }, [sessions, activeId]);

  useEffect(() => {
    localStorage.setItem(LS_SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeId) localStorage.setItem(LS_ACTIVE, activeId);
  }, [activeId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [sessions, activeId, loading]);

  const saveSettings = () => {
    localStorage.setItem(LS_BASE_URL, baseUrl);
    localStorage.setItem(LS_MODEL, model);
    localStorage.setItem(LS_API_KEY, apiKey);
    setShowSettings(false);
  };

  const commitMsgs = (id: string, msgs: ChatMsg[]) => {
    const r = trimSession(msgs);
    if (r.dropped > 0) setCleanedNote(true);
    setSessions((prev) => prev.map((s) => (s.id !== id ? s : { ...s, msgs: r.msgs })));
  };

  const execTool = useCallback((name: string, args: Record<string, unknown>): string => {
    const cur = layoutRef.current;
    if (name === "read_layout") return summarize(cur);
    if (name === "read_doc") return AI_QUICKREF;
    if (name === "export_svg") return exportSVG(cur, 2).slice(0, 2000) + "\n...(truncated)";
    if (name === "edit_layout") {
      const ops = args.ops as Op[] | undefined;
      if (!Array.isArray(ops)) return "Error: ops must be an array";
      const r = applyOps(cur, ops);
      if (r.layout !== cur) layoutRef.current = r.layout;
      const detail = ops.map((op, i) => `  ${i + 1}. ${JSON.stringify(op)}`).join("\n");
      const errLines = r.errors.length > 0 ? `\nErrors:\n${r.errors.map((e) => `  ${e}`).join("\n")}` : "";
      const fail = r.applied < ops.length ? "\nWARNING: some ops were NOT applied. Tell the user honestly which ones failed; do not claim full success." : "";
      return `Applied ${r.applied}/${ops.length} ops${errLines}${fail}\nOps:\n${detail}`;
    }
    return `Unknown tool: ${name}`;
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) { alert(t("ai.noKey")); return; }
    const sid = active?.id;
    if (!sid) return;
    // 与最新外部布局对齐（会话外的手动编辑/撤销也会反映到这里）；此后本轮工具
    // 循环只读写 layoutRef，渲染不覆盖 —— 修复多轮 edit_layout 修改被渲染重置的 bug
    layoutRef.current = layout;
    const baseline = layoutRef.current;
    // 撤销/手动编辑感知：布局指纹与上次 AI 提交时不符 → 通知模型此前修改可能已被回退
    const keyNow = layoutKey(layout);
    const layoutChanged = !!active?.lastLayoutKey && active.lastLayoutKey !== keyNow;
    setInput("");
    setLoading(true);
    setCleanedNote(false);
    const userMsg: ChatMsg = { role: "user", content: text };
    const base = active ? [...active.msgs, userMsg] : [userMsg];
    setSessions((prev) => prev.map((s) => (s.id !== sid ? s : { ...s, title: s.title || sessionTitle(text), msgs: trimSession(base).msgs })));
    const history: ChatMsg[] = base;

    try {
      const allMsgs: ChatMsg[] = [
        {
          role: "system",
          content: `## PERSONA
You are a senior custom keyboard engineer with 10+ years of experience in mechanical keyboard design, PCB layout, plate design, and QMK/VIA firmware. You work for KDT (Keyboard Dev Toolkit) as the AI layout assistant. You have deep knowledge of Cherry MX, Alps, Kailh, Gateron switches, stabilizer systems, keycap profiles, and keyboard ergonomics.

## PROJECT: WHAT IS KDT
KDT is a browser-based keyboard layout editor and PCB/plate generator. Users design keyboard layouts visually, then export production-ready files:
- Layout visualization (SVG) — the keycap rendering with labels
- PCB hole patterns (SVG + DXF) — switch holes, stabilizer holes, LED holes for PCB manufacturing
- Plate cutouts (SVG + DXF) — switch cutouts for plate manufacturing

The AI assistant (you) helps users design layouts through natural language. You control the layout via tools: read, edit, export. The user describes what they want, you implement it.

## USER INTENT PATTERNS
Users typically want to:
1. **Create a new layout** from scratch or from a preset ("帮我做一个 Alice 配列")
2. **Modify an existing layout** ("把空格键改成 7u", "在右边加一个旋钮")
3. **Fix layout issues** ("第二行最后一个键位置不对")
4. **Export for manufacturing** ("导出 PCB 图看看", "生成定位板")
5. **Understand the current layout** ("现在这个配列是什么规格？")

## INTERACTION WORKFLOW
1. Read the ground truth FIRST: call read_layout before any edit or any claim about the layout. Call read_doc once at session start so you know exactly what the tools can and cannot do.
2. Plan the ops yourself. Geometry and shape decisions are YOUR job as the expert — never delegate them to the user.
3. Implement with edit_layout (batch related ops into one call).
4. Verify with export_svg (geometry/bbox) before telling the user anything is done.
5. Report concisely; iterate on user feedback.

## CONFIRMATION POLICY (HARD)
- The default is ACT: for any unambiguous request, execute immediately.
- Ask the user ONLY about facts you cannot derive from read_layout or the docs: e.g. which key an ambiguous colloquial term (大回车) points to, or whether keys OTHER than the named one may be moved. Never ask "which shape/width should I use" — that is your decision.
- Ask at most ONE clarifying question per user turn, and always attach a default option. Never re-ask a question that was already answered; never open new sub-questions while an earlier one is pending. If the change is reversible (undo) and a sensible default exists, pick the default and proceed.
- "Is it a major change?" is NOT a reason to ask. Whether the user allows touching other keys IS.

## TOOL DISCIPLINE (HARD REQUIREMENTS)
- Key indexes (#N) may ONLY come from the most RECENT read_layout output. Never guess an index, never reuse an index from earlier in the conversation if the layout may have changed, and never describe a key that is not present in the read_layout listing.
- A key has NO rotation unless read_layout shows " r=… rx=… ry=…" for it, and NO second segment unless it shows "L2(…)". Do not claim attributes the listing does not show.
- If a requested key does not exist in read_layout, say so clearly and stop; do not silently edit a different key.
- After every edit_layout call, read the result carefully. If it reports "Applied X/N" with X < N or an Errors list, the modification FAILED partially — tell the user honestly which ops failed. Never claim success when the tool reported failures.
- Never fabricate tool executions. If you did not call a tool, do not say you did. Every "done / changed / exported" claim must trace to an actual tool result in this session.

## CAPABILITY FACTS (read before ever claiming something is impossible)
- A single key CAN be non-rectangular: keys carry an optional second segment x2/y2/w2/h2 (L-shaped / stepped keys). set_prop supports these properties, and rendering, PCB and plate export all handle them (see read_doc).
- The ISO inverted-L "7字回车" (ISO Enter) is ONE such key — e.g. w=1.25 h=2 with w2=1.5 h2=1 x2=-0.25 — the exact attribute set used by the ISO 105 / ISO 60% presets. A 7字回车 is therefore always expressible as a single-key attribute change; it is NEVER a reason to say "the tool cannot draw that".
- Any claim that the tool cannot do something must cite evidence: a tool result from this session, read_doc content, or project source (e.g. src/lib/ops-engine.ts, src/lib/kle-types.ts). Without evidence, do not make the claim.
- Prefer copying a known-good template over inventing geometry: to shape a key like the preset ISO Enter, mirror the preset's attribute set onto the target key, then adjust absolute coordinates from read_layout.

## FEW-SHOT EXAMPLES

### Example 1: User creates a new 65% layout
User: "帮我做一个 65% 配列"
Assistant: I'll create a 65% layout based on the ANSI standard. Here's my plan:
- 5 rows: Function row (partial), Number row, QWERTY, Home row, Bottom row
- Arrow keys in bottom-right inverted-T
- Nav cluster: Delete, End, PgDn
- Total ~67 keys

[executes edit_layout with batch operations]
[exports SVG for preview]

### Example 2: User modifies spacebar
User: "把空格键改成 7u"
Assistant: [reads layout, finds spacebar index]
[executes edit_layout: set_prop spacebar w=7, adjusts adjacent keys]

### Example 3: User asks about current layout
User: "现在这个配列是什么规格？"
Assistant: [reads layout, provides summary: form factor, key count, dimensions, notable features]

### Example 4: ANSI Enter → ISO 7-key (7字回车)
User: "把回车改成 7 字回车，其他键都保持不变"
Assistant: [read_layout → locate Enter #69 (e.g. w=2.25 h=1 at x=12.75 y=3.5) and inspect the cells the ISO L-shape needs: a 1.25u/2-row vertical bar plus a left shoulder on the row above (second segment w2=1.5 h2=1 x2=-0.25)]
[If needed cells are occupied by keys the user forbade moving: ask ONE question with a default, e.g. "ISO 回车需要占据 #70 所在格，需要把 #70 下移/删除，可以吗？默认：下移"] 
[executes edit_layout: set_prop on #69 (w/h/x2/w2/h2) and any permitted neighbor changes]
[export_svg → verify geometry → short report "#69 Enter: props … → …; other keys affected: none/#70 moved"]

## LANGUAGE RULE (HARD)
1. Reply in the SAME language the user used in their latest message (Chinese user message → reply in Chinese; English → English; Japanese → Japanese…). Match the user, not your preferences.
2. If the user's language is unclear or a message mixes languages, use the app UI language ${LANG_LABELS[lang]} (${lang}).
3. Technical terms (key names, units, layout names) may stay in their canonical form; all explanation prose follows rule 1/2. No exceptions.

## COMMUNICATION STYLE
- Be concise. No preamble, no "Sure!", no "Of course!". Get straight to the point.
- Use bullet points and numbered lists for clarity.
- When explaining layout choices, give brief technical reasoning (e.g., "6.25u spacebar for standard cherry stabilizer compatibility").
- Do NOT explain basic keyboard concepts unless the user explicitly asks.
- Do NOT repeat information already provided in the conversation.
- Use industry terminology naturally (1u, stagger, ortho, hotswap, plate cutout, etc.).

${KEYBOARD_TERMS}

## DOMAIN KNOWLEDGE

### Key Units & Sizes
1u = 19.05mm (Cherry MX standard). Common modifier sizes:
- 1.25u: Ctrl, Alt, Win (standard bottom row)
- 1.5u: Tab, backslash
- 1.75u: Caps Lock
- 2u: Backspace (some), Shift (ISO)
- 2.25u: Left Shift, Enter
- 2.75u: Right Shift
- 6.25u: Standard spacebar (most common)
- 7u: Wider spacebar (custom layouts)

### Standard Form Factors
- 60% (61 keys): Poker, Anne Pro. No F-row, no nav, no numpad.
- 65% (66-68 keys): 60% + nav cluster + arrows. Tada68, Keycool 84.
- 75% (84 keys): 65% + F-row (compact). Vortex Race 3.
- TKL (87 keys): F-row + nav, no numpad. FC750R.
- Full-size ANSI (104): standard with numpad.
- Full-size ISO (105): European L-enter, shorter left Shift.
- Ortholinear: grid-aligned (no stagger). Planck, Preonic.
- Split: separated halves. ErgoDox, Lily58, Corne.
- Column-stagger: vertical stagger following finger curvature.
- Alice/Arisu: angled alphanumeric sections, ergonomic stagger.

### Layout Variants
- ANSI: horizontal Backspace, horizontal Enter (一字回车), left Shift 2.25u
- ISO: inverted-L Enter (7字回车), left Shift 1.25u + extra 1u "|\\" key beside it
- JIS: extra keys near spacebar

### Switches & Stabilizers
- Cherry MX: 3/5-pin, 14mm plate cutout
- Alps: 13.8mm cutout
- Stabilizers: Cherry (wire+housing), Costar (wire clip), Fuling (magnetic)
- Plate types: MX, Alps, MX+Alps combo

### PCB Design
- Hotswap: Kailh/Gateron sockets, tool-free swap
- Solder: permanent mounting
- THT: through-hole pin holes
- LED: per-key square cutout
- MCU: Pro Micro, nRF52832, RP2040
- Connectors: Type-C USB, 4-pin JST (split halves)

### Rotation Clusters (Split Keyboards)
Keys rotated around pivot (rx, ry) by angle (r). Used for thumb clusters on ErgoDox, Lily58, etc. Example: 5 keys rotated 10° around (6, 4.5).

## KDT TOOL CAPABILITIES

### What KDT Does
- Visual layout editor (KLE-compatible format)
- PCB hole pattern: SVG + DXF (free tier)
- Plate cutout: SVG + DXF (free tier)
- QMK/KiCad/STP: Pro tier (not available in AI tools)

### Coordinate System
- Origin: top-left
- X: rightward (positive), Y: downward (positive)
- Key (x, y) = top-left corner
- Rotation: degrees, clockwise, around (rx, ry)

### Available Operations (edit_layout ops)
- set_label: {"op":"set_label","index":0,"label":"Esc"}
- set_prop: {"op":"set_prop","index":[0,1],"prop":"w","value":1.5}
- move: {"op":"move","index":0,"dx":1,"dy":0}
- delete: {"op":"delete","index":[5]}
- add_key: {"op":"add_key","x":0,"y":10,"w":6.25,"label":"Space"}
- place: {"op":"place","index":0,"x":2,"y":0.25}
- set_meta: {"op":"set_meta","name":"My KB","author":"Designer","notes":"三模"}
- Note: set_prop also accepts x2/y2/w2/h2 for non-rectangular (L-shaped) keys, plus align/labelSize/f2/c/t/d/g/l/n/p/sm/sb/st/stab/fa/textSize/textColor. Full list in read_doc.

### Common Design Patterns
- Bottom row: Ctrl(1.25) Win(1.25) Alt(1.25) Space(6.25) Alt(1.25) Win(1.25) Menu(1.25) Ctrl(1.25)
- Stagger: Q row +0.25u, A row +0.5u, Z row +0.75u from left edge
- Arrows: inverted-T, bottom right
- Nav cluster: Insert/Home/PgUp top row, Delete/End/PgDn bottom row

## TASK DECOMPOSITION (for complex designs)
1. read_layout → understand current state
2. Plan the layout on paper (mental model)
3. edit_layout → apply changes in logical groups:
   a. First: delete unwanted keys
   b. Then: add new keys with correct positions
   c. Finally: adjust labels and properties
4. export_svg → verify the result visually
5. Iterate if needed

## CURRENT LAYOUT
${summarize(layoutRef.current)}

## NEGATIVE INSTRUCTIONS (DO NOT)
- Do NOT output raw JSON unless the user asks for it
- Do NOT explain what "1u" or "stagger" means unless asked
- Do NOT add unnecessary commentary before/after operations
- Do NOT suggest Pro features (QMK export, KiCad, STP) — these are not available
- Do NOT create layouts with overlapping keys (check x/y/w/h and x2/y2/w2/h2 carefully)
- Do NOT use fractional positions that don't align to 0.25u grid unless necessary
- Do NOT ask for confirmation when the request is unambiguous — act
- Do NOT delegate shape/width/geometry decisions to the user
- Do NOT claim the tool cannot do something without citing evidence (see CAPABILITY FACTS)
- Do NOT write long analytical monologues before doing the work; if you need to explain, keep it under 5 lines and act in the same reply`,
        },
        ...(layoutChanged
          ? [{
              role: "system" as const,
              content: `## LAYOUT CHANGED SINCE YOUR LAST EDIT
The layout fingerprint differs from what you last committed in this session — the user has edited the layout manually or pressed Ctrl+Z to undo (possibly reverting YOUR previous edits). Anything you claimed earlier may no longer exist. Start by calling read_layout to see the ACTUAL current state, and never assert that a previous edit is still applied until you have verified it.`,
            }]
          : []),
        ...windowHistory(history),
      ];

      let loopCount = 0;
      while (loopCount < 10) {
        loopCount++;
        const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: allMsgs, tools: TOOL_DEFS, tool_choice: "auto" }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
        const data = await resp.json();
        const choice = data.choices?.[0];
        if (!choice) throw new Error("无响应");

        const assistantMsg = choice.message;
        if (assistantMsg.tool_calls?.length) {
          allMsgs.push({ role: "assistant", content: assistantMsg.content ?? "", tool_calls: assistantMsg.tool_calls });
          const toolResults: string[] = [];
          for (const tc of assistantMsg.tool_calls) {
            const args = typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
            const result = execTool(tc.function.name, args);
            toolResults.push(`[${tc.function.name}] ${result}`);
            allMsgs.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
          commitMsgs(sid, [...history, { role: "assistant", content: toolResults.join("\n\n") }]);
        } else {
          allMsgs.push({ role: "assistant", content: assistantMsg.content ?? "" });
          commitMsgs(sid, [...history, { role: "assistant", content: assistantMsg.content ?? "" }]);
          break;
        }
      }
    } catch (e) {
      commitMsgs(sid, [...history, { role: "assistant", content: `${t("ai.error")}: ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
      if (layoutRef.current !== baseline) {
        onAiCommit(layoutRef.current);
        // 记录本轮提交后布局指纹：下次对话时若用户撤销/改动，指纹比对即可感知
        const committedKey = layoutKey(layoutRef.current);
        setSessions((prev) => prev.map((s) => (s.id !== sid ? s : { ...s, lastLayoutKey: committedKey })));
      }
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearContext = () => {
    if (!active || active.msgs.length === 0) return;
    if (!window.confirm(t("ai.confirmClear"))) return;
    setCleanedNote(false);
    setSessions((prev) => prev.map((s) => (s.id !== active.id ? s : { ...s, msgs: [] })));
  };

  const deleteSession = (id: string) => {
    if (!window.confirm(t("ai.confirmDelete"))) return;
    const next = sessions.filter((s) => s.id !== id);
    if (next.length === 0) {
      const n = freshSession();
      setSessions([n]);
      setActiveId(n.id);
    } else {
      setSessions(next);
      if (id === activeId) setActiveId(next[0]!.id);
    }
  };

  const newChat = () => {
    const cur = sessions.find((s) => s.id === activeId);
    if (cur && cur.msgs.length === 0) return;
    const n = freshSession();
    setSessions((prev) => [...prev, n]);
    setActiveId(n.id);
    setCleanedNote(false);
    setShowList(false);
  };

  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyMsg = async (content: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(content);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      setCopiedIdx(idx);
      copyTimer.current = setTimeout(() => setCopiedIdx(null), 1200);
    } catch {
      logger.error("AI 消息复制失败（剪贴板不可用）");
    }
  };

  const ballOnDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const ballOnMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
    if (d.moved) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({
        x: clamp(d.ox + dx, 8, Math.max(8, vw - BALL - 8)),
        y: clamp(d.oy + dy, 8, Math.max(8, vh - BALL - 8)),
      });
    }
  };
  const ballOnUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    dragRef.current = null;
    if (!d.moved) setOpen((o) => !o);
  };

  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const PANEL_H = Math.min(560, vh - 24);
  const flipLeft = pos.x + BALL / 2 > vw / 2;
  const panelLeft = clamp(flipLeft ? pos.x - PANEL_W - GAP : pos.x + BALL + GAP, 8, Math.max(8, vw - PANEL_W - 8));
  const panelTop = clamp(pos.y + BALL / 2 - PANEL_H / 2, 12, Math.max(12, vh - PANEL_H - 12));

  const msgs = active?.msgs ?? [];
  const panelBody: React.CSSProperties = {
    display: "flex", flexDirection: "column", height: PANEL_H,
    fontSize: 13, background: "var(--theme-bg)", color: "var(--theme-text)",
    border: "1px solid var(--theme-border)", borderRadius: 10,
    boxShadow: "0 8px 28px rgba(0,0,0,0.25)", overflow: "hidden",
  };

  return (
    <>
      {open && (
        <div style={{ position: "fixed", left: panelLeft, top: panelTop, width: PANEL_W, zIndex: 9999 }}>
          <div style={panelBody}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 8px", borderBottom: "1px solid var(--theme-border)" }}>
              <button onClick={() => setShowList((v) => !v)} title={t("ai.history")} style={{ ...iconBtn, color: showList ? "var(--theme-accent)" : "var(--theme-text-muted)" }}>
                <History size={14} />
              </button>
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                {active && active.title ? active.title : t("ai.untitled")}
              </span>
              <button onClick={clearContext} title={t("ai.clearContext")} style={iconBtn}>
                <Eraser size={14} />
              </button>
              <button onClick={newChat} title={t("ai.newChat")} style={iconBtn}>
                <Plus size={14} />
              </button>
              <button onClick={() => setShowSettings((v) => !v)} title={t("ai.settings")} style={{ ...iconBtn, color: showSettings ? "var(--theme-accent)" : "var(--theme-text-muted)" }}>
                <Settings size={14} />
              </button>
              <button onClick={() => setOpen(false)} title={t("ai.collapse")} style={iconBtn}>
                <X size={14} />
              </button>
            </div>

            {showList && (
              <div style={{ borderBottom: "1px solid var(--theme-border)", maxHeight: 180, overflowY: "auto", padding: "4px 6px" }}>
                {sessions.length === 0 && <div style={{ fontSize: 12, color: "var(--theme-text-muted)", padding: 6 }}>{t("ai.noSessions")}</div>}
                {sessions.map((s) => (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 4px", borderRadius: 6, cursor: "pointer", background: s.id === activeId ? "var(--theme-accent-soft, rgba(59,130,246,0.12))" : "transparent" }}
                    onClick={() => { setActiveId(s.id); setShowList(false); setCleanedNote(false); }}>
                    <MessageSquare size={12} style={{ flexShrink: 0, color: "var(--theme-text-muted)" }} />
                    <span style={{ flex: 1, fontSize: 12, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{s.title || t("ai.untitled")}</span>
                    <span style={{ fontSize: 11, color: "var(--theme-text-muted)", flexShrink: 0 }}>{s.msgs.length}</span>
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} title={t("ai.delete")} style={iconBtn}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showSettings && (
              <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--theme-border)", display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.baseUrl")}</label>
                <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={fieldStyle} />
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.model")}</label>
                <input value={model} onChange={(e) => setModel(e.target.value)} style={fieldStyle} />
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.apiKey")}</label>
                <div style={{ display: "flex", gap: 4 }}>
                  <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ ...fieldStyle, flex: 1 }} />
                  <button onClick={() => setShowKey((v) => !v)} style={iconBtn}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                </div>
                <button onClick={saveSettings} style={{ marginTop: 2, padding: "4px 8px", background: "var(--theme-accent)", color: "white", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>
                  {t("ai.save")}
                </button>
              </div>
            )}

            <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
              {cleanedNote && (
                <div style={{ textAlign: "center", color: "var(--theme-text-muted)", fontSize: 11, padding: "2px 0 6px" }}>
                  {t("ai.cleaned")}
                </div>
              )}
              {msgs.length === 0 && !loading && (
                <div style={{ textAlign: "center", color: "var(--theme-text-muted)", padding: 24, fontSize: 12 }}>
                  <Bot size={28} style={{ opacity: 0.3, marginBottom: 8, margin: "0 auto 8px" }} />
                  <div>{t("ai.placeholder")}</div>
                </div>
              )}
              {msgs.map((m, i) => {
                const isToolBlock = m.role === "assistant" && m.content.startsWith("[");
                const body = isToolBlock ? (
                  <div style={{ padding: "3px 2px", borderBottom: "1px solid var(--theme-border-subtle, transparent)" }}>
                    {m.content.split(/\n(?=\[)/).map((block, j) => {
                      const firstLine = block.split("\n")[0]!;
                      const rest = block.split("\n").slice(1).join("\n");
                      return (
                        <details key={j} style={{ marginBottom: 4 }}>
                          <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--theme-text-muted)", userSelect: "none" }}>{firstLine}</summary>
                          <pre style={{ margin: "4px 0 0 0", padding: "6px 8px", background: "var(--theme-bg-alt, rgba(0,0,0,0.03))", borderRadius: 4, fontSize: 11, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--theme-text)" }}>{rest}</pre>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: "4px 2px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: m.role === "user" ? "var(--theme-accent-soft, rgba(59,130,246,0.08))" : "transparent",
                    borderBottom: "1px solid var(--theme-border-subtle, transparent)",
                    borderRadius: 6, color: "var(--theme-text)", fontSize: 12, lineHeight: 1.5 }}>
                    {m.content}
                  </div>
                );
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
                    <button onClick={() => copyMsg(m.content, i)} title={t("ai.copy")}
                      style={{ ...iconBtn, width: 18, height: 18, marginTop: 4, opacity: 0.45, flexShrink: 0 }}>
                      {copiedIdx === i ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                );
              })}
              {loading && <div style={{ color: "var(--theme-text-muted)", fontSize: 12, padding: "6px 2px" }}>{t("ai.thinking")}</div>}
            </div>

            <div style={{ display: "flex", gap: 4, padding: "6px 8px", borderTop: "1px solid var(--theme-border)" }}>
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                placeholder={t("ai.placeholder")} rows={2}
                style={{ flex: 1, fontSize: 12, padding: "4px 6px", resize: "none", background: "var(--theme-bg)", color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 6, outline: "none" }} />
              <button onClick={send} disabled={loading}
                style={{ padding: "4px 10px", background: "var(--theme-accent)", color: "var(--theme-on-accent, white)", border: "none", borderRadius: 6, cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1, alignSelf: "flex-end" }}>
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onPointerDown={ballOnDown}
        onPointerMove={ballOnMove}
        onPointerUp={ballOnUp}
        onPointerCancel={() => { dragRef.current = null; }}
        title={open ? t("ai.collapse") : t("tb.tab.ai")}
        style={{
          position: "fixed", left: pos.x, top: pos.y, width: BALL, height: BALL, zIndex: 9999,
          borderRadius: "50%", cursor: "grab", touchAction: "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--theme-accent)", color: "var(--theme-on-accent, white)",
          border: "none", boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
        }}
      >
        <Bot size={22} />
      </button>
    </>
  );
}

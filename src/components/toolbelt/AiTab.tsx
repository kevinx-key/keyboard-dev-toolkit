"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Settings, Send, Eye, EyeOff, Bot } from "lucide-react";
import type { KeyProps, KLEMeta, KLELayout } from "../../lib";
import { DEFAULT_PROPS } from "../../lib";
import { useI18n, LANG_LABELS } from "../../lib/i18n";
import { computeLayoutBBoxInUnits } from "../../lib/coordinate-system";
import { exportSVG } from "../../lib/kle-export";

const U_MM = 19.05;
const LS_BASE_URL = "kdt-ai-base-url";
const LS_MODEL = "kdt-ai-model";
const LS_API_KEY = "kdt-ai-api-key";
const LS_MSGS = "kdt-ai-msgs";

interface AiTabProps {
  layout: KLELayout;
  onSetMeta: (meta: Partial<KLEMeta>) => void;
  onLoadLayout: (layout: KLELayout) => void;
}

interface Msg {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

function summarize(layout: KLELayout): string {
  const keys = layout.keys;
  const real = keys.filter((k) => !k.d);
  const ys = new Set(real.map((k) => k.y));
  const bbox = computeLayoutBBoxInUnits(keys);
  const stabCount = real.filter((k) => Math.max(k.w, k.h) >= 2).length;
  return [
    `布局 "${layout.meta.name}" 作者 "${layout.meta.author}"`,
    `键数 ${real.length}（装饰 ${keys.length - real.length}）行≈${ys.size} 定位键≥2u: ${stabCount}`,
    `尺寸 ${(bbox.maxX - bbox.minX).toFixed(1)}u × ${(bbox.maxY - bbox.minY).toFixed(1)}u = ${((bbox.maxX - bbox.minX) * U_MM).toFixed(0)}mm × ${((bbox.maxY - bbox.minY) * U_MM).toFixed(0)}mm`,
    `键列表（索引/标签/坐标/尺寸）：`,
    ...keys.slice(0, 120).map((k, i) => {
      const label = k.labels.filter(Boolean)[0] || "·";
      return `#${i} "${label}" x=${k.x} y=${k.y} ${k.w}x${k.h}${k.d ? " [decal]" : ""}`;
    }),
    keys.length > 120 ? `… 其余 ${keys.length - 120} 键` : "",
  ].filter(Boolean).join("\n");
}

const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "read_layout",
      description: "读取当前键盘配列的完整状态（摘要+键位列表）",
      parameters: { type: "object" as const, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "edit_layout",
      description: "修改当前键盘配列。ops 数组按顺序执行，delete 后索引重排。",
      parameters: {
        type: "object" as const,
        properties: {
          ops: {
            type: "array",
            description: "操作序列",
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["set_label", "set_prop", "move", "delete", "add_key", "set_meta"] },
                index: { description: "键索引（数字或数组，all=全部）" },
                prop: { type: "string", description: "属性名（x/y/w/h/r/rx/ry/c/t/d/g/l/n/p 等）" },
                value: { description: "属性值" },
                dx: { type: "number", description: "X 平移量" },
                dy: { type: "number", description: "Y 平移量" },
                x: { type: "number", description: "目标 X 坐标" },
                y: { type: "number", description: "目标 Y 坐标" },
                w: { type: "number", description: "宽度（键单位）" },
                h: { type: "number", description: "高度（键单位）" },
                label: { type: "string", description: "主标签文字" },
                name: { type: "string", description: "布局名称" },
                author: { type: "string", description: "作者" },
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
      description: "导出当前配列的 SVG 可视化图（返回 SVG 字符串供预览）",
      parameters: { type: "object" as const, properties: {} },
    },
  },
];

export function AiTab({ layout, onSetMeta, onLoadLayout }: AiTabProps) {
  const { t, lang } = useI18n();
  const [showSettings, setShowSettings] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const saved = localStorage.getItem(LS_MSGS);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  useEffect(() => {
    setBaseUrl(localStorage.getItem(LS_BASE_URL) ?? "https://api.deepseek.com/v1");
    setModel(localStorage.getItem(LS_MODEL) ?? "deepseek-chat");
    setApiKey(localStorage.getItem(LS_API_KEY) ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_MSGS, JSON.stringify(msgs));
  }, [msgs]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  const saveSettings = () => {
    localStorage.setItem(LS_BASE_URL, baseUrl);
    localStorage.setItem(LS_MODEL, model);
    localStorage.setItem(LS_API_KEY, apiKey);
    setShowSettings(false);
  };

  const execTool = useCallback((name: string, args: Record<string, unknown>): string => {
    const cur = layoutRef.current;
    if (name === "read_layout") return summarize(cur);
    if (name === "export_svg") return exportSVG(cur, 2).slice(0, 2000) + "\n…(截断)";
    if (name === "edit_layout") {
      const ops = args.ops as Array<Record<string, unknown>>;
      if (!Array.isArray(ops)) return "错误: ops 必须是数组";
      let keys = cur.keys.map((k) => ({ ...k, labels: [...k.labels] }));
      const errors: string[] = [];
      let applied = 0;
      for (const op of ops) {
        try {
          switch (op.op) {
            case "set_label": {
              const idx = Number(op.index);
              if (idx < 0 || idx >= keys.length) throw new Error(`索引 ${idx} 越界`);
              keys[idx]!.labels[0] = String(op.label ?? "");
              break;
            }
            case "set_prop": {
              const ids = Array.isArray(op.index) ? op.index.map(Number) : [Number(op.index)];
              for (const id of ids) {
                if (id < 0 || id >= keys.length) throw new Error(`索引 ${id} 越界`);
                keys[id] = { ...keys[id]!, [op.prop as string]: op.value };
              }
              break;
            }
            case "move": {
              const ids = Array.isArray(op.index) ? op.index.map(Number) : [Number(op.index)];
              const dx = Number(op.dx ?? 0);
              const dy = Number(op.dy ?? 0);
              for (const id of ids) {
                if (id < 0 || id >= keys.length) throw new Error(`索引 ${id} 越界`);
                keys[id] = { ...keys[id]!, x: Math.round((keys[id]!.x + dx) * 100) / 100, y: Math.round((keys[id]!.y + dy) * 100) / 100 };
              }
              break;
            }
            case "delete": {
              const ids = (Array.isArray(op.index) ? op.index.map(Number) : [Number(op.index)]).sort((a, b) => b - a);
              for (const id of ids) {
                if (id < 0 || id >= keys.length) throw new Error(`索引 ${id} 越界`);
                keys.splice(id, 1);
              }
              break;
            }
            case "add_key": {
              keys.push({
                ...DEFAULT_PROPS,
                x: Number(op.x ?? 0),
                y: Number(op.y ?? 0),
                w: Number(op.w ?? 1),
                h: Number(op.h ?? 1),
                labels: [String(op.label ?? ""), "", "", "", "", "", "", "", "", "", "", ""],
              } as never);
              break;
            }
            case "set_meta": {
              const meta: Record<string, string> = {};
              if (op.name !== undefined) meta.name = String(op.name);
              if (op.author !== undefined) meta.author = String(op.author);
              onSetMeta(meta as Partial<KLEMeta>);
              break;
            }
            default:
              throw new Error(`未知操作: ${op.op}`);
          }
          applied++;
        } catch (e) {
          errors.push(`${op.op}: ${(e as Error).message}`);
        }
      }
      const newLayout = { ...cur, keys: keys as KeyProps[], _sourceCache: undefined };
      onLoadLayout(newLayout);
      layoutRef.current = newLayout;
      const detail = ops.map((op, i) => `  ${i + 1}. ${JSON.stringify(op)}`).join("\n");
      return `已应用 ${applied}/${ops.length} 条操作\n操作详情:\n${detail}`;
    }
    return `未知工具: ${name}`;
  }, [onSetMeta, onLoadLayout]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    if (!apiKey) { alert(t("ai.noKey")); return; }
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    const history = [...msgs, userMsg];
    setMsgs([...history, { role: "assistant", content: t("ai.thinking") }]);
    setLoading(true);

    try {
      const allMsgs: Msg[] = [
        { role: "system", content: `## PERSONA
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
1. User describes their goal (in natural language)
2. You analyze the request and plan the approach
3. You use read_layout to understand the current state (if layout exists)
4. You use edit_layout to implement changes (batch related ops together)
5. You use export_svg to show the result
6. User reviews and gives feedback
7. You iterate until satisfied

**Always confirm your understanding before making major changes.** For complex layouts, explain your plan first, then execute.

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

## LANGUAGE RULE
ALWAYS respond in ${LANG_LABELS[lang]} (${lang}). All explanations, reasoning, and messages must be in this language. This is a hard requirement — no exceptions.

## COMMUNICATION STYLE
- Be concise. No preamble, no "Sure!", no "Of course!". Get straight to the point.
- Use bullet points and numbered lists for clarity.
- When explaining layout choices, give brief technical reasoning (e.g., "6.25u spacebar for standard cherry stabilizer compatibility").
- Do NOT explain basic keyboard concepts unless the user explicitly asks.
- Do NOT repeat information already provided in the conversation.
- Use industry terminology naturally (1u, stagger, ortho, hotswap, plate cutout, etc.).

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
- ANSI: horizontal Backspace, horizontal Enter
- ISO: L-shaped Enter, shorter left Shift (2.25u → 1.25u)
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
- set_meta: {"op":"set_meta","name":"My KB","author":"Designer"}

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
- Do NOT create layouts with overlapping keys (check x/y/w/h carefully)
- Do NOT use fractional positions that don't align to 0.25u grid unless necessary
- Do NOT make major changes without confirming with the user first` },
        ...history,
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
          setMsgs([...history, { role: "assistant", content: toolResults.join("\n\n") }]);
        } else {
          allMsgs.push({ role: "assistant", content: assistantMsg.content ?? "" });
          setMsgs([...history, { role: "assistant", content: assistantMsg.content ?? "" }]);
          break;
        }
      }
    } catch (e) {
      setMsgs([...history, { role: "assistant", content: `${t("ai.error")}: ${(e as Error).message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontSize: 13 }}>
      {/* Settings toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--theme-border)" }}>
        <span style={{ fontWeight: 600 }}>{t("tb.tab.ai")}</span>
        <button onClick={() => setShowSettings(!showSettings)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)" }}>
          <Settings size={14} />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ padding: "6px 0", borderBottom: "1px solid var(--theme-border)", display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.baseUrl")}</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={{ fontSize: 12, padding: "3px 6px", background: "var(--theme-bg)", color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 3 }} />
          <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.model")}</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} style={{ fontSize: 12, padding: "3px 6px", background: "var(--theme-bg)", color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 3 }} />
          <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("ai.apiKey")}</label>
          <div style={{ display: "flex", gap: 4 }}>
            <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "3px 6px", background: "var(--theme-bg)", color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 3 }} />
            <button onClick={() => setShowKey(!showKey)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)" }}>{showKey ? <EyeOff size={14} /> : <Eye size={14} />}</button>
          </div>
          <button onClick={saveSettings} style={{ marginTop: 2, padding: "4px 8px", background: "var(--theme-success, #4caf50)", color: "#fff", border: "none", borderRadius: 3, cursor: "pointer", fontSize: 12 }}>{t("ai.save")}</button>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "6px 0" }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--theme-text-muted)", padding: 20, fontSize: 12 }}>
            <Bot size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>{t("ai.placeholder")}</div>
          </div>
        )}
        {msgs.map((m, i) => {
          const isToolResult = m.role === "assistant" && m.content.startsWith("[");
          if (isToolResult) {
            const blocks = m.content.split(/\n(?=\[)/);
            return (
              <div key={i} style={{ padding: "4px 8px", borderBottom: "1px solid var(--theme-border-subtle, transparent)" }}>
                {blocks.map((block, j) => {
                  const firstLine = block.split("\n")[0];
                  const rest = block.split("\n").slice(1).join("\n");
                  return (
                    <details key={j} style={{ marginBottom: 4 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--theme-text-muted)", userSelect: "none" }}>
                        {firstLine}
                      </summary>
                      <pre style={{ margin: "4px 0 0 0", padding: "6px 8px", background: "var(--theme-bg-alt, rgba(0,0,0,0.03))", borderRadius: 4, fontSize: 11, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {rest}
                      </pre>
                    </details>
                  );
                })}
              </div>
            );
          }
          return (
            <div key={i} style={{ padding: "4px 8px", whiteSpace: "pre-wrap", wordBreak: "break-word",
              background: m.role === "user" ? "var(--theme-accent-soft, rgba(59,130,246,0.08))" : "transparent",
              borderBottom: "1px solid var(--theme-border-subtle, transparent)",
              color: "var(--theme-text)", fontSize: 12, lineHeight: 1.5 }}>
              {m.content}
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: 4, padding: "4px 0", borderTop: "1px solid var(--theme-border)" }}>
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
          placeholder={t("ai.placeholder")} rows={2}
          style={{ flex: 1, fontSize: 12, padding: "4px 6px", resize: "none", background: "var(--theme-bg)", color: "var(--theme-text)", border: "1px solid var(--theme-border)", borderRadius: 3 }} />
        <button onClick={send} disabled={loading}
          style={{ padding: "4px 8px", background: "var(--theme-accent, #3b82f6)", color: "#fff", border: "none", borderRadius: 3, cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1, alignSelf: "flex-end" }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

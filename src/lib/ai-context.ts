/**
 * AI 面板会话数据模型与上下文窗口纯函数。
 * 无 React / DOM 依赖，便于单元测试与跨端复用。
 */

import type { KLELayout } from "./kle-types";

export type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
};

export interface AiSession {
  id: string;
  title: string;
  msgs: ChatMsg[];
  createdAt: number;
  /** 上次 AI 提交后布局的指纹。用户 Ctrl+Z 撤销 AI 修改或手动改动后，指纹会与当前布局不一致。 */
  lastLayoutKey?: string;
}

/** 单会话保存的消息上限（超出自动丢最旧，防 localStorage 膨胀与上下文垃圾） */
export const MAX_SESSION_MSGS = 40;
/** 发送给模型时保留的最近用户轮次数（每轮含其后的 assistant/tool 回复） */
export const CONTEXT_USER_TURNS = 12;
/** 会话标题默认截断长度 */
const TITLE_MAX = 24;

export function newSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从用户首条消息生成会话标题 */
export function sessionTitle(text: string): string {
  const one = text.split(/\r?\n/)[0]!.trim().replace(/\s+/g, " ");
  if (one.length <= TITLE_MAX) return one || "";
  return `${one.slice(0, TITLE_MAX - 1)}…`;
}

export function trimSession(msgs: ChatMsg[], cap = MAX_SESSION_MSGS): { msgs: ChatMsg[]; dropped: number } {
  if (msgs.length <= cap) return { msgs, dropped: 0 };
  return { msgs: msgs.slice(msgs.length - cap), dropped: msgs.length - cap };
}

/** 追加一条消息并截断；返回新数组与丢弃条数（丢弃>0 时 UI 显示清理提示） */
export function appendMsg(msgs: ChatMsg[], msg: ChatMsg, cap = MAX_SESSION_MSGS): { msgs: ChatMsg[]; dropped: number } {
  return trimSession([...msgs, msg], cap);
}

/**
 * 构造发送给模型的上下文窗口：从最近 turns 个 user 消息各自所在位置起截取，
 * 保证窗口首条是 user（system 由调用方前置）。消息不足 turns 轮时全量返回。
 */
export function windowHistory(msgs: ChatMsg[], turns = CONTEXT_USER_TURNS): ChatMsg[] {
  if (msgs.length === 0) return [];
  const userIdx: number[] = [];
  msgs.forEach((m, i) => {
    if (m.role === "user") userIdx.push(i);
  });
  if (userIdx.length === 0) return msgs;
  if (userIdx.length <= turns) return msgs;
  return msgs.slice(userIdx[userIdx.length - turns]!);
}

/** 会话是否以 user 开头（窗口/持久化结构合法性检查，供测试与防御用） */
export function startsWithUser(msgs: ChatMsg[]): boolean {
  return msgs.length === 0 || msgs[0]!.role === "user";
}

/**
 * 布局指纹（FNV-1a 哈希）：覆盖全部键的坐标/尺寸/旋转/标签/颜色/标记与 meta 名。
 * 相同布局 → 相同指纹；任何用户撤销（undo）或手动编辑 → 指纹变化。
 */
export function layoutKey(l: KLELayout): string {
  let h = 2166136261;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  };
  feed(l.meta.name ?? "");
  feed("|");
  feed(l.meta.author ?? "");
  feed("|");
  for (const k of l.keys) {
    feed(`${k.x},${k.y},${k.w ?? 1},${k.h ?? 1},${k.r ?? 0},${k.x2 ?? 0},${k.y2 ?? 0},${k.w2 ?? 0},${k.h2 ?? 0},${k.c ?? ""},${k.t ?? ""},${k.d ? 1 : 0}${k.g ? 1 : 0}${k.l ? 1 : 0}${k.n ? 1 : 0}|`);
    feed((k.labels ?? []).join("/"));
    feed(";");
  }
  return (h >>> 0).toString(36);
}

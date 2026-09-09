import { describe, expect, it } from "vitest";
import {
  appendMsg,
  layoutKey,
  sessionTitle,
  startsWithUser,
  trimSession,
  windowHistory,
  type ChatMsg,
} from "../src/lib/ai-context";
import { parseKLEJSON } from "../src/lib/kle-serial";

function u(text: string): ChatMsg {
  return { role: "user", content: text };
}
function a(text: string): ChatMsg {
  return { role: "assistant", content: text };
}

describe("会话标题", () => {
  it("取首行并清理空白", () => {
    expect(sessionTitle("  把 F 区改成紫色  \n第二行忽略")).toBe("把 F 区改成紫色");
  });

  it("超长截断加省略号", () => {
    const long = "a".repeat(60);
    expect(sessionTitle(long)).toHaveLength(24);
    expect(sessionTitle(long)).toMatch(/…$/);
  });

  it("空文本返回空串", () => {
    expect(sessionTitle("   \n  ")).toBe("");
  });
});

describe("布局指纹", () => {
  const ROWS = [
    { name: "Test", author: "ai" },
    ["Q", "W", "E"],
    [{ y: 1 }, "A", { w: 2 }, "Space"],
  ];
  function layout() {
    const l = parseKLEJSON(structuredClone(ROWS));
    if (!l) throw new Error("fixture parse failed");
    return l;
  }

  it("相同布局指纹相同，不同布局指纹不同", () => {
    expect(layoutKey(layout())).toBe(layoutKey(layout()));
    const changed = layout();
    changed.keys[0]!.labels[0] = "Esc";
    expect(layoutKey(changed)).not.toBe(layoutKey(layout()));
  });

  it("撤销恢复原布局后指纹回到提交前值（undo 感知前提）", () => {
    const before = layout();
    const keyBefore = layoutKey(before);
    const edited = layout();
    edited.keys[1]!.x = 3;
    const keyEdited = layoutKey(edited);
    expect(keyEdited).not.toBe(keyBefore);
    // undo = 恢复 before 的键值
    const undone = layout();
    expect(layoutKey(undone)).toBe(keyBefore);
  });

  it("meta 名称变化也改变指纹", () => {
    const a = layout();
    a.meta.name = "Renamed";
    expect(layoutKey(a)).not.toBe(layoutKey(layout()));
  });
});

describe("消息截断", () => {
  it("超上限丢最旧，保留尾部", () => {
    const msgs = [u("1"), u("2"), u("3"), u("4"), u("5"), u("6"), u("7")];
    const r = trimSession(msgs, 5);
    expect(r.dropped).toBe(2);
    expect(r.msgs.map((m) => m.content)).toEqual(["3", "4", "5", "6", "7"]);
  });

  it("未超上限不丢", () => {
    const msgs = [u("1"), u("2")];
    expect(trimSession(msgs, 5).dropped).toBe(0);
  });

  it("appendMsg 追加并截断", () => {
    const base = Array.from({ length: 40 }, (_, i) => u(`m${i}`));
    const r = appendMsg(base, u("new"), 40);
    expect(r.dropped).toBe(1);
    expect(r.msgs.length).toBe(40);
    expect(r.msgs.at(-1)!.content).toBe("new");
    expect(r.msgs[0]!.content).toBe("m1");
  });

  it("默认 cap 为 40", () => {
    const r = appendMsg(Array.from({ length: 40 }, (_, i) => u(`m${i}`)), u("x"));
    expect(r.dropped).toBe(1);
    expect(r.msgs.length).toBe(40);
  });
});

describe("上下文窗口", () => {
  it("不足 turns 轮时全量返回", () => {
    const msgs = [u("q1"), a("r1"), u("q2")];
    expect(windowHistory(msgs, 12)).toBe(msgs);
  });

  it("超 turns 轮时从第 turns 个最近 user 起截取", () => {
    const msgs: ChatMsg[] = [];
    for (let i = 1; i <= 15; i++) {
      msgs.push(u(`q${i}`), a(`r${i}`));
    }
    const w = windowHistory(msgs, 12);
    expect(w.length).toBe(24);
    expect(w[0]!.content).toBe("q4"); // 15 - 12 + 1 = 4
    expect(w.at(-1)!.content).toBe("r15");
    expect(startsWithUser(w)).toBe(true);
  });

  it("窗口起点前有 tool 消息时整体丢弃（保证首条为 user）", () => {
    const msgs: ChatMsg[] = [];
    for (let i = 1; i <= 13; i++) {
      msgs.push(u(`q${i}`), a(`r${i}`));
    }
    msgs.splice(2, 0, { role: "tool", content: "tool-res" }); // 插在第 2 条后
    const w = windowHistory(msgs, 12);
    expect(w[0]!.role).toBe("user");
    expect(w[0]!.content).toBe("q2");
  });

  it("无 user 消息时全量返回", () => {
    const msgs = [a("r1"), a("r2")];
    expect(windowHistory(msgs)).toBe(msgs);
  });

  it("空数组返回空", () => {
    expect(windowHistory([])).toEqual([]);
  });
});

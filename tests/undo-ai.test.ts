import { describe, expect, it } from "vitest";
import { parseKLEJSON } from "../src/lib/kle-serial";
import { createInitialState, editorReducer } from "../src/lib/kle-reducer";
import { applyOps, type Op } from "../src/lib/ops-engine";
import { applyOps as coreApplyOps } from "../tools/core";

const ROWS = [
  { name: "Test60", author: "ai" },
  ["Q", "W", "E"],
  [{ y: 1 }, "A", { w: 2 }, "Space"],
];

function baseLayout() {
  const l = parseKLEJSON(structuredClone(ROWS));
  if (!l) throw new Error("fixture parse failed");
  return l;
}

function stateWith(layout = baseLayout()) {
  return { ...createInitialState(), layout };
}

describe("COMMIT_LAYOUT（AI 修改进入撤销栈）", () => {
  it("COMMIT 压入一个撤销步，UNDO 完整恢复布局与 meta，REDO 可重放", () => {
    const layout = baseLayout();
    const ops: Op[] = [
      { op: "set_label", index: 0, label: "Esc" },
      { op: "set_meta", name: "Renamed" },
    ];
    const r = applyOps(layout, ops);
    expect(r.applied).toBe(2);
    expect(r.errors).toEqual([]);

    let state = stateWith(layout);
    state = editorReducer(state, { type: "COMMIT_LAYOUT", layout: r.layout });
    expect(state.undoStack.length).toBe(1);
    expect(state.layout.meta.name).toBe("Renamed");
    expect(state.layout.keys[0]!.labels[0]).toBe("Esc");

    state = editorReducer(state, { type: "UNDO" });
    expect(state.layout.meta.name).toBe("Test60");
    expect(state.layout.keys[0]!.labels[0]).toBe("Q");
    expect(state.undoStack.length).toBe(0);
    expect(state.redoStack.length).toBe(1);

    state = editorReducer(state, { type: "REDO" });
    expect(state.layout.meta.name).toBe("Renamed");
  });

  it("COMMIT 不清空既有撤销历史（与 LOAD_LAYOUT 语义相反）", () => {
    const layout = baseLayout();
    let state = stateWith(layout);
    state = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "w", value: 1.5 });
    expect(state.undoStack.length).toBe(1);

    const r = applyOps(layout, [{ op: "set_label", index: 1, label: "X" }] as Op[]);
    state = editorReducer(state, { type: "COMMIT_LAYOUT", layout: r.layout });
    expect(state.undoStack.length).toBe(2);

    state = editorReducer(state, { type: "UNDO" });
    expect(state.layout.keys[0]!.w).toBe(1.5);
    expect(state.layout.keys[1]!.labels[0]).toBe("W");
  });

  it("LOAD_LAYOUT 仍清空撤销历史（回归保护）", () => {
    let state = stateWith();
    state = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "w", value: 2 });
    state = editorReducer(state, { type: "LOAD_LAYOUT", layout: baseLayout() });
    expect(state.undoStack.length).toBe(0);
    expect(state.redoStack.length).toBe(0);
  });
});

describe("ops 引擎单一事实源", () => {
  it("tools/core 再导出与 src/lib/ops-engine 行为一致（含 place/delete/add_key/set_meta）", () => {
    const layout = baseLayout();
    const ops: Op[] = [
      { op: "move", index: [1, 2], dx: 0.25, dy: 1 },
      { op: "delete", index: 3 },
      { op: "add_key", x: 0, y: 4, w: 6.25, label: "Space" },
      { op: "set_meta", author: "bot" },
    ];
    const viaCore = coreApplyOps(layout, ops);
    const viaLib = applyOps(layout, ops);
    expect(viaLib.applied).toBe(viaCore.applied);
    expect(JSON.stringify(viaLib.layout.keys)).toBe(JSON.stringify(viaCore.layout.keys));
    expect(viaLib.layout.meta.author).toBe("bot");
    // P1-2 回归锁定：add_key 必须产出 12 元素 labels（画布 getPrimaryLabel 依赖）
    expect(viaLib.layout.keys.at(-1)!.labels.length).toBe(12);
    expect(viaLib.layout.keys.at(-1)!.labels[0]).toBe("Space");
  });
});

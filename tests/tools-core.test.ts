import { describe, expect, it } from "vitest";
import {
  applyOps,
  exportFree,
  jsonFromLayout,
  layoutFromRows,
  listKeys,
  listPresetNames,
  presetLayout,
  proBlocked,
  resolveSafe,
  rawDataFromLayout,
  rowsFromLayout,
  shareUrl,
  summarize,
} from "../tools/core";
import type { Op } from "../tools/core";

const ROWS = [
  { name: "Test60", author: "ai" },
  ["Q", "W", "E"],
  [{ y: 1 }, "A", { w: 2 }, "Space"],
];

function testLayout() {
  return layoutFromRows(structuredClone(ROWS));
}

describe("layout IO", () => {
  it("从行格式解析并统计摘要", () => {
    const s = summarize(testLayout());
    expect(s.name).toBe("Test60");
    expect(s.author).toBe("ai");
    expect(s.keyCount).toBe(5);
    expect(s.decalCount).toBe(0);
    expect(s.rowsApprox).toBe(2);
    expect(s.widthMm).toBeGreaterThan(0);
    expect(s.stabCount).toBe(1);
  });

  it("rows → json → rows 往返一致", () => {
    const layout = testLayout();
    const json = jsonFromLayout(layout);
    const reparsed = layoutFromRows(JSON.parse(json));
    expect(reparsed.keys.length).toBe(layout.keys.length);
    expect(reparsed.meta.name).toBe("Test60");
    expect(JSON.stringify(rowsFromLayout(reparsed))).toBe(JSON.stringify(rowsFromLayout(layout)));
  });

  it("rawData 自带 ## 前缀，shareUrl 拼接正确", () => {
    const raw = rawDataFromLayout(testLayout());
    expect(raw.startsWith("##")).toBe(true);
    expect(shareUrl(testLayout(), "http://x/y")).toMatch(/^http:\/\/x\/y\/##.+$/);
  });

  it("空数组与非数组报错", () => {
    expect(() => layoutFromRows({ foo: 1 })).toThrow();
    expect(summarize(layoutFromRows([])).keyCount).toBe(0);
  });
});

describe("applyOps", () => {
  it("set_label / set_prop / move / place", () => {
    const ops: Op[] = [
      { op: "set_label", index: 0, label: "Esc" },
      { op: "set_prop", index: [1, 2], prop: "w", value: 1.5 },
      { op: "move", index: 0, dx: 3, dy: 0 },
      { op: "place", index: 4, x: 10, y: 5 },
      { op: "set_meta", name: "Renamed" },
    ];
    const { layout, applied, errors } = applyOps(testLayout(), ops);
    expect(errors).toEqual([]);
    expect(applied).toBe(5);
    expect(layout.keys[0]!.labels[0]).toBe("Esc");
    expect(layout.keys[0]!.x).toBe(3);
    expect(layout.keys[1]!.w).toBe(1.5);
    expect(layout.keys[2]!.w).toBe(1.5);
    expect(layout.keys[4]!.x).toBe(10);
    expect(layout.keys[4]!.y).toBe(5);
    expect(layout.meta.name).toBe("Renamed");
  });

  it("add_key 追加新键", () => {
    const before = testLayout().keys.length;
    const { layout, errors } = applyOps(testLayout(), [
      { op: "add_key", x: 0, y: 9, w: 6.25, label: "Space" },
    ]);
    expect(errors).toEqual([]);
    expect(layout.keys.length).toBe(before + 1);
    const added = layout.keys.at(-1)!;
    expect(added.x).toBe(0);
    expect(added.y).toBe(9);
    expect(added.w).toBe(6.25);
    expect(added.labels[0]).toBe("Space");
  });

  it("delete 后索引即时更新（顺序应用）", () => {
    const { layout, errors } = applyOps(testLayout(), [
      { op: "delete", index: 0 },
      { op: "set_label", index: 0, label: "NewFirst" },
    ]);
    expect(errors).toEqual([]);
    expect(layout.keys[0]!.labels[0]).toBe("NewFirst");
    expect(layout.keys.length).toBe(4);
  });

  it("批量删除多个索引", () => {
    const { layout, errors } = applyOps(testLayout(), [
      { op: "delete", index: [0, 2, 4] },
    ]);
    expect(errors).toEqual([]);
    expect(layout.keys.length).toBe(2);
  });

  it("非法属性与越界索引进 errors 不抛出", () => {
    const { applied, errors } = applyOps(testLayout(), [
      { op: "set_prop", index: 0, prop: "hack", value: 1 },
      { op: "set_prop", index: 999, prop: "w", value: 2 },
      { op: "set_label", index: -1, label: "X" },
      { op: "move", index: 0, dx: Number.NaN, dy: 0 },
      { op: "set_meta" },
    ]);
    expect(applied).toBe(0);
    expect(errors.length).toBe(5);
  });

  it("旋转 set_prop 走 reducer 补偿逻辑不崩", () => {
    const { layout, errors } = applyOps(testLayout(), [
      { op: "set_prop", index: 0, prop: "r", value: 90 },
    ]);
    expect(errors).toEqual([]);
    expect(layout.keys[0]!.r).toBe(90);
  });
});

describe("workspace guard", () => {
  it("拒绝路径穿越", () => {
    expect(() => resolveSafe("/tmp/ws", "../evil.json")).toThrow(/越界/);
    expect(() => resolveSafe("/tmp/ws", "a/../../evil.json")).toThrow(/越界/);
    expect(resolveSafe("/tmp/ws", "sub/dir/a.json")).toBe(require("node:path").resolve("/tmp/ws/sub/dir/a.json"));
  });
});

describe("导出", () => {
  it("layout-svg 输出 SVG 字符串", () => {
    const out = exportFree(testLayout(), "layout-svg");
    expect(out.svg).toContain("<svg");
  });

  it("pcb 与 plate 输出 svg + dxf 及尺寸", () => {
    for (const fmt of ["pcb", "plate"] as const) {
      const out = exportFree(testLayout(), fmt);
      expect(out.svg.length).toBeGreaterThan(100);
      expect(out.dxf.length).toBeGreaterThan(10);
      expect(out.widthMm).toBeGreaterThan(0);
    }
  });

  it("空布局导出 PCB 报错", () => {
    expect(() => exportFree(layoutFromRows([]), "pcb")).toThrow(/为空/);
  });

  it("Pro 功能返回提示文本", () => {
    expect(proBlocked("QMK 导出")).toContain("Pro");
  });
});

describe("预设", () => {
  it("列出预设并用名称加载", () => {
    expect(listPresetNames()).toContain("ANSI 104");
    const s = summarize(presetLayout("ANSI 104"));
    expect(s.keyCount).toBeGreaterThan(100);
  });

  it("未知预设报错并列出可选项", () => {
    expect(() => presetLayout("不存在")).toThrow(/ANSI 104/);
  });
});

describe("listKeys", () => {
  it("生成紧凑键位表", () => {
    const lines = listKeys(testLayout());
    expect(lines.length).toBe(5);
    expect(lines[0]).toContain('"Q"');
  });
});

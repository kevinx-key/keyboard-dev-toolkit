/**
 * 项目文件 v2 测试：确认「保存全部」完整记录 / 还原每个编辑器的配置。
 */

import { describe, it, expect } from "vitest";
import { serializeProjectFile, deserializeProjectFile } from "@/lib/project-serial";
import {
  DEFAULT_PCB_CONFIG,
  DEFAULT_PLATE_SETTINGS,
  DEFAULT_FOAM_SETTINGS,
  DEFAULT_PAD_SETTINGS,
  DEFAULT_BOTTOM_FOAM_SETTINGS,
} from "@/lib/editor-settings";
import { DEFAULT_PROPS, DEFAULT_META } from "@/lib/kle-types";
import type { KeyProps } from "@/lib/kle-types";

const sampleKey: KeyProps = {
  ...DEFAULT_PROPS,
  x: 0, y: 0,
  labels: ["!", "", "", "", "", "", "1", "", "", "", "", ""],
  textColor: ["#ff0000", "", "", "", "", "", "", "", "", "", "", ""],
  textSize: [0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0],
  matrixRow: 2,
  matrixCol: 5,
  compat: 1,
  compatOption: 3,
};

const fullInput = {
  name: "Board",
  layout: {
    meta: { ...DEFAULT_META, name: "Board", author: "Kevin", backcolor: "#123456", css: "x{}" },
    keys: [sampleKey],
  },
  kLayout: [["Esc"]],
  plateRotations: { 0: 90, 3: 180 },
  plateConfig: { ...DEFAULT_PLATE_SETTINGS, holeFillet: 1.5, kerf: 0.1 },
  switchRotations: { "switch-1": 90 },
  stabRotations: { "stab-2": 270 },
  pcbConfig: { ...DEFAULT_PCB_CONFIG, solderType: "sunken" as const, needLed: true, edgeDistance: 7, outerFillet: 3 },
  foamConfig: { ...DEFAULT_FOAM_SETTINGS, thickness: 3.5 },
  padConfig: { outerFillet: 2 },
  bottomFoamConfig: {
    ...DEFAULT_BOTTOM_FOAM_SETTINGS,
    thickness: 4,
    customRects: [{ cx: 10, cy: 20, w: 5, h: 6, r: 1, rot: 30 }],
  },
};

describe("项目文件 v3 — 全量无损快照", () => {
  it("完整布局（meta + 全部 KeyProps）无损往返", () => {
    const out = deserializeProjectFile(serializeProjectFile(fullInput))!;
    expect(out.layout).not.toBeNull();
    expect(out.layout!.meta.author).toBe("Kevin");
    expect(out.layout!.meta.backcolor).toBe("#123456");
    expect(out.layout!.meta.css).toBe("x{}");

    const k = out.layout!.keys[0]!;
    expect(k.textColor).toEqual(sampleKey.textColor);
    expect(k.textSize).toEqual(sampleKey.textSize);
    expect(k.matrixRow).toBe(2);
    expect(k.matrixCol).toBe(5);
    expect(k.compat).toBe(1);
    expect(k.compatOption).toBe(3);
    expect(k.labels).toEqual(sampleKey.labels);
  });

  it("序列化 → 反序列化 往返保留全部编辑器设置", () => {
    const out = deserializeProjectFile(serializeProjectFile(fullInput))!;
    expect(out).not.toBeNull();

    // 旋转
    expect(out.plateRotations).toEqual({ 0: 90, 3: 180 });
    expect(out.switchRotations).toEqual({ "switch-1": 90 });
    expect(out.stabRotations).toEqual({ "stab-2": 270 });

    // 定位板配置
    expect(out.plateConfig.holeFillet).toBe(1.5);
    expect(out.plateConfig.kerf).toBe(0.1);

    // PCB 全字段
    expect(out.pcbConfig).toMatchObject({ solderType: "sunken", needLed: true, edgeDistance: 7, outerFillet: 3 });

    // 棉 / 垫 / 底棉
    expect(out.foamConfig.thickness).toBe(3.5);
    expect(out.padConfig.outerFillet).toBe(2);
    expect(out.bottomFoamConfig.thickness).toBe(4);
    expect(out.bottomFoamConfig.customRects).toEqual([{ cx: 10, cy: 20, w: 5, h: 6, r: 1, rot: 30 }]);
  });

  it("v1 旧文件（无 layout/config 段）回退到 kLayout + 默认值，不报错", () => {
    const v1 = JSON.stringify({
      version: 1,
      meta: { name: "Old" },
      kLayout: [["Esc"]],
      plate: { rotations: { 1: 90 } },
      pcb: { switchRotations: {}, stabRotations: {}, needTypeC: true },
    });
    const out = deserializeProjectFile(v1)!;
    expect(out.name).toBe("Old");
    expect(out.layout).toBeNull();
    expect(out.plateRotations).toEqual({ 1: 90 });
    expect(out.plateConfig.holeFillet).toBe(DEFAULT_PLATE_SETTINGS.holeFillet);
    expect(out.foamConfig).toEqual(DEFAULT_FOAM_SETTINGS);
    expect(out.padConfig).toEqual(DEFAULT_PAD_SETTINGS);
    expect(out.bottomFoamConfig.customRects).toEqual([]);
    expect(out.pcbConfig.solderType).toBe(DEFAULT_PCB_CONFIG.solderType);
    expect(out.pcbConfig.needTypeC).toBe(true);
  });

  it("非法 JSON / 缺 kLayout 返回 null", () => {
    expect(deserializeProjectFile("not json")).toBeNull();
    expect(deserializeProjectFile(JSON.stringify({ version: 2, meta: {} }))).toBeNull();
  });
});

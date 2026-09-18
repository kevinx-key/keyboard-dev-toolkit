import { describe, expect, it } from "vitest";
import { DICT, type Lang } from "../src/lib/i18n";
import { tOption, tServerText, tServerNotice, tQuoteReason, fill } from "../src/lib/pricing-i18n";

function makeT(lang: Lang) {
  return (key: string): string => DICT[key]?.[lang] ?? DICT[key]?.en ?? key;
}

describe("tOption", () => {
  it("按分类+key 命中字典并本地化", () => {
    expect(tOption(makeT("zh"), "material", "fr4", "FR-4 普通板")).toBe("FR-4 普通板");
    expect(tOption(makeT("en"), "material", "fr4")).toBe("FR-4 Standard");
    expect(tOption(makeT("ko"), "solderColor", "matte_black")).toBe("무광 검정");
    expect(tOption(makeT("ja"), "test", "full")).toBe("全数検査");
  });

  it("未知 key 回退服务端名称，再回退 key 本身", () => {
    expect(tOption(makeT("en"), "material", "unknown_key", "服务端名称")).toBe("服务端名称");
    expect(tOption(makeT("en"), "material", "unknown_key")).toBe("unknown_key");
    expect(tOption(makeT("en"), "unknown_cat", "fr4", "fallback")).toBe("fallback");
  });

  it("处理 logo.custom → pricing.logo.own 命名差异", () => {
    expect(tOption(makeT("en"), "logo", "custom")).toBe("Custom logo");
    expect(tOption(makeT("zh"), "logo", "custom")).toBe("自定义 Logo");
  });
});

describe("tServerText / tServerNotice", () => {
  it("已知服务端文案按原文精确匹配本地化", () => {
    expect(tServerText(makeT("en"), "三防漆工艺超出自动计价范围，请联系客服单独核算报价"))
      .toContain("Conformal coating");
  });

  it("「X 需人工报价」模板本地化", () => {
    expect(tServerText(makeT("en"), "旋钮 需人工报价")).toBe("旋钮 requires a manual quote");
  });

  it("未知文案原样返回", () => {
    expect(tServerText(makeT("en"), "some unknown text")).toBe("some unknown text");
  });

  it("notice 按「；」逐条本地化", () => {
    const out = tServerNotice(makeT("en"), "OLED 屏幕超出自动计价范围，请联系客服单独核算报价；定制其他设备超出自动计价范围，请联系客服单独核算报价");
    expect(out).toContain("OLED screen");
    expect(out).toContain("Custom other devices");
  });
});

describe("tQuoteReason", () => {
  it("按 code 本地化固定原因", () => {
    expect(tQuoteReason(makeT("en"), "QUOTE_PANEL_OVER_LIMIT", "任意原文")).toContain("panel layout range");
    expect(tQuoteReason(makeT("en"), "QUOTE_MATERIAL_MISSING", "材质配置缺失")).toBe("Material configuration missing");
  });

  it("动态原因提取「：」后的细节", () => {
    const out = tQuoteReason(makeT("en"), "QUOTE_UNKNOWN_MATERIAL", '未识别的材质：material="xyz"（可选值：fr4 / black_core）');
    expect(out).toBe("Unrecognized material: material=\"xyz\"");
  });

  it("未知 code 走原文兜底", () => {
    expect(tQuoteReason(makeT("en"), undefined, "材质配置缺失")).toBe("Material configuration missing");
    expect(tQuoteReason(makeT("en"), "SOMETHING", "raw text")).toBe("raw text");
  });
});

describe("fill", () => {
  it("替换占位符，保留未知占位符", () => {
    expect(fill("a {x} b {y}", { x: 1 })).toBe("a 1 b {y}");
  });
});

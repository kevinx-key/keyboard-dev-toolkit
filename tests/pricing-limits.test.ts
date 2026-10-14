/**
 * 在线报价数量上限守卫（> 80 PCS 只引导人工报价，2026-10）
 *
 * 需求：两个在线计价器（PCBA `PricingSection` / 定位板 `PlatePricingSection`）
 * 对超过上限的订单**不再出在线报价**，改为引导人工报价；但只是隐藏 + 引导，
 * 计价 / 下单代码全部保留（未来可能重新开放）。
 *
 * 本测试守住两件事：
 * 1. 判定函数的边界（≤ 上限允许，> 上限拒绝，未填数量交回既有校验）；
 * 2. 两个计价器都仍然接了这个门禁（避免日后改动把其中一个漏掉）。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DICT, type Lang } from "../src/lib/i18n";
import {
  ONLINE_QUOTE_MAX_QTY,
  ONLINE_QUOTE_QTY_LIMIT_ENABLED,
  isOnlineQuoteQtyAllowed,
} from "../src/lib/pricing-limits";

const ALL_LANGS: Lang[] = ["en", "zh", "zh-HK", "ko", "ja", "ru", "fr", "pt", "es"];

describe("isOnlineQuoteQtyAllowed", () => {
  it("上限内（含上限本身）仍提供在线报价", () => {
    expect(isOnlineQuoteQtyAllowed(5)).toBe(true);
    expect(isOnlineQuoteQtyAllowed(50)).toBe(true);
    expect(isOnlineQuoteQtyAllowed(ONLINE_QUOTE_MAX_QTY)).toBe(true);
  });

  it("超过上限（81 起）不再提供在线报价", () => {
    expect(isOnlineQuoteQtyAllowed(ONLINE_QUOTE_MAX_QTY + 1)).toBe(false);
    expect(isOnlineQuoteQtyAllowed(500)).toBe(false);
    expect(isOnlineQuoteQtyAllowed(Infinity)).toBe(false);
  });

  it("未填 / 非法数量交回既有校验，不算超量", () => {
    expect(isOnlineQuoteQtyAllowed(0)).toBe(true);
    expect(isOnlineQuoteQtyAllowed(-10)).toBe(true);
    expect(isOnlineQuoteQtyAllowed(NaN)).toBe(true);
  });

  it("阈值与开关是集中一处的常量（重新开放只改这里）", () => {
    expect(ONLINE_QUOTE_MAX_QTY).toBe(80);
    expect(typeof ONLINE_QUOTE_QTY_LIMIT_ENABLED).toBe("boolean");
  });
});

describe("超量提示文案（9 语言齐备）", () => {
  it("pricing.qtyLimit.title 各语言都带 {max} 占位符", () => {
    for (const lang of ALL_LANGS) {
      expect(DICT["pricing.qtyLimit.title"]?.[lang], `title 缺 ${lang}`).toContain("{max}");
    }
  });

  it("pricing.qtyLimit.body 各语言齐备", () => {
    for (const lang of ALL_LANGS) {
      expect(DICT["pricing.qtyLimit.body"]?.[lang], `body 缺 ${lang}`).toBeTruthy();
    }
  });
});

describe("两个在线计价器都接入数量上限", () => {
  const SECTIONS = [
    "src/components/PricingSection.tsx",
    "src/components/PlatePricingSection.tsx",
  ];

  for (const file of SECTIONS) {
    it(`${file}：用 isOnlineQuoteQtyAllowed 门禁 + 渲染人工报价引导`, () => {
      const code = readFileSync(file, "utf-8");
      expect(code).toContain("isOnlineQuoteQtyAllowed");
      expect(code).toContain("OnlineQuoteLimitNotice");
    });

    it(`${file}：门禁在 requestQuote 之前（超量不发报价请求）`, () => {
      const code = readFileSync(file, "utf-8");
      const gate = code.search(/if\s*\(\s*!onlineQuoteAllowed\s*\)/);
      const request = code.indexOf("requestQuote(");
      expect(gate).toBeGreaterThan(-1);
      expect(request).toBeGreaterThan(gate);
    });
  }
});

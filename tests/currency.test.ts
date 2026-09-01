import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_RATES,
  LANG_CURRENCY,
  RATES_TTL_MS,
  currencyDecimals,
  fetchLiveRates,
  formatMoney,
  getFxRates,
  loadCachedRates,
  parseErApi,
  parseFrankfurter,
} from "../src/lib/currency";
import type { Lang } from "../src/lib/i18n";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const FRANKFURTER_URL =
  "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,EUR,KRW,JPY,HKD,RUB,BRL,MXN";
const ER_API_URL = "https://open.er-api.com/v6/latest/CNY";

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const body = routes[url];
    if (body === undefined) throw new Error(`unexpected url: ${url}`);
    return { ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const frankfurterBody = [
  { date: "2026-08-31", base: "CNY", quote: "USD", rate: 0.14884 },
  { date: "2026-08-31", base: "CNY", quote: "EUR", rate: 0.128 },
  { date: "2026-08-31", base: "CNY", quote: "KRW", rate: 204.58 },
  { date: "2026-08-31", base: "CNY", quote: "JPY", rate: 23.778 },
  { date: "2026-08-31", base: "CNY", quote: "HKD", rate: 1.1678 },
  { date: "2026-08-31", base: "CNY", quote: "RUB", rate: 12.7791 },
  { date: "2026-08-31", base: "CNY", quote: "BRL", rate: 0.77011 },
  { date: "2026-08-31", base: "CNY", quote: "MXN", rate: 2.529 },
];

describe("LANG_CURRENCY 语言→货币绑定", () => {
  it("9 种语言全部映射并覆盖全部币种", () => {
    const langs: Lang[] = ["en", "zh", "ko", "ja", "zh-HK", "ru", "fr", "pt", "es"];
    const mapped = langs.map((l) => LANG_CURRENCY[l]);
    expect(new Set(mapped).size).toBe(9);
    expect(mapped).toContain("USD");
    expect(mapped).toContain("CNY");
    expect(mapped).toContain("KRW");
    expect(mapped).toContain("JPY");
    expect(mapped).toContain("HKD");
    expect(mapped).toContain("RUB");
    expect(mapped).toContain("EUR");
    expect(mapped).toContain("BRL");
    expect(mapped).toContain("MXN");
  });

  it("关键绑定关系正确", () => {
    expect(LANG_CURRENCY.en).toBe("USD");
    expect(LANG_CURRENCY.zh).toBe("CNY");
    expect(LANG_CURRENCY["zh-HK"]).toBe("HKD");
    expect(LANG_CURRENCY.pt).toBe("BRL");
    expect(LANG_CURRENCY.es).toBe("MXN");
    expect(LANG_CURRENCY.fr).toBe("EUR");
  });
});

describe("formatMoney", () => {
  const rates = { CNY: 1, USD: 0.14884, EUR: 0.128, KRW: 204.58, JPY: 23.778, HKD: 1.1678, RUB: 12.7791, BRL: 0.77011, MXN: 2.529 };

  it("CNY 原价原样符号 ¥", () => {
    expect(formatMoney(1234.567, "CNY", rates)).toBe("¥1,234.57");
  });

  it("USD 换算并两位小数", () => {
    expect(formatMoney(1000, "USD", rates)).toBe("$148.84");
  });

  it("EUR 两位小数", () => {
    expect(formatMoney(1000, "EUR", rates)).toBe("€128.00");
  });

  it("KRW/JPY 无小数", () => {
    expect(formatMoney(100, "KRW", rates)).toBe("₩20,458");
    expect(formatMoney(100, "JPY", rates)).toBe("¥2,378");
  });

  it("HKD 港币符号与两位小数", () => {
    expect(formatMoney(100, "HKD", rates)).toBe("HK$116.78");
  });

  it("RUB/BRL/MXN 符号正确", () => {
    expect(formatMoney(100, "RUB", rates)).toBe("₽1,277.91");
    expect(formatMoney(100, "BRL", rates)).toBe("R$77.01");
    expect(formatMoney(100, "MXN", rates)).toBe("MX$252.90");
  });

  it("未知货币回退 rate=1", () => {
    expect(formatMoney(100, "USD", { CNY: 1 })).toBe("$100.00");
  });
});

describe("currencyDecimals", () => {
  it("KRW/JPY 为 0，其余为 2", () => {
    for (const c of ["KRW", "JPY"] as const) expect(currencyDecimals(c)).toBe(0);
    for (const c of ["CNY", "USD", "EUR", "HKD", "RUB", "BRL", "MXN"] as const) expect(currencyDecimals(c)).toBe(2);
  });
});

describe("parseFrankfurter", () => {
  it("解析数组 payload", () => {
    const out = parseFrankfurter(frankfurterBody);
    expect(out.USD).toBeCloseTo(0.14884, 5);
    expect(out.HKD).toBeCloseTo(1.1678, 4);
    expect(out.MXN).toBeCloseTo(2.529, 3);
  });

  it("空数组/非数组抛错", () => {
    expect(() => parseFrankfurter([])).toThrow();
    expect(() => parseFrankfurter({})).toThrow();
  });
});

describe("parseErApi", () => {
  it("解析 success payload", () => {
    const out = parseErApi({ result: "success", rates: { usd: 0.14884, EUR: 0.128 } });
    expect(out?.USD).toBeCloseTo(0.14884, 5);
    expect(out?.EUR).toBeCloseTo(0.128, 3);
  });

  it("非 success 返回 null", () => {
    expect(parseErApi({ result: "error", rates: {} })).toBeNull();
    expect(parseErApi(null)).toBeNull();
  });
});

describe("getFxRates", () => {
  it("无缓存时拉取 frankfurter 并保存（合并补全）", async () => {
    const fn = mockFetch({ [FRANKFURTER_URL]: frankfurterBody });
    const r = await getFxRates();
    expect(r.source).toBe("frankfurter");
    expect(r.rates.CNY).toBe(1);
    expect(r.rates.USD).toBeCloseTo(0.14884, 5);
    expect(storage.get("kdt-fx-rates")).toBeTruthy();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("frankfurter 失败回退 er-api", async () => {
    const fn = mockFetch({
      [FRANKFURTER_URL]: undefined,
      [ER_API_URL]: { result: "success", rates: { USD: 0.14884, EUR: 0.128, KRW: 204.58, JPY: 23.778, TWD: 4.7129, RUB: 12.7791, BRL: 0.77011, MXN: 2.529 } },
    });
    const r = await getFxRates();
    expect(r.source).toBe("er-api");
    expect(r.rates.USD).toBeCloseTo(0.14884, 5);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("双源皆失败抛错", async () => {
    mockFetch({});
    await expect(getFxRates()).rejects.toThrow();
  });

  it("新鲜缓存直接返回不 fetch", async () => {
    const cached = { date: "2026-08-30", fetchedAt: Date.now(), source: "cache" as const, rates: { USD: 0.15, CNY: 1 } };
    storage.set("kdt-fx-rates", JSON.stringify(cached));
    const fn = mockFetch({});
    const r = await getFxRates();
    expect(r.rates.USD).toBeCloseTo(0.15, 5);
    expect(r.rates.KRW).toBe(BUNDLED_RATES.rates.KRW);
    expect(fn).not.toHaveBeenCalled();
  });

  it("过期缓存触发 fetch", async () => {
    const old = { date: "2026-08-01", fetchedAt: Date.now() - RATES_TTL_MS * 2, source: "cache" as const, rates: { USD: 0.1, CNY: 1 } };
    storage.set("kdt-fx-rates", JSON.stringify(old));
    const fn = mockFetch({ [FRANKFURTER_URL]: frankfurterBody });
    const r = await getFxRates();
    expect(r.source).toBe("frankfurter");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("force=true 忽略新鲜缓存", async () => {
    const cached = { date: "2026-08-30", fetchedAt: Date.now(), source: "cache" as const, rates: { USD: 0.15, CNY: 1 } };
    storage.set("kdt-fx-rates", JSON.stringify(cached));
    const fn = mockFetch({ [FRANKFURTER_URL]: frankfurterBody });
    const r = await getFxRates(true);
    expect(r.source).toBe("frankfurter");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("loadCachedRates", () => {
  it("损坏缓存返回 null", () => {
    storage.set("kdt-fx-rates", "not json");
    expect(loadCachedRates()).toBeNull();
  });

  it("缺失字段返回 null", () => {
    storage.set("kdt-fx-rates", JSON.stringify({ foo: 1 }));
    expect(loadCachedRates()).toBeNull();
  });
});

describe("fetchLiveRates", () => {
  it("返回 source/date 快照字段", async () => {
    mockFetch({ [FRANKFURTER_URL]: frankfurterBody });
    const r = await fetchLiveRates();
    expect(r.source).toBe("frankfurter");
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { getMeta, requestQuote, resetMetaCache, QuoteServiceError, type QuoteRequest } from "../src/lib/quote-api";

const form: QuoteRequest = {
  lengthMm: 100, widthMm: 50, quantity: 10, material: "fr4", thicknessMm: 1.6,
  surfaceFinish: "hasl", solderColor: "green", communication: [], hotswap: false, encoderCount: 0,
  oled: false, rgb: false, logo: "none", protection: "standard", test: "none", packaging: [],
  keyCount: 61, subBoard: "none", cableType: "black", cableLengthMm: 0, firmware: [], tracing: "rounded",
  plateMaterial: "", plateLengthMm: 0, plateWidthMm: 0, plateQuantity: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetMetaCache();
});

function stubFetchOk(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok, status, json: async () => payload }) as Response));
}

describe("getMeta", () => {
  it("成功时返回 meta 且缓存（只请求一次）", async () => {
    const meta = { version: "2.7.0", updatedAt: "2026-08-28", materials: [], surfaceFinish: [], solderColors: [], options: { encoder: {}, oled: {}, communication: [], solder: [], logo: [], protection: [], test: [], packaging: [] }, extras: { subBoard: [], cable: [], firmware: [], tracing: [] }, plateMaterials: [], contacts: {} };
    stubFetchOk(meta);
    await getMeta();
    await getMeta();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("非 200 抛 QuoteServiceError", async () => {
    stubFetchOk({}, false, 500);
    await expect(getMeta()).rejects.toBeInstanceOf(QuoteServiceError);
  });
});

describe("requestQuote", () => {
  it("成功返回 ok:true（响应字段白名单）", async () => {
    stubFetchOk({ ok: true, totalPrice: 100, unitPrice: 10, deliveryQty: 10, sheets: 2, version: "2.7.0" });
    const r = await requestQuote(form);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r).sort()).toEqual(["deliveryQty", "ok", "sheets", "totalPrice", "unitPrice", "version"].sort());
    }
  });

  it("请求载荷不含价格关键字", async () => {
    const mocked = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => ({ ok: true, totalPrice: 1, unitPrice: 0.1, deliveryQty: 1, sheets: 1, version: "1" }) }) as Response);
    vi.stubGlobal("fetch", mocked);
    await requestQuote(form);
    const init = mocked.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse((init?.body as string) ?? "{}");
    const s = JSON.stringify(body);
    expect(s).not.toContain("feePerPcs");
    expect(s).not.toContain("feePerSqm");
    expect(s).not.toContain("multi");
    expect(s).not.toContain("cost");
  });

  it("非 200 抛 QuoteServiceError", async () => {
    stubFetchOk({}, false, 503);
    await expect(requestQuote(form)).rejects.toBeInstanceOf(QuoteServiceError);
  });
});

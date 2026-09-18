import { describe, expect, it, vi, afterEach } from "vitest";
import { getMeta, requestQuote, resetMetaCache, createCheckout, QuoteServiceError, type CheckoutRequest, type QuoteRequest } from "../src/lib/quote-api";

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

describe("createCheckout", () => {
  const req: CheckoutRequest = {
    projectJson: { kLayout: [] },
    quoteForm: form,
    bounds: { pcb: { width: 100, height: 50 }, plate: null, source: "auto" },
    clientQuote: { totalPrice: 100, unitPrice: 10, deliveryQty: 10, sheets: 1, version: "2.9.0" },
    shipping: null,
    idemKey: "idem-test",
    locale: "zh",
  };

  it("成功返回 invoiceUrl 与 quoteId", async () => {
    stubFetchOk({ ok: true, invoiceUrl: "https://kindlestar.online/invoices/abc", quoteId: "KS-20260916-ABCD1234" });
    const r = await createCheckout(req);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.invoiceUrl).toBe("https://kindlestar.online/invoices/abc");
      expect(r.quoteId).toBe("KS-20260916-ABCD1234");
    }
  });

  it("409 PRICE_CHANGED 是业务响应（不抛异常，带 fresh 值）", async () => {
    stubFetchOk({ ok: false, code: "PRICE_CHANGED", fresh: { totalPrice: 110, plateTotalPrice: null, version: "2.9.1" } }, false, 409);
    const r = await createCheckout(req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("PRICE_CHANGED");
      expect(r.fresh?.totalPrice).toBe(110);
      expect(r.fresh?.plateTotalPrice).toBeNull();
    }
  });

  it("校验拒绝（400）原样返回错误码", async () => {
    stubFetchOk({ ok: false, code: "DIMENSION_MISMATCH", message: "报价尺寸与实际 bounds 不一致" }, false, 400);
    const r = await createCheckout(req);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DIMENSION_MISMATCH");
  });

  it("响应不是合法 JSON 抛 QuoteServiceError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new Error("not json"); },
    }) as unknown as Response));
    await expect(createCheckout(req)).rejects.toBeInstanceOf(QuoteServiceError);
  });

  it("请求体包含幂等键，且不含成本关键字", async () => {
    const mocked = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, invoiceUrl: "https://x/i/1", quoteId: "KS-1" }),
    }) as Response);
    vi.stubGlobal("fetch", mocked);
    await createCheckout(req);
    const init = mocked.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse((init?.body as string) ?? "{}");
    expect(body.idemKey).toBe("idem-test");
    const s = JSON.stringify(body);
    expect(s).not.toContain("feePerPcs");
    expect(s).not.toContain("cost");
    expect(s).not.toContain("multi");
  });
});

import { describe, expect, it } from "vitest";
import { buildCheckoutRequest, applyFreshToRequest, type BuildCheckoutInput, type PlateOrderInfo } from "../src/lib/checkout-payload";
import type { CheckoutRequest, QuoteRequest } from "../src/lib/quote-api";

const form: QuoteRequest = {
  lengthMm: 0, widthMm: 0, quantity: 10, material: "fr4", thicknessMm: 1.6,
  surfaceFinish: "hasl", solderColor: "green", communication: ["wired"], hotswap: false, encoderCount: 0,
  oled: false, rgb: false, logo: "none", protection: "standard", test: "full", packaging: [],
  keyCount: 61, subBoard: "none", cableType: "black", cableLengthMm: 0, firmware: [], tracing: "rounded",
  plateMaterial: "", plateLengthMm: 0, plateWidthMm: 0, plateQuantity: 0,
};

const quote = { totalPrice: 1000, unitPrice: 100, deliveryQty: 10, sheets: 2, version: "2.9.0" };
const pcbSize = { width: 300.4, height: 100.6 };

const plate: PlateOrderInfo = {
  material: "fr4",
  quantity: 10,
  lengthMm: 300,
  widthMm: 100,
  actual: { width: 300.4, height: 100.2 },
  auto: true,
  totalPrice: 300,
  deliveryQty: 10,
  version: "2.9.0",
};

function build(overrides: Partial<BuildCheckoutInput> = {}): CheckoutRequest {
  return buildCheckoutRequest({
    quote,
    form,
    resolvedL: 300,
    resolvedW: 101,
    keyCount: 61,
    rgb: false,
    pcbSize,
    plateOrder: null,
    projectJson: { kLayout: [] },
    fxShown: { rate: 0.14, date: "2026-09-16", source: "frankfurter" },
    idemKey: "idem-1",
    locale: "en",
    ...overrides,
  });
}

describe("buildCheckoutRequest", () => {
  it("auto 模式：报价尺寸用解析值，bounds 用实际板框（L2 auto 校验要求完全一致）", () => {
    const req = build();
    expect(req.bounds.source).toBe("auto");
    expect(req.quoteForm.lengthMm).toBe(300);
    expect(req.quoteForm.widthMm).toBe(101);
    expect(req.bounds.pcb).toEqual({ width: 300.4, height: 100.6 });
    expect(req.clientQuote.plate).toBeNull();
    expect(req.bounds.plate).toBeNull();
    expect(req.shipping).toBeNull();
  });

  it("手动尺寸 → manual（服务端按“不小于实际”校验）", () => {
    const req = build({ form: { ...form, lengthMm: 320, widthMm: 120 }, resolvedL: 320, resolvedW: 120 });
    expect(req.bounds.source).toBe("manual");
    expect(req.quoteForm.lengthMm).toBe(320);
    expect(req.quoteForm.widthMm).toBe(120);
  });

  it("含定位板：quoteForm / clientQuote / bounds 三处合并", () => {
    const req = build({ plateOrder: plate });
    expect(req.quoteForm.plateMaterial).toBe("fr4");
    expect(req.quoteForm.plateLengthMm).toBe(300);
    expect(req.quoteForm.plateQuantity).toBe(10);
    expect(req.clientQuote.plate).toEqual({ totalPrice: 300, deliveryQty: 10, version: "2.9.0" });
    expect(req.bounds.plate).toEqual({ width: 300.4, height: 100.2 });
    expect(req.bounds.source).toBe("auto");
  });

  it("定位板手动改过尺寸 → source 降级 manual", () => {
    const req = build({ plateOrder: { ...plate, auto: false } });
    expect(req.bounds.source).toBe("manual");
  });

  it("定位板数量 <5 → 不并入订单", () => {
    const req = build({ plateOrder: { ...plate, quantity: 3 } });
    expect(req.quoteForm.plateQuantity).toBe(0);
    expect(req.clientQuote.plate).toBeNull();
    expect(req.bounds.plate).toBeNull();
  });

  it("不含定位板时清零表单残留 plate 字段（防主表单旧值漏进订单）", () => {
    const req = build({ form: { ...form, plateMaterial: "fr4", plateQuantity: 10 } });
    expect(req.quoteForm.plateMaterial).toBe("");
    expect(req.quoteForm.plateQuantity).toBe(0);
  });

  it("折扣码透传（trim 后发送；空串/未填不发送）", () => {
    expect(build({ discountCode: "  KDT-TEST-123  " }).discountCode).toBe("KDT-TEST-123");
    expect(build({ discountCode: "   " }).discountCode).toBeUndefined();
    expect(build().discountCode).toBeUndefined();
  });
});

describe("applyFreshToRequest", () => {
  it("PRICE_CHANGED：更新 PCBA 与定位板价格、版本号（且不修改原请求）", () => {
    const req = build({ plateOrder: plate });
    const r = applyFreshToRequest(req, "PRICE_CHANGED", { totalPrice: 1100, plateTotalPrice: 320, version: "2.9.1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.clientQuote.totalPrice).toBe(1100);
    expect(r.request.clientQuote.plate?.totalPrice).toBe(320);
    expect(r.request.clientQuote.version).toBe("2.9.1");
    expect(req.clientQuote.totalPrice).toBe(1000);
  });

  it("FX_CHANGED：更新 fxShown 汇率", () => {
    const req = build();
    const r = applyFreshToRequest(req, "FX_CHANGED", { rate: 0.141, date: "2026-09-17", source: "worker" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.fxShown).toEqual({ rate: 0.141, date: "2026-09-17", source: "worker" });
  });

  it("VERSION_CHANGED：更新版本号", () => {
    const req = build();
    const r = applyFreshToRequest(req, "VERSION_CHANGED", { version: "2.10.0" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.clientQuote.version).toBe("2.10.0");
  });

  it("定位板价格消失 → 拒绝重试（PLATE_CHANGED，禁止静默丢件）", () => {
    const req = build({ plateOrder: plate });
    const r = applyFreshToRequest(req, "PRICE_CHANGED", { totalPrice: 1100, plateTotalPrice: null, version: "2.9.1" });
    expect(r).toEqual({ ok: false, error: "PLATE_CHANGED" });
  });

  it("无 fresh 值时原样重试", () => {
    const req = build();
    const r = applyFreshToRequest(req, "PRICE_CHANGED", undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.clientQuote.totalPrice).toBe(1000);
  });
});

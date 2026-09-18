// checkout-payload.ts — 一键下单请求构造（纯函数，可单测）
// 契约：kindlestar-pricing docs/一键下单方案.md §6.2（请求体）/ §7.5（L2 校验：auto 必须与编辑器一致，manual 必须不小于实际）
import type { CheckoutClientQuote, CheckoutFresh, CheckoutRequest, QuoteRequest } from "./quote-api";

/** 定位板独立报价信息（PlateSection → PlatePricingSection 上报 → EditorPage → PricingSection 合并下单） */
export interface PlateOrderInfo {
  material: string;
  quantity: number;
  /** 报价尺寸（mm） */
  lengthMm: number;
  widthMm: number;
  /** 定位板编辑器实际成品尺寸（bounds.plate 用，L2 校验基准） */
  actual: { width: number; height: number };
  /** 是否跟随编辑器尺寸（未手动修改） */
  auto: boolean;
  totalPrice: number;
  deliveryQty: number;
  version: string;
}

export interface QuoteSnapshot {
  totalPrice: number;
  unitPrice: number;
  deliveryQty: number;
  sheets: number;
  version: string;
}

/** 幂等键（uuid v4；非安全上下文回退随机串）。模块级封装，事件回调中调用 */
export function newIdemKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `kdt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface BuildCheckoutInput {
  quote: QuoteSnapshot;
  form: QuoteRequest;
  /** 解析后的报价尺寸（手动值优先，否则取 PCB 板框） */
  resolvedL: number;
  resolvedW: number;
  keyCount: number;
  rgb: boolean;
  pcbSize: { width: number; height: number };
  plateOrder: PlateOrderInfo | null;
  projectJson: unknown;
  fxShown: { rate: number; date: string; source: string } | null;
  /** 折扣码（选填；服务端校验，未命中返回 DISCOUNT_INVALID） */
  discountCode?: string;
  idemKey: string;
  locale: string;
}

/** 构造 /api/checkout 请求体（尺寸语义见方案 §7.5） */
export function buildCheckoutRequest(input: BuildCheckoutInput): CheckoutRequest {
  const { quote, form, resolvedL, resolvedW, keyCount, rgb, pcbSize, plateOrder, projectJson, fxShown, discountCode, idemKey, locale } = input;

  const plate = plateOrder !== null && plateOrder.quantity >= 5 ? plateOrder : null;

  const quoteForm: QuoteRequest = {
    ...form,
    rgb,
    lengthMm: resolvedL,
    widthMm: resolvedW,
    keyCount,
    plateMaterial: plate ? plate.material : "",
    plateLengthMm: plate ? plate.lengthMm : 0,
    plateWidthMm: plate ? plate.widthMm : 0,
    plateQuantity: plate ? plate.quantity : 0,
  };

  // source=auto：PCB 与定位板都跟随编辑器（服务端要求与实际完全一致）；
  // 任一为手动填写 → manual（服务端要求不小于实际，仍可拦截"报小做多"）
  const pcbAuto = form.lengthMm === 0 && form.widthMm === 0;
  const source: "auto" | "manual" = pcbAuto && (!plate || plate.auto) ? "auto" : "manual";

  const clientQuote: CheckoutClientQuote = {
    totalPrice: quote.totalPrice,
    unitPrice: quote.unitPrice,
    deliveryQty: quote.deliveryQty,
    sheets: quote.sheets,
    version: quote.version,
    plate: plate
      ? { totalPrice: plate.totalPrice, deliveryQty: plate.deliveryQty, version: plate.version }
      : null,
  };

  return {
    projectJson,
    quoteForm,
    bounds: {
      pcb: { width: pcbSize.width, height: pcbSize.height },
      plate: plate ? { width: plate.actual.width, height: plate.actual.height } : null,
      source,
    },
    clientQuote,
    shipping: null,
    fxShown,
    ...(discountCode && discountCode.trim() ? { discountCode: discountCode.trim() } : {}),
    idemKey,
    locale,
  };
}

export type FreshApplyResult = { ok: true; request: CheckoutRequest } | { ok: false; error: "PLATE_CHANGED" };

/** 409（PRICE_CHANGED / VERSION_CHANGED / FX_CHANGED）后，用服务端 fresh 值更新请求体再重试 */
export function applyFreshToRequest(
  request: CheckoutRequest,
  code: string,
  fresh: CheckoutFresh | undefined,
): FreshApplyResult {
  // 服务端定位板价格消失（配置变更等）：不能静默丢定位板重试，交回 UI 要求重新报价
  if (code === "PRICE_CHANGED" && request.clientQuote.plate && fresh && fresh.plateTotalPrice === null) {
    return { ok: false, error: "PLATE_CHANGED" };
  }

  const next: CheckoutRequest = {
    ...request,
    clientQuote: { ...request.clientQuote },
  };

  if (fresh) {
    if (typeof fresh.totalPrice === "number") next.clientQuote.totalPrice = fresh.totalPrice;
    if (typeof fresh.plateTotalPrice === "number" && next.clientQuote.plate) {
      next.clientQuote.plate = { ...next.clientQuote.plate, totalPrice: fresh.plateTotalPrice };
    }
    if (typeof fresh.version === "string") next.clientQuote.version = fresh.version;
    if (typeof fresh.rate === "number") {
      next.fxShown = {
        rate: fresh.rate,
        date: fresh.date ?? request.fxShown?.date ?? "",
        source: fresh.source ?? request.fxShown?.source ?? "worker",
      };
    }
  }

  return { ok: true, request: next };
}

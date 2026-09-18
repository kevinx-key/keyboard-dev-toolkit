// quote-api.ts — 报价服务 API 封装（无本地价格数据；搬运请求/响应）
//
// API 入口：生产走 Shopify App Proxy（店铺域名 /apps/kle-checkout/* → Cloudflare Worker）。
// 为什么不直连 *.workers.dev：国内不可达（直连超时、代理 CONNECT 隧道 502），
// 而店铺域名国内可访问。Shopify 转发时会追加 shop / path_prefix / timestamp / signature，
// Worker 侧据此校验来源（见 src/checkout/app-proxy.ts）。
// 本地开发用 NEXT_PUBLIC_API_BASE 覆盖，例如 http://127.0.0.1:8787。
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://kindlestar.online/apps/kle-checkout";

export interface QuoteRequest {
  lengthMm: number;
  widthMm: number;
  quantity: number;
  material: string;
  thicknessMm: number;
  surfaceFinish: string;
  solderColor: string;
  communication: string[];
  hotswap: boolean;
  encoderCount: number;
  oled: boolean;
  rgb: boolean;
  logo: string;
  protection: string;
  test: string;
  packaging: string[];
  keyCount: number;
  subBoard: string;
  cableType: string;
  cableLengthMm: number;
  firmware: string[];
  tracing: string;
  plateMaterial: string;
  plateLengthMm: number;
  plateWidthMm: number;
  plateQuantity: number;
}

export interface QuoteOk {
  ok: true;
  totalPrice: number;
  unitPrice: number;
  deliveryQty: number;
  sheets: number;
  notice?: string;
  version: string;
  plate?: { ok: boolean; totalPrice?: number; unitPrice?: number; deliveryQty?: number; sheets?: number; reason?: string };
}

export interface QuoteFail {
  ok: false;
  // 服务端错误码（QUOTE_*）；旧响应可能缺省，本地化时按 reason 兜底
  code?: string;
  reason: string;
}

export type QuoteResponse = QuoteOk | QuoteFail;

export interface MetaItem {
  key: string;
  name: string;
  sortOrder?: number;
  reject?: boolean;
  rejectReason?: string;
}

export interface MetaResponse {
  version: string;
  updatedAt: string;
  materials: { key: string; name: string; sortOrder?: number }[];
  surfaceFinish: MetaItem[];
  solderColors: { key: string; name: string; sortOrder?: number }[];
  options: {
    encoder: { name?: string; reject?: boolean; rejectReason?: string };
    oled: { name?: string; reject?: boolean; rejectReason?: string };
    communication: MetaItem[];
    solder: MetaItem[];
    logo: MetaItem[];
    protection: MetaItem[];
    test: MetaItem[];
    packaging: MetaItem[];
  };
  extras: {
    subBoard: MetaItem[];
    cable: MetaItem[];
    firmware: MetaItem[];
    tracing: MetaItem[];
  };
  plateMaterials: { key: string; name: string }[];
  contacts: { discord?: string; email?: string };
}

export class QuoteServiceError extends Error {}

const TIMEOUT_MS = 8000;
// 建单比报价慢（Shopify 建单 + 汇率 + 快照），给更宽的超时
const CHECKOUT_TIMEOUT_MS = 20000;

async function withTimeout(url: string, init: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    throw new QuoteServiceError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

let metaCache: MetaResponse | null = null;

export function resetMetaCache() {
  metaCache = null;
}

export async function getMeta(): Promise<MetaResponse> {
  if (metaCache) return metaCache;
  const res = await withTimeout(`${API_BASE}/api/meta`, { method: "GET" });
  if (!res.ok) throw new QuoteServiceError(`meta 服务返回 ${res.status}`);
  metaCache = (await res.json()) as MetaResponse;
  return metaCache;
}

export function quoteUnavailable(message: string): QuoteFail {
  return { ok: false, reason: message };
}

export async function requestQuote(form: QuoteRequest): Promise<QuoteResponse> {
  const res = await withTimeout(`${API_BASE}/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(form),
  });
  if (!res.ok) throw new QuoteServiceError(`报价服务返回 ${res.status}`);
  return (await res.json()) as QuoteResponse;
}

// ─── Checkout（一键下单）────────────────────────────────────────
// 契约：kindlestar-pricing docs/一键下单方案.md §6.2 / §7.5；Worker 实现见其 src/worker/src/index.ts
// 与 requestQuote 不同：4xx/409 是业务响应（价格/汇率/版本变更、校验拒绝），正常返回给调用方处理；
// 只有网络错误或响应不是合法 JSON 才抛 QuoteServiceError。

export interface CheckoutBounds {
  pcb: { width: number; height: number };
  plate: { width: number; height: number } | null;
  source: "auto" | "manual";
}

export interface CheckoutClientQuote {
  totalPrice: number;
  unitPrice: number;
  deliveryQty: number;
  sheets: number;
  version: string;
  plate?: { totalPrice: number; deliveryQty: number; version: string } | null;
}

export interface CheckoutRequest {
  projectJson: unknown;
  quoteForm: QuoteRequest;
  bounds: CheckoutBounds;
  clientQuote: CheckoutClientQuote;
  shipping?: unknown | null;
  fxShown?: { rate: number; date: string; source: string } | null;
  // 折扣码（服务端与 secret 比对；命中测试码则把应付压到地板价，见 kindlestar-pricing checkout/discount.ts）
  discountCode?: string;
  idemKey: string;
  locale?: string;
}

// 409 重确认时服务端返回的最新值
export interface CheckoutFresh {
  totalPrice?: number;
  plateTotalPrice?: number | null;
  version?: string;
  rate?: number;
  date?: string;
  source?: string;
}

export interface CheckoutOk {
  ok: true;
  invoiceUrl: string;
  quoteId: string;
  sha256?: string;
  snapshotKey?: string;
  // 幂等键命中（重复提交复用同一订单）
  reused?: boolean;
  idemPersisted?: boolean;
  // 测试折扣（命中折扣码时返回；amount/payable 为店铺币种）
  discount?: { amount: number; payable: number } | null;
}

export interface CheckoutFail {
  ok: false;
  // PRICE_CHANGED | VERSION_CHANGED | FX_CHANGED | DISCOUNT_INVALID | INVALID_JSON | KEYCOUNT_MISMATCH |
  // DIMENSION_MISMATCH | SHOPIFY_* | IDEM_CONFLICT | KV_UNAVAILABLE | RATE_LIMITED | INTERNAL | QUOTE_*
  code: string;
  message?: string;
  reason?: string;
  fresh?: CheckoutFresh;
}

export type CheckoutResponse = CheckoutOk | CheckoutFail;

export async function createCheckout(req: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await withTimeout(
    `${API_BASE}/api/checkout`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    },
    CHECKOUT_TIMEOUT_MS,
  );
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new QuoteServiceError(`下单服务返回 ${res.status}`);
  }
  if (!json || typeof json !== "object" || typeof (json as { ok?: unknown }).ok !== "boolean") {
    throw new QuoteServiceError(`下单服务返回 ${res.status}`);
  }
  return json as CheckoutResponse;
}

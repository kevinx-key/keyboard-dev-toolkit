// quote-api.ts — 报价服务 API 封装（无本地价格数据；搬运请求/响应）
const API_BASE = "https://kindlestar-api.x709208969.workers.dev";

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

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

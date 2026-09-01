import type { Lang } from "./i18n";
import bundledRates from "../data/rates.json";

export type CurrencyCode = "CNY" | "USD" | "EUR" | "KRW" | "JPY" | "HKD" | "RUB" | "BRL" | "MXN";

export const LANG_CURRENCY: Record<Lang, CurrencyCode> = {
  en: "USD",
  zh: "CNY",
  ko: "KRW",
  ja: "JPY",
  "zh-HK": "HKD",
  ru: "RUB",
  fr: "EUR",
  pt: "BRL",
  es: "MXN",
};

export const CURRENCIES: CurrencyCode[] = ["CNY", "USD", "EUR", "KRW", "JPY", "HKD", "RUB", "BRL", "MXN"];

const ZERO_DECIMAL: ReadonlySet<CurrencyCode> = new Set(["KRW", "JPY"]);

const SYMBOLS: Record<CurrencyCode, string> = {
  CNY: "¥",
  USD: "$",
  EUR: "€",
  KRW: "₩",
  JPY: "¥",
  HKD: "HK$",
  RUB: "₽",
  BRL: "R$",
  MXN: "MX$",
};

export function currencyDecimals(code: CurrencyCode): number {
  return ZERO_DECIMAL.has(code) ? 0 : 2;
}

export interface FxRates {
  date: string;
  fetchedAt: number;
  source: "frankfurter" | "er-api" | "bundled" | "cache";
  rates: Record<string, number>;
}

export const RATES_TTL_MS = 24 * 60 * 60 * 1000;
const LS_KEY = "kdt-fx-rates";
const FETCH_TIMEOUT_MS = 8000;

const FRANKFURTER_URL =
  "https://api.frankfurter.dev/v2/rates?base=CNY&quotes=USD,EUR,KRW,JPY,HKD,RUB,BRL,MXN";
const ER_API_URL = "https://open.er-api.com/v6/latest/CNY";

export const BUNDLED_RATES: FxRates = bundledRates as FxRates;

export function parseFrankfurter(payload: unknown): Record<string, number> {
  if (!Array.isArray(payload)) throw new Error("malformed frankfurter response");
  const out: Record<string, number> = {};
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const { quote, rate } = row as { quote?: unknown; rate?: unknown };
    if (typeof quote === "string" && typeof rate === "number") out[quote] = rate;
  }
  if (Object.keys(out).length === 0) throw new Error("empty frankfurter rates");
  return out;
}

export function parseErApi(payload: unknown): Record<string, number> | null {
  if (!payload || typeof payload !== "object") return null;
  const { result, rates } = payload as { result?: unknown; rates?: unknown };
  if (result !== "success" || !rates || typeof rates !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rates)) {
    if (typeof v === "number") out[k.toUpperCase()] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn("fx fetch failed:", url, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLiveRates(): Promise<FxRates> {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const data = await fetchJson(FRANKFURTER_URL);
    return { date, fetchedAt: Date.now(), source: "frankfurter", rates: parseFrankfurter(data) };
  } catch {
    const data = await fetchJson(ER_API_URL);
    const rates = parseErApi(data);
    if (!rates) throw new Error("er-api bad payload");
    return { date, fetchedAt: Date.now(), source: "er-api", rates };
  }
}

export function loadCachedRates(): FxRates | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<FxRates>;
    if (!data || typeof data.date !== "string" || !data.rates || typeof data.rates !== "object") return null;
    const filled: FxRates = {
      date: data.date,
      fetchedAt: typeof data.fetchedAt === "number" ? data.fetchedAt : 0,
      source: (data.source ?? "cache") as FxRates["source"],
      rates: { ...BUNDLED_RATES.rates, ...(data.rates as Record<string, number>), CNY: 1 },
    };
    return filled;
  } catch {
    return null;
  }
}

function saveRates(r: FxRates) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(r));
  } catch (err) {
    console.debug("fx rates cache save failed", err);
  }
}

let inFlight: Promise<FxRates> | null = null;

export function getFxRates(force = false): Promise<FxRates> {
  const cached = loadCachedRates();
  if (!force && cached && Date.now() - cached.fetchedAt < RATES_TTL_MS) {
    return Promise.resolve(cached);
  }
  if (!force && inFlight) return inFlight;
  const p = fetchLiveRates()
    .then((r) => {
      const merged: FxRates = { ...r, rates: { ...BUNDLED_RATES.rates, ...r.rates, CNY: 1 } };
      saveRates(merged);
      inFlight = null;
      return merged;
    })
    .catch((err: unknown) => {
      inFlight = null;
      throw err;
    });
  inFlight = p;
  return p;
}

export function formatMoney(cnyAmount: number, currency: CurrencyCode, rates: Record<string, number>): string {
  const rate = currency === "CNY" ? 1 : (rates[currency] ?? 1);
  const value = cnyAmount * rate;
  const decimals = currencyDecimals(currency);
  const num = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
  return `${SYMBOLS[currency]}${num}`;
}

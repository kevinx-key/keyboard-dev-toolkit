import type { PricingConfig, OptionItem } from "./pricing-types";
import { parsePricingConfig } from "./pricing-types";
import bundledPricing from "../data/pricing.json";

/**
 * 计价配置加载器
 * 权威源: github.com/709208969/kindlestar-pricing 的 pricing.json
 * 加载优先级: localStorage 缓存 → 内嵌快照 (src/data/pricing.json)
 * 更新链路: jsDelivr data API 取最新 commit SHA → cdn.jsdelivr.net@SHA 拉内容
 *           → 兜底 raw.githubusercontent.com → 全部失败则明确报错
 */

const REPO = "709208969/kindlestar-pricing";
const FILE = "pricing.json";
const LS_KEY = "kdt-pricing-config";
const LS_META_KEY = "kdt-pricing-meta";
const FETCH_TIMEOUT_MS = 8000;

export interface PriceDiffItem {
  path: string;
  name: string;
  from: string;
  to: string;
}

export type PricingUpdateStatus = "updated" | "up_to_date" | "rejected" | "failed";

export interface PricingUpdateResult {
  status: PricingUpdateStatus;
  version: string;
  source?: string;
  message: string;
  diff?: PriceDiffItem[];
}

export interface PricingInfo {
  version: string;
  updatedAt: string;
  cachedAt: number | null;
  source: "cache" | "bundled";
}

/** 内嵌快照（发布时版本，离线兜底） */
export const BUNDLED_CONFIG: PricingConfig = parsePricingConfig(bundledPricing);

// ─── 版本比较 ───

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// ─── 配置 diff ───

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10000) / 10000));

/** 对比两份配置的价格差异（用于更新预览） */
export function diffConfigs(oldCfg: PricingConfig, newCfg: PricingConfig): PriceDiffItem[] {
  const items: PriceDiffItem[] = [];
  const push = (path: string, name: string, from: number, to: number) => {
    if (from !== to) items.push({ path, name, from: num(from), to: num(to) });
  };

  for (const item of newCfg.materials) {
    const old = oldCfg.materials.find((m) => m.key === item.key);
    if (old) {
      push(`materials.${item.key}.panelPrice`, `${item.name} 大板价`, old.panelPrice, item.panelPrice);
      push(`materials.${item.key}.partialPrice`, `${item.name} 料板价`, old.partialPrice, item.partialPrice);
    }
  }

  const oldRules = oldCfg.panelRules;
  const newRules = newCfg.panelRules;
  push("panelRules.panel.processFee", "大板加工费", oldRules.panel.processFee, newRules.panel.processFee);
  push("panelRules.partial.processFee", "料板加工费", oldRules.partial.processFee, newRules.partial.processFee);
  push("panelRules.wasteFactor", "板材利用率", oldRules.wasteFactor, newRules.wasteFactor);

  for (const [key, item] of Object.entries(newCfg.surfaceFinish)) {
    const old = oldCfg.surfaceFinish[key];
    if (!old) continue;
    const from = old.feePerPanel ?? old.fee ?? 0;
    const to = item.feePerPanel ?? item.fee ?? 0;
    push(`surfaceFinish.${key}`, item.name, from, to);
  }

  for (const item of newCfg.solderColors) {
    const old = oldCfg.solderColors.find((c) => c.key === item.key);
    if (old) {
      push(`solderColors.${item.key}`, item.name, old.feePerSqm, item.feePerSqm);
      push(`solderColors.${item.key}.smallBatchExtra`, `${item.name} 小批量加价`, old.smallBatchExtra ?? 0, item.smallBatchExtra ?? 0);
    }
  }

  const optionGroups: Array<[string, Record<string, OptionItem>]> = [
    ["communication", newCfg.options.communication],
    ["solder", newCfg.options.solder],
    ["logo", newCfg.options.logo],
    ["protection", newCfg.options.protection],
    ["test", newCfg.options.test],
    ["packaging", newCfg.options.packaging],
  ];
  const oldGroups: Record<string, Record<string, OptionItem>> = {
    communication: oldCfg.options.communication,
    solder: oldCfg.options.solder,
    logo: oldCfg.options.logo,
    protection: oldCfg.options.protection,
    test: oldCfg.options.test,
    packaging: oldCfg.options.packaging,
  };
  for (const [group, items] of optionGroups) {
    for (const [key, item] of Object.entries(items)) {
      const old = oldGroups[group]?.[key];
      if (!old) continue;
      const numeric = (o: OptionItem): [string, number] | null => {
        if (o.feePerPcs !== undefined) return ["feePerPcs", o.feePerPcs];
        if (o.feePerPcsPerKey !== undefined) return ["feePerPcsPerKey", o.feePerPcsPerKey];
        if (o.feePerOrder !== undefined) return ["feePerOrder", o.feePerOrder];
        if (o.feeFactor !== undefined) return ["feeFactor", o.feeFactor];
        return null;
      };
      const a = numeric(item);
      const b = numeric(old);
      if (a && b && a[0] === b[0]) push(`options.${group}.${key}`, item.name ?? key, b[1], a[1]);
    }
  }

  return items;
}

// ─── 本地缓存 ───

export function loadCachedConfig(): PricingConfig | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !("config" in data)) return null;
    const cfg = parsePricingConfig((data as { config: unknown }).config);
    return cfg;
  } catch {
    try {
      localStorage.removeItem(LS_KEY);
    } catch (e) {
      console.debug("pricing cache clear failed", e);
    }
    return null;
  }
}

function saveCache(config: PricingConfig) {
  const payload = { config, cachedAt: Date.now() };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
    localStorage.setItem(
      LS_META_KEY,
      JSON.stringify({ version: config._meta.version, cachedAt: Date.now() }),
    );
  } catch (e) {
    console.warn("pricing cache save failed", e);
  }
}

function loadMeta(): { version?: string; cachedAt?: number } {
  try {
    const raw = localStorage.getItem(LS_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 当前生效配置（缓存优先，无则内嵌快照） */
export function getCurrentConfig(): PricingConfig {
  return loadCachedConfig() ?? BUNDLED_CONFIG;
}

/** 当前价格信息（水印用） */
export function getPricingInfo(): PricingInfo {
  const cfg = getCurrentConfig();
  const meta = loadMeta();
  const cachedAt = typeof meta.cachedAt === "number" ? meta.cachedAt : null;
  return {
    version: cfg._meta.version,
    updatedAt: cfg._meta.updatedAt,
    cachedAt,
    source: cachedAt !== null ? "cache" : "bundled",
  };
}

// ─── 远程拉取 ───

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 从远程获取最新配置（raw 优先 → jsDelivr 兜底），已做 zod 校验 */
export async function fetchLatestPricing(): Promise<{ config: PricingConfig; source: string }> {
  // 1. raw.githubusercontent.com 优先（总是最新）
  try {
    const raw = await fetchJson(`https://raw.githubusercontent.com/${REPO}/main/${FILE}`);
    return { config: parsePricingConfig(raw), source: "github" };
  } catch (e) {
    console.debug("raw.githubusercontent fetch failed, falling back to jsdelivr", e);
  }

  // 2. cdn.jsdelivr.net @main（国内可达，可能带 CDN 缓存；旧内容由版本递增校验兜底拒绝）
  const raw = await fetchJson(`https://cdn.jsdelivr.net/gh/${REPO}@main/${FILE}`);
  return { config: parsePricingConfig(raw), source: "jsdelivr" };
}

// ─── 更新流程 ───

/** 检查是否有可用更新（不应用），返回结果含 diff */
export async function checkPricingUpdate(): Promise<PricingUpdateResult> {
  let latest: { config: PricingConfig; source: string };
  try {
    latest = await fetchLatestPricing();
  } catch (e) {
    return {
      status: "failed",
      version: getCurrentConfig()._meta.version,
      message: `获取失败: ${(e as Error).message}`,
    };
  }

  const current = getCurrentConfig();
  const cmp = compareVersions(latest.config._meta.version, current._meta.version);

  if (cmp <= 0) {
    return {
      status: cmp === 0 ? "up_to_date" : "rejected",
      version: latest.config._meta.version,
      source: latest.source,
      message:
        cmp === 0
          ? "已是最新价格"
          : `仓库版本 (${latest.config._meta.version}) 不高于本地 (${current._meta.version})，请确认仓库已递增 _meta.version`,
    };
  }

  return {
    status: "updated",
    version: latest.config._meta.version,
    source: latest.source,
    message: `发现新价格 v${latest.config._meta.version}（更新于 ${latest.config._meta.updatedAt}）`,
    diff: diffConfigs(current, latest.config),
  };
}

/** 应用更新（先 check，成功则写入缓存） */
export async function applyPricingUpdate(): Promise<PricingUpdateResult> {
  const result = await checkPricingUpdate();
  if (result.status !== "updated") return result;
  try {
    const latest = await fetchLatestPricing();
    saveCache(latest.config);
    return {
      ...result,
      message: `已更新到 v${result.version}（来源: ${latest.source}），下次启动生效`,
    };
  } catch (e) {
    return { ...result, status: "failed", message: `拉取失败，未应用: ${(e as Error).message}` };
  }
}

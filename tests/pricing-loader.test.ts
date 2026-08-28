import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLED_CONFIG,
  applyPricingUpdate,
  checkPricingUpdate,
  compareVersions,
  diffConfigs,
  fetchLatestPricing,
  getCurrentConfig,
  getPricingInfo,
  loadCachedConfig,
} from "../src/lib/pricing-loader";
import type { PricingConfig } from "../src/lib/pricing-types";

// ─── localStorage mock ───

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
});

// ─── fetch mock 工具 ───

function mockFetch(routes: Record<string, unknown>) {
  const fn = vi.fn(async (url: string) => {
    const body = routes[url];
    if (body === undefined) throw new Error(`unexpected url: ${url}`);
    return { ok: true, json: async () => body } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const RAW_URL = "https://raw.githubusercontent.com/709208969/kindlestar-pricing/main/pricing.json";
const CDN_URL = "https://cdn.jsdelivr.net/gh/709208969/kindlestar-pricing@main/pricing.json";

function newerConfig(version: string, priceDelta = 0): PricingConfig {
  const cfg = structuredClone(BUNDLED_CONFIG);
  cfg._meta = { ...cfg._meta, version, updatedAt: "2026-08-28" };
  cfg.materials = cfg.materials.map((m) =>
    m.key === "fr4" ? { ...m, panelPrice: m.panelPrice + priceDelta } : m,
  );
  return cfg;
}

function badConfig(): unknown {
  return { foo: "bar" };
}

describe("compareVersions", () => {
  it("semver 三级比较", () => {
    expect(compareVersions("1.0.0", "99.9.9")).toBeLessThan(0);
    expect(compareVersions("99.9.9", "1.0.0")).toBeGreaterThan(0);
    expect(compareVersions("1.1.0", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
  });
});

describe("diffConfigs", () => {
  it("材料价变化", () => {
    const cfg = newerConfig("1.1.0", 1);
    const items = diffConfigs(BUNDLED_CONFIG, cfg);
    expect(
      items.some((i) => i.path === "materials.fr4.panelPrice" && i.from === "198.6" && i.to === "199.6"),
    ).toBe(true);
  });

  it("表面处理费变化", () => {
    const cfg = structuredClone(BUNDLED_CONFIG);
    cfg._meta.version = "1.1.0";
    const enig = cfg.surfaceFinish.enig;
    if (enig) cfg.surfaceFinish.enig = { name: enig.name, feePerPanel: 200 };
    const items = diffConfigs(BUNDLED_CONFIG, cfg);
    expect(items.some((i) => i.path === "surfaceFinish.enig" && i.from === "180" && i.to === "200")).toBe(true);
  });

  it("颜色费变化", () => {
    const cfg = structuredClone(BUNDLED_CONFIG);
    cfg._meta.version = "1.1.0";
    cfg.solderColors = cfg.solderColors.map((c) =>
      c.key === "white" ? { ...c, feePerSqm: 25 } : c,
    );
    const items = diffConfigs(BUNDLED_CONFIG, cfg);
    expect(items.some((i) => i.path === "solderColors.white" && i.from === "22" && i.to === "25")).toBe(true);
  });

  it("无变化返回空数组", () => {
    expect(diffConfigs(BUNDLED_CONFIG, BUNDLED_CONFIG)).toHaveLength(0);
  });
});

describe("fetchLatestPricing", () => {
  it("raw 主链路优先", async () => {
    const cfg = newerConfig("99.9.9");
    const fn = mockFetch({ [RAW_URL]: cfg });
    const { config, source } = await fetchLatestPricing();
    expect(source).toBe("github");
    expect(config._meta.version).toBe("99.9.9");
    expect(fn).toHaveBeenCalledWith(RAW_URL, expect.anything());
  });

  it("raw 失败 → jsDelivr 兜底", async () => {
    const cfg = newerConfig("99.9.9");
    const fn = mockFetch({ [CDN_URL]: cfg });
    const { config, source } = await fetchLatestPricing();
    expect(source).toBe("jsdelivr");
    expect(config._meta.version).toBe("99.9.9");
    expect(fn.mock.calls.some((c) => String(c[0]).startsWith("https://cdn."))).toBe(true);
  });

  it("全部失败 → 抛错", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await expect(fetchLatestPricing()).rejects.toThrow();
  });

  it("非法配置（缺 _meta）→ 抛错", async () => {
    mockFetch({ [RAW_URL]: badConfig() });
    await expect(fetchLatestPricing()).rejects.toThrow();
  });
});

describe("checkPricingUpdate", () => {
  it("有新版本 → updated + diff", async () => {
    mockFetch({ [RAW_URL]: newerConfig("99.9.9", 1) });
    const r = await checkPricingUpdate();
    expect(r.status).toBe("updated");
    expect(r.version).toBe("99.9.9");
    expect(r.diff?.length).toBeGreaterThan(0);
  });

  it("版本相同 → up_to_date", async () => {
    mockFetch({ [RAW_URL]: newerConfig(BUNDLED_CONFIG._meta.version) });
    const r = await checkPricingUpdate();
    expect(r.status).toBe("up_to_date");
  });

  it("仓库版本更低 → rejected", async () => {
    mockFetch({ [RAW_URL]: newerConfig("1.9.0") });
    const r = await checkPricingUpdate();
    expect(r.status).toBe("rejected");
  });

  it("获取失败 → failed", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const r = await checkPricingUpdate();
    expect(r.status).toBe("failed");
  });
});

describe("缓存与生效配置", () => {
  it("无缓存 → 使用内嵌快照", () => {
    expect(loadCachedConfig()).toBeNull();
    expect(getCurrentConfig()._meta.version).toBe(BUNDLED_CONFIG._meta.version);
    expect(getPricingInfo().source).toBe("bundled");
  });

  it("applyPricingUpdate → 写入缓存并生效", async () => {
    mockFetch({ [RAW_URL]: newerConfig("99.9.9", 1) });
    const r = await applyPricingUpdate();
    expect(r.status).toBe("updated");
    expect(loadCachedConfig()?._meta.version).toBe("99.9.9");
    expect(getCurrentConfig()._meta.version).toBe("99.9.9");
    expect(getPricingInfo().source).toBe("cache");
    expect(getPricingInfo().cachedAt).toBeTypeOf("number");
  });

  it("缓存损坏 → 自动清除回退内嵌快照", () => {
    storage.set("kdt-pricing-config", "{bad json");
    expect(loadCachedConfig()).toBeNull();
    expect(getCurrentConfig()._meta.version).toBe(BUNDLED_CONFIG._meta.version);
  });

  it("缓存结构不合法 → 清除并回退", () => {
    storage.set("kdt-pricing-config", JSON.stringify({ config: { nope: 1 } }));
    expect(loadCachedConfig()).toBeNull();
    expect(getPricingInfo().source).toBe("bundled");
  });
});

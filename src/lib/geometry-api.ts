// geometry-api.ts — 云端几何 / STP 服务客户端（防复制计划 §G-B4）
//
// 端点由构建期注入 NEXT_PUBLIC_GEOMETRY_API_BASE（例：https://geo.example.com）。
// 未配置 → 关闭（STP 回落本地桌面版，保持"云端本地双版"过渡）。
//
// 异步作业：POST 入队 → 轮询 GET /jobs/{id} → 下载 STEP。
// 错误码：CLOUD_<code>（QUOTA_EXCEEDED / RATE_LIMITED / KILLSWITCH / ...）。

import { logger } from "./error-logger";
import { getTurnstileToken } from "./turnstile";

/**
 * 云端 base（惰性读取）。
 * web：构建期由 Next 内联 NEXT_PUBLIC_GEOMETRY_API_BASE。
 * tools/Node：运行时读 KDT_GEOMETRY_API_BASE（可导入后再注入 env），回落 NEXT_PUBLIC_…。
 */
function apiBase(): string {
  return (process.env.KDT_GEOMETRY_API_BASE || process.env.NEXT_PUBLIC_GEOMETRY_API_BASE || "").replace(/\/+$/, "");
}

/** 云端几何是否启用（构建期决定；web 侧使用） */
export const geometryCloudEnabled = apiBase().length > 0;

/** 单板 STEP 云端入参（S1：快照/参数入，服务端自算 stpData）。 */
export interface CloudStpRequest {
  kind: CloudKind;
  snapshot: unknown;
  params: Record<string, unknown>;
  thickness: number;
}

/** 装配图单个部件描述（S1：kind + 参数 + 落位；snapshot 由调用方共享传入）。 */
export interface CloudAssemblyPart {
  kind: CloudKind;
  params: Record<string, unknown>;
  thickness: number;
  dx: number;
  dy: number;
  dz: number;
}

export type CloudStpResult =
  | { ok: true; blob: Blob }
  | { ok: false; code: string };

const POLL_MS = 1500;
const MAX_WAIT_MS = 10 * 60 * 1000;

/** 通用作业流：POST 入队 → 轮询 → 下载字节。 */
async function enqueueAndPoll(
  path: string,
  body: unknown,
  onProgress?: (phase: string) => void,
): Promise<CloudStpResult> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = await getTurnstileToken();
    if (token) headers["X-Turnstile-Token"] = token;
    const create = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!create.ok) {
      const b = (await create.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, code: b?.code || String(create.status) };
    }
    const { jobId } = (await create.json()) as { jobId: string };
    onProgress?.("queued");

    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      if (Date.now() > deadline) return { ok: false, code: "TIMEOUT" };
      await new Promise((r) => setTimeout(r, POLL_MS));

      const s = (await fetch(`${apiBase()}/api/v1/geometry/jobs/${jobId}`).then((r) => r.json())) as {
        status: string;
        error?: string;
        downloadUrl?: string;
      };
      onProgress?.(s.status);

      if (s.status === "done") {
        const url = s.downloadUrl
          ? `${apiBase()}${s.downloadUrl}`
          : `${apiBase()}/api/v1/geometry/jobs/${jobId}/download`;
        const dl = await fetch(url);
        if (!dl.ok) return { ok: false, code: String(dl.status) };
        return { ok: true, blob: await dl.blob() };
      }
      if (s.status === "failed") return { ok: false, code: "GENERATE_FAILED" };
    }
  } catch (e) {
    logger.error("geometry cloud request failed", e);
    return { ok: false, code: "NETWORK" };
  }
}

/** 生成单板 STEP（云端）：客户端只传快照+参数，服务端自算 stpData（S1，§G-B5）。 */
export function generateStpCloud(
  req: CloudStpRequest,
  onProgress?: (phase: string) => void,
): Promise<CloudStpResult> {
  return enqueueAndPoll("/api/v1/geometry/stp", { ...req, engine: CLOUD_ENGINES[req.kind] }, onProgress);
}

/** 生成装配图 STEP（云端）：共享 snapshot + 部件描述，服务端逐部件自算 stpData 再装配。 */
export function generateAssemblyStpCloud(
  snapshot: unknown,
  parts: CloudAssemblyPart[],
  onProgress?: (phase: string) => void,
): Promise<CloudStpResult> {
  return enqueueAndPoll("/api/v1/geometry/assembly", { snapshot, parts }, onProgress);
}

// ── 高级 2D 几何：PCB / 定位板 / 轴下垫 / 底棉 / 轴间棉 云端生成（§G-B3 / M1·M2a）──
// 同步端点（非作业）：POST /api/v1/geometry/analyze → 200 { ok, engine, result }。
// 各生成器服务端与本地**逐字节等价**（服务端黄金用例回归）。离线/失败由调用方回落本地。

/** 云几何种类（须与服务端 `ENGINES` 键一致）。 */
export type CloudKind = "pcb" | "plate" | "pad" | "foam" | "switchfoam";

/** 各 kind 引擎/契约版本（变更即两仓同步升版）。 */
export const CLOUD_ENGINES: Record<CloudKind, string> = {
  pcb: "pcb@1",
  plate: "plate@2",
  pad: "pad@1",
  foam: "foam@1",
  switchfoam: "switchfoam@2",
};

export type CloudAnalyzeResult = { ok: true; result: unknown } | { ok: false; code: string };

/**
 * 高级 2D 几何生成（云端，同步）。返回对应生成器的 Result 对象。
 * `params` 须 JSON 可序列化（Set 请先转数组）；`snapshot` = KLELayout。
 */
export async function analyzeCloud(
  kind: CloudKind,
  snapshot: unknown,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<CloudAnalyzeResult> {
  if (!apiBase()) return { ok: false, code: "DISABLED" };
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = await getTurnstileToken();
    if (token) headers["X-Turnstile-Token"] = token;
    const res = await fetch(`${apiBase()}/api/v1/geometry/analyze`, {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({ kind, snapshot, params, engine: CLOUD_ENGINES[kind] }),
    });
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, code: b?.code || String(res.status) };
    }
    const data = (await res.json()) as { ok?: boolean; result?: unknown };
    if (!data?.ok || data.result === undefined) return { ok: false, code: "BAD_RESPONSE" };
    return { ok: true, result: data.result };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { ok: false, code: "ABORTED" };
    logger.error("geometry analyze request failed", e);
    return { ok: false, code: "NETWORK" };
  }
}

/**
 * 导出时取「云端权威几何」（§G-B3）。未配置云端 / 失败 → 返回 null，调用方回落本地结果。
 * 交互式预览**不走这里**（预览用本地同步计算，即时响应）。
 */
export async function fetchCloudGeometry<T>(
  kind: CloudKind,
  snapshot: unknown,
  params: Record<string, unknown>,
): Promise<T | null> {
  if (!apiBase()) return null;
  const res = await analyzeCloud(kind, snapshot, params);
  return res.ok ? (res.result as T) : null;
}

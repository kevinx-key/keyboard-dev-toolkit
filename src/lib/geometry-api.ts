// geometry-api.ts — 云端几何 / STP 服务客户端（防复制计划 §G-B4）
//
// 端点由构建期注入 NEXT_PUBLIC_GEOMETRY_API_BASE（例：https://geo.example.com）。
// 未配置 → 关闭（STP 回落本地桌面版，保持"云端本地双版"过渡）。
//
// 异步作业：POST 入队 → 轮询 GET /jobs/{id} → 下载 STEP。
// 错误码：CLOUD_<code>（QUOTA_EXCEEDED / RATE_LIMITED / KILLSWITCH / ...）。

import { logger } from "./error-logger";

const API_BASE = (process.env.NEXT_PUBLIC_GEOMETRY_API_BASE || "").replace(/\/+$/, "");

/** 云端几何是否启用（构建期决定） */
export const geometryCloudEnabled = API_BASE.length > 0;

export interface CloudStpInput {
  boundary: [number, number][];
  polyHoles?: [number, number][][];
  circleHoles?: [number, number, number][];
  modelPlacements?: unknown[];
}

export type CloudStpResult =
  | { ok: true; blob: Blob }
  | { ok: false; code: string };

const POLL_MS = 1500;
const MAX_WAIT_MS = 10 * 60 * 1000;

/** 生成 STEP（云端）：入队 → 轮询 → 下载字节。 */
export async function generateStpCloud(
  data: CloudStpInput,
  thickness: number,
  onProgress?: (phase: string) => void,
): Promise<CloudStpResult> {
  try {
    const create = await fetch(`${API_BASE}/api/v1/geometry/stp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data, thickness }),
    });
    if (!create.ok) {
      const body = (await create.json().catch(() => null)) as { code?: string } | null;
      return { ok: false, code: body?.code || String(create.status) };
    }
    const { jobId } = (await create.json()) as { jobId: string };
    onProgress?.("queued");

    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
      if (Date.now() > deadline) return { ok: false, code: "TIMEOUT" };
      await new Promise((r) => setTimeout(r, POLL_MS));

      const s = (await fetch(`${API_BASE}/api/v1/geometry/jobs/${jobId}`).then((r) => r.json())) as {
        status: string;
        error?: string;
        downloadUrl?: string;
      };
      onProgress?.(s.status);

      if (s.status === "done") {
        const url = s.downloadUrl ? `${API_BASE}${s.downloadUrl}` : `${API_BASE}/api/v1/geometry/jobs/${jobId}/download`;
        const dl = await fetch(url);
        if (!dl.ok) return { ok: false, code: String(dl.status) };
        return { ok: true, blob: await dl.blob() };
      }
      if (s.status === "failed") return { ok: false, code: "GENERATE_FAILED" };
    }
  } catch (e) {
    logger.error("generateStpCloud failed", e);
    return { ok: false, code: "NETWORK" };
  }
}

/**
 * STP 装配图导出桥接层
 * ==================================================
 *
 * 将多个部件 (定位板 / PCB / 轴间棉 / 轴下垫 / 底棉 …) 各自的 2D 挤出几何
 * 交给后端：逐部件挤出 → 挖孔 → 装配嵌入模型 → 按 (dx,dy,dz) 平移，
 * 最后合并写入**同一个** STEP 文件。
 *
 * S1（§G-B5）：云端只收「快照 + 部件描述（kind/参数/落位）」，由服务端自算
 * 各部件 stpData 再装配。**桌面不再本地生成 STP**（§G-A1b）→ 云端是唯一引擎。
 *
 * 对齐约定 (由调用方 AssemblySection 计算)：
 *   原点 = 定位板 esc 轴孔上顶面中心；
 *   各部件 dx/dy 相同 (esc 轴心对齐)，dz 决定该板在 Z 向的落位。
 */

import type { StpExtrudeData, StpProgressEvent } from "./stp-export";
import { geometryCloudEnabled, generateAssemblyStpCloud } from "./geometry-api";
import type {
  CloudAssemblyPart,
  CloudKeycapPlacement,
  CloudKind,
  CloudSwitchPlacement,
} from "./geometry-api";
import { saveFile } from "./platform-bridge";

/** 装配图中的一个部件（S1：kind + 参数 + 落位；snapshot 由调用方共享传入）。 */
export interface AssemblyPart {
  /** 几何种类（决定服务端用哪个生成器自算 stpData）。 */
  kind: CloudKind;

  /** 生成参数（与 /analyze 同形）。 */
  params: Record<string, unknown>;

  /** 挤出厚度 (mm) */
  thickness: number;

  /** 装配平移量 (mm)：X 右 / Y 上 / Z 垂直于板面 */
  dx: number;
  dy: number;
  dz: number;

  /** 本地 2D 挤出几何（Tauri 离线回落用）。 */
  data: StpExtrudeData | null;
}

export interface AssemblyExportResult {
  success: boolean;
  message: string;
}

/**
 * 将多个部件装配成一个 STP 文件并触发下载。
 *
 * @param snapshot   - 设计快照（KLELayout），各部件共用
 * @param parts      - 各部件描述 + 落位 + 本地回落几何
 * @param filename   - 下载文件名，例如 "my-keyboard_assembly.stp"
 * @param onProgress - 可选的进度回调
 * @param keycaps    - 键帽落位（各键的定位板开孔顶面中心 + 旋转；落位规则见
 *                     `lib/keycap-models.ts`）。空数组 = 不含键帽。
 * @param switches   - 轴体落位（各键的 PCB 轴孔上顶面圆心 + 旋转；落位规则见
 *                     `lib/switch-model.ts`）。空数组 = 不含轴体。
 */
export async function exportAssemblySTP(
  snapshot: unknown,
  parts: AssemblyPart[],
  filename: string,
  onProgress?: (evt: StpProgressEvent) => void,
  keycaps: CloudKeycapPlacement[] = [],
  switches: CloudSwitchPlacement[] = [],
): Promise<AssemblyExportResult> {
  if (parts.length === 0 && keycaps.length === 0 && switches.length === 0) {
    return { success: false, message: "assembly.needSelect" };
  }

  // 装配 STP 已上云（§G-B9/§G-A1b）：桌面不再本地生成。
  if (!geometryCloudEnabled) {
    return { success: false, message: "CLOUD_DISABLED" };
  }

  const cloudParts: CloudAssemblyPart[] = parts.map((p) => ({
    kind: p.kind,
    params: p.params,
    thickness: p.thickness,
    dx: p.dx,
    dy: p.dy,
    dz: p.dz,
  }));
  const r = await generateAssemblyStpCloud(
    snapshot,
    cloudParts,
    keycaps,
    switches,
    (phase) =>
      onProgress?.({
        percentage: phase === "done" ? 100 : phase === "running" ? 50 : 0,
        phase: 0,
        phaseLabel: phase,
        message: phase,
      }),
  );
  if (r.ok) {
    await saveFile(r.blob, { defaultName: filename, mimeType: "application/step" });
    return { success: true, message: "CLOUD_OK" };
  }
  return { success: false, message: `CLOUD_${r.code}` };
}

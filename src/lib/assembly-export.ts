/**
 * STP 装配图导出桥接层
 * ==================================================
 *
 * 将多个部件 (定位板 / PCB / 轴间棉 / 轴下垫 / 底棉 …) 各自的 2D 挤出几何
 * 交给 Rust 后端：逐部件挤出 → 挖孔 → 装配嵌入模型 → 按 (dx,dy,dz) 平移，
 * 最后合并写入**同一个** STEP 文件。
 *
 * 对齐约定 (由调用方 AssemblySection 计算)：
 *   原点 = 定位板 esc 轴孔上顶面中心；
 *   各部件 dx/dy 相同 (esc 轴心对齐)，dz 决定该板在 Z 向的落位。
 *
 * 数据流：
 *   AssemblySection → AssemblyPart[] → Tauri IPC
 *   → Rust cadrum (extrude + boolean + assemble + translate) → STEP 字节写盘
 */

import type { ModelPlacement, StpProgressEvent } from "./stp-export";
import { isTauri } from "./stp-export";

/** 装配图中的一个部件 */
export interface AssemblyPart {
  /** 外边界多边形，[[x,y], ...]，绝对布局 mm (Y 已取反)，首尾自动闭合 */
  boundary: [number, number][];

  /** 多边形孔洞 */
  polyHoles: [number, number][][];

  /** 圆形孔洞: [cx, cy, 半径] */
  circleHoles: [number, number, number][];

  /** 挤出厚度 (mm) */
  thickness: number;

  /** 装配平移量 (mm)：X 右 / Y 上 / Z 垂直于板面 */
  dx: number;
  dy: number;
  dz: number;

  /** 额外 3D 模型放置 (仅 PCB 层携带) */
  modelPlacements?: ModelPlacement[];
}

export interface AssemblyExportResult {
  success: boolean;
  message: string;
}

/**
 * 将多个部件装配成一个 STP 文件并触发下载。
 *
 * @param parts      - 各部件几何 + 厚度 + 平移量
 * @param filename   - 下载文件名，例如 "my-keyboard_assembly.stp"
 * @param onProgress - 可选的进度回调
 */
export async function exportAssemblySTP(
  parts: AssemblyPart[],
  filename: string,
  onProgress?: (evt: StpProgressEvent) => void,
): Promise<AssemblyExportResult> {
  if (parts.length === 0) {
    return { success: false, message: "assembly.needSelect" };
  }

  // ── 1. 平台检测 ──
  if (!(await isTauri())) {
    return { success: false, message: "DESKTOP_REQUIRED" };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { listen } = await import("@tauri-apps/api/event");

  // ── 2. 保存对话框 ──
  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: "STEP 3D Model", extensions: ["stp", "step"] }],
  });
  if (!filePath) {
    return { success: false, message: "cancelled" };
  }

  // ── 3. 实时进度监听 ──
  const unlisten = onProgress
    ? await listen<StpProgressEvent>("stp-progress", (event) => {
        onProgress(event.payload);
      })
    : null;

  try {
    // 大配列 STEP 可达数十 MB，由 Rust 端直接写盘，仅回传成功消息。
    const resultMsg: string = await invoke("generate_assembly_stp", {
      parts: parts.map((p) => ({
        boundary: p.boundary,
        polyHoles: p.polyHoles,
        circleHoles: p.circleHoles,
        thickness: p.thickness,
        dx: p.dx,
        dy: p.dy,
        dz: p.dz,
        modelPlacements: p.modelPlacements || [],
      })),
      outputPath: filePath,
    });

    return { success: true, message: resultMsg };
  } catch (err) {
    const msg = typeof err === "string" ? err : String(err);
    return { success: false, message: msg };
  } finally {
    if (unlisten) unlisten();
  }
}

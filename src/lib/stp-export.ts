/**
 * STP 3D 导出桥接层 (v2 — 纯 Rust / cadrum 后端)
 * ==================================================
 *
 * DXF 文本 → STP 固体模型的转换现在完全在 Tauri Rust 后端中完成，
 * 使用 cadrum (静态链接 OpenCASCADE) 直接：
 *   1. 拉伸外轮廓 (Solid::extrude)
 *   2. 布尔减法挖孔  (&solid - &hole)
 *   3. 导出为 STEP AP203 格式 (Solid::write_step)
 *
 * 用户无需安装 Python、ezdxf 或 cadquery。
 *
 * 改动的理由：
 *   之前的方案要求用户安装 Python + ezdxf + cadquery，这对于
 *   桌面应用程序来说体验很差。cadrum 将整个 OpenCASCADE CAD
 *   内核静态链接到 MSI 中，因此无需外部依赖。
 *
 * 数据流：
 *   前端组件 → StpExtrudeData (多边形坐标) → Tauri IPC
 *   → Rust cadrum → STEP 字节 → 浏览器下载
 */

import { geometryCloudEnabled, generateStpCloud, type CloudKind } from "./geometry-api";
import { saveFile } from "./platform-bridge";

// ═══════════════════════════════════════════════════════════════════
// 类型定义 —— 在前端组件与 Rust 后端间传递的几何数据
// ═══════════════════════════════════════════════════════════════════

/**
 * 单个 STP 挤出操作的几何输入。
 *
 * 所有坐标均以 mm 为单位，位于同一坐标系中
 * (与原始 plate-export / pcb-export 输出相同的绝对空间)。
 *
 * boundary 定义一个闭合的多边形，该多边形沿 Z 轴挤出形成底板。
 * 孔洞 (polyHoles & circleHoles) 随后从底板上减去。
 */
export interface ModelPlacement {
  /** Model type identifier */
  type: "hotswap" | "typec" | "4p" | "mcu" | "t4" | "rgb";
  /** Position X in absolute mm (PCB coordinate system, Y-up) */
  x: number;
  /** Position Y in absolute mm (PCB coordinate system, Y-up, negated) */
  y: number;
  /** Z-rotation in degrees */
  rotation: number;
  /** Z offset from PCB bottom (mm). Negative = below PCB, 0 = flush with PCB bottom. */
  zOffset: number;
  /** Flip 180° around X axis (for bottom-mounted components like Type-C/4P) */
  flip?: boolean;
}

export interface StpExtrudeData {
  /** 外边界多边形，[[x,y], [x,y], ...] — 必须闭合 (首尾自动闭合) */
  boundary: [number, number][];

  /** 多边形孔洞 (开关切口、卫星轴切口等)，每个为 [[x,y], ...] */
  polyHoles: [number, number][][];

  /** 圆形孔洞: 每个为 [cx, cy, 半径]，单位 mm */
  circleHoles: [number, number, number][];

  /** 额外 3D 模型放置 (热插拔轴座、Type-C、4P 连接器等) */
  modelPlacements?: ModelPlacement[];
}

/** STP 导出操作的返回结构 */
export interface StpExportResult {
  success: boolean;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════
// Tauri 环境检测 —— 在调用时评估，而非模块加载时
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════════════════════════════

export interface StpProgressEvent {
  percentage: number;
  phase: number;
  phaseLabel: string;
  message: string;
}

/** exportSTP 入参：云端只需快照+参数；`data` 仅用于本地桌面（Tauri）回落。 */
export interface StpExportInput {
  /** 本地 2D 挤出几何（来自生成器 stpData），Tauri 离线回落用。 */
  data: StpExtrudeData | null;
  /** 挤出厚度，mm（定位板 1.5 / PCB 1.6）。 */
  thickness: number;
  /** 几何种类（决定云端用哪个生成器自算 stpData）。 */
  kind: CloudKind;
  /** 设计快照（KLELayout）。 */
  snapshot: unknown;
  /** 生成参数（与 /analyze 同形）。 */
  params: Record<string, unknown>;
}

/**
 * 将键盘布局几何转为 3D STP 并触发下载。
 *
 * @param input      - { data(本地回落), thickness, kind, snapshot, params(云端自算) }
 * @param filename   - 下载文件名，例如 "my-keyboard_plate.stp"
 * @param onProgress - 可选进度回调
 */
export async function exportSTP(
  input: StpExportInput,
  filename: string,
  onProgress?: (evt: StpProgressEvent) => void,
): Promise<StpExportResult> {
  const { thickness, kind, snapshot, params } = input;

  // STP 已上云（§G-B9/§G-A1b）：**桌面不再本地生成**，云端是唯一引擎。
  // 未配置云端（构建期无 NEXT_PUBLIC_GEOMETRY_API_BASE）→ STP 不可用。
  if (!geometryCloudEnabled) {
    return { success: false, message: "CLOUD_DISABLED" };
  }

  const r = await generateStpCloud(
    { kind, snapshot, params, thickness },
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

/**
 * 把 exportSTP 返回的 message 本地化为用户可读文案（各组件统一调用）。
 * - "CLOUD_DISABLED"   → 未配置云端（STP 不可用）
 * - "CLOUD_OK"         → 云端成功
 * - "CLOUD_<code>"     → 云端失败（含错误码）
 */
export function localizeStpMessage(t: (key: string) => string, message: string): string {
  if (message === "CLOUD_DISABLED") return t("export.cloudRequired");
  if (message === "CLOUD_OK") return t("export.cloudSuccess");
  if (message.startsWith("CLOUD_")) return t("export.cloudError").replace("{{code}}", message.slice(6));
  return message;
}

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

/**
 * 运行时 Tauri 检测。
 *
 * 在 Tauri v2 中，`window.__TAURI_INTERNALS__` 由 Tauri 运行时
 * 在任何页面脚本执行之前注入。`@tauri-apps/api` 包在初始化时
 * 也会设置 `window.__TAURI__`，但这仅在显式 `import` 之后发生。
 * 检查 `__TAURI_INTERNALS__` 是最可靠的一次性检测方法。
 *
 * 同时检查 `window.__TAURI__` 作为快速路径，
 * 适用于 API 已经被引导的情况 (例如本标签页中首次 import 之后)。
 */
async function isTauri(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const win = window as unknown as Record<string, unknown>;

  // 快速路径: Tauri API 已经引导 (由 @tauri-apps/api 在首次 import 时设置)
  if (win.__TAURI__) return true;

  // 可靠路径: Tauri v2 向每个 WebView 注入 __TAURI_INTERNALS__
  if (win.__TAURI_INTERNALS__) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════════
// 主导出函数
// ═══════════════════════════════════════════════════════════════════

export interface StpProgressEvent {
  percentage: number;
  phase: number;
  phaseLabel: string;
  message: string;
}

/**
 * 将键盘布局几何数据转换为 3D STP 文件并触发下载。
 *
 * @param data       - 多边形/圆形几何数据 (来自 plate-export 或 pcb-export)
 * @param thickness  - 挤出厚度，单位 mm (定位板 1.5mm, PCB 1.6mm)
 * @param filename   - 下载文件名，例如 "my-keyboard_plate.stp"
 * @param onProgress - 可选的进度回调 (在 Tauri 模式下接收 Rust 端实时进度)
 */
export async function exportSTP(
  data: StpExtrudeData,
  thickness: number,
  filename: string,
  onProgress?: (evt: StpProgressEvent) => void,
): Promise<StpExportResult> {
  // ── 1. 平台检测 ──
  if (!(await isTauri())) {
    // UI 层据此标记用 t("export.requireDesktop") 渲染本地化文案
    return { success: false, message: "DESKTOP_REQUIRED" };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { listen } = await import("@tauri-apps/api/event");

  // ── 2. 保存对话框 —— 用户自行选择导出路径 ──
  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: "STEP 3D Model", extensions: ["stp", "step"] }],
  });
  if (!filePath) {
    return { success: false, message: "cancelled" };
  }

  // ── 2.5. 设置实时进度监听（Rust 端发射 stp-progress 事件）──
  const unlisten = onProgress
    ? await listen<StpProgressEvent>("stp-progress", (event) => {
        onProgress(event.payload);
      })
    : null;

  try {
    // ── 3. 调用 Rust 后端生成 STP 并直接写入磁盘 ──
    // 大配列 (104键) 的 STEP 文件可达 50-100MB+，
    // 通过 IPC 返回字符串会导致 JS 端 RangeError。
    // 因此将 outputPath 传给 Rust，由 Rust 端直接写盘。
    const resultMsg: string = await invoke("generate_stp", {
      data: {
        boundary: data.boundary,
        polyHoles: data.polyHoles,
        circleHoles: data.circleHoles,
        modelPlacements: data.modelPlacements || [],
      },
      thickness: thickness,
      outputPath: filePath,
    });

    return {
      success: true,
      message: resultMsg,
    };
  } catch (err) {
    const msg = typeof err === "string" ? err : String(err);
    return { success: false, message: msg };
  } finally {
    if (unlisten) unlisten();
  }
}

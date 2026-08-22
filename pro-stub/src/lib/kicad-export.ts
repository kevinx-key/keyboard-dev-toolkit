/**
 * KiCad 导出 — Pro 占位实现（stub）
 *
 * ⚠ 本文件是公开仓的占位实现，真实实现位于私有仓 keyboard-editor-pro，
 *   由 `node scripts/fetch-pro.mjs` 注入覆盖。禁止在此添加任何业务逻辑。
 * 签名必须与真实实现保持一致，否则公开仓类型检查会漂移。
 */

import type { KeyProps } from "./kle-types";
import type { MatrixResult } from "./matrix-types";
import type { PCBConfig } from "./pcb-export";

export interface KicadExportConfig {
  solderType: PCBConfig["solderType"];
  edgeDistance: PCBConfig["edgeDistance"];
  /** 键盘名称（用于 net 命名等） */
  keyboardName?: string;
}

/** Pro 版专属：真实实现在私有仓 */
export function generateKicadPCB(
  _keys: KeyProps[],
  _matrixResult: MatrixResult,
  _exportConfig: KicadExportConfig,
): string {
  throw new Error('KiCad 导出为专业版功能：请使用专业版构建（fetch-pro 注入后可用）');
}

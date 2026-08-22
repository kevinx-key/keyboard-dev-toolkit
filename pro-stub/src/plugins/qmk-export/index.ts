/**
 * QMK Export Plugin — Pro 占位实现（stub）
 *
 * ⚠ 本文件是公开仓的占位实现，真实实现位于私有仓 keyboard-editor-pro，
 *   由 `node scripts/fetch-pro.mjs` 注入覆盖。禁止在此添加任何业务逻辑。
 *
 * 职责：
 * 1. 提供与真实插件一致的类型/导出面，保证公开仓 clone 后零配置可编译
 * 2. 运行时兜底：免费版 UI 已由 isQmkExportEnabled() 门控，正常不会调用到这里
 */

import type { QmkExportConfig, QmkExportResult } from './types';

/** 与真实插件 getDefaultConfig() 保持一致的字段默认值 */
export function getDefaultConfig(): QmkExportConfig {
  return {
    keyboardName: 'My Keyboard',
    manufacturer: '自定义',
    maintainer: 'custom',
    url: '',
    mcu: 'STM32F072',
    diodeDirection: 'COL2ROW',
    viaEnabled: true,
    encoderEnabled: false,
    features: ['bootmagic', 'extrakey', 'mousekey', 'nkro'],
    layoutName: 'LAYOUT_60_ansi',
    vid: '0x4350',
    pid: '0x0001',
    deviceVersion: '1.0.0',
    oledEnabled: false,
  };
}

/** Pro 版专属：真实实现在私有仓。签名与真实实现保持一致 */
export function exportQmkFirmware(
  _keyProps: Array<{
    x: number;
    y: number;
    w?: number;
    h?: number;
    labels: string[];
    d?: boolean;
    r?: number;
    rx?: number;
    ry?: number;
    c?: string;
    t?: string;
  }>,
  _keyboardName: string,
  _config?: Partial<QmkExportConfig>,
): QmkExportResult {
  throw new Error('QMK 导出为专业版功能：请使用专业版构建（fetch-pro 注入后可用）');
}

/** Pro 版专属：模块版本号 */
export function getModuleVersion(): string {
  return '0.0.0-stub';
}

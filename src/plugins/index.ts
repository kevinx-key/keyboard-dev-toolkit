/**
 * Plugin System — 插件注册与加载
 *
 * 通过 QMK_PLUGIN_ENABLED 环境变量控制 QMK 导出模块是否包含在构建中。
 * 构建脚本在编译时设置此变量，实现 free/pro 两版本分发。
 */

// 此变量在构建时由 Tauri 脚本设置
// 标准版: QMK_PLUGIN_ENABLED=false
// 专业版: QMK_PLUGIN_ENABLED=true
const QMK_ENABLED =
  (typeof process !== 'undefined' && process.env?.QMK_PLUGIN_ENABLED === 'true') ||
  (typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__QMK_PLUGIN_ENABLED === true);

/** 已注册的插件列表 */
export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
}

const registeredPlugins: PluginInfo[] = [];

/**
 * 注册插件（由各插件模块在初始化时调用）
 */
export function registerPlugin(info: PluginInfo): void {
  const existing = registeredPlugins.findIndex((p) => p.id === info.id);
  if (existing >= 0) {
    registeredPlugins[existing] = info;
  } else {
    registeredPlugins.push(info);
  }
}

/**
 * 获取所有已注册且启用的插件
 */
export function getEnabledPlugins(): PluginInfo[] {
  return registeredPlugins.filter((p) => p.enabled);
}

/**
 * 获取所有已注册的插件
 */
export function getAllPlugins(): PluginInfo[] {
  return [...registeredPlugins];
}

/**
 * 按 ID 查找已注册的插件
 */
export function getPlugin(id: string): PluginInfo | undefined {
  return registeredPlugins.find((p) => p.id === id);
}

/**
 * 检查 QMK 导出模块是否可用
 */
export function isQmkExportEnabled(): boolean {
  return QMK_ENABLED;
}

/**
 * 初始化插件系统（在应用启动时调用）
 */
export function initPluginSystem(): void {
  if (QMK_ENABLED) {
    try {
      // 动态导入 QMK 插件（仅在启用时加载）
      const qmkPlugin = {
        id: 'qmk-export',
        name: 'QMK Firmware Export',
        version: '1.0.0',
        description: '从 KLE 布局生成可编译的 QMK 固件',
        enabled: true,
      };
      registerPlugin(qmkPlugin);
      console.log('[Plugin] QMK Export 模块已加载');
    } catch (e) {
      console.warn('[Plugin] QMK Export 模块加载失败:', e);
    }
  } else {
    console.log('[Plugin] QMK Export 模块未包含在构建中');
  }

  // 未来可在此注册其他插件...
}

/**
 * 获取当前构建版本类型
 */
export function getBuildVariant(): 'free' | 'pro' {
  return QMK_ENABLED ? 'pro' : 'free';
}

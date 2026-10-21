/**
 * DOM 小工具
 */

/**
 * 事件目标是否为可编辑控件（输入框 / 文本域 / 下拉框 / contentEditable）。
 *
 * 用途：全局键盘快捷键（F1/?、0 复位缩放、空格旋转、方向键移动等）
 * 必须先经过本守卫，否则用户在这些控件里打字时会误触编辑器操作。
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable === true;
}

/**
 * 是否有「全屏阻断层」正在显示（模态对话框 / 导出进度遮罩）。
 *
 * 这类遮罩打开时，页面背后的全局快捷键（Delete / 空格 / 方向键 / 0 / F1…）
 * 必须全部失效，否则会在看不见的画布上删除 / 旋转 / 移动对象。
 * 各模态与进度遮罩根节点统一标注 `data-ui-blocking="true"`。
 */
export function hasUiBlocker(): boolean {
  return typeof document !== "undefined" && document.querySelector('[data-ui-blocking="true"]') !== null;
}

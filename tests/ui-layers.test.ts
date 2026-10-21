import { describe, it, expect } from 'vitest';
import { Z_INDEX } from '@/lib/z-index';
import { isEditableTarget, hasUiBlocker } from '@/lib/dom-utils';

describe("UI 层叠约定（lib/z-index.ts）", () => {
  it("各层严格递增：画布 < 悬浮面板 < 浮层 < 菜单 < 模态 < 全屏", () => {
    expect(Z_INDEX.canvasOverlay).toBeLessThan(Z_INDEX.floatingPanel);
    expect(Z_INDEX.floatingPanel).toBeLessThan(Z_INDEX.popover);
    expect(Z_INDEX.popover).toBeLessThan(Z_INDEX.menu);
    expect(Z_INDEX.menu).toBeLessThan(Z_INDEX.modal);
    expect(Z_INDEX.modal).toBeLessThan(Z_INDEX.fullscreen);
  });
});

describe("isEditableTarget（全局快捷键守卫）", () => {
  it("识别 input / textarea / select / contentEditable", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isEditableTarget(document.createElement(tag))).toBe(true);
    }

    const div = document.createElement("div");
    expect(isEditableTarget(div)).toBe(false);

    Object.defineProperty(div, "isContentEditable", { value: true, configurable: true });
    expect(isEditableTarget(div)).toBe(true);

    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("hasUiBlocker（模态/遮罩打开时屏蔽全局快捷键）", () => {
  it("检测 data-ui-blocking 全屏遮罩", () => {
    expect(hasUiBlocker()).toBe(false);
    const el = document.createElement("div");
    el.dataset.uiBlocking = "true";
    document.body.appendChild(el);
    expect(hasUiBlocker()).toBe(true);
    el.remove();
    expect(hasUiBlocker()).toBe(false);
  });
});

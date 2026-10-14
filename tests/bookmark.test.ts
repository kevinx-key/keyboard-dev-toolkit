/**
 * 「添加到书签」守卫（顶栏按钮，2026-10-14 取代原「检查更新」入口）
 *
 * 背景：现代浏览器**不允许网页直接写书签**（无标准 API，安全限制），
 * 所以 lib/bookmark.ts 的策略是「先试遗留 API，未命中则给最快路径」。
 * 本测试守住：遗留 API 判定、快捷键/环境判定、9 语言文案、顶栏接线不回退。
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { DICT, type Lang } from "../src/lib/i18n";
import { WEB_APP_URL, bookmarkEnv, bookmarkShortcut, tryAddBookmark } from "../src/lib/bookmark";

const ALL_LANGS: Lang[] = ["en", "zh", "zh-HK", "ko", "ja", "ru", "fr", "pt", "es"];

describe("tryAddBookmark（遗留 API）", () => {
  it("Firefox ≤22 的 window.sidebar.addPanel 命中并返回 true", () => {
    const calls: Array<[string, string]> = [];
    const host = { sidebar: { addPanel: (url: string, title: string) => { calls.push([url, title]); } } };
    expect(tryAddBookmark(host, "https://x/", "Title")).toBe(true);
    expect(calls).toEqual([["https://x/", "Title"]]);
  });

  it("旧 IE / 旧 Edge 的 window.external.AddFavorite 命中并返回 true", () => {
    const calls: Array<[string, string]> = [];
    const host = { external: { AddFavorite: (url: string, title: string) => { calls.push([url, title]); } } };
    expect(tryAddBookmark(host, "https://y/", "T2")).toBe(true);
    expect(calls).toEqual([["https://y/", "T2"]]);
  });

  it("现代浏览器（无遗留 API）返回 false（由 UI 引导快捷键）", () => {
    expect(tryAddBookmark({}, "https://x/", "t")).toBe(false);
    expect(tryAddBookmark(null, "https://x/", "t")).toBe(false);
    expect(tryAddBookmark(undefined, "https://x/", "t")).toBe(false);
  });

  it("浏览器抛错（Safari 对 window.external 敏感）时吞掉异常返回 false", () => {
    const host = { external: { AddFavorite: () => { throw new Error("blocked"); } } };
    expect(tryAddBookmark(host, "https://x/", "t")).toBe(false);
  });
});

describe("bookmarkShortcut（快捷键随系统）", () => {
  it("macOS / iOS → ⌘ + D", () => {
    expect(bookmarkShortcut("MacIntel", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("⌘ + D");
    expect(bookmarkShortcut("iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("⌘ + D");
  });

  it("Windows / Linux / Android → Ctrl + D", () => {
    expect(bookmarkShortcut("Win32", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Ctrl + D");
    expect(bookmarkShortcut("Linux x86_64", "Mozilla/5.0 (X11; Linux x86_64)")).toBe("Ctrl + D");
  });
});

describe("bookmarkEnv（引导形态）", () => {
  it("Tauri 桌面版优先判为 tauri（webview 无书签栏）", () => {
    expect(bookmarkEnv(true, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "Win32")).toBe("tauri");
  });

  it("手机 / 平板 → touch（走浏览器菜单引导）", () => {
    expect(bookmarkEnv(false, "Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5, "Linux armv8l")).toBe("touch");
    expect(bookmarkEnv(false, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5, "iPhone")).toBe("touch");
  });

  it("iPadOS 13+ 伪装 MacIntel，靠触摸点数识别", () => {
    expect(bookmarkEnv(false, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5, "MacIntel")).toBe("touch");
  });

  it("桌面浏览器 → desktop（触屏笔记本仍有键盘，仍给快捷键）", () => {
    expect(bookmarkEnv(false, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 0, "Win32")).toBe("desktop");
    expect(bookmarkEnv(false, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10, "Win32")).toBe("desktop");
  });
});

describe("书签文案（9 语言齐备）", () => {
  const KEYS = [
    "topbar.bookmark", "tip.bookmark",
    "bookmark.hint", "bookmark.hintTouch", "bookmark.hintDesktop",
    "bookmark.dragTip", "bookmark.openWeb", "bookmark.copyLink", "bookmark.copied", "bookmark.added",
  ];

  for (const key of KEYS) {
    it(key, () => {
      for (const lang of ALL_LANGS) {
        expect(DICT[key]?.[lang], `${key} 缺 ${lang}`).toBeTruthy();
      }
    });
  }

  it("带快捷键占位符的文案都含 {shortcut}", () => {
    for (const key of ["bookmark.hint", "bookmark.hintDesktop"]) {
      for (const lang of ALL_LANGS) {
        expect(DICT[key]?.[lang], `${key}.${lang} 缺 {shortcut}`).toContain("{shortcut}");
      }
    }
  });
});

describe("顶栏接线", () => {
  const TOPBAR = readFileSync("src/components/TopBar.tsx", "utf-8");

  it("顶栏已换成「添加到书签」按钮", () => {
    expect(TOPBAR).toContain("BookmarkButton");
    expect(TOPBAR).toContain("topbar.bookmark");
    expect(TOPBAR).toContain("data-testid=\"topbar-bookmark\"");
  });

  it("顶栏不再有「检查更新」按钮，但更新组件保留（未来可恢复）", () => {
    expect(TOPBAR).not.toContain("topbar.update");
    expect(TOPBAR).not.toContain("<UpdateDialog");
    expect(existsSync("src/components/UpdateDialog.tsx")).toBe(true);
    expect(DICT["topbar.update"]).toBeTruthy();
  });

  it("网页版地址为 GitHub Pages（桌面版引导用）", () => {
    expect(WEB_APP_URL).toBe("https://kevinx-key.github.io/keyboard-dev-toolkit/");
  });
});

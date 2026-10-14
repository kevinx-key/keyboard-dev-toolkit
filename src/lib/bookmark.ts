// bookmark.ts — 「添加到书签」的浏览器现实封装
//
// 现实：现代浏览器（Chrome / Edge / Safari / 现代 Firefox）**不允许网页直接写书签**——
// 没有任何标准 API，出于安全考虑被封（这是浏览器行为，不是本项目缺功能）。因此策略是：
//   1. 先尝试遗留 API：Firefox ≤22 `window.sidebar.addPanel`、IE/旧 Edge `window.external.AddFavorite`，
//      命中即真的「一键加入书签」（现代浏览器不会命中）；
//   2. 未命中 → 由 UI 给出最快路径：按 Ctrl+D / ⌘+D（一次按键）、拖到书签栏、复制链接。
//
// 本模块只做纯计算 + 一层浏览器封装，便于单测（不依赖真实浏览器）。

import { getPlatform } from "./platform-bridge";

/** 网页版地址（GitHub Pages）：桌面版「在浏览器中打开网页版」用 */
export const WEB_APP_URL = "https://kevinx-key.github.io/keyboard-dev-toolkit/";

/** 遗留书签 API 的最小宿主形状（仅声明我们可能用到的两个方法） */
export interface LegacyBookmarkHost {
  sidebar?: { addPanel?: (url: string, title: string) => void };
  external?: { AddFavorite?: (url: string, title: string) => void };
}

/**
 * 尝试用遗留 API 直接写入书签。
 * @returns true = 已交给浏览器添加；false = 无可用 API（现代浏览器的常态）或调用被拒
 */
export function tryAddBookmark(host: LegacyBookmarkHost | null | undefined, url: string, title: string): boolean {
  if (!host) return false;
  try {
    const addPanel = host.sidebar?.addPanel;
    if (typeof addPanel === "function") {
      addPanel.call(host.sidebar, url, title); // Firefox ≤ 22
      return true;
    }
    const addFavorite = host.external?.AddFavorite;
    if (typeof addFavorite === "function") {
      addFavorite.call(host.external, url, title); // IE / 旧 Edge
      return true;
    }
  } catch {
    return false; // Safari 等对 window.external 敏感，可能直接抛错
  }
  return false;
}

/** 浏览器书签快捷键（macOS / iOS 为 ⌘+D，其余 Ctrl+D） */
export function bookmarkShortcut(platform: string, userAgent: string): string {
  return /mac|iphone|ipad|ipod/i.test(`${platform} ${userAgent}`) ? "⌘ + D" : "Ctrl + D";
}

/** 书签环境：桌面浏览器 / 触屏（手机平板）/ Tauri 桌面版（webview 无书签栏） */
export type BookmarkEnv = "desktop" | "touch" | "tauri";

/** 环境判定（纯函数）：Tauri 优先；手机/平板 → touch（iPadOS 13+ 伪装成 MacIntel，靠触摸点数识别） */
export function bookmarkEnv(isTauri: boolean, userAgent: string, maxTouchPoints: number, platform: string): BookmarkEnv {
  if (isTauri) return "tauri";
  const ua = userAgent.toLowerCase();
  const iPadOS = /mac/i.test(platform) && maxTouchPoints > 1;
  if (iPadOS || /android|iphone|ipad|ipod|mobile|windows phone|silk/.test(ua)) return "touch";
  return "desktop";
}

// ─── 浏览器侧封装（SSR 安全；只在客户端事件里产生副作用）─────────────

export function currentBookmarkEnv(): BookmarkEnv {
  if (typeof navigator === "undefined") return "desktop";
  return bookmarkEnv(getPlatform() === "tauri", navigator.userAgent, navigator.maxTouchPoints ?? 0, navigator.platform ?? "");
}

/** 要收藏的地址：桌面版引导到网页版，浏览器里就是当前页 */
export function currentBookmarkUrl(): string {
  if (typeof window === "undefined") return WEB_APP_URL;
  return currentBookmarkEnv() === "tauri" ? WEB_APP_URL : window.location.href;
}

export function currentBookmarkShortcut(): string {
  if (typeof navigator === "undefined") return "Ctrl + D";
  return bookmarkShortcut(navigator.platform ?? "", navigator.userAgent);
}

/**
 * 点击入口：先试遗留 API（现代浏览器恒 false），调用方据此决定是否展示引导面板。
 * @returns true = 已请求浏览器添加书签
 */
export function addCurrentPageToBookmarks(): boolean {
  if (typeof window === "undefined") return false;
  return tryAddBookmark(window as unknown as LegacyBookmarkHost, window.location.href, document.title);
}

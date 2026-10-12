// turnstile.ts — Cloudflare Turnstile 前端接入（§G-C1/C2）
//
// Sitekey 由构建期注入 NEXT_PUBLIC_TURNSTILE_SITE_KEY；未配置 → 关闭（返回 null）。
// 网关侧若配置了 TURNSTILE_SECRET 则强制校验，此时必须带上有效 token。
// 用法：云端 POST/GET 前调用 getTurnstileToken()，把返回值放进 X-Turnstile-Token 头。

import { logger } from "./error-logger";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

/** 前端 Turnstile 是否启用（构建期决定） */
export const turnstileEnabled = SITE_KEY.length > 0;

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const TOKEN_TIMEOUT_MS = 20000;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = () => {
        console.log("[turnstile] script loaded");
        resolve();
      };
      s.onerror = (e) => {
        console.error("[turnstile] script FAILED to load", SCRIPT_SRC, e);
        reject(new Error("turnstile script load failed"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

/**
 * 取一次性 Turnstile token（未配置 / 失败 / 超时 → null）。
 * Managed 模式：无交互时自动通过；需要交互时右下角会出现小验证框。
 */
export async function getTurnstileToken(): Promise<string | null> {
  if (!turnstileEnabled || typeof window === "undefined") return null;

  try {
    await loadScript();
  } catch (e) {
    logger.error("turnstile script failed", e);
    return null;
  }
  const api = window.turnstile;
  if (!api) return null;

  return new Promise<string | null>((resolve) => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:3000;background:#ffffff;padding:8px;" +
      "border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.25)";
    document.body.appendChild(box);

    let settled = false;
    let widgetId = "";
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      try {
        if (widgetId) api.remove(widgetId);
      } catch (e) {
        void e; // 组件可能已随页面移除，忽略
      }
      box.remove();
      resolve(token);
    };

    try {
      console.log("[turnstile] render start, sitekey=", SITE_KEY);
      widgetId = api.render(box, {
        sitekey: SITE_KEY,
        callback: (token: string) => {
          console.log("[turnstile] token received, len=", token.length);
          finish(token);
        },
        "error-callback": (code: string) => {
          console.error("[turnstile] error-callback code=", code);
          finish(null);
        },
        "timeout-callback": () => {
          console.error("[turnstile] timeout-callback");
          finish(null);
        },
      });
    } catch (e) {
      console.error("[turnstile] render threw", e);
      finish(null);
      return;
    }
    window.setTimeout(() => {
      console.error("[turnstile] hard timeout 20s (no token)");
      finish(null);
    }, TOKEN_TIMEOUT_MS);
  });
}

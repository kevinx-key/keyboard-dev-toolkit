/**
 * CSP 白名单守卫（安装版报价下拉全空的历史事故防线）
 *
 * Tauri 安装版 webview 强制 tauri.conf.json 的 connect-src；前端新增/更换 API 域名
 * 而忘记同步 CSP → 安装版 fetch 被拦截（dev 浏览器不注入 CSP，永远测不出来）。
 * 事故史：workers.dev → kindlestar.online 切换时漏更新（v1.0.52），下拉全空。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 会在 webview 里发起运行时 fetch 的前端文件（相对仓库根）
const FETCH_SOURCES = [
  "src/lib/quote-api.ts",
  "src/lib/currency.ts",
  "src/components/AiFloatingPanel.tsx",
];

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function httpsOrigins(code: string): string[] {
  const urls = [...stripComments(code).matchAll(/https:\/\/[^\s"'`)]+/g)].map((m) => m[0]);
  return [...new Set(urls.map((u) => new URL(u).origin))];
}

describe("Tauri CSP connect-src 白名单", () => {
  const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8")) as {
    app: { security: { csp: string } };
  };
  const connectSrc =
    config.app.security.csp.split(";").find((d) => d.trim().startsWith("connect-src")) ?? "";

  it("声明了 connect-src", () => {
    expect(connectSrc).not.toBe("");
  });

  for (const file of FETCH_SOURCES) {
    it(`${file} 的所有外网域名都在 connect-src 中`, () => {
      const origins = httpsOrigins(readFileSync(file, "utf-8"));
      expect(origins.length).toBeGreaterThan(0);
      for (const origin of origins) {
        expect(connectSrc, `${origin} 缺失 → 安装版请求会被 CSP 拦截`).toContain(origin);
      }
    });
  }
});

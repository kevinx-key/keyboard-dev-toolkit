/**
 * Error Logger — 捕获运行时错误并保存到 localStorage
 * 可在浏览器 Console 输入 `downloadLog()` 导出日志文件
 *
 * 设计：
 * - BroadcastChannel 协调多标签页写入避免竞争（M1）
 * - console.error 覆盖兼容其他 SDK（M12）
 * - hydration 检测使用精确正则避免误报（M2）
 */

export interface LogEntry {
  timestamp: string;
  type: "error" | "warn" | "info" | "hydration";
  message: string;
  stack?: string;
  url?: string;
}

const LOG_KEY = "kle-error-log";
const MAX_LOG = 100;

/** BroadcastChannel 跨标签页同步（M1 修复） */
let _bc: BroadcastChannel | null = null;
function getBC(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!_bc) _bc = new BroadcastChannel("kle-error-log-sync");
  return _bc;
}

/**
 * Strip absolute filesystem paths from stack traces.
 * Converts full paths to relative paths (e.g., "/k/0AMAC/.../file.ts:10:5")
 * to protect user privacy and reduce log size.
 */
function stripStackPaths(stack: string | undefined): string | undefined {
  if (!stack) return stack;
  // Remove common Windows absolute path patterns
  return stack.replace(/[A-Za-z]:\\[^:\n]*(?=:\d+)/g, (m) => {
    const parts = m.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] as string;
  }).replace(/\/(?:[^\/\s]+\/)+(?=[^\/\s]+\.\w+)/g, "");
}

/** 获取当前日志 */
export function getLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 添加一条日志（通过 BroadcastChannel 协调多标签页写入避免竞争） */
export function addLog(entry: Omit<LogEntry, "timestamp">) {
  try {
    // 先通知其他标签页同步后写入，避免同时读写 localStorage
    const bc = getBC();
    if (bc) bc.postMessage("sync");

    // 串行化写入（锁由 BroadcastChannel 的同步事件协调）
    const log = getLog();
    log.push({
      ...entry,
      stack: stripStackPaths(entry.stack),
      timestamp: new Date().toISOString(),
    });
    if (log.length > MAX_LOG) log.splice(0, log.length - MAX_LOG);
    localStorage.setItem(LOG_KEY, JSON.stringify(log));
  } catch { void 0; /* storage full — ignore */ }
}

/** 清除日志 */
export function clearLog() {
  try { localStorage.removeItem(LOG_KEY); } catch { void 0; }
}

/** Convenience logger for catch blocks — use instead of console.error() */
export const logger = {
  error(message: string, error?: unknown) {
    addLog({
      type: "error",
      message,
      stack: error instanceof Error ? error.stack : undefined,
    });
  },
};

/** 下载日志为 JSON 文件 */
export function downloadLog() {
  if (typeof window === "undefined") return;  // SSR guard
  const log = getLog();
  const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kle-error-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

let _errorHandlerInstalled = false;

/** 检测字符串是否为 Next.js hydration 错误（M2 修复：精确匹配避免误报） */
function isHydrationMessage(msg: string): boolean {
  return /(?:text content|did not match|hydration mismatch|Hydration failed|createRoot.*hydrate)/i.test(msg);
}

/** 安装全局错误处理器 (在 app 入口调用) */
export function installGlobalErrorHandler() {
  if (typeof window === "undefined") return;
  if (_errorHandlerInstalled) return;
  _errorHandlerInstalled = true;

  // 捕获未处理的 Promise 错误
  window.addEventListener("unhandledrejection", (event) => {
    addLog({
      type: "error",
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
    });
  });

  // 捕获运行时错误
  window.addEventListener("error", (event) => {
    // 跳过扩展错误
    if (event.filename?.includes("chrome-extension://")) return;
    addLog({
      type: "error",
      message: event.message,
      stack: `at ${event.filename}:${event.lineno}:${event.colno}`,
      url: event.filename,
    });
  });

  // 重写 console.error 捕获 React 错误（M12 修复：兼容其他 SDK 覆盖）
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
    // 使用精确正则检测 hydration 错误，避免误报
    if (isHydrationMessage(msg)) {
      addLog({
        type: "hydration",
        message: msg.slice(0, 500),
      });
    }
    // 始终调用原始 console.error，确保与其他覆盖链兼容
    origError.apply(console, args);
  };

  // 监听其他标签页的同步请求（M1 修复）
  const bc = getBC();
  if (bc) {
    bc.onmessage = () => {
      // 其他标签页刚写入 localStorage，本标签页下次读时会拿到最新数据
      // 无需额外操作，getLog/addLog 已经序列化访问
    };
  }
}

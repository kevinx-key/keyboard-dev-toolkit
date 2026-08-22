import { logger } from "./error-logger";

/**
 * Platform Bridge for KLE Editor
 *
 * Unified interface for file operations, clipboard, and app info
 * across Web, Tauri (Windows/Mac/Linux), and Capacitor (iOS/Android).
 *
 * Usage:
 *   import { platform, saveFile, openFile, writeClipboard } from "./platform-bridge";
 *   if (platform === "tauri") { ... }
 */

declare global {
  interface Window {
    __TAURI__?: unknown;
    Capacitor?: unknown;
  }
}

export type Platform = "web" | "tauri" | "capacitor";

/** Detect the current platform at runtime */
export function detectPlatform(): Platform {
  if (typeof window !== "undefined") {
    if (window.__TAURI__) return "tauri";
    if ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return "tauri";
    if (window.Capacitor) return "capacitor";
  }
  return "web";
}

/**
 * 惰性 platform getter（SSR 安全，每次调用廉价检测）
 * 替代模块级别 const platform（模块级别会在 SSR 导入时固定为 "web" 永不更新）
 */
export function getPlatform(): Platform {
  if (typeof window === "undefined") return "web";
  // 每次调用重新检测（极廉价：仅检查两个 window 属性）
  if (window.__TAURI__) return "tauri";
  if ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) return "tauri";
  if (window.Capacitor) return "capacitor";
  return "web";
}

/** @deprecated 请使用 getPlatform() — 此 const 在 SSR 时固定为 "web" 且永不更新 */
export const platform: Platform = detectPlatform();

// ─── Tauri dynamic imports ───────────────────────────────────────
async function getTauriDialog() {
  const { save, open } = await import("@tauri-apps/plugin-dialog");
  return { save, open };
}

async function getTauriFs() {
  const { writeTextFile, writeFile } = await import("@tauri-apps/plugin-fs");
  return { writeTextFile, writeFile };
}

// ─── File: Save ──────────────────────────────────────────────────

const FILE_FILTERS: Array<{ name: string; extensions: string[] }> = [
  { name: "SVG Image", extensions: ["svg"] },
  { name: "DXF CAD File", extensions: ["dxf"] },
  { name: "PNG Image", extensions: ["png"] },
  { name: "JPEG Image", extensions: ["jpg", "jpeg"] },
  { name: "JSON", extensions: ["json"] },
  { name: "All Files", extensions: ["*"] },
];

export type SaveFileOptions = {
  /** Default file name */
  defaultName?: string;
  /** MIME type for web download fallback */
  mimeType?: string;
};

/**
 * Save content to a file via system dialog.
 *
 * - **Tauri**: native Save dialog → write to chosen path, returns the saved path
 * - **Web / Capacitor**: create `<a download>` with Blob URL, returns null
 *
 * @returns The full path of the saved file (Tauri), or null (web / cancelled)
 */
export async function saveFile(
  content: string | Blob,
  options: SaveFileOptions = {},
): Promise<string | null> {
  const { defaultName = "keyboard-layout.svg", mimeType } = options;

  if (getPlatform() === "tauri") {
    try {
      const { save } = await getTauriDialog();
      const { writeTextFile, writeFile } = await getTauriFs();

      // Extract extension for file filter
      const ext = defaultName.split(".").pop() || "*";
      const filter = FILE_FILTERS.find((f) => f.extensions.includes(ext)) || FILE_FILTERS[FILE_FILTERS.length - 1]!;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [filter],
      });

      if (!filePath) return null; // cancelled

      if (typeof content === "string") {
        await writeTextFile(filePath, content);
      } else {
        // Binary Blob — use writeFile (Uint8Array) to avoid text corruption
        const buffer = await (content as Blob).arrayBuffer();
        await writeFile(filePath, new Uint8Array(buffer));
      }
      return filePath; // return saved path for display
    } catch (err) {
      // Fallback to web download if Tauri save fails
      console.warn("Tauri save failed, falling back to web download:", err);
      webDownload(content, defaultName, mimeType);
      return null;
    }
  } else {
    webDownload(content, defaultName, mimeType);
    return null;
  }
}

/** Web fallback: trigger browser download */
function webDownload(
  content: string | Blob,
  filename: string,
  mimeType?: string,
): void {
  const blob =
    typeof content === "string"
      ? new Blob([content], { type: mimeType || "text/plain" })
      : content;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── File: Open ──────────────────────────────────────────────────

export type OpenFileOptions = {
  /** Expected MIME types (for web file picker) */
  accept?: string;
  /** Whether to return the raw text content */
  readAsText?: boolean;
};

/**
 * Open a file via system dialog.
 *
 * - **Tauri**: native Open dialog → read file content
 * - **Web / Capacitor**: create `<input type="file">` → read as text
 */
export async function openFile(
  options: OpenFileOptions = {},
): Promise<string | null> {
  const { accept = ".json,.svg,.png,.jpg,.jpeg", readAsText = true } = options;

  if (getPlatform() === "tauri") {
    try {
      const { open } = await getTauriDialog();
      const { readTextFile } = await import("@tauri-apps/plugin-fs");

      const selected = await open({
        multiple: false,
        filters: [
          { name: "Layout Files", extensions: ["json", "svg", "png", "jpg", "jpeg", "kbd"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (selected && typeof selected === "string") {
        return await readTextFile(selected);
      }
      return null;
    } catch (err) {
      console.warn("Tauri open failed, falling back to web file picker:", err);
      return webOpenFile(accept, readAsText);
    }
  } else {
    return webOpenFile(accept, readAsText);
  }
}

/** Web fallback: create temporary file input */
function webOpenFile(
  accept: string,
  readAsText: boolean,
): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      document.body.removeChild(input); // 在 change 回调中移除，避免某些浏览器在 click 后立即移除导致文件选择器中止
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (readAsText) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      } else {
        resolve(URL.createObjectURL(file));
      }
    });
    document.body.appendChild(input);
    input.click();
  });
}

// ─── Clipboard ───────────────────────────────────────────────────

/**
 * Write text to clipboard.
 * Falls back to `document.execCommand("copy")` when
 * `navigator.clipboard` is unavailable (some WebViews).
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { logger.error("clipboard.writeText failed, trying fallback");
    // Fallback for older WebViews
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch { logger.error("clipboard execCommand fallback failed");
      return false;
    }
  }
}

// ─── File Association (.kbd) ─────────────────────────────────────

/**
 * Register the kle:// protocol handler.
 * On Tauri, this is configured via tauri.conf.json.
 * On Web, this registers a custom protocol handler via
 * `navigator.registerProtocolHandler`.
 */
export function registerProtocolHandler(): void {
  if (platform === "web" && navigator.registerProtocolHandler) {
    try {
      navigator.registerProtocolHandler(
        "web+kle",
        window.location.origin + "/?url=%s",
      );
    } catch { logger.error("registerProtocolHandler rejected");
    }
  }
}

// ─── App Info ────────────────────────────────────────────────────

/** 应用版本号（同步常量，用于 UI 直接展示） */
export const APP_VERSION = "1.0.26";

/**
 * Get the app version string.
 * Tauri: reads from Cargo.toml
 * Web: returns package.json version constant
 */
export async function getAppVersion(): Promise<string> {
  if (getPlatform() === "tauri") {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch { logger.error("getAppVersion failed");
      return APP_VERSION;
    }
  }
  return APP_VERSION;
}

// ─── Theming ─────────────────────────────────────────────────────

/**
 * Get the system's preferred color scheme.
 * Tauri: reads system theme via Rust backend
 * Web: reads prefers-color-scheme media query
 */
export function getSystemTheme(): "light" | "dark" | "system" {
  if (typeof window === "undefined") return "system";

  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    return mq.matches ? "dark" : "light";
  } catch { logger.error("matchMedia failed");
    return "system";
  }
}

// ─── Open in Browser (for external links) ────────────────────────

/**
 * Open an external URL in the system browser.
 * In Tauri, this avoids opening inside the WebView window.
 */
export async function openExternal(url: string): Promise<void> {
  if (getPlatform() === "tauri") {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch { logger.error("Tauri openUrl failed, falling back to window.open");
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

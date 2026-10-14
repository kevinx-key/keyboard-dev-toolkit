"use client";

import { useState, useRef, useEffect } from "react";
import { Keyboard, Globe, Palette, Check, ChevronDown, Bookmark, ExternalLink } from "lucide-react";
import { useI18n, type Lang, LANG_LABELS } from "../lib/i18n";
import { useTheme, THEME_LABELS, THEME_CLASSES, type Theme } from "../lib/theme";
import { openExternal, writeClipboard } from "../lib/platform-bridge";
import {
  WEB_APP_URL,
  addCurrentPageToBookmarks,
  currentBookmarkEnv,
  currentBookmarkShortcut,
  currentBookmarkUrl,
} from "../lib/bookmark";
import CompatLayerBar from "./CompatLayerBar";

const iconProps = { size: 13, strokeWidth: 2 } as const;

export default function TopBar() {
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className="kle-toolbar">
      {/* Brand */}
      <span className="kle-brand kle-brand-main">
        <Keyboard size={16} strokeWidth={2} />
        Keyboard Dev Toolkit
      </span>

      {/* 兼容区开关 + 不透明度（随顶栏常驻置顶） */}
      <span className="kle-sep" />
      <CompatLayerBar />

      {/* 右侧：书签 / 语言 / 主题 */}
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <BookmarkButton />
        <LangDropdown lang={lang} setLang={setLang} />
        <ThemeDropdown theme={theme} setTheme={setTheme} />
      </span>
    </div>
  );
}

TopBar.displayName = "TopBar";

// ─── 添加到书签 ──────────────────────────────────
// 2026-10-14：原「检查更新」按钮位置改为「添加到书签」（更新入口移除）。
// UpdateDialog 组件与 update.* 文案保留未删——需要恢复时在 TopBar 里重新挂载该组件即可。
//
// 浏览器不允许网页直接写书签（安全限制，无标准 API）：点击先试遗留 API
// （Firefox ≤22 / 旧 IE，见 lib/bookmark.ts），未命中则弹出最快路径面板：
// 快捷键（Ctrl+D / ⌘+D）、拖到书签栏、复制链接；桌面版引导到浏览器中的网页版。

function BookmarkButton() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 环境 / 地址 / 快捷键只在客户端有意义；弹层仅在点击后渲染（SSR 无水合差异）
  const env = currentBookmarkEnv();
  const shortcut = currentBookmarkShortcut();
  const url = currentBookmarkUrl();

  const handleClick = () => {
    if (addCurrentPageToBookmarks()) {
      // 遗留 API 命中：浏览器已接管
      setAdded(true);
      setOpen(true);
      window.setTimeout(() => setAdded(false), 2500);
      return;
    }
    setAdded(false);
    setOpen((v) => !v);
  };

  const handleCopy = async () => {
    if (await writeClipboard(url)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleOpenWeb = () => {
    void openExternal(WEB_APP_URL);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span
        className="kle-btn"
        onClick={handleClick}
        title={t("tip.bookmark")}
        data-testid="topbar-bookmark"
        style={{ cursor: "pointer" }}
      >
        <Bookmark {...iconProps} /> {t("topbar.bookmark")}
      </span>
      {open && (
        <div
          className="kle-dropdown"
          data-testid="bookmark-panel"
          style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 1000,
            width: 278, padding: "10px 12px",
            display: "flex", flexDirection: "column", gap: 8,
          }}
        >
          {added ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--theme-primary)", fontWeight: 600 }}>
              <Check size={13} strokeWidth={2.5} /> {t("bookmark.added")}
            </div>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: "var(--theme-text)", lineHeight: 1.6 }}>
                {env === "tauri"
                  ? t("bookmark.hintDesktop").replace("{shortcut}", shortcut)
                  : env === "touch"
                    ? t("bookmark.hintTouch")
                    : t("bookmark.hint").replace("{shortcut}", shortcut)}
              </div>
              {env === "desktop" && (
                <>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <span className="kle-kbd" style={{ fontSize: 12, padding: "3px 10px" }}>{shortcut}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--theme-text-muted)" }}>
                    {t("bookmark.dragTip")}
                    <a
                      href={url}
                      draggable
                      onClick={(e) => e.preventDefault()}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 4,
                        padding: "2px 8px", fontSize: 10.5, cursor: "grab", textDecoration: "none",
                        color: "var(--theme-text)", border: "1px solid var(--theme-border-input)",
                        borderRadius: "var(--theme-radius-sm)", background: "var(--theme-surface)",
                      }}
                    >
                      <Bookmark size={10} /> Keyboard Dev Toolkit
                    </a>
                  </div>
                </>
              )}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {env === "tauri" && (
                  <button className="kle-btn" onClick={handleOpenWeb} style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
                    <ExternalLink size={11} /> {t("bookmark.openWeb")}
                  </button>
                )}
                <button className="kle-btn" onClick={() => void handleCopy()} style={{ padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>
                  {copied ? t("bookmark.copied") : t("bookmark.copyLink")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Language Dropdown ──────────────────────────

function LangDropdown({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ALL_LANGS: Lang[] = ["en", "zh", "ko", "ja", "zh-HK", "ru", "fr", "pt", "es"];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span className="kle-btn" onClick={() => setOpen(!open)} title={t("tip.language")} style={{ cursor: "pointer" }}>
        <Globe {...iconProps} /> {LANG_LABELS[lang]} <ChevronDown size={11} />
      </span>
      {open && (
        <div className="kle-dropdown" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, minWidth: 132 }}>
          {ALL_LANGS.map((l) => (
            <button key={l} className={`kle-dropdown-item${l === lang ? " active" : ""}`}
              onClick={() => { setLang(l); setOpen(false); }}>
              {l === lang && <Check size={11} strokeWidth={2.5} style={{ marginRight: 4 }} />}
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Theme Dropdown ──────────────────────────

function ThemeDropdown({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const ALL_THEMES: Theme[] = [...THEME_CLASSES] as Theme[];

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <span className="kle-btn" onClick={() => setOpen(!open)} title={t("tip.theme")} style={{ cursor: "pointer" }}>
        <Palette {...iconProps} /> {THEME_LABELS[theme]} <ChevronDown size={11} />
      </span>
      {open && (
        <div className="kle-dropdown" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 1000, minWidth: 170 }}>
          {ALL_THEMES.map((t) => (
            <button key={t} className={`kle-dropdown-item${t === theme ? " active" : ""}`}
              onClick={() => { setTheme(t); setOpen(false); }}>
              {t === theme && <Check size={11} strokeWidth={2.5} style={{ marginRight: 4 }} />}
              {THEME_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

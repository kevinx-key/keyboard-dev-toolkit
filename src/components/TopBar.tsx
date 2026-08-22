"use client";

import { useState, useRef, useEffect } from "react";
import { Keyboard, Globe, Palette, Check, ChevronDown, RefreshCw } from "lucide-react";
import { useI18n, type Lang, LANG_LABELS } from "../lib/i18n";
import { useTheme, THEME_LABELS, THEME_CLASSES, type Theme } from "../lib/theme";
import { getPlatform, openExternal } from "../lib/platform-bridge";
import UpdateDialog from "./UpdateDialog";

const iconProps = { size: 13, strokeWidth: 2 } as const;

const GITHUB_RELEASES_URL = "https://github.com/709208969/keyboard-dev-toolkit/releases";

export default function TopBar() {
  const { lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [updateOpen, setUpdateOpen] = useState(false);

  const handleUpdateClick = () => {
    if (getPlatform() === "tauri") {
      setUpdateOpen(true);
    } else {
      void openExternal(GITHUB_RELEASES_URL);
    }
  };

  return (
    <div className="kle-toolbar">
      {/* Brand */}
      <span className="kle-brand kle-brand-main">
        <Keyboard size={16} strokeWidth={2} />
        Keyboard Dev Toolkit
      </span>

      {/* 右侧：更新 / 语言 / 主题 */}
      <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          className="kle-btn"
          onClick={handleUpdateClick}
          title={t("tip.update")}
          style={{ cursor: "pointer" }}
        >
          <RefreshCw {...iconProps} /> {t("topbar.update")}
        </span>
        <LangDropdown lang={lang} setLang={setLang} />
        <ThemeDropdown theme={theme} setTheme={setTheme} />
      </span>

      <UpdateDialog open={updateOpen} onClose={() => setUpdateOpen(false)} />
    </div>
  );
}

TopBar.displayName = "TopBar";

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

  const ALL_LANGS: Lang[] = ["en", "zh", "ko", "ja", "zh-TW", "ru", "fr", "pt", "es"];

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

"use client";

import { logger } from "./error-logger";
import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────

export type Theme = "classic" | "dark" | "material" | "future" | "business";

export const THEME_LABELS: Record<Theme, string> = {
  classic: "Classic",
  dark: "Dark",
  material: "Material",
  future: "Future Tech",
  business: "Modern Business",
};

/** 主题 class 白名单 —— 与 layout.tsx 防 FOUC 内联脚本、EditorPage 同步 effect 保持一致 */
export const THEME_CLASSES = ["classic", "dark", "material", "future", "business"] as const;

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

// ─── React Context ─────────────────────────────────────

const ThemeContext = createContext<ThemeContextValue>({
  theme: "classic",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 同步读取 localStorage 作为 initial state，与布局文件的同步内联脚本保持一致
  // 注释：内联 script 处理水合前，此处保证 React 状态初始值与之匹配，防止 theme 应用 useEffect 覆盖正确的 class
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem("kle-theme") as Theme | null;
      if (saved && (THEME_CLASSES as readonly string[]).includes(saved)) return saved;
    } catch { logger.error("localStorage unavailable during theme init"); }
    return "classic";
  });

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    // Persist to localStorage
    try { localStorage.setItem("kle-theme", t); } catch (err) { logger.error("localStorage setItem failed", err); }
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    const root = document.documentElement;
    for (const c of THEME_CLASSES) root.classList.remove(`theme-${c}`);
    const themeClass = `theme-${theme}`;
    root.classList.add(themeClass);
    return () => {
      root.classList.remove(themeClass);
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

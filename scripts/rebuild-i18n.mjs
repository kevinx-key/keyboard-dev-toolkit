// Regenerate i18n.tsx with all translations merged properly
// Uses .i18n-base.json for {en,zh} and .i18n-translations.json for new languages

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Read base entries
const base = JSON.parse(fs.readFileSync(path.join(root, ".i18n-base.json"), "utf8"));
const keys = Object.keys(base);
console.log("Base entries: " + keys.length);

// Read translations
const trans = JSON.parse(fs.readFileSync(path.join(root, ".i18n-translations.json"), "utf8"));
const newLangs = Object.keys(trans);
console.log("Translation languages: " + newLangs.join(", "));

function escapeJS(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
}

// Build the DICT lines - preserve order from base
const dictLines = [];
for (const key of keys) {
  const orig = base[key];
  let line = `  "${key}": { en: "${escapeJS(orig.en)}", zh: "${escapeJS(orig.zh)}"`;
  for (const lang of newLangs) {
    const text = trans[lang]?.[key];
    if (text) {
      const field = lang === "zh-TW" ? "zh-TW" : lang;
      line += `, "${field}": "${escapeJS(text)}"`;
    }
  }
  line += " },";
  dictLines.push(line);
}

const prefix = `"use client";

import React, { createContext, useContext, useState, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────

export type Lang = "en" | "zh" | "ko" | "ja" | "zh-TW" | "ru" | "fr" | "pt" | "es";

export const LANG_LABELS: Record<Lang, string> = {
  en: "EN",
  zh: "简体中文",
  ko: "한국어",
  ja: "日本語",
  "zh-TW": "繁體中文",
  ru: "Русский",
  fr: "Français",
  pt: "Português",
  es: "Español",
};

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

// ─── Dictionary ─────────────────────────────────────────

type DictEntry = { en: string; zh: string; ko?: string; ja?: string; "zh-TW"?: string; ru?: string; fr?: string; pt?: string; es?: string };
type Dict = Record<string, DictEntry>;

export const DICT: Dict = {
`;

const suffix = `};

// ─── React Context ─────────────────────────────────────

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  setLang: () => {},
  t: (key: string) => DICT[key]?.en ?? key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  const t = useCallback(
    (key: string): string => {
      const entry = DICT[key];
      if (!entry) return key;
      return entry[lang] ?? entry.en ?? key;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
`;

const newContent = prefix + dictLines.join("\n") + "\n" + suffix;
const i18nPath = path.join(root, "src/lib/i18n.tsx");
fs.writeFileSync(i18nPath, newContent, "utf8");
console.log("Done! Wrote " + dictLines.length + " dictionary entries");
console.log("New file size: " + newContent.length + " bytes");

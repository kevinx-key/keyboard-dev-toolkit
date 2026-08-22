// Merge translations from .i18n-translations.json into i18n.tsx

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const i18nPath = path.join(root, "src/lib/i18n.tsx");
let content = fs.readFileSync(i18nPath, "utf8");

const transPath = path.join(root, ".i18n-translations.json");
if (!fs.existsSync(transPath)) {
  console.error("Translation file not found. Run workflow first.");
  process.exit(1);
}

const translations = JSON.parse(fs.readFileSync(transPath, "utf8"));
const langs = Object.keys(translations);
console.log("Loaded translations for:", langs.join(", "));

function escapeJson(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

langs.forEach((lang) => {
  const langEntries = translations[lang];
  const keys = Object.keys(langEntries);
  let inserted = 0;
  const missing = [];

  keys.forEach((key) => {
    const text = langEntries[key];
    if (!text) return;

    // Build regex to find the dict entry with any existing language fields
    const keyPattern = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match: "key": { existing fields... }
    const re = new RegExp(`("${keyPattern}"\\s*:\\s*\\{[^}]+?)\\}(\\s*,?)`);
    const match = content.match(re);
    if (match) {
      const langField = lang === "zh-TW" ? '"zh-TW"' : `"${lang}"`;
      const insertion = `, ${langField}: "${escapeJson(text)}"`;
      content = content.replace(re, match[1] + insertion + "}" + match[2]);
      inserted++;
    } else {
      missing.push(key);
    }
  });

  console.log(`${lang}: inserted ${inserted}/${keys.length} entries`);
  if (missing.length > 0) {
    console.log(`  Missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "..." : ""}`);
  }
});

fs.writeFileSync(i18nPath, content, "utf8");
console.log("\nDone! Updated i18n.tsx");

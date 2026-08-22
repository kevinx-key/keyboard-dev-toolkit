"use client";

import { useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface CharsTabProps {
  onInsertChar?: (char: string) => void;
}

const CATEGORIES = [
  "ch.catCommon", "ch.catSymbols", "ch.catMath", "ch.catArrows",
  "ch.catGreek", "FontAwesome", "Unicode", "ch.catRecent",
];

const COMMON_CHARS = ["α", "β", "γ", "δ", "ε", "π", "σ", "τ", "φ", "ω", "←", "↑", "→", "↓", "⇧", "⌘", "⌥", "⌃", "⏎", "⇥", "∑", "∫", "√", "∞", "≠", "≈", "≤", "≥", "⊗", "⊕"];

const ic = { size: 12, strokeWidth: 2 } as const;

export function CharsTab({ onInsertChar }: CharsTabProps) {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState(0);

  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 240,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("ch.search")}</SectionHeader>
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          <span className="kle-input" style={{ flex: 1, fontSize: 11.5, color: "var(--theme-text-dim)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Search size={11} /> {t("ch.searchPh")}
          </span>
          <span className="kle-btn kle-btn-icon" style={{ cursor: "default" }}>
            <Search {...ic} />
          </span>
        </div>

        {/* Category micro-tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
          {CATEGORIES.map((cat, i) => (
            <span key={cat}
              onClick={() => setActiveCategory(i)}
              title={t("tip.charCat")}
              className={`kle-chip${i === activeCategory ? " active" : ""}`}
              style={{ padding: "2px 10px", fontSize: 10.5, borderRadius: "var(--theme-radius-sm)" }}
            >{t(cat)}</span>
          ))}
        </div>

        {/* Character grid */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
          {COMMON_CHARS.map((char) => (
            <span key={char}
              onClick={() => onInsertChar?.(char)}
              title={`${t("tip.insertChar")} ${char}`}
              className="kle-btn kle-btn-icon"
              style={{
                width: 26, height: 26, borderRadius: "var(--theme-radius-sm)",
                fontSize: 13, cursor: onInsertChar ? "pointer" : "default",
                fontFamily: "var(--theme-font-ui)",
              }}
            >{char}</span>
          ))}
        </div>
      </div>

      <div className="psec" style={{ ...psec, flex: 1, minWidth: 170 }}>
        <SectionHeader>{t("ch.insertOpt")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="kle-btn kle-btn-primary" style={{ fontSize: 11.5, cursor: "default" }}>{t("ch.appendToLegend")}</span>
          <span className="kle-btn" style={{ fontSize: 11.5, cursor: "default" }}>
            <CornerDownLeft {...ic} /> {t("ch.replaceLegend")}
          </span>
          <span className="kle-btn" style={{ fontSize: 11.5, cursor: "default" }}>{t("ch.insertAtPos")}</span>
        </div>
        <SectionHeader>{t("ch.history")}</SectionHeader>
        <div style={{ fontSize: 11, color: "var(--theme-text-dim)", fontFamily: "var(--theme-font-mono)" }}>
          α · ← · ⌘ · Enter · ∑
        </div>
      </div>
    </div>
  );
}

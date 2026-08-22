"use client";

import { Save, BookOpen } from "lucide-react";
import type { KLEMeta } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface CssTabProps {
  meta: KLEMeta;
  onSetMeta: (meta: Partial<KLEMeta>) => void;
}

export function CssTab({ meta, onSetMeta }: CssTabProps) {
  const { t } = useI18n();
  return (
    <div className="belt-inner" style={{ flexDirection: "column" }}>
      <SectionHeader>{t("css.title")}</SectionHeader>
      <textarea
        value={meta.css || ""}
        onChange={(e) => onSetMeta({ css: e.target.value })}
        placeholder={t("css.placeholderFull")}
        className="kle-textarea"
        title={t("tip.cssEditor")}
        style={{
          width: "100%", height: 160, fontSize: 11.5,
          fontFamily: "var(--theme-font-mono)",
          background: "var(--theme-bg-alt)", resize: "vertical",
          whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto", lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "space-between", alignItems: "center" }}>
        <button className="kle-btn kle-btn-primary" title={t("tip.cssApply")} style={{ fontSize: 11.5, cursor: "pointer" }}>
          <Save size={12} strokeWidth={2} /> {t("css.apply")}
        </button>
        <a style={{ fontSize: 10, color: "var(--theme-accent)", textDecoration: "underline", cursor: "default", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <BookOpen size={11} /> {t("css.mdnDoc")}
        </a>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useI18n } from "../lib/i18n";

/** 报价模块信任说明（PCBA 报价 / 定位板报价共用，放在报价结果区）。
 *  默认隐藏，用户点击标题才展开：说明报价来源与服务内容、免费开源承诺、隐私边界、可自行移除。 */
export default function PricingTrustNote() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const lines = [
    t("pricing.trust.line1"),
    t("pricing.trust.line2"),
    t("pricing.trust.line3"),
    t("pricing.trust.line4"),
    t("pricing.trust.line5"),
  ];

  return (
    <div style={{ marginTop: 10, borderTop: "1px solid var(--theme-border-light)", paddingTop: 8 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="pricing-trust-toggle"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          padding: 0,
          fontSize: 11,
          color: "var(--theme-text-muted)",
          cursor: "pointer",
          fontFamily: "var(--theme-font-ui)",
        }}
      >
        <ShieldCheck size={12} style={{ color: "var(--theme-primary)", flexShrink: 0 }} />
        {t("pricing.trust.title")}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 10.5, color: "var(--theme-text-muted)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 3 }}>
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

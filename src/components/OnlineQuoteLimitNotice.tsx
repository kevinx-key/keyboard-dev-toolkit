"use client";

import { AlertTriangle, MessageCircle, Mail } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { fill } from "../lib/pricing-i18n";
import { ONLINE_QUOTE_MAX_QTY } from "../lib/pricing-limits";

interface OnlineQuoteLimitNoticeProps {
  /** /api/meta 的 contacts（Discord / Email 人工报价入口） */
  contacts?: { discord?: string; email?: string } | null;
}

/**
 * 超出在线报价数量上限（> ONLINE_QUOTE_MAX_QTY PCS）时替代价格卡的提示：
 * 不显示在线价格、不提供下单入口，只引导人工报价（Discord / Email）。
 *
 * PCBA 计价 / 定位板计价共用。仅前端隐藏——计价与下单代码全部保留，
 * 见 `lib/pricing-limits.ts` 的开关说明。
 */
export default function OnlineQuoteLimitNotice({ contacts = null }: OnlineQuoteLimitNoticeProps) {
  const { t } = useI18n();
  const max = ONLINE_QUOTE_MAX_QTY;
  const discord = contacts?.discord;
  const email = contacts?.email;

  return (
    <div
      data-testid="pricing-qty-limit"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid rgba(var(--theme-warning-rgb), 0.35)",
        borderRadius: "var(--theme-radius-sm)",
        background: "rgba(var(--theme-warning-rgb), 0.08)",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--theme-warning)" }}>
        <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <b>{fill(t("pricing.qtyLimit.title"), { max })}</b>
          <div style={{ marginTop: 4, color: "var(--theme-text)", lineHeight: 1.6 }}>
            {fill(t("pricing.qtyLimit.body"), { max })}
          </div>
        </div>
      </div>
      {(discord || email) && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10.5, color: "var(--theme-text-muted)" }}>{t("pricing.manualQuoteContact")}</span>
          {discord && (
            <a
              className="kle-btn"
              href={discord}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="pricing-qty-limit-discord"
              style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <MessageCircle size={11} /> Discord
            </a>
          )}
          {email && (
            <a
              className="kle-btn"
              href={`mailto:${email}`}
              data-testid="pricing-qty-limit-email"
              style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <Mail size={11} /> Email
            </a>
          )}
        </div>
      )}
    </div>
  );
}

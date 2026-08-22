"use client";

import type { KeyProps } from "../../lib";
import { useI18n } from "../../lib/i18n";
import { SectionHeader } from "./shared/SectionHeader";

interface SummaryTabProps {
  keys: KeyProps[];
}

export function SummaryTab({ keys }: SummaryTabProps) {
  const { t } = useI18n();
  if (keys.length === 0) {
    return <div style={{ padding: 15, color: "var(--theme-text-muted)", fontSize: 13 }}>{t("summary.noKeys")}</div>;
  }

  const totalKeys = keys.length;
  const widthGroups: Record<string, number> = {};
  for (const k of keys) {
    const wKey = k.w !== undefined ? String(k.w) : "1";
    widthGroups[wKey] = (widthGroups[wKey] || 0) + 1;
  }
  const sortedWidths = Object.entries(widthGroups).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  const rotatedKeys = keys.filter((k) => k.r !== 0).length;
  const steppedKeys = keys.filter((k) => k.l).length;

  // Calculate physical dimensions
  const maxX = Math.max(...keys.map((k) => (k.x || 0) + (k.w || 1)));
  const maxY = Math.max(...keys.map((k) => (k.y || 0) + (k.h || 1)));
  const physW = (maxX * 19.05).toFixed(1);
  const physH = (maxY * 19.05).toFixed(1);

  const psec: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 200,
  };
  const cell: React.CSSProperties = { padding: "4px 10px" };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("summary.overview")}</SectionHeader>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <tbody>
            {[
              { label: t("summary.totalKeys"), value: totalKeys },
              { label: t("st.rows"), value: Math.round(maxY) },
              { label: t("st.colsWidest"), value: Math.round(maxX) },
              { label: t("st.physW"), value: physW },
              { label: t("st.physH"), value: physH },
              { label: t("summary.rotatedKeys"), value: rotatedKeys },
              { label: t("summary.steppedKeys"), value: steppedKeys },
            ].map((row) => (
              <tr key={row.label} style={{ borderBottom: "1px solid var(--theme-border-light)" }}>
                <td style={{ ...cell, color: "var(--theme-text-muted)" }}>{row.label}</td>
                <td style={{ ...cell, fontWeight: 600, textAlign: "right", fontFamily: "var(--theme-font-mono)" }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="psec" style={psec}>
        <SectionHeader>{t("summary.keycapDistribution")}</SectionHeader>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <tbody>
            {sortedWidths.map(([w, count]) => (
              <tr key={w} style={{ borderBottom: "1px solid var(--theme-border-light)" }}>
                <td style={{ ...cell, color: "var(--theme-text-muted)" }}>{w}u</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 600, fontFamily: "var(--theme-font-mono)" }}>{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

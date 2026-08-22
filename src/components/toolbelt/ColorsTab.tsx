"use client";

import type { KeyProps } from "../../lib";
import { parseLabelColor } from "../../lib/kle-types";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface ColorsTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const WARM_COLORS = ["#d44040", "#e07030", "#f0c040", "#e8a030", "#c83030"];
const COLD_COLORS = ["#4080d4", "#40a080", "#6040a0", "#80b0e0", "#50c0b0"];
const NEUTRAL_COLORS = ["#c8c8c8", "#888888", "#2a2a2a", "#ffffff", "#e0e0d8"];
const SPECIAL_COLORS = [
  "linear-gradient(135deg,#f0c040,#d44040)",
  "linear-gradient(135deg,#4080d4,#6040a0)",
  "linear-gradient(135deg,#40a080,#50c0b0)",
];

export function ColorsTab({ keys, selectedIds, onSetProp }: ColorsTabProps) {
  const { t } = useI18n();
  const selIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!) : -1;
  const key = selIdx >= 0 && selIdx < keys.length ? keys[selIdx] : null;
  const ids = [...selectedIds];
  const hasSelection = selectedIds.length > 0 && key !== null;

  const handleColorSelect = (hex: string) => {
    if (hasSelection) onSetProp(ids, "c", hex);
  };

  const curKeyColor = key?.c || "#c8c8c8";
  const curLabelColor = key ? parseLabelColor(key.labels[4] || "").color || key.t || "#1a1a1a" : "#1a1a1a";

  const ColorDot = ({ color, selected, onClick }: { color: string; selected?: boolean; onClick?: () => void }) => (
    <span
      onClick={onClick}
      title={onClick ? `${t("tip.colorDot")} ${color}` : undefined}
      style={{
        width: 18, height: 18, borderRadius: "50%",
        border: `2px solid ${selected ? "var(--theme-selected)" : "var(--theme-border-input)"}`,
        borderWidth: selected ? 3 : 1,
        display: "inline-block", background: color,
        cursor: onClick ? "pointer" : "default",
        boxShadow: selected ? "0 0 0 2px var(--theme-selected-glow)" : "none",
        transition: "border-color 0.12s ease, box-shadow 0.12s ease",
      }}
    />
  );

  const colorFamily = (name: string, colors: string[]) => (
    <div className="cfam" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
      <span style={{ flex: "0 0 36px", fontSize: 10, color: "var(--theme-text-muted)" }}>{name}</span>
      <div className="cdot" style={{ display: "flex", gap: 3 }}>
        {colors.map((c) => (
          <ColorDot key={c} color={c} selected={curKeyColor === c} onClick={() => handleColorSelect(c)} />
        ))}
      </div>
    </div>
  );

  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 220,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("ct.browser")}</SectionHeader>
        {colorFamily(t("ct.warm"), WARM_COLORS)}
        {colorFamily(t("ct.cold"), COLD_COLORS)}
        {colorFamily(t("ct.neutral"), NEUTRAL_COLORS)}
        <div className="cfam" style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
          <span style={{ flex: "0 0 36px", fontSize: 10, color: "var(--theme-text-muted)" }}>{t("ct.special")}</span>
          <div className="cdots" style={{ display: "flex", gap: 3 }}>
            {SPECIAL_COLORS.map((c, i) => (
              <span key={i} style={{ width: 22, height: 18, borderRadius: 3, border: "1px solid var(--theme-border-input)", display: "inline-block", background: c }} />
            ))}
          </div>
        </div>
      </div>

      <div className="psec" style={{ ...psec, flex: 1 }}>
        <SectionHeader>{t("ct.legendColor")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--theme-border-input)", display: "inline-block", background: curLabelColor, boxShadow: "var(--theme-shadow-1)" }}></span>
          <span className="kle-input" style={{ fontSize: 11, fontFamily: "var(--theme-font-mono)" }}>{curLabelColor}</span>
        </div>
        <div style={{ marginTop: 6, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {["#000000", "#333333", "#666666", "#ffffff"].map((c) => (
            <span key={c} className={`kle-chip${curLabelColor === c ? " active" : ""}`}
              style={{ padding: "2px 8px", fontSize: 10, borderRadius: "var(--theme-radius-sm)" }}>{c}</span>
          ))}
          <span className="kle-chip" style={{ padding: "2px 8px", fontSize: 10, borderRadius: "var(--theme-radius-sm)", cursor: "default" }}>{t("ct.eyedrop")}</span>
        </div>
      </div>

      <div className="psec" style={{ ...psec, flex: 1 }}>
        <SectionHeader>{t("ct.background")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--theme-border-input)", display: "inline-block", background: "#eeeeee" }}></span>
          <span className="kle-input" style={{ fontSize: 11, fontFamily: "var(--theme-font-mono)" }}>#eeeeee</span>
        </div>
        <SectionHeader style={{ marginTop: 8 }}>{t("ct.texture")}</SectionHeader>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {[t("ct.texNone"), t("ct.texCarbon"), t("ct.texWood"), t("ct.texMetal"), t("ct.texFabric")].map((s) => (
            <span key={s} className={`kle-chip${s === t("ct.texNone") ? " active" : ""}`}
              style={{ padding: "2px 8px", fontSize: 10, borderRadius: "var(--theme-radius-sm)", cursor: "default" }}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

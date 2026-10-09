"use client";

/** 顶栏内联「兼容区」控制：显示/隐藏兼容标记 + 标记不透明度。随顶栏常驻置顶。 */

import { useCompatLayer } from "../lib/compat-layer";
import { useI18n } from "../lib/i18n";

export default function CompatLayerBar() {
  const { t } = useI18n();
  const { open, opacity, toggle, setOpacity } = useCompatLayer();
  const pct = Math.round(opacity * 100);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        fontSize: 12,
        color: "var(--theme-text-muted)",
        fontFamily: "var(--theme-font-ui)",
      }}
    >
      <button
        type="button"
        onClick={toggle}
        data-testid="compat-toggle"
        aria-pressed={open}
        title={t("tip.compatToggle")}
        className="kle-btn"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          fontWeight: 600,
          border: "1px solid " + (open ? "var(--theme-primary)" : "var(--theme-border-input)"),
          background: open ? "var(--theme-primary)" : "var(--theme-surface)",
          color: open ? "var(--theme-text-inverse)" : "var(--theme-text)",
        }}
      >
        {t("compat.layerLabel")}: {open ? t("compat.on") : t("compat.off")}
      </button>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }} title={t("tip.compatOpacity")}>
        <span>{t("compat.opacityLabel")}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          data-testid="compat-opacity"
          onChange={(e) => setOpacity(parseInt(e.target.value, 10) / 100)}
          style={{ width: 110, cursor: "pointer" }}
        />
        <span
          style={{
            minWidth: 34,
            textAlign: "right",
            fontFamily: "var(--theme-font-mono)",
            color: "var(--theme-text)",
          }}
        >
          {pct}%
        </span>
      </label>
    </span>
  );
}

CompatLayerBar.displayName = "CompatLayerBar";

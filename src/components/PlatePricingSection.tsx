"use client";

import { useMemo, useState } from "react";
import { Copy, Ruler, AlertTriangle } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { calculatePlateQuote, type PlateQuote } from "../lib/price-calculator";
import { getCurrentConfig } from "../lib/pricing-loader";

interface PlatePricingSectionProps {
  /** 定位板成品尺寸（mm），来自定位板编辑器 plateResult；null = 未生成 */
  plateSize?: { width: number; height: number } | null;
}

const psec: React.CSSProperties = {
  border: "1px solid var(--theme-border-light)",
  borderRadius: "var(--theme-radius-md)",
  padding: "10px 12px",
  background: "var(--theme-surface-2)",
};

const inputStyle: React.CSSProperties = {
  width: 76,
  padding: "4px 6px",
  fontSize: 12,
  borderRadius: "var(--theme-radius-sm)",
  border: "1px solid var(--theme-border-input)",
  background: "var(--theme-surface)",
  color: "var(--theme-text)",
  fontFamily: "var(--theme-font-ui)",
};

/** 定位板独立报价（v2.6.0）：尺寸跟随定位板编辑器，独立数量；复用 PCB 板材逻辑，不计终端倍率 */
export default function PlatePricingSection({ plateSize = null }: PlatePricingSectionProps) {
  const { t } = useI18n();
  const cfg = useMemo(() => getCurrentConfig(), []);
  const [material, setMaterial] = useState(cfg.plate.materials[0]?.key ?? "");
  const [quantity, setQuantity] = useState(0);
  const [copied, setCopied] = useState(false);

  const resolvedL = plateSize ? Math.round(plateSize.width) : 0;
  const resolvedW = plateSize ? Math.round(plateSize.height) : 0;

  const quote = useMemo<PlateQuote | null>(
    () => calculatePlateQuote(cfg.panelRules, cfg.plate.materials, resolvedL, resolvedW, quantity, material),
    [cfg, resolvedL, resolvedW, quantity, material],
  );

  const qtyInvalid = quantity > 0 && quantity < 5;

  const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCopy = async () => {
    if (!quote || !quote.ok || !plateSize) return;
    const materialName = cfg.plate.materials.find((m) => m.key === material)?.name ?? material;
    const lines = [
      "定位板报价（独立）",
      `定位板尺寸: ${resolvedL} × ${resolvedW} mm（含辅助边: ${quote.chargeSizeMm.l} × ${quote.chargeSizeMm.w}）`,
      `定位板材质: ${materialName} · 数量: ${quote.effectiveQty} PCS${quote.wasteQty > 0 ? `（含报废 ${quote.wasteQty}）` : ""}`,
      `定位板: ${quote.mode === "panel" ? "大板" : "分料板"} × ${quote.sheets} 张（每张 ${quote.boardsPerSheet} 块）`,
      `定位板费用: ¥${quote.boardCost.toFixed(2)}`,
      `定位板单价: ¥${quote.unitPrice.toFixed(2)} / PCS`,
      `价格版本 v${cfg._meta.version} · ${new Date().toLocaleString("zh-CN")}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.debug("clipboard write failed", e);
    }
  };

  return (
    <div className="psec" style={{ ...psec, marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)", letterSpacing: 0.5, marginBottom: 6 }}>
        <Ruler size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
        {t("pricing.section.plateQuote")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
          {t("pricing.plateMaterial")}
          <br />
          <select style={{ ...inputStyle, width: 180 }} value={material} onChange={(e) => setMaterial(e.target.value)}>
            {cfg.plate.materials.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
          {t("pricing.plateQuantity")}
          <br />
          <input
            type="number"
            style={{ ...inputStyle, width: 76, opacity: plateSize ? 1 : 0.4, cursor: plateSize ? "text" : "not-allowed" }}
            min={5}
            step={5}
            disabled={!plateSize}
            value={quantity || ""}
            placeholder={plateSize ? "≥5" : ""}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
          {t("pricing.plateSizeLabel")}: {plateSize ? `${resolvedL} × ${resolvedW} mm` : t("pricing.plateSizeNone")}
        </span>
      </div>
      {!plateSize && (
        <div style={{ fontSize: 11, color: "var(--theme-text-dim)", marginBottom: 6 }}>{t("pricing.plateSizeDisabledTip")}</div>
      )}
      {qtyInvalid && (
        <div style={{ fontSize: 11, color: "var(--theme-danger)", marginBottom: 6 }}>⚠ {t("pricing.plateQtyMin")}</div>
      )}
      {quote && !quote.ok && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--theme-warning)", marginBottom: 6 }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{quote.reason}</div>
        </div>
      )}
      {quote && quote.ok && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 4 }}>
          <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>
            {quote.mode === "panel" ? t("pricing.mode.panel") : t("pricing.mode.partial")} × {quote.sheets} {t("pricing.sheets")}
            （{quote.boardsPerSheet} {t("pricing.perSheet")}）
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--theme-primary)" }}>
            ¥ {fmt(quote.boardCost)}
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--theme-text-muted)" }}>
              {" "}（{t("pricing.unit")} ¥ {fmt(quote.unitPrice)}/PCS）
            </span>
          </div>
          <button
            className="kle-btn"
            onClick={handleCopy}
            style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", marginLeft: "auto" }}
          >
            <Copy size={12} /> {copied ? t("pricing.copied") : t("pricing.copyQuote")}
          </button>
        </div>
      )}
    </div>
  );
}

PlatePricingSection.displayName = "PlatePricingSection";

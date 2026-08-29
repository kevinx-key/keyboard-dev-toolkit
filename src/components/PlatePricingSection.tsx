"use client";

import { useMemo, useState } from "react";
import { Copy, Ruler, AlertTriangle, MessageCircle, Mail } from "lucide-react";
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

/** 定位板独立报价（v2.6.0，v2.7.0 扩展）：
 * 尺寸默认跟随定位板编辑器、可手动修改（0 = 跟随）；独立数量；复用 PCB 板材逻辑；
 * 计价乘数 multiplier（默认 2.5）、加工费下限 minProcessFee（默认 300）；人工报价 Discord/Email 按钮 */
export default function PlatePricingSection({ plateSize = null }: PlatePricingSectionProps) {
  const { t } = useI18n();
  const cfg = useMemo(() => getCurrentConfig(), []);
  const [material, setMaterial] = useState(cfg.plate.materials[0]?.key ?? "");
  const [quantity, setQuantity] = useState(0);
  const [copied, setCopied] = useState(false);
  // v2.7.0 手动尺寸：>0 用手动值，0 = 跟随定位板编辑器
  const [manualL, setManualL] = useState(0);
  const [manualW, setManualW] = useState(0);

  const editorL = plateSize ? Math.round(plateSize.width) : 0;
  const editorW = plateSize ? Math.round(plateSize.height) : 0;
  const resolvedL = manualL > 0 ? manualL : editorL;
  const resolvedW = manualW > 0 ? manualW : editorW;
  const multiplier = cfg.plate.multiplier ?? 1;
  const minProcessFee = cfg.plate.minProcessFee ?? 0;

  const quote = useMemo<PlateQuote | null>(
    () => calculatePlateQuote(cfg.panelRules, cfg.plate.materials, resolvedL, resolvedW, quantity, material, multiplier, minProcessFee),
    [cfg, resolvedL, resolvedW, quantity, material, multiplier, minProcessFee],
  );

  const qtyInvalid = quantity > 0 && quantity < 5;

  const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCopy = async () => {
    if (!quote || !quote.ok) return;
    const materialName = cfg.plate.materials.find((m) => m.key === material)?.name ?? material;
    const lines = [
      "定位板报价（独立）",
      `定位板尺寸: ${resolvedL} × ${resolvedW} mm（含辅助边: ${quote.chargeSizeMm.l} × ${quote.chargeSizeMm.w}）`,
      `定位板材质: ${materialName} · 数量: ${quote.effectiveQty} PCS${quote.wasteQty > 0 ? `（含报废 ${quote.wasteQty}）` : ""}`,
      `定位板: ${quote.mode === "panel" ? "大板" : "分料板"} × ${quote.sheets} 张（每张 ${quote.boardsPerSheet} 块）`,
      `成本小计: ¥${quote.boardCost.toFixed(2)}（计价乘数 ×${quote.multiplier}）`,
      `总价: ¥${quote.totalPrice.toFixed(2)}`,
      `单价: ¥${quote.unitPrice.toFixed(2)} / PCS`,
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
        <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
          {t("pricing.lengthMm")}
          <br />
          <input
            type="number"
            style={{ ...inputStyle, width: 64, opacity: plateSize ? 1 : 0.4 }}
            min={1}
            disabled={!plateSize}
            value={resolvedL || ""}
            placeholder={editorL ? String(editorL) : ""}
            onChange={(e) => setManualL(Number(e.target.value))}
          />
        </label>
        <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
          {t("pricing.widthMm")}
          <br />
          <input
            type="number"
            style={{ ...inputStyle, width: 64, opacity: plateSize ? 1 : 0.4 }}
            min={1}
            disabled={!plateSize}
            value={resolvedW || ""}
            placeholder={editorW ? String(editorW) : ""}
            onChange={(e) => setManualW(Number(e.target.value))}
          />
        </label>
        <button
          className="kle-btn"
          onClick={() => {
            setManualL(0);
            setManualW(0);
          }}
          disabled={!plateSize}
          title={t("pricing.autoSizeTip")}
          style={{ padding: "4px 10px", fontSize: 11, cursor: plateSize ? "pointer" : "not-allowed", opacity: plateSize ? 1 : 0.5 }}
        >
          <Ruler size={12} /> {t("pricing.autoSize")}
        </button>
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
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--theme-primary)", lineHeight: 1.2 }}>
              ¥ {fmt(quote.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--theme-text-muted)" }}>/ PCS</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
              {t("pricing.total")}: ¥ {fmt(quote.totalPrice)}
              <span style={{ marginLeft: 6, color: "var(--theme-text-dim)" }}>
                （{t("pricing.rawTotal")} ¥ {fmt(quote.boardCost)} ×{quote.multiplier}）
              </span>
            </div>
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
      {/* v2.7.0 人工报价按钮 */}
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("pricing.manualQuoteContact")}</span>
        {cfg.contacts?.discord && (
          <a
            className="kle-btn"
            href={cfg.contacts.discord}
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <MessageCircle size={12} /> Discord
          </a>
        )}
        {cfg.contacts?.email && (
          <a
            className="kle-btn"
            href={`mailto:${cfg.contacts.email}`}
            style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <Mail size={12} /> Email
          </a>
        )}
      </div>
    </div>
  );
}

PlatePricingSection.displayName = "PlatePricingSection";

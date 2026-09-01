"use client";

import { useEffect, useState } from "react";
import { Copy, Ruler, AlertTriangle, MessageCircle, Mail, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { LANG_CURRENCY, formatMoney } from "../lib/currency";
import { useFxRates } from "../lib/use-fx-rates";
import { requestQuote, quoteUnavailable, QuoteServiceError, type QuoteRequest, type QuoteResponse, type MetaResponse, getMeta } from "../lib/quote-api";

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

/** 定位板独立报价（v2.6.0，v2.7.0 扩展；v1.1 接入 API）：
 * 默认折叠、点击展开；尺寸默认跟随定位板编辑器、可手动修改（0 = 跟随）；独立数量；
 * 报价经 /api/quote（plate 参数）；页面只显示交付数量/用板张数/总价/单价（不显示成本构成）；
 * 人工报价 Discord/Email 按钮 */
export default function PlatePricingSection({ plateSize = null }: PlatePricingSectionProps) {
  const { t, lang } = useI18n();
  const currency = LANG_CURRENCY[lang];
  const fx = useFxRates();
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [material, setMaterial] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [copied, setCopied] = useState(false);
  // v2.7.0 手动尺寸：>0 用手动值，0 = 跟随定位板编辑器
  const [manualL, setManualL] = useState(0);
  const [manualW, setManualW] = useState(0);
  const [plateQuote, setPlateQuote] = useState<{ quoting: boolean; error: string | null; resp: NonNullable<Extract<QuoteResponse, { ok: true }>["plate"]> | null }>({
    quoting: false,
    error: null,
    resp: null,
  });

  useEffect(() => {
    getMeta()
      .then((m) => { setMeta(m); setMaterial((cur) => cur || m.plateMaterials[0]?.key || ""); })
      .catch(() => {});
  }, []);

  const editorL = plateSize ? Math.round(plateSize.width) : 0;
  const editorW = plateSize ? Math.round(plateSize.height) : 0;
  const resolvedL = manualL > 0 ? manualL : editorL;
  const resolvedW = manualW > 0 ? manualW : editorW;

  const qtyInvalid = quantity > 0 && quantity < 5;

  // 防抖 500ms 请求 plate 报价（API 需主字段合法；用最小合法主参数，仅展示 plate 段）
  const serviceDownMsg = t("pricing.quoteServiceDown");
  useEffect(() => {
    if (!open || !plateSize) return;
    if (quantity < 5) return;
    const base: QuoteRequest = {
      lengthMm: 10, widthMm: 10, quantity: 5, material: "fr4", thicknessMm: 1.6,
      surfaceFinish: "hasl", solderColor: "green", communication: [], hotswap: false, encoderCount: 0,
      oled: false, rgb: false, logo: "none", protection: "standard", test: "none", packaging: [],
      keyCount: 61, subBoard: "none", cableType: "black", cableLengthMm: 0, firmware: [], tracing: "rounded",
      plateMaterial: material, plateLengthMm: resolvedL, plateWidthMm: resolvedW, plateQuantity: quantity,
    };
    const timer = setTimeout(() => {
      setPlateQuote((s) => ({ ...s, quoting: true, error: null }));
      requestQuote(base)
        .then((resp) => {
          if (!resp.ok) {
            setPlateQuote({ quoting: false, error: resp.reason, resp: null });
          } else {
            setPlateQuote({ quoting: false, error: null, resp: resp.plate ?? null });
          }
        })
        .catch((e: unknown) =>
          setPlateQuote({
            quoting: false,
            error: quoteUnavailable(e instanceof QuoteServiceError ? e.message : serviceDownMsg).reason,
            resp: null,
          }),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [open, plateSize, quantity, material, resolvedL, resolvedW, serviceDownMsg]);

  const fmtMoney = (cny: number) => formatMoney(cny, currency, fx.rates.rates);

  const handleCopy = async () => {
    if (!plateQuote.resp || !plateQuote.resp.ok) return;
    const materialName = meta?.plateMaterials.find((m) => m.key === material)?.name ?? material;
    const p = plateQuote.resp;
    const lines = [
      "定位板报价（独立）",
      `定位板尺寸: ${resolvedL} × ${resolvedW} mm`,
      `定位板材质: ${materialName} · 交付数量: ${p.deliveryQty ?? 0} PCS`,
      `预计用板张数: ${p.sheets ?? 0} 张`,
      `定位板总价: ${formatMoney(p.totalPrice ?? 0, currency, fx.rates.rates)}`,
      `定位板单价: ${formatMoney(p.unitPrice ?? 0, currency, fx.rates.rates)} / PCS（按实交 ${p.deliveryQty ?? 0} PCS 分摊）`,
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
      {/* v2.7.0 折叠/展开（与 PCB 报价页一致：不用时折叠、使用时展开） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          className="kle-btn kle-btn-success"
          onClick={() => setOpen((v) => !v)}
          data-testid="plate-quote-toggle"
          style={{ padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {t("pricing.section.plateQuote")}
        </button>
        <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-mono)" }}>
          v{meta?.version ?? "—"}
        </span>
      </div>

      {open && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 10, color: "var(--theme-text-dim)", marginTop: 8 }}>
            <span>{t("pricing.fxStatus")}: {currency}</span>
            <span style={{ fontFamily: "var(--theme-font-mono)" }}>
              {t("pricing.fxUpdated")} {fx.rates.date}
              {fx.status === "live" && fx.rates.source === "frankfurter" ? ` (${t("pricing.fxSource")} CBD)` : fx.status === "live" ? ` (${t("pricing.fxSource")} ER-API)` : fx.status === "cached" ? ` (${t("pricing.fxCached")})` : ` (${t("pricing.fxBundled")})`}
            </span>
            {fx.status === "error" && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.fxError")}</span>}
            <button
              className="kle-btn"
              onClick={() => void fx.refresh()}
              disabled={fx.status === "loading"}
              title={t("pricing.fxRefresh")}
              style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 10, cursor: fx.status === "loading" ? "not-allowed" : "pointer", opacity: fx.status === "loading" ? 0.5 : 1 }}
            >
              <RefreshCw size={11} /> {fx.status === "loading" ? t("pricing.fxLoading") : t("pricing.fxRefresh")}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 10 }}>
            <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
              {t("pricing.plateMaterial")}
              <br />
              <select style={{ ...inputStyle, width: 180 }} value={material} onChange={(e) => setMaterial(e.target.value)}>
                {(meta?.plateMaterials ?? []).map((m) => (
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
              style={{ padding: "4px 10px", fontSize: 11, cursor: plateSize ? "pointer" : "not-allowed", opacity: plateSize ? 1 : 0.5 }}
            >
              <Ruler size={12} /> {t("pricing.autoSize")}
            </button>
          </div>
          {!plateSize && (
            <div style={{ fontSize: 11, color: "var(--theme-text-dim)", marginTop: 8 }}>{t("pricing.plateSizeDisabledTip")}</div>
          )}
          {qtyInvalid && (
            <div style={{ fontSize: 11, color: "var(--theme-danger)", marginTop: 8 }}>⚠ {t("pricing.plateQtyMin")}</div>
          )}
          {plateQuote.error && (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--theme-warning)", marginTop: 8 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{plateQuote.error}</div>
            </div>
          )}
          {plateQuote.resp && !plateQuote.resp.ok && (
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--theme-warning)", marginTop: 8 }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>{plateQuote.resp.reason}</div>
            </div>
          )}
          {plateQuote.resp && plateQuote.resp.ok && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 8 }}>
              <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                {t("pricing.deliveryQty")}: {plateQuote.resp.deliveryQty ?? 0} PCS · {t("pricing.sheets")}: {plateQuote.resp.sheets ?? 0} {t("pricing.sheetUnit")}
              </div>
              <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--theme-primary)", lineHeight: 1.2 }}>
                {fmtMoney(plateQuote.resp.unitPrice ?? 0)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--theme-text-muted)" }}>/ PCS</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 1 }}>
                {t("pricing.unitPriceNote").replace("{deliveryQty}", String(plateQuote.resp.deliveryQty ?? 0))}
              </div>
              <div style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                {t("pricing.total")}: {fmtMoney(plateQuote.resp.totalPrice ?? 0)}
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
          {plateQuote.quoting && (
            <div style={{ fontSize: 11, color: "var(--theme-text-dim)", marginTop: 8 }}>{t("pricing.quoting")}</div>
          )}
          {/* v2.7.0 人工报价按钮 */}
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("pricing.manualQuoteContact")}</span>
            {meta?.contacts.discord && (
              <a
                className="kle-btn"
                href={meta.contacts.discord}
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <MessageCircle size={12} /> Discord
              </a>
            )}
            {meta?.contacts.email && (
              <a
                className="kle-btn"
                href={`mailto:${meta.contacts.email}`}
                style={{ padding: "4px 12px", fontSize: 11, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}
              >
                <Mail size={12} /> Email
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

PlatePricingSection.displayName = "PlatePricingSection";

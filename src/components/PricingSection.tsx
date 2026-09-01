"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, RefreshCw, Copy, Ruler, AlertTriangle, ChevronDown, ChevronUp, MessageCircle, Mail } from "lucide-react";
import type { KLELayout } from "../lib";
import { SectionHeader } from "./toolbelt/shared/SectionHeader";
import { useI18n } from "../lib/i18n";
import { LANG_CURRENCY, formatMoney, type CurrencyCode } from "../lib/currency";
import { useFxRates } from "../lib/use-fx-rates";
import { getMeta, requestQuote, quoteUnavailable, QuoteServiceError, type QuoteRequest, type QuoteResponse, type MetaResponse } from "../lib/quote-api";

interface PricingSectionProps {
  layout: KLELayout;
  /** PCB 编辑器是否启用 RGB（needLed） */
  rgbEnabled?: boolean;
  /** PCB 成品板框尺寸（mm），来自 PCB 编辑器 computePCBBounds。「从 PCB 取尺寸」用；null 时按钮禁用 */
  pcbSize?: { width: number; height: number } | null;
}

function defaultForm(keyCount: number): QuoteRequest {
  return {
    // 尺寸 0 = 跟随 PCB 编辑器成品板框（pcbSize）；>0 为手动填写值
    lengthMm: 0,
    widthMm: 0,
    quantity: 5,
    material: "fr4",
    thicknessMm: 1.6,
    surfaceFinish: "hasl",
    solderColor: "green",
    communication: [],
    hotswap: false,
    encoderCount: 0,
    oled: false,
    rgb: false,
    logo: "none",
    protection: "standard",
    test: "full",
    packaging: [],
    keyCount,
    subBoard: "none",
    cableType: "black",
    cableLengthMm: 0,
    firmware: [],
    tracing: "rounded",
    plateMaterial: "",
    plateLengthMm: 0,
    plateWidthMm: 0,
    plateQuantity: 0,
  };
}

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

const selectStyle: React.CSSProperties = { ...inputStyle, width: "auto", minWidth: 110 };

const psec: React.CSSProperties = {
  border: "1px solid var(--theme-border-light)",
  borderRadius: "var(--theme-radius-md)",
  padding: "10px 12px",
  background: "var(--theme-surface-2)",
};

export default function PricingSection({ layout, rgbEnabled = false, pcbSize = null }: PricingSectionProps) {
  const { t, lang } = useI18n();
  const currency: CurrencyCode = LANG_CURRENCY[lang];
  const fx = useFxRates();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // 键数始终跟随当前配列（与 PCB 编辑器一致：排除 decal 装饰键）；不信任 form.keyCount 快照
  const keyCount = layout.keys.filter((k) => !k.d).length;
  const [form, setForm] = useState<QuoteRequest>(() => defaultForm(keyCount));
  const [copied, setCopied] = useState(false);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [quoteState, setQuoteState] = useState<{ quoting: boolean; error: string | null; resp: QuoteResponse | null }>({
    quoting: false,
    error: null,
    resp: null,
  });

  useEffect(() => {
    getMeta()
      .then((m) => { setMeta(m); setMetaError(false); })
      .catch(() => { setMetaError(true); });
  }, []);

  // 尺寸派生：手动填写值 >0 时用手动值，否则跟随 PCB 编辑器成品板框
  const resolvedL = form.lengthMm > 0 ? form.lengthMm : (pcbSize ? Math.round(pcbSize.width) : 0);
  const resolvedW = form.widthMm > 0 ? form.widthMm : (pcbSize ? Math.round(pcbSize.height) : 0);

  // 防抖 500ms 请求报价（API 端校验；未就绪返回不可用状态）
  const serviceDownMsg = t("pricing.quoteServiceDown");
  useEffect(() => {
    if (!open) return;
    if (!form.lengthMm && !form.widthMm && !pcbSize) return;
    if (!form.quantity || form.quantity < 5) return;
    const timer = setTimeout(() => {
      setQuoteState((s) => ({ ...s, quoting: true, error: null }));
      requestQuote({ ...form, rgb: rgbEnabled, lengthMm: resolvedL, widthMm: resolvedW, keyCount })
        .then((resp) => setQuoteState({ quoting: false, error: null, resp }))
        .catch((e: unknown) =>
          setQuoteState({
            quoting: false,
            error: quoteUnavailable(e instanceof QuoteServiceError ? e.message : serviceDownMsg).reason,
            resp: null,
          }),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [form, rgbEnabled, resolvedL, resolvedW, keyCount, open, pcbSize, serviceDownMsg]);

  // v2.6.0：未选小板或板载 USB（自带 USB 无需排线）时，线长/排线类型禁用
  const subBoardDisabled = form.subBoard === "none" || form.subBoard === "onboardUsb";

  const set = <K extends keyof QuoteRequest>(k: K, v: QuoteRequest[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };
  const toggleIn = (key: "communication" | "packaging" | "firmware", value: string) => {
    setForm((f) => {
      const arr = f[key];
      return {
        ...f,
        [key]: arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value],
      };
    });
  };

  const fillFromLayout = () => {
    // 清除手动尺寸 → 回到跟随 PCB 编辑器板框
    set("lengthMm", 0);
    set("widthMm", 0);
  };

  const handleToggle = () => {
    setOpen((v) => !v);
    requestAnimationFrame(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleCopyQuote = async () => {
    if (!quoteState.resp || !quoteState.resp.ok) return;
    const text = buildQuoteText(quoteState.resp, { ...form, lengthMm: resolvedL, widthMm: resolvedW, keyCount }, meta, currency, fx.rates.rates);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.debug("clipboard write failed", e);
    }
  };

  const fmtMoney = (cny: number) => formatMoney(cny, currency, fx.rates.rates);
  const commOpts = meta ? Object.entries(meta.options.communication).sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99)) : [];
  const quote = quoteState.resp;
  const quoteError = !meta ? (metaError ? t("pricing.quoteServiceDown") : null) : null;

  return (
    <div ref={panelRef} className="kle-panel" style={{
      border: "1px solid var(--theme-border)", borderRadius: "var(--theme-radius-md)",
      margin: "8px 12px", backgroundColor: "var(--theme-surface)",
      position: "relative", paddingTop: 6,
    }}>
      {/* Region label */}
      <div style={{
        position: "absolute", top: -8, left: 10,
        backgroundColor: "var(--theme-surface)", padding: "0 6px",
        fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)",
        letterSpacing: 0.5,
      }}>
        <Calculator size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
        PCBA {t("pricing.priceCard")}
      </div>

      {/* ── Header Bar ── */}
      <div style={{ padding: "10px 12px 4px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          className="kle-btn kle-btn-success"
          onClick={handleToggle}
          data-testid="pricing-generate"
          style={{ padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
        >
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {t("pricing.generateBtn")}
        </button>
        <span style={{ fontSize: 11, color: "var(--theme-text-muted)", fontFamily: "var(--theme-font-mono)" }}>
          {t("pricing.watermark")} v{meta?.version ?? "—"} · {t("pricing.updatedAt")} {meta?.updatedAt ?? "—"}
        </span>
      </div>

      {open && (
        <div style={{ padding: "10px 12px 12px 12px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* ── 左列：表单 ── */}
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10, minWidth: 320 }}>
            {quoteError && (
              <div className="psec" style={{ ...psec, fontSize: 11, color: "var(--theme-warning)", display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} /> {quoteError}
              </div>
            )}

            {/* ① 板料参数 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.basic")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {t("pricing.lengthMm")}
                  <br />
                  <input type="number" style={inputStyle} value={resolvedL || ""} min={1} max={10000} placeholder={pcbSize ? String(Math.round(pcbSize.width)) : ""} onChange={(e) => set("lengthMm", Number(e.target.value))} />
                </label>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {t("pricing.widthMm")}
                  <br />
                  <input type="number" style={inputStyle} value={resolvedW || ""} min={1} max={10000} placeholder={pcbSize ? String(Math.round(pcbSize.height)) : ""} onChange={(e) => set("widthMm", Number(e.target.value))} />
                </label>
                <button className="kle-btn" onClick={fillFromLayout} disabled={!pcbSize} style={{ padding: "4px 10px", fontSize: 11, cursor: pcbSize ? "pointer" : "not-allowed", opacity: pcbSize ? 1 : 0.5 }}>
                  <Ruler size={12} /> {t("pricing.autoSize")}
                </button>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {t("pricing.quantity")}
                  <br />
                  <input type="number" style={inputStyle} value={form.quantity} min={5} step={5} onChange={(e) => set("quantity", Number(e.target.value))} />
                </label>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {t("pricing.material")}
                  <br />
                  <select style={{ ...selectStyle, width: 130 }} value={form.material} onChange={(e) => set("material", e.target.value)}>
                    {(meta?.materials ?? []).map((m) => (
                      <option key={m.key} value={m.key}>{m.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>
                  {t("pricing.thicknessMm")}
                  <br />
                  <select style={selectStyle} value={form.thicknessMm} onChange={(e) => set("thicknessMm", Number(e.target.value))}>
                    <option value={1.2}>1.2 mm</option>
                    <option value={1.6}>1.6 mm</option>
                  </select>
                </label>
              </div>
            </div>

            {/* ② 工艺：表面处理 + 颜色 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.process")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.surfaceFinish")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(meta?.surfaceFinish ?? [])
                      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                      .map((f) => (
                        <label key={f.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="radio" checked={form.surfaceFinish === f.key} onChange={() => set("surfaceFinish", f.key)} />
                          {f.name}
                          {f.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                        </label>
                      ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.solderColor")}</div>
                  <select style={{ ...selectStyle, width: 130 }} value={form.solderColor} onChange={(e) => set("solderColor", e.target.value)}>
                    {(meta?.solderColors ?? []).map((c) => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ③ 功能配置 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.function")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.communication")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {commOpts.map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={form.communication.includes(key)}
                          disabled={key === "wired"}
                          onChange={() => toggleIn("communication", key)}
                        />
                        {item.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.solder")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.hotswap} onChange={(e) => set("hotswap", e.target.checked)} />
                      {meta?.options.solder.find((o) => o.key === "hotswap")?.name ?? "热插拔"}
                    </label>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.peripheral")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.encoderCount > 0} onChange={(e) => set("encoderCount", e.target.checked ? 1 : 0)} />
                      {meta?.options.encoder.name ?? "Encoder"}
                      {form.encoderCount > 0 && (
                        <input
                          type="number"
                          min={1}
                          style={{ ...inputStyle, width: 52 }}
                          value={form.encoderCount}
                          onChange={(e) => set("encoderCount", Math.max(0, Math.floor(Number(e.target.value))))}
                        />
                      )}
                    </label>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.oled} onChange={(e) => set("oled", e.target.checked)} />
                      {meta?.options.oled.name ?? "OLED"}
                      {form.oled && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* ④ Logo / 三防 / 测试 / 包装 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.display")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.logo")}</div>
                  {(meta?.options.logo ?? [])
                    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                    .map((item) => (
                      <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-logo" checked={form.logo === item.key} onChange={() => set("logo", item.key)} /> {item.name}
                      </label>
                    ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.protection")}</div>
                  {(meta?.options.protection ?? [])
                    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                    .map((item) => (
                      <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-protection" checked={form.protection === item.key} onChange={() => set("protection", item.key)} /> {item.name}
                        {item.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                      </label>
                    ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.test")}</div>
                  {(meta?.options.test ?? [])
                    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                    .map((item) => (
                      <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-test" checked={form.test === item.key} onChange={() => set("test", item.key)} /> {item.name}
                      </label>
                    ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.packaging")}</div>
                  {(meta?.options.packaging ?? [])
                    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                    .map((item) => (
                      <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="checkbox" checked={form.packaging.includes(item.key)} onChange={() => toggleIn("packaging", item.key)} /> {item.name}
                      </label>
                    ))}
                </div>
              </div>
            </div>

            {/* ⑤ 附加组件：额外小板 + 排线 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.extras")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.subBoard")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(meta?.extras.subBoard ?? [])
                      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                      .map((item) => (
                        <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="radio" name="pricing-subboard" checked={form.subBoard === item.key} onChange={() => set("subBoard", item.key)} />
                          {item.name}
                        </label>
                      ))}
                  </div>
                  <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>{t("pricing.cableLength")}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={subBoardDisabled}
                      value={form.cableLengthMm || ""}
                      placeholder={subBoardDisabled ? "" : "mm"}
                      onChange={(e) => set("cableLengthMm", Math.max(0, Number(e.target.value)))}
                      style={{ ...inputStyle, width: 52, opacity: subBoardDisabled ? 0.4 : 1, cursor: subBoardDisabled ? "not-allowed" : "text" }}
                    />
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.cable")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, opacity: subBoardDisabled ? 0.4 : 1 }}>
                    {(meta?.extras.cable ?? [])
                      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                      .map((item) => (
                        <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: subBoardDisabled ? "not-allowed" : "pointer" }}>
                          <input type="radio" name="pricing-cable" disabled={subBoardDisabled} checked={form.cableType === item.key} onChange={() => set("cableType", item.key)} />
                          {item.name}
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* ⑥ 自定义固件 + 走线 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.firmware")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.firmware")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {(meta?.extras.firmware ?? [])
                      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                      .map((item) => (
                        <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="checkbox" checked={form.firmware.includes(item.key)} onChange={() => toggleIn("firmware", item.key)} />
                          {item.name}
                          {item.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                        </label>
                      ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.tracing")}</div>
                  {(meta?.extras.tracing ?? [])
                    .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99))
                    .map((item) => (
                      <label key={item.key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-tracing" checked={form.tracing === item.key} onChange={() => set("tracing", item.key)} /> {item.name}
                      </label>
                    ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 右列：价格卡 ── */}
          <div style={{ flex: "0 0 310px", position: "sticky", top: 0, alignSelf: "flex-start" }}>
            <div className="psec" style={psec}>
              <SectionHeader>
                <Calculator size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {t("pricing.priceCard")}
              </SectionHeader>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 10, color: "var(--theme-text-dim)", marginBottom: 6 }}>
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
              {!quote ? (
                <div style={{ fontSize: 11, color: "var(--theme-text-muted)", padding: "8px 0" }}>
                  {quoteState.quoting ? t("pricing.quoting") : quoteError ?? t("pricing.invalid")}
                </div>
              ) : !quote.ok ? (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11.5, color: "var(--theme-warning)" }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <b>{t("pricing.manualRequired")}</b>
                    <div style={{ marginTop: 4, color: "var(--theme-text)" }}>{quote.reason}</div>
                  </div>
                </div>
              ) : (
                <>
                  {quote.notice && (
                    <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11, color: "var(--theme-warning)", marginBottom: 8, padding: "6px 8px", border: "1px solid rgba(var(--theme-warning-rgb), 0.35)", borderRadius: "var(--theme-radius-sm)", background: "rgba(var(--theme-warning-rgb), 0.08)" }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                      <div>{quote.notice}</div>
                    </div>
                  )}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>{t("pricing.unit")}</div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: "var(--theme-primary)", lineHeight: 1.2 }}>
                      {fmtMoney(quote.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--theme-text-muted)" }}>/ PCS</span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--theme-text-muted)", marginTop: 1 }}>
                      {t("pricing.unitPriceNote").replace("{deliveryQty}", String(quote.deliveryQty))}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginTop: 2 }}>
                      {t("pricing.total")}: {fmtMoney(quote.totalPrice)}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--theme-border-light)", paddingTop: 8, fontSize: 11, display: "flex", flexDirection: "column", gap: 4, color: "var(--theme-text)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t("pricing.deliveryQty")}</span>
                      <span>{quote.deliveryQty} PCS</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                      <span>{t("pricing.sheets")}</span>
                      <span>{quote.sheets} {t("pricing.sheetUnit")}</span>
                    </div>
                    {quote.plate && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                        <span>{t("pricing.plate")}</span>
                        <span>{quote.plate.ok ? `${fmtMoney(quote.plate.totalPrice ?? 0)} × ${quote.plate.deliveryQty ?? 0} PCS` : quote.plate.reason ?? ""}</span>
                      </div>
                    )}
                  </div>
                  <button
                    className="kle-btn"
                    onClick={handleCopyQuote}
                    style={{ marginTop: 10, width: "100%", padding: "6px 0", fontSize: 11, cursor: "pointer" }}
                  >
                    <Copy size={12} /> {copied ? t("pricing.copied") : t("pricing.copyQuote")}
                  </button>
                  {/* v2.7.0 人工报价联系方式 */}
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10.5, color: "var(--theme-text-muted)" }}>{t("pricing.manualQuoteContact")}</span>
                    {meta?.contacts.discord && (
                      <a
                        className="kle-btn"
                        href={meta.contacts.discord}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <MessageCircle size={11} /> Discord
                      </a>
                    )}
                    {meta?.contacts.email && (
                      <a
                        className="kle-btn"
                        href={`mailto:${meta.contacts.email}`}
                        style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Mail size={11} /> Email
                      </a>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--theme-text-dim)", fontFamily: "var(--theme-font-mono)", lineHeight: 1.5 }}>
                    v{quote.version} · {t("pricing.updatedAt")} {meta?.updatedAt ?? ""}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildQuoteText(
  quote: Extract<QuoteResponse, { ok: true }>,
  form: QuoteRequest,
  meta: MetaResponse | null,
  currency: CurrencyCode,
  fxRates: Record<string, number>,
): string {
  const material = meta?.materials.find((m) => m.key === form.material)?.name ?? form.material;
  const surface = meta?.surfaceFinish.find((f) => f.key === form.surfaceFinish)?.name ?? form.surfaceFinish;
  const color = meta?.solderColors.find((c) => c.key === form.solderColor)?.name ?? form.solderColor;
  const subBoard = meta?.extras.subBoard.find((o) => o.key === form.subBoard);
  const cable = meta?.extras.cable.find((o) => o.key === form.cableType);
  const tracing = meta?.extras.tracing.find((o) => o.key === form.tracing);
  const plateMaterial = meta?.plateMaterials.find((m) => m.key === form.plateMaterial);
  const lines = [
    "Kindlestar PCBA 报价单",
    `尺寸: ${form.lengthMm} × ${form.widthMm} mm·层数: 2层 · 板厚: ${form.thicknessMm}mm · 材质: ${material}`,
    `交付数量: ${quote.deliveryQty} PCS`,
    `预计用板张数: ${quote.sheets} 张`,
    `表面处理: ${surface} · 颜色: ${color}`,
    ...form.communication.map((c) => `通信: ${meta?.options.communication.find((o) => o.key === c)?.name ?? c}`),
    form.hotswap ? `焊接: 热插拔 (${form.keyCount} 键)` : "",
    form.encoderCount > 0 ? `外设: 旋钮 ×${form.encoderCount}` : "",
    `测试: ${meta?.options.test.find((o) => o.key === form.test)?.name ?? form.test}`,
    subBoard && subBoard.name !== "无" ? `额外小板: ${subBoard.name}${form.cableLengthMm > 0 ? `（线长 ${form.cableLengthMm}mm）` : ""}` : "",
    subBoard && subBoard.name !== "无" && cable ? `排线: ${cable.name}` : "",
    form.firmware.length > 0 ? `自定义固件: ${form.firmware.map((f) => meta?.extras.firmware.find((o) => o.key === f)?.name ?? f).join(" + ")}` : "",
    tracing && tracing.name !== "圆角走线" ? `走线: ${tracing.name}` : "",
    "---",
    `总价(终端报价): ${formatMoney(quote.totalPrice, currency, fxRates)}`,
    `单价: ${formatMoney(quote.unitPrice, currency, fxRates)} / PCS（按实交 ${quote.deliveryQty} PCS 分摊）`,
    ...(quote.notice ? [`提示: ${quote.notice}`] : []),
    ...(quote.plate ? buildPlateText(quote.plate, plateMaterial?.name, currency, fxRates) : []),
    `价格版本 v${quote.version} · 更新于 ${meta?.updatedAt ?? ""} · ${new Date().toLocaleString("zh-CN")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildPlateText(plate: NonNullable<Extract<QuoteResponse, { ok: true }>["plate"]>, materialName: string | undefined, currency: CurrencyCode, fxRates: Record<string, number>): string[] {
  if (!plate?.ok) return [`定位板: 无法计价（${plate?.reason ?? ""}）`];
  return [
    "---",
    "定位板报价（独立）",
    `定位板材质: ${materialName ?? ""} · 交付数量: ${plate.deliveryQty ?? 0} PCS`,
    `定位板总价: ${formatMoney(plate.totalPrice ?? 0, currency, fxRates)}`,
    `定位板单价: ${formatMoney(plate.unitPrice ?? 0, currency, fxRates)} / PCS（按实交 ${plate.deliveryQty ?? 0} PCS 分摊）`,
  ];
}

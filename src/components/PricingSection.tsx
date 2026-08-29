"use client";

import { useMemo, useRef, useState } from "react";
import { Calculator, RefreshCw, Check, Copy, Ruler, AlertTriangle, ChevronDown, ChevronUp, MessageCircle, Mail } from "lucide-react";
import type { KLELayout } from "../lib";
import { SectionHeader } from "./toolbelt/shared/SectionHeader";
import { useI18n } from "../lib/i18n";
import {
  calculatePrice,
  validatePricingInput,
  type PricingFormData,
  type QuoteResult,
} from "../lib/price-calculator";
import {
  getCurrentConfig,
  getPricingInfo,
  checkPricingUpdate,
  applyPricingUpdate,
  type PricingInfo,
  type PricingUpdateResult,
} from "../lib/pricing-loader";

interface PricingSectionProps {
  layout: KLELayout;
  /** PCB 编辑器是否启用 RGB（needLed） */
  rgbEnabled?: boolean;
  /** PCB 成品板框尺寸（mm），来自 PCB 编辑器 computePCBBounds。「从 PCB 取尺寸」用；null 时按钮禁用 */
  pcbSize?: { width: number; height: number } | null;
}

function defaultForm(keyCount: number): PricingFormData {
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
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const cfg = useMemo(() => getCurrentConfig(), []);
  // 键数始终跟随当前配列（与 PCB 编辑器一致：排除 decal 装饰键）；不信任 form.keyCount 快照
  const keyCount = layout.keys.filter((k) => !k.d).length;
  const [form, setForm] = useState<PricingFormData>(() => defaultForm(keyCount));
  const [info, setInfo] = useState<PricingInfo>(() => getPricingInfo());
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "confirm" | "applying">("idle");
  const [updateResult, setUpdateResult] = useState<PricingUpdateResult | null>(null);
  const [copied, setCopied] = useState(false);

  // 尺寸派生：手动填写值 >0 时用手动值，否则跟随 PCB 编辑器成品板框
  const resolvedL = form.lengthMm > 0 ? form.lengthMm : (pcbSize ? Math.round(pcbSize.width) : 0);
  const resolvedW = form.widthMm > 0 ? form.widthMm : (pcbSize ? Math.round(pcbSize.height) : 0);

  const quote = useMemo<QuoteResult | null>(() => {
    return calculatePrice(cfg, { ...form, rgb: rgbEnabled, lengthMm: resolvedL, widthMm: resolvedW, keyCount });
  }, [cfg, form, rgbEnabled, resolvedL, resolvedW, keyCount]);

  const errors = useMemo(
    () => validatePricingInput({ ...form, lengthMm: resolvedL, widthMm: resolvedW, keyCount }),
    [form, resolvedL, resolvedW, keyCount],
  );

  // v2.6.0：未选小板或板载 USB（自带 USB 无需排线）时，线长/排线类型禁用
  const subBoardDisabled = form.subBoard === "none" || form.subBoard === "onboardUsb";

  const set = <K extends keyof PricingFormData>(k: K, v: PricingFormData[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };  const toggleIn = (key: "communication" | "packaging" | "firmware", value: string) => {
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

  const handleCheckUpdate = async () => {
    setUpdateState("checking");
    setUpdateResult(null);
    const r = await checkPricingUpdate();
    setUpdateResult(r);
    setUpdateState(r.status === "updated" ? "confirm" : "idle");
  };

  const handleApplyUpdate = async () => {
    setUpdateState("applying");
    const r = await applyPricingUpdate();
    setUpdateResult(r);
    setInfo(getPricingInfo());
    setUpdateState("idle");
  };

  const handleCopyQuote = async () => {
    if (!quote || !quote.ok) return;
    const text = buildQuoteText(quote, { ...form, lengthMm: resolvedL, widthMm: resolvedW, keyCount }, info, cfg);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.debug("clipboard write failed", e);
    }
  };

  const fmt = (n: number) => n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const commOpts = Object.entries(cfg.options.communication).sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99));

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
          {t("pricing.watermark")} v{info.version} · {t("pricing.updatedAt")} {info.updatedAt}
          {info.cachedAt ? ` · ${t("pricing.fetchedAt")} ${new Date(info.cachedAt).toLocaleString("zh-CN")}` : ""}
          {info.source === "bundled" ? ` · ${t("pricing.bundled")}` : ""}
        </span>
        <button
          className="kle-btn"
          onClick={handleCheckUpdate}
          disabled={!open || updateState === "checking" || updateState === "applying"}
          style={{ marginLeft: "auto", padding: "4px 12px", fontSize: 11, cursor: open ? "pointer" : "not-allowed", opacity: open ? 1 : 0.5 }}
        >
          <RefreshCw size={12} /> {updateState === "checking" ? t("pricing.checking") : t("pricing.updateBtn")}
        </button>
      </div>

      {open && (
        <div style={{ padding: "10px 12px 12px 12px", display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* ── 左列：表单 ── */}
          <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: 10, minWidth: 320 }}>
            {/* 更新结果 */}
            {updateResult && (
              <div className="psec" style={{ ...psec, fontSize: 11, color: "var(--theme-text)" }}>
                {updateResult.status === "updated" && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <Check size={13} style={{ color: "var(--theme-success)" }} />
                      <b>{updateResult.message}</b>
                    </div>
                    {updateResult.diff && updateResult.diff.length > 0 && (
                      <ul style={{ margin: "4px 0 8px 18px", padding: 0 }}>
                        {updateResult.diff.map((d) => (
                          <li key={d.path}>
                            {d.name}: <span style={{ textDecoration: "line-through", opacity: 0.6 }}>{d.from}</span> →{" "}
                            <b>{d.to}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                    {updateState === "confirm" && (
                      <button className="kle-btn kle-btn-success" onClick={handleApplyUpdate} style={{ padding: "4px 14px", fontSize: 11, cursor: "pointer" }}>
                        {t("pricing.confirmApply")}
                      </button>
                    )}
                  </>
                )}
                {updateResult.status === "up_to_date" && <div>✓ {t("pricing.upToDate")}</div>}
                {updateResult.status === "rejected" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-warning)" }}>
                    <AlertTriangle size={13} /> {updateResult.message}
                  </div>
                )}
                {updateResult.status === "failed" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--theme-danger)" }}>
                    <AlertTriangle size={13} /> {t("pricing.failed")}: {updateResult.message}
                  </div>
                )}
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
                <button className="kle-btn" onClick={fillFromLayout} disabled={!pcbSize} title={pcbSize ? t("pricing.autoSizeTip") : t("pricing.autoSizeDisabledTip")} style={{ padding: "4px 10px", fontSize: 11, cursor: pcbSize ? "pointer" : "not-allowed", opacity: pcbSize ? 1 : 0.5 }}>
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
                    {cfg.materials.map((m) => (
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
              {errors.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--theme-danger)" }}>
                  {errors.map((e) => (
                    <div key={e}>⚠ {e}</div>
                  ))}
                </div>
              )}
            </div>

            {/* ② 工艺：表面处理 + 颜色 */}
            <div className="psec" style={psec}>
              <SectionHeader>{t("pricing.section.process")}</SectionHeader>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.surfaceFinish")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {Object.entries(cfg.surfaceFinish)
                      .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                      .map(([key, f]) => (
                        <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="radio" checked={form.surfaceFinish === key} onChange={() => set("surfaceFinish", key)} />
                          {f.name}
                          {f.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                        </label>
                      ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.solderColor")}</div>
                  <select style={{ ...selectStyle, width: 130 }} value={form.solderColor} onChange={(e) => set("solderColor", e.target.value)}>
                    {cfg.solderColors.map((c) => (
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
                        {item.feePerPcs ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerPcs)}/PCS</span> : ""}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.solder")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.hotswap} onChange={(e) => set("hotswap", e.target.checked)} />
                      {cfg.options.solder["hotswap"]?.name}
                      <span style={{ color: "var(--theme-text-dim)" }}>
                        {keyCount} 键 × {fmt(cfg.options.solder["hotswap"]?.feePerPcsPerKey ?? 0)}/PCS
                      </span>
                    </label>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5 }}>
                      <input type="checkbox" checked disabled /> {cfg.options.solder["smd"]?.name}
                    </label>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.peripheral")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.encoderCount > 0} onChange={(e) => set("encoderCount", e.target.checked ? 1 : 0)} />
                      {cfg.options.encoder.name}
                      {form.encoderCount > 0 && (
                        <input
                          type="number"
                          min={1}
                          style={{ ...inputStyle, width: 52 }}
                          value={form.encoderCount}
                          onChange={(e) => set("encoderCount", Math.max(0, Math.floor(Number(e.target.value))))}
                        />
                      )}
                      <span style={{ color: "var(--theme-text-dim)" }}>{fmt(cfg.options.encoder.feePerPcs ?? 0)}/个/PCS</span>
                    </label>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                      <input type="checkbox" checked={form.oled} onChange={(e) => set("oled", e.target.checked)} />
                      {cfg.options.oled.name}
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
                  {Object.entries(cfg.options.logo)
                    .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                    .map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-logo" checked={form.logo === key} onChange={() => set("logo", key)} /> {item.name}
                      </label>
                    ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.protection")}</div>
                  {Object.entries(cfg.options.protection)
                    .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                    .map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-protection" checked={form.protection === key} onChange={() => set("protection", key)} /> {item.name}
                        {item.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                      </label>
                    ))}
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.test")}</div>
                  {Object.entries(cfg.options.test)
                    .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                    .map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-test" checked={form.test === key} onChange={() => set("test", key)} /> {item.name}
                      </label>
                    ))}
                  <div style={{ fontSize: 9.5, color: "var(--theme-text-dim)", marginTop: 3 }}>{t("pricing.qcNote")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.packaging")}</div>
                  {Object.entries(cfg.options.packaging)
                    .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                    .map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="checkbox" checked={form.packaging.includes(key)} onChange={() => toggleIn("packaging", key)} /> {item.name}
                        {item.feePerPcs ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerPcs)}/PCS</span> : ""}
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
                    {Object.entries(cfg.extras.subBoard)
                      .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                      .map(([key, item]) => (
                        <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="radio" name="pricing-subboard" checked={form.subBoard === key} onChange={() => set("subBoard", key)} />
                          {item.name}
                          {item.feePerPcs ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerPcs)}/PCS</span> : ""}
                        </label>
                      ))}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--theme-text-dim)", marginTop: 3 }}>{t("pricing.subBoardHint")}</div>
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
                    {Object.entries(cfg.extras.cable)
                      .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                      .map(([key, item]) => (
                        <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: subBoardDisabled ? "not-allowed" : "pointer" }}>
                          <input type="radio" name="pricing-cable" disabled={subBoardDisabled} checked={form.cableType === key} onChange={() => set("cableType", key)} />
                          {item.name}
                          {item.feePerPcs ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerPcs)}/PCS</span> : ""}
                        </label>
                      ))}
                  </div>
                  <div style={{ fontSize: 9.5, color: "var(--theme-text-dim)", marginTop: 3 }}>{t("pricing.cableHint")}</div>
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
                    {Object.entries(cfg.extras.firmware)
                      .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                      .map(([key, item]) => (
                        <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                          <input type="checkbox" checked={form.firmware.includes(key)} onChange={() => toggleIn("firmware", key)} />
                          {item.name}
                          {item.feePerOrder ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerOrder)}/单</span> : ""}
                          {item.reject && <span style={{ color: "var(--theme-warning)" }}>{t("pricing.manualOnly")}</span>}
                        </label>
                      ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("pricing.tracing")}</div>
                  {Object.entries(cfg.extras.tracing)
                    .sort((a, b) => (a[1].sortOrder ?? 99) - (b[1].sortOrder ?? 99))
                    .map(([key, item]) => (
                      <label key={key} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                        <input type="radio" name="pricing-tracing" checked={form.tracing === key} onChange={() => set("tracing", key)} /> {item.name}
                        {item.feePerOrder ? <span style={{ color: "var(--theme-text-dim)" }}>+{fmt(item.feePerOrder)}/单</span> : ""}
                      </label>
                    ))}
                  <div style={{ fontSize: 9.5, color: "var(--theme-text-dim)", marginTop: 3 }}>{t("pricing.tracingCustomTip")}</div>
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
              {!quote ? (
                <div style={{ fontSize: 11, color: "var(--theme-danger)" }}>{t("pricing.invalid")}</div>
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
                      ¥ {fmt(quote.unitPrice)} <span style={{ fontSize: 12, fontWeight: 400, color: "var(--theme-text-muted)" }}>/ PCS</span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginTop: 2 }}>
                      {t("pricing.total")}: ¥ {fmt(quote.totalPrice)}
                    </div>
                  </div>
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--theme-border-light)", paddingTop: 8, fontSize: 11, display: "flex", flexDirection: "column", gap: 4, color: "var(--theme-text)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t("pricing.mode")}</span>
                      <span>{quote.mode === "panel" ? t("pricing.mode.panel") : t("pricing.mode.partial")}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                      <span>{t("pricing.sheets")}</span>
                      <span>{quote.sheets} {quote.mode === "panel" ? t("pricing.mode.panel") : t("pricing.mode.partial")} ({quote.boardsPerSheet} {t("pricing.perSheet")})</span>
                    </div>
                    {quote.wasteQty > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-warning)" }}>
                        <span>{t("pricing.wasteQty")}</span>
                        <span>{quote.wasteQty} PCS</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t("pricing.boardCost")}</span>
                      <span>¥ {fmt(quote.boardCost)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>{t("pricing.processFee")}</span>
                      <span>¥ {fmt(quote.processFee)}</span>
                    </div>
                    {quote.breakdown.map((b, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                        <span title={b.detail}>{b.name}</span>
                        <span>+¥ {fmt(b.amount)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-dim)" }}>
                      <span>{t("pricing.size")}</span>
                      <span>{resolvedL} × {resolvedW} mm → {quote.chargeSizeMm.l} × {quote.chargeSizeMm.w}</span>
                    </div>
                    {quote.terminalMultiplier !== 1 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-dim)", borderTop: "1px dashed var(--theme-border-light)", paddingTop: 6, marginTop: 2 }}>
                          <span>{t("pricing.rawTotal")}</span>
                          <span>¥ {fmt(quote.rawTotal)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                          <span>{t("pricing.terminalMultiplier")}</span>
                          <span>× {quote.terminalMultiplier}</span>
                        </div>
                        {quote.exclTotal > 0 && (
                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--theme-text-muted)" }}>
                            <span title={t("pricing.exclTip")}>{t("pricing.exclTotal")}</span>
                            <span>+¥ {fmt(quote.exclTotal)}</span>
                          </div>
                        )}
                      </>
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
                    {cfg.contacts?.discord && (
                      <a
                        className="kle-btn"
                        href={cfg.contacts.discord}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <MessageCircle size={11} /> Discord
                      </a>
                    )}
                    {cfg.contacts?.email && (
                      <a
                        className="kle-btn"
                        href={`mailto:${cfg.contacts.email}`}
                        style={{ padding: "3px 10px", fontSize: 10.5, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                      >
                        <Mail size={11} /> Email
                      </a>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 9.5, color: "var(--theme-text-dim)", fontFamily: "var(--theme-font-mono)", lineHeight: 1.5 }}>
                    v{info.version} · {t("pricing.updatedAt")} {info.updatedAt}
                    {info.cachedAt ? ` · ${t("pricing.fetchedAt")} ${new Date(info.cachedAt).toLocaleString("zh-CN")}` : ""}
                    {info.source === "bundled" ? ` · ${t("pricing.bundled")}` : ""}
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
  quote: QuoteResult,
  form: PricingFormData,
  info: PricingInfo,
  cfg: ReturnType<typeof getCurrentConfig>,
): string {
  const material = cfg.materials.find((m) => m.key === form.material)?.name ?? form.material;
  const surface = cfg.surfaceFinish[form.surfaceFinish]?.name ?? form.surfaceFinish;
  const color = cfg.solderColors.find((c) => c.key === form.solderColor)?.name ?? form.solderColor;
  const subBoard = cfg.extras.subBoard[form.subBoard];
  const cable = cfg.extras.cable[form.cableType];
  const tracing = cfg.extras.tracing[form.tracing];
  const plateMaterial = cfg.plate.materials.find((m) => m.key === form.plateMaterial);
  const lines = [
    "Kindlestar PCBA 报价单",
    `尺寸: ${form.lengthMm} × ${form.widthMm} mm（含辅助边: ${quote.chargeSizeMm.l} × ${quote.chargeSizeMm.w}）`,
    `层数: 2层 · 板厚: ${form.thicknessMm}mm · 材质: ${material}`,
    `数量: ${quote.effectiveQty} PCS${quote.wasteQty > 0 ? `（含报废 ${quote.wasteQty}）` : ""}`,
    `板材: ${quote.mode === "panel" ? "大板" : "分料板"} × ${quote.sheets} 张（每张 ${quote.boardsPerSheet} 块）`,
    `表面处理: ${surface} · 颜色: ${color}`,
    ...form.communication.map((c) => `通信: ${cfg.options.communication[c]?.name ?? c}`),
    form.hotswap ? `焊接: 热插拔 (${form.keyCount} 键)` : "",
    form.encoderCount > 0 ? `外设: 旋钮 ×${form.encoderCount}` : "",
    `测试: ${cfg.options.test[form.test]?.name ?? form.test}`,
    subBoard && subBoard.name !== "无" ? `额外小板: ${subBoard.name}${form.cableLengthMm > 0 ? `（线长 ${form.cableLengthMm}mm）` : ""}` : "",
    subBoard && subBoard.name !== "无" && cable ? `排线: ${cable.name}` : "",
    form.firmware.length > 0 ? `自定义固件: ${form.firmware.map((f) => cfg.extras.firmware[f]?.name ?? f).join(" + ")}` : "",
    tracing && tracing.name !== "圆角走线" ? `走线: ${tracing.name}` : "",
    "---",
    `板费: ¥${quote.boardCost.toFixed(2)}`,
    `工艺费: ¥${quote.processFee.toFixed(2)}`,
    quote.terminalMultiplier !== 1
      ? `成本小计: ¥${quote.rawTotal.toFixed(2)}（计入倍率 ¥${quote.baseTotal.toFixed(2)} × ${quote.terminalMultiplier}${quote.exclTotal > 0 ? ` + 不计倍率 ¥${quote.exclTotal.toFixed(2)}` : ""}）`
      : "",
    `总价(终端报价): ¥${quote.totalPrice.toFixed(2)}`,
    `单价: ¥${quote.unitPrice.toFixed(2)} / PCS`,
    ...(quote.notice ? [`提示: ${quote.notice}`] : []),
    ...(quote.plateQuote ? buildPlateText(quote.plateQuote, plateMaterial?.name) : []),
    `价格版本 v${info.version} · 清单更新 ${info.updatedAt} · ${new Date().toLocaleString("zh-CN")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function buildPlateText(plate: NonNullable<QuoteResult["plateQuote"]>, materialName?: string): string[] {
  if (!plate.ok) return [`定位板: 无法计价（${plate.reason}）`];
  return [
    "---",
    "定位板报价（独立）",
    `定位板材质: ${materialName ?? ""} · 数量: ${plate.effectiveQty} PCS${plate.wasteQty > 0 ? `（含报废 ${plate.wasteQty}）` : ""}`,
    `定位板: ${plate.mode === "panel" ? "大板" : "分料板"} × ${plate.sheets} 张（每张 ${plate.boardsPerSheet} 块）`,
    `定位板费用: ¥${plate.boardCost.toFixed(2)}`,
    `定位板单价: ¥${plate.unitPrice.toFixed(2)} / PCS`,
  ];
}

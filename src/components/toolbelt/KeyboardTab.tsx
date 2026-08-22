"use client";

import type { KLEMeta, KLELayout } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface KeyboardTabProps {
  meta: KLEMeta;
  layout: KLELayout;
  onSetMeta: (meta: Partial<KLEMeta>) => void;
  onLoadLayout: (layout: KLELayout) => void;
}

export function KeyboardTab({ meta, onSetMeta }: KeyboardTabProps) {
  const { t } = useI18n();
  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 260,
  };
  const psecNarrow: React.CSSProperties = {
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 170,
  };
  const lbl: React.CSSProperties = {
    flex: "0 0 64px", fontSize: 10, color: "var(--theme-text-muted)",
  };
  // 预设配列加载已由画布上方工具栏的下拉框承担，此页不再重复提供

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("properties.tab.keyboard")}</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
          <div className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>{t("kp.name")}</span>
            <input value={meta.name || ""} onChange={(e) => onSetMeta({ name: e.target.value })}
              title={t("tip.kbName")}
              className="kle-input" style={{ flex: 1, padding: "2px 6px", fontSize: 11.5, minHeight: 24 }} />
          </div>
          <div className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>{t("kp.author")}</span>
            <input value={meta.author || ""} onChange={(e) => onSetMeta({ author: e.target.value })}
              title={t("tip.kbAuthor")}
              className="kle-input" style={{ flex: 1, padding: "2px 6px", fontSize: 11.5, minHeight: 24 }} />
          </div>
          <div className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>{t("kp.background")}</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid var(--theme-border-input)", display: "inline-block", background: meta.backcolor || "#eeeeee" }}></span>
              <input value={meta.backcolor || ""} onChange={(e) => onSetMeta({ backcolor: e.target.value })}
                title={t("tip.kbBackcolor")}
                className="kle-input" style={{ flex: "0 0 74px", padding: "2px 6px", fontSize: 11.5, minHeight: 24, fontFamily: "var(--theme-font-mono)" }} />
            </div>
          </div>
          <div className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lbl}>{t("kp.textureUrl")}</span>
            <input value={meta.background || ""} onChange={(e) => onSetMeta({ background: e.target.value })}
              title={t("tip.kbTexture")}
              className="kle-input" style={{ flex: 1, padding: "2px 6px", fontSize: 11.5, minHeight: 24 }} />
          </div>
        </div>
        <div className="lbl-row" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={lbl}>{t("kp.notes")}</span>
          <textarea
            value={meta.notes || ""}
            onChange={(e) => onSetMeta({ notes: e.target.value })}
            placeholder={t("kt.notesPh")}
            title={t("tip.kbNotes")}
            className="kle-textarea"
            style={{ flex: 1, padding: "4px 8px", fontSize: 11.5, minHeight: 44, resize: "vertical", fontFamily: "var(--theme-font-ui)" }}
          />
        </div>
      </div>

      <div className="psec" style={psecNarrow}>
        <SectionHeader>{t("kt.defaults")}</SectionHeader>
        {[
          { label: t("kt.mount"), def: "MX", tip: t("tip.kbSwitchMount"), prop: "switchMount" as const },
          { label: t("kt.brand"), def: "Cherry", tip: t("tip.kbSwitchBrand"), prop: "switchBrand" as const },
          { label: t("kt.type"), def: t("kt.linearRed"), tip: t("tip.kbSwitchType"), prop: "switchType" as const },
        ].map((f) => (
          <div key={f.prop} className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ flex: "0 0 50px", fontSize: 10, color: "var(--theme-text-muted)" }}>{f.label}</span>
            <input value={meta[f.prop] || f.def} onChange={(e) => onSetMeta({ [f.prop]: e.target.value })}
              title={f.tip}
              className="kle-input" style={{ flex: 1, padding: "2px 6px", fontSize: 11.5, minHeight: 24 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

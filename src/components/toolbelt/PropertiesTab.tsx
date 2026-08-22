"use client";

import type { KeyProps } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface PropertiesTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const SIZE_PRESETS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.75, 6.25];
const HEIGHT_PRESETS = [1, 1.5, 2, 2.5, 3];
const ROTATION_PRESETS = [0, 90, 180, -90];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 28, 34, 36];

export function PropertiesTab({ keys, selectedIds, onSetProp }: PropertiesTabProps) {
  const { t } = useI18n();
  const selIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!) : -1;
  const key = selIdx >= 0 && selIdx < keys.length ? keys[selIdx] : null;
  const ids = [...selectedIds];
  const hasSelection = selectedIds.length > 0 && key !== null;

  const set = (prop: keyof KeyProps, value: unknown) => {
    if (hasSelection) onSetProp(ids, prop, value);
  };

  const curW = key?.w || 1;
  const curH = key?.h || 1;
  const curX = key?.x || 0;
  const curY = key?.y || 0;
  const curR = key?.r || 0;
  const curRx = key?.rx;
  const curRy = key?.ry;
  const curFontSize = key?.labelSize || 9;

  const psec: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 140,
  };
  const plabel: React.CSSProperties = {
    fontSize: 9, opacity: 0.55, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--theme-text-muted)",
  };
  const pval: React.CSSProperties = {
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    padding: "2px 6px", fontSize: 12, minWidth: 36,
    background: "var(--theme-input-bg)", textAlign: "center", color: "var(--theme-text)",
    fontFamily: "var(--theme-font-mono)",
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* Size */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("pt.size")}</SectionHeader>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.width")}</label>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {SIZE_PRESETS.map((s) => (
                <span key={s} onClick={() => set("w", s)} title={t("tip.propW")} className={`kle-chip${curW === s ? " active" : ""}`}
                  style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{s}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.height")}</label>
            <div style={{ display: "flex", gap: 3 }}>
              {HEIGHT_PRESETS.map((s) => (
                <span key={s} onClick={() => set("h", s)} title={t("tip.propH")} className={`kle-chip${curH === s ? " active" : ""}`}
                  style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Position & Rotation */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("pt.posRot")}</SectionHeader>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>X</label>
            <span style={pval}>{curX}</span>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>Y</label>
            <span style={pval}>{curY}</span>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotation")}</label>
            <span style={pval}>{curR}°</span>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotX")}</label>
            <span style={pval}>{curRx ?? "—"}</span>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotY")}</label>
            <span style={pval}>{curRy ?? "—"}</span>
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {ROTATION_PRESETS.map((r) => (
            <span key={r} onClick={() => set("r", r)} title={t("tip.propRot")} className={`kle-chip${curR === r ? " active" : ""}`}
              style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{r}°</span>
          ))}
          <span className="kle-chip" style={{ padding: "1px 7px", fontSize: 11, borderRadius: "var(--theme-radius-sm)", cursor: "default" }}>{t("pt.custom")}</span>
        </div>
      </div>

      {/* Alignment */}
      <div className="psec" style={{ ...psec, flex: "0 0 170px" }}>
        <SectionHeader>{t("pt.align")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[t("pt.align0"), t("pt.align1"), t("pt.align2"), t("pt.align3"), t("pt.align4")].map((item, i) => (
            <span key={item} className={`kle-chip${i === 0 ? " active" : ""}`}
              style={{ padding: "3px 8px", fontSize: 11, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>{item}</span>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="psec" style={{ ...psec, flex: "0 0 130px" }}>
        <SectionHeader>{t("pt.fontSize")}</SectionHeader>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {FONT_SIZES.map((s) => (
            <span key={s} onClick={() => set("labelSize", s)} title={t("tip.propFontSize")} className={`kle-chip${curFontSize === s ? " active" : ""}`}
              style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Special keys */}
      <div className="psec" style={{ ...psec, flex: "0 0 200px" }}>
        <SectionHeader>{t("toolbar.specialKeysHeader")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[t("toolbar.spBigEnter"), "ISO Enter", t("toolbar.spSteppedCaps"), t("toolbar.spCenterStepped"), t("toolbar.spLeds")].map(item => (
            <span key={item} className="kle-chip" style={{ padding: "3px 10px", fontSize: 11, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

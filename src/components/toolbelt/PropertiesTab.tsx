"use client";

import { useEffect, useState } from "react";
import type { KeyProps } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface PropertiesTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const SIZE_STEP = 0.25;
const SIZE_MIN = 0.25;
const ROTATION_PRESETS = [0, 90, 180, -90];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 28, 34, 36];
const COMPAT_STATES: { value: 0 | 1 | undefined; labelKey: string }[] = [
  { value: undefined, labelKey: "compat.normal" },
  { value: 0, labelKey: "compat.compatRegular" },
  { value: 1, labelKey: "compat.compatKey" },
];

function SizeStepper({
  value, disabled, label, title, min = SIZE_MIN, onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  title: string;
  min?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const clamp = (n: number) => Math.max(min, Math.round(n * 100) / 100);
  const step = (dir: number) => onCommit(clamp(value + dir * SIZE_STEP));

  const btn: React.CSSProperties = {
    width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: "20px",
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-surface)", color: "var(--theme-text)",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  };
  const input: React.CSSProperties = {
    width: 52, textAlign: "center", padding: "2px 4px", fontSize: 12,
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-input-bg)", color: "var(--theme-text)",
    fontFamily: "var(--theme-font-mono)",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={title}>
      <button type="button" aria-label={`${label} -`} disabled={disabled} onClick={() => step(-1)} style={btn}>−</button>
      <input
        type="number" step={SIZE_STEP} min={min} value={draft} disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) onCommit(clamp(n));
          else setDraft(String(value));
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={input}
      />
      <button type="button" aria-label={`${label} +`} disabled={disabled} onClick={() => step(1)} style={btn}>+</button>
    </div>
  );
}

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
  const curW2 = key?.w2 ?? 0;
  const curH2 = key?.h2 ?? 0;
  const curX = key?.x || 0;
  const curY = key?.y || 0;
  const curR = key?.r || 0;
  const curRx = key?.rx;
  const curRy = key?.ry;
  const curFontSize = key?.labelSize || 9;
  const curCompat = key?.compat;

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
  const prow: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* Size */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("pt.size")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={prow}>
            <label style={plabel}>{t("pt.width")}</label>
            <SizeStepper
              value={curW} disabled={!hasSelection} label={t("pt.width")} title={t("tip.propW")}
              onCommit={(v) => set("w", v)}
            />
          </div>
          <div style={prow}>
            <label style={plabel}>{t("pt.height")}</label>
            <SizeStepper
              value={curH} disabled={!hasSelection} label={t("pt.height")} title={t("tip.propH")}
              onCommit={(v) => set("h", v)}
            />
          </div>
          <div style={{ height: 1, background: "var(--theme-border-light)", margin: "1px 0" }} />
          <div style={prow}>
            <label style={plabel}>{t("pt.width2")}</label>
            <SizeStepper
              value={curW2} min={0} disabled={!hasSelection} label={t("pt.width2")} title={t("tt.width2")}
              onCommit={(v) => set("w2", v)}
            />
          </div>
          <div style={prow}>
            <label style={plabel}>{t("pt.height2")}</label>
            <SizeStepper
              value={curH2} min={0} disabled={!hasSelection} label={t("pt.height2")} title={t("tt.height2")}
              onCommit={(v) => set("h2", v)}
            />
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

      {/* 兼容区（替代原「特殊键」区块） */}
      <div className="psec" style={{ ...psec, flex: "0 0 200px" }}>
        <SectionHeader>{t("compat.header")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {COMPAT_STATES.map(({ value, labelKey }) => (
            <span key={labelKey} onClick={() => set("compat", value)} title={t("tip.compatState")}
              className={`kle-chip${curCompat === value ? " active" : ""}`}
              style={{ padding: "3px 10px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>{t(labelKey)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

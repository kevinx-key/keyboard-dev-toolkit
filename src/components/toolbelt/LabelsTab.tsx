"use client";

import { CornerDownLeft, Eraser, Copy, ClipboardPaste } from "lucide-react";
import type { KeyProps } from "../../lib";
import { parseLabelColor } from "../../lib/kle-types";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface LabelsTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const LABEL_POS_COUNT = 12;

const ic = { size: 12, strokeWidth: 2 } as const;

export function LabelsTab({ keys, selectedIds, onSetProp }: LabelsTabProps) {
  const { t } = useI18n();
  const selIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!) : -1;
  const key = selIdx >= 0 && selIdx < keys.length ? keys[selIdx] : null;
  const ids = [...selectedIds];
  const hasSelection = selectedIds.length > 0 && key !== null;

  const setLabel = (pos: number, val: string) => {
    if (!hasSelection) return;
    const newLabels = [...(key?.labels ?? Array(12).fill(""))];
    const oldParsed = parseLabelColor(newLabels[pos]);
    if (oldParsed.color && !val.startsWith("#")) {
      newLabels[pos] = `${oldParsed.color}:${val}`;
    } else {
      newLabels[pos] = val;
    }
    onSetProp(ids, "labels", newLabels);
  };

  const curLabel = (pos: number) => {
    if (!key || !hasSelection) return "";
    return parseLabelColor(key.labels?.[pos] ?? "").text;
  };

  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 260,
  };
  const ops: React.CSSProperties = {
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 180,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("lt.header")}</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px" }}>
          {Array.from({ length: LABEL_POS_COUNT }, (_, i) => (
            <div key={i} className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: "0 0 64px", fontSize: 10, color: "var(--theme-text-muted)" }}>#{i + 1} {t(`lt.p${i}`)}</span>
              <input
                value={curLabel(i)}
                onChange={(e) => setLabel(i, e.target.value)}
                className="kle-input"
                title={`${t("tip.labelInput")} (#${i + 1} ${t(`lt.p${i}`)})`}
                style={{
                  flex: 1,
                  borderColor: curLabel(i) ? "var(--theme-border-input-focus)" : "var(--theme-border-input)",
                  padding: "2px 6px", fontSize: 11.5, minHeight: 24,
                  background: curLabel(i) ? "var(--theme-surface-hover)" : "var(--theme-input-bg)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="psec" style={ops}>
        <SectionHeader>{t("lt.ops")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            { label: t("lt.opWrap"), icon: <CornerDownLeft {...ic} /> },
            { label: t("lt.opClearCur"), icon: <Eraser {...ic} /> },
            { label: t("lt.opCopySel"), icon: <Copy {...ic} /> },
            { label: t("lt.opPasteAll"), icon: <ClipboardPaste {...ic} /> },
          ].map(item => (
            <span key={item.label} className="kle-chip" style={{ padding: "3px 10px", fontSize: 11.5, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>
              {item.icon} {item.label}
            </span>
          ))}
        </div>
        <SectionHeader>{t("lt.adjust")}</SectionHeader>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 9, color: "var(--theme-text-muted)" }}>{t("lt.xOffset")}</label>
            <span className="kle-input" style={{ fontSize: 12, minWidth: 40, textAlign: "center", fontFamily: "var(--theme-font-mono)", padding: "2px 6px" }}>0</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={{ fontSize: 9, color: "var(--theme-text-muted)" }}>{t("lt.yOffset")}</label>
            <span className="kle-input" style={{ fontSize: 12, minWidth: 40, textAlign: "center", fontFamily: "var(--theme-font-mono)", padding: "2px 6px" }}>0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

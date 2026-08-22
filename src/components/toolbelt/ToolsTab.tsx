"use client";

import { useState } from "react";
import { Eye, ArrowRight, MoveUpRight } from "lucide-react";
import type { KeyProps } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface ToolsTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const REMOVE_TIP_KEYS: Record<string, string> = {
  all: "tip.clearAll",
  letters: "tip.clearLetters",
  digits: "tip.clearDigits",
  punct: "tip.clearPunct",
  fkeys: "tip.clearFKeys",
  special: "tip.clearSpecial",
  others: "tip.clearOthers",
  decals: "tip.clearDecals",
};

export function ToolsTab({ keys, selectedIds, onSetProp }: ToolsTabProps) {
  const { t } = useI18n();
  const hasSelection = selectedIds.length > 0;
  const ids = [...selectedIds];
  const [moveFrom, setMoveFrom] = useState<number | null>(null);
  const [moveTo, setMoveTo] = useState<number | null>(null);

  const getPrimaryLabelText = (k: KeyProps): string => {
    return k.labels[4] || k.labels[1] || k.labels[0] || k.labels[7] || "";
  };

  const REMOVE_BUTTONS = [
    { id: "all", re: null, decals: false, danger: true },
    { id: "letters", re: /^[A-Za-z]$/, decals: false, danger: true },
    { id: "digits", re: /^\d$/, decals: false, danger: true },
    { id: "punct", re: /^[\x60\x21\x40\x23\x24\x25\x5e\x26\x2a\x28\x29\x2d\x5f\x3d\x2b\x5b\x7b\x5d\x7d\x3b\x3a\x27\x22\x2c\x3c\x2e\x3e\x2f\x3f\x5c\x7c]$/, decals: false, danger: true },
    { id: "fkeys", re: /^F\d{1,2}$/i, decals: false, danger: true },
    { id: "special", re: /<.*>/, decals: false, danger: true },
    { id: "others", re: /[^A-Za-z0-9\s]|\s{2,}|&#.*|&.*?;/, decals: false, danger: false },
    { id: "decals", re: null, decals: true, danger: false },
  ];

  const handleRemoveLegends = (btn: typeof REMOVE_BUTTONS[0]) => {
    const targetIds = ids.length > 0 ? ids : keys.map((_, i) => String(i));
    for (const id of targetIds) {
      const idx = parseInt(id);
      if (isNaN(idx) || idx < 0 || idx >= keys.length) continue;
      const k = keys[idx]!;
      if (btn.decals && !k.d) continue;
      if (!btn.decals && k.d) continue;
      if (btn.re === null) {
        onSetProp([id], "labels", Array(12).fill(""));
        continue;
      }
      const label = getPrimaryLabelText(k);
      if (!label || btn.re.test(label)) {
        onSetProp([id], "labels", Array(12).fill(""));
      }
    }
  };

  const handleAlignLegends = (flags: number) => {
    if (!hasSelection) return;
    const hFlags = flags & 0x0f;
    const vFlags = (flags & 0xf0) >> 4;
    for (const id of ids) {
      const idx = parseInt(id);
      if (isNaN(idx) || idx < 0 || idx >= keys.length) continue;
      const k = keys[idx]!;
      const newLabels = [...k.labels];
      const moveLabel = (from: number, to: number) => {
        if (newLabels[from]) { newLabels[to] = newLabels[from]; newLabels[from] = ""; }
      };
      for (let row = 0; row < 12; row += 3) {
        const l = row, m = row + 1, r = row + 2;
        if (hFlags === 0x01) { if (!newLabels[l]) { moveLabel(m, l); moveLabel(r, m); } if (!newLabels[l]) moveLabel(m, l); }
        else if (hFlags === 0x02) { if (!newLabels[r]) { moveLabel(m, r); moveLabel(l, m); } if (!newLabels[r]) moveLabel(m, r); }
        else { if (newLabels[l] && !newLabels[m] && !newLabels[r]) moveLabel(l, m); if (newLabels[r] && !newLabels[m] && !newLabels[l]) moveLabel(r, m); }
      }
      for (let col = 0; col < 3; col++) {
        const tt = col, m = col + 3, b = col + 6;
        if (vFlags === 0x01) { if (!newLabels[tt]) { moveLabel(m, tt); moveLabel(b, m); } if (!newLabels[tt]) moveLabel(m, tt); }
        else if (vFlags === 0x02) { if (!newLabels[b]) { moveLabel(m, b); moveLabel(tt, m); } if (!newLabels[b]) moveLabel(m, b); }
        else { if (newLabels[tt] && !newLabels[m] && !newLabels[b]) moveLabel(tt, m); if (newLabels[b] && !newLabels[m] && !newLabels[tt]) moveLabel(b, m); }
      }
      onSetProp([id], "labels", newLabels);
    }
  };

  const handleMoveExecute = () => {
    if (moveFrom === null || moveTo === null || moveFrom === moveTo || !hasSelection) return;
    for (const id of ids) {
      const idx = parseInt(id);
      if (isNaN(idx) || idx < 0 || idx >= keys.length) continue;
      const k = keys[idx]!;
      const newLabels = [...k.labels];
      newLabels[moveTo] = newLabels[moveFrom] || "";
      newLabels[moveFrom] = "";
      onSetProp([id], "labels", newLabels);
    }
    setMoveFrom(null);
    setMoveTo(null);
  };

  const ALIGN_BUTTONS = [
    { char: "↖", flags: 0x11 }, { char: "↑", flags: 0x10 }, { char: "↗", flags: 0x12 },
    { char: "←", flags: 0x01 }, { char: "●", flags: 0x00 }, { char: "→", flags: 0x02 },
    { char: "↙", flags: 0x21 }, { char: "↓", flags: 0x20 }, { char: "↘", flags: 0x22 },
  ];

  const gridBtnBase: React.CSSProperties = {
    width: "28px", height: "26px", padding: 0, margin: 0, fontSize: 14, lineHeight: "26px",
    textAlign: "center", border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    cursor: "default",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "var(--theme-surface)", color: "var(--theme-text)",
  };

  const POS_GRID = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [9, 10, 11],
  ];

  const psec: React.CSSProperties = {
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
  };

  const REMOVE_LABEL_KEYS: Record<string, string> = {
    all: "tools.all",
    letters: "tools.alphas",
    digits: "tools.numbers",
    punct: "tools.punctuation",
    fkeys: "clr.fkeys",
    special: "tools.specials",
    others: "tools.others",
    decals: "tools.decals",
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* Remove Legends */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("tools.removeLegends")}</SectionHeader>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {REMOVE_BUTTONS.map((btn) => (
            <button
              key={btn.id}
              onClick={() => handleRemoveLegends(btn)}
              title={t(REMOVE_TIP_KEYS[btn.id] || "tip.clearAll")}
              className="kle-btn"
              style={{
                padding: "3px 9px", fontSize: 10.5, fontWeight: 600,
                borderColor: btn.danger ? "var(--theme-danger)" : "var(--theme-border-input)",
                color: btn.danger ? "var(--theme-danger)" : "var(--theme-text-muted)",
                background: btn.danger ? "rgba(var(--theme-danger-rgb), 0.08)" : "var(--theme-surface)",
                cursor: "pointer",
              }}
            >{t(REMOVE_LABEL_KEYS[btn.id] || btn.id)}</button>
          ))}
        </div>
      </div>

      {/* Align Legends */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("tools.alignLegends")}</SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gap: 3 }}>
          {ALIGN_BUTTONS.map((btn, i) => (
            <button
              key={i}
              onClick={() => handleAlignLegends(btn.flags)}
              title={`${t("tip.alignLegends")} ${btn.char}`}
              style={{
                ...gridBtnBase,
                opacity: hasSelection ? 1 : 0.4,
                cursor: hasSelection ? "pointer" : "not-allowed",
                transition: "opacity 0.15s ease, background-color 0.15s ease",
              }}
              onMouseEnter={e => { if (hasSelection) e.currentTarget.style.background = "var(--theme-surface-hover)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--theme-surface)"; }}
            >{btn.char}</button>
          ))}
        </div>
      </div>

      {/* Move Legends */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("tools.moveLegends")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("tools.from")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {POS_GRID.map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: 3 }}>
                  {row.map((pos) => (
                    <button key={pos}
                      onClick={() => { setMoveFrom(moveFrom === pos ? null : pos); setMoveTo(null); }}
                      title={t("tip.moveFrom")}
                      className="kle-input"
                      style={{
                        width: 22, height: 20, padding: 0, fontSize: 9.5,
                        borderColor: moveFrom === pos ? "var(--theme-primary)" : "var(--theme-border-input)",
                        background: moveFrom === pos ? "var(--theme-primary)" : "var(--theme-surface)",
                        color: moveFrom === pos ? "var(--theme-text-inverse)" : "var(--theme-text)",
                        cursor: "pointer", fontFamily: "var(--theme-font-mono)",
                        textAlign: "center", lineHeight: "20px",
                      }}
                    >{pos}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <ArrowRight size={16} style={{ opacity: 0.4, color: "var(--theme-text-muted)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--theme-text-muted)", marginBottom: 4 }}>{t("tools.to")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {POS_GRID.map((row, ri) => (
                <div key={ri} style={{ display: "flex", gap: 3 }}>
                  {row.map((pos) => (
                    <button key={pos}
                      onClick={() => setMoveTo(moveTo === pos ? null : pos)}
                      title={t("tip.moveTo")}
                      className="kle-input"
                      style={{
                        width: 22, height: 20, padding: 0, fontSize: 9.5,
                        borderColor: moveTo === pos ? "var(--theme-success)" : "var(--theme-border-input)",
                        background: moveTo === pos ? "var(--theme-success)" : "var(--theme-surface)",
                        color: moveTo === pos ? "var(--theme-text-inverse)" : "var(--theme-text)",
                        cursor: "pointer", fontFamily: "var(--theme-font-mono)",
                        textAlign: "center", lineHeight: "20px",
                      }}
                    >{pos}</button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={handleMoveExecute}
            disabled={moveFrom === null || moveTo === null || !hasSelection}
            title={t("tip.moveExecute")}
            className="kle-btn"
            style={{
              padding: "6px 12px", fontSize: 12, fontWeight: 700, height: 30,
              borderColor: moveFrom !== null && moveTo !== null && hasSelection ? "var(--theme-danger)" : "var(--theme-border-input)",
              background: moveFrom !== null && moveTo !== null && hasSelection ? "var(--theme-danger)" : "var(--theme-bg-alt)",
              color: moveFrom !== null && moveTo !== null && hasSelection ? "var(--theme-text-inverse)" : "var(--theme-text-dim)",
              cursor: moveFrom !== null && moveTo !== null && hasSelection ? "pointer" : "not-allowed",
            }}
          ><MoveUpRight size={12} /> {t("tools.moveShort")}</button>
        </div>
      </div>

      {/* Misc */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("tools.misc")}</SectionHeader>
        <button className="kle-chip" style={{ padding: "4px 10px", fontSize: 11, cursor: "default", borderRadius: "var(--theme-radius-sm)" }}>
          <Eye size={12} /> {t("tools.unhideDecals")}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyProps, KLEMeta } from "../../lib";
import { parseLabelColor, getDecalConfig } from "../../lib/kle-types";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";
import { parseColorInput, normalizeHex } from "../../lib/color-convert";
import { TEXTURES } from "../../data/textures";
import ColorPickerPopover from "../ColorPickerPopover";

interface ColorsTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
  meta: KLEMeta;
  onSetMeta: (meta: Partial<KLEMeta>) => void;
}

type PickerTarget = "key" | "label" | "bg" | "gradStart" | "gradEnd";

const WARM_COLORS = ["#d44040", "#e07030", "#f0c040", "#e8a030", "#c83030"];
const COLD_COLORS = ["#4080d4", "#40a080", "#6040a0", "#80b0e0", "#50c0b0"];
const NEUTRAL_COLORS = ["#c8c8c8", "#888888", "#2a2a2a", "#ffffff", "#e0e0d8"];

/** Compact numeric input paired with a slider — allows precise typed values. */
function NumBox({
  value, min, max, step, onCommit, width = 50,
}: {
  value: number; min: number; max: number; step: number;
  onCommit: (n: number) => void; width?: number;
}) {
  const fmt = (n: number) => (step < 1 ? n.toFixed(2) : String(Math.round(n)));
  const [draft, setDraft] = useState(fmt(value));
  useEffect(() => { setDraft(fmt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      const clamped = Math.max(min, Math.min(max, n));
      onCommit(clamped);
      setDraft(fmt(clamped));
    } else {
      setDraft(fmt(value));
    }
  };
  return (
    <input
      type="number" value={draft} min={min} max={max} step={step}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="kle-input"
      style={{ width, padding: "1px 4px", fontSize: 10, fontFamily: "var(--theme-font-mono)", textAlign: "right", flex: "0 0 auto" }}
    />
  );
}

export function ColorsTab({ keys, selectedIds, onSetProp, meta, onSetMeta }: ColorsTabProps) {
  const { t } = useI18n();
  const selIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!) : -1;
  const key = selIdx >= 0 && selIdx < keys.length ? keys[selIdx] : null;
  const ids = [...selectedIds];
  const hasSelection = selectedIds.length > 0 && key !== null;

  const curKeyColor = key?.c || "#c8c8c8";
  const curKey2 = key?.c2 || "";
  const curAngle = typeof key?.cang === "number" ? key.cang : 135;
  const curLabelColor = key ? key.t || parseLabelColor(key.labels[4] || "").color || "#1a1a1a" : "#1a1a1a";
  const curBgColor = meta.backcolor || "#eeeeee";
  const decal = getDecalConfig(meta);

  // ── Local input drafts ──
  const [solidInput, setSolidInput] = useState(curKeyColor);
  const [gradStart, setGradStart] = useState(curKeyColor);
  const [gradEnd, setGradEnd] = useState(curKey2 || "#ffffff");
  const [gradAngle, setGradAngle] = useState(curAngle);
  const [labelInput, setLabelInput] = useState(curLabelColor);
  const [bgInput, setBgInput] = useState(curBgColor);
  const [picker, setPicker] = useState<{ target: PickerTarget; color: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSolidInput(curKeyColor); }, [curKeyColor, selIdx]);
  useEffect(() => { setGradStart(curKeyColor); }, [curKeyColor, selIdx]);
  useEffect(() => { setGradEnd(curKey2 || "#ffffff"); }, [curKey2, selIdx]);
  useEffect(() => { setGradAngle(curAngle); }, [curAngle, selIdx]);
  useEffect(() => { setLabelInput(curLabelColor); }, [curLabelColor, selIdx]);
  useEffect(() => { setBgInput(curBgColor); }, [curBgColor]);

  // ── Color application ──
  const applyColor = (target: PickerTarget, hex: string) => {
    if (target === "key" && hasSelection) onSetProp(ids, "c", hex);
    else if (target === "label" && hasSelection) onSetProp(ids, "t", hex);
    else if (target === "bg") onSetMeta({ backcolor: hex });
    else if (target === "gradStart") setGradStart(hex);
    else if (target === "gradEnd") setGradEnd(hex);
  };

  const commitSolid = () => {
    const hex = parseColorInput(solidInput);
    if (hex && hasSelection) onSetProp(ids, "c", hex);
    else setSolidInput(curKeyColor);
  };
  const commitLabel = () => {
    const hex = parseColorInput(labelInput);
    if (hex && hasSelection) onSetProp(ids, "t", hex);
    else setLabelInput(curLabelColor);
  };
  const commitBg = () => {
    const hex = parseColorInput(bgInput);
    if (hex) onSetMeta({ backcolor: hex });
    else setBgInput(curBgColor);
  };

  const applyGradient = () => {
    if (!hasSelection) return;
    const start = normalizeHex(gradStart) || gradStart;
    const end = normalizeHex(gradEnd) || gradEnd;
    onSetProp(ids, "c", start);
    onSetProp(ids, "c2", end);
    onSetProp(ids, "cang", gradAngle);
  };
  const clearGradient = () => {
    if (!hasSelection) return;
    onSetProp(ids, "c2", "");
  };

  // ── Decal ──
  const onDecalFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        onSetMeta({
          decalImage: dataUrl,
          decalScale: 1,
          decalX: 0,
          decalY: 0,
          decalDim: 0.4,
          decalOpacity: 1,
          decalNatW: img.naturalWidth,
          decalNatH: img.naturalHeight,
        });
      };
      img.onerror = () => onSetMeta({ decalImage: dataUrl, decalScale: 1, decalX: 0, decalY: 0, decalDim: 0.4, decalOpacity: 1 });
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };
  const clearDecal = () => {
    onSetMeta({
      decalImage: undefined, decalScale: undefined, decalX: undefined, decalY: undefined,
      decalDim: undefined, decalOpacity: undefined, decalNatW: undefined, decalNatH: undefined,
    });
  };
  const setDecal = (patch: Partial<KLEMeta>) => onSetMeta(patch);

  // ── Shared styles ──
  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 220,
  };
  const lbl: React.CSSProperties = { flex: "0 0 48px", fontSize: 10, color: "var(--theme-text-muted)" };
  const inputStyle: React.CSSProperties = {
    padding: "2px 6px", fontSize: 11.5, minHeight: 24, flex: 1,
    fontFamily: "var(--theme-font-mono)",
  };
  const fullInputStyle: React.CSSProperties = { ...inputStyle, width: "100%", flex: "none" };
  const smallBtn: React.CSSProperties = {
    padding: "2px 8px", fontSize: 11, cursor: "pointer", borderRadius: "var(--theme-radius-sm)",
  };

  const ColorDot = ({ color }: { color: string }) => (
    <span style={{ width: 18, height: 18, borderRadius: "50%", border: "1.5px solid var(--theme-border-input)", display: "inline-block", background: color }} />
  );

  const family = (name: string, colors: string[]) => (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
      <span style={{ flex: "0 0 36px", fontSize: 10, color: "var(--theme-text-muted)" }}>{name}</span>
      <div style={{ display: "flex", gap: 3 }}>
        {colors.map((c) => (
          <span key={c} onClick={() => hasSelection && onSetProp(ids, "c", c)} title={c}
            style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${curKeyColor === c ? "var(--theme-selected)" : "var(--theme-border-input)"}`, display: "inline-block", background: c, cursor: "pointer" }} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* ═══ Solid color — input box + palette ═══ */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("ct.solidTitle")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <ColorDot color={curKeyColor} />
          <input value={solidInput} onChange={(e) => setSolidInput(e.target.value)} onBlur={commitSolid}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="kle-input" style={inputStyle} placeholder={t("ct.inputPlaceholder")} spellCheck={false} />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button className="kle-btn btn-hover-surface" style={smallBtn} onClick={commitSolid} disabled={!hasSelection}>{t("ct.apply")}</button>
          <button className="kle-btn btn-hover-surface" style={smallBtn}
            onClick={() => setPicker({ target: "key", color: curKeyColor })} disabled={!hasSelection}>{t("ct.openPalette")}</button>
        </div>
        {family(t("ct.warm"), WARM_COLORS)}
        {family(t("ct.cold"), COLD_COLORS)}
        {family(t("ct.neutral"), NEUTRAL_COLORS)}
      </div>

      {/* ═══ Gradient (transition) ═══ */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("ct.gradient")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span onClick={() => setPicker({ target: "gradStart", color: gradStart })} title={t("ct.start")}
            style={{ width: 26, height: 26, borderRadius: 5, border: "2px solid var(--theme-border-input)", background: gradStart, cursor: "pointer" }} />
          <span style={{ fontSize: 12, color: "var(--theme-text-muted)" }}>→</span>
          <span onClick={() => setPicker({ target: "gradEnd", color: gradEnd })} title={t("ct.end")}
            style={{ width: 26, height: 26, borderRadius: 5, border: "2px solid var(--theme-border-input)", background: gradEnd, cursor: "pointer" }} />
          <span style={{ flex: 1, height: 22, borderRadius: 4, border: "1px solid var(--theme-border-input)", background: `linear-gradient(${gradAngle}deg, ${gradStart}, ${gradEnd})` }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <span style={lbl}>{t("ct.angle")}</span>
          <input type="number" min={0} max={360} value={gradAngle}
            onChange={(e) => setGradAngle(Math.max(0, Math.min(360, parseInt(e.target.value) || 0)))}
            className="kle-input" style={{ ...inputStyle, flex: "0 0 64px" }} />
          <input type="range" min={0} max={360} value={gradAngle}
            onChange={(e) => setGradAngle(parseInt(e.target.value))} style={{ flex: 1 }} />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="kle-btn btn-hover-surface" style={smallBtn} onClick={applyGradient} disabled={!hasSelection}>{t("ct.applyGradient")}</button>
          <button className="kle-btn btn-hover-surface" style={smallBtn} onClick={clearGradient} disabled={!hasSelection}>{t("ct.clear")}</button>
        </div>
      </div>

      {/* ═══ Label color ═══ */}
      <div className="psec" style={{ ...psec, flex: 1 }}>
        <SectionHeader>{t("ct.legendColor")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ColorDot color={curLabelColor} />
          <input value={labelInput} onChange={(e) => setLabelInput(e.target.value)} onBlur={commitLabel}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="kle-input" style={inputStyle} spellCheck={false} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
          {["#000000", "#333333", "#666666", "#ffffff"].map((c) => (
            <span key={c} onClick={() => hasSelection && onSetProp(ids, "t", c)} className="kle-chip"
              style={{ padding: "2px 8px", fontSize: 10, borderRadius: "var(--theme-radius-sm)", cursor: "pointer", background: c, color: c === "#ffffff" ? "#333" : "#fff" }}>{c}</span>
          ))}
          <button className="kle-btn btn-hover-surface" style={smallBtn}
            onClick={() => setPicker({ target: "label", color: curLabelColor })} disabled={!hasSelection}>{t("ct.openPalette")}</button>
        </div>
      </div>

      {/* ═══ Background + texture ═══ */}
      <div className="psec" style={{ ...psec, flex: 1 }}>
        <SectionHeader>{t("ct.background")}</SectionHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ColorDot color={curBgColor} />
          <input value={bgInput} onChange={(e) => setBgInput(e.target.value)} onBlur={commitBg}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="kle-input" style={inputStyle} spellCheck={false} />
          <button className="kle-btn btn-hover-surface" style={smallBtn}
            onClick={() => setPicker({ target: "bg", color: curBgColor })}>{t("ct.openPalette")}</button>
        </div>
        <SectionHeader style={{ marginTop: 8 }}>{t("ct.texture")}</SectionHeader>
        <select value={TEXTURES.some((x) => x.url === (meta.background || "")) ? (meta.background || "") : "__custom__"}
          onChange={(e) => { if (e.target.value !== "__custom__") onSetMeta({ background: e.target.value }); }}
          className="kle-input" style={{ ...fullInputStyle }}>
          {TEXTURES.map((tx) => <option key={tx.url || "none"} value={tx.url}>{tx.url ? tx.name : t("ct.texNone")}</option>)}
          {!TEXTURES.some((x) => x.url === (meta.background || "")) && <option value="__custom__">{t("ct.texCustom")}</option>}
        </select>
        <input value={meta.background || ""} onChange={(e) => onSetMeta({ background: e.target.value })}
          className="kle-input" style={{ ...fullInputStyle, marginTop: 4 }} placeholder={t("ct.textureUrl")} spellCheck={false} />
      </div>

      {/* ═══ Image decal ═══ */}
      <div className="psec" style={{ ...psec, flex: 1, minWidth: 260 }}>
        <SectionHeader>{t("ct.decal")}</SectionHeader>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
          onChange={(e) => onDecalFile(e.target.files?.[0] ?? undefined)} />
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <button className="kle-btn btn-hover-surface" style={smallBtn} onClick={() => fileRef.current?.click()}>{t("ct.decalLoad")}</button>
          {decal && <button className="kle-btn btn-hover-surface" style={{ ...smallBtn, color: "var(--theme-warning)" }} onClick={clearDecal}>{t("ct.clear")}</button>}
          {decal && (
            <span style={{ width: 34, height: 24, borderRadius: 4, border: "1px solid var(--theme-border-input)", backgroundImage: `url(${decal.image})`, backgroundSize: "cover", backgroundPosition: "center" }} />
          )}
        </div>
        {decal && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={lbl}>{t("ct.decalScale")}</span>
              <input type="range" min={0.1} max={5} step={0.05} value={decal.scale}
                onChange={(e) => setDecal({ decalScale: parseFloat(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={decal.scale} min={0.1} max={5} step={0.05} onCommit={(n) => setDecal({ decalScale: n })} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={lbl}>X</span>
              <input type="range" min={-800} max={800} value={decal.x}
                onChange={(e) => setDecal({ decalX: parseInt(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={decal.x} min={-800} max={800} step={1} onCommit={(n) => setDecal({ decalX: n })} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={lbl}>Y</span>
              <input type="range" min={-800} max={800} value={decal.y}
                onChange={(e) => setDecal({ decalY: parseInt(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={decal.y} min={-800} max={800} step={1} onCommit={(n) => setDecal({ decalY: n })} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={lbl}>{t("ct.decalDim")}</span>
              <input type="range" min={0} max={0.9} step={0.02} value={decal.dim}
                onChange={(e) => setDecal({ decalDim: parseFloat(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={decal.dim} min={0} max={0.9} step={0.02} onCommit={(n) => setDecal({ decalDim: n })} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={lbl}>{t("ct.decalOpacity")}</span>
              <input type="range" min={0.1} max={1} step={0.02} value={decal.opacity}
                onChange={(e) => setDecal({ decalOpacity: parseFloat(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={decal.opacity} min={0.1} max={1} step={0.02} onCommit={(n) => setDecal({ decalOpacity: n })} />
            </div>
          </>
        )}
      </div>

      <ColorPickerPopover
        open={picker !== null}
        color={picker?.color || "#000000"}
        title={picker?.target === "gradEnd" ? t("ct.end") : picker?.target === "gradStart" ? t("ct.start") : t("cpick.title")}
        onClose={() => setPicker(null)}
        onApply={(hex) => { if (picker) applyColor(picker.target, hex); }}
      />
    </div>
  );
}

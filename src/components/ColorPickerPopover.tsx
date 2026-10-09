"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";
import {
  hexToRgb,
  rgbToHex,
  rgbToCmyk,
  cmykToHex,
  parseColorInput,
  normalizeHex,
} from "../lib/color-convert";

interface ColorPickerPopoverProps {
  open: boolean;
  color: string;
  title?: string;
  onClose: () => void;
  /** Called with a normalized `#rrggbb` when the user confirms. */
  onApply: (hex: string) => void;
}

const label: React.CSSProperties = {
  fontSize: 9, opacity: 0.55, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--theme-text-muted)",
};
const numInput: React.CSSProperties = {
  width: 46, padding: "3px 5px", fontSize: 11,
  border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
  background: "var(--theme-input-bg)", color: "var(--theme-text)",
  fontFamily: "var(--theme-font-mono)",
};
const rowStyle: React.CSSProperties = { display: "flex", gap: 6, alignItems: "center", marginTop: 6 };

export default function ColorPickerPopover({
  open, color, title, onClose, onApply,
}: ColorPickerPopoverProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  const [hex, setHex] = useState<string>(() => normalizeHex(color) || "#000000");
  const [draft, setDraft] = useState<string>(hex);
  const lastOpen = useRef(false);

  // Sync incoming color when the popover opens
  useEffect(() => {
    if (open && !lastOpen.current) {
      const n = normalizeHex(color) || "#000000";
      setHex(n);
      setDraft(n);
    }
    lastOpen.current = open;
  }, [open, color]);

  if (!mounted) return null;

  const rgb = hexToRgb(hex) || { r: 0, g: 0, b: 0 };
  const cmyk = rgbToCmyk(rgb);

  const commitHex = (value: string) => {
    const parsed = parseColorInput(value);
    if (parsed) {
      setHex(parsed.length === 9 ? parsed.slice(0, 7) : parsed);
      setDraft(parsed);
    }
  };

  const setRgbChannel = (ch: "r" | "g" | "b", v: number) => {
    const next = { ...rgb, [ch]: Math.max(0, Math.min(255, Math.round(v))) };
    const h = rgbToHex(next);
    setHex(h);
    setDraft(h);
  };

  const setCmykChannel = (ch: "c" | "m" | "y" | "k", v: number) => {
    const next = { ...cmyk, [ch]: Math.max(0, Math.min(100, Math.round(v))) };
    const h = cmykToHex(next);
    setHex(h);
    setDraft(h);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "var(--theme-overlay)", backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{ padding: "16px 18px", width: 380, maxWidth: "92vw" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, borderBottom: "1px solid var(--theme-separator)", paddingBottom: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--theme-text)" }}>
            {title || t("cpick.title")}
          </h3>
          <button onClick={onClose} className="kle-btn kle-btn-icon" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--theme-text-muted)", fontSize: 16, lineHeight: 1 }} aria-label="Close">×</button>
        </div>

        <div style={{ display: "flex", gap: 16 }}>
          {/* Picker square + hue slider (Photoshop-like) */}
          <div style={{ flexShrink: 0 }}>
            <HexColorPicker color={hex} onChange={(h) => { const n = normalizeHex(h) || h; setHex(n); setDraft(n); }} style={{ width: 190, height: 190 }} />
          </div>

          {/* Numeric panels */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid var(--theme-border-input)", background: hex, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={label}>{t("cpick.hex")}</div>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitHex(draft)}
                  onKeyDown={(e) => { if (e.key === "Enter") { commitHex(draft); (e.target as HTMLInputElement).blur(); } }}
                  style={{ ...numInput, width: "100%", marginTop: 2 }}
                  spellCheck={false}
                />
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={label}>RGB</div>
              <div style={rowStyle}>
                {(["r", "g", "b"] as const).map((ch) => (
                  <input key={ch} type="number" min={0} max={255} value={rgb[ch]}
                    onChange={(e) => setRgbChannel(ch, parseFloat(e.target.value) || 0)}
                    style={numInput} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={label}>CMYK</div>
              <div style={rowStyle}>
                {(["c", "m", "y", "k"] as const).map((ch) => (
                  <input key={ch} type="number" min={0} max={100} value={cmyk[ch]}
                    onChange={(e) => setCmykChannel(ch, parseFloat(e.target.value) || 0)}
                    style={{ ...numInput, width: 38 }} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 10, color: "var(--theme-text-dim)", lineHeight: 1.4 }}>{t("cpick.hint")}</div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button className="kle-btn btn-hover-surface" onClick={onClose} style={{ padding: "5px 16px", cursor: "pointer" }}>{t("cpick.cancel")}</button>
          <button className="kle-btn kle-btn-success" onClick={() => { onApply(hex); onClose(); }} style={{ padding: "5px 16px", cursor: "pointer" }}>{t("cpick.apply")}</button>
        </div>
      </div>
    </div>
  );
}
ColorPickerPopover.displayName = "ColorPickerPopover";

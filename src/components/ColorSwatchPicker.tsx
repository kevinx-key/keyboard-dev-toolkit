"use client";

import { X } from "lucide-react";
import { COLOR_SWATCHES } from "../data/color-swatches";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

interface ColorSwatchPickerProps {
  open: boolean;
  onClose: () => void;
  onSelectColor: (hex: string) => void;
}

export default function ColorSwatchPicker({
  open,
  onClose,
  onSelectColor,
}: ColorSwatchPickerProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--theme-overlay)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{
          maxHeight: "80vh",
          overflowY: "auto",
          width: 420,
          maxWidth: "90vw",
          padding: "16px 20px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            borderBottom: "1px solid var(--theme-separator)",
            paddingBottom: 8,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--theme-text)" }}>
            {t("cs.title")}
          </h3>
          <button
            onClick={onClose}
            className="kle-btn kle-btn-icon"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--theme-text-muted)",
              padding: "0 4px",
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {COLOR_SWATCHES.map((group) => (
          <div key={group.name} style={{ marginBottom: 16 }}>
            <h4
              style={{
                margin: "0 0 8px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {group.name}
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {group.colors.map((swatch) => (
                <button
                  key={swatch.hex + swatch.name}
                  title={swatch.name}
                  onClick={() => onSelectColor(swatch.hex)}
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor: swatch.hex,
                    border: swatch.hex.toLowerCase() === "#ffffff"
                      ? "1px solid var(--theme-border-input)"
                      : "1px solid rgba(0,0,0,0.15)",
                    borderRadius: 4,
                    cursor: "pointer",
                    position: "relative",
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: "center",
                    padding: 0,
                    transition: "transform 0.1s, box-shadow 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.3)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)";
                    e.currentTarget.style.zIndex = "1";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.zIndex = "0";
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
ColorSwatchPicker.displayName = "ColorSwatchPicker";

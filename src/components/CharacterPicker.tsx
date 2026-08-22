"use client";

import { X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

interface CharacterSection {
  nameKey: string;
  chars: string[];
}

const SECTIONS: CharacterSection[] = [
  {
    nameKey: "cp.htmlEntities",
    chars: ["©", "®", "™", "←", "↑", "→", "↓", "√", "∞", "≈", "≠", "±"],
  },
  {
    nameKey: "cp.diacritical",
    chars: ["à", "á", "â", "ä", "é", "è", "ê", "ë", "í", "ì", "î", "ï", "ó", "ò", "ô", "ö", "ú", "ù", "û", "ü"],
  },
  {
    nameKey: "cp.specialSymbols",
    chars: ["§", "¶", "†", "‡", "•", "‣", "…"],
  },
];

interface CharacterPickerProps {
  open: boolean;
  onClose: () => void;
  onInsert: (char: string) => void;
}

export default function CharacterPicker({
  open,
  onClose,
  onInsert,
}: CharacterPickerProps) {
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
          width: 400,
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
            {t("cp.title")}
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

        {SECTIONS.map((section) => (
          <div key={section.nameKey} style={{ marginBottom: 16 }}>
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
              {t(section.nameKey)}
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {section.chars.map((char) => (
                <button
                  key={char}
                  title={char}
                  onClick={() => onInsert(char)}
                  style={{
                    width: 36,
                    height: 36,
                    fontSize: 16,
                    fontFamily: "inherit",
                    color: "var(--theme-text, #333)",
                    backgroundColor: "var(--theme-surface, #f8f8f8)",
                    border: "1px solid var(--theme-border, #ddd)",
                    borderRadius: 4,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                    transition: "background-color 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-surface-hover, #e8e8e8)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--theme-surface, #f8f8f8)";
                  }}
                >{char}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
CharacterPicker.displayName = "CharacterPicker";

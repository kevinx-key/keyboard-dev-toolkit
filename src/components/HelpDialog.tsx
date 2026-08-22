"use client";

import { HelpCircle, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const shortcutKeys = [
  { keys: ["Delete", "Backspace"], actionKey: "help.action.delete" },
  { keys: ["Ctrl+Z"], actionKey: "help.action.undo" },
  { keys: ["Ctrl+Y", "Ctrl+Shift+Z"], actionKey: "help.action.redo" },
  { keys: ["Ctrl+C"], actionKey: "help.action.copy" },
  { keys: ["Ctrl+V"], actionKey: "help.action.paste" },
  { keys: ["Ctrl+X"], actionKey: "help.action.cut" },
  { keys: ["Ctrl+A"], actionKey: "help.action.selectAll" },
  { keys: ["Arrow keys"], actionKey: "help.action.nudge" },
  { keys: ["F1", "?"], actionKey: "help.action.showHelp" },
  { keys: ["Escape"], actionKey: "help.action.deselect" },
];

export default function HelpDialog({ open, onClose }: HelpDialogProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--theme-overlay)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{
          position: "relative",
          backgroundClip: "padding-box",
          maxWidth: 620,
          width: "100%",
          margin: 30,
          fontFamily: "var(--theme-font-ui)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "15px",
            borderBottom: "1px solid var(--theme-border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h4
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 500,
              lineHeight: 1.42857143,
              color: "var(--theme-text)",
            }}
          >
            <HelpCircle
              className="inline-block"
              style={{ marginRight: 8, verticalAlign: "middle" }}
              size={18}
            />
            {t("help.title")}
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 21,
              fontWeight: 700,
              lineHeight: 1,
              color: "var(--theme-text-muted)",
              opacity: 0.2,
              cursor: "pointer",
              padding: 0,
            }}
            aria-label="Close"
          >
            <X size={21} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 15 }}>
          <table
            style={{
              width: "100%",
              maxWidth: "100%",
              borderCollapse: "collapse",
              borderSpacing: 0,
              backgroundColor: "transparent",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    borderBottom: "2px solid var(--theme-border)",
                    padding: "8px",
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--theme-text)",
                  }}
                >
                  {t("help.shortcut")}
                </th>
                <th
                  style={{
                    borderBottom: "2px solid var(--theme-border)",
                    padding: "8px",
                    textAlign: "left",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--theme-text)",
                  }}
                >
                  {t("help.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {shortcutKeys.map((s, i) => (
                <tr key={i}>
                  <td
                    style={{
                      padding: "8px",
                      borderTop: "1px solid var(--theme-border)",
                      verticalAlign: "top",
                      fontSize: 14,
                      color: "var(--theme-text)",
                    }}
                  >
                    <kbd
                      className="kle-kbd"
                      style={{
                        padding: "2px 6px",
                        fontSize: "90%",
                        color: "var(--theme-text)",
                        backgroundColor: "var(--theme-bg-alt)",
                        borderRadius: 4,
                        fontFamily: "var(--theme-font-mono)",
                      }}
                    >
                      {s.keys.join(" / ")}
                    </kbd>
                  </td>
                  <td
                    style={{
                      padding: "8px",
                      borderTop: "1px solid var(--theme-border)",
                      verticalAlign: "top",
                      fontSize: 14,
                      color: "var(--theme-text)",
                    }}
                  >
                    {t(s.actionKey)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "15px",
            borderTop: "1px solid var(--theme-border-light)",
            textAlign: "right",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="kle-btn kle-btn-primary"
            style={{ cursor: "pointer" }}
          >
            {t("help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
HelpDialog.displayName = "HelpDialog";

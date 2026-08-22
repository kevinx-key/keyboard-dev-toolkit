"use client";

import { History, X } from "lucide-react";
import { usePresence } from "./ui/usePresence";
import { useI18n } from "../lib/i18n";

interface ProjectBackupEntry {
  id?: number;
  timestamp: number;
  keyboardName: string;
  projectData: string;
}

interface ProjectBackupDialogProps {
  open: boolean;
  backupList: ProjectBackupEntry[];
  onClose: () => void;
  onRestore: (projectData: string) => void;
}

/** M6: Extracted from EditorPage — Project backup restore dialog */
export default function ProjectBackupDialog({
  open, backupList, onClose, onRestore,
}: ProjectBackupDialogProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        backgroundColor: "var(--theme-overlay)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div onClick={e => e.stopPropagation()} className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{
          padding: 20, minWidth: 380, maxWidth: 500, maxHeight: "70vh", overflowY: "auto",
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--theme-text)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <History size={15} /> {t("pbackup.title")}
          </h3>
          <button onClick={onClose} className="kle-btn kle-btn-icon" style={{ border: "none", background: "transparent", color: "var(--theme-text-muted)", cursor: "pointer" }} aria-label={t("help.close")}>
            <X size={14} />
          </button>
        </div>
        {backupList.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--theme-text-dim)", textAlign: "center", padding: "20px 0" }}>
            {t("pbackup.empty")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {backupList.map((entry, idx) => {
              const d = new Date(entry.timestamp);
              const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
              const isNewest = idx === 0;
              return (
                <div key={entry.id ?? idx} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: "var(--theme-radius-md)",
                  border: isNewest ? "1px solid var(--theme-accent)" : "1px solid var(--theme-border-light)",
                  backgroundColor: isNewest ? "var(--theme-surface-hover)" : "transparent",
                  transition: "border-color 0.15s ease, background-color 0.15s ease",
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--theme-text)" }}>
                      {entry.keyboardName}
                      {isNewest && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--theme-accent)", fontWeight: 600 }}>{t("pbackup.newest")}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--theme-text-dim)", fontFamily: "var(--theme-font-mono)" }}>{timeStr}</div>
                  </div>
                  <button onClick={() => onRestore(entry.projectData)}
                    className="kle-btn kle-btn-primary"
                    style={{ padding: "4px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {t("backup.restore")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
          <button onClick={onClose} className="kle-btn" style={{ padding: "6px 18px", fontSize: 12, cursor: "pointer" }}>
            {t("help.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

ProjectBackupDialog.displayName = "ProjectBackupDialog";

"use client";

import { logger } from "../lib/error-logger";
import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { getBackups, deleteBackup, clearAllBackups, downloadBackup, formatBackupTime } from "../lib/backup-manager";
import type { BackupEntry } from "../lib/backup-manager";
import { usePresence } from "./ui/usePresence";

interface BackupDialogProps {
  open: boolean;
  onClose: () => void;
  onRestore: (rawData: string) => void;
}

export default function BackupDialog({ open, onClose, onRestore }: BackupDialogProps) {
  const { t } = useI18n();
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getBackups();
      setBackups(list);
    } catch { logger.error("getBackups failed"); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const handleDelete = async (id: number) => {
    await deleteBackup(id);
    refresh();
  };

  const handleClearAll = async () => {
    if (!window.confirm(t("backup.confirmClear") || "Clear all backups? This cannot be undone.")) return;
    await clearAllBackups();
    refresh();
  };

  const handleRestore = (entry: BackupEntry) => {
    if (window.confirm(t("backup.confirmRestore") || "Restore this backup? Current data will be replaced.")) {
      onRestore(entry.rawData);
      onClose();
    }
  };

  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "var(--theme-overlay)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{
          width: 560, maxHeight: "80vh", display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 18px", borderBottom: "1px solid var(--theme-border, #ddd)",
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "var(--theme-text, #333)" }}>
            {t("backup.title")}
          </h2>
          <button onClick={onClose} style={{
            padding: "4px 10px", fontSize: 13, border: "1px solid var(--theme-border, #ccc)",
            borderRadius: 6, background: "transparent", cursor: "pointer",
            color: "var(--theme-text, #333)",
          }}>
            {t("help.close")}
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 0", minHeight: 120 }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--theme-text-muted, #999)" }}>
              {t("backup.loading")}...
            </div>
          ) : backups.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: "var(--theme-text-muted, #999)", fontSize: 13 }}>
              {t("backup.empty")}
            </div>
          ) : (
            backups.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 18px", fontSize: 12,
                  borderBottom: "1px solid var(--theme-separator, #eee)",
                }}
              >
                <span style={{ width: 130, flexShrink: 0, color: "var(--theme-text, #333)", fontWeight: 500 }}>
                  {formatBackupTime(entry.timestamp)}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--theme-text-dim, #888)" }}>
                  {entry.keyboardName || "unnamed"}
                </span>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button
                    onClick={() => handleRestore(entry)}
                    title={t("backup.restore")}
                    style={{
                      padding: "3px 8px", fontSize: 11, fontWeight: 600,
                      border: "1px solid var(--theme-primary, #337ab7)", borderRadius: 3,
                      background: "var(--theme-primary, #337ab7)", color: "#fff", cursor: "pointer",
                    }}
                  >
                    {t("backup.restore")}
                  </button>
                  <button
                    onClick={() => downloadBackup(entry)}
                    title={t("toolbar.downloadJson")}
                    style={{
                      padding: "3px 8px", fontSize: 11, fontWeight: 600,
                      border: "1px solid var(--theme-border-input, #ccc)", borderRadius: 3,
                      background: "var(--theme-input-bg, #f5f5f5)", cursor: "pointer",
                      color: "var(--theme-text, #333)",
                    }}
                  >
                    {t("toolbar.downloadJson")}
                  </button>
                    <button
                      onClick={() => entry.id !== undefined && handleDelete(entry.id)}
                      title={t("backup.delete")}
                      className="kle-btn kle-btn-icon"
                      style={{ borderColor: "var(--theme-danger)", color: "var(--theme-danger)", cursor: "pointer", background: "transparent" }}
                    >
                      <X size={12} />
                    </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {backups.length > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 18px", borderTop: "1px solid var(--theme-border, #ddd)",
            fontSize: 11, color: "var(--theme-text-muted, #999)",
          }}>
            <span>{t("backup.count").replace("{{n}}", String(backups.length))}</span>
            <button
              onClick={handleClearAll}
              style={{
                padding: "4px 12px", fontSize: 11, fontWeight: 600,
                border: "1px solid var(--theme-danger, #d9534f)", borderRadius: 3,
                background: "transparent", color: "var(--theme-danger, #d9534f)", cursor: "pointer",
              }}
            >
              {t("backup.clearAll")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

BackupDialog.displayName = "BackupDialog";

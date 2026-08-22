"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, RefreshCw, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

type Phase = "idle" | "checking" | "latest" | "available" | "downloading" | "installed" | "error";

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function UpdateDialog({ open, onClose }: UpdateDialogProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);

  const [phase, setPhase] = useState<Phase>("idle");
  const [newVersion, setNewVersion] = useState("");
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState("");
  const updateRef = useRef<Update | null>(null);
  const busy = phase === "checking" || phase === "downloading";

  const runCheck = useCallback(async () => {
    setPhase("checking");
    setError("");
    try {
      const update = await check();
      if (!update) {
        setPhase("latest");
        return;
      }
      updateRef.current = update;
      setNewVersion(update.version);
      setPhase("available");
    } catch (e) {
      setError((e as Error)?.message || String(e));
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      void runCheck();
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, runCheck]);

  const handleInstall = async () => {
    const update = updateRef.current;
    if (!update) {
      runCheck();
      return;
    }
    setPhase("downloading");
    setPercent(null);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          downloaded = 0;
          total = ev.data.contentLength ?? 0;
        } else if (ev.event === "Progress") {
          downloaded += ev.data.chunkLength;
          setPercent(total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : null);
        }
      });
      setPercent(100);
      setPhase("installed");
      try {
        await relaunch();
      } catch (e) {
        console.warn("relaunch failed after update install:", e);
      }
    } catch (e) {
      setError((e as Error)?.message || String(e));
      setPhase("error");
    }
  };

  if (!mounted) return null;

  const pctText = percent == null ? "…" : String(percent);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1060,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "var(--theme-overlay)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
        }}
        onClick={busy ? undefined : onClose}
      />

      <div
        className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`}
        style={{
          position: "relative",
          backgroundClip: "padding-box",
          maxWidth: 460,
          width: "100%",
          margin: 30,
          fontFamily: "var(--theme-font-ui)",
        }}
      >
        <div
          style={{
            padding: "15px",
            borderBottom: "1px solid var(--theme-border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
            <RefreshCw size={15} /> {t("update.title")}
          </span>
          {!busy && (
            <button className="kle-btn" onClick={onClose} title={t("update.close")} style={{ cursor: "pointer" }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div style={{ padding: "18px 15px", display: "flex", flexDirection: "column", gap: 12 }}>
          {(phase === "checking" || phase === "idle") && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <RefreshCw size={14} className="kle-spin" /> {t("update.checking")}
            </span>
          )}

          {phase === "latest" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} style={{ color: "var(--theme-accent)" }} /> {t("update.latest")}
            </span>
          )}

          {phase === "available" && (
            <span>{t("update.available").replace("{v}", newVersion)}</span>
          )}

          {phase === "downloading" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Download size={14} /> {t("update.downloading").replace("{p}", pctText)}
            </span>
          )}

          {phase === "installed" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} style={{ color: "var(--theme-accent)" }} /> {t("update.installReady")}
            </span>
          )}

          {phase === "error" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} style={{ color: "var(--theme-danger)" }} />
              <span style={{ wordBreak: "break-all" }}>{t("update.error").replace("{msg}", error || "?")}</span>
            </span>
          )}

          {phase === "downloading" && (
            <div style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "var(--theme-border-light)" }}>
              <div
                style={{
                  height: "100%",
                  width: percent == null ? "100%" : `${percent}%`,
                  backgroundColor: "var(--theme-accent)",
                  transition: "width 0.15s ease",
                  opacity: percent == null ? 0.4 : 1,
                }}
              />
            </div>
          )}
        </div>

        <div
          style={{
            padding: "12px 15px",
            borderTop: "1px solid var(--theme-border-light)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          {phase === "available" && (
            <>
              <button className="kle-btn" onClick={onClose} style={{ cursor: "pointer" }}>
                {t("update.later")}
              </button>
              <button className="kle-btn kle-btn-primary" onClick={handleInstall} style={{ cursor: "pointer" }}>
                {t("update.install")}
              </button>
            </>
          )}

          {(phase === "latest" || phase === "error" || phase === "installed") && (
            <button className="kle-btn kle-btn-primary" onClick={onClose} style={{ cursor: "pointer" }}>
              {t("update.close")}
            </button>
          )}

          {phase === "checking" && (
            <button className="kle-btn" onClick={onClose} style={{ cursor: "pointer" }}>
              {t("update.cancel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

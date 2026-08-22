"use client";

import { useEffect, useState, useRef } from "react";
import { useI18n } from "../lib/i18n";

/**
 * 全屏导出遮罩 — STP 导出时覆盖整个界面
 * 显示实时进度条、阶段说明、已用计时和详细日志
 */

export interface StpProgressData {
  percentage: number;
  phaseLabel: string;
  message: string;
}

interface LogEntry {
  time: string;
  text: string;
  done: boolean;
}

interface StpExportOverlayProps {
  visible: boolean;
  progress?: StpProgressData | null;
}

export default function StpExportOverlay({ visible, progress }: StpExportOverlayProps) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const lastMsgRef = useRef<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [log]);

  // Elapsed time counter
  useEffect(() => {
    if (!visible) {
      setElapsed(0);
      startRef.current = null;
      setLog([]);
      lastMsgRef.current = "";
      return;
    }
    if (startRef.current === null) startRef.current = Date.now();

    const interval = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }
    }, 200);

    return () => clearInterval(interval);
  }, [visible]);

  // Append log entries when phase/message changes
  useEffect(() => {
    if (!progress || !visible) return;
    const msg = `${progress.phaseLabel}: ${progress.message}`;
    const dedupKey = `${progress.percentage}-${msg}`;
    if (dedupKey === lastMsgRef.current) return;

    // Log on every 5% bump, every phase change, and at completion milestones
    const ts = new Date();
    const timeStr = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;

    // Log the previous entry as "done" if it existed
    setLog(prev => {
      const next = [...prev];
      if (next.length > 0 && !next[next.length - 1]!.done) {
        next[next.length - 1] = { ...next[next.length - 1]!, done: true };
      }
      next.push({ time: timeStr, text: msg, done: false });
      return next;
    });

    lastMsgRef.current = dedupKey;
  }, [progress, visible]);

  // Mark last entry as done when overlay hides
  useEffect(() => {
    if (!visible) {
      setLog(prev => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        if (!next[next.length - 1]!.done) {
          next[next.length - 1] = { ...next[next.length - 1]!, done: true };
        }
        return next;
      });
    }
  }, [visible]);

  if (!visible) return null;

  const pct = progress?.percentage ?? 0;
  const showProgress = pct > 0;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        backgroundColor: "rgba(var(--theme-bg-rgb), 0.90)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        cursor: "wait",
      }}
    >
      {/* ── 标题 ── */}
      <div style={{
        fontSize: 16,
        fontWeight: 700,
        color: "var(--theme-text)",
        fontFamily: "var(--theme-font-ui)",
        letterSpacing: 0.3,
      }}>
        {t("stp.title")}
      </div>

      {/* ── 进度条 ── */}
      <div style={{
        width: 360, maxWidth: "85vw",
        backgroundColor: "var(--theme-border-light)",
        borderRadius: 10,
        overflow: "hidden",
        height: 8,
      }}>
        <div style={{
          width: `${showProgress ? pct : 8}%`,
          height: "100%",
          background: "var(--theme-gradient-primary)",
          borderRadius: 10,
          boxShadow: "0 0 12px var(--theme-selected-glow)",
          transition: showProgress ? "width 0.4s ease" : "none",
        }}
          className={!showProgress ? "kle-stp-indeterminate-bar" : undefined}
        />
      </div>

      {/* ── 当前阶段 + 百分比 + 计时 ── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--theme-text)",
          fontFamily: "var(--theme-font-ui)",
        }}>
          {progress ? `${progress.phaseLabel} ${pct}%` : t("stp.preparing")}
        </span>
        <span style={{
          fontSize: 22,
          fontWeight: 300,
          color: "var(--theme-text-muted)",
          fontFamily: "var(--theme-font-mono)",
          letterSpacing: 1,
        }}>
          {timeStr}
        </span>
      </div>

      {/* ── 当前详细信息 ── */}
      {progress?.message && (
        <div style={{
          fontSize: 12,
          color: "var(--theme-text-muted)",
          fontFamily: "var(--theme-font-ui)",
          maxWidth: 400,
          textAlign: "center",
          lineHeight: 1.4,
        }}>
          {progress.message}
        </div>
      )}

      {/* ── 阶段日志 (terminal-like) ── */}
      {log.length > 0 && (
        <div style={{
          width: 400, maxWidth: "85vw",
          maxHeight: 160,
          overflowY: "auto",
          backgroundColor: "var(--theme-bg-alt)",
          borderRadius: "var(--theme-radius-md)",
          padding: "8px 12px",
          marginTop: 4,
          fontFamily: "var(--theme-font-mono)",
          fontSize: 11,
          lineHeight: 1.6,
          border: "1px solid var(--theme-border-light)",
        }}>
          {log.map((entry, i) => (
            <div key={i} style={{
              display: "flex",
              gap: 8,
              color: entry.done ? "var(--theme-text-muted)" : "var(--theme-primary)",
              fontWeight: entry.done ? 400 : 600,
            }}>
              <span style={{ color: "var(--theme-text-dim)", flexShrink: 0 }}>{entry.time}</span>
              <span style={{
                flexShrink: 0,
                color: entry.done ? "var(--theme-success)" : "var(--theme-primary)",
              }}>
                {entry.done ? "✓" : "●"}
              </span>
              <span style={{ wordBreak: "break-word" }}>{entry.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}

      {!showProgress && (
        <div style={{
          fontSize: 11,
          color: "var(--theme-text-dim)",
          fontFamily: "var(--theme-font-ui)",
        }}>
          {t("stp.engineNote")}
        </div>
      )}

    </div>
  );
}
StpExportOverlay.displayName = "StpExportOverlay";

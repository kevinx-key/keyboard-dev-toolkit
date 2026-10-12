"use client";

import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloudCog, X } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

interface StpConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * STP 导出确认弹窗（云端算力提示）。
 * 每个编辑器导出 STP 前弹出，告知用户消耗云端算力并确认后才开始导出。
 */
export default function StpConfirmDialog({ open, onConfirm, onCancel }: StpConfirmDialogProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
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
        onClick={onCancel}
      />

      {/* Dialog */}
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
          }}
        >
          <h4 style={{ margin: 0, fontSize: 18, fontWeight: 500, lineHeight: 1.42857143, color: "var(--theme-text)" }}>
            <CloudCog className="inline-block" style={{ marginRight: 8, verticalAlign: "middle" }} size={18} />
            {t("stp.confirmTitle")}
          </h4>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: "none", border: "none", fontSize: 21, fontWeight: 700, lineHeight: 1,
              color: "var(--theme-text-muted)", opacity: 0.2, cursor: "pointer", padding: 0,
            }}
            aria-label={t("stp.confirmCancel")}
          >
            <X size={21} />
          </button>
        </div>

        <div style={{ padding: 15 }}>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--theme-text)", whiteSpace: "pre-wrap" }}>
            {t("stp.confirmBody")}
          </div>
        </div>

        <div style={{ padding: "15px", borderTop: "1px solid var(--theme-border-light)", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} className="kle-btn" style={{ cursor: "pointer" }}>
            {t("stp.confirmCancel")}
          </button>
          <button type="button" onClick={onConfirm} className="kle-btn kle-btn-primary" style={{ cursor: "pointer" }}>
            {t("stp.confirmOk")}
          </button>
        </div>
      </div>
    </div>
  );
}
StpConfirmDialog.displayName = "StpConfirmDialog";

/**
 * 可 await 的 STP 确认：`if (!(await confirmStp())) return;`
 * 返回的 `dialog` 需渲染到组件树中（portal 到 body，位置无关）。
 */
export function useStpConfirm() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirmStp = useCallback(
    () => new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpen(true);
    }),
    [],
  );

  const settle = useCallback((v: boolean) => {
    setOpen(false);
    const r = resolver.current;
    resolver.current = null;
    r?.(v);
  }, []);

  const dialog = open && typeof document !== "undefined"
    ? createPortal(
        <StpConfirmDialog open onConfirm={() => settle(true)} onCancel={() => settle(false)} />,
        document.body,
      )
    : null;

  return { confirmStp, dialog };
}

"use client";

import { Info, X, ExternalLink } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";
import { APP_VERSION, openExternal } from "../lib/platform-bridge";
import { Z_INDEX } from "../lib/z-index";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

const NOTICE_URL =
  "https://github.com/kevinx-key/keyboard-dev-toolkit/blob/main/THIRD-PARTY-NOTICES.md";

/**
 * 关于 / 许可证弹窗（G-A6）。
 * 满足 OCCT（LGPL-2.1-only WITH OCCT-exception-1.0）随产品分发的声明义务：
 * 标明组件、许可、并给出完整许可证/声明文本入口。本应用自身代码为 AGPL-3.0-only。
 */
export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  const { t } = useI18n();
  const { mounted, visible } = usePresence(open, 160);
  if (!mounted) return null;

  return (
    <div
      data-ui-blocking="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z_INDEX.modal,
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
          // 矮窗口下可滚动，避免弹窗被视口裁切
          maxHeight: "calc(100vh - 60px)",
          overflowY: "auto",
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
            <Info
              className="inline-block"
              style={{ marginRight: 8, verticalAlign: "middle" }}
              size={18}
            />
            {t("about.title")}
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
        <div style={{ padding: 15, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--theme-text)" }}>
            {t("about.product").replace("{{v}}", APP_VERSION)}
          </div>

          <section>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                marginBottom: 4,
              }}
            >
              {t("about.licenseHeading")}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--theme-text)" }}>
              {t("about.licenseCode")}
            </div>
          </section>

          <section>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--theme-text-muted)",
                marginBottom: 4,
              }}
            >
              {t("about.thirdPartyHeading")}
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                lineHeight: 1.6,
                color: "var(--theme-text)",
              }}
            >
              <li>{t("about.occt")}</li>
              <li>{t("about.cadrum")}</li>
            </ul>
          </section>

          <button
            type="button"
            onClick={() => void openExternal(NOTICE_URL)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--theme-primary)",
              cursor: "pointer",
            }}
          >
            <ExternalLink size={13} /> {t("about.noticeLink")}
          </button>
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
            {t("about.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
AboutDialog.displayName = "AboutDialog";

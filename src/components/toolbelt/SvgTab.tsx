"use client";

import { Download, ClipboardCopy, Link2, Eye } from "lucide-react";
import type { KLELayout } from "../../lib";
import { exportSVG } from "../../lib/kle-export";
import { sanitizeSvg } from "../../lib/sanitize";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";

interface SvgTabProps {
  layout: KLELayout;
}

const ic = { size: 12, strokeWidth: 2 } as const;

export function SvgTab({ layout }: SvgTabProps) {
  const { t } = useI18n();
  const svgString = (() => {
    try { const raw = exportSVG(layout, 1); return raw ? sanitizeSvg(raw) : ""; } catch { return ""; }
  })();

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "2px 8px", fontSize: 10.5, borderRadius: "var(--theme-radius-sm)",
    cursor: "default",
    background: active ? "var(--theme-primary)" : "var(--theme-surface)",
    border: active ? "1px solid var(--theme-primary)" : "1px solid var(--theme-border-input)",
    color: active ? "var(--theme-text-inverse)" : "var(--theme-text)",
    display: "inline-flex", alignItems: "center", gap: 4,
  });
  const plabel: React.CSSProperties = {
    fontSize: 9, color: "var(--theme-text-muted)", textTransform: "uppercase",
    letterSpacing: "0.06em",
  };
  const psec: React.CSSProperties = {
    flex: 2,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 260,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      <div className="psec" style={psec}>
        <SectionHeader>{t("svg.config")}</SectionHeader>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("svg.scale")}</label>
            <div style={{ display: "flex", gap: 3 }}>
              {["1×", "2×", "3×", "4×"].map(s => (
                <span key={s} style={chip(s === "1×")}>{s}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("svg.bg")}</label>
            <div style={{ display: "flex", gap: 3 }}>
              {[t("svg.transparent"), t("svg.white"), t("svg.black")].map(s => (
                <span key={s} style={chip(s === t("svg.transparent"))}>{s}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("svg.embedStyles")}</label>
            <div style={{ display: "flex", gap: 3 }}>
              <span style={chip(true)}>{t("common.yes")}</span>
              <span style={chip(false)}>{t("common.no")}</span>
            </div>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("svg.capEffect")}</label>
            <div style={{ display: "flex", gap: 3 }}>
              <span style={chip(true)}>3D</span>
              <span style={chip(false)}>{t("svg.flat")}</span>
            </div>
          </div>
        </div>
        {/* SVG Preview placeholder */}
        <div style={{
          marginTop: 10, width: "100%", height: 120,
          background: "var(--theme-bg-alt)", border: "1px dashed var(--theme-border-input)",
          borderRadius: "var(--theme-radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          fontSize: 11, color: "var(--theme-text-dim)",
        }}>
          <Eye size={13} /> {t("svg.previewKB").replace("{{kb}}", String(Math.round(svgString.length / 1024)))}
        </div>
      </div>

      <div className="psec" style={{ ...psec, flex: 1, minWidth: 170 }}>
        <SectionHeader>{t("svg.actions")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            t("menu.downloadFmt").replace("{{fmt}}", "SVG"),
            t("menu.downloadFmt").replace("{{fmt}}", "PNG (1×)"),
            t("menu.downloadFmt").replace("{{fmt}}", "PNG (2×)"),
            t("menu.downloadFmt").replace("{{fmt}}", "PNG (4×)"),
            t("menu.downloadFmt").replace("{{fmt}}", "JPG"),
            t("toolbar.thumbnail"),
          ].map(item => (
            <span key={item} className="kle-chip" style={{ padding: "4px 10px", fontSize: 11.5, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>
              <Download {...ic} /> {item}
            </span>
          ))}
          <div style={{ height: 1, background: "var(--theme-border-light)", margin: "4px 0" }}></div>
          <span className="kle-chip" style={{ padding: "4px 10px", fontSize: 11.5, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>
            <ClipboardCopy {...ic} /> {t("svg.copyCode")}
          </span>
        </div>
      </div>

      <div className="psec" style={{ ...psec, flex: 1, minWidth: 190 }}>
        <SectionHeader>{t("navbar.permalink")}</SectionHeader>
        <div className="lbl-row" style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span className="kle-input" style={{ flex: 1, fontSize: 10, color: "var(--theme-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            data:application/json,...
          </span>
        </div>
        <span className="kle-chip" style={{ marginTop: 6, padding: "3px 8px", fontSize: 10.5, cursor: "default", borderRadius: "var(--theme-radius-sm)" }}>
          <Link2 {...ic} /> {t("svg.copyPermalink")}
        </span>
      </div>
    </div>
  );
}

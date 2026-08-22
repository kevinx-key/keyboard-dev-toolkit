"use client";

import { useState } from "react";
import { RefreshCw, ClipboardCopy, Download, Upload, FolderOpen, Wand2 } from "lucide-react";
import type { KLELayout } from "../../lib";
import { exportJSON, downloadJSON, uploadJSON } from "../../lib/kle-export";
import { parseKLEJSON } from "../../lib/kle-serial";
import { useI18n } from "../../lib/i18n";

interface RawDataTabProps {
  layout: KLELayout;
  onLoadLayout: (layout: KLELayout) => void;
  onOpenBackup?: () => void;
}

const ic = { size: 12, strokeWidth: 2 } as const;

export function RawDataTab({ layout, onLoadLayout, onOpenBackup }: RawDataTabProps) {
  const { t } = useI18n();
  const [text, setText] = useState(() => {
    try { return exportJSON(layout); } catch { return ""; }
  });
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (val: string) => {
    setText(val);
    setHasChanges(true);
    // Live validate
    try { JSON.parse(val.trim() || "{}"); setError(null); }
    catch { setError(t("rd.syntaxError")); }
  };

  const applyChanges = () => {
    const raw = text.trim();
    if (!raw) return;
    try {
      let data: unknown;
      try { data = JSON.parse(raw); }
      catch {
        const fixed = raw.replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        data = JSON.parse(fixed);
      }
      const parsed = parseKLEJSON(data);
      if (parsed) {
        onLoadLayout(parsed);
        setError(null);
        setHasChanges(false);
      }
    } catch (e) {
      setError(`${t("rd.parseErrPrefix")}${(e as Error).message}`);
    }
  };

  const keyCount = (() => {
    try {
      const d = JSON.parse(text.trim() || "[]");
      return Array.isArray(d) ? d.length - 1 : 0;
    } catch { return 0; }
  })();

  return (
    <div className="belt-inner" style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, marginBottom: 6 }}>
        <span className="kle-hud-dot" style={{
          width: 8, height: 8, borderRadius: "50%",
          background: error ? "var(--theme-danger)" : "var(--theme-success)",
          boxShadow: `0 0 6px ${error ? "var(--theme-danger)" : "var(--theme-success)"}`,
          display: "inline-block",
        }}></span>
        <span style={{ color: error ? "var(--theme-danger)" : "var(--theme-success)" }}>
          {error || t("rd.validKeys").replace("{{n}}", String(keyCount))}
        </span>
        <span style={{ flex: 1 }}></span>
        <span className="kle-data-label" style={{ opacity: 0.6 }}>{t("rd.lastEdit")}</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        spellCheck={false}
        className="kle-textarea"
        title={t("tip.rawEditor")}
        style={{
          width: "100%", height: 200, fontSize: 11.5,
          fontFamily: "var(--theme-font-mono)",
          borderColor: error ? "var(--theme-danger)" : "var(--theme-border-input)",
          background: "var(--theme-bg-alt)", resize: "vertical",
          whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto", lineHeight: 1.5,
        }}
      />
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {hasChanges && (
          <button onClick={applyChanges} title={t("tip.rawApply")} className="kle-btn" style={{ color: "#fff", background: "var(--theme-warning)", borderColor: "var(--theme-warning)", cursor: "pointer", fontWeight: 600 }}>
            <RefreshCw {...ic} /> {t("rawdata.updateBtn")}
          </button>
        )}
        <button onClick={async () => { try { await navigator.clipboard.writeText(text); } catch {} }} title={t("tip.rawCopy")} className="kle-btn" style={{ cursor: "pointer" }}>
          <ClipboardCopy {...ic} /> {t("rd.copyClip")}
        </button>
        <button onClick={() => downloadJSON(layout)} title={t("tip.rawDownload")} className="kle-btn" style={{ cursor: "pointer" }}>
          <Download {...ic} /> {t("toolbar.downloadJson")}
        </button>
        <button onClick={async () => { const r = await uploadJSON(); if (r) onLoadLayout(r); }} title={t("tip.rawUpload")} className="kle-btn" style={{ cursor: "pointer" }}>
          <Upload {...ic} /> {t("rawdata.upload")}
        </button>
        {onOpenBackup && (
          <button onClick={onOpenBackup} title={t("tip.openBackup")} className="kle-btn" style={{ cursor: "pointer" }}>
            <FolderOpen {...ic} /> {t("backup.openBtn")}
          </button>
        )}
        <button
          onClick={() => {
            try {
              const pretty = JSON.stringify(JSON.parse(text.trim()), null, 2);
              setText(pretty);
              setHasChanges(true);
              setError(null);
            } catch (e) {
              setError(`${t("rd.parseErrPrefix")}${(e as Error).message}`);
            }
          }}
          title={t("tip.rawFormat")}
          className="kle-btn" style={{ cursor: "pointer" }}
        >
          <Wand2 {...ic} /> {t("rd.format")}
        </button>
      </div>
    </div>
  );
}

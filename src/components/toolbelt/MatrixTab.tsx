"use client";

import { useMemo } from "react";
import { Grid3x3, Download, RotateCcw, AlertTriangle } from "lucide-react";
import type { KeyProps, KLEMeta } from "../../lib";
import { useI18n } from "../../lib/i18n";
import { SectionHeader } from "./shared/SectionHeader";
import { computeKeyMatrices, findMatrixCollisions, matrixSize } from "../../lib/key-matrix";
import { keyToKeycode, isResolvedKeycode } from "../../lib/qmk-keycodes";
import { buildExportModel, generateKeymapC, generateKeyboardJson } from "../../lib/qmk-export-community";
import { saveFile } from "../../lib/platform-bridge";

interface MatrixTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  meta: KLEMeta;
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const ic = { size: 12, strokeWidth: 2 } as const;

export function MatrixTab({ keys, selectedIds, meta, onSetProp }: MatrixTabProps) {
  const { t } = useI18n();

  const matrices = useMemo(() => computeKeyMatrices(keys), [keys]);
  const size = useMemo(() => matrixSize(matrices), [matrices]);
  const collisions = useMemo(() => findMatrixCollisions(matrices), [matrices]);
  const model = useMemo(() => buildExportModel(keys), [keys]);

  const centerX = useMemo(() => {
    if (keys.length === 0) return 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const k of keys) {
      minX = Math.min(minX, k.x ?? 0);
      maxX = Math.max(maxX, (k.x ?? 0) + (k.w ?? 1));
    }
    return (minX + maxX) / 2;
  }, [keys]);

  const firstIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!, 10) : -1;
  const key = firstIdx >= 0 && firstIdx < keys.length ? keys[firstIdx]! : null;
  const info = firstIdx >= 0 ? matrices[firstIdx] : undefined;
  const code = key ? keyToKeycode(key, (key.x ?? 0) + (key.w ?? 1) / 2 <= centerX) : "";

  const psec: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 220,
  };
  const cell: React.CSSProperties = { padding: "4px 10px" };
  const inputStyle: React.CSSProperties = {
    width: 56, padding: "2px 6px", fontSize: 12, minHeight: 24,
    fontFamily: "var(--theme-font-mono)",
  };
  const badge = (active: boolean, danger = false): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "1px 7px", fontSize: 10, borderRadius: "var(--theme-radius-sm)",
    background: danger ? "var(--theme-warning)" : active ? "var(--theme-primary)" : "var(--theme-surface)",
    border: "1px solid " + (danger ? "var(--theme-warning)" : active ? "var(--theme-primary)" : "var(--theme-border-input)"),
    color: active || danger ? "var(--theme-text-inverse)" : "var(--theme-text)",
  });

  const setNum = (prop: "matrixRow" | "matrixCol", raw: string) => {
    if (!key) return;
    const ids = selectedIds.length > 0 ? selectedIds : [String(firstIdx)];
    if (raw === "") {
      onSetProp(ids, prop, undefined);
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0) onSetProp(ids, prop, n);
  };

  const resetAuto = () => {
    if (!key) return;
    const ids = selectedIds.length > 0 ? selectedIds : [String(firstIdx)];
    onSetProp(ids, "matrixRow", undefined);
    onSetProp(ids, "matrixCol", undefined);
  };

  const doExportKeymap = () => {
    void saveFile(generateKeymapC(model), {
      defaultName: "keymap.c",
      mimeType: "text/x-csrc",
    });
  };
  const doExportJson = () => {
    void saveFile(generateKeyboardJson(model, meta, keys), {
      defaultName: "keyboard.json",
      mimeType: "application/json",
    });
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* ── 选中按键的矩阵位置 ── */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("mx.matrixPos")}</SectionHeader>
        {!key ? (
          <div style={{ fontSize: 12, color: "var(--theme-text-muted)", padding: "6px 0" }}>
            {t("mx.hintNoSel")}
          </div>
        ) : (
          <>
            {selectedIds.length > 1 && (
              <div style={{ fontSize: 11, color: "var(--theme-text-muted)", marginBottom: 6 }}>
                {t("mx.selectedCount").replace("{{n}}", String(selectedIds.length))}
              </div>
            )}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 9, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("mx.row")}</label>
                <input
                  type="number"
                  min={0}
                  className="kle-input"
                  style={inputStyle}
                  value={info ? info.row : ""}
                  onChange={(e) => setNum("matrixRow", e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 9, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("mx.col")}</label>
                <input
                  type="number"
                  min={0}
                  className="kle-input"
                  style={inputStyle}
                  value={info ? info.col : ""}
                  onChange={(e) => setNum("matrixCol", e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <label style={{ fontSize: 9, color: "var(--theme-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t("mx.keycode")}</label>
                <span style={{
                  ...inputStyle, width: "auto", minWidth: 72, display: "inline-flex", alignItems: "center",
                  background: "var(--theme-input-bg)", border: "1px solid var(--theme-border-input)",
                  borderRadius: "var(--theme-radius-sm)", color: isResolvedKeycode(code) ? "var(--theme-text)" : "var(--theme-warning)",
                }}>
                  {code}
                </span>
              </div>
              <span style={badge(!!info?.overridden)}>
                {info?.overridden ? t("mx.custom") : t("mx.auto")}
              </span>
              <button
                type="button"
                onClick={resetAuto}
                title={t("mx.resetAuto")}
                className="kle-btn btn-hover-surface"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}
              >
                <RotateCcw {...ic} /> {t("mx.resetAuto")}
              </button>
            </div>
            {!isResolvedKeycode(code) && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--theme-warning)", display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle {...ic} /> {t("mx.unresolved")}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 矩阵总览 ── */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("mx.overview")}</SectionHeader>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <tbody>
            {[
              { label: t("mx.matrixSize"), value: `${size.rows} × ${size.cols}` },
              { label: t("mx.exportKeys"), value: model.entries.length },
              { label: t("mx.totalKeys"), value: keys.length },
            ].map((row) => (
              <tr key={row.label} style={{ borderBottom: "1px solid var(--theme-border-light)" }}>
                <td style={{ ...cell, color: "var(--theme-text-muted)" }}>{row.label}</td>
                <td style={{ ...cell, fontWeight: 600, textAlign: "right", fontFamily: "var(--theme-font-mono)" }}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
          <span style={badge(collisions.length === 0, collisions.length > 0)}>
            <Grid3x3 {...ic} /> {t("mx.collisions")}: {collisions.length}
          </span>
          <span style={badge(model.unresolved.length === 0, model.unresolved.length > 0)}>
            <AlertTriangle {...ic} /> {t("mx.unresolvedCount")}: {model.unresolved.length}
          </span>
        </div>
      </div>

      {/* ── 导出 ── */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("mx.export")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button
            type="button"
            onClick={doExportKeymap}
            className="kle-btn btn-hover-accent"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-start", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
          >
            <Download {...ic} /> {t("mx.exportKeymap")}
          </button>
          <button
            type="button"
            onClick={doExportJson}
            className="kle-btn btn-hover-accent"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-start", padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
          >
            <Download {...ic} /> {t("mx.exportKeyboardJson")}
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 10.5, color: "var(--theme-text-dim)", lineHeight: 1.5 }}>
          {t("mx.exportNote")}
        </div>
      </div>
    </div>
  );
}

MatrixTab.displayName = "MatrixTab";

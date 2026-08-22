"use client";

import { useState, useRef, useEffect } from "react";
import {
  MousePointer2, Hand, Plus, Trash2, Undo2, Redo2, Scissors, Copy,
  ClipboardPaste, Save, Download, ChevronDown, FileCode2, FileImage, FileJson, FileDown, LayoutTemplate,
  SlidersHorizontal, X, Settings,
} from "lucide-react";
import type { KLELayout } from "../lib";
import { parseLayoutJSON } from "../lib/kle-serial";
import { DEFAULT_META } from "../lib/kle-types";
import { ALL_PRESETS } from "../data/presets";
import { useI18n } from "../lib/i18n";
import { usePresence } from "./ui/usePresence";

export interface SpecialKeyDef {
  label: string;
  w?: number;
  h?: number;
  w2?: number;
  h2?: number;
  x2?: number;
  y2?: number;
  l?: boolean;
}

export interface StepConfigType {
  move: number; size: number; rotate: number;
}

interface FloatingToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  stepConfig: StepConfigType;
  onStepChange: (steps: StepConfigType) => void;
  onAddKeys: (count: number) => void;
  onAddSpecialKey?: (keyDef: SpecialKeyDef) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onLoadLayout?: (layout: KLELayout) => void;
  onDownloadJSON?: () => void;
  onDownloadSVG?: () => void;
  onDownloadPNG?: (scale: number) => void;
  onDownloadJPG?: () => void;
  onDownloadThumb?: () => void;
}

// id 用于 i18n 显示（toolbar.<id>）；label 保留原始数据语义传给 addSpecialKey
const SPECIAL_KEYS: (SpecialKeyDef & { id: string })[] = [
  { id: "spBigEnter", label: "", w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75, y2: 1 },
  { id: "isoEnter", label: "ISO Enter", w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 },
  { id: "spSteppedCaps", label: "", w: 1.75, l: true },
  { id: "spCenterStepped", label: "", w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75, y2: 1, l: true },
  { id: "spLeds", label: "", w: 1, h: 1 },
];

const ic = { size: 13, strokeWidth: 2 } as const;

export default function FloatingToolbar(props: FloatingToolbarProps) {
  const { t } = useI18n();
  const [addKeyOpen, setAddKeyOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const addKeyRef = useRef<HTMLDivElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

  const stepOptions = [
    { label: "0.25u", value: 0.25, tip: t("tip.step025") },
    { label: "0.5u", value: 0.5, tip: t("tip.step05") },
    { label: "1u", value: 1, tip: t("tip.step1") },
  ];
  const handleStepSelect = (val: number) => {
    props.onStepChange({ ...props.stepConfig, move: val, size: val });
  };

  const handleLoadPreset = (name: string) => {
    if (!props.onLoadLayout) return;
    const found = ALL_PRESETS.find((p) => p.name === name);
    if (!found) return;
    const keys = parseLayoutJSON(found.data);
    const meta = { ...DEFAULT_META, name: found.name, backcolor: "#eeeeee" };
    props.onLoadLayout({ meta, keys, _sourceCache: found.data as unknown[] });
  };

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (addKeyRef.current && !addKeyRef.current.contains(e.target as Node)) setAddKeyOpen(false);
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) setDownloadOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="kle-toolbar-floating"
      style={{
        display: "flex", alignItems: "center", gap: 4,
        width: "100%",
        background: "var(--theme-canvas-area)",
        borderBottom: "1px solid var(--theme-border-light)",
        padding: "6px 14px",
        boxShadow: "none",
        flexWrap: "wrap", justifyContent: "center",
      }}>
      {/* 预设配列选择框 */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <LayoutTemplate {...ic} style={{ opacity: 0.6 }} />
        <select
          data-testid="preset-select"
          className="kle-input"
          value=""
          onChange={(e) => { if (e.target.value) handleLoadPreset(e.target.value); }}
          title={t("tip.presetSelect")}
          style={{ padding: "2px 6px", fontSize: 11.5, minHeight: 26, cursor: "pointer", minWidth: 128 }}
        >
          <option value="">{t("navbar.preset")}…</option>
          {ALL_PRESETS.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </span>

      <span className="kle-sep" />

      {/* Select / Drag */}
      <span className="kle-btn kle-btn-primary" title={t("tip.selectMode")} style={{ cursor: "default", clipPath: "none" }}>
        <MousePointer2 {...ic} /> {t("toolbar.select")}
      </span>
      <span className="kle-btn" title={t("tip.dragMode")} style={{ cursor: "default" }}>
        <Hand {...ic} /> {t("toolbar.drag")}
      </span>

      <span className="kle-sep" />

      {/* Add Key split dropdown */}
      <div ref={addKeyRef} style={{ position: "relative", display: "inline-flex" }}>
        <span data-testid="floating-add-key" onClick={() => props.onAddKeys(1)} title={t("tip.addKey")} className="kle-btn kle-btn-primary"
          style={{ borderRadius: "var(--theme-radius-sm) 0 0 var(--theme-radius-sm)", borderRight: "none", cursor: "pointer", clipPath: "none" }}>
          <Plus {...ic} /> {t("toolbar.keyShort")}
        </span>
        <span data-testid="floating-add-key-toggle" onClick={() => setAddKeyOpen(!addKeyOpen)} title={t("tip.addKeyMenu")} className="kle-btn kle-btn-primary"
          style={{ borderRadius: "0 var(--theme-radius-sm) var(--theme-radius-sm) 0", padding: "4px 6px", cursor: "pointer", clipPath: "none" }}>
          <ChevronDown size={11} />
        </span>
        {addKeyOpen && (
          <div className="kle-dropdown" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 20, minWidth: 190 }}>
            <div className="kle-dropdown-header">{t("toolbar.addKey")}</div>
            {[1, 5, 10, 25].map(n => (
              <button key={n} className="kle-dropdown-item" onClick={() => { props.onAddKeys(n); setAddKeyOpen(false); }}>
                <Plus size={11} style={{ marginRight: 4 }} /> {t(`toolbar.addKey_${n}`)}
              </button>
            ))}
            <div className="kle-dropdown-divider" />
            <div className="kle-dropdown-header">{t("toolbar.specialKeysHeader")}</div>
            {SPECIAL_KEYS.map((sk) => (
              <button key={sk.id} className="kle-dropdown-item"
                onClick={() => { props.onAddSpecialKey?.(sk); setAddKeyOpen(false); }}>
                {sk.id === "isoEnter" ? sk.label : t(`toolbar.${sk.id}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 步进选择 + 步长设置（位于 +键 下拉之后） */}
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <select
          data-testid="step-select"
          className="kle-input"
          value={props.stepConfig.move}
          onChange={(e) => handleStepSelect(parseFloat(e.target.value))}
          title={t("tip.options")}
          style={{ padding: "2px 6px", fontSize: 11.5, minHeight: 26, cursor: "pointer" }}
        >
          {stepOptions.map((o) => (
            <option key={o.value} value={o.value} title={o.tip}>{o.label}</option>
          ))}
        </select>
        <span data-testid="step-options" className="kle-btn-icon kle-btn" onClick={() => setOptionsOpen(true)}
          title={t("tip.options")} style={{ cursor: "pointer" }}>
          <SlidersHorizontal size={13} strokeWidth={2} />
        </span>
      </span>

      <span className="kle-sep" />

      {/* Delete */}
      <span data-testid="floating-delete" onClick={props.onDelete} title={t("tip.delKey")} className="kle-btn"
        style={{ cursor: props.hasSelection ? "pointer" : "default", opacity: props.hasSelection ? 1 : 0.3 }}>
        <Trash2 {...ic} />
      </span>

      <span className="kle-sep" />

      {/* Undo / Redo */}
      <span data-testid="floating-undo" onClick={props.onUndo} title={t("tip.undo")} className="kle-btn"
        style={{ cursor: props.canUndo ? "pointer" : "default", opacity: props.canUndo ? 1 : 0.3 }}>
        <Undo2 {...ic} /> <span className="kle-kbd">⌘Z</span> {t("toolbar.undo")}
      </span>
      <span data-testid="floating-redo" onClick={props.onRedo} title={t("tip.redo")} className="kle-btn"
        style={{ cursor: props.canRedo ? "pointer" : "default", opacity: props.canRedo ? 1 : 0.3 }}>
        <Redo2 {...ic} /> <span className="kle-kbd">⌘⇧Z</span> {t("toolbar.redo")}
      </span>

      <span className="kle-sep" />

      {/* Cut / Copy / Paste */}
      <span data-testid="floating-cut" onClick={props.onCut} className="kle-btn kle-btn-icon"
        style={{ cursor: props.hasSelection ? "pointer" : "default", opacity: props.hasSelection ? 1 : 0.3, width: 28, height: 26 }} title={t("tip.cut")}>
        <Scissors {...ic} />
      </span>
      <span data-testid="floating-copy" onClick={props.onCopy} className="kle-btn kle-btn-icon"
        style={{ cursor: props.hasSelection ? "pointer" : "default", opacity: props.hasSelection ? 1 : 0.3, width: 28, height: 26 }} title={t("tip.copy")}>
        <Copy {...ic} />
      </span>
      <span data-testid="floating-paste" onClick={props.onPaste} className="kle-btn kle-btn-icon"
        style={{ cursor: props.hasClipboard ? "pointer" : "default", opacity: props.hasClipboard ? 1 : 0.3, width: 28, height: 26 }} title={t("tip.paste")}>
        <ClipboardPaste {...ic} />
      </span>

      <span className="kle-sep" />

      {/* Save */}
      <span data-testid="floating-save" onClick={props.onDownloadJSON} title={t("tip.tbSave")} className="kle-btn kle-btn-success" style={{ cursor: "pointer", fontWeight: 600 }}>
        <Save {...ic} /> {t("toolbar.save")}
      </span>

      {/* Download split dropdown */}
      <div ref={downloadRef} style={{ position: "relative", display: "inline-flex" }}>
        <span data-testid="floating-download" onClick={() => setDownloadOpen(!downloadOpen)} title={t("tip.downloadMenu")} className="kle-btn kle-btn-success"
          style={{ borderRadius: "var(--theme-radius-sm) 0 0 var(--theme-radius-sm)", borderRight: "none", cursor: "pointer", fontWeight: 600 }}>
          <Download {...ic} /> {t("toolbar.download")}
        </span>
        <span data-testid="floating-download-toggle" onClick={() => setDownloadOpen(!downloadOpen)} title={t("tip.downloadMenu")} className="kle-btn kle-btn-success"
          style={{ borderRadius: "0 var(--theme-radius-sm) var(--theme-radius-sm) 0", padding: "4px 6px", cursor: "pointer" }}>
          <ChevronDown size={11} />
        </span>
        {downloadOpen && (
          <div className="kle-dropdown" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, minWidth: 190 }}>
            {[
              { label: "SVG", icon: <FileCode2 size={11} />, onClick: () => { props.onDownloadSVG?.(); setDownloadOpen(false); } },
              { label: "PNG (1×)", icon: <FileImage size={11} />, onClick: () => { props.onDownloadPNG?.(1); setDownloadOpen(false); } },
              { label: "PNG (2×)", icon: <FileImage size={11} />, onClick: () => { props.onDownloadPNG?.(2); setDownloadOpen(false); } },
              { label: "PNG (4×)", icon: <FileImage size={11} />, onClick: () => { props.onDownloadPNG?.(4); setDownloadOpen(false); } },
              { label: "JPG", icon: <FileImage size={11} />, onClick: () => { props.onDownloadJPG?.(); setDownloadOpen(false); } },
              { label: t("toolbar.thumbnail"), icon: <FileDown size={11} />, onClick: () => { props.onDownloadThumb?.(); setDownloadOpen(false); } },
            ].map(item => (
              <button key={item.label} className="kle-dropdown-item" onClick={item.onClick}>
                {item.icon} <span style={{ marginLeft: 6 }}>{item.label}</span>
              </button>
            ))}
            <div className="kle-dropdown-divider" />
            <button className="kle-dropdown-item" onClick={() => { props.onDownloadJSON?.(); setDownloadOpen(false); }}>
              <FileJson size={11} /> <span style={{ marginLeft: 6 }}>JSON</span>
            </button>
          </div>
        )}
      </div>

      {/* 步长设置对话框 */}
      <StepOptionsDialog open={optionsOpen} steps={props.stepConfig}
        onClose={() => setOptionsOpen(false)}
        onConfirm={(s) => { props.onStepChange(s); setOptionsOpen(false); }}
        onCancel={() => setOptionsOpen(false)}
      />
    </div>
  );
}

FloatingToolbar.displayName = "FloatingToolbar";

// ─── 步长设置对话框（自 TopBar 迁入，usePresence 离场动画） ──────────

interface StepOptionsDialogProps {
  open: boolean;
  steps: StepConfigType;
  onClose: () => void;
  onConfirm: (steps: StepConfigType) => void;
  onCancel: () => void;
}

function StepOptionsDialog({ open, steps, onClose, onConfirm, onCancel }: StepOptionsDialogProps) {
  const { mounted, visible } = usePresence(open, 160);
  const { t } = useI18n();
  const [local, setLocal] = useState(steps);

  useEffect(() => { if (open) setLocal(steps); }, [open, steps]);

  if (!mounted) return null;

  const field = (label: string, hint: string, key: keyof StepConfigType, min: number, max: number, step: number, tip?: string) => (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", marginBottom: 4, fontSize: 13, color: "var(--theme-text)" }}>
        {label} <span style={{ fontSize: 10, opacity: 0.5 }}>({hint})</span>
      </label>
      <input
        type="number" min={min} max={max} step={step}
        value={local[key]}
        onChange={e => setLocal(s => ({ ...s, [key]: parseFloat(e.target.value) || 0.25 }))}
        className="kle-input" style={{ width: 110 }}
        title={tip}
      />
    </div>
  );

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--theme-overlay)",
    }} onClick={onClose}>
      <div className={`kle-dialog${visible ? "" : " kle-dialog-exit"}`} style={{ minWidth: 380, maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--theme-border-light)" }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: "var(--theme-font-weight-heading)", display: "inline-flex", alignItems: "center", gap: 8, color: "var(--theme-text)" }}>
            <SlidersHorizontal size={15} /> {t("options.editSteps")}
          </h4>
          <button onClick={onClose}
            className="kle-btn-icon kle-btn"
            style={{ border: "none", background: "transparent", color: "var(--theme-text-muted)", cursor: "pointer", width: 26, height: 26 }}
            aria-label={t("help.close")}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 16, color: "var(--theme-text)" }}>
          {field(t("options.stepMove"), t("options.unitU"), "move", 0.05, 2.5, 0.05, t("tip.optMove"))}
          {field(t("options.stepSize"), t("options.unitU"), "size", 0.05, 2.5, 0.05, t("tip.optSize"))}
          {field(t("options.stepRotate"), t("options.unitDeg"), "rotate", 1, 90, 1, t("tip.optRotate"))}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--theme-text-muted)", marginTop: 2 }}>
            <Settings size={12} /> {t("options.stepHint")}
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--theme-border-light)", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <span className="kle-btn" onClick={onCancel}>{t("options.cancel")}</span>
          <span className="kle-btn kle-btn-primary" onClick={() => onConfirm(local)}>{t("options.ok")}</span>
        </div>
      </div>
    </div>
  );
}

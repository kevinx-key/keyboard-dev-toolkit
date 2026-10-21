"use client";

import { useEffect, useState } from "react";
import type { KeyProps, ScreenExit } from "../../lib";
import { SectionHeader } from "./shared/SectionHeader";
import { useI18n } from "../../lib/i18n";
import {
  KNOB_DEFAULT_DIA_MM,
  SCREEN_DEFAULT_H_MM,
  SCREEN_DEFAULT_RADIUS_MM,
  SCREEN_DEFAULT_W_MM,
  SCREEN_EXITS,
  SCREEN_MAX_MM,
  SCREEN_MIN_MM,
  getDeviceKind,
  getScreenGeometry,
  knobDiameterMm,
} from "../../lib/device-geometry";

interface PropertiesTabProps {
  keys: KeyProps[];
  selectedIds: string[];
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
}

const SIZE_STEP = 0.25;
const SIZE_MIN = 0.25;
const ROTATION_PRESETS = [0, 90, 180, -90];
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 24, 28, 34, 36];
const COMPAT_STATES: { value: 0 | 1 | undefined; labelKey: string }[] = [
  { value: undefined, labelKey: "compat.normal" },
  { value: 0, labelKey: "compat.compatRegular" },
  { value: 1, labelKey: "compat.compatKey" },
];

/** 屏幕出线方向 → i18n key */
const EXIT_LABEL: Record<ScreenExit, string> = {
  top: "screen.exitTop",
  right: "screen.exitRight",
  bottom: "screen.exitBottom",
  left: "screen.exitLeft",
};

function SizeStepper({
  value, disabled, label, title, min = SIZE_MIN, onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  title: string;
  min?: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const clamp = (n: number) => Math.max(min, Math.round(n * 100) / 100);
  const step = (dir: number) => onCommit(clamp(value + dir * SIZE_STEP));

  const btn: React.CSSProperties = {
    width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: "20px",
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-surface)", color: "var(--theme-text)",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  };
  const input: React.CSSProperties = {
    width: 52, textAlign: "center", padding: "2px 4px", fontSize: 12,
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-input-bg)", color: "var(--theme-text)",
    fontFamily: "var(--theme-font-mono)",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={title}>
      <button type="button" aria-label={`${label} -`} disabled={disabled} onClick={() => step(-1)} style={btn}>−</button>
      <input
        type="number" step={SIZE_STEP} min={min} value={draft} disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) onCommit(clamp(n));
          else setDraft(String(value));
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={input}
      />
      <button type="button" aria-label={`${label} +`} disabled={disabled} onClick={() => step(1)} style={btn}>+</button>
    </div>
  );
}

/** 坐标 / 角度输入（失焦或回车提交，非法输入还原） */
function CoordInput({
  value, disabled, label, step, testId, onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  step: number;
  testId?: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      const next = Math.round(n * 100) / 100;
      if (next !== value) onCommit(next);
      else setDraft(String(value));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <input
      type="number"
      step={step}
      value={draft}
      disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setDraft(String(value)); (e.target as HTMLInputElement).blur(); }
      }}
      style={{
        border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
        padding: "2px 6px", fontSize: 12, minWidth: 56, width: 64, boxSizing: "border-box",
        background: "var(--theme-input-bg)", textAlign: "center", color: "var(--theme-text)",
        fontFamily: "var(--theme-font-mono)",
      }}
    />
  );
}

/** 器件尺寸步进器（mm，保留 1 位小数） */
function MmStepper({
  value, disabled, label, title, min, max, step, onCommit,
}: {
  value: number;
  disabled: boolean;
  label: string;
  title: string;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n * 10) / 10));
  const btn: React.CSSProperties = {
    width: 22, height: 22, padding: 0, fontSize: 13, lineHeight: "20px",
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-surface)", color: "var(--theme-text)",
    cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.45 : 1,
  };
  const input: React.CSSProperties = {
    width: 58, textAlign: "center", padding: "2px 4px", fontSize: 12,
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    background: "var(--theme-input-bg)", color: "var(--theme-text)",
    fontFamily: "var(--theme-font-mono)",
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }} title={title}>
      <button type="button" aria-label={`${label} -`} disabled={disabled} onClick={() => onCommit(clamp(value - step))} style={btn}>−</button>
      <input
        type="number" step={step} min={min} max={max} value={draft} disabled={disabled}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) onCommit(clamp(n));
          else setDraft(String(value));
        }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={input}
      />
      <button type="button" aria-label={`${label} +`} disabled={disabled} onClick={() => onCommit(clamp(value + step))} style={btn}>+</button>
    </div>
  );
}

export function PropertiesTab({ keys, selectedIds, onSetProp }: PropertiesTabProps) {
  const { t } = useI18n();
  const selIdx = selectedIds.length > 0 ? parseInt(selectedIds[0]!) : -1;
  const key = selIdx >= 0 && selIdx < keys.length ? keys[selIdx] : null;
  const ids = [...selectedIds];
  const hasSelection = selectedIds.length > 0 && key !== null;

  const set = (prop: keyof KeyProps, value: unknown) => {
    if (hasSelection) onSetProp(ids, prop, value);
  };

  const curW = key?.w || 1;
  const curH = key?.h || 1;
  const curW2 = key?.w2 ?? 0;
  const curH2 = key?.h2 ?? 0;
  const curX = key?.x || 0;
  const curY = key?.y || 0;
  const curR = key?.r || 0;
  const curRx = key?.rx;
  const curRy = key?.ry;
  const curFontSize = key?.labelSize || 9;
  const curCompat = key?.compat;
  const curCompatOption = key?.compatOption ?? 0;
  /** 绝对坐标 / 旋转中心只对单键有意义；多选时仍可整体设置旋转角度 */
  const singleSel = selectedIds.length === 1;

  // ── 器件（旋钮 / 屏幕）：选中后键属性自动切换为器件属性 ──
  const deviceKind = key ? getDeviceKind(key) : null;
  const isKnob = deviceKind === "knob";
  const isScreen = deviceKind === "screen";
  /** 只把器件属性写回同类型器件，避免把普通按键变成器件 */
  const deviceIds = deviceKind
    ? ids.filter((id) => {
        const k = keys[parseInt(id, 10)];
        return !!k && getDeviceKind(k) === deviceKind;
      })
    : [];
  const curKnobDia = key ? knobDiameterMm(key) : KNOB_DEFAULT_DIA_MM;
  const screenGeo = key && isScreen ? getScreenGeometry(key) : null;
  const curScreenExit: ScreenExit = key?.screenExit ?? "bottom";
  const hintStyle: React.CSSProperties = {
    fontSize: 10, color: "var(--theme-text-dim)", marginTop: 8, lineHeight: 1.45,
  };

  const psec: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--theme-border-light)",
    borderRadius: "var(--theme-radius-md)",
    padding: "10px 12px",
    background: "var(--theme-surface-2)",
    minWidth: 140,
  };
  const plabel: React.CSSProperties = {
    fontSize: 9, opacity: 0.55, textTransform: "uppercase",
    letterSpacing: "0.06em", color: "var(--theme-text-muted)",
  };
  const pval: React.CSSProperties = {
    border: "1px solid var(--theme-border-input)", borderRadius: "var(--theme-radius-sm)",
    padding: "2px 6px", fontSize: 12, minWidth: 36,
    background: "var(--theme-input-bg)", textAlign: "center", color: "var(--theme-text)",
    fontFamily: "var(--theme-font-mono)",
  };
  const prow: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
  };

  return (
    <div className="belt-inner" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* Size / 器件尺寸 */}
      <div className="psec" style={psec}>
        <SectionHeader>{isKnob ? t("pt.knob") : isScreen ? t("pt.screen") : t("pt.size")}</SectionHeader>
        {isKnob ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={prow}>
              <label style={plabel}>{t("knob.diameter")}</label>
              <MmStepper
                value={curKnobDia} disabled={!hasSelection || deviceIds.length === 0}
                label={t("knob.diameter")} title={t("knob.diameter")}
                min={1} max={200} step={1}
                onCommit={(v) => onSetProp(deviceIds, "knobDia", v)}
              />
            </div>
            <div style={hintStyle}>{t("knob.cutoutHint")}</div>
          </div>
        ) : isScreen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={prow}>
              <label style={plabel}>{t("screen.width")}</label>
              <MmStepper
                value={screenGeo?.w ?? SCREEN_DEFAULT_W_MM} disabled={!hasSelection || deviceIds.length === 0}
                label={t("screen.width")} title={t("screen.width")}
                min={SCREEN_MIN_MM} max={SCREEN_MAX_MM} step={1}
                onCommit={(v) => onSetProp(deviceIds, "screenW", v)}
              />
            </div>
            <div style={prow}>
              <label style={plabel}>{t("screen.height")}</label>
              <MmStepper
                value={screenGeo?.h ?? SCREEN_DEFAULT_H_MM} disabled={!hasSelection || deviceIds.length === 0}
                label={t("screen.height")} title={t("screen.height")}
                min={SCREEN_MIN_MM} max={SCREEN_MAX_MM} step={1}
                onCommit={(v) => onSetProp(deviceIds, "screenH", v)}
              />
            </div>
            <div style={prow}>
              <label style={plabel}>{t("screen.radius")}</label>
              <MmStepper
                value={screenGeo?.r ?? SCREEN_DEFAULT_RADIUS_MM} disabled={!hasSelection || deviceIds.length === 0}
                label={t("screen.radius")} title={t("screen.radius")}
                min={0} max={Math.min(screenGeo?.w ?? SCREEN_DEFAULT_W_MM, screenGeo?.h ?? SCREEN_DEFAULT_H_MM) / 2} step={0.5}
                onCommit={(v) => onSetProp(deviceIds, "screenR", v)}
              />
            </div>
            <div style={{ height: 1, background: "var(--theme-border-light)", margin: "1px 0" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={plabel}>{t("screen.exit")}</label>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {SCREEN_EXITS.map((exit) => (
                  <span
                    key={exit}
                    onClick={() => { if (deviceIds.length > 0) onSetProp(deviceIds, "screenExit", exit); }}
                    title={t(EXIT_LABEL[exit])}
                    className={`kle-chip${curScreenExit === exit ? " active" : ""}`}
                    style={{
                      padding: "2px 8px", fontSize: 11, borderRadius: "var(--theme-radius-sm)",
                      cursor: deviceIds.length > 0 ? "pointer" : "default",
                    }}
                  >
                    {t(EXIT_LABEL[exit])}
                  </span>
                ))}
              </div>
            </div>
            <div style={hintStyle}>{t("screen.slotHint")}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={prow}>
              <label style={plabel}>{t("pt.width")}</label>
              <SizeStepper
                value={curW} disabled={!hasSelection} label={t("pt.width")} title={t("tip.propW")}
                onCommit={(v) => set("w", v)}
              />
            </div>
            <div style={prow}>
              <label style={plabel}>{t("pt.height")}</label>
              <SizeStepper
                value={curH} disabled={!hasSelection} label={t("pt.height")} title={t("tip.propH")}
                onCommit={(v) => set("h", v)}
              />
            </div>
            <div style={{ height: 1, background: "var(--theme-border-light)", margin: "1px 0" }} />
            <div style={prow}>
              <label style={plabel}>{t("pt.width2")}</label>
              <SizeStepper
                value={curW2} min={0} disabled={!hasSelection} label={t("pt.width2")} title={t("tt.width2")}
                onCommit={(v) => set("w2", v)}
              />
            </div>
            <div style={prow}>
              <label style={plabel}>{t("pt.height2")}</label>
              <SizeStepper
                value={curH2} min={0} disabled={!hasSelection} label={t("pt.height2")} title={t("tt.height2")}
                onCommit={(v) => set("h2", v)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Position & Rotation */}
      <div className="psec" style={psec}>
        <SectionHeader>{t("pt.posRot")}</SectionHeader>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>X</label>
            <CoordInput
              value={curX} disabled={!hasSelection || !singleSel} label="X" step={0.25}
              testId="prop-x" onCommit={(v) => set("x", v)}
            />
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>Y</label>
            <CoordInput
              value={curY} disabled={!hasSelection || !singleSel} label="Y" step={0.25}
              testId="prop-y" onCommit={(v) => set("y", v)}
            />
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotation")}</label>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <CoordInput
                value={curR} disabled={!hasSelection} label={t("pt.rotation")} step={1}
                testId="prop-r" onCommit={(v) => set("r", v)}
              />
              <span style={{ fontSize: 11, color: "var(--theme-text-muted)" }}>°</span>
            </div>
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotX")}</label>
            <CoordInput
              value={curRx ?? 0} disabled={!hasSelection || !singleSel} label={t("pt.rotX")} step={0.25}
              testId="prop-rx" onCommit={(v) => set("rx", v)}
            />
          </div>
          <div className="pfld" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <label style={plabel}>{t("pt.rotY")}</label>
            <CoordInput
              value={curRy ?? 0} disabled={!hasSelection || !singleSel} label={t("pt.rotY")} step={0.25}
              testId="prop-ry" onCommit={(v) => set("ry", v)}
            />
          </div>
        </div>
        {!singleSel && hasSelection && (
          <div style={{ ...hintStyle, marginTop: 6 }}>{t("pt.multiCoordHint")}</div>
        )}
        <div style={{ marginTop: 8, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {ROTATION_PRESETS.map((r) => (
            <span key={r} onClick={() => set("r", r)} title={t("tip.propRot")} className={`kle-chip${curR === r ? " active" : ""}`}
              style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{r}°</span>
          ))}
          <span className="kle-chip" style={{ padding: "1px 7px", fontSize: 11, borderRadius: "var(--theme-radius-sm)", cursor: "default" }}>{t("pt.custom")}</span>
        </div>
      </div>

      {/* 器件（旋钮 / 屏幕）不显示对齐 / 字号 / 兼容区 */}
      {!deviceKind && (
        <>
      {/* Alignment */}
      <div className="psec" style={{ ...psec, flex: "0 0 170px" }}>
        <SectionHeader>{t("pt.align")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[t("pt.align0"), t("pt.align1"), t("pt.align2"), t("pt.align3"), t("pt.align4")].map((item, i) => (
            <span key={item} className={`kle-chip${i === 0 ? " active" : ""}`}
              style={{ padding: "3px 8px", fontSize: 11, cursor: "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>{item}</span>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="psec" style={{ ...psec, flex: "0 0 130px" }}>
        <SectionHeader>{t("pt.fontSize")}</SectionHeader>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {FONT_SIZES.map((s) => (
            <span key={s} onClick={() => set("labelSize", s)} title={t("tip.propFontSize")} className={`kle-chip${curFontSize === s ? " active" : ""}`}
              style={{ padding: "1px 7px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)" }}>{s}</span>
          ))}
        </div>
      </div>

      {/* 兼容区（替代原「特殊键」区块） */}
      <div className="psec" style={{ ...psec, flex: "0 0 200px" }}>
        <SectionHeader>{t("compat.header")}</SectionHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {COMPAT_STATES.map(({ value, labelKey }) => (
            <span key={labelKey} onClick={() => set("compat", value)} title={t("tip.compatState")}
              className={`kle-chip${curCompat === value ? " active" : ""}`}
              style={{ padding: "3px 10px", fontSize: 11, cursor: hasSelection ? "pointer" : "default", borderRadius: "var(--theme-radius-sm)", justifyContent: "flex-start" }}>{t(labelKey)}</span>
          ))}
          {curCompat !== undefined && (
            <div style={{ ...prow, marginTop: 6 }}>
              <label style={plabel}>{t("compat.group")}</label>
              <input
                type="number" min={0} step={1} value={curCompatOption} disabled={!hasSelection}
                title={t("tip.compatGroup")}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  set("compatOption", Number.isFinite(n) && n >= 0 ? n : 0);
                }}
                style={{ ...pval, width: 52, minWidth: 52 }}
              />
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

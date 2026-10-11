"use client";

import { useState, useCallback } from "react";
import { Loader2, Boxes, Package } from "lucide-react";
import { generatePlate } from "../lib/plate-export";
import type { PlateConfig, PlateRotationOverrides } from "../lib/plate-export";
import { generateSwitchFoam } from "../lib/switch-foam-export";
import type { SwitchFoamConfig } from "../lib/switch-foam-export";
import { generatePCB } from "../lib/pcb-export";
import type { PCBConfig, PCBSwitchRotations, PCBStabRotations } from "../lib/pcb-export";
import { generateSwitchPad } from "../lib/switch-pad-export";
import type { SwitchPadConfig } from "../lib/switch-pad-export";
import { generateBottomFoam } from "../lib/bottom-foam-export";
import type { BottomFoamConfig } from "../lib/bottom-foam-export";
import type { KLELayout } from "../lib/kle-types";
import type {
  PlateSettings,
  FoamSettings,
  PadSettings,
  BottomFoamSettings,
} from "../lib/editor-settings";
import { useI18n } from "../lib/i18n";
import { useCompatMarkedIndices } from "../lib/compat-layer";
import { keyCenterInMm } from "../lib/coordinate-system";
import { exportAssemblySTP } from "../lib/assembly-export";
import type { AssemblyPart } from "../lib/assembly-export";
import type { StpExtrudeData, StpProgressEvent } from "../lib/stp-export";
import { localizeStpMessage } from "../lib/stp-export";

// ── 各部件厚度 (mm) 与层间关系（与各编辑器导出保持同源） ──
const PLATE_THICKNESS = 1.5; // 定位板
const PCB_THICKNESS = 1.6; // PCB 板
const PAD_THICKNESS = 0.1; // 轴下垫
const PLATE_PCB_GAP = 3.5; // 定位板与 PCB 之间的间隙

// ── 与各编辑器 Section 保持同源的入参构造（纯函数，无 hook 依赖） ──

function buildPlateConfig(c: PlateSettings): PlateConfig {
  return {
    switchType: c.switchType,
    stabType: c.stabType,
    u1: c.u1Enabled ? c.u1 : 19.05,
    kerf: c.kerfEnabled ? c.kerf : 0,
    topPad: c.padEnabled ? c.topPad : 0,
    leftPad: c.padEnabled ? c.leftPad : 0,
    rightPad: c.padEnabled ? c.rightPad : 0,
    bottomPad: c.padEnabled ? c.bottomPad : 0,
    xGrow: c.xGrow,
    yGrow: c.yGrow,
    fillet: c.fillet,
  };
}

function buildFoamConfig(c: FoamSettings): SwitchFoamConfig {
  return {
    switchType: 1,
    stabType: 1,
    u1: 19.05,
    kerf: 0,
    topPad: 0,
    leftPad: 0,
    rightPad: 0,
    bottomPad: 0,
    xGrow: 0,
    yGrow: 0,
    fillet: c.fillet,
    holeFillet: c.holeFillet,
    minFeature: c.minFeature,
    thickness: c.thickness,
  };
}

function buildPadConfig(pcb: PCBConfig, pad: PadSettings): SwitchPadConfig {
  return {
    solderType: pcb.solderType,
    needStab: pcb.needStab,
    needLed: pcb.needLed,
    edgeDistance: pcb.edgeDistance,
    fillet: pad.outerFillet,
  };
}

function buildBottomConfig(pcb: PCBConfig, bf: BottomFoamSettings): BottomFoamConfig {
  return {
    solderType: pcb.solderType,
    needLed: pcb.needLed,
    needTypeC: pcb.needTypeC, typeCX: pcb.typeCX, typeCY: pcb.typeCY, typeCRot: pcb.typeCRot,
    need4P: pcb.need4P, fourPX: pcb.fourPX, fourPY: pcb.fourPY, fourPRot: pcb.fourPRot,
    needMCU: pcb.needMCU, mcuX: pcb.mcuX, mcuY: pcb.mcuY, mcuRot: pcb.mcuRot,
    edgeDistance: pcb.edgeDistance,
    holeFillet: bf.holeFillet,
    outerFillet: bf.outerFillet,
    minFeature: bf.minFeature,
    thinWall: bf.thinWall,
    customRects: bf.customRects,
  };
}

interface AssemblySectionProps {
  layout: KLELayout;
  plateConfig: PlateSettings;
  rotationOverrides: PlateRotationOverrides;
  pcbConfig: PCBConfig;
  switchRotations: PCBSwitchRotations;
  stabRotations: PCBStabRotations;
  foamConfig: FoamSettings;
  padConfig: PadSettings;
  bottomFoamConfig: BottomFoamSettings;
  onStpExportingChange?: (exporting: boolean) => void;
  onStpProgress?: (data: StpProgressEvent) => void;
}

type SelectablePart = "plate" | "pcb" | "foam" | "pad" | "bottom";

export default function AssemblySection({
  layout,
  plateConfig,
  rotationOverrides,
  pcbConfig,
  switchRotations,
  stabRotations,
  foamConfig,
  padConfig,
  bottomFoamConfig,
  onStpExportingChange,
  onStpProgress,
}: AssemblySectionProps) {
  const { t } = useI18n();
  const { markedIndices: compatDimIndices } = useCompatMarkedIndices(layout.keys);

  const [sel, setSel] = useState<Record<SelectablePart, boolean>>({
    plate: true,
    pcb: true,
    foam: true,
    pad: true,
    bottom: true,
  });
  const toggle = useCallback((key: SelectablePart) => {
    setSel((s) => ({ ...s, [key]: !s[key] }));
  }, []);

  const [converting, setConverting] = useState(false);
  const [stpMsg, setStpMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExport = useCallback(async () => {
    if (layout.keys.length === 0) {
      setStpMsg({ ok: false, text: t("assembly.noKeys") });
      return;
    }

    // ── esc 轴心作为装配原点：所有部件施加同一 XY 平移 ──
    const esc = keyCenterInMm(layout.keys[0]!);
    const dx = -esc.x;
    const dy = esc.y;

    // ── 各板 Z 向落位（定位板顶面 = 0） ──
    const pcbTop = -(PLATE_THICKNESS + PLATE_PCB_GAP); // = -5.0

    const compat = Array.from(compatDimIndices);
    const parts: AssemblyPart[] = [];
    const push = (
      kind: AssemblyPart["kind"],
      params: Record<string, unknown>,
      data: StpExtrudeData | null,
      thickness: number,
      dz: number,
    ) => {
      parts.push({ kind, params, data, thickness, dx, dy, dz });
    };

    // 定位板：顶面 = 0 → 局部挤出 0..1.5，平移 -1.5
    if (sel.plate) {
      const cfg = buildPlateConfig(plateConfig);
      const r = generatePlate(layout, cfg, rotationOverrides, {
        compatKeyIndices: compatDimIndices,
        holeFillet: plateConfig.holeFillet,
      });
      push(
        "plate",
        { config: cfg, rotationOverrides, holeFillet: plateConfig.holeFillet, compatKeyIndices: compat },
        r.stpData,
        PLATE_THICKNESS,
        0 - PLATE_THICKNESS,
      );
    }

    // PCB 板：顶面 = -5 → 平移 -6.6（连同元件模型）
    if (sel.pcb) {
      const r = generatePCB(layout, pcbConfig, switchRotations, stabRotations, compatDimIndices);
      push(
        "pcb",
        { config: pcbConfig, switchRotations, stabRotations, compatKeyIndices: compat },
        r.stpData,
        PCB_THICKNESS,
        pcbTop - PCB_THICKNESS,
      );
    }

    // 轴下垫：顶面 = pcbTop + 0.1 → 平移 pcbTop
    if (sel.pad) {
      const cfg = buildPadConfig(pcbConfig, padConfig);
      const r = generateSwitchPad(layout, cfg, switchRotations, stabRotations, compatDimIndices);
      push(
        "pad",
        { config: cfg, switchRotations, stabRotations, compatKeyIndices: compat },
        r.stpData,
        PAD_THICKNESS,
        pcbTop,
      );
    }

    // 轴间棉：顶面 = pcbTop + 垫厚 + 棉厚 → 平移 pcbTop + 垫厚
    if (sel.foam) {
      const cfg = buildFoamConfig(foamConfig);
      const r = generateSwitchFoam(layout, cfg, rotationOverrides, compatDimIndices);
      push(
        "switchfoam",
        { config: cfg, rotationOverrides, compatKeyIndices: compat },
        r.stpData,
        foamConfig.thickness,
        pcbTop + PAD_THICKNESS,
      );
    }

    // 底棉：顶面 = PCB 底面 → 平移 (pcbTop - pcb厚) - 底棉厚
    if (sel.bottom) {
      const cfg = buildBottomConfig(pcbConfig, bottomFoamConfig);
      const r = generateBottomFoam(layout, cfg, switchRotations, compatDimIndices);
      push(
        "foam",
        { config: cfg, switchRotations, compatKeyIndices: compat },
        r.stpData,
        bottomFoamConfig.thickness,
        pcbTop - PCB_THICKNESS - bottomFoamConfig.thickness,
      );
    }

    if (parts.length === 0) {
      setStpMsg({ ok: false, text: t("assembly.needSelect") });
      return;
    }

    setConverting(true);
    setStpMsg(null);
    onStpExportingChange?.(true);

    const name = layout.meta.name || "keyboard";
    const result = await exportAssemblySTP(layout, parts, `${name}_assembly.stp`, onStpProgress);

    onStpExportingChange?.(false);
    setConverting(false);

    if (!result.success && result.message === "cancelled") return;
    const text =
      result.message === "assembly.needSelect"
        ? t("assembly.needSelect")
        : localizeStpMessage(t, result.message);
    setStpMsg({ ok: result.success, text });
  }, [
    layout, plateConfig, rotationOverrides, pcbConfig, switchRotations, stabRotations,
    foamConfig, padConfig, bottomFoamConfig, sel, compatDimIndices, onStpExportingChange,
    onStpProgress, t,
  ]);

  return (
    <div className="kle-panel" style={{
      border: "1px solid var(--theme-border)", borderRadius: "var(--theme-radius-md)",
      margin: "8px 12px", backgroundColor: "var(--theme-surface)",
      position: "relative", paddingTop: 6,
    }}>
      {/* Region label */}
      <div style={{
        position: "absolute", top: -8, left: 10,
        backgroundColor: "var(--theme-surface)", padding: "0 6px",
        fontSize: 11, fontWeight: 600, color: "var(--theme-text-muted)",
        letterSpacing: 0.5,
      }}>
        {t("assembly.title")}
      </div>

      {/* 部件选择（顺序：键帽 / 定位板 / 轴体 / 卫星轴 / PCB板 / 轴间棉 / 轴下垫 / 底棉） */}
      <div style={{ padding: "10px 12px 4px 12px", display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
        <PartCheck label={t("assembly.caps")} checked={false} disabled hint={t("assembly.comingSoon")} />
        <PartCheck label={t("assembly.plate")} checked={sel.plate} onChange={() => toggle("plate")} />
        <PartCheck label={t("assembly.switches")} checked={false} disabled hint={t("assembly.comingSoon")} />
        <PartCheck label={t("assembly.stabs")} checked={false} disabled hint={t("assembly.comingSoon")} />
        <PartCheck label={t("assembly.pcb")} checked={sel.pcb} onChange={() => toggle("pcb")} />
        <PartCheck label={t("assembly.foam")} checked={sel.foam} onChange={() => toggle("foam")} />
        <PartCheck label={t("assembly.pad")} checked={sel.pad} onChange={() => toggle("pad")} />
        <PartCheck label={t("assembly.bottom")} checked={sel.bottom} onChange={() => toggle("bottom")} />
      </div>

      {/* 导出按钮 */}
      <div style={{ padding: "6px 12px 12px 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button
          onClick={handleExport}
          disabled={converting}
          title={t("assembly.exportStp")}
          className="kle-btn"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 16px", borderRadius: "var(--theme-radius-sm)",
            border: "1px solid var(--theme-warning)",
            backgroundColor: converting ? "var(--theme-warning-soft)" : "var(--theme-warning)",
            color: converting ? "var(--theme-warning)" : "var(--theme-text-inverse)",
            cursor: converting ? "wait" : "pointer",
            fontWeight: 600, fontSize: 12, opacity: converting ? 0.7 : 1,
            animation: converting ? "stp-pulse 0.8s ease-in-out infinite" : "none",
          }}
        >
          {converting ? (
            <><Loader2 size={13} className="kle-spin" /> {t("assembly.exporting")}</>
          ) : (
            <><Package size={13} /> {t("assembly.exportStp")}</>
          )}
        </button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--theme-text-dim)" }}>
          <Boxes size={12} /> {t("assembly.originNote")}
        </span>
      </div>

      {stpMsg && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          <div style={{
            padding: "6px 12px", borderRadius: "var(--theme-radius-sm)", fontSize: 12, fontWeight: 500,
            backgroundColor: stpMsg.ok ? "var(--theme-success-soft)" : "var(--theme-danger-soft)",
            color: stpMsg.ok ? "var(--theme-success)" : "var(--theme-danger)",
            border: stpMsg.ok ? "1px solid var(--theme-success-border)" : "1px solid var(--theme-danger-border)",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>
            {stpMsg.text}
          </div>
        </div>
      )}
    </div>
  );
}

AssemblySection.displayName = "AssemblySection";

function PartCheck({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label
      title={hint}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12,
        color: disabled ? "var(--theme-text-dim)" : "var(--theme-text)",
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        style={{ cursor: disabled ? "not-allowed" : "pointer" }}
      />
      {label}
      {disabled && hint ? <span style={{ fontSize: 10, color: "var(--theme-text-dim)" }}>（{hint}）</span> : null}
    </label>
  );
}

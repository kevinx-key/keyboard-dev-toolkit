/**
 * Project Persistence Hook
 *
 * Extracted from EditorPage.tsx — manages Save All / Upload All / auto-backup logic.
 *
 * Dependencies: requires useKeyboardEditor, usePlateEditor, and usePCBEditor state
 * as parameters (inversion of control — the hook does not own the primitive state).
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getRawRows, parseKLEJSON } from "../lib/kle-serial";
import { serializeProjectFile, deserializeProjectFile } from "../lib/project-serial";
import type { ProjectFileOutput, ProjectFileDecal } from "../lib/project-serial";
import { saveFile, openFile } from "../lib/platform-bridge";
import { addLog, logger } from "../lib/error-logger";
import {
  saveProjectBackup,
  getProjectBackups,
} from "../lib/project-backup-manager";
import type { ProjectBackupEntry } from "../lib/project-backup-manager";
import type { KLELayout } from "../lib/kle-types";
import type { PlateRotationOverrides } from "../lib/plate-export";
import type { PCBSwitchRotations, PCBStabRotations, PCBConfig } from "../lib/pcb-export";
import type { PlateSettings, FoamSettings, PadSettings, BottomFoamSettings } from "../lib/editor-settings";
import { useI18n } from "../lib/i18n";

// ─── Params ───────────────────────────────────────────────

export interface UseProjectPersistenceParams {
  /** Current KLE layout (from useKeyboardEditor) */
  layout: KLELayout;
  /** Load a full KLE layout into the editor */
  loadLayout: (layout: KLELayout) => void;
  /** Plate key rotation overrides */
  plateRotations: PlateRotationOverrides;
  /** PCB switch rotation overrides */
  switchRotations: PCBSwitchRotations;
  /** PCB stabilizer rotation overrides */
  stabRotations: PCBStabRotations;
  /** PCB component config */
  pcbConfig: PCBConfig;
  /** 定位板编辑器配置 */
  plateConfig: PlateSettings;
  /** 轴间棉配置 */
  foamConfig: FoamSettings;
  /** 轴下垫配置 */
  padConfig: PadSettings;
  /** 底棉配置 */
  bottomFoamConfig: BottomFoamSettings;
  /** Setters for restoring from project file */
  setPlateRotations: (value: PlateRotationOverrides) => void;
  setSwitchRotations: (value: PCBSwitchRotations) => void;
  setStabRotations: (value: PCBStabRotations) => void;
  setPcbConfig: React.Dispatch<React.SetStateAction<PCBConfig>>;
  setPlateConfig: React.Dispatch<React.SetStateAction<PlateSettings>>;
  setFoamConfig: React.Dispatch<React.SetStateAction<FoamSettings>>;
  setPadConfig: React.Dispatch<React.SetStateAction<PadSettings>>;
  setBottomFoamConfig: React.Dispatch<React.SetStateAction<BottomFoamSettings>>;
}

// ─── Helpers ──────────────────────────────────────────────

/** localStorage key for the editor sidecar (rotations + all per-editor config) */
const SIDECAR_LS_KEY = "custom-key-pcb-tool-sidecar-v1";

/** Extract the decal (if any) from a layout's meta as a project-file decal. */
function decalFromMeta(meta: KLELayout["meta"]): ProjectFileDecal | null {
  if (!meta.decalImage) return null;
  return {
    image: meta.decalImage,
    scale: meta.decalScale ?? 1,
    x: meta.decalX ?? 0,
    y: meta.decalY ?? 0,
    dim: meta.decalDim ?? 0.4,
    opacity: meta.decalOpacity ?? 1,
    ...(meta.decalNatW != null ? { natW: meta.decalNatW } : {}),
    ...(meta.decalNatH != null ? { natH: meta.decalNatH } : {}),
  };
}

/** Apply a project-file decal onto a loaded layout's meta. */
function applyDecalToLayout(layoutData: KLELayout, decal: ProjectFileDecal | null): void {
  if (!decal) {
    delete layoutData.meta.decalImage;
    delete layoutData.meta.decalScale;
    delete layoutData.meta.decalX;
    delete layoutData.meta.decalY;
    delete layoutData.meta.decalDim;
    delete layoutData.meta.decalOpacity;
    delete layoutData.meta.decalNatW;
    delete layoutData.meta.decalNatH;
    return;
  }
  layoutData.meta.decalImage = decal.image;
  layoutData.meta.decalScale = decal.scale;
  layoutData.meta.decalX = decal.x;
  layoutData.meta.decalY = decal.y;
  layoutData.meta.decalDim = decal.dim;
  layoutData.meta.decalOpacity = decal.opacity;
  if (decal.natW != null) layoutData.meta.decalNatW = decal.natW;
  if (decal.natH != null) layoutData.meta.decalNatH = decal.natH;
}

// ─── Hook ─────────────────────────────────────────────────

export function useProjectPersistence(params: UseProjectPersistenceParams) {
  const {
    layout,
    loadLayout,
    plateRotations,
    switchRotations,
    stabRotations,
    pcbConfig,
    plateConfig,
    foamConfig,
    padConfig,
    bottomFoamConfig,
    setPlateRotations,
    setSwitchRotations,
    setStabRotations,
    setPcbConfig,
    setPlateConfig,
    setFoamConfig,
    setPadConfig,
    setBottomFoamConfig,
  } = params;

  const { t } = useI18n();

  // ── Project backup dialog state ─────────────────────

  const [projectBkDialogOpen, setProjectBkDialogOpen] = useState(false);
  const [projectBackupList, setProjectBackupList] = useState<ProjectBackupEntry[]>([]);

  // ── Refs for auto-backup (avoid stale closures in setInterval) ──

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const configRef = useRef({ plateRotations, switchRotations, stabRotations, pcbConfig, plateConfig, foamConfig, padConfig, bottomFoamConfig });
  configRef.current = { plateRotations, switchRotations, stabRotations, pcbConfig, plateConfig, foamConfig, padConfig, bottomFoamConfig };

  // ── On mount: remove startup clear — auto-save already prunes to 3 max,
  // and clearing all backups on every startup destroys cross-session data. ─

  // ── Auto-backup full project data every 5 minutes ───

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const curLayout = layoutRef.current;
        const cfg = configRef.current;
        const rows = getRawRows(curLayout);
        const json = serializeProjectFile({
          name: curLayout.meta.name || "Keyboard",
          layout: curLayout,
          kLayout: rows,
          plateRotations: cfg.plateRotations,
          plateConfig: cfg.plateConfig,
          switchRotations: cfg.switchRotations,
          stabRotations: cfg.stabRotations,
          pcbConfig: cfg.pcbConfig,
          foamConfig: cfg.foamConfig,
          padConfig: cfg.padConfig,
          bottomFoamConfig: cfg.bottomFoamConfig,
          decal: decalFromMeta(curLayout.meta),
        });
        saveProjectBackup(json, curLayout.meta.name || "Keyboard").catch((e) => {
          addLog({
            type: "error",
            message: "useProjectPersistence: save project backup failed",
            stack: (e as Error)?.stack,
          });
        });
      } catch (e) {
        addLog({
          type: "error",
          message: "useProjectPersistence: project auto-backup serialization failed",
          stack: (e as Error)?.stack,
        });
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Sidecar persistence: keep rotations + ALL per-editor config across refresh ──
  // (layout itself is auto-saved by useKeyboardEditor; this stores everything else)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDECAR_LS_KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Record<string, unknown>;
      if (s.plateRotations && typeof s.plateRotations === "object") setPlateRotations(s.plateRotations as PlateRotationOverrides);
      if (s.switchRotations && typeof s.switchRotations === "object") setSwitchRotations(s.switchRotations as PCBSwitchRotations);
      if (s.stabRotations && typeof s.stabRotations === "object") setStabRotations(s.stabRotations as PCBStabRotations);
      if (s.pcbConfig) setPcbConfig((prev) => ({ ...prev, ...(s.pcbConfig as Partial<PCBConfig>) }));
      if (s.plateConfig) setPlateConfig((prev) => ({ ...prev, ...(s.plateConfig as Partial<PlateSettings>) }));
      if (s.foamConfig) setFoamConfig((prev) => ({ ...prev, ...(s.foamConfig as Partial<FoamSettings>) }));
      if (s.padConfig) setPadConfig((prev) => ({ ...prev, ...(s.padConfig as Partial<PadSettings>) }));
      if (s.bottomFoamConfig) setBottomFoamConfig((prev) => ({ ...prev, ...(s.bottomFoamConfig as Partial<BottomFoamSettings>) }));
    } catch (e) {
      logger.error("useProjectPersistence: load sidecar failed", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(SIDECAR_LS_KEY, JSON.stringify({
          plateRotations, switchRotations, stabRotations, pcbConfig,
          plateConfig, foamConfig, padConfig, bottomFoamConfig,
        }));
      } catch (e) {
        logger.error("useProjectPersistence: save sidecar failed", e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [plateRotations, switchRotations, stabRotations, pcbConfig, plateConfig, foamConfig, padConfig, bottomFoamConfig]);

  // ── Save All ────────────────────────────────────────

  const handleSaveAll = useCallback(async () => {
    try {
      const rows = getRawRows(layout);
      const json = serializeProjectFile({
        name: layout.meta.name || "Keyboard",
        layout,
        kLayout: rows,
        plateRotations,
        plateConfig,
        switchRotations,
        stabRotations,
        pcbConfig,
        foamConfig,
        padConfig,
        bottomFoamConfig,
        decal: decalFromMeta(layout.meta),
      });
      const safeName = (layout.meta.name || "keyboard")
        .replace(/[<>:"/\\|?*]/g, "_") // 去掉文件名非法字符
        .replace(/\s+/g, "_")
        .substring(0, 64);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
      const path = await saveFile(json, {
        defaultName: `${safeName}_klev0_${dateStr}.json`,
        mimeType: "application/json",
      });
      if (path) {
        alert(t("msg.projectSaved").replace("{{path}}", path));
      }
    } catch (err) {
      logger.error("handleSaveAll failed", err);
    }
  }, [layout, plateRotations, plateConfig, switchRotations, stabRotations, pcbConfig, foamConfig, padConfig, bottomFoamConfig, t]);

  // ── Restore all editor state from a parsed project file ──

  const applyParsedState = useCallback((parsed: ProjectFileOutput) => {
    setPlateRotations(parsed.plateRotations);
    setSwitchRotations(parsed.switchRotations);
    setStabRotations(parsed.stabRotations);
    setPcbConfig(parsed.pcbConfig);
    setPlateConfig(parsed.plateConfig);
    setFoamConfig(parsed.foamConfig);
    setPadConfig(parsed.padConfig);
    setBottomFoamConfig(parsed.bottomFoamConfig);
  }, [setPlateRotations, setSwitchRotations, setStabRotations, setPcbConfig, setPlateConfig, setFoamConfig, setPadConfig, setBottomFoamConfig]);

  // ── Upload All ──────────────────────────────────────

  const handleUploadAll = useCallback(async () => {
    try {
      const text = await openFile({ accept: ".json,.kle-project.json", readAsText: true });
      if (!text) return;

      const parsed = deserializeProjectFile(text);
      if (!parsed) {
        alert(t("msg.projectInvalid"));
        return;
      }

      // Restore layout: prefer lossless full layout (v3), else parse KLE rows
      try {
        const layoutData: KLELayout | null = parsed.layout
          ? parsed.layout
          : parseKLEJSON(parsed.kLayout);
        if (layoutData) {
          // Restore keyboard name from project file meta
          if (parsed.name) {
            layoutData.meta.name = parsed.name;
          }
          // Full layout already carries decal in meta; only re-inject for legacy kLayout path
          if (!parsed.layout) applyDecalToLayout(layoutData, parsed.decal);
          loadLayout(layoutData);
        }
      } catch (e) {
        logger.error("useProjectPersistence: UploadAll KLE parse failed", e);
        alert(t("msg.kleParseFail"));
        return;
      }

      // Restore rotation overrides + ALL per-editor config
      applyParsedState(parsed);
    } catch (err) {
      logger.error("handleUploadAll failed", err);
    }
  }, [loadLayout, applyParsedState, t]);

  // ── Project Backup Dialog ───────────────────────────

  const handleOpenProjectBackup = useCallback(async () => {
    try {
      const list = await getProjectBackups();
      setProjectBackupList(list);
      setProjectBkDialogOpen(true);
    } catch (err) {
      logger.error("handleOpenProjectBackup failed", err);
    }
  }, []);

  const handleRestoreFromProjectBackup = useCallback(
    async (projectData: string) => {
      const parsed = deserializeProjectFile(projectData);
      if (!parsed) {
        alert(t("msg.backupInvalid"));
        return;
      }
      try {
        const layoutData: KLELayout | null = parsed.layout
          ? parsed.layout
          : parseKLEJSON(parsed.kLayout);
        if (layoutData) {
          // Restore keyboard name from project file meta
          if (parsed.name) {
            layoutData.meta.name = parsed.name;
          }
          if (!parsed.layout) applyDecalToLayout(layoutData, parsed.decal);
          loadLayout(layoutData);
        }
      } catch (e) {
        addLog({
          type: "error",
          message: "useProjectPersistence: project backup restore parse failed",
          stack: (e as Error)?.stack,
        });
        alert(t("msg.kleParseFail"));
        return;
      }
      applyParsedState(parsed);
      setProjectBkDialogOpen(false);
    },
    [loadLayout, applyParsedState]
  );

  return {
    projectBkDialogOpen,
    setProjectBkDialogOpen,
    projectBackupList,
    handleSaveAll,
    handleUploadAll,
    handleOpenProjectBackup,
    handleRestoreFromProjectBackup,
  };
}

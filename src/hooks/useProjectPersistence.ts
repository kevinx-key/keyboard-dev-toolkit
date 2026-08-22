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
import type { ProjectFileOutput } from "../lib/project-serial";
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
  /** Setters for restoring from project file */
  setPlateRotations: (value: PlateRotationOverrides) => void;
  setSwitchRotations: (value: PCBSwitchRotations) => void;
  setStabRotations: (value: PCBStabRotations) => void;
  setPcbConfig: React.Dispatch<React.SetStateAction<PCBConfig>>;
}

// ─── Helpers ──────────────────────────────────────────────

/** Restore PCB config fields from a parsed project file output */
function applyProjectPcbConfig(
  setPcbConfig: React.Dispatch<React.SetStateAction<PCBConfig>>,
  parsed: ProjectFileOutput
) {
  setPcbConfig((prev) => ({
    ...prev,
    needTypeC: parsed.needTypeC,
    need4P: parsed.need4P,
    needMCU: parsed.needMCU,
    typeCX: parsed.typeCX,
    typeCY: parsed.typeCY,
    fourPX: parsed.fourPX,
    fourPY: parsed.fourPY,
    mcuX: parsed.mcuX,
    mcuY: parsed.mcuY,
    typeCRot: parsed.typeCRot,
    fourPRot: parsed.fourPRot,
    mcuRot: parsed.mcuRot,
  }));
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
    setPlateRotations,
    setSwitchRotations,
    setStabRotations,
    setPcbConfig,
  } = params;

  // ── Project backup dialog state ─────────────────────

  const [projectBkDialogOpen, setProjectBkDialogOpen] = useState(false);
  const [projectBackupList, setProjectBackupList] = useState<ProjectBackupEntry[]>([]);

  // ── Refs for auto-backup (avoid stale closures in setInterval) ──

  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const configRef = useRef({ plateRotations, switchRotations, stabRotations, pcbConfig });
  configRef.current = { plateRotations, switchRotations, stabRotations, pcbConfig };

  // ── On mount: remove startup clear — auto-save already prunes to 3 max,
  // and clearing all backups on every startup destroys cross-session data. ─

  // ── Auto-backup full project data every 5 minutes ───

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const curLayout = layoutRef.current;
        const cfg = configRef.current;
        const rows = getRawRows(curLayout);
        const pc = cfg.pcbConfig;
        const json = serializeProjectFile({
          name: curLayout.meta.name || "Keyboard",
          kLayout: rows,
          plateRotations: cfg.plateRotations,
          switchRotations: cfg.switchRotations,
          stabRotations: cfg.stabRotations,
          needTypeC: pc.needTypeC,
          need4P: pc.need4P,
          needMCU: pc.needMCU,
          typeCX: pc.typeCX,
          typeCY: pc.typeCY,
          fourPX: pc.fourPX,
          fourPY: pc.fourPY,
          mcuX: pc.mcuX,
          mcuY: pc.mcuY,
          typeCRot: pc.typeCRot,
          fourPRot: pc.fourPRot,
          mcuRot: pc.mcuRot,
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

  // ── Save All ────────────────────────────────────────

  const handleSaveAll = useCallback(async () => {
    try {
      const rows = getRawRows(layout);
      const json = serializeProjectFile({
        name: layout.meta.name || "Keyboard",
        kLayout: rows,
        plateRotations,
        switchRotations,
        stabRotations,
        needTypeC: pcbConfig.needTypeC,
        need4P: pcbConfig.need4P,
        needMCU: pcbConfig.needMCU,
        typeCX: pcbConfig.typeCX,
        typeCY: pcbConfig.typeCY,
        fourPX: pcbConfig.fourPX,
        fourPY: pcbConfig.fourPY,
        mcuX: pcbConfig.mcuX,
        mcuY: pcbConfig.mcuY,
        typeCRot: pcbConfig.typeCRot,
        fourPRot: pcbConfig.fourPRot,
        mcuRot: pcbConfig.mcuRot,
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
        alert(`✅ 项目文件保存成功！\n文件: ${path}`);
      }
    } catch (err) {
      logger.error("handleSaveAll failed", err);
    }
  }, [layout, plateRotations, switchRotations, stabRotations, pcbConfig]);

  // ── Upload All ──────────────────────────────────────

  const handleUploadAll = useCallback(async () => {
    try {
      const text = await openFile({ accept: ".json,.kle-project.json", readAsText: true });
      if (!text) return;

      const parsed = deserializeProjectFile(text);
      if (!parsed) {
        alert("项目文件格式无效或不兼容的版本。");
        return;
      }

      // Restore KLE layout
      try {
        const layoutData = parseKLEJSON(parsed.kLayout);
        if (layoutData) {
          // Restore keyboard name from project file meta (getRawRows strips it)
          if (parsed.name) {
            layoutData.meta.name = parsed.name;
          }
          loadLayout(layoutData);
        }
      } catch (e) {
        logger.error("useProjectPersistence: UploadAll KLE parse failed", e);
        alert("KLE 布局数据解析失败。");
        return;
      }

      // Restore rotation overrides
      setPlateRotations(parsed.plateRotations);
      setSwitchRotations(parsed.switchRotations);
      setStabRotations(parsed.stabRotations);

      // Restore PCB config
      applyProjectPcbConfig(setPcbConfig, parsed);
    } catch (err) {
      logger.error("handleUploadAll failed", err);
    }
  }, [loadLayout, setPlateRotations, setSwitchRotations, setStabRotations, setPcbConfig]);

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
        alert("备份文件格式无效。");
        return;
      }
      try {
        const layoutData = parseKLEJSON(parsed.kLayout);
        if (layoutData) {
          // Restore keyboard name from project file meta (getRawRows strips it)
          if (parsed.name) {
            layoutData.meta.name = parsed.name;
          }
          loadLayout(layoutData);
        }
      } catch (e) {
        addLog({
          type: "error",
          message: "useProjectPersistence: project backup restore parse failed",
          stack: (e as Error)?.stack,
        });
        alert("KLE 布局数据解析失败。");
        return;
      }
      setPlateRotations(parsed.plateRotations);
      setSwitchRotations(parsed.switchRotations);
      setStabRotations(parsed.stabRotations);
      applyProjectPcbConfig(setPcbConfig, parsed);
      setProjectBkDialogOpen(false);
    },
    [loadLayout, setPlateRotations, setSwitchRotations, setStabRotations, setPcbConfig]
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

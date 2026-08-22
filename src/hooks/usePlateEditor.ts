/**
 * Plate Editor Hook
 *
 * Extracted from EditorPage.tsx — manages Plate/PCB rotation overrides,
 * active-section tracking, and STP export progress state.
 */

"use client";

import { useState, useCallback } from "react";
import type { PlateRotationOverrides } from "../lib/plate-export";
import type { PCBSwitchRotations, PCBStabRotations } from "../lib/pcb-export";
import type { StpProgressData } from "../components/StpExportOverlay";

export function usePlateEditor() {
  // ── Rotation overrides ──────────────────────────────
  const [plateRotations, setPlateRotations] = useState<PlateRotationOverrides>({});
  const [switchRotations, setSwitchRotations] = useState<PCBSwitchRotations>({});
  const [stabRotations, setStabRotations] = useState<PCBStabRotations>({});

  // ── Active section tracking (mutually exclusive) ────
  const [activeSection, setActiveSection] = useState<"plate" | "pcb" | null>(null);

  // ── STP export fullscreen overlay state ─────────────
  const [stpExporting, setStpExporting] = useState(false);
  const [stpProgress, setStpProgress] = useState<StpProgressData | null>(null);

  const handleStpProgress = useCallback((data: StpProgressData) => {
    setStpProgress(data);
  }, []);

  const handleStpExportingChange = useCallback((exporting: boolean) => {
    setStpExporting(exporting);
    if (!exporting) {
      // Delay clearing progress so the 100% state is visible briefly
      setTimeout(() => setStpProgress(null), 800);
    }
  }, []);

  return {
    plateRotations,
    setPlateRotations,
    switchRotations,
    setSwitchRotations,
    stabRotations,
    setStabRotations,
    activeSection,
    setActiveSection,
    stpExporting,
    stpProgress,
    handleStpProgress,
    handleStpExportingChange,
  };
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { StpProgressData } from "../components/StpExportOverlay";

/**
 * useStpExport — STP export state and flow control.
 *
 * Extracted from EditorPage.tsx to reduce EditorPage complexity
 * and enable independent testing.
 */
export function useStpExport() {
  const [stpExporting, setStpExporting] = useState(false);
  const [stpProgress, setStpProgress] = useState<StpProgressData | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount to avoid calling setState on unmounted component
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, []);

  const handleStpProgress = useCallback((data: StpProgressData) => {
    setStpProgress(data);
  }, []);

  const handleStpExportingChange = useCallback((exporting: boolean) => {
    setStpExporting(exporting);
    if (!exporting) {
      // Delay clearing progress so the 100% state is visible briefly
      clearTimerRef.current = setTimeout(() => setStpProgress(null), 800);
    } else {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    }
  }, []);

  return {
    stpExporting,
    stpProgress,
    handleStpProgress,
    handleStpExportingChange,
  };
}

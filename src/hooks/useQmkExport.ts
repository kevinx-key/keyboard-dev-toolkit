/**
 * useQmkExport — QMK 导出状态管理 Hook
 *
 * 管理与 QMK 固件导出相关的状态和操作。
 * 遵循 useStpExport 的既有模式。
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

export interface QmkExportProgress {
  percentage: number;
  phase: string;
  phaseLabel: string;
  message: string;
}

export function useQmkExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<QmkExportProgress | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const handleProgress = useCallback((data: QmkExportProgress) => {
    setProgress(data);
  }, []);

  const handleExportingChange = useCallback((isExporting: boolean) => {
    setExporting(isExporting);

    if (!isExporting) {
      // 延迟清除进度，让 100% 状态可见
      clearTimerRef.current = setTimeout(() => {
        setProgress(null);
      }, 800);
    }
  }, []);

  return {
    exporting,
    progress,
    handleProgress,
    handleExportingChange,
  };
}

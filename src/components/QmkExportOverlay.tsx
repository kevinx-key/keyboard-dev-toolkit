"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Zap, X, FileText, Download, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { isQmkExportEnabled, getBuildVariant, getPlugin } from "../plugins";
import type { QmkExportConfig, QmkExportResult, McuType, QmkFeature } from "../plugins/qmk-export/types";
import { getPlatform } from "../lib/platform-bridge";
import { useI18n } from "../lib/i18n";

/* ============ 插件惰性加载 ============ */
// 动态加载 QMK 插件：免费版构建不含此模块，Pro 版构建时才注入
type QmkModule = typeof import("../plugins/qmk-export");
let qmkModulePromise: Promise<QmkModule> | null = null;
function loadQmkModule(): Promise<QmkModule> {
  qmkModulePromise ??= import("../plugins/qmk-export");
  return qmkModulePromise;
}

/* ============ 常量 ============ */

const MCU_OPTIONS: Array<{ value: McuType; descKey: string }> = [
  { value: "STM32F072", descKey: "qmk.mcuF072" },
  { value: "STM32F411", descKey: "qmk.mcuF411" },
  { value: "STM32L432", descKey: "qmk.mcuL432" },
  { value: "RP2040", descKey: "qmk.mcuRP2040" },
  { value: "NRF52840", descKey: "qmk.mcuNRF52840" },
];

const FEATURE_OPTIONS: Array<{ value: QmkFeature; label: string }> = [
  { value: "bootmagic", label: "Bootmagic" },
  { value: "extrakey", label: "Extra Key" },
  { value: "mousekey", label: "Mouse Key" },
  { value: "nkro", label: "NKRO" },
  { value: "rgb_matrix", label: "RGB Matrix" },
  { value: "rgblight", label: "RGB Light" },
];

/* 配列识别结果的原文 → i18n key 映射（未命中则显示插件原文） */
const LAYOUT_DESC_KEYS: Record<string, string> = {
  "60% ANSI (61键)": "lay.desc60ansi",
  "60% ANSI 分离右 Shift": "lay.desc60ansisplit",
  "60% ISO (62键)": "lay.desc60iso",
  "65% ANSI (67键)": "lay.desc65ansi",
  "75% ANSI (84键)": "lay.desc75ansi",
  "TKL ANSI (87键)": "lay.desctklansi",
  "TKL ISO (88键)": "lay.desctkliso",
  "全尺寸 ANSI (104键)": "lay.descfullansi",
  "自定义配列": "lay.desccustom",
};

interface LogEntry {
  time: string;
  text: string;
  done: boolean;
}

/* ============ 导出阶段定义 ============ */

const EXPORT_STAGES = [
  { percentage: 5,  phKey: "qmk.ph1", msgKey: "qmk.msg1" },
  { percentage: 20, phKey: "qmk.ph2", msgKey: "qmk.msg2" },
  { percentage: 35, phKey: "qmk.ph3", msgKey: "qmk.msg3" },
  { percentage: 50, phKey: "qmk.ph4", msgKey: "qmk.msg4" },
  { percentage: 65, phKey: "qmk.ph5", msgKey: "qmk.msg5" },
  { percentage: 80, phKey: "qmk.ph6", msgKey: "qmk.msg6" },
  { percentage: 95, phKey: "qmk.ph7", msgKey: "qmk.msg7" },
  { percentage: 100,phKey: "qmk.ph8", msgKey: "qmk.msg8" },
];

/* ============ 组件 ============ */

interface QmkExportOverlayProps {
  visible: boolean;
  keyProps?: Array<{
    x: number; y: number; w?: number; h?: number;
    labels: string[]; d?: boolean; r?: number; rx?: number; ry?: number;
    c?: string; t?: string;
  }>;
  keyboardName?: string;
  onClose: () => void;
}

export default function QmkExportOverlay({ visible, keyProps, keyboardName: initialName, onClose }: QmkExportOverlayProps) {
  const { t } = useI18n();
  const isEnabled = isQmkExportEnabled();
  const buildVariant = getBuildVariant();

  /* ── 状态机模式 ── */
  type ViewState = "config" | "exporting" | "result";
  const [view, setView] = useState<ViewState>("config");

  /* ── 配置状态 ── */
  // 初始值与插件 getDefaultConfig 的字段默认值一致，模块加载后立即覆盖为权威默认
  const [config, setConfig] = useState<QmkExportConfig>(() => ({
    keyboardName: initialName || 'My Keyboard',
    manufacturer: '自定义',
    maintainer: 'custom',
    url: '',
    mcu: 'STM32F072',
    diodeDirection: 'COL2ROW',
    viaEnabled: true,
    encoderEnabled: false,
    features: ['bootmagic', 'extrakey', 'mousekey', 'nkro'],
    layoutName: 'LAYOUT_60_ansi',
    vid: '0x4350',
    pid: '0x0001',
    deviceVersion: '1.0.0',
    oledEnabled: false,
  }));

  // 模块加载后同步权威默认配置
  useEffect(() => {
    let alive = true;
    loadQmkModule().then(m => {
      if (alive) setConfig(prev => ({ ...m.getDefaultConfig(), keyboardName: prev.keyboardName }));
    }).catch(() => { /* 免费版无此模块，保持本地默认 */ });
    return () => { alive = false; };
  }, []);
  const [error, setError] = useState<string | null>(null);

  /* ── 导出进度状态 ── */
  const [progress, setProgress] = useState({ percentage: 0, phaseLabel: "", message: "" });
  const [elapsed, setElapsed] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<QmkExportResult | null>(null);
  const lastMsgRef = useRef<string>("");
  const logEndRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const exportDoneRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [saveDirPath, setSaveDirPath] = useState<string | null>(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // 同步键盘名称
  useEffect(() => {
    if (initialName && view === "config") {
      setConfig(prev => ({ ...prev, keyboardName: initialName }));
    }
  }, [initialName, view]);

  // 计时器
  useEffect(() => {
    if (!visible || view !== "exporting") {
      setElapsed(0);
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current ??= Date.now();
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 200);
    return () => clearInterval(interval);
  }, [visible, view]);

  /* ── 导出进度推进 ── */
  const advanceStage = useCallback((stageIdx: number) => {
    if (stageIdx >= EXPORT_STAGES.length) return;
    const s = EXPORT_STAGES[stageIdx];
    if (!s) return;
    const phaseLabel = t(s.phKey);
    const message = t(s.msgKey);
    setProgress({ percentage: s.percentage, phaseLabel, message });

    const ts = new Date();
    const timeStr = `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
    const msg = `${phaseLabel}: ${message}`;
    const dedupKey = `${s.percentage}-${msg}`;
    if (dedupKey === lastMsgRef.current) return;

    setLog(prev => {
      const next = [...prev];
      if (next.length > 0 && !next[next.length - 1]!.done) {
        next[next.length - 1] = { ...next[next.length - 1]!, done: true };
      }
      next.push({ time: timeStr, text: msg, done: false });
      return next;
    });
    lastMsgRef.current = dedupKey;
  }, [t]);

  /* ── 主导出逻辑 ── */
  const handleExport = useCallback(() => {
    if (!keyProps || keyProps.length === 0) {
      setError(t("qmk.noDataError"));
      return;
    }

    setView("exporting");
    setResult(null);
    setError(null);
    setLog([]);
    lastMsgRef.current = "";
    exportDoneRef.current = false;

    // Stage 0: 初始化
    advanceStage(0);

    const failExport = (e: unknown) => {
      const message = e instanceof Error ? e.message : t("qmk.exportFailed");
      setError(message);
      console.error("[QMK Export]", e);

      // 标记最后一条日志为 error
      setLog(prev => {
        const next = [...prev];
        if (next.length > 0 && !next[next.length - 1]!.done) {
          next[next.length - 1] = { ...next[next.length - 1]!, done: true };
        }
        const ts2 = new Date();
        const timeStr2 = `${String(ts2.getHours()).padStart(2, "0")}:${String(ts2.getMinutes()).padStart(2, "0")}:${String(ts2.getSeconds()).padStart(2, "0")}`;
        next.push({ time: timeStr2, text: `${t("qmk.errLogPrefix")}${message}`, done: true });
        return next;
      });
    };

    // 分阶段推进进度，最后执行实际导出
    const runExport = () => {
      try {
        // Stage 1-5: 模拟进度（允许 UI 渲染）
        advanceStage(1); // 20% 矩阵分配
        setTimeout(() => {
          advanceStage(2); // 35% 配列识别
        }, 80);
        setTimeout(() => {
          advanceStage(3); // 50% 引脚分配
        }, 160);
        setTimeout(() => {
          advanceStage(4); // 65% 文件生成
        }, 240);
        setTimeout(() => {
          advanceStage(5); // 80% 键图生成

          // 执行实际导出（动态加载插件模块）
          loadQmkModule().then(({ exportQmkFirmware }) => {
            const exportResult = exportQmkFirmware(
              keyProps,
              config.keyboardName,
              config,
            );

            // Stage 6-7: 完成
            advanceStage(6); // 95% 固件打包
            setTimeout(() => {
              advanceStage(7); // 100% 完成
              setResult(exportResult);
              exportDoneRef.current = true;

              // 标记最后一条日志为 done
              setLog(prev => {
                const next = [...prev];
                if (next.length > 0 && !next[next.length - 1]!.done) {
                  next[next.length - 1] = { ...next[next.length - 1]!, done: true };
                }
                return next;
              });
            }, 200);
          }).catch(failExport);
        }, 320);
      } catch (e) {
        failExport(e);
      }
    };

    // 使用 setTimeout 确保 UI 先渲染再执行同步导出
    setTimeout(runExport, 50);
  }, [keyProps, config, advanceStage, t]);

  /* ── 下载所有文件 ── */
  const handleDownloadAll = useCallback(async () => {
    if (!result) return;
    setDownloading(true);
    setSaveDirPath(null);

    if (getPlatform() === "tauri") {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");

        const dirPath = await open({
          directory: true,
          title: t("qmk.chooseDir"),
        });
        if (!dirPath) { setDownloading(false); return; } // cancelled

        for (const file of result.files) {
          const filePath = `${dirPath}/${file.path}`;
          await writeTextFile(filePath, file.content);
        }
        setSaveDirPath(dirPath);
      } catch (err) {
        console.warn("Tauri QMK save failed, falling back to browser download:", err);
        // fallback to browser download
        for (const file of result.files) {
          const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = file.path.replace(/\//g, "_");
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } else {
      // Web: browser download all files
      for (const file of result.files) {
        const blob = new Blob([file.content], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.path.replace(/\//g, "_");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    }

    setTimeout(() => setDownloading(false), 500);
  }, [result, t]);

  /* ── 回到配置 ── */
  const handleBackToConfig = useCallback(() => {
    setView("config");
    setResult(null);
    setError(null);
    setLog([]);
  }, []);

  /* ── 日志标记完成（遮罩关闭时） ── */
  useEffect(() => {
    if (!visible) {
      setLog(prev => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        if (!next[next.length - 1]!.done) {
          next[next.length - 1] = { ...next[next.length - 1]!, done: true };
        }
        return next;
      });
      // 重置视图
      setTimeout(() => setView("config"), 300);
    }
  }, [visible]);

  if (!visible) return null;

  /* ══════════════════════════════════
     视图: 结果展示 (result)
     ══════════════════════════════════ */
  if (view === "result" && result) {
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        backgroundColor: "rgba(var(--theme-bg-rgb), 0.95)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 16, padding: 24,
      }}>
        {/* 成功标记 */}
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          backgroundColor: "rgba(var(--theme-success-rgb), 0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--theme-success)",
          boxShadow: "0 0 20px var(--theme-selected-glow)",
        }}>
          <CheckCircle2 size={30} strokeWidth={2} />
        </div>

        <div style={{
          fontSize: 18, fontWeight: 700, color: "var(--theme-text)",
          fontFamily: "var(--theme-font-ui)",
        }}>{t("qmk.successTitle")}</div>
        {/* 摘要信息 */}
        <div style={{
          background: "var(--theme-surface-2)", borderRadius: "var(--theme-radius-md)",
          padding: "12px 20px",
          fontSize: 13, lineHeight: 1.8, color: "var(--theme-text-muted)",
          minWidth: 280, textAlign: "center",
          border: "1px solid var(--theme-border-light)",
        }}>
          <div>{t("qmk.matrixSize")}: {result.matrixSize.rows} × {result.matrixSize.cols}</div>
          <div>{t("qmk.layoutType")}: {t(LAYOUT_DESC_KEYS[result.layoutType] || "") || result.layoutType}</div>
          <div>{t("qmk.filesGenerated")}: {result.files.length}</div>
          <div>{t("qmk.elapsed")}: {timeStr}</div>
          {result.warnings.length > 0 && (
            <div style={{ color: "var(--theme-warning)", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <AlertTriangle size={12} /> {t("qmk.warningsN").replace("{{n}}", String(result.warnings.length))}
            </div>
          )}
        </div>

        {/* 文件列表 */}
        <div style={{
          background: "var(--theme-bg-alt)", borderRadius: "var(--theme-radius-md)",
          padding: "10px 16px",
          maxHeight: 180, overflowY: "auto",
          fontSize: 12, fontFamily: "var(--theme-font-mono)",
          minWidth: 340, maxWidth: "80vw",
          border: "1px solid var(--theme-border-light)",
        }}>
          {result.files.map((file, i) => (
            <div key={i} style={{
              padding: "3px 0",
              borderBottom: i < result.files.length - 1 ? "1px solid var(--theme-border-light)" : "none",
              color: "var(--theme-text)",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <FileText size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span style={{ wordBreak: "break-all" }}>{file.path}</span>
              <span style={{ color: "var(--theme-text-dim)", flexShrink: 0 }}>({(file.content.length / 1024).toFixed(1)} KB)</span>
            </div>
          ))}
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleDownloadAll}
            disabled={downloading}
            className="kle-btn kle-btn-primary"
            style={{ padding: "10px 28px", fontSize: 14, fontWeight: 600, cursor: downloading ? "wait" : "pointer" }}
          >
            {downloading ? <Loader2 size={14} className="kle-spin" /> : <Download size={14} />} {downloading ? t("pcb.downloading") : t("qmk.downloadAll")}
          </button>
          <button onClick={handleBackToConfig}
            className="kle-btn"
            style={{ padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            {t("qmk.reconfigure")}
          </button>
          <button onClick={onClose}
            className="kle-btn"
            style={{ padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            {t("help.close")}
          </button>
        </div>

        {/* 保存路径提示（Tauri） */}
        {saveDirPath && (
          <div style={{
            fontSize: 12, color: "var(--theme-success)", textAlign: "center",
            maxWidth: "80vw", wordBreak: "break-all",
            background: "rgba(var(--theme-success-rgb), 0.10)", padding: "6px 14px",
            borderRadius: "var(--theme-radius-md)",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <CheckCircle2 size={13} /> {t("qmk.savedTo")} {saveDirPath}
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════
     视图: 导出中 (exporting)
     ══════════════════════════════════ */
  if (view === "exporting") {
    const pct = progress.percentage;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        backgroundColor: "rgba(var(--theme-bg-rgb), 0.90)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 12, cursor: "wait",
      }}>
        {/* 标题 */}
        <div style={{
          fontSize: 16, fontWeight: 700, color: "var(--theme-text)",
          fontFamily: "var(--theme-font-ui)", letterSpacing: 0.3,
        }}>
          {t("qmk.generatingTitle")}
        </div>

        {/* 进度条 */}
        <div style={{
          width: 360, maxWidth: "85vw",
          backgroundColor: "var(--theme-border-light)", borderRadius: 10,
          overflow: "hidden", height: 8,
        }}>
          <div style={{
            width: `${pct}%`, height: "100%",
            background: "var(--theme-gradient-primary)", borderRadius: 10,
            boxShadow: "0 0 12px var(--theme-selected-glow)",
            transition: pct > 0 ? "width 0.5s ease" : "none",
          }}
            className={pct === 0 ? "kle-stp-indeterminate-bar" : undefined}
          />
        </div>

        {/* 阶段 + 百分比 + 计时 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontSize: 14, fontWeight: 600, color: "var(--theme-text)",
            fontFamily: "var(--theme-font-ui)",
          }}>
            {progress.phaseLabel} {pct}%
          </span>
          <span style={{
            fontSize: 22, fontWeight: 300, color: "var(--theme-text-muted)",
            fontFamily: "var(--theme-font-mono)",
            letterSpacing: 1,
          }}>
            {timeStr}
          </span>
        </div>

        {/* 当前消息 */}
        {progress.message && (
          <div style={{
            fontSize: 12, color: "var(--theme-text-muted)",
            fontFamily: "var(--theme-font-ui)",
            maxWidth: 400, textAlign: "center", lineHeight: 1.4,
          }}>
            {progress.message}
          </div>
        )}

        {/* 阶段日志 */}
        {log.length > 0 && (
          <div style={{
            width: 400, maxWidth: "85vw", maxHeight: 160,
            overflowY: "auto",
            backgroundColor: "var(--theme-bg-alt)", borderRadius: "var(--theme-radius-md)",
            padding: "8px 12px", marginTop: 4,
            fontFamily: "var(--theme-font-mono)",
            fontSize: 11, lineHeight: 1.6,
            border: "1px solid var(--theme-border-light)",
          }}>
            {log.map((entry, i) => (
              <div key={i} style={{
                display: "flex", gap: 8,
                color: entry.done ? "var(--theme-text-muted)" : "var(--theme-primary)",
                fontWeight: entry.done ? 400 : 600,
              }}>
                <span style={{ color: "var(--theme-text-dim)", flexShrink: 0 }}>{entry.time}</span>
                <span style={{ flexShrink: 0, color: entry.done ? "var(--theme-success)" : "var(--theme-primary)" }}>
                  {entry.done ? "✓" : "●"}
                </span>
                <span style={{ wordBreak: "break-word" }}>{entry.text}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    );
  }

  /* ══════════════════════════════════
     视图: 配置表单 (config) — 默认视图
     ══════════════════════════════════ */
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      backgroundColor: "var(--theme-overlay)",
      backdropFilter: "blur(3px)",
      WebkitBackdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div className="kle-dialog" style={{
        maxWidth: 500, width: "100%",
        maxHeight: "90vh", overflowY: "auto",
        padding: 28,
      }}>
        {/* 标题栏 */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 24,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--theme-text)", display: "flex", alignItems: "center", gap: 8 }}>
              <Zap size={18} style={{ color: "var(--theme-accent)" }} /> {t("qmk.title")}
            </div>
            <div style={{ fontSize: 12, color: "var(--theme-text-dim)", marginTop: 2 }}>
              {isEnabled
                ? t("qmk.subtitle").replace("{{variant}}", buildVariant.toUpperCase()).replace("{{ver}}", getPlugin('qmk-export')?.version ?? '1.0.0')
                : t("qmk.proRequired")}
            </div>
          </div>
          <button onClick={onClose}
            className="kle-btn kle-btn-icon"
            style={{ color: "var(--theme-text-muted)", cursor: "pointer" }}
            aria-label={t("help.close")}
          >
            <X size={18} />
          </button>
        </div>

        {/* 非 Pro 提示 */}
        {!isEnabled && (
          <div style={{
            padding: "16px 20px", backgroundColor: "rgba(var(--theme-warning-rgb), 0.12)",
            borderRadius: "var(--theme-radius-md)", marginBottom: 20,
            fontSize: 13, color: "var(--theme-warning)", lineHeight: 1.5,
          }}>
            {t("qmk.freeNoticeA")}<strong>{t("qmk.freeBadge")}</strong>{t("qmk.freeNoticeB")}
            {" "}{t("qmk.freeDownload")}<br /><br />
            <span style={{ fontSize: 11, opacity: 0.85 }}>
              <code>QMK_PLUGIN_ENABLED=true</code>{" — "}{t("qmk.buildHint")}
            </span>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div style={{
            padding: "10px 14px", backgroundColor: "rgba(var(--theme-danger-rgb), 0.10)",
            borderRadius: "var(--theme-radius-md)", marginBottom: 16,
            fontSize: 13, color: "var(--theme-danger)", lineHeight: 1.5,
            display: "flex", alignItems: "flex-start", gap: 6,
          }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {error}
          </div>
        )}

        {/* 配置表单 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* 键盘名称 */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "var(--theme-text)" }}>
              {t("kp.name")}
            </label>
            <input type="text" value={config.keyboardName}
              onChange={(e) => setConfig(p => ({ ...p, keyboardName: e.target.value }))}
              className="kle-input"
              style={{ width: "100%", padding: "8px 12px", fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* MCU 选择 */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "var(--theme-text)" }}>
              {t("qmk.mcu")}
            </label>
            <select value={config.mcu}
              onChange={(e) => setConfig(p => ({ ...p, mcu: e.target.value as McuType }))}
              className="kle-select"
              style={{ width: "100%", padding: "8px 12px", fontSize: 14 }}
            >
              {MCU_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.value} — {t(opt.descKey)}
                </option>
              ))}
            </select>
          </div>

          {/* 二极管方向 */}
          <div>
            <label style={{ display: "block", marginBottom: 4, fontSize: 13, fontWeight: 600, color: "var(--theme-text)" }}>
              {t("qmk.diodeDirection")}
            </label>
            <select value={config.diodeDirection}
              onChange={(e) => setConfig(p => ({ ...p, diodeDirection: e.target.value as "COL2ROW" | "ROW2COL" }))}
              className="kle-select"
              style={{ width: "100%", padding: "8px 12px", fontSize: 14 }}
            >
              <option value="COL2ROW">{t("qmk.col2row")}</option>
              <option value="ROW2COL">{t("qmk.row2col")}</option>
            </select>
          </div>

          {/* 特性开关 */}
          <div>
            <label style={{ display: "block", marginBottom: 8, fontSize: 13, fontWeight: 600, color: "var(--theme-text)" }}>
              {t("qmk.features")}
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FEATURE_OPTIONS.map(feat => {
                const active = config.features.includes(feat.value);
                return (
                  <label key={feat.value}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 13, cursor: "pointer",
                      padding: "5px 10px",
                      backgroundColor: active ? "rgba(var(--theme-accent-rgb), 0.10)" : "var(--theme-bg-alt)",
                      borderRadius: "var(--theme-radius-sm)", border: "1px solid",
                      borderColor: active ? "var(--theme-accent)" : "var(--theme-border)",
                      transition: "all 0.15s",
                    }}
                  >
                    <input type="checkbox" checked={active}
                      onChange={() => setConfig(p => ({
                        ...p,
                        features: active
                          ? p.features.filter(f => f !== feat.value)
                          : [...p.features, feat.value],
                      }))}
                      style={{ margin: 0, accentColor: "var(--theme-accent)" }}
                    />
                    {feat.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* VIA + 编码器 + OLED */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--theme-text)" }}>
              <input type="checkbox" checked={config.viaEnabled}
                onChange={(e) => setConfig(p => ({ ...p, viaEnabled: e.target.checked }))}
                style={{ accentColor: "var(--theme-accent)" }}
              />
              {t("qmk.viaSupport")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--theme-text)" }}>
              <input type="checkbox" checked={config.encoderEnabled}
                onChange={(e) => setConfig(p => ({ ...p, encoderEnabled: e.target.checked }))}
                style={{ accentColor: "var(--theme-accent)" }}
              />
              {t("qmk.encoderSupport")}
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", color: "var(--theme-text)" }}>
              <input type="checkbox" checked={config.oledEnabled}
                onChange={(e) => setConfig(p => ({ ...p, oledEnabled: e.target.checked }))}
                style={{ accentColor: "var(--theme-accent)" }}
              />
              {t("qmk.oledSupport")}
            </label>
          </div>
        </div>

        {/* 底部按钮 */}
        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
          <button onClick={onClose}
            className="kle-btn"
            style={{ padding: "10px 22px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            {t("options.cancel")}
          </button>
          <button onClick={handleExport}
            disabled={!keyProps || keyProps.length === 0}
            className="kle-btn kle-btn-primary"
            style={{
              padding: "10px 28px", fontSize: 14, fontWeight: 600,
              opacity: !keyProps || keyProps.length === 0 ? 0.5 : 1,
              cursor: !keyProps || keyProps.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            <Zap size={14} /> {t("qmk.generateBtn")}
          </button>
        </div>

        {(!keyProps || keyProps.length === 0) && (
          <p style={{ fontSize: 12, color: "var(--theme-text-dim)", marginTop: 8, textAlign: "right" }}>
            {t("qmk.designFirst")}
          </p>
        )}
      </div>
    </div>
  );
}

QmkExportOverlay.displayName = "QmkExportOverlay";

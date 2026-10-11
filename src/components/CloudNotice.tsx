"use client";

import { useI18n } from "../lib/i18n";

/**
 * 云端几何生成状态提示条（§G-B3 / M2a）：
 * - `busy`：云端生成中（轻提示）；
 * - `fallback`：已回落本地（离线/失败）。
 * 两者皆否 → 不渲染。
 */
export default function CloudNotice({ busy, fallback }: { busy: boolean; fallback: boolean }) {
  const { t } = useI18n();
  if (!busy && !fallback) return null;
  return (
    <div style={{ fontSize: 11, color: "var(--theme-text)", opacity: busy ? 0.6 : 0.75, textAlign: "center" }}>
      {busy ? t("cloud.busy") : t("cloud.fallback")}
    </div>
  );
}

"use client";

import { useRef, useEffect, useState } from "react";
import { useI18n } from "../../lib/i18n";

interface ContextMenuProps {
  x: number;
  y: number;
  hasSelection: boolean;
  onPaste?: () => void;
  onClose: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onAddKey: () => void;
  onResetZoom: () => void;
}

export default function ContextMenu({
  x,
  y,
  hasSelection,
  onPaste,
  onClose,
  onDelete,
  onCopy,
  onCut,
  onDuplicate,
  onSelectAll,
  onAddKey,
  onResetZoom,
}: ContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="kle-dropdown"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 10000,
        minWidth: 180,
        padding: "5px 0",
        fontSize: 13,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {hasSelection && (
        <>
          <ContextMenuItem
            label={t("canvas.deleteKeys")}
            shortcut="Del"
            onClick={onDelete}
          />
          <ContextMenuItem
            label={t("canvas.cut")}
            shortcut="Ctrl+X"
            onClick={onCut}
          />
          <ContextMenuItem
            label={t("canvas.copy")}
            shortcut="Ctrl+C"
            onClick={onCopy}
          />
          <ContextMenuItem
            label={t("canvas.duplicate")}
            shortcut="Ctrl+D"
            onClick={onDuplicate}
          />
          <ContextDivider />
        </>
      )}
      <ContextMenuItem
        label={t("canvas.paste")}
        shortcut="Ctrl+V"
        disabled={!onPaste}
        onClick={onPaste || (() => {})}
      />
      <ContextDivider />
      <ContextMenuItem
        label={t("canvas.selectAll")}
        shortcut="Ctrl+A"
        onClick={onSelectAll}
      />
      <ContextMenuItem
        label={t("canvas.addKey")}
        shortcut=""
        onClick={onAddKey}
      />
      <ContextDivider />
      <ContextMenuItem
        label={t("canvas.resetZoom")}
        shortcut="0"
        onClick={onResetZoom}
      />
    </div>
  );
}

// ── Context Menu Item ──
function ContextMenuItem({
  label,
  shortcut,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "4px 20px",
        cursor: disabled ? "default" : "pointer",
        backgroundColor:
          hover && !disabled ? "var(--theme-surface-hover)" : "transparent",
        color: disabled ? "var(--theme-text-dim)" : "var(--theme-text)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 13,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {shortcut && (
        <span
          style={{
            marginLeft: 20,
            fontSize: 11,
            color: disabled ? "var(--theme-border)" : "var(--theme-text-dim)",
          }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}

function ContextDivider() {
  return (
    <div
      style={{
        height: 1,
        margin: "5px 0",
        backgroundColor: "var(--theme-dropdown-divider)",
      }}
    />
  );
}
ContextMenu.displayName = "ContextMenu";

"use client";

import { useState } from "react";
import { Ruler, Tag, Palette, Keyboard, Wrench, FileText, Image, Type, Brush, BarChart3 } from "lucide-react";
import type { KeyProps, KLEMeta, KLELayout } from "../lib";
import { useI18n } from "../lib/i18n";
import { PropertiesTab } from "./toolbelt/PropertiesTab";
import { LabelsTab } from "./toolbelt/LabelsTab";
import { ColorsTab } from "./toolbelt/ColorsTab";
import { KeyboardTab } from "./toolbelt/KeyboardTab";
import { ToolsTab } from "./toolbelt/ToolsTab";
import { RawDataTab } from "./toolbelt/RawDataTab";
import { SvgTab } from "./toolbelt/SvgTab";
import { CharsTab } from "./toolbelt/CharsTab";
import { CssTab } from "./toolbelt/CssTab";
import { SummaryTab } from "./toolbelt/SummaryTab";

type TabKey =
  | "properties" | "labels" | "colors" | "keyboard" | "tools"
  | "rawdata" | "svg" | "chars" | "css" | "summary";

interface TabDef {
  key: TabKey;
  icon: React.ReactNode;
  labelKey: string;
}

const ALL_TABS: TabDef[] = [
  { key: "properties", icon: <Ruler size={14} strokeWidth={2} />, labelKey: "tb.tab.properties" },
  { key: "labels", icon: <Tag size={14} strokeWidth={2} />, labelKey: "tb.tab.labels" },
  { key: "colors", icon: <Palette size={14} strokeWidth={2} />, labelKey: "tb.tab.colors" },
  { key: "keyboard", icon: <Keyboard size={14} strokeWidth={2} />, labelKey: "tb.tab.keyboard" },
  { key: "tools", icon: <Wrench size={14} strokeWidth={2} />, labelKey: "tb.tab.tools" },
  { key: "rawdata", icon: <FileText size={14} strokeWidth={2} />, labelKey: "tb.tab.rawdata" },
  { key: "svg", icon: <Image size={14} strokeWidth={2} />, labelKey: "SVG" },
  { key: "chars", icon: <Type size={14} strokeWidth={2} />, labelKey: "tb.tab.chars" },
  { key: "css", icon: <Brush size={14} strokeWidth={2} />, labelKey: "tb.tab.css" },
  { key: "summary", icon: <BarChart3 size={14} strokeWidth={2} />, labelKey: "tb.tab.summary" },
];

interface ToolBeltProps {
  keys: KeyProps[];
  selectedIds: string[];
  meta: KLEMeta;
  layout: KLELayout;
  onSetProp: (ids: string[], prop: keyof KeyProps, value: unknown) => void;
  onSetMeta: (meta: Partial<KLEMeta>) => void;
  onLoadLayout: (layout: KLELayout) => void;
  onOpenBackup?: () => void;
  onInsertChar?: (char: string) => void;
}

export default function ToolBelt(props: ToolBeltProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>("properties");

  return (
    <>
      {/* ── Tool Belt Tab Bar ── */}
      <div className="kle-tabbar">
        {ALL_TABS.map((tab) => (
          <button key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            title={t(tab.labelKey)}
            className={`kle-tab${activeTab === tab.key ? " active" : ""}`}
          >
            {tab.icon}
            <span>{t(tab.labelKey)}</span>
          </button>
        ))}
      </div>

      {/* ── Active Tab Panel ── */}
      <div className="kle-tabpanel">
        {activeTab === "properties" && (
          <PropertiesTab keys={props.keys} selectedIds={props.selectedIds} onSetProp={props.onSetProp} />
        )}
        {activeTab === "labels" && (
          <LabelsTab keys={props.keys} selectedIds={props.selectedIds} onSetProp={props.onSetProp} />
        )}
        {activeTab === "colors" && (
          <ColorsTab keys={props.keys} selectedIds={props.selectedIds} onSetProp={props.onSetProp} />
        )}
        {activeTab === "keyboard" && (
          <KeyboardTab meta={props.meta} layout={props.layout} onSetMeta={props.onSetMeta} onLoadLayout={props.onLoadLayout} />
        )}
        {activeTab === "tools" && (
          <ToolsTab keys={props.keys} selectedIds={props.selectedIds} onSetProp={props.onSetProp} />
        )}
        {activeTab === "rawdata" && (
          <RawDataTab layout={props.layout} onLoadLayout={props.onLoadLayout} onOpenBackup={props.onOpenBackup} />
        )}
        {activeTab === "svg" && (
          <SvgTab layout={props.layout} />
        )}
        {activeTab === "chars" && (
          <CharsTab onInsertChar={props.onInsertChar} />
        )}
        {activeTab === "css" && (
          <CssTab meta={props.meta} onSetMeta={props.onSetMeta} />
        )}
        {activeTab === "summary" && (
          <SummaryTab keys={props.keys} />
        )}
      </div>
    </>
  );
}

ToolBelt.displayName = "ToolBelt";

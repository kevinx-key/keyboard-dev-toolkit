/**
 * Keyboard Layout Raw Data Parser & Serializer
 *
 * Converts between internal KeyProps format and the URLON serialized format.
 * Uses URLON encoding with `_` for objects.
 *
 * Data flow:
 *   Internal (KeyProps[]) ↔ Intermediate (array-of-rows) ↔ URLON string
 * URLON is the compact URI encoding used by the keyboard layout data format.
 */

import type { KeyProps, KLELayout, KLEMeta, ComputedKey } from "./kle-types";
import { DEFAULT_PROPS, DEFAULT_META, KLE_KEY_PROPS, reorderLabelsToPositions, reorderLabelsFromPositions } from "./kle-types";
import { stringify as urlonStringify, parse as urlonParse } from "./kle-urlon";

/* ===== Constants ===== */
export const KEY_UNIT = 54;
export const KEY_GAP = 2;

/* ===== Parser: URLON → Intermediate → KeyProps ===== */

/** Parse a KLE raw data string (URLON format) into a KLELayout */
export function parseKLE(raw: string): KLELayout {
  if (!raw) return { meta: { ...DEFAULT_META }, keys: [] };

  // Strip ## prefix
  let data = raw.trim();
  if (data.startsWith("##")) data = data.slice(2);

  // Parse URLON
  let parsed: unknown;
  try {
    parsed = urlonParse(data);
  } catch (e) {
    console.error("parseKLE: urlonParse failed", e);
    return { meta: { ...DEFAULT_META }, keys: [] };
  }

  // parsed should be an array of rows
  if (!Array.isArray(parsed)) {
    return { meta: { ...DEFAULT_META }, keys: [] };
  }

  // Convert intermediate format to KeyProps[]
  const result = intermediateToKeyProps(parsed as IntermediateRow[]);
  // Preserve original intermediate for perfect round-trip
  result._sourceCache = parsed as unknown[];
  return result;
}

/** Serialize a KLELayout to URLON raw data string */
export function serializeKLE(layout: KLELayout): string {
  // Always re-derive from keyPropsToIntermediate — _sourceCache goes stale
  // when keys are edited, causing Ergodox rotation clusters to be lost.
  const intermediate = keyPropsToIntermediate(layout);
  const urlon = urlonStringify(intermediate);
  return "##" + urlon;
}

/* ===== Intermediate Format ===== */

/**
 * A KLE intermediate format property-override item.
 * Represents the inline objects in KLE's array-of-rows format, e.g.
 * {x:1, w:2, r:30, rx:6.5, ry:7}.
 */
export interface IntermediateLayoutItem {
  [key: string]: unknown;
  r?: number; rx?: number; ry?: number;
  a?: number; f?: number; f2?: number; fa?: number[];
  p?: string; c?: string; t?: string;
  x?: number; y?: number; w?: number; h?: number;
  x2?: number; y2?: number; w2?: number; h2?: number;
  n?: boolean; l?: boolean; d?: boolean; g?: boolean;
  sm?: string; sb?: string; st?: string;
}

export type RowItem = string | IntermediateLayoutItem;
export type IntermediateRow = RowItem[];
export type IntermediateFormat = IntermediateRow[];

/**
 * Convert a KLELayout to the intermediate array-of-rows format.
 */
export function keyPropsToIntermediate(layout: KLELayout): IntermediateFormat {
  const { meta, keys } = layout;
  const rows: IntermediateFormat = [];

  // Include metadata as first element if non-default
  const metaObj: Partial<KLEMeta> = {};
  if (meta.name && meta.name !== DEFAULT_META.name) metaObj.name = meta.name;
  if (meta.backcolor && meta.backcolor !== DEFAULT_META.backcolor) metaObj.backcolor = meta.backcolor;
  if (meta.background) metaObj.background = meta.background;
  if (meta.css) metaObj.css = meta.css;
  if (meta.notes) metaObj.notes = meta.notes;
  if (meta.radii) metaObj.radii = meta.radii;
  if (meta.switchMount) metaObj.switchMount = meta.switchMount;
  if (meta.switchBrand) metaObj.switchBrand = meta.switchBrand;
  if (meta.switchType) metaObj.switchType = meta.switchType;
  if (meta.author) metaObj.author = meta.author;

  if (Object.keys(metaObj).length > 0) {
    rows.push([metaObj]);
  }

  // 第一遍：按 y 轴位置稳定排序（无阈值 comparator，保证传递性）。
  // 行内 x 排序在分组后处理（见下方）。
  // 阈值分组由后续 keyRows 分组逻辑完成（0.5 tolerance = KLE 标准约定）。
  const sorted = [...keys].sort((a, b) => a.y - b.y);

  // Group into rows (0.5 tolerance = standard KLE convention).
  // Also split when rotation cluster (r/rx/ry) changes — otherwise,
  // e.g., Ergodox left (r=30,rx=6.5) and right (r=-30,rx=13) thumb
  // clusters at the same y would merge into one row, losing the second
  // cluster's rotation origin.
  const keyRows: KeyProps[][] = [];
  if (sorted.length > 0) {
    const firstKey = sorted[0]!;
    let currentRow = [firstKey];
    let currentY = firstKey.y;
    let currentCluster = { r: firstKey.r, rx: firstKey.rx, ry: firstKey.ry };
    for (let i = 1; i < sorted.length; i++) {
      const k = sorted[i]!;
      const clusterChanged = (k.r ?? 0) !== (currentCluster.r ?? 0) || (k.rx ?? 0) !== (currentCluster.rx ?? 0) || (k.ry ?? 0) !== (currentCluster.ry ?? 0);
      if (Math.abs(k.y - currentY) >= 0.5 || clusterChanged) {
        keyRows.push(currentRow);
        currentRow = [k];
        currentY = k.y;
        currentCluster = { r: k.r, rx: k.rx, ry: k.ry };
      } else {
        currentRow.push(k);
      }
    }
    keyRows.push(currentRow);
  }

  // 第二遍：每行内按 x 排序（让键位从左到右排列，替代不稳定的阈值 comparator）
  for (const row of keyRows) {
    row.sort((a, b) => a.x - b.x);
  }

  // Track sticky state
  let sticky = createDefaultSticky();
  let cluster = { r: 0, rx: 0, ry: 0 };
  let stickyY = sticky.y;
  // Accumulated y position — tracks the default y for the NEXT row.
  // Starts at 0, advances by 1 per row, and carries forward any y offset
  // from rows that emit {y:...}. This matches how intermediateToKeyProps
  // accumulates current.y (row end += 1, {y:...} += offset).
  let accY = 0;

  for (const rowKeys of keyRows) {
    let newRow = true;
    const rowItems: RowItem[] = [];

    for (const key of rowKeys) {
      const props: IntermediateLayoutItem = {};

      // Detect cluster change
      if (newRow) {
        // Reset per-row sticky state — use accY as the default y position.
        // accY already includes any y-offsets carried forward from previous rows.
        stickyY = accY;
        sticky.x = cluster.rx;

        // Update cluster
        if ((key.r ?? 0) !== (cluster.r ?? 0) || (key.rx ?? 0) !== (cluster.rx ?? 0) || (key.ry ?? 0) !== (cluster.ry ?? 0)) {
          if ((key.ry ?? 0) !== (cluster.ry ?? 0) || (key.rx ?? 0) !== (cluster.rx ?? 0)) {
            stickyY = key.ry;
          }
          cluster = { r: key.r, rx: key.rx, ry: key.ry };
          // Emit rotation properties so they survive serialization/round-trip
          if ((key.r ?? 0) !== 0) props["r"] = key.r;
          if ((key.rx ?? 0) !== 0) props["rx"] = key.rx;
          if ((key.ry ?? 0) !== 0) props["ry"] = key.ry;
        }
        newRow = false;
      }

      // y offset — only emitted on the first key of the row (or on cluster change)
      const yDiff = roundKey(key.y - stickyY);
      if (Math.abs(yDiff) > 0.001) {
        props["y"] = yDiff;
        stickyY = key.y;
      }

      // x offset
      const xDiff = roundKey(key.x - sticky.x);
      if (Math.abs(xDiff) > 0.001) {
        props["x"] = xDiff;
      }
      sticky.x = key.x + key.w;

      // Color
      emitPropDiff(props, "c", key.c, sticky.c);
      emitPropDiff(props, "t", key.t, sticky.t);

      // Misc boolean props
      emitPropBoolDiff(props, "g", key.g, sticky.g);
      emitPropBoolDiff(props, "l", key.l, sticky.l);
      emitPropBoolDiff(props, "n", key.n, sticky.n);
      emitPropBoolDiff(props, "d", key.d, sticky.d);

      // Profile
      emitPropDiff(props, "p", key.p, sticky.p);

      // Switch
      emitPropDiff(props, "sm", key.sm, sticky.sm);
      emitPropDiff(props, "sb", key.sb, sticky.sb);
      emitPropDiff(props, "st", key.st, sticky.st);

      // Alignment
      if (key.align !== sticky.align) {
        props["a"] = key.align;
      }

      // Font size (f)
      if (key.labelSize !== sticky.labelSize) {
        props["f"] = key.labelSize;
      }

      // f2/fa — emit both when both present (f2 overrides positions 1-11, fa is full array)
      const hasF2 = key.f2 > 0 && key.f2 !== key.labelSize;
      const hasFa = key.fa && key.fa.length > 0;
      if (hasF2) {
        props["f2"] = key.f2;
      }
      if (hasFa) {
        props["fa"] = key.fa;
      }

      // Size
      emitPropDiffNumber(props, "w", key.w, 1);
      emitPropDiffNumber(props, "h", key.h, 1);
      emitPropDiffNumber(props, "w2", key.w2, 0);
      emitPropDiffNumber(props, "h2", key.h2, 0);
      emitPropDiffNumber(props, "x2", key.x2, 0);
      emitPropDiffNumber(props, "y2", key.y2, 0);

      // Build the label string in serialized format

      // Build the label string in serialized format
      const serialLabels = reorderLabelsFromPositions(key.labels, key.align || DEFAULT_PROPS.align);
      let labelStr = serialLabels.join("\n");

      // Emit props object if non-empty
      if (Object.keys(props).length > 0) {
        rowItems.push(props);
      }

      // Emit label string (always present for keys)
      rowItems.push(labelStr);

      // Update sticky state
      if (props.r !== undefined) sticky.r = props.r as number;
      if (props.rx !== undefined) sticky.rx = props.rx as number;
      if (props.ry !== undefined) sticky.ry = props.ry as number;
      if (props.y !== undefined) {
        sticky.y = stickyY;
        // When a y offset is emitted, also update rowBaseY to track
        // the actual y position for subsequent row baseline calc
      }
      if (props.x !== undefined) sticky.x = key.x + key.w;
      if (props.c !== undefined) sticky.c = props.c as string;
      if (props.t !== undefined) sticky.t = props.t as string;
      if (props.g !== undefined) sticky.g = props.g as boolean;
      if (props.l !== undefined) sticky.l = props.l as boolean;
      if (props.n !== undefined) sticky.n = props.n as boolean;
      if (props.d !== undefined) sticky.d = props.d as boolean;
      if (props.p !== undefined) sticky.p = props.p as string;
      if (props.sm !== undefined) sticky.sm = props.sm as string;
      if (props.sb !== undefined) sticky.sb = props.sb as string;
      if (props.st !== undefined) sticky.st = props.st as string;
      if (props.a !== undefined) sticky.align = props.a as number;
      if (props.f !== undefined) sticky.labelSize = props.f as number;
      if (props.f2 !== undefined) sticky.f2 = props.f2 as number;
      if (props.fa !== undefined) sticky.fa = props.fa as number[];
      if (props.w !== undefined) sticky.w = props.w as number;
      if (props.h !== undefined) sticky.h = props.h as number;
      if (props.w2 !== undefined) sticky.w2 = props.w2 as number;
      if (props.h2 !== undefined) sticky.h2 = props.h2 as number;
      if (props.x2 !== undefined) sticky.x2 = props.x2 as number;
      if (props.y2 !== undefined) sticky.y2 = props.y2 as number;
    }

    // Advance accumulated y by 1 (KLE standard row spacing).
    // stickyY reflects the actual y used for keys in this row (including any
    // {y:...} offset), so accY = stickyY + 1 correctly carries the offset
    // forward. This matches intermediateToKeyProps' current.y += 1 per row.
    accY = stickyY + 1;

    if (rowItems.length > 0) {
      rows.push(rowItems);
    }
  }

  return rows;
}

/**
 * Convert intermediate array-of-rows format to KeyProps[].
 */
function intermediateToKeyProps(intermediate: IntermediateRow[]): KLELayout {
  let current = createDefaultSticky();
  const meta: Partial<KLEMeta> = {};
  let metaExtracted = false;
  const keys: KeyProps[] = [];
  let cluster = { x: 0, y: 0 };
  let align = DEFAULT_PROPS.align;

  for (let r = 0; r < intermediate.length; r++) {
    const row = intermediate[r];

    // Metadata object at start (two forms supported):
    // 1. Bare object:  {name:"..."}  (from legacy/intermediateToJSONFormat)
    // 2. Array-wrapped: [{name:"..."}] (from keyPropsToIntermediate → URLON)
    if (!metaExtracted) {
      if (typeof row === "object" && !Array.isArray(row) && row !== null) {
        // Bare object form
        Object.assign(meta, row);
        metaExtracted = true;
        continue;
      }
      if (Array.isArray(row) && row.length === 1 && typeof row[0] === "object" && row[0] !== null) {
        // Array-wrapped form [metaObj] — check it's not a key-prop object
        const obj = row[0] as Partial<KLEMeta>;
        const objKeys = Object.keys(obj);
        const hasOnlyKeyProps = objKeys.length > 0 && objKeys.every(k => KLE_KEY_PROPS.has(k));
        if (!hasOnlyKeyProps) {
          Object.assign(meta, obj);
          metaExtracted = true;
          continue;
        }
      }
    }

    if (!Array.isArray(row)) continue;

    for (let k = 0; k < row.length; k++) {
      const item = row[k];

      if (typeof item === "string") {
        // Create key with current properties
        const key: KeyProps = { ...DEFAULT_PROPS };

        // Position
        key.x = roundKey(current.x);
        key.y = roundKey(current.y);
        key.w = current.w as number;
        key.h = current.h as number;
        key.x2 = current.x2 as number;
        key.y2 = current.y2 as number;
        key.w2 = (current.w2 as number) || 0;
        key.h2 = (current.h2 as number) || 0;
        key.r = current.r as number;
        key.rx = current.rx as number;
        key.ry = current.ry as number;

        // Labels — parse from serialized format
        const serialLabels = item.split("\n");
        const mappedLabels = reorderLabelsToPositions(serialLabels, align);
        key.labels = mappedLabels;
        key.align = align;

        // Colors
        key.c = (current.c as string) || DEFAULT_PROPS.c;
        key.t = (current.t as string) || DEFAULT_PROPS.t;

        // Text size
        key.labelSize = (current.labelSize as number) || DEFAULT_PROPS.labelSize;

        // f2 — font size override for positions 1-11
        if (current.f2 && (current.f2 as number) > 0) {
          key.f2 = current.f2 as number;
        }

        // fa — full font size array override
        if (current.fa && Array.isArray(current.fa) && (current.fa as number[]).length > 0) {
          key.fa = current.fa as number[];
        }

        // Profile & switches
        key.p = (current.p as string) || "";
        key.d = !!(current.d);
        key.g = !!(current.g);
        key.l = !!(current.l);
        key.n = !!(current.n);
        key.sm = (current.sm as string) || "";
        key.sb = (current.sb as string) || "";
        key.st = (current.st as string) || "";

        keys.push(key);

        // Advance X position
        current.x += key.w;

        // Reset per-key sticky props (matching original KLE $serial.deserialize)
        current.w = 1;
        current.h = 1;
        current.x2 = 0;
        current.y2 = 0;
        current.w2 = 0;
        current.h2 = 0;
        current.n = false;
        current.l = false;
        current.d = false;
        current.g = false;
        current.f2 = 0;
        current.fa = [];

      } else if (typeof item === "object" && item !== null) {
        // Property override object
        const props = item as IntermediateLayoutItem;

        // Rotation (only valid on first key of row)
        if (props.r !== undefined) {
          current.r = props.r as number;
        }
        if (props.rx !== undefined) {
          current.rx = props.rx as number;
          cluster.x = props.rx as number;
          // Rotation center: copy cluster x/y onto current position
          current.x = cluster.x;
          current.y = cluster.y;
        }
        if (props.ry !== undefined) {
          current.ry = props.ry as number;
          cluster.y = props.ry as number;
          // Rotation center alignment
          current.x = cluster.x;
          current.y = cluster.y;
        }

        // Alignment
        if (props.a !== undefined) {
          align = props.a as number;
        }

        // Font size
        if (props.f !== undefined) {
          current.labelSize = props.f as number;
        }
        if (props.f2 !== undefined) {
          current.f2 = props.f2 as number;
        }
        if (props.fa !== undefined) {
          current.fa = props.fa as number[];
        }

        // Profile
        if (props.p !== undefined) {
          current.p = String(props.p);
        }

        // Colors
        if (props.c !== undefined) {
          current.c = String(props.c);
        }
        if (props.t !== undefined) {
          const split = String(props.t).split("\n");
          current.t = split[0] || current.t;
        }

        // Position offsets
        if (props.x !== undefined) {
          current.x = current.x + (props.x as number);
        }
        if (props.y !== undefined) {
          current.y = current.y + (props.y as number);
        }

        // Size (w2/h2 default to w/h if not explicitly set)
        if (props.w !== undefined) {
          current.w = props.w as number;
        }
        if (props.h !== undefined) {
          current.h = props.h as number;
        }
        if (props.x2 !== undefined) current.x2 = props.x2 as number;
        if (props.y2 !== undefined) current.y2 = props.y2 as number;
        if (props.w2 !== undefined) current.w2 = props.w2 as number;
        if (props.h2 !== undefined) current.h2 = props.h2 as number;

        // Boolean flags
        if (props.n !== undefined) current.n = props.n as boolean;
        if (props.l !== undefined) current.l = props.l as boolean;
        if (props.d !== undefined) current.d = props.d as boolean;
        if (props.g !== undefined) current.g = props.g as boolean;
        if (props.sm !== undefined) current.sm = String(props.sm);
        if (props.sb !== undefined) current.sb = String(props.sb);
        if (props.st !== undefined) current.st = String(props.st);
      }
    }

    // End of row — increment Y, reset X
    current.y += 1;
    current.x = current.rx as number;
  }

  return {
    meta: { ...DEFAULT_META, ...meta } as KLEMeta,
    keys,
  };
}

/* ===== Computed Keys ===== */

/** Compute absolute pixel positions for all keys */
export function computeKeyPositions(keys: KeyProps[]): ComputedKey[] {
  return keys.map((props, i) => ({
    id: `key-${i}`,
    absX: props.x,
    absY: props.y,
    props,
  }));
}

/** Get pixel dimensions for a key */
export function getKeyPixelSize(w: number, h: number): { pxW: number; pxH: number } {
  return {
    pxW: w * KEY_UNIT - KEY_GAP * 2,
    pxH: h * KEY_UNIT - KEY_GAP * 2,
  };
}

/** Create a CSS transform string for rotated keys */
export function getKeyTransform(r: number, rx: number, ry: number, elementLeft?: number, elementTop?: number): React.CSSProperties {
  if (!r) return {};
  // When element position is known, compute transform-origin RELATIVE to the element.
  // The canvas rotation center is (rx * KEY_UNIT + KEY_UNIT/2, ry * KEY_UNIT + KEY_UNIT/2).
  // CSS transform-origin with px values is relative to the element's top-left corner.
  if (elementLeft !== undefined && elementTop !== undefined) {
    return {
      transform: `rotate(${r}deg)`,
      transformOrigin: `${rx * KEY_UNIT + KEY_UNIT / 2 - elementLeft}px ${ry * KEY_UNIT + KEY_UNIT / 2 - elementTop}px`,
    };
  }
  // Fallback (absolute canvas origin — used where element position is unknown)
  return {
    transform: `rotate(${r}deg)`,
    transformOrigin: `${rx * KEY_UNIT + KEY_UNIT / 2}px ${ry * KEY_UNIT + KEY_UNIT / 2}px`,
  };
}

/* ===== Internal Helpers ===== */

/** Typed sticky state matching what $serial.serialize tracks */
interface StickyState {
  x: number; y: number;
  w: number; h: number;
  x2: number; y2: number;
  w2: number; h2: number;
  r: number; rx: number; ry: number;
  c: string; t: string;
  p: string;
  d: boolean; g: boolean; l: boolean; n: boolean;
  sm: string; sb: string; st: string;
  align: number;
  labelSize: number;
  f2: number;
  fa: number[];
}

function createDefaultSticky(): StickyState {
  return {
    x: 0, y: 0, w: 1, h: 1, x2: 0, y2: 0, w2: 0, h2: 0,
    r: 0, rx: 0, ry: 0,
    c: DEFAULT_PROPS.c, t: DEFAULT_PROPS.t,
    p: "",
    d: false, g: false, l: false, n: false,
    sm: "", sb: "", st: "",
    align: DEFAULT_PROPS.align,
    labelSize: DEFAULT_PROPS.labelSize,
    f2: 0,
    fa: [],
  };
}

function roundKey(v: number): number {
  return Math.round(v * 100) / 100;
}

function emitPropDiff(props: IntermediateLayoutItem, name: string, newVal: unknown, oldVal: unknown, clusterVal?: unknown) {
  if (clusterVal !== undefined) {
    // For cluster props, compare to cluster value
    if (String(newVal) !== String(clusterVal)) {
      props[name] = newVal;
    }
  } else if (String(newVal) !== String(oldVal)) {
    props[name] = newVal;
  }
}

function emitPropBoolDiff(props: IntermediateLayoutItem, name: string, newVal: boolean, oldVal: boolean) {
  if (newVal !== oldVal) {
    props[name] = newVal;
  }
}

function emitPropDiffNumber(props: IntermediateLayoutItem, name: string, newVal: number, defaultVal: number) {
  if (Math.abs(newVal - defaultVal) > 0.001) {
    props[name] = newVal;
  }
}

/** Parse a URL hash fragment to get just the raw data portion */
export function parseHashFragment(hash: string): string {
  if (!hash) return "";
  const cleaned = hash.replace(/^#\/?/, "");
  // Format: ##RAWDATA or #/##RAWDATA
  const hashIndex = cleaned.indexOf("##");
  if (hashIndex >= 0) {
    return cleaned.slice(hashIndex + 2);
  }
  // L4 修复：返回前做基础 URLON 结构检查，非 KLE hash 返回空
  if (!isValidRawData(cleaned)) return "";
  return cleaned;
}

/**
 * Check if a string looks like valid KLE raw data (URLON 格式)
 * KLE URLON 特征：数组嵌套 `(...)`、分隔符 `~`、key-value `:`
 * L5 修复：加强结构匹配，不只是包含 @@ 或 ;
 */
export function isValidRawData(str: string): boolean {
  if (!str || str.length < 3) return false;
  // KLE URLON 数据最外层以 `(` 开头且包含 `~` 分隔符
  if (/^\(/.test(str) && /~/.test(str)) return true;
  // 纯 JSON 数组格式 `[["key"`（CLEAN 格式旧版解析数据）
  if (/^\[\[/.test(str)) return true;
  // 包含 KLE 标准分隔符
  if (str.includes("@@") || str.includes(";")) return true;
  return false;
}

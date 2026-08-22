// === Keyboard Layout Data Model ===

/** 12 label positions of the keyboard layout data format:
 *  0=top-left,     1=top-center,    2=top-right,
 *  3=center-left,  4=center-center, 5=center-right,
 *  6=bottom-left,  7=bottom-center, 8=bottom-right,
 *  9=front-center, 10=front-left,   11=front-right
 */
export const LABEL_POSITIONS = 12;

/** Alignment modes (a:0~a:7) — maps serialized label array indices to normalized positions */
export const LABEL_ALIGN_MAP: Record<number, number[]> = {
  0: [0, 6, 2, 8, 9, 11, 3, 5, 1, 4, 7, 10],
  1: [1, 7, -1, -1, 9, 11, 4, -1, -1, -1, -1, 10],
  2: [3, -1, 5, -1, 9, 11, -1, -1, 4, -1, -1, 10],
  3: [4, -1, -1, -1, 9, 11, -1, -1, -1, -1, -1, 10],
  4: [0, 6, 2, 8, 10, -1, 3, 5, 1, 4, 7, -1],
  5: [1, 7, -1, -1, 10, -1, 4, -1, -1, -1, -1, -1],
  6: [3, -1, 5, -1, 10, -1, -1, -1, 4, -1, -1, -1],
  7: [10, 11, -1, -1, 9, -1, -1, -1, -1, -1, -1, -1],
};

export const DEFAULT_ALIGN = 4;

/** Map serialized label array to 12 normalized positions using alignment mode */
export function reorderLabelsToPositions(serialLabels: string[], align: number): string[] {
  const map = (LABEL_ALIGN_MAP[align] ?? LABEL_ALIGN_MAP[DEFAULT_ALIGN])!;
  const result = new Array(LABEL_POSITIONS).fill("");
  for (let i = 0; i < Math.min(serialLabels.length, LABEL_POSITIONS); i++) {
    const targetIdx = map[i]!;
    if (targetIdx >= 0) {
      result[targetIdx] = serialLabels[i] || "";
    }
  }
  return result;
}

/** Convert 12-position labels back to serialized order for export */
export function reorderLabelsFromPositions(normalized: string[], align: number): string[] {
  const map = (LABEL_ALIGN_MAP[align] ?? LABEL_ALIGN_MAP[DEFAULT_ALIGN])!;
  const result: string[] = [];
  for (let serialIdx = 0; serialIdx < LABEL_POSITIONS; serialIdx++) {
    const normIdx = map[serialIdx]!;
    if (normIdx >= 0 && normIdx < normalized.length) {
      result.push(normalized[normIdx] || "");
    }
  }
  // Remove trailing empty strings
  while (result.length > 0 && result[result.length - 1] === "") {
    result.pop();
  }
  return result;
}

/** Get the primary label text (best single-line representation) */
export function getPrimaryLabel(labels: string[] | undefined): string {
  if (!labels || labels.length < 12) return "";
  return labels[4] || labels[1] || labels[0] || labels[7] || "";
}

/** Maximum hex color chars in #rrggbb format */
const MAX_HEX_LEN = 6;

/**
 * Parse an optional color tag prefix from a label string.
 * KLE format: "#ff0000:Hello" → { text: "Hello", color: "#ff0000" }
 * Without color tag: "Hello" → { text: "Hello", color: null }
 * Escaped: "##Hello" → { text: "#Hello", color: null } (## at start = literal #)
 */
export function parseLabelColor(raw: string): { text: string; color: string | null } {
  if (!raw || raw.length < 2) return { text: raw, color: null };

  // ## at start = literal #
  if (raw.startsWith("##")) {
    return { text: raw.slice(1), color: null };
  }

  // #xxx...: pattern
  if (raw.startsWith("#")) {
    const colonIdx = raw.indexOf(":", 1);
    if (colonIdx > 1 && colonIdx <= 1 + MAX_HEX_LEN + 1) {
      const hexPart = raw.slice(1, colonIdx);
      // Validate hex color: #rgb or #rrggbb
      if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(hexPart)) {
        const fullHex = hexPart.length === 3
          ? `#${hexPart[0]}${hexPart[0]}${hexPart[1]}${hexPart[1]}${hexPart[2]}${hexPart[2]}`
          : `#${hexPart}`;
        return { text: raw.slice(colonIdx + 1), color: fullHex };
      }
    }
  }

  return { text: raw, color: null };
}

/** Single key property set (matches KLE raw data format) */
export interface KeyProps {
  /** 12-position labels array */
  labels: string[];
  /** Label alignment mode (0-7), default 4 */
  align: number;
  /** Legend size 0-9 (0=auto) */
  labelSize: number;
  /** Font size override for position 0 (default textSize), matches KLE "f" */
  f2: number;
  /** Font size array override for all 12 positions, matches KLE "fa" */
  fa: number[];
  /** X position offset (in key units, relative) */
  x: number;
  /** Y position offset */
  y: number;
  /** Width in key units */
  w: number;
  /** Height in key units */
  h: number;
  /** X2 offset (non-rectangular keys) */
  x2: number;
  /** Y2 offset */
  y2: number;
  /** W2 width (non-rectangular keys, second segment) */
  w2: number;
  /** H2 height (non-rectangular keys, second segment) */
  h2: number;
  /** Rotation angle in degrees */
  r: number;
  /** Rotation origin X */
  rx: number;
  /** Rotation origin Y */
  ry: number;
  /** Background color */
  c: string;
  /** Text color (can be overridden per-label via #rrggbb: prefix) */
  t: string;
  /** Per-position text color (normalized 0-11), overrides t when set */
  textColor: string[];
  /** Per-position font size index 1-9 (normalized 0-11), 0=use default labelSize */
  textSize: number[];
  /** Font index (0-9) */
  f: number;
  /** Key profile (SA, DSA, OEM, etc.) */
  p: string;
  /** Decal key (decorative only) */
  d: boolean;
  /** Ghosted (transparent outline) */
  g: boolean;
  /** Stepped (Caps Lock style) */
  l: boolean;
  /** Homing bump */
  n: boolean;
  /** Switch mount */
  sm: string;
  /** Switch brand */
  sb: string;
  /** Switch type */
  st: string;
  /** Stabilizer type */
  stab: string;
}

/** Default key properties */
export const DEFAULT_PROPS: KeyProps = {
  labels: Array(12).fill(""), align: DEFAULT_ALIGN, labelSize: 3,
  x: 0, y: 0, w: 1, h: 1, x2: 0, y2: 0, w2: 0, h2: 0,
  r: 0, rx: 0, ry: 0,
  c: "#c8c8c8", t: "#000000",
  textColor: [], textSize: [], f: 3, f2: 0, fa: [],
  p: "", d: false, g: false, l: false, n: false,
  sm: "", sb: "", st: "", stab: "",
};

/** Set of all key property names used to distinguish key props from meta objects */
export const KLE_KEY_PROPS = new Set([
  "r", "rx", "ry", "x", "y", "w", "h", "x2", "y2", "w2", "h2",
  "a", "f", "f2", "fa", "p", "c", "t", "d", "g", "l", "n", "sm", "sb", "st", "stab",
]);

/** A fully computed key with absolute pixel positions */
export interface ComputedKey {
  id: string;
  /** Absolute X in key units */
  absX: number;
  /** Absolute Y in key units */
  absY: number;
  props: KeyProps;
}

/** Keyboard metadata */
export interface KLEMeta {
  name: string;
  author: string;
  backcolor: string;
  background: string;
  notes: string;
  radii: string;
  switchMount: string;
  switchBrand: string;
  switchType: string;
  css: string;
}

/** Font size scale (index 0-9) */
export const KLE_FONT_SIZES = [8, 10, 11, 13, 15, 17, 20, 26, 30, 36];

/**
 * Build reverse alignment map: for each normalized position (0-11),
 * return its serial index, or -1 if not mapped.
 */
export function reverseAlignMap(align: number): number[] {
  const map = (LABEL_ALIGN_MAP[align] ?? LABEL_ALIGN_MAP[DEFAULT_ALIGN])!;
  const rev = new Array(12).fill(-1);
  for (let serialIdx = 0; serialIdx < 12; serialIdx++) {
    const normIdx = map[serialIdx]!;
    if (normIdx >= 0 && normIdx < 12) rev[normIdx] = serialIdx;
  }
  return rev;
}

/** Get font size (px) for a normalized label position, respecting f/fa/f2 */
export function getLabelFontSize(key: KeyProps, pos: number): number {
  const baseIdx = Math.min(key.labelSize ?? 3, 9);
  const baseSize = KLE_FONT_SIZES[baseIdx]!;
  // textSize[pos] — per-position override (highest precedence, matches KLE's textSize array)
  if (key.textSize && key.textSize[pos]) {
    const ts = key.textSize[pos];
    if (ts > 0) return KLE_FONT_SIZES[Math.min(ts, 9)]!;
  }
  // fa overrides by serial index
  if (key.fa && key.fa.length > 0) {
    const rev = reverseAlignMap(key.align);
    const serialIdx = rev[pos]!;
    if (serialIdx >= 0 && serialIdx < key.fa.length) {
      const faVal = key.fa[serialIdx]!;
      if (faVal > 0) return (KLE_FONT_SIZES[Math.min(faVal, 9)] || baseSize)!;
    }
  }
  // f2 overrides serial position 0 (first label in the serialized label string).
  // Check if this normalized position maps to serial index 0 via reverseAlignMap.
  // Using reverseAlignMap is safe: for align=4 (the default), rev[0] === 0,
  // so the behavior for common ANSI/ISO layouts is identical.
  if (key.f2 > 0) {
    const rev = reverseAlignMap(key.align);
    if (rev[pos] === 0) {
      return (KLE_FONT_SIZES[Math.min(key.f2, 9)] || baseSize)!;
    }
  }
  // Front labels (positions 9-11) default smaller
  if (pos >= 9) return Math.min(baseSize, 10);
  return baseSize;
}

export const DEFAULT_META: KLEMeta = {
  name: "Untitled",
  author: "",
  backcolor: "#ffffff",
  background: "",
  notes: "",
  radii: "",
  switchMount: "",
  switchBrand: "",
  switchType: "",
  css: "",
};

/** Complete layout */
export interface KLELayout {
  meta: KLEMeta;
  keys: KeyProps[];
  /** Original intermediate row data (array-of-rows format).
   *  Set on import/parse; used for perfect round-trip export.
   *  Cleared on editor mutations (falls back to keyPropsToIntermediate). */
  _sourceCache?: unknown[];
}

/** Reducer action types */
export type EditorAction =
  | { type: "LOAD_LAYOUT"; layout: KLELayout }
  | { type: "SET_SELECTION"; ids: string[] }
  | { type: "TOGGLE_SELECTION"; id: string }
  | { type: "CLEAR_SELECTION" }
  | { type: "MOVE_KEYS"; dx: number; dy: number }
  | { type: "SET_PROP"; ids: string[]; prop: keyof KeyProps; value: unknown }
  | { type: "SET_META"; meta: Partial<KLEMeta> }
  | { type: "ADD_KEYS"; count: number }
  | { type: "ADD_SPECIAL_KEY"; props: Partial<KeyProps> }
  | { type: "DELETE_SELECTED" }
  | { type: "MOVE_SELECTED"; dx: number; dy: number }
  | { type: "COPY_SELECTED" }
  | { type: "CUT_SELECTED" }
  | { type: "PASTE"; rawData?: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "MARK_CLEAN" };

export interface UndoSnapshot {
  layout: KLELayout;
  selectedIds: string[];
}

export interface EditorState {
  layout: KLELayout;
  selectedIds: string[];
  clipboard: KeyProps[] | null;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  isDirty: boolean;
}

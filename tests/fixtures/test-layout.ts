/**
 * Test fixture: Standard 60% ANSI keyboard layout (KeyProps[])
 *
 * Directly constructs a KeyProps[] array for a typical 60% keyboard,
 * covering 5 rows with standard keys and modifier keys.
 *
 * Row 1 (15 keys): Esc, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, -, =, Backspace(2u)
 * Row 2 (14 keys): Tab(1.5u), Q, W, E, R, T, Y, U, I, O, P, [, ], \(1.5u)
 * Row 3 (13 keys): Caps Lock(1.75u), A, S, D, F, G, H, J, K, L, ;, ', Enter(2.25u)
 * Row 4 (12 keys): Shift(2.25u), Z, X, C, V, B, N, M, ,, ., /, Shift(2.75u)
 * Row 5 ( 8 keys): Ctrl(1.25u), Win(1.25u), Alt(1.25u), Space(6.25u),
 *                   Alt(1.25u), Win(1.25u), Menu(1.25u), Ctrl(1.25u)
 */

import type { KeyProps } from '@/lib/kle-types';

/**
 * Create a labels array from a text string.
 * Places the text at position 4 (center-center) for single-line labels,
 * and splits multi-line labels (e.g. "!\n1") across positions 0 (top) and 4 (center).
 */
function makeLabels(text: string): string[] {
  const labels = new Array(12).fill('');
  if (!text) return labels;

  const lines = text.split('\n');
  if (lines.length === 1) {
    labels[4] = text; // center-center
  } else if (lines.length >= 2) {
    labels[0] = lines[0]; // top-left
    labels[4] = lines[1]; // center-center
  }
  return labels;
}

/**
 * Build a single KeyProps object with overrides on top of defaults.
 */
function key(
  label: string,
  overrides: Partial<KeyProps> = {},
): KeyProps {
  return {
    labels: makeLabels(label),
    align: label ? 4 : 7, // 4=default multi-label, 7=bottom-only (spacebar style)
    labelSize: 3,
    f2: 0,
    fa: [],
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    x2: 0,
    y2: 0,
    w2: 0,
    h2: 0,
    r: 0,
    rx: 0,
    ry: 0,
    c: '#cccccc',
    t: '#000000',
    textColor: [],
    textSize: [],
    f: 3,
    p: '',
    d: false,
    g: false,
    l: false,
    n: false,
    sm: '',
    sb: '',
    st: '',
    stab: '',
    ...overrides,
  };
}

/**
 * Build a row of keys, tracking x/y positions.
 *
 * @param items - Array of [label, width] or [label, width, y] tuples
 * @param startY - Y position for this row
 */
function row(
  items: Array<[string, number] | [string, number, number]>,
  startY: number,
): KeyProps[] {
  let curX = 0;
  return items.map(([label, width, yOverride]) => {
    const k = key(label, {
      x: curX,
      y: yOverride ?? startY,
      w: width,
      align: label ? 4 : 7,
    });
    curX += width;
    return k;
  });
}

// ============================================================
// 60% ANSI Layout Definition
// ============================================================

const ROW_1: Array<[string, number]> = [
  ['Esc', 1],
  ['!\n1', 1],
  ['@\n2', 1],
  ['#\n3', 1],
  ['$\n4', 1],
  ['%\n5', 1],
  ['^\n6', 1],
  ['&\n7', 1],
  ['*\n8', 1],
  ['(\n9', 1],
  [')\n0', 1],
  ['_\n-', 1],
  ['+\n=', 1],
  ['Backspace', 2],
];

const ROW_2: Array<[string, number]> = [
  ['Tab', 1.5],
  ['Q', 1],
  ['W', 1],
  ['E', 1],
  ['R', 1],
  ['T', 1],
  ['Y', 1],
  ['U', 1],
  ['I', 1],
  ['O', 1],
  ['P', 1],
  ['{\n[', 1],
  ['}\n]', 1],
  ['|\n\\', 1.5],
];

const ROW_3: Array<[string, number]> = [
  ['Caps Lock', 1.75],
  ['A', 1],
  ['S', 1],
  ['D', 1],
  ['F', 1],
  ['G', 1],
  ['H', 1],
  ['J', 1],
  ['K', 1],
  ['L', 1],
  [':\n;', 1],
  ['"\n\'', 1],
  ['Enter', 2.25],
];

const ROW_4: Array<[string, number]> = [
  ['Shift', 2.25],
  ['Z', 1],
  ['X', 1],
  ['C', 1],
  ['V', 1],
  ['B', 1],
  ['N', 1],
  ['M', 1],
  ['<\n,', 1],
  ['>\n.', 1],
  ['?\n/', 1],
  ['Shift', 2.75],
];

const ROW_5: Array<[string, number]> = [
  ['Ctrl', 1.25],
  ['Win', 1.25],
  ['Alt', 1.25],
  ['', 6.25],     // Spacebar
  ['Alt', 1.25],
  ['Win', 1.25],
  ['Menu', 1.25],
  ['Ctrl', 1.25],
];

/** Lazy-built cache */
let _keys: KeyProps[] | null = null;

/**
 * Return a KeyProps[] array for a standard 60% ANSI keyboard layout.
 * Cached after first call.
 *
 * Key properties use relative x/y positioning:
 *   - x: cumulative horizontal offset from row start
 *   - y: row index (0-based)
 *   - w: key width in key units (1u = standard)
 */
export function get60PercentANSILayout(): KeyProps[] {
  if (_keys) return _keys;

  // Assign cumulative X and row Y for each row
  const allRows: KeyProps[][] = [
    row(ROW_1, 0),
    row(ROW_2, 0),
    row(ROW_3, 0),
    row(ROW_4, 0),
    row(ROW_5, 0),
  ];

  // Flatten
  _keys = allRows.flat();
  return _keys!;
}

// ============================================================
// Layout statistics
// ============================================================

/** Row key counts */
export const ANSI_60_ROW_COUNTS: number[] = [
  ROW_1.length,  // 14
  ROW_2.length,  // 14
  ROW_3.length,  // 13
  ROW_4.length,  // 12
  ROW_5.length,  // 8
];

/** Total key count */
export const ANSI_60_TOTAL_KEYS: number =
  ROW_1.length + ROW_2.length + ROW_3.length + ROW_4.length + ROW_5.length;

/** Modifier key labels by row index */
export const MODIFIER_LABELS_BY_ROW: Record<number, string[]> = {
  0: ['Esc', 'Backspace'],
  1: ['Tab'],
  2: ['Caps Lock', 'Enter'],
  3: ['Shift', 'Shift'],
  4: ['Ctrl', 'Win', 'Alt', 'Alt', 'Win', 'Menu', 'Ctrl'],
};

/** All modifier keys (wider than 1u) across the layout */
export function getModifierKeys(keys?: KeyProps[]): KeyProps[] {
  const k = keys ?? get60PercentANSILayout();
  return k.filter((key) => key.w > 1);
}

/** Standard 1u keys */
export function getStandardKeys(keys?: KeyProps[]): KeyProps[] {
  const k = keys ?? get60PercentANSILayout();
  return k.filter((key) => key.w === 1);
}

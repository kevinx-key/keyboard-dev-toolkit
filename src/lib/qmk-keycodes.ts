/**
 * QMK Keycode 映射 — 从键帽图例（KLE label）推导 QMK 键值。
 *
 * 规则：
 *   - 图例取「键帽打印的基础键」，例如数字行 1 键的图例可能是 "!" 与 "1"，
 *     两者都映射到 KC_1（不会输出 KC_EXLM / KC_!）。
 *   - 左右成对的修饰键（Shift/Ctrl/Alt/GUI）按物理位置（键盘中线）判定 L/R。
 *   - 图例为空且为空格键尺寸（w≥5）时回退 KC_SPC。
 *   - 无法识别时输出 KC_NO（并在矩阵页给出警告）。
 */

import type { KeyProps } from "./kle-types";
import { parseLabelColor } from "./kle-types";

/** 单字符（含大小写字母/数字/Shift 符号）→ 基础 QMK 键值。 */
const CHAR_MAP: Record<string, string> = {
  // 字母
  a: "KC_A", b: "KC_B", c: "KC_C", d: "KC_D", e: "KC_E", f: "KC_F", g: "KC_G",
  h: "KC_H", i: "KC_I", j: "KC_J", k: "KC_K", l: "KC_L", m: "KC_M", n: "KC_N",
  o: "KC_O", p: "KC_P", q: "KC_Q", r: "KC_R", s: "KC_S", t: "KC_T", u: "KC_U",
  v: "KC_V", w: "KC_W", x: "KC_X", y: "KC_Y", z: "KC_Z",
  // 数字
  "0": "KC_0", "1": "KC_1", "2": "KC_2", "3": "KC_3", "4": "KC_4",
  "5": "KC_5", "6": "KC_6", "7": "KC_7", "8": "KC_8", "9": "KC_9",
  // 数字行 Shift 符号 → 对应基础数字键
  "!": "KC_1", "@": "KC_2", "#": "KC_3", $: "KC_4", "%": "KC_5",
  "^": "KC_6", "&": "KC_7", "*": "KC_8", "(": "KC_9", ")": "KC_0",
  // 标点（含 Shift 变体）
  "`": "KC_GRV", "~": "KC_GRV",
  "-": "KC_MINS", _: "KC_MINS",
  "=": "KC_EQL", "+": "KC_EQL",
  "[": "KC_LBRC", "{": "KC_LBRC",
  "]": "KC_RBRC", "}": "KC_RBRC",
  "\\": "KC_BSLS", "|": "KC_BSLS",
  ";": "KC_SCLN", ":": "KC_SCLN",
  "'": "KC_QUOT", '"': "KC_QUOT",
  ",": "KC_COMM", "<": "KC_COMM",
  ".": "KC_DOT", ">": "KC_DOT",
  "/": "KC_SLSH", "?": "KC_SLSH",
  // 方向箭头
  "↑": "KC_UP", "↓": "KC_DOWN", "←": "KC_LEFT", "→": "KC_RGHT",
};

/** 命名键（图例已规范化：小写、去空白、去 <br> 等）。 */
const NAMED_MAP: Record<string, string> = {
  esc: "KC_ESC", escape: "KC_ESC",
  tab: "KC_TAB",
  "caps lock": "KC_CAPS", capslock: "KC_CAPS", caps: "KC_CAPS",
  enter: "KC_ENT", return: "KC_ENT", "↵": "KC_ENT",
  backspace: "KC_BSPC", backspacebar: "KC_BSPC", bksp: "KC_BSPC", "⌫": "KC_BSPC",
  space: "KC_SPC", spacebar: "KC_SPC",
  delete: "KC_DEL", del: "KC_DEL",
  insert: "KC_INS", ins: "KC_INS",
  home: "KC_HOME", end: "KC_END",
  pgup: "KC_PGUP", pageup: "KC_PGUP", "page up": "KC_PGUP", prior: "KC_PGUP",
  pgdn: "KC_PGDN", pagedown: "KC_PGDN", "page down": "KC_PGDN", next: "KC_PGDN",
  prtsc: "KC_PSCR", printscreen: "KC_PSCR", "print screen": "KC_PSCR", "prt sc": "KC_PSCR",
  "scroll lock": "KC_SCRL", scrolllock: "KC_SCRL",
  pause: "KC_PAUSE", "pause break": "KC_PAUSE", break: "KC_PAUSE",
  "num lock": "KC_NUM", numlock: "KC_NUM",
  menu: "KC_APP", app: "KC_APP", application: "KC_APP",
  altgr: "KC_RALT", "alt gr": "KC_RALT",
  fn: "MO(1)", "fn1": "MO(1)", mo: "MO(1)",
  up: "KC_UP", down: "KC_DOWN", left: "KC_LEFT", right: "KC_RGHT",
  volup: "KC_VOLU", "volume up": "KC_VOLU",
  voldown: "KC_VOLD", "volume down": "KC_VOLD",
  mute: "KC_MUTE",
  play: "KC_MPLY", playpause: "KC_MPLY",
  next_track: "KC_MNXT", "next track": "KC_MNXT",
  prev_track: "KC_MPRV", "prev track": "KC_MPRV",
};

/** 修饰键（左右成对），按物理位置判定。 */
const SIDE_KEYS: Record<string, { left: string; right: string }> = {
  shift: { left: "KC_LSFT", right: "KC_RSFT" },
  "⇧": { left: "KC_LSFT", right: "KC_RSFT" },
  shft: { left: "KC_LSFT", right: "KC_RSFT" },
  ctrl: { left: "KC_LCTL", right: "KC_RCTL" },
  control: { left: "KC_LCTL", right: "KC_RCTL" },
  ctl: { left: "KC_LCTL", right: "KC_RCTL" },
  alt: { left: "KC_LALT", right: "KC_RALT" },
  option: { left: "KC_LALT", right: "KC_RALT" },
  win: { left: "KC_LGUI", right: "KC_RGUI" },
  windows: { left: "KC_LGUI", right: "KC_RGUI" },
  super: { left: "KC_LGUI", right: "KC_RGUI" },
  cmd: { left: "KC_LGUI", right: "KC_RGUI" },
  command: { left: "KC_LGUI", right: "KC_RGUI" },
  meta: { left: "KC_LGUI", right: "KC_RGUI" },
  gui: { left: "KC_LGUI", right: "KC_RGUI" },
  "❖": { left: "KC_LGUI", right: "KC_RGUI" },
  "⌘": { left: "KC_LGUI", right: "KC_RGUI" },
};

/** 规范化图例：去颜色前缀、去 HTML 标签（<br> 等）、压缩空白、小写。 */
function normalizeLegend(raw: string): string {
  const text = parseLabelColor(raw).text;
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 单个图例文本 → QMK 键值（不含左右判定）。 */
function legendToKeycode(text: string): string | null {
  if (!text) return null;

  // F1-F24
  const fm = /^f([1-9]|1\d|2[0-4])$/.exec(text);
  if (fm) return `KC_F${fm[1]}`;

  if (NAMED_MAP[text]) return NAMED_MAP[text];
  if (CHAR_MAP[text]) return CHAR_MAP[text];
  return null;
}

/**
 * 从单个按键推导 QMK 键值。
 * @param key      键属性
 * @param isLeft   键中心是否位于键盘左半（用于左右修饰键）
 */
export function keyToKeycode(key: KeyProps, isLeft: boolean): string {
  const labels = key.labels ?? [];
  // 取图例优先级：底部(6) → 中部(4) → 左上(0) → 其余
  const order = [6, 4, 0, 7, 3, 1, 8, 5, 2, 9, 10, 11];
  for (const pos of order) {
    const raw = labels[pos];
    if (!raw) continue;
    const text = normalizeLegend(raw);
    if (!text) continue;

    const side = SIDE_KEYS[text];
    if (side) return isLeft ? side.left : side.right;

    const code = legendToKeycode(text);
    if (code) return code;
  }

  // 空图例的空格键回退
  if ((key.w ?? 1) >= 5) return "KC_SPC";
  return "KC_NO";
}

/** 便捷：判断某键能否解析出有效键值（KC_NO 视为未识别）。 */
export function isResolvedKeycode(code: string): boolean {
  return code !== "KC_NO";
}

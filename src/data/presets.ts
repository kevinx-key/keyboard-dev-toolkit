/**
 * Preset Keyboard Layouts
 * Standard keyboard layouts (ANSI, ISO, ortho, ergo, etc.)
 */

export interface Preset {
  name: string;
  data: unknown[]; // layouts.json format ([[...], [...], ...])
}

/**
 * Extract metadata from complex sample data.
 * Complex samples may have a metadata object at index 0
 * (with backcolor, name, author, css, radii, etc.).
 */
export function extractSampleMeta(data: unknown[], defaultName: string): { meta: Partial<import("../lib/kle-types").KLEMeta>; keyData: unknown[] } {
  if (data.length > 0 && typeof data[0] === "object" && !Array.isArray(data[0])) {
    const metaObj = data[0] as Record<string, unknown>;
    const meta: Partial<import("../lib/kle-types").KLEMeta> = {};
    if (typeof metaObj.name === "string") meta.name = metaObj.name;
    if (typeof metaObj.author === "string") meta.author = metaObj.author;
    if (typeof metaObj.backcolor === "string") meta.backcolor = metaObj.backcolor;
    if (typeof metaObj.radii === "string") meta.radii = metaObj.radii;
    if (typeof metaObj.css === "string") meta.css = metaObj.css;
    if (typeof metaObj.notes === "string") meta.notes = metaObj.notes;
    if (typeof metaObj.switchMount === "string") meta.switchMount = metaObj.switchMount;
    if (typeof metaObj.switchBrand === "string") meta.switchBrand = metaObj.switchBrand;
    if (typeof metaObj.switchType === "string") meta.switchType = metaObj.switchType;
    return { meta, keyData: data.slice(1) };
  }
  return { meta: { name: defaultName }, keyData: data };
}

const RAW_PRESETS: Preset[] = [
  {
    name: "ANSI 104", data: [
      ["Esc", { x: 1 }, "F1", "F2", "F3", "F4", { x: 0.5 }, "F5", "F6", "F7", "F8", { x: 0.5 }, "F9", "F10", "F11", "F12", { x: 0.25 }, "PrtSc", "Scroll Lock", "Pause\nBreak"],
      [{ y: 0.5 }, "~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { w: 2 }, "Backspace", { x: 0.25 }, "Insert", "Home", "PgUp", { x: 0.25 }, "Num Lock", "/", "*", "-"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.5 }, "|\n\\", { x: 0.25 }, "Delete", "End", "PgDn", { x: 0.25 }, "7\nHome", "8\n↑", "9\nPgUp", { h: 2 }, "+"],
      [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'", { w: 2.25 }, "Enter", { x: 3.5 }, "4\n←", "5", "6\n→"],
      [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.75 }, "Shift", { x: 1.25 }, "↑", { x: 1.25 }, "1\nEnd", "2\n↓", "3\nPgDn", { h: 2 }, "Enter"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { a: 7, w: 6.25 }, "", { a: 4, w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl", { x: 0.25 }, "←", "↓", "→", { x: 0.25, w: 2 }, "0\nIns", ".\nDel"],
    ],
  },
  {
    name: "ANSI 104 (big-ass enter)", data: [
      ["Esc", { x: 1 }, "F1", "F2", "F3", "F4", { x: 0.5 }, "F5", "F6", "F7", "F8", { x: 0.5 }, "F9", "F10", "F11", "F12", { x: 0.25 }, "PrtSc", "Scroll Lock", "Pause\nBreak"],
      [{ y: 0.5 }, "~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", "|\n\\", "Back Space", { x: 0.25 }, "Insert", "Home", "PgUp", { x: 0.25 }, "Num Lock", "/", "*", "-"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75, y2: 1 }, "Enter", { x: 0.25 }, "Delete", "End", "PgDn", { x: 0.25 }, "7\nHome", "8\n↑", "9\nPgUp", { h: 2 }, "+"],
      [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'", { x: 5.75 }, "4\n←", "5", "6\n→"],
      [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.75 }, "Shift", { x: 1.25 }, "↑", { x: 1.25 }, "1\nEnd", "2\n↓", "3\nPgDn", { h: 2 }, "Enter"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { a: 7, w: 6.25 }, "", { a: 4, w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl", { x: 0.25 }, "←", "↓", "→", { x: 0.25, w: 2 }, "0\nIns", ".\nDel"],
    ],
  },
  {
    name: "ISO 105", data: [
      ["Esc", { x: 1 }, "F1", "F2", "F3", "F4", { x: 0.5 }, "F5", "F6", "F7", "F8", { x: 0.5 }, "F9", "F10", "F11", "F12", { x: 0.25 }, "PrtSc", "Scroll Lock", "Pause\nBreak"],
      [{ y: 0.5 }, "¬\n`", "!\n1", "\"\n2", "£\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { w: 2 }, "Backspace", { x: 0.25 }, "Insert", "Home", "PgUp", { x: 0.25 }, "Num Lock", "/", "*", "-"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.25, w2: 1.5, h: 2, h2: 1, x: 0.25, x2: -0.25 }, "Enter", { x: 0.25 }, "Delete", "End", "PgDn", { x: 0.25 }, "7\nHome", "8\n↑", "9\nPgUp", { h: 2 }, "+"],
      [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "@\n'", "~\n#", { x: 4.75 }, "4\n←", "5", "6\n→"],
      [{ w: 1.25 }, "Shift", "|\n\\", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.75 }, "Shift", { x: 1.25 }, "↑", { x: 1.25 }, "1\nEnd", "2\n↓", "3\nPgDn", { h: 2 }, "Enter"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", { w: 1.25 }, "AltGr", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl", { x: 0.25 }, "←", "↓", "→", { x: 0.25, w: 2 }, "0\nIns", ".\nDel"],
    ],
  },
  {
    name: "Default 60%", data: [
      ["~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { w: 2 }, "Backspace"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.5 }, "|\n\\"],
      [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'", { w: 2.25 }, "Enter"],
      [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.75 }, "Shift"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { a: 7, w: 6.25 }, "", { a: 4, w: 1.25 }, "Alt", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl"],
    ],
  },
  {
    name: "ISO 60%", data: [
      ["¬\n`", "!\n1", "\"\n2", "£\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { w: 2 }, "Backspace"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { x: 0.25, w: 1.25, h: 2, w2: 1.5, h2: 1, x2: -0.25 }, "Enter"],
      [{ a: 4, w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "@\n'", "~\n#"],
      [{ w: 1.25 }, "Shift", "|\n\\", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.75 }, "Shift"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { a: 7, w: 6.25 }, "", { a: 4, w: 1.25 }, "AltGr", { w: 1.25 }, "Win", { w: 1.25 }, "Menu", { w: 1.25 }, "Ctrl"],
    ],
  },
  {
    name: "JD40", data: [
      ["Esc", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Back<br>Space"],
      [{ w: 1.25 }, "Tab", "A", "S", "D", "F", "G", "H", "J", "K", "L", { w: 1.75 }, "Enter"],
      [{ w: 1.75 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", "<\n.", { w: 1.25 }, "Shift", "Fn"],
      [{ w: 1.25 }, "Hyper", "Super", "Meta", { w: 6.25 }, "", { w: 1.25 }, "Meta", { w: 1.25 }, "Super"],
    ],
  },
  {
    name: "ErgoDox", data: [
      [{ x: 3.5 }, "#\n3", { x: 10.5 }, "*\n8"],
      [{ y: -0.875, x: 2.5 }, "@\n2", { x: 1 }, "$\n4", { x: 8.5 }, "&\n7", { x: 1 }, "(\n9"],
      [{ y: -0.875, x: 5.5 }, "%\n5", "", { x: 4.5 }, "", "^\n6"],
      [{ y: -0.875, w: 1.5 }, "", "!\n1", { x: 14.5 }, ")\n0", { w: 1.5 }, ""],
      [{ y: -0.375, x: 3.5 }, "E", { x: 10.5 }, "I"],
      [{ y: -0.875, x: 2.5 }, "W", { x: 1 }, "R", { x: 8.5 }, "U", { x: 1 }, "O"],
      [{ y: -0.875, x: 5.5 }, "T", { h: 1.5 }, "", { x: 4.5, h: 1.5 }, "", "Y"],
      [{ y: -0.875, w: 1.5 }, "", "Q", { x: 14.5 }, "P", { w: 1.5 }, ""],
      [{ y: -0.375, x: 3.5 }, "D", { x: 10.5 }, "K"],
      [{ y: -0.875, x: 2.5 }, "S", { x: 1 }, "F", { x: 8.5 }, "J", { x: 1 }, "L"],
      [{ y: -0.875, x: 5.5 }, "G", { x: 6.5 }, "H"],
      [{ y: -0.875, w: 1.5 }, "", "A", { x: 14.5 }, ":\n;", { w: 1.5 }, ""],
      [{ y: -0.625, x: 6.5, h: 1.5 }, "", { x: 4.5, h: 1.5 }, ""],
      [{ y: -0.75, x: 3.5 }, "C", { x: 10.5 }, "<\n,"],
      [{ y: -0.875, x: 2.5 }, "X", { x: 1 }, "V", { x: 8.5 }, "M", { x: 1 }, ">\n."],
      [{ y: -0.875, x: 5.5 }, "B", { x: 6.5 }, "N"],
      [{ y: -0.875, w: 1.5 }, "", "Z", { x: 14.5 }, "?\n/", { w: 1.5 }, ""],
      [{ y: -0.375, x: 3.5 }, "", { x: 10.5 }, ""],
      [{ y: -0.875, x: 2.5 }, "", { x: 1 }, "", { x: 8.5 }, "", { x: 1 }, ""],
      [{ y: -0.75, x: 0.5 }, "", "", { x: 14.5 }, "", ""],
      [{ r: 30, rx: 6.5, ry: 4.25, y: -1, x: 1 }, "", ""],
      [{ h: 2 }, "", { h: 2 }, "", ""],
      [{ x: 2 }, ""],
      [{ r: -30, rx: 13, y: -1, x: -3 }, "", ""],
      [{ x: -3 }, "", { h: 2 }, "", { h: 2 }, ""],
      [{ x: -3 }, ""],
    ],
  },
  {
    name: "Atreus", data: [
      [{ r: 10, rx: 1 }, { y: 0.5 }, "Q", { y: -0.25 }, "W", { y: -0.35 }, "E", { y: 0.35 }, "R", { y: 0.35 }, "T"],
      [{ y: -0.1 }, "A", { y: -0.25 }, "S", { y: -0.35 }, "D", { y: 0.35 }, "F", { y: 0.35 }, "G"],
      [{ y: -0.1 }, "Z", { y: -0.25 }, "X", { y: -0.35 }, "C", { y: 0.35 }, "V", { y: 0.35 }, "B"],
      [{ y: -0.1 }, "Esc", { y: -0.25 }, "Tab", { y: -0.35 }, "super", { y: 0.35 }, "Shift", { y: 0.35 }, "Bksp", { y: -0.75, h: 1.5 }, "Ctrl"],
      [{ r: -10, rx: 7, ry: 0.965 }, { y: 0.5 }, "Y", { y: -0.35 }, "U", { y: -0.35 }, "I", { y: 0.35 }, "O", { y: 0.25 }, "P"],
      [{ y: 0.1 }, "H", { y: -0.35 }, "J", { y: -0.35 }, "K", { y: 0.35 }, "L", { y: 0.25 }, ":\n;"],
      [{ y: 0.1 }, "N", { y: -0.35 }, "M", { y: -0.35 }, "<\n,", { y: 0.35 }, ">\n.", { y: 0.25 }, "?\n/"],
      [{ y: -0.65, x: -1, h: 1.5 }, "Alt", { y: 0.75 }, "Space", { y: -0.35 }, "fn", { y: -0.35 }, "_\n-", { y: 0.35 }, "\"\n'", { y: 0.25 }, "Enter"],
    ],
  },
  {
    name: "Planck", data: [
      [{ a: 7 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "Back Space"],
      ["Esc", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
      ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Return"],
      ["", "Ctrl", "Alt", "Super", "&dArr;", { w: 2 }, "", "&uArr;", "&larr;", "&darr;", "&uarr;", "&rarr;"],
    ],
  },
{
    name: "Kinesis Advantage", data: [
      [{ f: 1, w: 0.675, h: 0.85 }, "\nEsc", { x: 0.075, w: 0.675, h: 0.85 }, "\nF1", { x: 0.075, w: 0.675, h: 0.85 }, "\nF2", { x: 0.075, w: 0.675, h: 0.85 }, "\nF3", { x: 0.075, w: 0.675, h: 0.85 }, "\nF4", { x: 0.075, w: 0.675, h: 0.85 }, "\nF5", { x: 0.075, w: 0.675, h: 0.85 }, "\nF6", { x: 0.075, w: 0.675, h: 0.85 }, "\nF7", { x: 0.075, w: 0.675, h: 0.85 }, "\nF8"],
      [{ x: 7.075, w: 0.675, h: 0.85 }, "Repeat Rate\nF9", { x: 0.075, w: 0.675, h: 0.85 }, "Disable Macro\nF10", { x: 0.075, w: 0.675, h: 0.85 }, "Macro\nF11", { x: 0.075, w: 0.675, h: 0.85 }, "Remap\nF12", { x: 0.075, w: 0.675, h: 0.85 }, "PrintScr SysReq"],
      [{ x: 2.25, f: 3 }, "@\n2", "#\n3", "$\n4", "%\n5", { x: 5.5 }, "^\n6", "&\n7\n\n\nNm Lk", "*\n8\n\n\n=", "(\n9\n\n\n="],
      [{ y: -0.75, w: 1.25 }, "+\n=", "!\n1", { x: 13.5 }, ")\n0\n\n\n*", { w: 1.25 }, "_\n-"],
      [{ y: -0.25, x: 2.25, f: 6 }, "W", "E", "R", "T", { x: 5.5 }, "Y", "U\n\n\n\n7", "I\n\n\n\n8", "O\n\n\n\n9"],
      [{ y: -0.75, f: 3, w: 1.25 }, "\n\n\n\n\n\nTab", { f: 6 }, "Q", { x: 13.5 }, "P\n\n\n\n-", { f: 3, w: 1.25 }, "|\n\\"],
      [{ y: -0.25, x: 2.25, f: 6 }, "S", "D", "F", "G", { x: 5.5 }, "H", "J\n\n\n\n4", "K\n\n\n\n5", "L\n\n\n\n6"],
      [{ y: -0.75, f: 3, w: 1.25 }, "\n\n\n\n\n\nCaps<br>Lock", { f: 6 }, "A", { x: 13.5, f: 3 }, ":\n;\n\n\n+", { w: 1.25 }, "\"\n'"],
      [{ y: -0.25, x: 2.25, f: 6 }, "X", "C", "V", "B", { x: 5.5 }, "N", "M\n\n\n\n1", { f: 3 }, "<\n,\n\n\n2", ">\n.\n\n\n3"],
      [{ y: -0.75, w: 1.25 }, "\n\n\n\n\n\nShift", { f: 6 }, "Z", { x: 13.5, f: 3 }, "?\n/\n\n\nEnter", { w: 1.25 }, "\n\n\n\n\n\nShift"],
    ],
  },
  {
    name: "Keycool 84", data: [
      [{ a: 6 }, "Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", { a: 5 }, "PrtSc\nNmLk", "Pause\nScrLk", "Delete\nInsert"],
      [{ a: 4 }, "~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { a: 6, w: 2 }, "Backspace", "Home"],
      [{ a: 4, w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.5 }, "|\n\\", { a: 6 }, "Page Up"],
      [{ a: 4, w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'", { a: 6, w: 2.25 }, "Enter", "Page Down"],
      [{ w: 2.25 }, "Shift", { a: 4 }, "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { a: 6, w: 1.75 }, "Shift", { a: 7 }, "↑", { a: 6 }, "End"],
      [{ w: 1.25 }, "Ctrl", { w: 1.25 }, "Win", { w: 1.25 }, "Alt", { w: 6.25 }, "", "Alt", "Fn", "Ctrl", { a: 7 }, "←", "↓", "→"],
    ],
  },
  {
    name: "Leopold FC660m", data: [
      ["~\n`", "!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0", "_\n-", "+\n=", { w: 2 }, "Backspace", { x: 0.5 }, "Insert"],
      [{ w: 1.5 }, "Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "{\n[", "}\n]", { w: 1.5 }, "|\n\\", { x: 0.5 }, "Delete"],
      [{ w: 1.75 }, "Caps Lock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ":\n;", "\"\n'", { w: 2.25 }, "Enter"],
      [{ w: 2.25 }, "Shift", "Z", "X", "C", "V", "B", "N", "M", "<\n,", ">\n.", "?\n/", { w: 2.25 }, "Shift", "↑"],
      [{ w: 1.25 }, "Ctrl", "Win", { w: 1.25 }, "Alt", { a: 7, w: 6.25 }, "", { a: 4, w: 1.25 }, "Alt", { w: 1.25 }, "Ctrl", { w: 1.25 }, "Menu", "←", "↓", "→"],
    ],
  },
];

export const ALL_PRESETS: Preset[] = [...RAW_PRESETS];
export const SAMPLES: Preset[] = [];

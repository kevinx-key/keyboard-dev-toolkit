/**
 * 键帽模型匹配（STP 装配图「键帽」部件）
 * ==================================================
 *
 * 模型库：`L:\k星工作室\键帽\cherry` → 云端容器 `assets/keycaps/`
 * 文件名即契约：`r{行}-{宽}u.stp`，例 `r1-1u.stp` / `r4-625u.stp`
 *   - `r{行}` = 行高（R1–R4）；`-` 只是分隔符；`{宽}u` = 键帽宽度（小数点省略：1.25u → `125u`）
 *   - 宽度按**画布键帽宽度**（KLE `w`）匹配；库里没有的宽度一律回落该行的 1u 键帽
 *   - 另有三个**特殊模型**（R 大写命名，见 `SPECIAL_MODELS`）：
 *     `R3-175stepped` = 阶梯键（KLE `l`）｜`R3-home` = R3 行的 F / J / 键值 5（带定位凸点）
 *     ｜`R3-iso` = ISO Enter（高键 + L 形、底部 1.5u）
 *
 * 行高判定（机主 2026-10 定稿的强制规则，非标准配列也照此执行）：
 *   R1 = F 区 + 数字行 ｜ R2 = QWER 行 ｜ R3 = ASD 行 ｜ R4 = ZXC 行 + Ctrl/空格行
 *   实现：先把键按 KLE `y`（行带上边缘）聚类成「行带」，再用图例锚点
 *   （QWERTY / ASDF / ZXCV 三组字母）定位 Q/A/Z 行 → 其余按上/下位置推导；
 *   锚点全缺时整体按「从下往上」的位置规则回落（末两带 R4、其上 R3、再上 R2、更上 R1）。
 *
 * 落位（与服务端 `stp-service/src/stp.rs` 约定一致）：
 *   键帽原点 = **键帽内部圆柱 Z 轴底面轴心**；
 *   装配时该点与**定位板开孔顶面中心** XY 完全一致、Z 高 `KEYCAP_LIFT_Z`（6.6mm）。
 *   因此这里算的就是「定位板开孔中心」（与 plate-export 的挖孔中心逐字节同源）+ 装配平移。
 */

import type { KLELayout, KeyProps } from "./kle-types";
import { U_MM, rotatePoint } from "./coordinate-system";

// ─── 常量（与服务端 stp.rs 同源，改一处要同步）─────────────

/** 键帽原点相对定位板开孔顶面中心点的高度 (mm) */
export const KEYCAP_LIFT_Z = 6.6;

/** 模型库提供的宽度（u）——五行通用 */
export const KEYCAP_WIDTHS: readonly number[] = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75];

/** 各行的额外宽度（库中只有 R4 多一个 6.25u 空格） */
export const KEYCAP_EXTRA_WIDTHS: Readonly<Record<KeycapRow, readonly number[]>> = {
  1: [],
  2: [],
  3: [],
  4: [6.25],
};

/**
 * 特殊模型（不按「行 + 宽度」规则走；文件名 R 大写，与常规 `r{行}-{宽}u` 区分）：
 *   - `R3-175stepped` —— 阶梯键（KLE `l`，如阶梯 Caps Lock）
 *   - `R3-home`       —— 带定位凸点（home bump）的键：R3 行的 **F / J**，以及 R3 行里键值为 **5** 的键
 *   - `R3-iso`        —— ISO Enter（高键 + L 形、底部 1.5u 的那块）
 */
export const SPECIAL_MODELS = {
  stepped: "R3-175stepped",
  home: "R3-home",
  iso: "R3-iso",
} as const;

export type KeycapSpecial = keyof typeof SPECIAL_MODELS;

export type KeycapRow = 1 | 2 | 3 | 4;

export const KEYCAP_ROWS: readonly KeycapRow[] = [1, 2, 3, 4];

// ─── 模型名 ──────────────────────────────────────────────

/** 宽度 → 文件名片段：1 → "1"、1.25 → "125"、6.25 → "625"（小数点省略） */
export function keycapWidthSlug(width: number): string {
  return String(Number(width.toFixed(4))).replace(".", "");
}

/** 该行是否有这个宽度的模型 */
export function hasKeycapModel(row: KeycapRow, width: number): boolean {
  const w = Number(width.toFixed(4));
  if (KEYCAP_WIDTHS.includes(w)) return true;
  return KEYCAP_EXTRA_WIDTHS[row].includes(w);
}

/**
 * 画布键帽宽度 → 模型名（`r{行}-{宽}u`）；库里没有的宽度回落该行的 1u。
 *
 * ⚠️ 只走「行 + 宽度」常规规则；阶梯键 / F·J·5 / ISO Enter 走 `keycapModelFor`。
 */
export function keycapModelName(row: KeycapRow, width: number): string {
  const w = hasKeycapModel(row, width) ? Number(width.toFixed(4)) : 1;
  return `r${row}-${keycapWidthSlug(w)}u`;
}

/** 取键的**首个**图例行（去掉色号前缀、取第一行、转大写）—— 用于 F / J / 5 判定 */
function primaryLegendLine(key: KeyProps): string {
  for (const raw of key.labels || []) {
    if (!raw) continue;
    let text = raw;
    if (text.startsWith("#") && text.includes(":")) text = text.slice(text.indexOf(":") + 1);
    const first = text.split("\n").map((s) => s.trim()).find((s) => s.length > 0);
    if (first) return first.toUpperCase();
  }
  return "";
}

/** 键的有效宽高（含 KLE w2/h2 的 L 形扩展）——与 plate-export / pcb-export 同源 */
export function keycapEffectiveSize(key: KeyProps): { w: number; h: number } {
  const kw = key.w || 1;
  const kh = key.h || 1;
  if ((key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)) {
    const extRight = (key.x ?? 0) + (key.x2 || 0) + (key.w2 || 0);
    const extBottom = (key.y ?? 0) + (key.y2 || 0) + (key.h2 || 0);
    return {
      w: Math.max(kw, extRight - (key.x ?? 0)),
      h: Math.max(kh, extBottom - (key.y ?? 0)),
    };
  }
  return { w: kw, h: kh };
}

/** ISO Enter：高键（实际高 > 实际宽）+ L 形（有 w2/h2 且带偏移）+ 底部那块是 1.5u */
export function isIsoEnterKey(key: KeyProps): boolean {
  const { w, h } = keycapEffectiveSize(key);
  const lShape =
    (key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0);
  return h > w && lShape && Math.abs((key.w2 || 0) - 1.5) < 1e-6;
}

/**
 * 判定该键是否命中**特殊模型**（返回 null = 走「行 + 宽度」常规匹配）。
 *
 * 优先级：阶梯键 → ISO Enter → home 键（R3 行的 F / J / 5）。
 */
export function specialKeycap(key: KeyProps, row: KeycapRow): KeycapSpecial | null {
  if (key.l) return "stepped";
  if (isIsoEnterKey(key)) return "iso";
  if (row === 3) {
    const legend = primaryLegendLine(key);
    if (legend === "F" || legend === "J" || legend === "5") return "home";
  }
  return null;
}

/**
 * 单个键的模型名：先判特殊模型（阶梯 / home / ISO），否则按「行 + 宽度」匹配并回落 1u。
 */
export function keycapModelFor(key: KeyProps, row: KeycapRow): string {
  const special = specialKeycap(key, row);
  if (special) return SPECIAL_MODELS[special];
  return keycapModelName(row, key.w || 1);
}

// ─── 定位板开孔中心（与 plate-export 同源）────────────────

/**
 * 定位板挖孔中心（绝对 mm，SVG 空间 Y↓）——**逐条对应** `plate-export.generatePlate`
 * 里的轴孔落位（阶梯键 `l` 左移 0.25u → 高键整体转 90° → 键旋转 → 6u 空格再右移 0.5u）。
 *
 * 之所以要复刻而不是「键几何中心」：机主规格要求键帽原点 XY 与**定位板开孔顶面中心**
 * 完全一致，两者在阶梯键 / 6u 空格 / 高键上是不同的点。`tests/keycap-models.test.ts`
 * 用真实 plate-export 输出做交叉校验，防止两处漂移。
 */
export function switchHoleCenterMm(key: KeyProps, u1: number = U_MM): { x: number; y: number } {
  const kw = key.w || 1;
  const kh = key.h || 1;

  let actualW = kw;
  let actualH = kh;
  let cx = ((key.x ?? 0) + kw / 2) * u1;
  let cy = ((key.y ?? 0) + kh / 2) * u1;

  if ((key.w2 || 0) > 0 && (key.h2 || 0) > 0 && ((key.x2 || 0) !== 0 || (key.y2 || 0) !== 0)) {
    const extRight = (key.x ?? 0) + (key.x2 || 0) + (key.w2 || 0);
    const extBottom = (key.y ?? 0) + (key.y2 || 0) + (key.h2 || 0);
    actualW = Math.max(kw, extRight - (key.x ?? 0));
    actualH = Math.max(kh, extBottom - (key.y ?? 0));
    cx = ((key.x ?? 0) + actualW / 2) * u1;
    cy = ((key.y ?? 0) + actualH / 2) * u1;
  }

  const isTall = actualH > actualW;

  // 阶梯键：轴孔先左移 0.25u；随后高键整体 90° 旋转 → 该偏移落到 Y 方向
  let offX = key.l ? -0.25 * u1 : 0;
  let offY = 0;
  if (isTall) {
    const rx = offX * Math.cos(Math.PI / 2) - offY * Math.sin(Math.PI / 2);
    const ry = offX * Math.sin(Math.PI / 2) + offY * Math.cos(Math.PI / 2);
    offX = rx;
    offY = ry;
  }

  let hx = cx + offX;
  let hy = cy + offY;

  const rot = key.r || 0;
  if (rot % 360 !== 0) {
    const rx = (key.rx || 0) * u1;
    const ry = (key.ry || 0) * u1;
    const origin = rx !== 0 || ry !== 0 ? { x: rx, y: ry } : { x: cx, y: cy };
    const p = rotatePoint({ x: hx, y: hy }, rot, origin);
    hx = p.x;
    hy = p.y;
  }

  // 6u 空格：轴孔整体右移 0.5u（旋转之后，世界坐标偏移）
  if (kw === 6 || (isTall && kh === 6)) hx += u1 / 2;

  return { x: hx, y: hy };
}

// ─── 行高判定 ────────────────────────────────────────────

/** 图例锚点：三组字母行（OCR 视角的 QWERTY / ASDF / ZXCV 主键区） */
const ROW_LETTER_SETS: readonly string[][] = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"], // → QWER 行 = R2
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"], // → ASD 行 = R3
  ["Z", "X", "C", "V", "B", "N", "M"], // → ZXC 行 = R4
];

/** 命中锚点所需的最少字母键数（防单键误判；同类字母 ≥2 键即认定该行） */
const MIN_ANCHOR_HITS = 2;

/** 行带聚类容差（key units）：同一行带内 `y` 的抖动上限 */
const BAND_TOLERANCE_U = 0.5;

export interface KeycapRowResolution {
  /** 每个键（`layout.keys` 下标）的行高；decal 键为 null */
  rows: (KeycapRow | null)[];
  /** label = 图例锚点命中；position = 锚点缺失，按行带位置回落 */
  source: "label" | "position";
  /** 行带数量（调试/展示用） */
  bandCount: number;
}

/** 取键的主图例（12 槽里第一个非空的，去掉 KLE 颜色前缀） */
function primaryLegend(key: KeyProps): string {
  for (const raw of key.labels || []) {
    if (!raw) continue;
    let text = raw;
    if (text.startsWith("#") && text.includes(":")) text = text.slice(text.indexOf(":") + 1);
    text = text.trim();
    if (text) return text;
  }
  return "";
}

/** 从下往上的位置规则（锚点全缺时的兜底）：末两带 R4、其上 R3、再上 R2、更上 R1 */
function positionalRow(indexFromTop: number, bandCount: number): KeycapRow {
  const fromBottom = bandCount - 1 - indexFromTop;
  if (fromBottom <= 1) return 4;
  if (fromBottom === 2) return 3;
  if (fromBottom === 3) return 2;
  return 1;
}

/**
 * 判定每个键的行高（R1–R4，见文件头规则）。
 *
 * 步骤：① 按 KLE `y`（行带上边缘）聚类成行带 →
 *       ② 用图例字母锚点定位 Q/A/Z 行 →
 *       ③ 锚点外按位置推导，并强制「自上而下行高单调不降」（R1→R4）。
 */
export function resolveKeycapRows(layout: KLELayout): KeycapRowResolution {
  const keys = layout.keys || [];
  const rows: (KeycapRow | null)[] = keys.map(() => null);

  // ① 行带聚类（decal 不参与）
  const entries: { index: number; y: number }[] = [];
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (k.d) continue;
    if (!(k.w > 0)) continue;
    entries.push({ index: i, y: k.y ?? 0 });
  }
  if (entries.length === 0) return { rows, source: "position", bandCount: 0 };

  const sorted = [...entries].sort((a, b) => a.y - b.y || a.index - b.index);
  const bands: { y: number; indices: number[] }[] = [];
  for (const e of sorted) {
    const last = bands[bands.length - 1];
    if (last && Math.abs(e.y - last.y) <= BAND_TOLERANCE_U) {
      last.indices.push(e.index);
    } else {
      bands.push({ y: e.y, indices: [e.index] });
    }
  }

  // ② 图例锚点：QWER→R2 / ASD→R3 / ZXC→R4
  const anchors: (number | null)[] = ROW_LETTER_SETS.map((set) => {
    let best: number | null = null;
    let bestHits = 0;
    for (let b = 0; b < bands.length; b++) {
      let hits = 0;
      for (const idx of bands[b]!.indices) {
        if (set.includes(primaryLegend(keys[idx]!).toUpperCase())) hits++;
      }
      if (hits > bestHits) {
        bestHits = hits;
        best = b;
      }
    }
    return bestHits >= MIN_ANCHOR_HITS ? best : null;
  });

  const qBand: number | null = anchors[0] ?? null;
  const aBand: number | null = anchors[1] ?? null;
  const zBand: number | null = anchors[2] ?? null;
  const hasAnchor = anchors.some((a) => a !== null);

  // ③ 位置兜底 + 锚点覆盖
  const bandRows: KeycapRow[] = bands.map((_, i) => positionalRow(i, bands.length));
  if (qBand !== null) {
    for (let i = 0; i < qBand; i++) bandRows[i] = 1;
    bandRows[qBand] = 2;
  }
  if (aBand !== null) bandRows[aBand] = 3;
  if (zBand !== null) {
    for (let i = zBand; i < bandRows.length; i++) bandRows[i] = 4;
  }
  // 自上而下行高只能递增（R1 → R4），修掉锚点之间可能留下的空洞
  for (let i = 1; i < bandRows.length; i++) {
    if (bandRows[i]! < bandRows[i - 1]!) bandRows[i] = bandRows[i - 1]!;
  }

  for (const [b, band] of bands.entries()) {
    for (const idx of band.indices) rows[idx] = bandRows[b]!;
  }

  return { rows, source: hasAnchor ? "label" : "position", bandCount: bands.length };
}

// ─── 落位计算 ────────────────────────────────────────────

export interface KeycapPlacement {
  /** 模型名（= `r{行}-{宽}u`，对应云端 `assets/keycaps/{name}.stp`） */
  name: string;
  /** 定位板开孔顶面中心 X（装配坐标系 mm） */
  x: number;
  /** 定位板开孔顶面中心 Y（装配坐标系 mm） */
  y: number;
  /** 绕键帽自身轴心的 Z 轴旋转 (deg) */
  rotation: number;
}

export interface KeycapPlan {
  placements: KeycapPlacement[];
  /** 库里没有对应宽度、回落 1u 的键数 */
  fallbackCount: number;
  /** 命中特殊模型（阶梯 / home / ISO）的键数 */
  specialCount: number;
  /** 参与装配的键数 */
  total: number;
  rowSource: "label" | "position";
  rowCounts: Record<KeycapRow, number>;
}

/**
 * 生成整把键盘的键帽落位表。
 *
 * @param layout KLE 配列
 * @param origin 装配原点（esc 键中心，绝对 mm，Y↓）——与 `AssemblySection` 的 dx/dy 同源：
 *               装配坐标 X = 孔心X − origin.x；Y = origin.y − 孔心Y
 * @param u1     键位单位（跟随定位板配置；默认 19.05）
 */
export function buildKeycapPlacements(
  layout: KLELayout,
  origin: { x: number; y: number },
  u1: number = U_MM,
): KeycapPlan {
  const rows = resolveKeycapRows(layout);
  const keys = layout.keys || [];
  const placements: KeycapPlacement[] = [];
  const rowCounts: Record<KeycapRow, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let fallbackCount = 0;
  let specialCount = 0;

  for (let i = 0; i < keys.length; i++) {
    const row = rows.rows[i];
    if (row === null || row === undefined) continue;
    const key = keys[i]!;
    const special = specialKeycap(key, row);
    if (special) {
      specialCount++;
    } else if (!hasKeycapModel(row, key.w || 1)) {
      fallbackCount++;
    }
    const hole = switchHoleCenterMm(key, u1);
    placements.push({
      name: keycapModelFor(key, row),
      x: hole.x - origin.x,
      y: origin.y - hole.y,
      rotation: key.r || 0,
    });
    rowCounts[row]++;
  }

  return {
    placements,
    fallbackCount,
    specialCount,
    total: placements.length,
    rowSource: rows.source,
    rowCounts,
  };
}

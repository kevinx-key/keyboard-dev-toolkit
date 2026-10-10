import { logger } from "./error-logger";
import type { PCBConfig, CustomRect } from "./pcb-export";
import type { KLELayout, KLEMeta, KeyProps } from "./kle-types";
import type { PlateSettings, FoamSettings, PadSettings, BottomFoamSettings } from "./editor-settings";
import {
  DEFAULT_PCB_CONFIG,
  DEFAULT_PLATE_SETTINGS,
  DEFAULT_FOAM_SETTINGS,
  DEFAULT_PAD_SETTINGS,
  DEFAULT_BOTTOM_FOAM_SETTINGS,
} from "./editor-settings";

/**
 * Project File Serialization
 *
 * Save / Load an all-in-one project file (.kle-project.json) that records the
 * COMPLETE editor state so a user never has to re-tune their setup, and the
 * design reproduces perfectly on ANY machine / OS:
 *  - Full layout (meta + every KeyProps field, lossless — incl. author,
 *    逐键 textColor / textSize / 字体 / stab / 兼容标志 / 矩阵覆盖)
 *  - KLE Raw Data (兼容 KLE 工具，人类可读；由 layout 派生)
 *  - Plate rotation overrides + Plate 编辑器全部配置
 *  - PCB switch & stabilizer rotation overrides + PCB 全部配置
 *  - 轴间棉 / 轴下垫 / 底棉 全部配置（含底棉自定义矩形）
 *  - 图片贴花
 *
 * Format (v3):
 * ```json
 * {
 *   "version": 3,
 *   "meta": { "name": "My Keyboard", "createdAt": "..." },
 *   "layout": { "meta": { ...full KLEMeta... }, "keys": [ ...full KeyProps... ] },
 *   "kLayout": [ ["Esc", {"x":1}, "F1"], ... ],
 *   "plate": { "rotations": {...}, "config": {...} },
 *   "pcb": { "switchRotations": {...}, "stabRotations": {...}, "solderType": "socket", ... },
 *   "foam": {...}, "pad": {...}, "bottomFoam": {...},
 *   "decal": {...}
 * }
 * ```
 */

// ─── Types ──────────────────────────────────────────────

export interface ProjectFileMeta {
  name: string;
  createdAt: string;
}

export interface ProjectFilePlate {
  /** keyInfoIndex → rotation angle (0/90/180/270) */
  rotations: Record<number, number>;
  /** 定位板编辑器全部配置 */
  config?: PlateSettings;
}

export interface ProjectFilePCB extends PCBConfig {
  /** region-id → rotation angle for switch hole groups */
  switchRotations: Record<string, number>;
  /** region-id → rotation angle for stabilizer hole groups */
  stabRotations: Record<string, number>;
}

/** 图片贴花（base64 彩色图片，裁剪到所有键帽） */
export interface ProjectFileDecal {
  image: string;
  scale: number;
  x: number;
  y: number;
  dim: number;
  opacity: number;
  natW?: number;
  natH?: number;
}

export interface ProjectFile {
  version: number;
  meta: ProjectFileMeta;
  /** 完整布局（无损：meta + 全部 KeyProps）。载入时优先于 kLayout。 */
  layout?: { meta: KLEMeta; keys: KeyProps[] };
  kLayout: unknown[];
  plate: ProjectFilePlate;
  pcb: ProjectFilePCB;
  /** 轴间棉配置 */
  foam?: FoamSettings;
  /** 轴下垫配置 */
  pad?: PadSettings;
  /** 底棉配置（含自定义矩形） */
  bottomFoam?: BottomFoamSettings;
  decal?: ProjectFileDecal;
}

// ─── Current version ────────────────────────────────────

const CURRENT_VERSION = 3;

// ─── Serialize ──────────────────────────────────────────

export interface ProjectFileInput {
  name: string;
  /** 完整布局（无损保存；优先） */
  layout?: KLELayout;
  kLayout: unknown[];
  plateRotations: Record<number, number>;
  plateConfig?: PlateSettings;
  switchRotations: Record<string, number>;
  stabRotations: Record<string, number>;
  pcbConfig: PCBConfig;
  foamConfig?: FoamSettings;
  padConfig?: PadSettings;
  bottomFoamConfig?: BottomFoamSettings;
  decal?: ProjectFileDecal | null;
}

export interface ProjectFileOutput {
  name: string;
  /** 完整布局（v3；旧文件为 null，回退 kLayout） */
  layout: KLELayout | null;
  kLayout: unknown[];
  plateRotations: Record<number, number>;
  plateConfig: PlateSettings;
  switchRotations: Record<string, number>;
  stabRotations: Record<string, number>;
  pcbConfig: PCBConfig;
  foamConfig: FoamSettings;
  padConfig: PadSettings;
  bottomFoamConfig: BottomFoamSettings;
  decal: ProjectFileDecal | null;
}

export function serializeProjectFile(input: ProjectFileInput): string {
  const project: ProjectFile = {
    version: CURRENT_VERSION,
    meta: {
      name: input.name || "Untitled",
      createdAt: new Date().toISOString(),
    },
    ...(input.layout ? { layout: { meta: input.layout.meta, keys: input.layout.keys } } : {}),
    kLayout: input.kLayout,
    plate: {
      rotations: input.plateRotations,
      ...(input.plateConfig ? { config: input.plateConfig } : {}),
    },
    pcb: {
      ...(input.pcbConfig || DEFAULT_PCB_CONFIG),
      switchRotations: input.switchRotations,
      stabRotations: input.stabRotations,
    },
    ...(input.foamConfig ? { foam: input.foamConfig } : {}),
    ...(input.padConfig ? { pad: input.padConfig } : {}),
    ...(input.bottomFoamConfig ? { bottomFoam: input.bottomFoamConfig } : {}),
    ...(input.decal ? { decal: input.decal } : {}),
  };

  return JSON.stringify(project, null, 2);
}

// ─── Deserialize ────────────────────────────────────────

/** Validate a numeric field, else fall back. */
function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function parseRotations(v: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(k);
      if (!isNaN(n) && typeof val === "number") out[n] = val;
    }
  }
  return out;
}

function parseStringRotations(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number") out[k] = val;
    }
  }
  return out;
}

function parsePcbConfig(raw: unknown): PCBConfig {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const solder = str(p.solderType, DEFAULT_PCB_CONFIG.solderType);
  const solderType: PCBConfig["solderType"] =
    solder === "socket" || solder === "sunken" || solder === "stepped" ? solder : DEFAULT_PCB_CONFIG.solderType;
  return {
    solderType,
    needStab: bool(p.needStab, DEFAULT_PCB_CONFIG.needStab),
    needLed: bool(p.needLed, DEFAULT_PCB_CONFIG.needLed),
    edgeDistance: num(p.edgeDistance, DEFAULT_PCB_CONFIG.edgeDistance),
    outerFillet: num(p.outerFillet, DEFAULT_PCB_CONFIG.outerFillet ?? 0),
    needTypeC: bool(p.needTypeC, DEFAULT_PCB_CONFIG.needTypeC),
    need4P: bool(p.need4P, DEFAULT_PCB_CONFIG.need4P),
    needMCU: bool(p.needMCU, DEFAULT_PCB_CONFIG.needMCU),
    typeCX: num(p.typeCX, DEFAULT_PCB_CONFIG.typeCX),
    typeCY: num(p.typeCY, DEFAULT_PCB_CONFIG.typeCY),
    fourPX: num(p.fourPX, DEFAULT_PCB_CONFIG.fourPX),
    fourPY: num(p.fourPY, DEFAULT_PCB_CONFIG.fourPY),
    mcuX: num(p.mcuX, DEFAULT_PCB_CONFIG.mcuX),
    mcuY: num(p.mcuY, DEFAULT_PCB_CONFIG.mcuY),
    typeCRot: num(p.typeCRot, DEFAULT_PCB_CONFIG.typeCRot),
    fourPRot: num(p.fourPRot, DEFAULT_PCB_CONFIG.fourPRot),
    mcuRot: num(p.mcuRot, DEFAULT_PCB_CONFIG.mcuRot),
  };
}

function parsePlateConfig(raw: unknown): PlateSettings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_PLATE_SETTINGS;
  const sw = num(p.switchType, d.switchType);
  const st = num(p.stabType, d.stabType);
  return {
    switchType: (sw === 1 || sw === 2 || sw === 3 || sw === 4 ? sw : d.switchType),
    stabType: (st === 0 || st === 1 || st === 2 || st === 3 ? st : d.stabType),
    u1: num(p.u1, d.u1), kerf: num(p.kerf, d.kerf),
    topPad: num(p.topPad, d.topPad), leftPad: num(p.leftPad, d.leftPad),
    rightPad: num(p.rightPad, d.rightPad), bottomPad: num(p.bottomPad, d.bottomPad),
    xGrow: num(p.xGrow, d.xGrow), yGrow: num(p.yGrow, d.yGrow),
    fillet: num(p.fillet, d.fillet), holeFillet: num(p.holeFillet, d.holeFillet),
    lineColor: str(p.lineColor, d.lineColor), lineWeight: num(p.lineWeight, d.lineWeight),
    dmz: num(p.dmz, d.dmz),
    padEnabled: bool(p.padEnabled, d.padEnabled), kerfEnabled: bool(p.kerfEnabled, d.kerfEnabled),
    u1Enabled: bool(p.u1Enabled, d.u1Enabled),
    lineColorEnabled: bool(p.lineColorEnabled, d.lineColorEnabled),
    lineWeightEnabled: bool(p.lineWeightEnabled, d.lineWeightEnabled),
    customPolygons: str(p.customPolygons, d.customPolygons),
  };
}

function parseCustomRects(raw: unknown): CustomRect[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomRect[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    out.push({
      cx: num(r.cx, 0), cy: num(r.cy, 0),
      w: num(r.w, 10), h: num(r.h, 10),
      r: num(r.r, 1), rot: num(r.rot, 0),
    });
  }
  return out;
}

function parseFoamConfig(raw: unknown): FoamSettings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FOAM_SETTINGS;
  return {
    fillet: num(p.fillet, d.fillet), holeFillet: num(p.holeFillet, d.holeFillet),
    minFeature: num(p.minFeature, d.minFeature), thickness: num(p.thickness, d.thickness),
  };
}

function parsePadConfig(raw: unknown): PadSettings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { outerFillet: num(p.outerFillet, DEFAULT_PAD_SETTINGS.outerFillet) };
}

function parseBottomFoamConfig(raw: unknown): BottomFoamSettings {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_BOTTOM_FOAM_SETTINGS;
  return {
    thickness: num(p.thickness, d.thickness), holeFillet: num(p.holeFillet, d.holeFillet),
    outerFillet: num(p.outerFillet, d.outerFillet), minFeature: num(p.minFeature, d.minFeature),
    thinWall: num(p.thinWall, d.thinWall), customRects: parseCustomRects(p.customRects),
  };
}

/**
 * Parse and validate a project file JSON string.
 * Returns null if the format is invalid or version is unsupported.
 * v1 files (no per-editor config) still load — missing sections fall back to defaults.
 */
export function deserializeProjectFile(json: string): ProjectFileOutput | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch { logger.error("deserializeProjectFile JSON parse failed");
    return null;
  }

  if (!data || typeof data !== "object") return null;

  const file = data as Record<string, unknown>;

  // Version check: 拒绝过旧版本，允许未来版本
  const version = typeof file.version === "number" ? file.version : 0;
  if (version < 1) return null;

  const kLayout = file.kLayout;
  if (!Array.isArray(kLayout)) return null;

  const meta = (file.meta || {}) as Record<string, unknown>;
  const name = typeof meta.name === "string" ? meta.name : "Untitled";

  // Full layout (v3, lossless). Preferred over kLayout on restore.
  let layout: KLELayout | null = null;
  const layoutRaw = file.layout;
  if (layoutRaw && typeof layoutRaw === "object") {
    const l = layoutRaw as Record<string, unknown>;
    if (l.meta && typeof l.meta === "object" && Array.isArray(l.keys)) {
      layout = { meta: l.meta as KLEMeta, keys: l.keys as KeyProps[] };
    }
  }

  // Plate
  const plateData = (file.plate || {}) as Record<string, unknown>;
  const plateRotations = parseRotations(plateData.rotations);
  const plateConfig = parsePlateConfig(plateData.config);

  // PCB
  const pcbData = (file.pcb || {}) as Record<string, unknown>;
  const switchRotations = parseStringRotations(pcbData.switchRotations);
  const stabRotations = parseStringRotations(pcbData.stabRotations);
  const pcbConfig = parsePcbConfig(pcbData);

  // Foam / Pad / BottomFoam
  const foamConfig = parseFoamConfig(file.foam);
  const padConfig = parsePadConfig(file.pad);
  const bottomFoamConfig = parseBottomFoamConfig(file.bottomFoam);

  // Image decal (optional)
  let decal: ProjectFileDecal | null = null;
  const decalRaw = file.decal;
  if (decalRaw && typeof decalRaw === "object") {
    const d = decalRaw as Record<string, unknown>;
    if (typeof d.image === "string" && d.image) {
      decal = {
        image: d.image,
        scale: num(d.scale, 1),
        x: num(d.x, 0),
        y: num(d.y, 0),
        dim: num(d.dim, 0.4),
        opacity: num(d.opacity, 1),
        ...(typeof d.natW === "number" ? { natW: d.natW } : {}),
        ...(typeof d.natH === "number" ? { natH: d.natH } : {}),
      };
    }
  }

  return {
    name,
    layout,
    kLayout,
    plateRotations,
    plateConfig,
    switchRotations,
    stabRotations,
    pcbConfig,
    foamConfig,
    padConfig,
    bottomFoamConfig,
    decal,
  };
}

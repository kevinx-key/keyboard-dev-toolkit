import { logger } from "./error-logger";

/**
 * Project File Serialization
 *
 * Save / Load an all-in-one project file (.kle-project.json) that includes:
 *  - KLE Raw Data (键位布局)
 *  - Plate rotation overrides (Plate 区用户旋转的轴)
 *  - PCB switch & stabilizer rotation overrides (PCB 区用户旋转的轴体与卫星轴)
 *
 * Format:
 * ```json
 * {
 *   "version": 1,
 *   "meta": {
 *     "name": "My Keyboard",
 *     "createdAt": "2026-07-04T12:00:00.000Z"
 *   },
 *   "kLayout": [ ["Esc", {"x":1}, "F1"], ... ],
 *   "plate": { "rotations": { "0": 90, "3": 180 } },
 *   "pcb": { "switchRotations": { "switch-1": 90 }, "stabRotations": { "stab-2": 270 } }
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
}

export interface ProjectFilePCB {
  /** region-id → rotation angle for switch hole groups */
  switchRotations: Record<string, number>;
  /** region-id → rotation angle for stabilizer hole groups */
  stabRotations: Record<string, number>;
  /** Include Type-C connector */
  needTypeC?: boolean;
  /** Include 4P connector */
  need4P?: boolean;
  /** Include MCU */
  needMCU?: boolean;
  /** Type-C position X (mm) */
  typeCX?: number;
  /** Type-C position Y (mm) */
  typeCY?: number;
  /** 4P connector position X (mm) */
  fourPX?: number;
  /** 4P connector position Y (mm) */
  fourPY?: number;
  /** MCU position X (mm) */
  mcuX?: number;
  /** MCU position Y (mm) */
  mcuY?: number;
  /** Type-C rotation (degrees) */
  typeCRot?: number;
  /** 4P rotation (degrees) */
  fourPRot?: number;
  /** MCU rotation (degrees) */
  mcuRot?: number;
}

export interface ProjectFile {
  version: number;
  meta: ProjectFileMeta;
  /** KLE raw data array (getRawRows format) */
  kLayout: unknown[];
  plate: ProjectFilePlate;
  pcb: ProjectFilePCB;
}

// ─── Current version ────────────────────────────────────

const CURRENT_VERSION = 1;

// ─── Serialize ──────────────────────────────────────────

export interface ProjectFileInput {
  name: string;
  kLayout: unknown[];
  plateRotations: Record<number, number>;
  switchRotations: Record<string, number>;
  stabRotations: Record<string, number>;
  needTypeC?: boolean;
  need4P?: boolean;
  needMCU?: boolean;
  typeCX?: number;
  typeCY?: number;
  fourPX?: number;
  fourPY?: number;
  mcuX?: number;
  mcuY?: number;
  typeCRot?: number;
  fourPRot?: number;
  mcuRot?: number;
}

export interface ProjectFileOutput {
  name: string;
  kLayout: unknown[];
  plateRotations: Record<number, number>;
  switchRotations: Record<string, number>;
  stabRotations: Record<string, number>;
  needTypeC: boolean;
  need4P: boolean;
  needMCU: boolean;
  typeCX: number;
  typeCY: number;
  fourPX: number;
  fourPY: number;
  mcuX: number;
  mcuY: number;
  typeCRot: number;
  fourPRot: number;
  mcuRot: number;
}

export function serializeProjectFile(input: ProjectFileInput): string {
  const project: ProjectFile = {
    version: CURRENT_VERSION,
    meta: {
      name: input.name || "Untitled",
      createdAt: new Date().toISOString(),
    },
    kLayout: input.kLayout,
    plate: {
      rotations: input.plateRotations,
    },
    pcb: {
      switchRotations: input.switchRotations,
      stabRotations: input.stabRotations,
      needTypeC: input.needTypeC,
      need4P: input.need4P,
      needMCU: input.needMCU,
      typeCX: input.typeCX,
      typeCY: input.typeCY,
      fourPX: input.fourPX,
      fourPY: input.fourPY,
      mcuX: input.mcuX,
      mcuY: input.mcuY,
      typeCRot: input.typeCRot,
      fourPRot: input.fourPRot,
      mcuRot: input.mcuRot,
    },
  };

  return JSON.stringify(project, null, 2);
}

// ─── Deserialize ────────────────────────────────────────

/**
 * Parse and validate a project file JSON string.
 * Returns null if the format is invalid or version is unsupported.
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

  // Version check: 拒绝过旧版本，允许未来版本（L6 修复 — 不再阻止 minor 升级）
  const version = typeof file.version === "number" ? file.version : 0;
  if (version < 1) return null;

  // Validate kLayout array
  const kLayout = file.kLayout;
  if (!Array.isArray(kLayout)) return null;

  // Name
  const meta = (file.meta || {}) as Record<string, unknown>;
  const name = typeof meta.name === "string" ? meta.name : "Untitled";

  // Plate rotations
  const plateData = (file.plate || {}) as Record<string, unknown>;
  const plateRotationsRaw = plateData.rotations;
  const plateRotations: Record<number, number> = {};
  if (plateRotationsRaw && typeof plateRotationsRaw === "object") {
    for (const [key, val] of Object.entries(plateRotationsRaw)) {
      const nKey = Number(key);
      if (!isNaN(nKey) && typeof val === "number") {
        plateRotations[nKey] = val;
      }
    }
  }

  // PCB rotations
  const pcbData = (file.pcb || {}) as Record<string, unknown>;

  const switchRotationsRaw = pcbData.switchRotations;
  const switchRotations: Record<string, number> = {};
  if (switchRotationsRaw && typeof switchRotationsRaw === "object") {
    for (const [key, val] of Object.entries(switchRotationsRaw)) {
      if (typeof val === "number") switchRotations[key] = val;
    }
  }

  const stabRotationsRaw = pcbData.stabRotations;
  const stabRotations: Record<string, number> = {};
  if (stabRotationsRaw && typeof stabRotationsRaw === "object") {
    for (const [key, val] of Object.entries(stabRotationsRaw)) {
      if (typeof val === "number") stabRotations[key] = val;
    }
  }

  // PCB component config
  const needTypeC = typeof pcbData.needTypeC === "boolean" ? pcbData.needTypeC : false;
  const need4P = typeof pcbData.need4P === "boolean" ? pcbData.need4P : false;
  const needMCU = typeof pcbData.needMCU === "boolean" ? pcbData.needMCU : false;
  const typeCX = typeof pcbData.typeCX === "number" ? pcbData.typeCX : -1.5;
  const typeCY = typeof pcbData.typeCY === "number" ? pcbData.typeCY : 16;
  const fourPX = typeof pcbData.fourPX === "number" ? pcbData.fourPX : 196;
  const fourPY = typeof pcbData.fourPY === "number" ? pcbData.fourPY : 17.5;
  const mcuX = typeof pcbData.mcuX === "number" ? pcbData.mcuX : 91;
  const mcuY = typeof pcbData.mcuY === "number" ? pcbData.mcuY : 62;
  const typeCRot = typeof pcbData.typeCRot === "number" ? pcbData.typeCRot : 270;
  const fourPRot = typeof pcbData.fourPRot === "number" ? pcbData.fourPRot : 270;
  const mcuRot = typeof pcbData.mcuRot === "number" ? pcbData.mcuRot : 45;

  return {
    name,
    kLayout,
    plateRotations,
    switchRotations,
    stabRotations,
    needTypeC,
    need4P,
    needMCU,
    typeCX,
    typeCY,
    fourPX,
    fourPY,
    mcuX,
    mcuY,
    typeCRot,
    fourPRot,
    mcuRot,
  };
}

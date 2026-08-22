/**
 * PCB Editor Hook
 *
 * Extracted from EditorPage.tsx — manages PCB connector/MCU component configuration
 * (Type-C, 4P, MCU position, rotation, and solder type flags).
 */

"use client";

import { useState } from "react";
import type { PCBConfig } from "../lib/pcb-export";

const DEFAULT_PCB_CONFIG: PCBConfig = {
  solderType: "socket",
  needStab: true,
  needLed: false,
  edgeDistance: 5,
  needTypeC: false,
  need4P: false,
  needMCU: false,
  typeCX: -1.5,
  typeCY: 16,
  fourPX: 196,
  fourPY: 17.5,
  mcuX: 91,
  mcuY: 62,
  typeCRot: 270,
  fourPRot: 270,
  mcuRot: 45,
};

export function usePCBEditor() {
  const [pcbConfig, setPcbConfig] = useState<PCBConfig>(DEFAULT_PCB_CONFIG);

  return { pcbConfig, setPcbConfig };
}

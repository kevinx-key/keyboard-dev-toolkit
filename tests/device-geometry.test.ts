import { describe, it, expect } from 'vitest';
import {
  DEFAULT_META,
  DEFAULT_PROPS,
  type KLELayout,
  type KeyProps,
} from '@/lib/kle-types';
import {
  KNOB_CUTOUT_MM,
  KNOB_DEFAULT_DIA_MM,
  SCREEN_EXIT_SLOT_WIDTH_MM,
  deviceCutoutPolygons,
  getDeviceKind,
  getScreenGeometry,
  knobCutoutPolygon,
  mmToUnits,
  normalizeScreenExit,
  screenSlotPolygon,
  screenSlotRectLocal,
} from '@/lib/device-geometry';
import { generatePlate } from '@/lib/plate-export';
import { generatePCB, computeSwitchPadGeometry, computeBottomFoamGeometry } from '@/lib/pcb-export';
import { generateSwitchPad } from '@/lib/switch-pad-export';
import { editorReducer, createInitialState } from '@/lib/kle-reducer';
import { serializeKLE, parseKLE } from '@/lib/kle-parser';
import { parseLayoutJSON } from '@/lib/kle-serial';
import { exportSVG } from '@/lib/kle-export';
import { buildExportModel } from '@/lib/qmk-export-community';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import KeyRenderer from '@/components/canvas/KeyRenderer';
import { PropertiesTab } from '@/components/toolbelt/PropertiesTab';

// ─── Fixtures ─────────────────────────────────────────────

const U = 19.05;

function mkKey(overrides: Partial<KeyProps> & { x: number; y: number }): KeyProps {
  return { ...DEFAULT_PROPS, labels: Array(12).fill(""), ...overrides };
}

function key1u(x: number, y: number): KeyProps {
  return mkKey({ x, y, w: 1, h: 1 });
}

function knobKey(x: number, y: number, dia = KNOB_DEFAULT_DIA_MM): KeyProps {
  return mkKey({
    x, y,
    w: mmToUnits(dia), h: mmToUnits(dia),
    knobDia: dia,
  });
}

function screenKey(x: number, y: number, exit: KeyProps["screenExit"] = "bottom"): KeyProps {
  return mkKey({
    x, y, w: 2, h: 3,
    screenW: 2 * U, screenH: 3 * U, screenR: 1.5, screenExit: exit,
    c: "#000000",
  });
}

function makeLayout(keys: KeyProps[], name = "device-test"): KLELayout {
  return { meta: { ...DEFAULT_META, name }, keys };
}

function bboxOfPoly(pts: { x: number; y: number }[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Find a hole polygon matching the given size (±tolerance) in a plate/PCB stpData. */
function findHole(
  polys: [number, number][][],
  w: number,
  h: number,
  tol = 0.05,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  for (const poly of polys) {
    const pts = poly.map(([x, y]) => ({ x, y }));
    const b = bboxOfPoly(pts);
    if (Math.abs(b.w - w) <= tol && Math.abs(b.h - h) <= tol) {
      return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// device-geometry
// ═══════════════════════════════════════════════════════════

describe("device-geometry", () => {
  it("detects knob / screen / normal keys", () => {
    expect(getDeviceKind(knobKey(0, 0))).toBe("knob");
    expect(getDeviceKind(screenKey(0, 0))).toBe("screen");
    expect(getDeviceKind(key1u(0, 0))).toBeNull();
    expect(deviceCutoutPolygons(key1u(0, 0))).toEqual([]);
  });

  it("normalizes invalid screen exit values", () => {
    expect(normalizeScreenExit("left")).toBe("left");
    expect(normalizeScreenExit("diagonal")).toBeUndefined();
    expect(normalizeScreenExit(undefined)).toBeUndefined();
  });

  it("knob cutout is a centred 17 × 17 mm square", () => {
    const pts = knobCutoutPolygon(knobKey(0, 0));
    const b = bboxOfPoly(pts);
    expect(pts).toHaveLength(4);
    expect(b.w).toBeCloseTo(KNOB_CUTOUT_MM, 6);
    expect(b.h).toBeCloseTo(KNOB_CUTOUT_MM, 6);
    // knob centre = (dia/2, dia/2)
    expect((b.minX + b.maxX) / 2).toBeCloseTo(KNOB_DEFAULT_DIA_MM / 2, 3);
    expect((b.minY + b.maxY) / 2).toBeCloseTo(KNOB_DEFAULT_DIA_MM / 2, 3);
  });

  it("knob cutout follows the key rotation (still 17 × 17 bbox)", () => {
    const pts = knobCutoutPolygon(mkKey({ x: 0, y: 0, w: 2.1, h: 2.1, knobDia: 40, r: 45 }));
    const b = bboxOfPoly(pts);
    // a 17×17 square rotated 45° has a √2 larger bbox
    expect(b.w).toBeCloseTo(KNOB_CUTOUT_MM * Math.SQRT2, 4);
  });

  it("screen geometry defaults to 2u × 3u (38.1 × 57.15 mm)", () => {
    const k = mkKey({ x: 0, y: 0, w: 2, h: 3, screenW: 2 * U, screenH: 3 * U });
    const g = getScreenGeometry(k);
    expect(g.w).toBeCloseTo(38.1, 6);
    expect(g.h).toBeCloseTo(57.15, 6);
    expect(g.cx).toBeCloseTo(19.05, 6);
    expect(g.cy).toBeCloseTo(28.575, 6);
    expect(g.exit).toBe("bottom");
  });

  it.each([
    ["bottom", 38.1, 3],
    ["top", 38.1, 3],
    ["left", 3, 57.15],
    ["right", 3, 57.15],
  ] as const)("exit %s cuts a slot %s × %s mm", (exit, w, h) => {
    const key = screenKey(0, 0, exit);
    const b = bboxOfPoly(screenSlotPolygon(key));
    expect(b.w).toBeCloseTo(w, 6);
    expect(b.h).toBeCloseTo(h, 6);

    const g = getScreenGeometry(key);
    const local = screenSlotRectLocal(key);
    // slot is centred on the exit edge
    if (exit === "bottom" || exit === "top") {
      const edgeY = exit === "bottom" ? g.cy + g.h / 2 : g.cy - g.h / 2;
      expect((local.y0 + local.y1) / 2).toBeCloseTo(exit === "bottom" ? g.h / 2 : -g.h / 2, 6);
      const absCenterY = (b.minY + b.maxY) / 2;
      expect(absCenterY).toBeCloseTo(edgeY, 6);
      expect(b.w).toBeCloseTo(g.w, 6);
    } else {
      const edgeX = exit === "right" ? g.cx + g.w / 2 : g.cx - g.w / 2;
      expect((b.minX + b.maxX) / 2).toBeCloseTo(edgeX, 6);
      expect(b.h).toBeCloseTo(g.h, 6);
    }
    // symmetric about the edge: 3mm total
    expect(b.w === SCREEN_EXIT_SLOT_WIDTH_MM || b.h === SCREEN_EXIT_SLOT_WIDTH_MM).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Reducer: add device + property sync
// ═══════════════════════════════════════════════════════════

describe("editorReducer — devices", () => {
  it("adds a knob with 40 mm default diameter and selects it", () => {
    let s = createInitialState();
    s = editorReducer(s, { type: "ADD_DEVICE", device: "knob" });
    expect(s.layout.keys).toHaveLength(1);
    const k = s.layout.keys[0]!;
    expect(k.knobDia).toBe(40);
    expect(k.w).toBeCloseTo(40 / U, 4);
    expect(k.h).toBeCloseTo(40 / U, 4);
    // 默认颜色与键帽默认色一致（纯平色，无自定义过渡色）
    expect(k.c).toBe(DEFAULT_PROPS.c);
    expect(k.c2).toBeUndefined();
    expect(s.selectedIds).toEqual(["0"]);
  });

  it("adds a screen with 2u × 3u default size and bottom exit", () => {
    let s = createInitialState();
    s = editorReducer(s, { type: "ADD_DEVICE", device: "screen" });
    const k = s.layout.keys[0]!;
    expect(k.screenW).toBeCloseTo(38.1, 6);
    expect(k.screenH).toBeCloseTo(57.15, 6);
    expect(k.screenExit).toBe("bottom");
    expect(k.w).toBe(2);
    expect(k.h).toBe(3);
  });

  it("keeps w/h in sync with knob diameter and ignores direct w/h edits", () => {
    let s = createInitialState();
    s = editorReducer(s, { type: "ADD_DEVICE", device: "knob" });
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "knobDia", value: 30 });
    expect(s.layout.keys[0]!.knobDia).toBe(30);
    expect(s.layout.keys[0]!.w).toBeCloseTo(30 / U, 4);
    expect(s.layout.keys[0]!.h).toBeCloseTo(30 / U, 4);

    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "w", value: 5 });
    expect(s.layout.keys[0]!.w).toBeCloseTo(30 / U, 4);
  });

  it("keeps w/h in sync with screen size, clamps radius and validates exit", () => {
    let s = createInitialState();
    s = editorReducer(s, { type: "ADD_DEVICE", device: "screen" });
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "screenW", value: 60 });
    expect(s.layout.keys[0]!.screenW).toBe(60);
    expect(s.layout.keys[0]!.w).toBeCloseTo(60 / U, 4);
    expect(s.layout.keys[0]!.h).toBe(3);

    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "screenR", value: 999 });
    expect(s.layout.keys[0]!.screenR).toBeCloseTo(57.15 / 2, 6);

    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "screenExit", value: "left" });
    expect(s.layout.keys[0]!.screenExit).toBe("left");

    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "screenExit", value: "nope" });
    expect(s.layout.keys[0]!.screenExit).toBe("left");
  });

  it("accepts manual X / Y / rotation / rotation-origin input", () => {
    let s = createInitialState();
    s = editorReducer(s, { type: "ADD_DEVICE", device: "knob" });

    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "x", value: -1.25 });
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "y", value: 4.5 });
    expect(s.layout.keys[0]!.x).toBe(-1.25);
    expect(s.layout.keys[0]!.y).toBe(4.5);

    // 手动旋转角度（reducer 会补偿 x/y 并设置旋转中心）
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "r", value: 90 });
    expect(s.layout.keys[0]!.r).toBe(90);

    // 手动旋转中心
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "rx", value: 3 });
    s = editorReducer(s, { type: "SET_PROP", ids: ["0"], prop: "ry", value: 2 });
    expect(s.layout.keys[0]!.rx).toBe(3);
    expect(s.layout.keys[0]!.ry).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════
// Serialization round-trip
// ═══════════════════════════════════════════════════════════

describe("device serialization", () => {
  it("round-trips knob / screen through URLON (auto-save hash format)", () => {
    const layout = makeLayout([key1u(0, 0), knobKey(1, 0, 25), screenKey(0, 1, "top")]);
    const raw = serializeKLE(layout);
    const parsed = parseKLE(raw);
    expect(parsed.keys).toHaveLength(3);

    const knob = parsed.keys.find((k) => k.knobDia !== undefined)!;
    expect(knob.knobDia).toBe(25);
    expect(knob.w).toBeCloseTo(25 / U, 4);

    const screen = parsed.keys.find((k) => k.screenW !== undefined)!;
    expect(screen.screenW).toBeCloseTo(38.1, 6);
    expect(screen.screenH).toBeCloseTo(57.15, 6);
    expect(screen.screenR).toBe(1.5);
    expect(screen.screenExit).toBe("top");
  });

  it("parses device props from KLE JSON rows", () => {
    const rows = [
      [{ knobDia: 40, screenW: 38.1, screenH: 57.15, screenR: 2, screenExit: "right" }, "A"],
    ];
    const keys = parseLayoutJSON(rows);
    expect(keys[0]!.knobDia).toBe(40);
    expect(keys[0]!.screenW).toBe(38.1);
    expect(keys[0]!.screenExit).toBe("right");
  });

  it("round-trips through the full project file snapshot", async () => {
    const { serializeProjectFile, deserializeProjectFile } = await import("@/lib/project-serial");
    const layout = makeLayout([knobKey(0, 0), screenKey(0, 2, "left")]);
    const json = serializeProjectFile({
      name: "devices",
      layout,
      kLayout: [],
      plateRotations: {},
      switchRotations: {},
      stabRotations: {},
      pcbConfig: (await import("@/lib/editor-settings")).DEFAULT_PCB_CONFIG,
    });
    const out = deserializeProjectFile(json)!;
    expect(out.layout!.keys[0]!.knobDia).toBe(40);
    expect(out.layout!.keys[1]!.screenExit).toBe("left");
  });
});

// ═══════════════════════════════════════════════════════════
// Canvas / SVG rendering
// ═══════════════════════════════════════════════════════════

describe("device rendering", () => {
  const baseProps = {
    index: 0,
    isSelected: false,
    matchesFilter: true,
    onContextMenu: () => {},
  };

  it("renders a single flat circular knob on the canvas", () => {
    const html = renderToStaticMarkup(
      React.createElement(KeyRenderer, { ...baseProps, keyData: knobKey(0, 0) }),
    );
    expect(html).toContain("border-radius:50%");
    // 单个圆：不再有内圈 / 高光 / 径向渐变
    expect((html.match(/border-radius:50%/g) ?? []).length).toBe(1);
    expect(html).not.toContain("radial-gradient");
    expect(html).not.toContain("box-shadow");
    // 默认颜色与键帽默认色一致，纯平色
    expect(html).toContain(`background-color:${DEFAULT_PROPS.c}`);
    // knob must not render keycap faces / legends
    expect(html).not.toContain("box-shadow:0 1px 2px rgba(0,0,0,0.1)");
  });

  it("renders a black screen rectangle without the exit marker when unselected", () => {
    const html = renderToStaticMarkup(
      React.createElement(KeyRenderer, { ...baseProps, keyData: screenKey(0, 0) }),
    );
    expect(html).toContain("linear-gradient(155deg, #1c1c22");
    expect(html).not.toContain("rgba(var(--theme-primary-rgb), 0.28)");
  });

  it("shows the blue exit marker only when the screen is selected", () => {
    const html = renderToStaticMarkup(
      React.createElement(KeyRenderer, { ...baseProps, isSelected: true, keyData: screenKey(0, 0, "left") }),
    );
    expect(html).toContain("rgba(var(--theme-primary-rgb), 0.28)");
  });

  it("SVG export draws device geometry instead of keycaps", () => {
    const svg = exportSVG(makeLayout([knobKey(0, 0), screenKey(0, 2)]), 1);
    expect(svg).toContain("<circle");
    expect(svg).toContain("#0b0b0e");
    // 蓝色出线框只是画布编辑辅助，不进入导出
    expect(svg).not.toContain("rgba(120,200,255,0.35)");
    // 旋钮为单一纯平圆
    expect((svg.match(/<circle[^>]*r=/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(svg).toContain(`fill="${DEFAULT_PROPS.c}"`);
  });

  it("properties tab switches to knob-only diameter controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertiesTab, {
        keys: [knobKey(0, 0)],
        selectedIds: ["0"],
        onSetProp: () => {},
      }),
    );
    expect(html).toContain("Knob (EC11)");
    expect(html).toContain("Diameter (mm)");
    expect(html).toContain("17 × 17 mm");
    // no generic width/height/corner controls for a knob
    expect(html).not.toContain("Height (mm)");
    expect(html).not.toContain("Corner radius (mm)");
    // 手动坐标 / 旋转输入已开放
    expect(html).toContain('data-testid="prop-x"');
    expect(html).toContain('data-testid="prop-y"');
    expect(html).toContain('data-testid="prop-r"');
  });

  it("properties tab shows screen size / radius / exit controls", () => {
    const html = renderToStaticMarkup(
      React.createElement(PropertiesTab, {
        keys: [screenKey(0, 0, "left")],
        selectedIds: ["0"],
        onSetProp: () => {},
      }),
    );
    expect(html).toContain("Screen");
    expect(html).toContain("Cable exit");
    expect(html).toContain("Corner radius (mm)");
    expect(html).toContain("3 mm wide slot");
    expect(html).toContain('data-testid="prop-r"');
    expect(html).toContain('data-testid="prop-rx"');
    expect(html).toContain('data-testid="prop-ry"');
  });
});

// ═══════════════════════════════════════════════════════════
// Downstream editors (plate / PCB / pad / bottom foam)
// ═══════════════════════════════════════════════════════════

describe("device cutouts in downstream editors", () => {
  const layout = makeLayout([key1u(0, 0), knobKey(2, 0), screenKey(0, 2)]);

  it("plate: knob = 17×17 square, screen = 3 mm slot (STP geometry)", () => {
    const r = generatePlate(layout);
    expect(r.stpData).not.toBeNull();
    const polys = r.stpData!.polyHoles;
    expect(findHole(polys, 17, 17)).not.toBeNull();
    expect(findHole(polys, 38.1, 3)).not.toBeNull();
    // no MX 14×14 switch hole for the device keys
    const knobPos = knobKey(2, 0);
    const kc = { x: (knobPos.x + knobPos.w / 2) * U, y: (knobPos.y + knobPos.h / 2) * U };
    for (const poly of polys) {
      const b = bboxOfPoly(poly.map(([x, y]) => ({ x, y })));
      const inside = kc.x > b.minX && kc.x < b.maxX && -kc.y > b.minY && -kc.y < b.maxY;
      if (inside) expect(Math.abs(b.w - 17)).toBeLessThan(0.05);
    }
  });

  it("plate SVG / DXF contain the device cutouts", () => {
    const r = generatePlate(layout);
    expect(r.svg).toContain("<path");
    expect(r.dxf).toContain("CUT");
    expect(r.dxf).toContain("POLYLINE");
  });

  it("PCB: knob produces a 17×17 cutout and no switch holes", () => {
    const pcbLayout = makeLayout([knobKey(0, 0)]);
    const r = generatePCB(pcbLayout, {
      solderType: "socket",
      needStab: true,
      needLed: false,
      edgeDistance: 5,
      needTypeC: false,
      need4P: false,
      needMCU: false,
      typeCX: 0, typeCY: 0, fourPX: 0, fourPY: 0, mcuX: 0, mcuY: 0,
      typeCRot: 0, fourPRot: 0, mcuRot: 0,
    });
    expect(r.stpData!.circleHoles).toHaveLength(0);
    expect(findHole(r.stpData!.polyHoles, 17, 17)).not.toBeNull();
    expect(r.stpData!.modelPlacements ?? []).toHaveLength(0);
  });

  it("switch pad: device holes are included (poly, not switch circles)", () => {
    const geo = computeSwitchPadGeometry(layout, {
      solderType: "socket", needStab: true, needLed: false, edgeDistance: 5,
    });
    const polys = geo.polys;
    expect(findHole(polys, 17, 17)).not.toBeNull();
    expect(findHole(polys, 38.1, 3)).not.toBeNull();

    const r = generateSwitchPad(layout, {
      solderType: "socket", needStab: true, needLed: false, edgeDistance: 5, fillet: 0,
    });
    expect(r.svg).toContain("<path");
    expect(r.dxf).toContain("CUT");
  });

  it("bottom foam: device holes are included", () => {
    const geo = computeBottomFoamGeometry(layout, {
      solderType: "socket", needLed: false,
      needTypeC: false, typeCX: 0, typeCY: 0, typeCRot: 0,
      need4P: false, fourPX: 0, fourPY: 0, fourPRot: 0,
      needMCU: false, mcuX: 0, mcuY: 0, mcuRot: 0,
      edgeDistance: 5, holeFillet: 0, customRects: [],
    });
    const polys = geo.polys;
    expect(findHole(polys, 17, 17)).not.toBeNull();
    expect(findHole(polys, 38.1, 3)).not.toBeNull();
  });

  it("switch foam (plate pipeline) inherits the device cutouts", async () => {
    const { generateSwitchFoam } = await import("@/lib/switch-foam-export");
    const r = generateSwitchFoam(layout);
    expect(findHole(r.stpData!.polyHoles, 17, 17)).not.toBeNull();
    expect(findHole(r.stpData!.polyHoles, 38.1, 3)).not.toBeNull();
  });

  it("QMK export excludes device keys from the matrix", () => {
    const model = buildExportModel(layout.keys);
    expect(model.entries).toHaveLength(1);
    expect(model.entries[0]!.index).toBe(0);
    expect(model.matrixRows).toBe(1);
  });

  it("keycap / switch placements skip device keys", async () => {
    const { buildKeycapPlacements } = await import("@/lib/keycap-models");
    const { buildSwitchPlacements } = await import("@/lib/switch-model");
    const caps = buildKeycapPlacements(layout, { x: 0, y: 0 });
    const switches = buildSwitchPlacements(layout, { x: 0, y: 0 }, -5, {});
    expect(caps.total).toBe(1);
    expect(switches.total).toBe(1);
  });
});

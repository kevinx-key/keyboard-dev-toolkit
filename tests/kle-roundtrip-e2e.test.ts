/**
 * _sourceCache Round-Trip E2E Tests
 *
 * Tests the _sourceCache preservation and fallback mechanism:
 *   1. _sourceCache is set on parseKLEJSON
 *   2. serialization via _sourceCache path preserves data
 *   3. serialization via fallback path (keyPropsToIntermediate) preserves data
 *   4. reducer mutations correctly clear _sourceCache
 *   5. After mutation, round-trip still works (fallback path)
 *   6. keyPropsToIntermediate consistency with getRawRows fallback
 */

import { describe, it, expect } from "vitest";
import { parseKLEJSON, serializeKLEJSON, getRawRows, intermediateToJSONFormat } from "@/lib/kle-serial";
import { exportJSON } from "@/lib/kle-export";
import { editorReducer, createInitialState } from "@/lib/kle-reducer";
import { keyPropsToIntermediate } from "@/lib/kle-parser";
import { ALL_PRESETS } from "@/data/presets";
import type { KLELayout, KeyProps, EditorState } from "@/lib/kle-types";

// ── Constants ──

/** Presets with known round-trip rotation-cluster limitations */
const COMPLEX_ROTATION_PRESETS = new Set(["ErgoDox", "Atreus", "Kinesis Advantage"]);

// ── Helpers ──

/** Deep equality check on two KeyProps arrays with floating-point tolerance */
function keysEqual(a: KeyProps[], b: KeyProps[], tolerance = 0.01): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const k1 = a[i]!;
    const k2 = b[i]!;

    // Numeric fields
    const numFields: (keyof KeyProps)[] = ["x", "y", "w", "h", "x2", "y2", "w2", "h2", "r", "rx", "ry"];
    for (const f of numFields) {
      if (Math.abs((k2[f] as number) - (k1[f] as number)) > tolerance) return false;
    }

    // String fields
    const strFields: (keyof KeyProps)[] = ["c", "t", "p", "sm", "sb", "st"];
    for (const f of strFields) {
      if ((k2[f] || "") !== (k1[f] || "")) return false;
    }

    // Numeric scalar fields
    const intFields: (keyof KeyProps)[] = ["align", "labelSize", "f2"];
    for (const f of intFields) {
      if (k2[f] !== k1[f]) return false;
    }

    // Boolean fields
    const boolFields: (keyof KeyProps)[] = ["d", "g", "l", "n"];
    for (const f of boolFields) {
      if (k2[f] !== k1[f]) return false;
    }

    // Labels array
    if (k2.labels.length !== k1.labels.length) return false;
    for (let li = 0; li < k1.labels.length; li++) {
      if (k2.labels[li] !== k1.labels[li]) return false;
    }

    // fa array
    if (k2.fa.length !== k1.fa.length) return false;
    for (let fi = 0; fi < k1.fa.length; fi++) {
      if (k2.fa[fi] !== k1.fa[fi]) return false;
    }
  }
  return true;
}

/** Get the ANSI 104 preset */
function getANSI104(): { name: string; data: unknown[] } {
  const preset = ALL_PRESETS.find((p) => p.name === "ANSI 104");
  if (!preset) throw new Error("ANSI 104 preset not found");
  return preset;
}

/** Round-trip via the fallback path (no _sourceCache) into a new KLELayout */
function fallbackRoundTrip(layout: KLELayout): KLELayout {
  const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };
  const json = exportJSON(layoutNoRaw);
  const parsed = JSON.parse(json);
  const result = parseKLEJSON(parsed);
  if (!result) throw new Error("Fallback round-trip parse failed");
  return result;
}

/** Serialize via getRawRows fallback, parse back - for layout with _sourceCache cleared */
function serializeAndReParse(layout: KLELayout, clearRaw = true): KLELayout {
  const target = clearRaw ? { ...layout, _sourceCache: undefined } : layout;
  const json = exportJSON(target);
  const parsed = JSON.parse(json);
  const result = parseKLEJSON(parsed);
  if (!result) throw new Error("Re-parse failed");
  return result;
}

// ── Tests ──

describe("_sourceCache mechanism", () => {
  // ─── _sourceCache Existence ───

  describe("_sourceCache existence", () => {
    it("parseKLEJSON sets _sourceCache on preset data", () => {
      const { data } = getANSI104();
      const layout = parseKLEJSON(data)!;
      expect(layout).not.toBeNull();
      expect(layout.keys.length).toBeGreaterThan(0);
      expect(layout._sourceCache).toBeDefined();
      expect(Array.isArray(layout._sourceCache)).toBe(true);
      // _sourceCache should have the same top-level array structure
      expect(layout._sourceCache!.length).toBeGreaterThan(0);
    });

    it("parseKLEJSON sets _sourceCache for metadata + rows format", () => {
      const data = [
        { backcolor: "#151A21", switchMount: "cherry" },
        ["Esc", "F1", "F2"],
        ["A", "B", "C"],
      ];
      const layout = parseKLEJSON(data)!;
      expect(layout._sourceCache).toBeDefined();
      expect(layout._sourceCache).toEqual(data);
    });

    it("parseKLEJSON _sourceCache is the original data reference", () => {
      const data = [["A", "B", "C"]];
      const layout = parseKLEJSON(data)!;
      // Should be the same reference (not a copy)
      expect(layout._sourceCache).toBe(data);
    });
  });

  // ─── Round-Trip via _sourceCache Path ───

  describe("round-trip via _sourceCache path", () => {
    it("serializeKLEJSON with _sourceCache produces valid re-parseable output", () => {
      const { data } = getANSI104();
      const layout = parseKLEJSON(data)!;
      const output = serializeKLEJSON(layout);
      const reparsed = parseKLEJSON(output);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.keys.length).toBe(layout.keys.length);
    });

    it("getRawRows with _sourceCache returns the original rows (minus name/author)", () => {
      const data = [
        { name: "Test Layout", backcolor: "#eeeeee" },
        ["A", "B"],
        ["C", "D"],
      ];
      const layout = parseKLEJSON(data)!;
      const rows = getRawRows(layout);
      // name should be stripped
      expect(rows[0]).not.toHaveProperty("name");
      // backcolor should remain
      expect((rows[0] as Record<string, unknown>).backcolor).toBe("#eeeeee");
      // Re-parse the rows
      const reparsed = parseKLEJSON(rows);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.keys.length).toBe(4);
    });

    it("getRawRows returns original rows directly when no metadata to strip", () => {
      const data = [["A", "B"], ["C", "D"]];
      const layout = parseKLEJSON(data)!;
      const rows = getRawRows(layout);
      // No metadata object, so rows should be the original data
      expect(rows).toBe(data);
    });
  });

  // ─── Round-Trip via Fallback Path ───

  describe("round-trip via fallback path (no _sourceCache)", () => {
    it("serializeKLEJSON fallback produces valid re-parseable output", () => {
      const { data } = getANSI104();
      const layout = parseKLEJSON(data)!;
      const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };
      const output = serializeKLEJSON(layoutNoRaw);
      const reparsed = parseKLEJSON(output);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.keys.length).toBe(layout.keys.length);
    });

    it("getRawRows fallback returns rows from keyPropsToIntermediate", () => {
      const { data } = getANSI104();
      const layout = parseKLEJSON(data)!;
      const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };

      // getRawRows fallback should equal the explicit fallback
      const fromGetRawRows = getRawRows(layoutNoRaw);
      const explicit = intermediateToJSONFormat(keyPropsToIntermediate(layoutNoRaw));
      expect(fromGetRawRows).toEqual(explicit);
    });

    it("fallback path preserves key count for all presets", () => {
      for (const preset of ALL_PRESETS) {
        const layout = parseKLEJSON(preset.data)!;
        const reparsed = fallbackRoundTrip(layout);
        expect(reparsed.keys.length).toBe(layout.keys.length);
      }
    });
  });

  // ─── Both Paths Comparison ───

  describe("_sourceCache path vs fallback path consistency", () => {
    it("both paths produce re-parseable output with same key count", () => {
      const { data } = getANSI104();
      const layout = parseKLEJSON(data)!;

      // Path 1: via _sourceCache
      const out1 = serializeKLEJSON(layout);
      const re1 = parseKLEJSON(out1)!;

      // Path 2: via fallback
      const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };
      const out2 = serializeKLEJSON(layoutNoRaw);
      const re2 = parseKLEJSON(out2)!;

      expect(re1.keys.length).toBe(re2.keys.length);
      // For simple layouts, keys should be equal
      expect(keysEqual(re1.keys, re2.keys)).toBe(true);
    });

    it("both paths produce same key properties for simple layouts", () => {
      const simplePresets = ALL_PRESETS.filter((p) => !COMPLEX_ROTATION_PRESETS.has(p.name));
      for (const preset of simplePresets) {
        const layout = parseKLEJSON(preset.data)!;

        const re1 = serializeAndReParse(layout, false); // keep _sourceCache
        const re2 = serializeAndReParse(layout, true); // clear _sourceCache

        expect(keysEqual(re1.keys, re2.keys)).toBe(true);
      }
    });

    it("both paths produce same metadata after round-trip", () => {
      const data = [
        { backcolor: "#151A21", switchMount: "cherry", name: "Test" },
        ["A", "B"],
      ];
      const layout = parseKLEJSON(data)!;

      // Path 1: _sourceCache path
      const re1 = serializeAndReParse(layout, false);
      // Path 2: fallback path
      const re2 = serializeAndReParse(layout, true);

      expect(re1.meta.backcolor).toBe("#151A21");
      expect(re2.meta.backcolor).toBe("#151A21");
      expect(re1.meta.switchMount).toBe("cherry");
      expect(re2.meta.switchMount).toBe("cherry");
    });
  });
});

// ─── Reducer Mutations ───

describe("reducer mutations and _sourceCache", () => {
  /** Helper: create a state loaded with ANSI 104 */
  function createLoadedState(): EditorState {
    const { data } = getANSI104();
    const layout = parseKLEJSON(data)!;
    return editorReducer(createInitialState(), { type: "LOAD_LAYOUT", layout });
  }

  describe("LOAD_LAYOUT", () => {
    it("preserves _sourceCache from the loaded layout", () => {
      const state = createLoadedState();
      expect(state.layout._sourceCache).toBeDefined();
    });
  });

  describe("SET_PROP", () => {
    it("clears _sourceCache", () => {
      const state: any = createLoadedState();
      const next = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "c", value: "#ff0000" });
      expect(next.layout._sourceCache).toBeUndefined();
    });

    it("round-trip still works after SET_PROP (color change)", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "c", value: "#ff0000" });
      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(state.layout.keys.length);
      expect(reparsed.keys[0]!.c).toBe("#ff0000");
    });

    it("round-trip still works after SET_PROP (size change)", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "w", value: 2 });
      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(state.layout.keys.length);
      expect(reparsed.keys[0]!.w).toBe(2);
    });

    it("round-trip still works after SET_PROP (label change)", () => {
      const state = createLoadedState();
      // Change label on the first key (labels[0] = top-center label)
      const newLabels = [...state.layout.keys[0]!.labels];
      newLabels[0] = "Custom";
      const next = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "labels", value: newLabels });
      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(state.layout.keys.length);
      expect(reparsed.keys[0]!.labels[0]).toBe("Custom");
    });
  });

  describe("MOVE_SELECTED", () => {
    it("clears _sourceCache on multi-key layout", () => {
      let state = createLoadedState();
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0"] });
      const next = editorReducer(state, { type: "MOVE_SELECTED", dx: 1, dy: 0.5 });
      expect(next.layout._sourceCache).toBeUndefined();
    });

    it("round-trip preserves position change after MOVE_SELECTED (single key)", () => {
      const data = [["A"]];
      const layout = parseKLEJSON(data)!;
      let state = editorReducer(createInitialState(), { type: "LOAD_LAYOUT", layout });
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0"] });
      const next = editorReducer(state, { type: "MOVE_SELECTED", dx: 1.25, dy: 0.75 });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(1);
      expect(reparsed.keys[0]!.x).toBeCloseTo(1.25, 2);
      expect(reparsed.keys[0]!.y).toBeCloseTo(0.75, 2);
    });

    it("round-trip preserves key count after MOVE_SELECTED", () => {
      let state = createLoadedState();
      const originalCount = state.layout.keys.length;
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["10"] });
      const next = editorReducer(state, { type: "MOVE_SELECTED", dx: 1, dy: 0.5 });
      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount);
    });
  });

  describe("SET_META", () => {
    it("clears _sourceCache", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_META", meta: { backcolor: "#ff0000" } });
      expect(next.layout._sourceCache).toBeUndefined();
    });

    it("round-trip still works after SET_META", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_META", meta: { backcolor: "#ff0000", switchMount: "cherry" } });
      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(state.layout.keys.length);
      expect(reparsed.meta.backcolor).toBe("#ff0000");
      expect(reparsed.meta.switchMount).toBe("cherry");
    });
  });

  describe("DELETE_SELECTED", () => {
    it("clears _sourceCache and round-trip still works", () => {
      let state = createLoadedState();
      const originalCount = state.layout.keys.length;
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0", "1", "2"] });
      const next = editorReducer(state, { type: "DELETE_SELECTED" });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount - 3);
    });
  });

  describe("ADD_KEYS", () => {
    it("clears _sourceCache and round-trip still works", () => {
      const state = createLoadedState();
      const originalCount = state.layout.keys.length;
      const next = editorReducer(state, { type: "ADD_KEYS", count: 5 });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount + 5);
    });
  });

  describe("CUT_SELECTED", () => {
    it("clears _sourceCache and round-trip still works", () => {
      let state = createLoadedState();
      const originalCount = state.layout.keys.length;
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["10", "11"] });
      const next = editorReducer(state, { type: "CUT_SELECTED" });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount - 2);
    });
  });

  describe("PASTE", () => {
    it("clears _sourceCache and round-trip still works", () => {
      let state = createLoadedState();
      const originalCount = state.layout.keys.length;
      // First copy some keys
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0", "1"] });
      state = editorReducer(state, { type: "COPY_SELECTED" });
      // Then paste (COPY_SELECTED does NOT clear _sourceCache)
      expect(state.layout._sourceCache).toBeDefined();

      // Now paste
      const next = editorReducer(state, { type: "PASTE" });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount + 2);
    });
  });

  describe("ADD_SPECIAL_KEY", () => {
    it("clears _sourceCache and round-trip still works", () => {
      const state = createLoadedState();
      const originalCount = state.layout.keys.length;
      const next = editorReducer(state, { type: "ADD_SPECIAL_KEY", props: { w: 2, h: 2 } });
      expect(next.layout._sourceCache).toBeUndefined();

      const reparsed = serializeAndReParse(next.layout);
      expect(reparsed.keys.length).toBe(originalCount + 1);
    });
  });

  // ─── Non-clearing operations ───

  describe("operations that should NOT clear _sourceCache", () => {
    it("SET_SELECTION preserves _sourceCache", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_SELECTION", ids: ["0", "1"] });
      expect(next.layout._sourceCache).toBeDefined();
    });

    it("CLEAR_SELECTION preserves _sourceCache", () => {
      let state = createLoadedState();
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0"] });
      const next = editorReducer(state, { type: "CLEAR_SELECTION" });
      expect(next.layout._sourceCache).toBeDefined();
    });

    it("TOGGLE_SELECTION preserves _sourceCache", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "TOGGLE_SELECTION", id: "0" });
      expect(next.layout._sourceCache).toBeDefined();
    });

    it("COPY_SELECTED preserves _sourceCache", () => {
      let state = createLoadedState();
      state = editorReducer(state, { type: "SET_SELECTION", ids: ["0"] });
      const next = editorReducer(state, { type: "COPY_SELECTED" });
      expect(next.layout._sourceCache).toBeDefined();
    });

    it("MARK_CLEAN preserves _sourceCache", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "MARK_CLEAN" });
      expect(next.layout._sourceCache).toBeDefined();
    });
  });

  // ─── Empty selection edge cases (should be no-ops) ───

  describe("empty-selection no-ops (should NOT clear _sourceCache)", () => {
    it("SET_PROP with empty ids is a no-op", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "SET_PROP", ids: [], prop: "c", value: "#ff0000" });
      // Should return the same state reference (no change)
      expect(next.layout._sourceCache).toBeDefined();
      expect(next.isDirty).toBe(false);
      expect(next.undoStack.length).toBe(0);
    });

    it("MOVE_SELECTED with empty selection is a no-op", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "MOVE_SELECTED", dx: 1, dy: 0.5 });
      expect(next.layout._sourceCache).toBeDefined();
      expect(next.isDirty).toBe(false);
      expect(next.undoStack.length).toBe(0);
    });

    it("CUT_SELECTED with empty selection is a no-op", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "CUT_SELECTED" });
      expect(next.layout._sourceCache).toBeDefined();
      expect(next.isDirty).toBe(false);
      expect(next.undoStack.length).toBe(0);
    });

    it("DELETE_SELECTED with empty selection is a no-op", () => {
      const state = createLoadedState();
      const next = editorReducer(state, { type: "DELETE_SELECTED" });
      expect(next.layout._sourceCache).toBeDefined();
      expect(next.isDirty).toBe(false);
      expect(next.undoStack.length).toBe(0);
    });
  });

  // ─── UNDO/REDO ───

  describe("UNDO/REDO", () => {
    it("UNDO restores _sourceCache", () => {
      const state = createLoadedState();
      const mutated = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "c", value: "#ff0000" });
      expect(mutated.layout._sourceCache).toBeUndefined();

      const undone = editorReducer(mutated, { type: "UNDO" });
      expect(undone.layout._sourceCache).toBeDefined();
      expect(undone.layout._sourceCache).toEqual(state.layout._sourceCache);
    });

    it("UNDO→REDO clears _sourceCache again", () => {
      const state = createLoadedState();
      const mutated = editorReducer(state, { type: "SET_PROP", ids: ["0"], prop: "c", value: "#ff0000" });
      const undone = editorReducer(mutated, { type: "UNDO" });
      expect(undone.layout._sourceCache).toBeDefined();

      const redone = editorReducer(undone, { type: "REDO" });
      expect(redone.layout._sourceCache).toBeUndefined();
    });
  });
});

// ─── keyPropsToIntermediate Consistency ───

describe("keyPropsToIntermediate consistency", () => {
  it("getRawRows fallback matches explicit keyPropsToIntermediate + intermediateToJSONFormat", () => {
    const { data } = getANSI104();
    const layout = parseKLEJSON(data)!;
    const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };

    const rows = getRawRows(layoutNoRaw);
    const expected = intermediateToJSONFormat(keyPropsToIntermediate(layoutNoRaw));
    expect(rows).toEqual(expected);
  });

  it("getRawRows fallback + re-parse preserves all key properties for simple presets", () => {
    const simplePresets = ALL_PRESETS.filter((p) => !COMPLEX_ROTATION_PRESETS.has(p.name));
    for (const preset of simplePresets) {
      const layout = parseKLEJSON(preset.data)!;
      const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };

      const rows = getRawRows(layoutNoRaw);
      const reparsed = parseKLEJSON(rows);
      expect(reparsed).not.toBeNull();

      // Should have the same number of keys and same properties
      expect(reparsed!.keys.length).toBe(layout.keys.length);

      // For non-complex layouts, keys should be equal
      expect(keysEqual(reparsed!.keys, layout.keys)).toBe(true);
    }
  });

  it("getRawRows fallback + re-parse preserves key count for complex rotation presets", () => {
    for (const preset of ALL_PRESETS) {
      if (!COMPLEX_ROTATION_PRESETS.has(preset.name)) continue;
      const layout = parseKLEJSON(preset.data)!;
      const layoutNoRaw: KLELayout = { ...layout, _sourceCache: undefined };

      const rows = getRawRows(layoutNoRaw);
      const reparsed = parseKLEJSON(rows);
      expect(reparsed).not.toBeNull();
      expect(reparsed!.keys.length).toBe(layout.keys.length);
    }
  });

  it("keyPropsToIntermediate round-trips through intermediateToJSONFormat for edge cases", () => {
    // Single key with default props
    const layout1 = parseKLEJSON([["A"]])!;
    const r1 = intermediateToJSONFormat(keyPropsToIntermediate(layout1));
    const p1 = parseKLEJSON(r1)!;
    expect(p1.keys.length).toBe(1);

    // Metadata-only
    const layout2 = parseKLEJSON([
      { backcolor: "#ff0000", name: "Test" },
      ["Esc"],
    ])!;
    const r2 = intermediateToJSONFormat(keyPropsToIntermediate(layout2));
    const p2 = parseKLEJSON(r2)!;
    expect(p2.keys.length).toBe(1);
    expect(p2.meta.backcolor).toBe("#ff0000");

    // L-shaped key
    const layout3 = parseKLEJSON([
      [{ w: 1.5, h: 2, w2: 2.25, h2: 1, x2: -0.75, y2: 1 }, "Enter"],
    ])!;
    const r3 = intermediateToJSONFormat(keyPropsToIntermediate(layout3));
    const p3 = parseKLEJSON(r3)!;
    expect(p3.keys.length).toBe(1);
    expect(p3.keys[0]!.w).toBe(1.5);
    expect(p3.keys[0]!.h).toBe(2);
    expect(p3.keys[0]!.w2).toBe(2.25);
    expect(p3.keys[0]!.h2).toBe(1);
    expect(p3.keys[0]!.x2).toBe(-0.75);
    expect(p3.keys[0]!.y2).toBe(1);
  });
});

// ─── exportJSON Round-Trip ───

describe("exportJSON round-trip", () => {
  it("exportJSON output is valid JSON parseable by parseKLEJSON", () => {
    const { data } = getANSI104();
    const layout = parseKLEJSON(data)!;
    const json = exportJSON(layout);
    expect(typeof json).toBe("string");
    expect(json.startsWith("[")).toBe(true);
    expect(json.endsWith("]")).toBe(true);

    const parsed = JSON.parse(json);
    const reparsed = parseKLEJSON(parsed);
    expect(reparsed).not.toBeNull();
    expect(reparsed!.keys.length).toBe(layout.keys.length);
  });

  it("exportJSON round-trip preserves key properties", () => {
    const { data } = getANSI104();
    const layout = parseKLEJSON(data)!;
    const reparsed = serializeAndReParse(layout, false); // keep _sourceCache
    expect(keysEqual(reparsed.keys, layout.keys)).toBe(true);
  });

  it("exportJSON handles empty layout", () => {
    const empty: KLELayout = { meta: {} as any, keys: [] };
    expect(exportJSON(empty)).toBe("[]");
  });
});

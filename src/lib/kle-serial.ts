/**
 * KLE Serialization: Convert between KLE internal formats
 *
 * layouts.json format: [[...], [...], ...] array of rows
 * Each row is an array of items (strings = key labels, objects = property overrides)
 *
 * Internal format: KeyProps[] with x/y as absolute positions
 * Labels stored as 12-element array matching KLE's internal positions
 */

import type { KeyProps, KLELayout, KLEMeta } from "./kle-types";
import { DEFAULT_PROPS, DEFAULT_ALIGN, DEFAULT_META, KLE_KEY_PROPS, reorderLabelsToPositions } from "./kle-types";
import { keyPropsToIntermediate } from "./kle-parser";

/** Parse a layouts.json format preset into KeyProps[].
 *  Uses absolute position tracking matching the original KLE $serial.deserialize.
 *  current.x / current.y are the absolute position for the next key,
 *  reset by extend(current, cluster) when rx/ry change the rotation origin.
 */
export function parseLayoutJSON(presetData: unknown): KeyProps[] {
  if (!Array.isArray(presetData)) return [];

  const keys: KeyProps[] = [];
  const current: Partial<KeyProps> = { ...DEFAULT_PROPS };
  current.f = DEFAULT_PROPS.labelSize;
  let align = DEFAULT_ALIGN;
  const cluster = { rx: 0, ry: 0 };
  // No separate x/y cursor — current.x / current.y IS the absolute position.

  for (const row of presetData) {
    if (!Array.isArray(row)) continue;

    for (const item of row) {
      if (typeof item === "string") {
        const serialLabels = item.split("\n");
        const mappedLabels = reorderLabelsToPositions(serialLabels, align);

        const key: KeyProps = { ...DEFAULT_PROPS };

        // Position from sticky state (absolute)
        key.x = round(current.x as number);
        key.y = round(current.y as number);
        key.w = (current.w as number) ?? 1;
        key.h = (current.h as number) ?? 1;
        key.x2 = (current.x2 as number) ?? 0;
        key.y2 = (current.y2 as number) ?? 0;
        key.w2 = (current.w2 as number) ?? 0;
        key.h2 = (current.h2 as number) ?? 0;
        key.r = (current.r as number) ?? 0;
        key.rx = (current.rx as number) ?? 0;
        key.ry = (current.ry as number) ?? 0;

        key.c = (current.c as string) ?? DEFAULT_PROPS.c;
        key.t = (current.t as string) ?? DEFAULT_PROPS.t;
        key.align = align;
        key.labelSize = (current.f as number) ?? DEFAULT_PROPS.labelSize;
        key.f2 = (current.f2 as number) ?? 0;
        key.fa = (current.fa as number[]) ?? [];
        key.p = (current.p as string) ?? "";
        key.d = !!(current.d);
        key.g = !!(current.g);
        key.l = !!(current.l);
        key.n = !!(current.n);
        key.sm = (current.sm as string) ?? "";
        key.sb = (current.sb as string) ?? "";
        key.st = (current.st as string) ?? "";
        key.labels = mappedLabels;

        keys.push(key);

        // Advance X: current.x += key.w  (matching original after each key)
        current.x = round((current.x as number) + key.w);

        // Reset per-key props (matching original KLE $serial.deserialize behaviour).
        // w and h are reset per-key to ensure ANSI 104 Insert after Backspace stays 1u.
        // This matches the original KLE's per-key reset pattern.
        current.w = 1;
        current.h = 1;
        current.x2 = 0;
        current.y2 = 0;
        current.w2 = 0;
        current.h2 = 0;
        current.n = false;
        current.l = false;
        current.d = false;
        current.g = false;

      } else if (typeof item === "object" && item !== null) {
        const props = item as import("./kle-parser").IntermediateLayoutItem;

        if (props.r !== undefined) current.r = props.r as number;
        if (props.rx !== undefined) {
          cluster.rx = props.rx as number;
          current.rx = cluster.rx;
          // extend(current, cluster): copy rotation origin into absolute position
          current.x = cluster.rx;
          current.y = cluster.ry;
        }
        if (props.ry !== undefined) {
          cluster.ry = props.ry as number;
          current.ry = cluster.ry;
          // extend(current, cluster): copy full cluster state
          current.x = cluster.rx;
          current.y = cluster.ry;
        }
        if (props.a !== undefined) align = props.a as number;
        if (props.f !== undefined) { current.f = props.f as number; }
        if (props.f2 !== undefined) { current.f2 = props.f2 as number; }
        if (props.fa !== undefined) { current.fa = props.fa as number[]; }
        if (props.p !== undefined) current.p = String(props.p);
        if (props.c !== undefined) current.c = String(props.c);
        if (props.t !== undefined) {
          const split = String(props.t).split("\n");
          if (split[0]) current.t = split[0];
        }
        if (props.x !== undefined) current.x = (current.x as number) + (props.x as number);
        if (props.y !== undefined) current.y = (current.y as number) + (props.y as number);
        if (props.w !== undefined) { current.w = props.w as number; }
        if (props.h !== undefined) { current.h = props.h as number; }
        if (props.x2 !== undefined) current.x2 = props.x2 as number;
        if (props.y2 !== undefined) current.y2 = props.y2 as number;
        if (props.w2 !== undefined) { current.w2 = props.w2 as number; }
        if (props.h2 !== undefined) { current.h2 = props.h2 as number; }
        if (props.n !== undefined) current.n = props.n as boolean;
        if (props.l !== undefined) current.l = props.l as boolean;
        if (props.d !== undefined) current.d = props.d as boolean;
        if (props.g !== undefined) current.g = props.g as boolean;
        if (props.sm !== undefined) current.sm = String(props.sm);
        if (props.sb !== undefined) current.sb = String(props.sb);
        if (props.st !== undefined) current.st = String(props.st);
      }
    }

    // End of row: advance Y by 1, reset X to rotation origin (matching original KLE)
    current.y = (current.y as number) + 1;
    current.x = (current.rx as number) ?? 0;
  }

  return keys;
}

/**
 * Parse KLE JSON (layouts.json) format into a KLELayout.
 *
 * KLE JSON format is an array of rows, with an optional metadata object
 * as the first element:
 *
 * ```json
 * [
 *   { "backcolor": "#151A21" },  // Optional metadata
 *   ["Esc", { "x": 1 }, "F1"],   // Row 1
 *   [{ "y": 0.5 }, "~\n`", ...]  // Row 2
 * ]
 * ```
 */
export function parseKLEJSON(data: unknown): KLELayout | null {
  if (!Array.isArray(data)) return null;
  if (data.length === 0) {
    return { meta: { ...DEFAULT_META }, keys: [] };
  }

  const meta: Partial<KLEMeta> = {};
  let keyData: unknown[];

  // First element may be a metadata object if it's not an array
  if (typeof data[0] === "object" && !Array.isArray(data[0]) && data[0] !== null) {
    const metaObj = data[0] as Partial<KLEMeta>;
    // Only treat as metadata if it has metadata-specific keys
    // (key prop objects only have: r, rx, ry, x, y, w, h, x2, y2, w2, h2,
    //  a, f, f2, fa, p, c, t, d, g, l, n, sm, sb, st)
    const metaKeys = new Set(Object.keys(metaObj));
    const hasOnlyKeyProps = [...metaKeys].every(k => KLE_KEY_PROPS.has(k));

    if (!hasOnlyKeyProps) {
      // It's a metadata object
      for (const key of ["name", "author", "backcolor", "background", "css", "notes", "radii",
                         "switchMount", "switchBrand", "switchType"] as const) {
        if (metaObj[key] !== undefined) meta[key] = String(metaObj[key]);
      }
      keyData = data.slice(1);
    } else {
      // It's a key-level props object at the start (edge case: single-element layout)
      keyData = data;
    }
  } else {
    keyData = data;
  }

  const keys = parseLayoutJSON(keyData);
  return {
    meta: { ...DEFAULT_META, ...meta } as KLEMeta,
    keys,
    _sourceCache: data, // Preserve original rows for exact round-trip
  };
}

/**
 * Convert intermediate format (from keyPropsToIntermediate) to KLE JSON format.
 *
 * keyPropsToIntermediate produces INTERMEDIATE format for URLON encoding,
 * where metadata is wrapped as [metaObj] (a row with one item).
 * KLE JSON format requires metadata as a bare object at the top level.
 */
export function intermediateToJSONFormat(intermediate: unknown[]): unknown[] {
  if (intermediate.length === 0) return intermediate;

  const first = intermediate[0];
  // Check if first element is a single-element row wrapping a metadata object
  if (Array.isArray(first) && first.length === 1 && typeof first[0] === "object" && first[0] !== null) {
    const obj = first[0] as Partial<KLEMeta>;
    // Metadata objects have specific keys like backcolor, name, etc.
    // Key prop objects have keys like x, y, w, h, a, f, c, etc.
    const metaKeys = new Set(Object.keys(obj));
    const allKeyProps = [...metaKeys].every(k => KLE_KEY_PROPS.has(k));

    if (!allKeyProps && metaKeys.size > 0) {
      // Strip name and author — they're display labels, not structural metadata
      const cleanObj = { ...obj };
      delete cleanObj.name;
      delete cleanObj.author;

      if (Object.keys(cleanObj).length > 0) {
        return [cleanObj, ...intermediate.slice(1)];
      }
      // No structural metadata left — return rows only
      return intermediate.slice(1);
    }
  }

  return intermediate;
}

/**
 * Serialize a KLELayout to the KLE JSON (layouts.json) format.
 *
 * Uses _sourceCache if available (perfect round-trip), otherwise
 * falls back to keyPropsToIntermediate().
 */
export function serializeKLEJSON(layout: KLELayout): unknown[] {
  // Use _sourceCache if available — they're already in the correct JSON format
  if (layout._sourceCache) {
    // Even with _sourceCache, strip leading name/author from metadata if present
    const raw = layout._sourceCache;
    if (raw.length > 0 && typeof raw[0] === "object" && !Array.isArray(raw[0]) && raw[0] !== null) {
      const metaObj = raw[0] as Partial<KLEMeta>;
      if (metaObj.name || metaObj.author) {
        const clean = { ...metaObj };
        delete clean.name;
        delete clean.author;
        if (Object.keys(clean).length === 0) {
          return raw.slice(1) as unknown[];
        }
        return [clean, ...raw.slice(1)];
      }
    }
    return raw;
  }
  // Fallback: re-derive from KeyProps
  const intermediate = keyPropsToIntermediate(layout);
  return intermediateToJSONFormat(intermediate);
}

/**
 * Get the raw intermediate row data for a layout, in KLE JSON format.
 *
 * Uses _sourceCache if available (perfect round-trip), stripping display-only
 * metadata (name, author) from the first element if present.
 * Falls back to keyPropsToIntermediate() + intermediateToJSONFormat().
 */
export function getRawRows(layout: KLELayout): unknown[] {
  // Prefer saved _sourceCache — they preserve the exact original row structure
  if (layout._sourceCache) {
    const data = layout._sourceCache;
    if (data.length === 0) return data;

    // Check if first element is a bare metadata object (not wrapped in array)
    if (typeof data[0] === "object" && !Array.isArray(data[0]) && data[0] !== null) {
      const metaObj = data[0] as Partial<KLEMeta>;
      // Strip display-only metadata fields (name, author)
      if (metaObj.name !== undefined || metaObj.author !== undefined) {
        const cleaned = { ...metaObj };
        delete cleaned.name;
        delete cleaned.author;
        if (Object.keys(cleaned).length === 0) {
          // No meaningful metadata left — return rows only
          return data.slice(1);
        }
        return [cleaned, ...data.slice(1)];
      }
    }
    return data;
  }

  // Fallback: re-derive from KeyProps and convert to JSON format
  return intermediateToJSONFormat(keyPropsToIntermediate(layout));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

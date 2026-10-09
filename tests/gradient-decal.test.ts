import { describe, it, expect } from "vitest";
import { DEFAULT_PROPS, DEFAULT_META, type KLELayout, type KeyProps } from "../src/lib/kle-types";
import { serializeKLE, parseKLE } from "../src/lib/kle-parser";
import { exportSVG, exportJSON } from "../src/lib/kle-export";
import { parseKLEJSON } from "../src/lib/kle-serial";

function makeKey(over: Partial<KeyProps> = {}): KeyProps {
  const labels = Array(12).fill("");
  labels[4] = "A";
  return { ...DEFAULT_PROPS, labels, ...over };
}

function makeLayout(keys: KeyProps[], metaOver: Partial<typeof DEFAULT_META> = {}): KLELayout {
  return { meta: { ...DEFAULT_META, ...metaOver }, keys };
}

describe("gradient round-trip (KLE)", () => {
  it("preserves c2/cang through serialize → parse", () => {
    const layout = makeLayout([
      makeKey({ c: "#ff0000", c2: "#0000ff", cang: 45 }),
      makeKey({ c: "#00ff00" }),
    ]);
    const raw = serializeKLE(layout);
    const back = parseKLE(raw);
    expect(back.keys[0]!.c2).toBe("#0000ff");
    expect(back.keys[0]!.cang).toBe(45);
    // second key must not inherit the gradient (explicit clear)
    expect(back.keys[1]!.c2).toBeFalsy();
  });

  it("renders a gradient def + fill reference in SVG export", () => {
    const layout = makeLayout([makeKey({ c: "#ff0000", c2: "#0000ff", cang: 90 })]);
    const svg = exportSVG(layout, 1);
    expect(svg).toContain("<linearGradient id=\"kg_");
    expect(svg).toContain("stop-color=\"#0000ff\"");
    expect(svg).toContain("url(#kg_");
  });
});

describe("image decal", () => {
  const decalMeta = {
    decalImage: "data:image/png;base64,AAAA",
    decalScale: 1,
    decalX: 0,
    decalY: 0,
    decalDim: 0.4,
    decalOpacity: 1,
    decalNatW: 100,
    decalNatH: 80,
  };

  it("emits a decal pattern and uses it as key fill in SVG", () => {
    const layout = makeLayout([makeKey()], decalMeta);
    const svg = exportSVG(layout, 1);
    expect(svg).toContain("id=\"decalPattern\"");
    expect(svg).toContain("url(#decalPattern)");
    expect(svg).toContain(decalMeta.decalImage);
  });

  it("includes decal meta in exported KLE JSON", () => {
    const layout = makeLayout([makeKey()], decalMeta);
    const json = exportJSON(layout);
    expect(json).toContain("decalImage");
    expect(json).toContain("decalNatW");
  });

  it("restores decal meta when re-importing exported JSON", () => {
    const layout = makeLayout([makeKey()], decalMeta);
    const json = exportJSON(layout);
    const parsedJson = JSON.parse(json);
    const back = parseKLEJSON(parsedJson);
    expect(back).not.toBeNull();
    expect(back!.meta.decalImage).toBe(decalMeta.decalImage);
    expect(back!.meta.decalNatH).toBe(80);
  });

  it("omits decal pattern when no image is set", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout, 1);
    expect(svg).not.toContain("decalPattern");
  });
});

describe("parseColorInput integration", () => {
  it("accepts rgb/cmyk into a key color", async () => {
    const { parseColorInput } = await import("../src/lib/color-convert");
    expect(parseColorInput("rgb(255,0,0)")).toBe("#ff0000");
    expect(parseColorInput("cmyk(0,100,100,0)")).toBe("#ff0000");
  });
});

import { describe, it, expect } from 'vitest';
import { exportSVG } from '@/lib/kle-export';
import type { KeyProps, KLELayout } from '@/lib/kle-types';
import { DEFAULT_META } from '@/lib/kle-types';

// ── Test fixture helpers ──

function makeKey(overrides?: Partial<KeyProps>): KeyProps {
  return {
    labels: Array<string>(12).fill(""),
    align: 4,
    labelSize: 3,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    x2: 0,
    y2: 0,
    w2: 0,
    h2: 0,
    r: 0,
    rx: 0,
    ry: 0,
    c: "#cccccc",
    t: "#000000",
    textColor: [],
    textSize: [],
    f: 3,
    f2: 0,
    fa: [],
    p: "",
    d: false,
    g: false,
    l: false,
    n: false,
    sm: "",
    sb: "",
    st: "",
    stab: "",
    ...overrides,
  };
}

function makeLayout(keys: KeyProps[], metaOverrides?: Partial<KLELayout["meta"]>): KLELayout {
  return {
    meta: { ...DEFAULT_META, ...metaOverrides },
    keys,
  };
}

// ── Tests ──

describe("exportSVG", () => {
  // ── Empty / edge cases ──

  it("returns empty string when keys array is empty", () => {
    const layout = makeLayout([]);
    expect(exportSVG(layout)).toBe("");
  });

  // ── Required SVG attributes ──

  it("produces valid SVG root with xmlns", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("includes viewBox attribute", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toMatch(/viewBox="[\d.\-\s]+"/);
  });

  it("includes width and height attributes", () => {
    const layout = makeLayout([makeKey({ x: 0, y: 0, w: 1, h: 1 })]);
    const svg = exportSVG(layout);
    // Single 1u key: KEY_UNIT=54, PADDING=20, so width=height=54+20=74
    expect(svg).toContain('width="74"');
    expect(svg).toContain('height="74"');
  });

  it('includes style="max-width:100%;height:auto" (regression guard)', () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toContain('style="max-width:100%;height:auto"');
  });

  it("includes role and aria-label for accessibility", () => {
    const layout = makeLayout([makeKey()], { name: "TestBoard" });
    const svg = exportSVG(layout);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="TestBoard"');
  });

  // ── Scale parameter ──

  it("scales width and height by the scale factor", () => {
    const layout = makeLayout([makeKey()]);
    const svg1x = exportSVG(layout, 1);
    const svg2x = exportSVG(layout, 2);
    // 1x: 74×74, 2x: 148×148 (KEY_UNIT=54, PADDING=20)
    expect(svg1x).toContain('width="74"');
    expect(svg1x).toContain('height="74"');
    expect(svg2x).toContain('width="148"');
    expect(svg2x).toContain('height="148"');
  });

  // ── Snapshot tests ──

  it("snapshot: single 1u key with default color", () => {
    const layout = makeLayout([makeKey()]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: single 1u key with label", () => {
    const labels = Array<string>(12).fill("");
    labels[4] = "A";
    const layout = makeLayout([makeKey({ labels })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: 2x2 grid of 1u keys", () => {
    const keys: KeyProps[] = [
      makeKey({ x: 0, y: 0 }),
      makeKey({ x: 1, y: 0 }),
      makeKey({ x: 0, y: 1 }),
      makeKey({ x: 1, y: 1 }),
    ];
    const layout = makeLayout(keys);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: single rotated key (r=15)", () => {
    const layout = makeLayout([makeKey({ r: 15 })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: stepped key (l: true)", () => {
    const layout = makeLayout([makeKey({ l: true })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: homing key (n: true)", () => {
    const layout = makeLayout([makeKey({ n: true })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: decal key (d: true)", () => {
    const layout = makeLayout([makeKey({ d: true })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: ghosted key (g: true)", () => {
    const layout = makeLayout([makeKey({ g: true })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  it("snapshot: colored key with custom c and t", () => {
    const layout = makeLayout([makeKey({ c: "#ff6600", t: "#ffffff" })]);
    expect(exportSVG(layout)).toMatchSnapshot();
  });

  // ── lighten / darken color functions (via gradient defs) ──

  it("generates gradient defs for each unique key color", () => {
    const layout = makeLayout([
      makeKey({ c: "#ff0000" }),
      makeKey({ x: 1, c: "#0000ff" }),
    ]);
    const svg = exportSVG(layout);
    // Two distinct gradient IDs
    expect(svg).toContain('id="grad_ff0000"');
    expect(svg).toContain('id="grad_0000ff"');
  });

  it("litegen/lighten: gradient stop at 0% uses lighten(hex, 15)", () => {
    // lighten(#cccccc, 15) → rgb(212,212,212)
    const layout = makeLayout([makeKey({ c: "#cccccc" })]);
    const svg = exportSVG(layout);
    expect(svg).toContain('stop-color="rgb(212,212,212)"');
  });

  it("darken: gradient stop at 85% uses darken(hex, 10)", () => {
    // darken(#cccccc, 10) → rgb(184,184,184)
    const layout = makeLayout([makeKey({ c: "#cccccc" })]);
    const svg = exportSVG(layout);
    expect(svg).toContain('stop-color="rgb(184,184,184)"');
  });

  it("darken: gradient stop at 100% uses darken(hex, 18)", () => {
    // darken(#cccccc, 18) → rgb(167,167,167)
    const layout = makeLayout([makeKey({ c: "#cccccc" })]);
    const svg = exportSVG(layout);
    expect(svg).toContain('stop-color="rgb(167,167,167)"');
  });

  it("mid stop at 30% uses the original hex color unchanged", () => {
    const layout = makeLayout([makeKey({ c: "#cccccc" })]);
    const svg = exportSVG(layout);
    expect(svg).toContain('offset="30%" stop-color="#cccccc"');
  });

  it("verifies lighten/darken values for a custom hex color", () => {
    // lighten(#ff6600, 15): r=255, g=102+round((255-102)*0.15)=102+23=125, b=0+round(255*0.15)=38
    // → rgb(255,125,38)
    // darken(#ff6600, 10): r=round(255*0.9)=230, g=round(102*0.9)=92, b=0 → rgb(230,92,0)
    // darken(#ff6600, 18): r=round(255*0.82)=209, g=round(102*0.82)=84, b=0 → rgb(209,84,0)
    const layout = makeLayout([makeKey({ c: "#ff6600" })]);
    const svg = exportSVG(layout);
    expect(svg).toContain('stop-color="rgb(255,125,38)"');
    expect(svg).toContain('stop-color="rgb(230,92,0)"');
    expect(svg).toContain('stop-color="rgb(209,84,0)"');
  });

  // ── Non-rectangular keys (w2/h2) ──

  it("renders L-shaped path for key with w2 and h2", () => {
    // ISO Enter style: 1.5u main, 1.25u extension
    const layout = makeLayout([makeKey({ x: 13.5, y: 1, w: 1.5, h: 1, x2: -0.25, y2: -1, w2: 1.25, h2: 1 })]);
    const svg = exportSVG(layout);
    // Should contain a path element (L-shape) with d= attribute
    expect(svg).toContain('<path d="');
    expect(svg).toContain("fill=");
  });

  // ── Background color ──

  it("uses default white background when meta.backcolor is not set", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toContain('fill="#ffffff"');
  });

  it("uses meta.backcolor for the background rect", () => {
    const layout = makeLayout([makeKey()], { backcolor: "#e0e0e0" });
    const svg = exportSVG(layout);
    expect(svg).toContain('fill="#e0e0e0"');
  });

  // ── Structural integrity ──

  it("contains defs section with key-highlight gradient", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toContain('<defs>');
    expect(svg).toContain('id="key-highlight"');
  });

  it("contains grid lines for accurate positioning", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg).toContain("<line");
    expect(svg).toContain('stroke="#e8e8e8"');
  });

  it("avoids duplicate gradient defs for keys sharing the same color", () => {
    const layout = makeLayout([
      makeKey({ x: 0, c: "#cccccc" }),
      makeKey({ x: 1, c: "#cccccc" }),
      makeKey({ x: 2, c: "#cccccc" }),
    ]);
    const svg = exportSVG(layout);
    // grad_cccccc should appear exactly once in defs
    const matches = svg.match(/id="grad_cccccc"/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("starts with <svg and ends with </svg>", () => {
    const layout = makeLayout([makeKey()]);
    const svg = exportSVG(layout);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  // ── Labels rendering ──

  it("renders center label (position 4) in the key center", () => {
    const labels = Array<string>(12).fill("");
    labels[4] = "Esc";
    const layout = makeLayout([makeKey({ labels })]);
    const svg = exportSVG(layout);
    expect(svg).toContain(">Esc<");
  });

  it("renders top-left label (position 0)", () => {
    const labels = Array<string>(12).fill("");
    labels[0] = "TL";
    const layout = makeLayout([makeKey({ labels })]);
    const svg = exportSVG(layout);
    expect(svg).toContain(">TL<");
  });

  it("escapes XML special characters in labels", () => {
    const labels = Array<string>(12).fill("");
    labels[4] = "A&B";
    const layout = makeLayout([makeKey({ labels })]);
    const svg = exportSVG(layout);
    expect(svg).toContain("A&amp;B");
    expect(svg).not.toContain("A&B<");
  });

  // ── Layout name fallback ──

  it('uses "Keyboard Layout" aria-label when meta.name is empty', () => {
    const layout = makeLayout([makeKey()], { name: "" });
    const svg = exportSVG(layout);
    expect(svg).toContain('aria-label="Keyboard Layout"');
  });
});

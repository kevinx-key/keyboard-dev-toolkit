import { describe, it, expect } from "vitest";
import {
  normalizeHex,
  hexToRgb,
  rgbToHex,
  rgbToCmyk,
  cmykToRgb,
  rgbToHsv,
  hsvToRgb,
  cmykToHex,
  parseColorInput,
} from "../src/lib/color-convert";

describe("normalizeHex", () => {
  it("expands 3-digit hex", () => {
    expect(normalizeHex("#f00")).toBe("#ff0000");
  });
  it("expands 4-digit hex (with alpha)", () => {
    expect(normalizeHex("#f00a")).toBe("#ff0000aa");
  });
  it("lowercases and adds leading #", () => {
    expect(normalizeHex("FFFFFF")).toBe("#ffffff");
  });
  it("keeps 8-digit hex", () => {
    expect(normalizeHex("#11223344")).toBe("#11223344");
  });
  it("rejects invalid", () => {
    expect(normalizeHex("#xyz")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });
});

describe("hex <-> rgb", () => {
  it("parses hex to rgb", () => {
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });
  it("round-trips rgb -> hex", () => {
    expect(rgbToHex({ r: 255, g: 128, b: 0 })).toBe("#ff8000");
  });
  it("includes alpha when < 1", () => {
    expect(rgbToHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });
});

describe("rgb <-> cmyk", () => {
  it("converts red to cmyk", () => {
    expect(rgbToCmyk({ r: 255, g: 0, b: 0 })).toEqual({ c: 0, m: 100, y: 100, k: 0 });
  });
  it("converts cmyk to red", () => {
    expect(cmykToRgb({ c: 0, m: 100, y: 100, k: 0 })).toEqual({ r: 255, g: 0, b: 0 });
  });
  it("cmykToHex", () => {
    expect(cmykToHex({ c: 0, m: 0, y: 0, k: 100 })).toBe("#000000");
  });
});

describe("rgb <-> hsv", () => {
  it("converts red to hsv", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
  });
  it("round-trips", () => {
    const rgb = hsvToRgb({ h: 210, s: 50, v: 80 });
    const back = rgbToHsv(rgb);
    expect(Math.abs(back.h - 210)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.s - 50)).toBeLessThanOrEqual(2);
    expect(Math.abs(back.v - 80)).toBeLessThanOrEqual(2);
  });
});

describe("parseColorInput", () => {
  it("parses hex", () => {
    expect(parseColorInput("#fff")).toBe("#ffffff");
    expect(parseColorInput("ff0000")).toBe("#ff0000");
  });
  it("parses rgb()", () => {
    expect(parseColorInput("rgb(255,0,0)")).toBe("#ff0000");
    expect(parseColorInput("rgb(255 128 0)")).toBe("#ff8000");
    expect(parseColorInput("rgba(0,0,0,0.5)")).toBe("#00000080");
    expect(parseColorInput("rgb(100%,0%,0%)")).toBe("#ff0000");
  });
  it("parses cmyk()", () => {
    expect(parseColorInput("cmyk(0,100,100,0)")).toBe("#ff0000");
    expect(parseColorInput("cmyk(0%,0%,0%,100%)")).toBe("#000000");
    expect(parseColorInput("cmyk(0,1,1,0)")).toBe("#ff0000");
  });
  it("returns null for garbage", () => {
    expect(parseColorInput("not-a-color")).toBeNull();
    expect(parseColorInput("")).toBeNull();
  });
});

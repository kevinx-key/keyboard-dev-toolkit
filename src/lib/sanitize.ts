/**
 * 统一消毒层: SVG 纵深防御 + KLE 标签 HTML 白名单 + 颜色值校验
 *
 * 设计原则:
 * 1. 输入端消毒(颜色值校验) - 从源头阻断属性注入
 * 2. 输出端防御(sanitizeSvg) - 即使数据异常也在渲染前拦截
 * 3. KLE 标签(sanitizeLabelHtml) - 只允许 KLE 原生支持的标签
 *
 * M3 防御架构说明:
 * - sanitizeSvg: 5层 SVG 纵深防御(strip script|foreignObject|on* handler|危险 href|CDATA)
 * - sanitizeLabelHtml: 白名单标签 + event strip + 危险 href + 未闭合标签修复
 * - isValidHexColor: 精确颜色值校验(仅 3/4/6/8 位 hex)
 * - dangerouslySetInnerHTML 用于渲染 SVG(React 唯一方式),内容均经消毒函数处理
 */

// ─── SVG 消毒 ───────────────────────────────────────────

/** 解码 HTML 实体（仅解常见字符，足以防止实体编码绕过） */
function decodeEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

/** 检测 href 值是否含危险的 URI scheme（含绕过归一化） */
function isDangerousHref(value: string): boolean {
  // 归一化：统一引号 → 无引号、strip 空白、小写
  const safe = value.replace(/["']/g, "").replace(/\s+/g, "").toLowerCase();
  if (safe.startsWith("javascript:")) return true;
  if (safe.startsWith("data:text/html")) return true;
  // 实体解码后再检查
  const decoded = decodeEntities(safe);
  if (decoded.startsWith("javascript:")) return true;
  if (decoded.startsWith("data:text/html")) return true;
  return false;
}

/** SVG 纵深消毒：strip 脚本/事件/危险 URL/foreignObject */
export function sanitizeSvg(svg: string): string {
  if (!svg) return svg;

  let cleaned = svg;

  // 1. 移除 <script> 块及其内容
  cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  // 2. 移除 <foreignObject>（潜在的 HTML 注入向量）
  cleaned = cleaned.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "");
  // 3. 移除 on* 事件处理器（onclick, onload, onerror 等）
  cleaned = cleaned.replace(/\s+\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 4. 移除危险 href — 统一走 isDangerousHref 检测（含换行/实体绕过）
  cleaned = cleaned.replace(
    /(?:href|xlink:href)\s*=\s*((?:"[^"]*")|(?:'[^']*')|(?:[^\s>]+))/gi,
    (match, value: string) => {
      if (isDangerousHref(value)) {
        return match.includes("xlink:") ? 'xlink:href="#"' : 'href="#"';
      }
      return match;
    },
  );
  // 5. strip <![CDATA[ ... ]]> 中的可疑内容 — 保持 CDATA 但不含脚本
  cleaned = cleaned.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, (cdata) => {
    if (/script|<script|on\w+\s*=|javascript:/i.test(cdata)) return "";
    return cdata;
  });

  return cleaned;
}

// ─── KLE 标签 HTML 白名单消毒 ────────────────────────────

/**
 * KLE 标签支持的原生 HTML：
 *   <b> <i> <u> <sub> <sup> <br> <font color="...">
 *
 * 所有其他标签/属性/事件处理器均被剥离。
 */
export function sanitizeLabelHtml(html: string): string {
  if (!html) return html;

  let cleaned = html;

  // 1. 先 strip 事件处理器（onclick, onload 等）
  cleaned = cleaned.replace(/\s+\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // 2. strip 危险 URL（统一走 isDangerousHref）
  cleaned = cleaned.replace(/href\s*=\s*((?:"[^"]*")|(?:'[^']*')|(?:[^\s>]+))/gi, (match, value: string) => {
    return isDangerousHref(value) ? 'href="#"' : match;
  });

  // 3. 白名单标签过滤
  const ALLOWED_TAGS = new Set(["b", "i", "u", "sub", "sup", "br", "font"]);

  cleaned = cleaned.replace(/<\/?(\w+)([^>]*)>/gi, (match, tagName, attrs) => {
    const tag = tagName.toLowerCase();

    // 不在白名单 → 剥离
    if (!ALLOWED_TAGS.has(tag)) return "";

    // 闭合标签
    if (match.startsWith("</")) {
      // 自闭合标签不输出闭合
      if (tag === "br") return "";
      return `</${tag}>`;
    }

    // <br> 只能自闭合
    if (tag === "br") return "<br>";

    // <font> 只保留 color 属性（且必须为合法 hex 颜色）
    if (tag === "font") {
      const colorMatch = attrs.match(/\bcolor\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      if (colorMatch) {
        const colorVal = colorMatch[1] ?? colorMatch[2] ?? "";
        if (isValidHexColor(colorVal)) {
          return `<font color="${colorVal}">`;
        }
      }
      return "<font>";
    }

    // b, i, u, sub, sup — strip 所有属性
    return `<${tag}>`;
  });

  // 4. 安全校验：确保没有标签未闭合（防止渲染崩塌）
  const openCount = (cleaned.match(/<(b|i|u|sub|sup|font)\b[^>]*>/gi) || []).length;
  const closeCount = (cleaned.match(/\/(b|i|u|sub|sup|font)>/gi) || []).length;

  if (openCount > closeCount) {
    const stack: string[] = [];
    const tagRe = /<\/?(\w+)([^>]*)>/gi;
    let m: RegExpExecArray | null;
    tagRe.lastIndex = 0;
    while ((m = tagRe.exec(cleaned)) !== null) {
      const t = m[1]!.toLowerCase();
      if (m[0].startsWith("</")) {
        if (stack.length > 0 && stack[stack.length - 1] === t) {
          stack.pop();
        }
      } else if (t !== "br") {
        stack.push(t);
      }
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      cleaned += `</${stack[i]}>`;
    }
  }

  return cleaned;
}

// ─── 颜色值校验 ──────────────────────────────────────────

/** 校验十六进制颜色值 #rgb / #rrggbb / #rrggbbaa */
export function isValidHexColor(value: string): boolean {
  if (typeof value !== "string" || !value.startsWith("#") || value.length < 4) return false;
  // 精确匹配 CSS 支持的长度：3, 4, 6, 8 位 hex
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

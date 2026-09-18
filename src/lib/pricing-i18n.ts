// pricing-i18n.ts — 报价模块本地化辅助
//
// /api/meta 返回的选项名（materials / surfaceFinish / solderColors / options / extras /
// plateMaterials）只有中文原文；此处按选项 key 映射到 i18n 字典，缺失时回退服务端名称。
// 服务端 reason / notice 亦按 code 或原文精确匹配做兜底本地化。

import { DICT, type Lang } from "./i18n";

/** 语言 → BCP-47 locale（复制报价单里的时间戳等格式化用） */
export const LANG_LOCALE: Record<Lang, string> = {
  en: "en-US",
  zh: "zh-CN",
  "zh-HK": "zh-HK",
  ko: "ko-KR",
  ja: "ja-JP",
  ru: "ru-RU",
  fr: "fr-FR",
  pt: "pt-BR",
  es: "es-MX",
};

type T = (key: string) => string;

// 选项分类 → i18n key 前缀
const CAT_PREFIX: Record<string, string> = {
  material: "pricing.opt.material",
  surface: "pricing.opt.surface",
  solderColor: "pricing.opt.solderColor",
  comm: "pricing.comm",
  solder: "pricing.solder",
  peripheral: "pricing.peripheral",
  logo: "pricing.logo",
  protection: "pricing.protection",
  test: "pricing.test",
  packaging: "pricing.packaging",
  subBoard: "pricing.opt.subBoard",
  cable: "pricing.opt.cable",
  firmware: "pricing.opt.firmware",
  tracing: "pricing.opt.tracing",
  plateMaterial: "pricing.opt.plateMaterial",
};

// 个别 key 与字典命名不一致
const KEY_OVERRIDE: Record<string, string> = {
  "logo.custom": "own",
};

/** 取本地化选项名；字典无对应键时回退 fallback（通常是服务端 name）或 key 本身 */
export function tOption(t: T, category: string, key: string, fallback?: string): string {
  const prefix = CAT_PREFIX[category];
  if (!prefix) return fallback ?? key;
  const k = `${prefix}.${KEY_OVERRIDE[`${category}.${key}`] ?? key}`;
  return k in DICT ? t(k) : (fallback ?? key);
}

/** 模板占位符填充（{name} / {n} / {value} …） */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// 服务端固定文案 → i18n key
const SERVER_TEXT_KEYS: Record<string, string> = {
  "OSP 工艺超出自动计价范围，请联系客服单独核算报价": "pricing.server.rejectOsp",
  "OLED 屏幕超出自动计价范围，请联系客服单独核算报价": "pricing.server.rejectOled",
  "三防漆工艺超出自动计价范围，请联系客服单独核算报价": "pricing.server.rejectConformal",
  "定制其他设备超出自动计价范围，请联系客服单独核算报价": "pricing.server.rejectOtherDevice",
  "PCB 尺寸超出分料板可排版范围，请联系客服单独核算报价": "pricing.server.panelOverLimit",
  "PCB 尺寸超出单张板材可排版面积，请联系客服单独核算报价": "pricing.server.boardTooLarge",
  "材质配置缺失": "pricing.server.materialMissing",
  "定位板材质配置缺失": "pricing.server.plateMaterialMissing",
  "请求体无法解析为 JSON": "pricing.server.badJson",
};

/** 服务端单条文案兜底本地化（未知文案原样返回） */
export function tServerText(t: T, text: string): string {
  const k = SERVER_TEXT_KEYS[text];
  if (k) return t(k);
  const manual = /^(.+?)\s*需人工报价$/.exec(text);
  if (manual) return fill(t("pricing.server.needManual"), { name: manual[1] ?? "" });
  return text;
}

/** 服务端 notice（多条以「；」拼接）逐条本地化 */
export function tServerNotice(t: T, notice: string): string {
  return notice
    .split("；")
    .map((s) => tServerText(t, s.trim()))
    .filter(Boolean)
    .join("; ");
}

// 从服务端动态 reason 中取出「：」后的具体细节（去掉尾部的可选值括号）
function detailOf(reason: string): string {
  const i = reason.indexOf("：");
  if (i < 0) return reason;
  let d = reason.slice(i + 1).trim();
  const p = d.indexOf("（");
  if (p > 0) d = d.slice(0, p).trim();
  return d;
}

/** 报价失败原因：优先按 code 本地化，未知 code 走原文兜底 */
export function tQuoteReason(t: T, code: string | undefined, reason: string): string {
  switch (code) {
    case "QUOTE_MATERIAL_MISSING":
      return t("pricing.server.materialMissing");
    case "QUOTE_PLATE_MATERIAL_MISSING":
      return t("pricing.server.plateMaterialMissing");
    case "QUOTE_PANEL_OVER_LIMIT":
    case "QUOTE_PLATE_PANEL_OVER_LIMIT":
      return t("pricing.server.panelOverLimit");
    case "QUOTE_BOARD_TOO_LARGE":
    case "QUOTE_PLATE_TOO_LARGE":
      return t("pricing.server.boardTooLarge");
    case "QUOTE_BAD_JSON":
      return t("pricing.server.badJson");
    case "QUOTE_UNKNOWN_MATERIAL":
      return fill(t("pricing.server.unknownMaterial"), { detail: detailOf(reason) });
    case "QUOTE_UNKNOWN_PLATE_MATERIAL":
      return fill(t("pricing.server.unknownPlateMaterial"), { detail: detailOf(reason) });
    case "QUOTE_INVALID_INPUT":
      return fill(t("pricing.server.invalidInput"), { detail: detailOf(reason) });
    case "QUOTE_NON_FINITE_RESULT":
      return fill(t("pricing.server.nonFinite"), { detail: detailOf(reason) });
    default:
      return tServerText(t, reason);
  }
}

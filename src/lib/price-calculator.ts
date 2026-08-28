import type { PricingConfig } from "./pricing-types";

/**
 * 计价引擎（纯函数，无 DOM 依赖）— v2 按开板方式计价
 *
 * 计费尺寸: 长 = max(L,W)，宽 = min(L,W) + 2×辅助边（辅助边永远加短边）
 * 出板数 N = ⌊ 板材可用面积(总面积×0.8) ÷ 计费面积 ⌋  （向下取整）
 * 张数     = ⌈ 数量 ÷ N ⌉
 *
 * 板材模式（≥30 PCS）: 大板 1245×1041，板材费 = 张数×(材质板价+加工费)
 * 分料板模式（<30）:   料板 487.5×310.7，板材费 = 张数×(材质料板价+加工费)
 *                     单板长>390mm 或宽>248.56mm → 拒绝自动计价
 *
 * 数量: ≥5，非 5 倍数向上取整（多出部分按报废仍计成本）
 */

export interface PricingFormData {
  lengthMm: number;
  widthMm: number;
  quantity: number;
  material: string;
  thicknessMm: number;
  surfaceFinish: string;
  solderColor: string;
  communication: string[];
  hotswap: boolean;
  encoderCount: number;
  oled: boolean;
  rgb: boolean;
  logo: string;
  protection: string;
  test: string;
  packaging: string[];
  keyCount: number;
  /** v2.6.0 附加组件：额外小板（none/onboardUsb/c5/s3/custom，单选） */
  subBoard: string;
  /** v2.6.0 附加组件：排线类型（black/fpc） */
  cableType: string;
  /** v2.6.0 附加组件：排线线长 mm（生产信息，不计价；≤100） */
  cableLengthMm: number;
  /** v2.6.0 附加组件：自定义固件（多选：lightEffect/webConsole/otherDevice） */
  firmware: string[];
  /** v2.6.0 附加组件：走线（rounded/beveled/custom，单选） */
  tracing: string;
  /** v2.6.0 定位板报价：材质 key（"" 或缺省 = 不报价） */
  plateMaterial: string;
  /** v2.6.0 定位板报价：尺寸 mm（0 = 跟随定位板编辑器，由调用方传入 resolved 值） */
  plateLengthMm: number;
  plateWidthMm: number;
  /** v2.6.0 定位板报价：独立数量（0 = 不报价；≥5 且 5 的倍数取整） */
  plateQuantity: number;
}

export interface BreakdownItem {
  name: string;
  amount: number;
  detail?: string;
  /** 不计入终端倍率（原价加在倍率之后） */
  noMultiplier?: boolean;
}

export interface QuoteResult {
  ok: boolean;
  reason?: string;
  /** 非阻断性提示（如快递费超限未收取） */
  notice?: string;
  mode: "panel" | "partial";
  effectiveQty: number;
  wasteQty: number;
  chargeSizeMm: { l: number; w: number };
  boardsPerSheet: number;
  sheets: number;
  areaSqm: number;
  boardCost: number;
  processFee: number;
  /** 成本合计（未乘终端倍率） */
  rawTotal: number;
  /** 计入终端倍率的成本小计（板材+工艺，剔除排除项） */
  baseTotal: number;
  /** 不计入终端倍率的费用（原价加在倍率之后） */
  exclTotal: number;
  /** 终端报价倍率（pricing.json terminalMultiplier） */
  terminalMultiplier: number;
  /** 终端报价 = baseTotal × terminalMultiplier + exclTotal */
  totalPrice: number;
  unitPrice: number;
  breakdown: BreakdownItem[];
  /** v2.6.0 定位板独立报价（独立数量/尺寸/材质，不并入本总价）；null = 未报价 */
  plateQuote: PlateQuote | null;
}

/** v2.6.0 定位板独立报价结果（只含板材费：材质板价 + 加工费，不计终端倍率） */
export interface PlateQuote {
  ok: boolean;
  reason?: string;
  mode: "panel" | "partial";
  effectiveQty: number;
  wasteQty: number;
  chargeSizeMm: { l: number; w: number };
  boardsPerSheet: number;
  sheets: number;
  areaSqm: number;
  boardCost: number;
  unitPrice: number;
}

export const QUANTITY_MIN = 5;
export const DIMENSION_MM_MIN = 1;
export const DIMENSION_MM_MAX = 10000;
export const PANEL_OVER_LIMIT_MSG = "PCB 尺寸超出分料板可排版范围，请联系客服单独核算报价";
export const BOARD_TOO_LARGE_MSG = "PCB 尺寸超出单张板材可排版面积，请联系客服单独核算报价";

/** 校验输入，返回错误信息列表（空 = 通过；数量非 5 倍数不算错，按报废计成本） */
export function validatePricingInput(d: PricingFormData): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(d.lengthMm) || d.lengthMm < DIMENSION_MM_MIN || d.lengthMm > DIMENSION_MM_MAX) {
    errors.push(`lengthMm 超出范围 (${DIMENSION_MM_MIN}–${DIMENSION_MM_MAX})`);
  }
  if (!Number.isFinite(d.widthMm) || d.widthMm < DIMENSION_MM_MIN || d.widthMm > DIMENSION_MM_MAX) {
    errors.push(`widthMm 超出范围 (${DIMENSION_MM_MIN}–${DIMENSION_MM_MAX})`);
  }
  if (!Number.isFinite(d.quantity) || d.quantity < QUANTITY_MIN) {
    errors.push(`quantity 必须 ≥${QUANTITY_MIN}`);
  }
  if (!Number.isFinite(d.encoderCount) || d.encoderCount < 0 || !Number.isInteger(d.encoderCount)) {
    errors.push("encoderCount 必须为非负整数");
  }
  return errors;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const reject = (reason: string): QuoteResult => ({
  ok: false,
  reason,
  mode: "partial",
  effectiveQty: 0,
  wasteQty: 0,
  chargeSizeMm: { l: 0, w: 0 },
  boardsPerSheet: 0,
  sheets: 0,
  areaSqm: 0,
  boardCost: 0,
  processFee: 0,
  rawTotal: 0,
  baseTotal: 0,
  exclTotal: 0,
  terminalMultiplier: 1,
  totalPrice: 0,
  unitPrice: 0,
  breakdown: [],
  plateQuote: null,
});

/**
 * v2.6.0 定位板报价（复用 PCB 板材逻辑：大板/分料板模式、0.8 利用率、辅助边、超限检查）
 * 尺寸/数量由调用方传入 resolved 值；不参与 PCB 总价与终端倍率
 */
export function calculatePlateQuote(
  rules: PricingConfig["panelRules"],
  materials: PricingConfig["plate"]["materials"],
  lengthMm: number,
  widthMm: number,
  quantity: number,
  materialKey: string,
): PlateQuote | null {
  if (quantity <= 0 || lengthMm <= 0 || widthMm <= 0) return null;
  const effectiveQty = Math.ceil(quantity / rules.qtyStep) * rules.qtyStep;
  const wasteQty = effectiveQty - quantity;
  const material = materials.find((m) => m.key === materialKey) ?? materials[0];
  if (!material) return null;

  const l = Math.max(lengthMm, widthMm);
  const w = Math.min(lengthMm, widthMm) + rules.edgeRailMm * 2;
  const chargeArea = l * w;

  const isPanel = effectiveQty >= rules.panel.minQty;
  const sheet = isPanel ? rules.panel : rules.partial;
  const usableArea = sheet.lengthMm * sheet.widthMm * rules.wasteFactor;

  if (!isPanel) {
    const maxDim = Math.max(lengthMm, widthMm);
    const minDim = Math.min(lengthMm, widthMm);
    if (maxDim > rules.partial.lengthMm * rules.partial.limitFactor || minDim > rules.partial.widthMm * rules.partial.limitFactor) {
      return { ok: false, reason: PANEL_OVER_LIMIT_MSG, mode: "partial", effectiveQty, wasteQty, chargeSizeMm: { l, w }, boardsPerSheet: 0, sheets: 0, areaSqm: 0, boardCost: 0, unitPrice: 0 };
    }
  }

  const boardsPerSheet = Math.floor(usableArea / chargeArea);
  if (boardsPerSheet <= 0) {
    return { ok: false, reason: BOARD_TOO_LARGE_MSG, mode: isPanel ? "panel" : "partial", effectiveQty, wasteQty, chargeSizeMm: { l, w }, boardsPerSheet: 0, sheets: 0, areaSqm: 0, boardCost: 0, unitPrice: 0 };
  }

  const sheets = Math.ceil(effectiveQty / boardsPerSheet);
  const unitPrice = isPanel ? material.panelPrice : material.partialPrice;
  const boardCost = sheets * (unitPrice + sheet.processFee);
  const areaSqm = (sheets * sheet.lengthMm * sheet.widthMm) / 1e6;

  return {
    ok: true,
    mode: isPanel ? "panel" : "partial",
    effectiveQty,
    wasteQty,
    chargeSizeMm: { l, w },
    boardsPerSheet,
    sheets,
    areaSqm: round2(areaSqm),
    boardCost: round2(boardCost),
    unitPrice: round2(effectiveQty > 0 ? boardCost / effectiveQty : 0),
  };
}

/** 主计算入口 */
export function calculatePrice(config: PricingConfig, d: PricingFormData): QuoteResult {
  const errors = validatePricingInput(d);
  if (errors.length > 0) return reject(`计价参数无效: ${errors.join("; ")}`);

  const rules = config.panelRules;
  const effectiveQty = Math.ceil(d.quantity / rules.qtyStep) * rules.qtyStep;
  const wasteQty = effectiveQty - d.quantity;

  const material = config.materials.find((m) => m.key === d.material) ?? config.materials[0]!;

  // ── 计费尺寸（辅助边加短边） ──
  const l = Math.max(d.lengthMm, d.widthMm);
  const w = Math.min(d.lengthMm, d.widthMm) + rules.edgeRailMm * 2;
  const chargeArea = l * w;

  // ── 模式选择 ──
  const isPanel = effectiveQty >= rules.panel.minQty;
  const sheet = isPanel ? rules.panel : rules.partial;
  const sheetArea = sheet.lengthMm * sheet.widthMm;
  const usableArea = sheetArea * rules.wasteFactor;

  // ── 小批量超限检查（用归一化尺寸，旋转/竖屏输入不误判） ──
  if (!isPanel) {
    const maxDim = Math.max(d.lengthMm, d.widthMm);
    const minDim = Math.min(d.lengthMm, d.widthMm);
    const limitL = rules.partial.lengthMm * rules.partial.limitFactor;
    const limitW = rules.partial.widthMm * rules.partial.limitFactor;
    if (maxDim > limitL || minDim > limitW) {
      return reject(PANEL_OVER_LIMIT_MSG);
    }
  }

  // ── 板材费 ──
  const boardsPerSheet = Math.floor(usableArea / chargeArea);
  if (boardsPerSheet <= 0) {
    return reject(BOARD_TOO_LARGE_MSG);
  }
  const sheets = Math.ceil(effectiveQty / boardsPerSheet);
  const unitBoardPrice = isPanel ? material.panelPrice : material.partialPrice;
  const boardCost = sheets * (unitBoardPrice + sheet.processFee);
  const areaSqm = (sheets * sheetArea) / 1e6;

  // ── 工艺费 ──
  const breakdown: BreakdownItem[] = [];
  /** v2.6.0：选项类"需人工报价"改为非阻断提示（尺寸超限仍阻断） */
  const notices: string[] = [];
  let processFee = 0;
  /** 不计入终端倍率的费用小计 */
  let exclFee = 0;

  const add = (name: string, amount: number, detail?: string, noMultiplier = false) => {
    if (amount > 0) {
      breakdown.push({ name, amount: round2(amount), detail, noMultiplier });
      if (noMultiplier) exclFee += amount;
    }
    processFee += amount;
  };

  // 表面处理
  const sf = config.surfaceFinish[d.surfaceFinish];
  if (sf) {
    if (sf.reject) {
      notices.push(sf.rejectReason ?? `${sf.name} 需人工报价`);
    } else if (typeof sf.feePerPanel === "number" && sf.feePerPanel > 0) {
      const enigFee = isPanel
        ? sheets * sf.feePerPanel
        : (sheets * sheetArea * sf.feePerPanel) / (rules.panel.lengthMm * rules.panel.widthMm);
      add(sf.name, enigFee, isPanel ? `${sheets} 张 × ${sf.feePerPanel}` : "按消耗料板面积折算");
    }
  }

  // 颜色油墨
  const color = config.solderColors.find((c) => c.key === d.solderColor);
  if (color) {
    const extra = !isPanel && color.smallBatchExtra ? color.smallBatchExtra : 0;
    const colorFee = areaSqm * (color.feePerSqm + extra);
    if (colorFee > 0) add(color.name, colorFee, `${areaSqm.toFixed(3)} ㎡ × ${color.feePerSqm + extra}`);
  }

  // 通信（多选）
  for (const key of d.communication) {
    const item = config.options.communication[key];
    if (item) {
      if (item.reject) notices.push(item.rejectReason ?? `${item.name ?? key} 需人工报价`);
      else if (item.feePerPcs && item.feePerPcs > 0) add(item.name ?? key, item.feePerPcs * effectiveQty, undefined, item.noMultiplier);
    }
  }

  // 焊接：热插拔
  const hotswap = config.options.solder["hotswap"];
  if (d.hotswap && hotswap?.feePerPcsPerKey) {
    const fee = d.keyCount * hotswap.feePerPcsPerKey * effectiveQty;
    add(hotswap.name ?? "热插拔", fee, `${d.keyCount} 键 × ${hotswap.feePerPcsPerKey} × ${effectiveQty} PCS`, hotswap.noMultiplier);
  }

  // 外设：Encoder / OLED
  const oled = config.options.oled;
  if (d.oled && oled.reject) {
    notices.push(oled.rejectReason ?? "OLED 屏幕需人工报价");
  }
  const enc = config.options.encoder;
  if (d.encoderCount > 0 && enc.feePerPcs) {
    add(enc.name ?? "旋钮", enc.feePerPcs * d.encoderCount * effectiveQty, `${d.encoderCount} × ${enc.feePerPcs} × ${effectiveQty} PCS`, enc.noMultiplier);
  }

  // Logo
  const logo = config.options.logo[d.logo];
  if (logo) {
    if (logo.reject) notices.push(logo.rejectReason ?? `${logo.name ?? "Logo"} 需人工报价`);
    else if (logo.feePerOrder && logo.feePerOrder > 0) add(logo.name ?? "Logo", logo.feePerOrder, "按订单", logo.noMultiplier);
  }

  // 三防
  const prot = config.options.protection[d.protection];
  if (prot) {
    if (prot.reject) notices.push(prot.rejectReason ?? `${prot.name ?? "防护"} 需人工报价`);
    else if (prot.feePerPcs && prot.feePerPcs > 0) add(prot.name ?? "防护", prot.feePerPcs * effectiveQty, undefined, prot.noMultiplier);
  }

  // 测试
  const test = config.options.test[d.test];
  if (test) {
    if (test.reject) notices.push(test.rejectReason ?? `${test.name ?? "测试"} 需人工报价`);
    else if (test.feePerPcs && test.feePerPcs > 0) {
      add(test.name ?? "测试", test.feePerPcs * effectiveQty, undefined, test.noMultiplier);
    } else if (test.feeFactor && test.feePerPcsEquivalent) {
      if (effectiveQty < (test.fullBelowQty ?? 30)) {
        const full = config.options.test["full"];
        add(full?.name ?? "全检", (full?.feePerPcs ?? 6) * effectiveQty, "<30 PCS 默认全检", full?.noMultiplier);
      } else {
        add(test.name ?? "抽检", effectiveQty * test.feeFactor * test.feePerPcsEquivalent, `${effectiveQty} × ${test.feeFactor} × ${test.feePerPcsEquivalent}`, test.noMultiplier);
      }
    }
  }

  // 包装（多选）
  for (const key of d.packaging) {
    const item = config.options.packaging[key];
    if (item?.feePerPcs && item.feePerPcs > 0) {
      add(item.name ?? key, item.feePerPcs * effectiveQty, undefined, item.noMultiplier);
    }
  }

  // ── v2.6.0 附加组件（全部 noMultiplier 不计入终端倍率） ──
  // 额外小板（单选，feePerPcs）
  const subBoard = config.extras.subBoard[d.subBoard];
  if (subBoard?.feePerPcs && subBoard.feePerPcs > 0) {
    add(subBoard.name ?? "额外小板", subBoard.feePerPcs * effectiveQty, `${subBoard.feePerPcs} × ${effectiveQty} PCS`, true);
  }
  // 排线（单选，feePerPcs）
  const cable = config.extras.cable[d.cableType];
  if (cable?.feePerPcs && cable.feePerPcs > 0) {
    add(cable.name ?? "排线", cable.feePerPcs * effectiveQty, `${cable.feePerPcs} × ${effectiveQty} PCS`, true);
  }
  // 自定义固件（多选，feePerOrder 按单；otherDevice 仅提示）
  for (const key of d.firmware) {
    const item = config.extras.firmware[key];
    if (!item) continue;
    if (item.reject) notices.push(item.rejectReason ?? `${item.name ?? key} 需人工报价`);
    else if (item.feePerOrder && item.feePerOrder > 0) add(item.name ?? key, item.feePerOrder, "按订单", true);
  }
  // 走线（单选，feePerOrder 设计费）
  const tracing = config.extras.tracing[d.tracing];
  if (tracing?.feePerOrder && tracing.feePerOrder > 0) {
    add(tracing.name ?? "走线", tracing.feePerOrder, "按订单", true);
  }

  // 固定成本（每 PCS，不论订单多少）
  const fc = config.fixedCosts;
  add(fc.mcu.name, fc.mcu.feePerPcs * effectiveQty, `${fc.mcu.feePerPcs} × ${effectiveQty}`, fc.mcu.noMultiplier);
  add(fc.component.name, fc.component.feePerPcs * effectiveQty, `${fc.component.feePerPcs} × ${effectiveQty}`, fc.component.noMultiplier);
  add(fc.diode.name, fc.diode.feePerKey * d.keyCount * effectiveQty, `${d.keyCount} 键 × ${fc.diode.feePerKey} × ${effectiveQty}`, fc.diode.noMultiplier);

  // RGB（PCB 编辑器开启时）
  if (d.rgb) {
    add(config.rgb.name, config.rgb.feePerKey * d.keyCount * effectiveQty, `${d.keyCount} 键 × ${config.rgb.feePerKey} × ${effectiveQty}`, config.rgb.noMultiplier);
  }

  // 贴片费（按下单数量判断门槛）
  if (d.quantity < config.smt.thresholdQty) {
    add(config.smt.name, config.smt.flatFee, "一次性（<85 PCS）");
  } else {
    add(config.smt.name, config.smt.feePerPcs * effectiveQty, `${config.smt.feePerPcs} × ${effectiveQty} PCS`);
  }

  // 钢网费（每单固定）
  add(config.stencil.name, config.stencil.feePerOrder, "按订单");

  // 快递费（数量×100g 基础重量，首重 1kg 起；重量 > 阈值走重货公式，无上限）
  const weightKg = Math.max(1, effectiveQty * config.shipping.weightPerPcsKg);
  const heavyThreshold = config.shipping.heavyThresholdKg;
  let shipFee: number;
  let shipDetail = `${weightKg} kg`;
  if (heavyThreshold !== undefined && weightKg > heavyThreshold) {
    shipFee =
      (config.shipping.heavyBaseFee ?? 0) +
      weightKg * (config.shipping.heavyPerKg ?? 0) +
      (config.shipping.heavyFlatFee ?? 0);
    shipDetail += `（重货 ${config.shipping.heavyBaseFee}+${weightKg}×${config.shipping.heavyPerKg}+${config.shipping.heavyFlatFee}）`;
  } else {
    shipFee =
      ((weightKg - 1) * config.shipping.perKgOverBase + config.shipping.baseFee) *
      config.shipping.multiplier;
  }
  add(config.shipping.name, shipFee, shipDetail, config.shipping.noMultiplier);

  // v2.6.0：选项类"需人工报价"仅为提示（notice），不再阻断计价
  const notice = notices.length > 0 ? notices.join("；") : undefined;

  // ── 终端报价：计入倍率部分 × terminalMultiplier + 不计入倍率部分原价 ──
  const rawTotal = boardCost + processFee;
  const terminalMultiplier = config.terminalMultiplier ?? 1;
  const baseTotal = boardCost + (processFee - exclFee);
  const totalPrice = baseTotal * terminalMultiplier + exclFee;
  // v2.6.0 定位板独立报价（尺寸已由调用方 resolved，独立数量）
  const plateQuote = calculatePlateQuote(
    rules,
    config.plate.materials,
    d.plateLengthMm,
    d.plateWidthMm,
    d.plateQuantity,
    d.plateMaterial,
  );
  return {
    ok: true,
    notice,
    mode: isPanel ? "panel" : "partial",
    effectiveQty,
    wasteQty,
    chargeSizeMm: { l, w },
    boardsPerSheet,
    sheets,
    areaSqm: round2(areaSqm),
    boardCost: round2(boardCost),
    processFee: round2(processFee),
    rawTotal: round2(rawTotal),
    /** 计入终端倍率的成本小计（板材+工艺，剔除排除项） */
    baseTotal: round2(baseTotal),
    /** 不计入终端倍率的费用（原价加在倍率之后） */
    exclTotal: round2(exclFee),
    terminalMultiplier,
    totalPrice: round2(totalPrice),
    unitPrice: round2(effectiveQty > 0 ? totalPrice / effectiveQty : 0),
    breakdown,
    plateQuote,
  };
}

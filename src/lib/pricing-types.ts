import { z } from "zod";

/**
 * 计价配置 zod schema + 类型
 * 唯一权威源: github.com/709208969/kindlestar-pricing 的 pricing.json
 * src/data/pricing.json 只是发布时快照（离线兜底），日常改价请改仓库文件
 */

export const PricingMetaSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version 必须为 x.y.z 格式"),
  updatedAt: z.string(),
  description: z.string().optional(),
  note: z.string().optional(),
});

export const MaterialSchema = z.object({
  key: z.string(),
  name: z.string(),
  panelPrice: z.number().positive(),
  partialPrice: z.number().positive(),
  sortOrder: z.number().int().optional(),
});

export const PanelRulesSchema = z.object({
  panel: z.object({
    lengthMm: z.number().positive(),
    widthMm: z.number().positive(),
    processFee: z.number().min(0),
    minQty: z.number().int().positive(),
  }),
  partial: z.object({
    lengthMm: z.number().positive(),
    widthMm: z.number().positive(),
    processFee: z.number().min(0),
    limitFactor: z.number().positive(),
  }),
  wasteFactor: z.number().min(0).max(1),
  edgeRailMm: z.number().min(0),
  gapMm: z.number().min(0),
  qtyMin: z.number().int().positive(),
  qtyStep: z.number().int().positive(),
});

export const SurfaceFinishItemSchema = z.object({
  name: z.string(),
  feePerPanel: z.number().min(0).optional(),
  fee: z.number().min(0).optional(),
  reject: z.boolean().optional(),
  rejectReason: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

export const SolderColorSchema = z.object({
  key: z.string(),
  name: z.string(),
  feePerSqm: z.number().min(0),
  smallBatchExtra: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

export const OptionItemSchema = z.object({
  name: z.string().optional(),
  feePerPcs: z.number().min(0).optional(),
  feePerPcsPerKey: z.number().min(0).optional(),
  feePerOrder: z.number().min(0).optional(),
  feeFactor: z.number().min(0).optional(),
  feePerPcsEquivalent: z.number().min(0).optional(),
  fullBelowQty: z.number().int().positive().optional(),
  reject: z.boolean().optional(),
  rejectReason: z.string().optional(),
  /** 不计入终端倍率：按原价加在倍率计算之后 */
  noMultiplier: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** v2.6.0：附加组件（额外小板/排线/自定义固件/走线），全部 noMultiplier 不计入终端倍率 */
export const ExtrasSchema = z.object({
  subBoard: z.record(z.string(), OptionItemSchema).default({}),
  cable: z.record(z.string(), OptionItemSchema).default({}),
  firmware: z.record(z.string(), OptionItemSchema).default({}),
  tracing: z.record(z.string(), OptionItemSchema).default({}),
});

/** v2.6.0：定位板报价（独立于 PCB，材质复用 MaterialSchema 大板/料板价）
 * v2.7.0：multiplier 计价乘数（终端价 = 板材费 × multiplier）、minProcessFee 加工费下限/单 */
export const PlateQuoteSchema = z.object({
  multiplier: z.number().min(1).default(2.5),
  minProcessFee: z.number().min(0).default(300),
  materials: z.array(MaterialSchema).default([]),
});

/** v2.7.0：人工报价联系方式（Discord / Email 跳转链接） */
export const ContactsSchema = z.object({
  discord: z.string().url().optional(),
  email: z.string().optional(),
});

export const PricingConfigSchema = z.object({
  _meta: PricingMetaSchema,
  fixedCosts: z.object({
    mcu: z.object({ name: z.string(), feePerPcs: z.number().min(0), noMultiplier: z.boolean().optional() }),
    component: z.object({ name: z.string(), feePerPcs: z.number().min(0), noMultiplier: z.boolean().optional() }),
    diode: z.object({ name: z.string(), feePerKey: z.number().min(0), noMultiplier: z.boolean().optional() }),
  }),
  rgb: z.object({ name: z.string(), feePerKey: z.number().min(0), noMultiplier: z.boolean().optional() }),
  smt: z.object({
    name: z.string(),
    thresholdQty: z.number().int().positive(),
    flatFee: z.number().min(0),
    feePerPcs: z.number().min(0),
  }),
  stencil: z.object({ name: z.string(), feePerOrder: z.number().min(0) }),
  shipping: z.object({
    name: z.string(),
    weightPerPcsKg: z.number().positive(),
    baseFee: z.number().min(0),
    perKgOverBase: z.number().min(0),
    multiplier: z.number().positive(),
    /** 重量 > 阈值时改用重货公式：heavyBaseFee + 重量×heavyPerKg + heavyFlatFee（不设上限） */
    heavyThresholdKg: z.number().positive().optional(),
    heavyBaseFee: z.number().min(0).optional(),
    heavyPerKg: z.number().min(0).optional(),
    heavyFlatFee: z.number().min(0).optional(),
    noMultiplier: z.boolean().optional(),
  }),
  materials: z.array(MaterialSchema),
  panelRules: PanelRulesSchema,
  surfaceFinish: z.record(z.string(), SurfaceFinishItemSchema),
  solderColors: z.array(SolderColorSchema),
  options: z.object({
    communication: z.record(z.string(), OptionItemSchema),
    solder: z.record(z.string(), OptionItemSchema),
    encoder: OptionItemSchema,
    oled: OptionItemSchema,
    logo: z.record(z.string(), OptionItemSchema),
    protection: z.record(z.string(), OptionItemSchema),
    test: z.record(z.string(), OptionItemSchema),
    packaging: z.record(z.string(), OptionItemSchema),
  }),
  /** 终端报价倍率：总价 = 成本合计 × terminalMultiplier（缺省 1 = 不加倍） */
  terminalMultiplier: z.number().min(1).default(1),
  /** v2.6.0：附加组件（小板/排线/固件/走线） */
  extras: ExtrasSchema.default({ subBoard: {}, cable: {}, firmware: {}, tracing: {} }),
  /** v2.6.0：定位板报价配置（材质价格复用大板/料板价结构；v2.7.0 乘数+加工费下限） */
  plate: PlateQuoteSchema.default({ multiplier: 2.5, minProcessFee: 300, materials: [] }),
  /** v2.7.0：人工报价联系方式 */
  contacts: ContactsSchema.default({}),
  discounts: z.array(z.unknown()).default([]),
});

export type PricingConfig = z.infer<typeof PricingConfigSchema>;
export type PricingMeta = z.infer<typeof PricingMetaSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type PanelRules = z.infer<typeof PanelRulesSchema>;
export type SurfaceFinishItem = z.infer<typeof SurfaceFinishItemSchema>;
export type SolderColor = z.infer<typeof SolderColorSchema>;
export type OptionItem = z.infer<typeof OptionItemSchema>;

/** 解析并校验配置，失败抛错 */
export function parsePricingConfig(raw: unknown): PricingConfig {
  return PricingConfigSchema.parse(raw);
}

/** 安全解析，失败返回 null */
export function tryParsePricingConfig(raw: unknown): PricingConfig | null {
  const result = PricingConfigSchema.safeParse(raw);
  return result.success ? result.data : null;
}

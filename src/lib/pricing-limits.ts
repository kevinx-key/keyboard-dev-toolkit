// pricing-limits.ts — 在线计价的数量上限（业务开关，集中一处）
//
// 背景（2026-10）：超过 ONLINE_QUOTE_MAX_QTY 的订单暂不走在线自动报价，
// 计价页面改为只显示「联系人工报价」引导（Discord / Email）。
//
// ⚠️ 这是**前端隐藏 + 引导**，不是取消能力：
//   · 两个在线计价器（PCBA `PricingSection` / 定位板 `PlatePricingSection`）的
//     计价、下单、复制报价等全部代码原样保留，只是不渲染、不发请求；
//   · 后端 Worker（kindlestar-pricing）与 /api/quote、/api/checkout 契约未改动；
//   · 未来重新开放：把 ONLINE_QUOTE_QTY_LIMIT_ENABLED 改为 false，
//     或调大 ONLINE_QUOTE_MAX_QTY 即可整体恢复（无需回滚其他文件）。

/**
 * 在线自动报价的最大数量（PCS）。
 * ≤ 该值正常在线报价；> 该值引导人工报价（"超过 80 PCS"= 81 起）。
 */
export const ONLINE_QUOTE_MAX_QTY = 80;

/** 数量上限开关：true = 启用上限；false = 恢复不限量在线报价（保留以备未来再次开放） */
export const ONLINE_QUOTE_QTY_LIMIT_ENABLED: boolean = true;

/**
 * 该数量是否仍提供在线报价。
 * 开关关闭时恒为 true；NaN / ≤0（未填、空值）交回既有「≥5」校验处理，不在这里判超量。
 */
export function isOnlineQuoteQtyAllowed(quantity: number): boolean {
  if (!ONLINE_QUOTE_QTY_LIMIT_ENABLED) return true;
  if (Number.isNaN(quantity)) return true;
  return quantity <= ONLINE_QUOTE_MAX_QTY;
}

import { describe, expect, it } from "vitest";
import {
  calculatePrice,
  calculatePlateQuote,
  validatePricingInput,
  PANEL_OVER_LIMIT_MSG,
  BOARD_TOO_LARGE_MSG,
  type PricingFormData,
} from "../src/lib/price-calculator";
import { BUNDLED_CONFIG } from "../src/lib/pricing-loader";

function form(overrides: Partial<PricingFormData> = {}): PricingFormData {
  return {
    lengthMm: 344.48,
    widthMm: 119.45,
    quantity: 10,
    material: "fr4",
    thicknessMm: 1.6,
    surfaceFinish: "hasl",
    solderColor: "green",
    communication: [],
    hotswap: false,
    encoderCount: 0,
    oled: false,
    rgb: false,
    logo: "none",
    protection: "standard",
    test: "none",
    packaging: [],
    keyCount: 104,
    subBoard: "none",
    cableType: "black",
    cableLengthMm: 0,
    firmware: [],
    tracing: "rounded",
    plateMaterial: "",
    plateLengthMm: 0,
    plateWidthMm: 0,
    plateQuantity: 0,
    ...overrides,
  };
}

/** 工艺费差值：变更项相对基准表单的工艺费增量 */
function feeDelta(overrides: Partial<PricingFormData> = {}): number {
  const r = calculatePrice(BUNDLED_CONFIG, form(overrides));
  const b = calculatePrice(BUNDLED_CONFIG, form());
  return r.processFee - b.processFee;
}

// 计费尺寸: 344.48 × (119.45+10) = 344.48 × 129.45 = 44,592.936 mm²
const CHARGE_AREA = 344.48 * 129.45;

describe("板材费 — 分料板（<30 PCS）", () => {
  it("10 PCS: N=2, 5 张料板, FR4", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form());
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("partial");
    expect(r.boardsPerSheet).toBe(Math.floor(487.5 * 310.7 * 0.8 / CHARGE_AREA));
    expect(r.sheets).toBe(5);
    expect(r.boardCost).toBeCloseTo(5 * (24.8 + 36.75), 2);
  });

  it("黑芯材质用料板价 36.75", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ material: "black_core" }));
    expect(r.boardCost).toBeCloseTo(5 * (36.75 + 36.75), 2);
  });

  it("数量非 5 倍数 → 向上取整（报废计成本）", () => {
    const r7 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 7 }));
    expect(r7.effectiveQty).toBe(10);
    expect(r7.wasteQty).toBe(3);
    const r12 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 12 }));
    expect(r12.effectiveQty).toBe(15);
    expect(r12.wasteQty).toBe(3);
  });
});

describe("板材费 — 大板（≥30 PCS）", () => {
  it("100 PCS: N=23, 5 张大板, FR4", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100 }));
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("panel");
    expect(r.boardsPerSheet).toBe(Math.floor(1245 * 1041 * 0.8 / CHARGE_AREA));
    expect(r.sheets).toBe(Math.ceil(100 / r.boardsPerSheet));
    expect(r.boardCost).toBeCloseTo(r.sheets * (198.6 + 294), 2);
  });

  it("黑芯大板价 294", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 30, material: "black_core" }));
    expect(r.mode).toBe("panel");
    expect(r.boardCost).toBeCloseTo(r.sheets * (294 + 294), 2);
  });

  it("30 PCS 正好是分水岭", () => {
    expect(calculatePrice(BUNDLED_CONFIG, form({ quantity: 30 })).mode).toBe("panel");
    expect(calculatePrice(BUNDLED_CONFIG, form({ quantity: 25 })).mode).toBe("partial");
  });
});

describe("超限检查（仅小批量）", () => {
  it("长 > 390mm → 拒绝", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 400, widthMm: 100, quantity: 10 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(PANEL_OVER_LIMIT_MSG);
  });

  it("宽 > 248.56mm → 拒绝", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 300, widthMm: 250, quantity: 10 }));
    expect(r.ok).toBe(false);
  });

  it("大批量不检查超限", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 400, widthMm: 100, quantity: 100 }));
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("panel");
  });

  it("旋转输入（119.45×344.48）不误拒：按长边归一化检查", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 119.45, widthMm: 344.48, quantity: 10 }));
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("partial");
    expect(r.chargeSizeMm.l).toBeCloseTo(344.48, 2);
    expect(r.chargeSizeMm.w).toBeCloseTo(119.45 + 10, 2);
  });

  it("旋转后仍超限（长边 >390）→ 拒绝", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 119.45, widthMm: 500, quantity: 10 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(PANEL_OVER_LIMIT_MSG);
  });

  it("旋转后仍超限（短边 >248.56）→ 拒绝", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 260, widthMm: 300, quantity: 10 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(PANEL_OVER_LIMIT_MSG);
  });
});

describe("板材面积不足（N=0）", () => {
  it("单板计费面积超过大板可用面积 → 拒绝计价（不再报 ¥0）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 1100, widthMm: 1100, quantity: 30 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(BOARD_TOO_LARGE_MSG);
    expect(r.boardCost).toBe(0);
  });

  it("正常尺寸不受影响，boardsPerSheet ≥1", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 30 }));
    expect(r.ok).toBe(true);
    expect(r.boardsPerSheet).toBeGreaterThan(0);
  });
});

describe("表面处理", () => {
  it("沉金小批量: 料板面积折算 ×180", () => {
    const delta = feeDelta({ surfaceFinish: "enig" });
    const expected = (5 * 487.5 * 310.7 * 180) / (1245 * 1041);
    expect(delta).toBeCloseTo(expected, 2);
  });

  it("沉金大批量: 大板张数 ×180", () => {
    const base = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100 }));
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100, surfaceFinish: "enig" }));
    expect(r.processFee - base.processFee).toBeCloseTo(r.sheets * 180, 2);
  });

  it("喷锡不加价（两种喷锡费用相同）", () => {
    const a = calculatePrice(BUNDLED_CONFIG, form({ surfaceFinish: "hasl" }));
    const b = calculatePrice(BUNDLED_CONFIG, form({ surfaceFinish: "haslhf" }));
    expect(a.processFee).toBe(b.processFee);
  });

  it("OSP → 仅提示不阻断（v2.6.0）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ surfaceFinish: "osp" }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("客服");
  });
});

describe("颜色油墨", () => {
  it("绿色免费（无颜色明细项）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form());
    expect(r.breakdown.some((b) => b.name === "绿色")).toBe(false);
  });

  it("白色小批量: 22 元/㎡ × 料板面积", () => {
    const delta = feeDelta({ solderColor: "white" });
    const areaSqm = (5 * 487.5 * 310.7) / 1e6;
    expect(delta).toBeCloseTo(areaSqm * 22, 2);
  });

  it("工业灰小批量: 30+50=80 元/㎡", () => {
    const delta = feeDelta({ solderColor: "industrial_gray" });
    const areaSqm = (5 * 487.5 * 310.7) / 1e6;
    expect(delta).toBeCloseTo(areaSqm * 80, 2);
  });

  it("工业灰大批量: 30 元/㎡ 无额外", () => {
    const base = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100 }));
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100, solderColor: "industrial_gray" }));
    const areaSqm = (r.sheets * 1245 * 1041) / 1e6;
    expect(r.processFee - base.processFee).toBeCloseTo(areaSqm * 30, 2);
  });
});

describe("功能配置", () => {
  it("蓝牙 22/PCS、2.4G 45/PCS 按有效数量", () => {
    const delta = feeDelta({ communication: ["bluetooth", "24g"], quantity: 7 });
    expect(delta).toBeCloseTo((22 + 45) * 10, 2);
  });

  it("热插拔: 键数×0.25×数量", () => {
    const delta = feeDelta({ hotswap: true });
    expect(delta).toBeCloseTo(104 * 0.25 * 10, 2);
  });

  it("Encoder: 数量×0.5×PCS", () => {
    const delta = feeDelta({ encoderCount: 2 });
    expect(delta).toBeCloseTo(2 * 0.5 * 10, 2);
  });

  it("OLED → 仅提示不阻断（v2.6.0）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ oled: true }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("OLED");
  });

  it("Logo 计价: 无 +400/订单, Kindlestar 0, 自定义 +100/订单（相对 Kindlestar）", () => {
    const rKs = calculatePrice(BUNDLED_CONFIG, form({ logo: "kindlestar" }));
    const rNone = calculatePrice(BUNDLED_CONFIG, form({ logo: "none" }));
    const rCustom = calculatePrice(BUNDLED_CONFIG, form({ logo: "custom" }));
    expect(rCustom.processFee - rKs.processFee).toBeCloseTo(100, 2);
    expect(rNone.processFee - rKs.processFee).toBeCloseTo(400, 2);
  });

  it("MCU 灌封胶: 5/PCS", () => {
    const delta = feeDelta({ protection: "potting" });
    expect(delta).toBeCloseTo(50, 2);
  });

  it("三防漆 → 仅提示不阻断（v2.6.0）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ protection: "conformal" }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("三防漆");
  });

  it("全检: 6/PCS", () => {
    const delta = feeDelta({ test: "full" });
    expect(delta).toBeCloseTo(60, 2);
  });

  it("抽检 ≥30: 数量×0.3×8", () => {
    const base = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100 }));
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100, test: "qc" }));
    expect(r.processFee - base.processFee).toBeCloseTo(100 * 0.3 * 8, 2);
  });

  it("抽检 <30: 自动按全检 6/PCS", () => {
    const delta = feeDelta({ test: "qc" });
    expect(delta).toBeCloseTo(60, 2);
  });

  it("包装: 每项 0.3/PCS", () => {
    const delta = feeDelta({ packaging: ["foam", "plastic"] });
    expect(delta).toBeCloseTo(2 * 0.3 * 10, 2);
  });
});

describe("固定成本 / RGB / 贴片 / 钢网 / 快递", () => {
  it("每 PCS 固定: MCU 15.85 + 外围 6 + 二极管 键数×0.05", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form());
    expect(r.breakdown.some((b) => b.name === "MCU 芯片" && b.amount === 15.85 * 10)).toBe(true);
    expect(r.breakdown.some((b) => b.name === "外围器件" && b.amount === 60)).toBe(true);
    expect(r.breakdown.some((b) => b.name === "二极管" && b.amount === 104 * 0.05 * 10)).toBe(true);
  });

  it("RGB: 键数×0.23×数量", () => {
    const delta = feeDelta({ rgb: true });
    expect(delta).toBeCloseTo(104 * 0.23 * 10, 2);
    const r = calculatePrice(BUNDLED_CONFIG, form({ rgb: true }));
    expect(r.breakdown.some((b) => b.name === "RGB 灯" && Math.abs(b.amount - 104 * 0.23 * 10) < 0.01)).toBe(true);
  });

  it("贴片费: <85 一次性 650", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 10 }));
    expect(r.breakdown.some((b) => b.name === "贴片费" && b.amount === 650)).toBe(true);
  });

  it("贴片费: ≥85 按 7/PCS", () => {
    const r84 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 84 }));
    expect(r84.breakdown.some((b) => b.name === "贴片费" && b.amount === 650)).toBe(true);
    const r85 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 85 }));
    expect(r85.breakdown.some((b) => b.name === "贴片费" && b.amount === 85 * 7)).toBe(true);
  });

  it("钢网费: 每单固定 180", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 10 }));
    expect(r.breakdown.some((b) => b.name === "钢网费" && b.amount === 180)).toBe(true);
  });

  it("快递费轻货: ((重量-1)×14+23)×2, 首重 1kg", () => {
    const r10 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 10 }));
    const fee10 = ((1 - 1) * 14 + 23) * 2;
    expect(r10.breakdown.some((b) => b.name === "快递费" && b.amount === fee10)).toBe(true);
    const r85 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 85 }));
    const fee85 = ((8.5 - 1) * 14 + 23) * 2; // 8.5kg 正好等于阈值 → 仍走旧公式
    expect(r85.breakdown.some((b) => b.name === "快递费" && b.amount === fee85)).toBe(true);
  });

  it("快递费重货: 重量>8.5kg → 150+重量×4+9", () => {
    const r100 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 100 }));
    const fee100 = 150 + 10 * 4 + 9; // 10kg
    expect(r100.breakdown.some((b) => b.name === "快递费" && b.amount === fee100)).toBe(true);
    const r200 = calculatePrice(BUNDLED_CONFIG, form({ quantity: 200 }));
    const fee200 = 150 + 20 * 4 + 9; // 20kg
    expect(r200.breakdown.some((b) => b.name === "快递费" && b.amount === fee200)).toBe(true);
  });

  it("快递费无上限：重货大数量照常计收（不再提示人工）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ quantity: 1000 }));
    expect(r.ok).toBe(true);
    expect(r.notice).toBeUndefined();
    const fee1000 = 150 + 100 * 4 + 9; // 100kg
    expect(r.breakdown.some((b) => b.name === "快递费" && b.amount === fee1000)).toBe(true);
    expect(r.totalPrice).toBeCloseTo(r.baseTotal * r.terminalMultiplier + r.exclTotal, 2);
  });
});

describe("总价与输入校验", () => {
  it("终端报价 = 计入倍率部分 × terminalMultiplier + 不计倍率部分原价", () => {
    const r = calculatePrice(
      BUNDLED_CONFIG,
      form({ quantity: 100, surfaceFinish: "enig", communication: ["bluetooth"] }),
    );
    expect(r.terminalMultiplier).toBe(2);
    expect(r.rawTotal).toBeCloseTo(r.boardCost + r.processFee, 2);
    expect(r.baseTotal + r.exclTotal).toBeCloseTo(r.rawTotal, 2);
    expect(r.totalPrice).toBeCloseTo(r.baseTotal * r.terminalMultiplier + r.exclTotal, 2);
    expect(r.unitPrice).toBeCloseTo(r.totalPrice / r.effectiveQty, 2);
  });

  it("排除项标记生效：蓝牙/2.4G/热插拔/旋钮/全检/包装/MCU/RGB/快递均不计入倍率", () => {
    const r = calculatePrice(
      BUNDLED_CONFIG,
      form({
        quantity: 100,
        communication: ["bluetooth", "24g"],
        hotswap: true,
        encoderCount: 2,
        test: "full",
        packaging: ["foam", "plastic"],
        rgb: true,
      }),
    );
    // 逐个排除项 = 计入 exclTotal
    const exclBreakdown = r.breakdown.filter((b) => b.noMultiplier);
    const exclSum = exclBreakdown.reduce((s, b) => s + b.amount, 0);
    expect(exclSum).toBeCloseTo(r.exclTotal, 2);
    // 对照手工计算（快递费 100 PCS = 10kg > 8.5 → 重货公式 150+10×4+9 = 199）
    const kc = 104; // form() 默认 keyCount
    const expectedExcl =
      22 * 100 + 45 * 100 + kc * 0.25 * 100 + 2 * 0.5 * 100 + 6 * 100 + 0.3 * 100 * 2 + 15.85 * 100 + kc * 0.23 * 100 + 199;
    expect(r.exclTotal).toBeCloseTo(expectedExcl, 2);
    // 板材费 + 其余工艺费在 baseTotal 内
    expect(r.baseTotal).toBeCloseTo(r.rawTotal - r.exclTotal, 2);
  });

  it("terminalMultiplier 缺省 → 1（不加倍）", () => {
    const cfg = { ...BUNDLED_CONFIG };
    // @ts-expect-error 移除字段验证缺省
    delete cfg.terminalMultiplier;
    const r = calculatePrice(cfg, form());
    expect(r.terminalMultiplier).toBe(1);
    expect(r.totalPrice).toBeCloseTo(r.baseTotal + r.exclTotal, 2);
  });

  it("自定义倍率生效（排除项仍原价加回）", () => {
    const r = calculatePrice({ ...BUNDLED_CONFIG, terminalMultiplier: 3 }, form({ rgb: true }));
    expect(r.terminalMultiplier).toBe(3);
    expect(r.totalPrice).toBeCloseTo(r.baseTotal * 3 + r.exclTotal, 2);
  });

  it("无排除项的配置：totalPrice = rawTotal × 倍率（向后兼容）", () => {
    const cfg = structuredClone(BUNDLED_CONFIG);
    for (const it of Object.values(cfg.options.communication)) if (it) delete it.noMultiplier;
    for (const it of Object.values(cfg.options.packaging)) if (it) delete it.noMultiplier;
    delete (cfg.options.solder.hotswap as { noMultiplier?: boolean }).noMultiplier;
    delete (cfg.options.encoder as { noMultiplier?: boolean }).noMultiplier;
    for (const it of Object.values(cfg.options.test)) if (it) delete it.noMultiplier;
    delete (cfg.fixedCosts.mcu as { noMultiplier?: boolean }).noMultiplier;
    delete (cfg.rgb as { noMultiplier?: boolean }).noMultiplier;
    delete (cfg.shipping as { noMultiplier?: boolean }).noMultiplier;
    const r = calculatePrice(cfg, form({ rgb: true, hotswap: true, communication: ["bluetooth"] }));
    expect(r.exclTotal).toBe(0);
    expect(r.totalPrice).toBeCloseTo(r.rawTotal * r.terminalMultiplier, 2);
  });

  it("数量 <5 → 无效", () => {
    expect(validatePricingInput(form({ quantity: 4 })).length).toBeGreaterThan(0);
    expect(calculatePrice(BUNDLED_CONFIG, form({ quantity: 4 })).ok).toBe(false);
  });

  it("尺寸越界 → 无效", () => {
    expect(calculatePrice(BUNDLED_CONFIG, form({ lengthMm: 0.5 })).ok).toBe(false);
    expect(calculatePrice(BUNDLED_CONFIG, form({ widthMm: 20000 })).ok).toBe(false);
  });

  it("encoderCount 非整数 → 无效", () => {
    expect(validatePricingInput(form({ encoderCount: 1.5 })).length).toBeGreaterThan(0);
  });
});

// ─── v2.6.0 附加组件（小板/排线/固件/走线） ───

describe("v2.6.0 附加组件", () => {
  const qty = 10;

  it("额外小板：板载USB +5 / C5 +10 / S3 +10 / 自定义 +15 元每PCS", () => {
    expect(feeDelta({ subBoard: "onboardUsb" })).toBeCloseTo(5 * qty, 2);
    expect(feeDelta({ subBoard: "c5" })).toBeCloseTo(10 * qty, 2);
    expect(feeDelta({ subBoard: "s3" })).toBeCloseTo(10 * qty, 2);
    expect(feeDelta({ subBoard: "custom" })).toBeCloseTo(15 * qty, 2);
    expect(feeDelta({ subBoard: "none" })).toBeCloseTo(0, 2);
  });

  it("排线：FPC +1 元/PCS，黑色 0", () => {
    expect(feeDelta({ cableType: "fpc" })).toBeCloseTo(1 * qty, 2);
    expect(feeDelta({ cableType: "black" })).toBeCloseTo(0, 2);
  });

  it("自定义固件：灯效/网页各 +400/单，可叠加", () => {
    expect(feeDelta({ firmware: ["lightEffect"] })).toBeCloseTo(400, 2);
    expect(feeDelta({ firmware: ["lightEffect", "webConsole"] })).toBeCloseTo(800, 2);
  });

  it("定制走线 +500 设计费/单，圆角/斜角 0", () => {
    expect(feeDelta({ tracing: "custom" })).toBeCloseTo(500, 2);
    expect(feeDelta({ tracing: "rounded" })).toBeCloseTo(0, 2);
    expect(feeDelta({ tracing: "beveled" })).toBeCloseTo(0, 2);
  });

  it("新增费用全部 noMultiplier（计入 exclTotal 不翻倍）", () => {
    const r = calculatePrice(
      BUNDLED_CONFIG,
      form({ quantity: 100, subBoard: "custom", cableType: "fpc", firmware: ["lightEffect"], tracing: "custom" }),
    );
    const expectedExcl = 15 * 100 + 1 * 100 + 400 + 500;
    const added = r.breakdown.filter((b) => b.noMultiplier && ["自定义小板", "FPC 排线", "定制灯效", "定制走线"].includes(b.name));
    expect(added.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(expectedExcl, 2);
    expect(r.exclTotal).toBeCloseTo(expectedExcl + 15.85 * 100 + 199, 2); // + MCU/快递既有排除项
    expect(r.totalPrice).toBeCloseTo(r.baseTotal * r.terminalMultiplier + r.exclTotal, 2);
  });

  it("定制其他设备 → 仅提示不阻断，ok=true 且 notice 含提示", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ firmware: ["otherDevice"] }));
    expect(r.ok).toBe(true);
    expect(r.notice).toBeTruthy();
    expect(r.notice).toContain("定制其他设备");
    expect(feeDelta({ firmware: ["otherDevice"] })).toBeCloseTo(0, 2);
  });
});

// ─── v2.6.0 人工报价选项改仅提示（不再阻断） ───

describe("v2.6.0 人工报价选项仅提示", () => {
  it("OSP → ok=true + notice，不阻断", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ surfaceFinish: "osp" }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("OSP");
  });

  it("OLED → ok=true + notice", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ oled: true }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("OLED");
  });

  it("三防漆 → ok=true + notice", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ protection: "conformal" }));
    expect(r.ok).toBe(true);
    expect(r.notice).toContain("三防漆");
  });

  it("多项提示合并为一条 notice（；分隔）", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form({ surfaceFinish: "osp", oled: true, protection: "conformal" }));
    expect(r.ok).toBe(true);
    expect((r.notice ?? "").split("；").length).toBe(3);
  });
});

// ─── v2.6.0 定位板独立报价 ───

describe("v2.6.0 定位板独立报价（calculatePlateQuote）", () => {
  const PLATE_L = 344.48;
  const PLATE_W = 119.45;
  const rules = BUNDLED_CONFIG.panelRules;
  const materials = BUNDLED_CONFIG.plate.materials;

  it("分料板模式：尺寸/数量/材质复用 PCB 板材逻辑", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 10, "fr4");
    expect(q).not.toBeNull();
    expect(q!.ok).toBe(true);
    expect(q!.mode).toBe("partial");
    expect(q!.effectiveQty).toBe(10);
    expect(q!.chargeSizeMm.l).toBeCloseTo(PLATE_L, 2);
    expect(q!.chargeSizeMm.w).toBeCloseTo(PLATE_W + 10, 2);
    expect(q!.sheets).toBe(5);
    expect(q!.boardCost).toBeCloseTo(5 * (24.8 + 36.75), 2);
  });

  it("黑芯材质复用 PCB 黑芯料板价 36.75", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 10, "black_core");
    expect(q!.boardCost).toBeCloseTo(5 * (36.75 + 36.75), 2);
  });

  it("大板模式（≥30）复用大板价", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 100, "fr4");
    expect(q!.mode).toBe("panel");
    expect(q!.boardCost).toBeCloseTo(q!.sheets * (198.6 + 294), 2);
  });

  it("数量非 5 倍数向上取整 + 报废", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 7, "fr4");
    expect(q!.effectiveQty).toBe(10);
    expect(q!.wasteQty).toBe(3);
  });

  it("数量 ≤0 或尺寸 ≤0 → null（不报价）", () => {
    expect(calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 0, "fr4")).toBeNull();
    expect(calculatePlateQuote(rules, materials, 0, 0, 10, "fr4")).toBeNull();
  });

  it("小批量超限 → ok=false + PANEL_OVER_LIMIT_MSG", () => {
    const q = calculatePlateQuote(rules, materials, 500, 100, 10, "fr4");
    expect(q!.ok).toBe(false);
    expect(q!.reason).toBe(PANEL_OVER_LIMIT_MSG);
  });

  it("N=0（超出单张板材面积）→ ok=false + BOARD_TOO_LARGE_MSG", () => {
    const q = calculatePlateQuote(rules, materials, 3000, 2000, 100, "fr4");
    expect(q!.ok).toBe(false);
    expect(q!.reason).toBe(BOARD_TOO_LARGE_MSG);
  });

  it("未知材质 key → 回退第一个材质（fr4）", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 10, "unknown_key");
    expect(q!.boardCost).toBeCloseTo(5 * (24.8 + 36.75), 2);
  });

  it("无材质配置 → null", () => {
    expect(calculatePlateQuote(rules, [], PLATE_L, PLATE_W, 10, "fr4")).toBeNull();
  });

  it("v2.7.0 加工费下限：3 张×36.75=110.25 < 300 → 按 300", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 5, "black_core", 1, 300);
    expect(q!.ok).toBe(true);
    expect(q!.sheets).toBe(3);
    expect(q!.boardCost).toBeCloseTo(3 * 36.75 + 300, 2);
  });

  it("v2.7.0 加工费超下限时按实际（不受下限影响）", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 100, "black_core", 1, 300);
    expect(q!.mode).toBe("panel");
    const expectedFee = q!.sheets * 294;
    expect(expectedFee).toBeGreaterThan(300);
    expect(q!.boardCost).toBeCloseTo(q!.sheets * 294 + expectedFee, 2);
  });

  it("v2.7.0 计价乘数：totalPrice = boardCost × multiplier，unitPrice = totalPrice ÷ 数量", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 10, "fr4", 2.5, 300);
    expect(q!.multiplier).toBe(2.5);
    expect(q!.totalPrice).toBeCloseTo(q!.boardCost * 2.5, 2);
    expect(q!.unitPrice).toBeCloseTo(q!.totalPrice / q!.effectiveQty, 2);
  });

  it("v2.7.0 乘数缺省 1（向后兼容）", () => {
    const q = calculatePlateQuote(rules, materials, PLATE_L, PLATE_W, 10, "fr4");
    expect(q!.multiplier).toBe(1);
    expect(q!.totalPrice).toBeCloseTo(q!.boardCost, 1);
    expect(q!.unitPrice).toBeCloseTo(q!.boardCost / q!.effectiveQty, 1);
  });
});

describe("v2.6.0 calculatePrice 集成 plateQuote", () => {
  it("plateQuantity>0 时返回独立定位板报价，不进 PCB 总价", () => {
    const r = calculatePrice(
      BUNDLED_CONFIG,
      form({ plateLengthMm: 344.48, plateWidthMm: 119.45, plateQuantity: 10, plateMaterial: "fr4" }),
    );
    expect(r.ok).toBe(true);
    expect(r.plateQuote).not.toBeNull();
    expect(r.plateQuote!.ok).toBe(true);
    expect(r.plateQuote!.boardCost).toBeCloseTo(5 * (24.8 + 36.75), 2);
    // 定位板费用不计入 PCB 总价
    expect(r.totalPrice).toBeCloseTo(r.baseTotal * r.terminalMultiplier + r.exclTotal, 2);
  });

  it("plateQuantity=0 → plateQuote null", () => {
    const r = calculatePrice(BUNDLED_CONFIG, form());
    expect(r.plateQuote).toBeNull();
  });
});

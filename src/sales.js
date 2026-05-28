import { useEffect, useMemo, useState } from "react";

const SALES_API_URL = "/api/sales";
const SALES_ROLE_MODE_KEY = "honeybee:salesRoleMode";
const SALES_ADMIN_TAB_KEY = "honeybee:salesAdminTab";
const SALES_TARGET_MONTH_KEY = "honeybee:salesTargetMonth";
const SALES_TAX_MODE_KEY = "honeybee:salesTaxMode";
const TAX_RATE = 0.10;
const SALES_MONTH_OPTIONS_2026 = Array.from({ length: 12 }, (_, i) => {
  const mm = String(i + 1).padStart(2, "0");
  return { value: `2026-${mm}`, label: `2026年${mm}月` };
});
/** 2025年売上（税込・API未取得の固定前年データ） */
const PREVIOUS_YEAR_SALES_2025 = [
  { month: 1, sales: 2973050 },
  { month: 2, sales: 3554650 },
  { month: 3, sales: 3958800 },
  { month: 4, sales: 3941500 },
  { month: 5, sales: 3454050 },
  { month: 6, sales: 3290650 },
  { month: 7, sales: 3761500 },
  { month: 8, sales: 4053320 },
  { month: 9, sales: 4376600 },
  { month: 10, sales: 4350000 },
  { month: 11, sales: 4907390 },
  { month: 12, sales: 5396411 },
];
const PREVIOUS_YEAR_SALES_2025_TOTAL = PREVIOUS_YEAR_SALES_2025.reduce((s, r) => s + r.sales, 0);
const PREVIOUS_YEAR_SALES_2025_MAP = Object.fromEntries(PREVIOUS_YEAR_SALES_2025.map((r) => [r.month, r.sales]));

const S = {
  card: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:6, padding:"1rem 1.1rem" },
  secTitle: { fontFamily:"Georgia,serif", fontSize:".74rem", letterSpacing:".2em", textTransform:"uppercase", color:"#c9a84c", borderBottom:"1px solid rgba(201,168,76,0.2)", paddingBottom:".45rem", marginBottom:".65rem" },
  btn: (v) => {
    const b = { padding:".42rem .8rem", borderRadius:4, fontFamily:"inherit", fontSize:".7rem", letterSpacing:".08em", cursor:"pointer", border:"none" };
    if (v === "gold") return { ...b, background:"#c9a84c", color:"#0a0a0a", fontWeight:600 };
    if (v === "ghost") return { ...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.3)" };
    if (v === "sm") return { ...b, padding:".3rem .65rem", fontSize:".62rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.3)" };
    return b;
  },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.18)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".82rem", padding:".45rem .55rem", outline:"none" },
};

const ANALYSIS_CARD = {
  summary: {
    card: {
      background: "linear-gradient(165deg, rgba(32,42,64,0.98) 0%, rgba(20,28,46,0.99) 55%, rgba(16,22,36,1) 100%)",
      border: "1px solid rgba(132,158,205,0.42)",
      boxShadow: "0 6px 22px rgba(10,18,34,0.45), inset 0 1px 0 rgba(170,192,230,0.1)",
      padding: "1.15rem 1.2rem",
    },
    title: { color: "#e2d4a0", borderBottom: "1px solid rgba(132,158,205,0.32)" },
    rowBorder: "rgba(132,158,205,0.16)",
  },
  composition: {
    card: {
      background: "linear-gradient(180deg, rgba(16,24,38,0.99), rgba(12,18,30,1))",
      border: "1px solid rgba(88,128,178,0.34)",
      boxShadow: "inset 0 1px 0 rgba(100,140,190,0.06)",
    },
    title: { color: "#9eb8e0", borderBottom: "1px solid rgba(88,128,178,0.28)" },
    rowBorder: "rgba(88,128,178,0.14)",
  },
  costProfit: {
    card: {
      background: "linear-gradient(180deg, rgba(34,24,20,0.98), rgba(24,16,14,0.99))",
      border: "1px solid rgba(168,118,88,0.32)",
      boxShadow: "inset 0 1px 0 rgba(200,150,110,0.05)",
    },
    title: { color: "#d4a88a", borderBottom: "1px solid rgba(168,118,88,0.26)" },
    rowBorder: "rgba(168,118,88,0.14)",
  },
  trend: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(201,168,76,0.16)",
      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
    },
    title: { color: "#c9a84c", borderBottom: "1px solid rgba(201,168,76,0.2)" },
    rowBorder: "rgba(201,168,76,0.14)",
  },
  dayReport: {
    card: {
      background: "linear-gradient(180deg, rgba(38,40,44,0.98), rgba(28,30,34,0.99))",
      border: "1px solid rgba(175,180,190,0.24)",
      borderRadius: 8,
      boxShadow: "0 4px 16px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05)",
      padding: ".85rem .95rem",
    },
    title: { color: "#e8dcc0", borderBottom: "none", marginBottom: ".55rem", paddingBottom: 0 },
    rowBorder: "rgba(175,180,190,0.12)",
  },
  rankSales: {
    card: {
      background: "linear-gradient(180deg, rgba(18,16,12,0.99), rgba(10,10,10,1))",
      border: "1px solid rgba(201,168,76,0.28)",
      boxShadow: "inset 3px 0 0 rgba(201,168,76,0.55)",
    },
    title: { color: "#dfc06a", borderBottom: "1px solid rgba(201,168,76,0.22)" },
    rowBorder: "rgba(201,168,76,0.14)",
  },
  rankUnder: {
    card: {
      background: "linear-gradient(180deg, rgba(22,16,14,0.99), rgba(10,10,10,1))",
      border: "1px solid rgba(190,120,88,0.26)",
      boxShadow: "inset 3px 0 0 rgba(190,110,78,0.5)",
    },
    title: { color: "#dca06a", borderBottom: "1px solid rgba(190,120,88,0.2)" },
    rowBorder: "rgba(190,120,88,0.14)",
  },
  rankFoodDrink: {
    card: {
      background: "linear-gradient(180deg, rgba(14,20,16,0.99), rgba(10,10,10,1))",
      border: "1px solid rgba(110,170,120,0.24)",
      boxShadow: "inset 3px 0 0 rgba(102,170,118,0.45)",
    },
    title: { color: "#9ec9a8", borderBottom: "1px solid rgba(110,170,120,0.2)" },
    rowBorder: "rgba(110,170,120,0.14)",
  },
  rankDrink: {
    card: {
      background: "linear-gradient(180deg, rgba(14,18,24,0.99), rgba(10,10,10,1))",
      border: "1px solid rgba(100,140,200,0.24)",
      boxShadow: "inset 3px 0 0 rgba(86,140,220,0.45)",
    },
    title: { color: "#9eb8e8", borderBottom: "1px solid rgba(100,140,200,0.2)" },
    rowBorder: "rgba(100,140,200,0.14)",
  },
  rankFood: {
    card: {
      background: "linear-gradient(180deg, rgba(18,22,14,0.99), rgba(10,10,10,1))",
      border: "1px solid rgba(150,175,95,0.24)",
      boxShadow: "inset 3px 0 0 rgba(160,190,90,0.42)",
    },
    title: { color: "#b8c98a", borderBottom: "1px solid rgba(150,175,95,0.2)" },
    rowBorder: "rgba(150,175,95,0.14)",
  },
};

function analysisCard(variant) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return { ...S.card, ...v.card };
}
function analysisSecTitle(variant, marginBottom) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return { ...S.secTitle, ...v.title, ...(marginBottom != null ? { marginBottom } : {}) };
}
function analysisRowBorder(variant) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return v.rowBorder;
}

function yen(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return "¥" + Number(v).toLocaleString("ja-JP");
}
function readSalesTaxMode() {
  try {
    const v = localStorage.getItem(SALES_TAX_MODE_KEY);
    if (v === "gross" || v === "net") return v;
  } catch {}
  return "gross";
}
function displayMoneyValue(value, taxMode) {
  if (value == null || Number.isNaN(Number(value))) return value;
  const n = Number(value);
  if (taxMode === "net") return Math.round(n / (1 + TAX_RATE));
  return n;
}
function formatDisplayYen(value, taxMode) {
  return yen(displayMoneyValue(value, taxMode));
}
function formatDisplayCompactYen(value, taxMode) {
  const n = displayMoneyValue(value, taxMode);
  if (n == null || Number.isNaN(Number(n))) return "—";
  const num = Number(n);
  if (num >= 1000) return `¥${Math.round(num / 1000)}k`;
  return `¥${num.toLocaleString("ja-JP")}`;
}
function formatSignedDisplayYen(value, taxMode) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = displayMoneyValue(value, taxMode);
  if (n === 0) return yen(0);
  const sign = n > 0 ? "+" : "-";
  return `${sign}${yen(Math.abs(n))}`;
}
function formatPtDiff(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toFixed(1)}pt`;
}
function previousYearSalesForMonth_(targetMonth) {
  const m = Number(String(targetMonth || "").slice(5, 7));
  return PREVIOUS_YEAR_SALES_2025_MAP[m] ?? 0;
}
function buildMonthlyYoYRows_(monthRows) {
  return (monthRows || []).map((m) => {
    const currentSales = Number(m.totalSalesSum || 0);
    const prevSales = previousYearSalesForMonth_(m.targetMonth);
    const diff = currentSales - prevSales;
    const yoyRate = prevSales > 0 ? (currentSales / prevSales) * 100 : null;
    return {
      targetMonth: m.targetMonth,
      monthLabel: m.monthLabel,
      status: m.status,
      currentSales,
      prevSales,
      diff,
      yoyRate,
    };
  });
}
function buildYearlyTargetMetrics_(monthRows) {
  const okMonths = (monthRows || []).filter((m) => m.status !== "取得失敗");
  const monthsWithTarget = okMonths.filter((m) => Number(m.targetSalesSum || 0) > 0);
  const enteredTargetSum = monthsWithTarget.reduce((s, m) => s + Number(m.targetSalesSum || 0), 0);
  const enteredTargetMonthCount = monthsWithTarget.length;
  const hasFullYearTarget = enteredTargetMonthCount === 12;
  const fullYearTargetSum = hasFullYearTarget ? enteredTargetSum : null;
  return { enteredTargetSum, enteredTargetMonthCount, hasFullYearTarget, fullYearTargetSum };
}
function buildLandingForecast_(monthRows, yearlyTotalSales, targetMetrics) {
  const { hasFullYearTarget, fullYearTargetSum, enteredTargetSum, enteredTargetMonthCount } = targetMetrics;
  const performanceMonths = (monthRows || []).filter((m) => Number(m.totalSalesSum || 0) > 0);
  const performanceMonthCount = performanceMonths.length;
  const remainingMonths = Math.max(0, 12 - performanceMonthCount);
  const performanceSalesSum = performanceMonths.reduce((s, m) => s + Number(m.totalSalesSum || 0), 0);
  const avgMonthlySales = performanceMonthCount > 0 ? performanceSalesSum / performanceMonthCount : null;
  const paceForecast = avgMonthlySales != null ? avgMonthlySales * 12 : null;
  const remainingNeeded =
    hasFullYearTarget && fullYearTargetSum != null ? fullYearTargetSum - yearlyTotalSales : null;
  const targetAchievedOutlook =
    hasFullYearTarget && fullYearTargetSum != null && fullYearTargetSum > 0 && remainingNeeded <= 0;
  const requiredMonthly =
    hasFullYearTarget &&
    !targetAchievedOutlook &&
    remainingNeeded != null &&
    remainingNeeded > 0 &&
    remainingMonths > 0
      ? remainingNeeded / remainingMonths
      : null;
  const forecastGap =
    hasFullYearTarget && paceForecast != null && fullYearTargetSum != null && fullYearTargetSum > 0
      ? paceForecast - fullYearTargetSum
      : null;
  return {
    hasFullYearTarget,
    enteredTargetSum,
    enteredTargetMonthCount,
    fullYearTargetSum,
    performanceSalesSum,
    performanceMonthCount,
    remainingMonths,
    avgMonthlySales,
    paceForecast,
    remainingNeeded,
    requiredMonthly,
    targetAchievedOutlook,
    forecastGap,
  };
}
function buildMomComparison_(monthRows) {
  let latestIdx = -1;
  (monthRows || []).forEach((m, i) => {
    if (Number(m.totalSalesSum || 0) > 0) latestIdx = i;
  });
  if (latestIdx < 1) return null;
  const latest = monthRows[latestIdx];
  const prev = monthRows[latestIdx - 1];
  const salesDiff = Number(latest.totalSalesSum || 0) - Number(prev.totalSalesSum || 0);
  const salesRatio = calcRate(latest.totalSalesSum, prev.totalSalesSum);
  const foodDrinkDiff =
    Number(latest.foodDrinkSalesIncludingBandSum || 0) - Number(prev.foodDrinkSalesIncludingBandSum || 0);
  const operatingProfitDiff = Number(latest.operatingProfitSum || 0) - Number(prev.operatingProfitSum || 0);
  const laborDiff = Number(latest.laborCostSum || 0) - Number(prev.laborCostSum || 0);
  const latestPurchaseRate = latest.purchaseCostRates?.totalPurchaseRate;
  const prevPurchaseRate = prev.purchaseCostRates?.totalPurchaseRate;
  const purchaseRatePtDiff =
    latestPurchaseRate != null && prevPurchaseRate != null ? latestPurchaseRate - prevPurchaseRate : null;
  return {
    latest,
    prev,
    salesDiff,
    salesRatio,
    foodDrinkDiff,
    operatingProfitDiff,
    laborDiff,
    purchaseRatePtDiff,
  };
}
function buildYearlyAlerts_(ctx) {
  const alerts = [];
  const {
    yearlyProgressRate,
    hasFullYearTarget,
    fullYearTargetSum,
    enteredTargetMonthCount,
    landing,
    yearlyPurchaseCostRates,
    yearlyOperatingProfitRate,
    momComparison,
    taxMode,
  } = ctx;
  if (
    hasFullYearTarget &&
    yearlyProgressRate != null &&
    yearlyProgressRate < 100 &&
    landing?.paceForecast != null &&
    fullYearTargetSum != null &&
    fullYearTargetSum > 0 &&
    landing.paceForecast < fullYearTargetSum
  ) {
    alerts.push({
      key: "targetRisk",
      title: "年間目標未達リスク",
      detail: "現在ペース着地が目標を下回っています",
    });
  }
  const totalPurchaseRate = yearlyPurchaseCostRates?.totalPurchaseRate;
  if (totalPurchaseRate != null && totalPurchaseRate >= 30) {
    alerts.push({
      key: "purchaseHigh",
      title: "仕入率が高め",
      detail: pct1(totalPurchaseRate),
    });
  }
  const foodCostRate = yearlyPurchaseCostRates?.foodCostRate;
  if (foodCostRate != null && foodCostRate >= 35) {
    alerts.push({
      key: "foodCost",
      title: "フード原価率要確認",
      detail: pct1(foodCostRate),
    });
  }
  const drinkCostRate = yearlyPurchaseCostRates?.drinkCostRate;
  if (drinkCostRate != null && drinkCostRate >= 25) {
    alerts.push({
      key: "drinkCost",
      title: "ドリンク原価率要確認",
      detail: pct1(drinkCostRate),
    });
  }
  if (yearlyOperatingProfitRate != null && yearlyOperatingProfitRate < 12) {
    alerts.push({
      key: "opProfit",
      title: "営業利益率要確認",
      detail: pct1(yearlyOperatingProfitRate),
    });
  }
  if (momComparison && momComparison.salesDiff < 0) {
    alerts.push({
      key: "momSales",
      title: "前月比売上減",
      detail: formatSignedDisplayYen(momComparison.salesDiff, taxMode),
    });
  }
  if (momComparison) {
    const prevLabor = Number(momComparison.prev?.laborCostSum || 0);
    const laborDiff = momComparison.laborDiff;
    const laborIncreased =
      laborDiff > 0 && (prevLabor > 0 ? laborDiff / prevLabor >= 0.15 : laborDiff >= 100000);
    if (laborIncreased) {
      alerts.push({
        key: "momLabor",
        title: "人件費増加",
        detail: formatSignedDisplayYen(laborDiff, taxMode),
      });
    }
  }
  if (!hasFullYearTarget) {
    alerts.push({
      key: "noAnnualTarget",
      title: "年間目標が未設定です",
      detail: `目標入力済み ${enteredTargetMonthCount}/12ヶ月`,
    });
  }
  return alerts.slice(0, 5);
}
function yoyBarTone_(row) {
  if (Number(row.currentSales || 0) <= 0) return "rgba(132,132,132,0.55)";
  const rate = row.yoyRate;
  if (rate == null) return "rgba(132,132,132,0.55)";
  if (rate >= 100) return "linear-gradient(180deg, rgba(102,197,124,0.95), rgba(102,197,124,0.55))";
  if (rate >= 90) return "linear-gradient(180deg, rgba(201,168,76,0.95), rgba(201,168,76,0.55))";
  return "linear-gradient(180deg, rgba(223,137,79,0.95), rgba(166,74,84,0.75))";
}
function yearlyRowHoverHandlers_() {
  return {
    onMouseEnter: (e) => {
      e.currentTarget.style.background = "rgba(201,168,76,0.07)";
    },
    onMouseLeave: (e) => {
      e.currentTarget.style.background = "";
    },
  };
}
function num(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toLocaleString("ja-JP");
}
function pct(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(2) + "%";
}
function pct1(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return Number(v).toFixed(1) + "%";
}
function achievementTone(rate, hasTarget = true) {
  if (!hasTarget) {
    return {
      label: "目標未設定",
      bar: "linear-gradient(90deg,#6f6f6f,#8a8a8a)",
      chipBg: "rgba(120,120,120,0.2)",
      chipBd: "rgba(140,140,140,0.35)",
      chipTx: "#cfcfcf",
    };
  }
  const r = Number(rate || 0);
  if (r >= 100) {
    return {
      label: "達成",
      bar: "linear-gradient(90deg,#6e9b78,#88b693)",
      chipBg: "rgba(110,155,120,0.2)",
      chipBd: "rgba(136,182,147,0.35)",
      chipTx: "#a9d1b1",
    };
  }
  if (r >= 90) {
    return {
      label: "あと少し",
      bar: "linear-gradient(90deg,#b79543,#d0b05c)",
      chipBg: "rgba(201,168,76,0.2)",
      chipBd: "rgba(201,168,76,0.38)",
      chipTx: "#dfc06a",
    };
  }
  if (r >= 70) {
    return {
      label: "注意",
      bar: "linear-gradient(90deg,#b7773f,#cf9156)",
      chipBg: "rgba(205,134,74,0.2)",
      chipBd: "rgba(205,134,74,0.35)",
      chipTx: "#dca06a",
    };
  }
  return {
    label: "要確認",
    bar: "linear-gradient(90deg,#7f3d45,#9b545e)",
    chipBg: "rgba(127,61,69,0.22)",
    chipBd: "rgba(155,84,94,0.35)",
    chipTx: "#c8848e",
  };
}

function normalizeMonth(value) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}`;
}
function readSalesRoleMode() {
  try {
    const v = localStorage.getItem(SALES_ROLE_MODE_KEY);
    return v === "staff" || v === "admin" ? v : "staff";
  } catch {
    return "staff";
  }
}
function readSalesAdminTab() {
  try {
    const v = localStorage.getItem(SALES_ADMIN_TAB_KEY);
    return v === "daily" || v === "analysis" || v === "yearly" ? v : "analysis";
  } catch {
    return "analysis";
  }
}
function buildYearMonths_(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return `${year}-${mm}`;
  });
}
function monthLabelFromTarget_(targetMonth) {
  const m = Number(String(targetMonth || "").slice(5, 7));
  return Number.isFinite(m) && m > 0 ? `${m}月` : targetMonth;
}
function monthlyMetricNumber_(summary, key) {
  if (!summary || summary[key] == null) return null;
  const n = Number(summary[key]);
  return Number.isFinite(n) ? n : null;
}
function sumRecordsMetric_(rows, key) {
  return (rows || []).reduce((s, r) => s + Number(r?.metrics?.[key] || 0), 0);
}
function pickMonthlyCostMetric_(summary, actualRows, key) {
  const fromSummary = monthlyMetricNumber_(summary, key);
  if (fromSummary !== null) return fromSummary;
  return sumRecordsMetric_(actualRows, key);
}
function hasMonthlyCostSummary_(summary) {
  if (!summary) return false;
  const keys = ["purchaseTotal", "drinkPurchase", "foodPurchase", "expense", "laborCost", "bandGuarantee", "operatingProfit"];
  return keys.some((k) => monthlyMetricNumber_(summary, k) !== null);
}
function emptyMonthAggregate_(targetMonth, status, fetchError) {
  return {
    targetMonth,
    monthLabel: monthLabelFromTarget_(targetMonth),
    status,
    fetchError: fetchError || null,
    totalSalesSum: 0,
    targetSalesSum: 0,
    progressRate: null,
    foodDrinkSalesSum: 0,
    foodDrinkSalesIncludingBandSum: 0,
    bandFoodDrinkSalesSum: 0,
    hasBandDrinkBreakdown: false,
    hasBandFoodBreakdown: false,
    bandDrinkSalesSum: null,
    bandFoodSalesSum: null,
    drinkSalesSum: 0,
    foodSalesSum: 0,
    operatingProfitSum: 0,
    operatingProfitRate: null,
    actualDayCount: 0,
    futureDayCount: 0,
    laborCostSum: 0,
    purchaseTotalSum: 0,
    drinkPurchaseSum: 0,
    foodPurchaseSum: 0,
    expenseSum: 0,
    bandGuaranteeSum: 0,
    hasMonthlyCostSummary: false,
    purchaseCostRates: { totalPurchaseRate: null, drinkCostRate: null, foodCostRate: null },
    shortfall: 0,
  };
}
function aggregateMonthFromRecords_(records, targetMonth, currentBusinessDate, monthlySummary) {
  const monthRows = (records || []).filter((r) => (r.businessDate || "").startsWith(targetMonth));
  const actualRows = monthRows.filter(
    (r) => (r.businessDate || "") < currentBusinessDate && r?.metrics?.totalSales != null
  );
  const futureRows = monthRows.filter((r) => (r.businessDate || "") >= currentBusinessDate);
  const totalSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.totalSales || 0), 0);
  const targetSalesSum = monthRows.reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);
  const foodDrinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodDrinkSales || 0), 0);
  const bandFoodDrinkSalesSum = actualRows.reduce((s, r) => s + bandFoodDrinkSalesFromMetrics_(r?.metrics), 0);
  const foodDrinkSalesIncludingBandSum = foodDrinkSalesSum + bandFoodDrinkSalesSum;
  const hasBandDrinkBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_DRINK_SALES_KEYS) != null);
  const hasBandFoodBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_FOOD_SALES_KEYS) != null);
  const bandDrinkSalesSum = hasBandDrinkBreakdown
    ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_DRINK_SALES_KEYS), 0)
    : null;
  const bandFoodSalesSum = hasBandFoodBreakdown
    ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_FOOD_SALES_KEYS), 0)
    : null;
  const drinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.drinkSales || 0), 0);
  const foodSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodSales || 0), 0);
  const operatingProfitSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "operatingProfit");
  const laborCostSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "laborCost");
  const purchaseTotalSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "purchaseTotal");
  const drinkPurchaseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "drinkPurchase");
  const foodPurchaseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "foodPurchase");
  const expenseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "expense");
  const bandGuaranteeSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "bandGuarantee");
  let status = "未入力";
  if (actualRows.length > 0) status = "集計済み";
  else if (futureRows.length > 0) status = "予定あり";
  return {
    targetMonth,
    monthLabel: monthLabelFromTarget_(targetMonth),
    status,
    fetchError: null,
    totalSalesSum,
    targetSalesSum,
    progressRate: calcRate(totalSalesSum, targetSalesSum),
    foodDrinkSalesSum,
    foodDrinkSalesIncludingBandSum,
    bandFoodDrinkSalesSum,
    hasBandDrinkBreakdown,
    hasBandFoodBreakdown,
    bandDrinkSalesSum,
    bandFoodSalesSum,
    drinkSalesSum,
    foodSalesSum,
    operatingProfitSum,
    operatingProfitRate: calcRate(operatingProfitSum, totalSalesSum),
    actualDayCount: actualRows.length,
    futureDayCount: futureRows.length,
    laborCostSum,
    purchaseTotalSum,
    drinkPurchaseSum,
    foodPurchaseSum,
    expenseSum,
    bandGuaranteeSum,
    hasMonthlyCostSummary: hasMonthlyCostSummary_(monthlySummary),
    purchaseCostRates: buildPurchaseCostRates_(
      purchaseTotalSum,
      drinkPurchaseSum,
      foodPurchaseSum,
      foodDrinkSalesSum,
      drinkSalesSum,
      foodSalesSum,
      bandFoodDrinkSalesSum,
      hasBandDrinkBreakdown,
      bandDrinkSalesSum,
      hasBandFoodBreakdown,
      bandFoodSalesSum
    ),
    shortfall: Math.max(0, targetSalesSum - totalSalesSum),
  };
}
async function fetchSalesMonth_(targetMonth) {
  const sep = SALES_API_URL.includes("?") ? "&" : "?";
  const url = `${SALES_API_URL}${sep}targetMonth=${encodeURIComponent(targetMonth)}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`売上APIの応答がJSONではありません（HTTP ${res.status}）`);
  }
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  if (!json || !Array.isArray(json.records)) throw new Error("JSON形式が不正です");
  return json;
}
function YearlyMonthBarChart({ title, rows, valueKey, barTone, formatTop, taxMode, onMonthClick }) {
  const chartRows = rows.length ? rows : [];
  const maxVal = chartRows.reduce((m, r) => {
    if (r.status === "取得失敗") return m;
    const raw = r[valueKey];
    const v = raw == null ? 0 : Number(raw);
    return Math.max(m, Number.isFinite(v) ? v : 0);
  }, 0);
  const scaleMax = maxVal > 0 ? maxVal : 1;
  const clickable = typeof onMonthClick === "function";
  return (
    <div style={analysisCard("trend")}>
      <div style={analysisSecTitle("trend", ".5rem")}>{title}</div>
      {chartRows.length === 0 ? (
        <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
      ) : (
        <div style={{ width: "100%", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: ".18rem", height: 168, width: "100%" }}>
            {chartRows.map((r) => {
              const raw = r[valueKey];
              const v = raw == null ? 0 : Number(raw);
              const hasValue = r.status !== "取得失敗" && raw != null && Number.isFinite(v) && v > 0;
              const h = hasValue ? Math.max(2, Math.round((v / scaleMax) * 100)) : 2;
              const topLabel = formatTop ? formatTop(r) : hasValue ? formatDisplayCompactYen(v, taxMode) : "—";
              const monthShort = r.monthLabel || monthLabelFromTarget_(r.targetMonth);
              return (
                <div
                  key={r.targetMonth}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onMonthClick(r.targetMonth) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onMonthClick(r.targetMonth);
                          }
                        }
                      : undefined
                  }
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    textAlign: "center",
                    opacity: r.status === "未入力" || r.status === "取得失敗" ? 0.42 : r.status === "予定あり" ? 0.58 : 1,
                    cursor: clickable ? "pointer" : "default",
                    borderRadius: 4,
                    padding: clickable ? ".12rem .04rem" : 0,
                  }}
                  {...(clickable ? yearlyRowHoverHandlers_() : {})}
                >
                  <div style={{ fontSize: ".48rem", color: "rgba(240,232,208,0.62)", marginBottom: ".12rem", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {topLabel}
                  </div>
                  <div style={{ height: 130, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ width: "72%", maxWidth: 28, height: `${h}%`, minHeight: hasValue ? 4 : 2, borderRadius: "3px 3px 0 0", background: hasValue ? barTone : "rgba(240,232,208,0.08)" }} />
                  </div>
                  <div style={{ marginTop: ".18rem", fontSize: ".56rem", color: "rgba(240,232,208,0.58)" }}>{monthShort}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function YearlyYoYBarChart({ rows, onMonthClick }) {
  const chartRows = rows.length ? rows : [];
  const scaleMax = 150;
  const clickable = typeof onMonthClick === "function";
  return (
    <div style={analysisCard("trend")}>
      <div style={analysisSecTitle("trend", ".5rem")}>月別前年比</div>
      <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap", marginBottom: ".45rem", fontSize: ".64rem", color: "rgba(240,232,208,0.62)" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, marginRight: ".28rem", borderRadius: 2, background: "rgba(102,197,124,0.9)" }} />100%以上</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, marginRight: ".28rem", borderRadius: 2, background: "rgba(201,168,76,0.9)" }} />90%以上</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, marginRight: ".28rem", borderRadius: 2, background: "rgba(223,137,79,0.9)" }} />90%未満</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, marginRight: ".28rem", borderRadius: 2, background: "rgba(132,132,132,0.55)" }} />今年0</span>
      </div>
      {chartRows.length === 0 ? (
        <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
      ) : (
        <div style={{ width: "100%", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: ".18rem", height: 168, width: "100%" }}>
            {chartRows.map((r) => {
              const hasCurrent = Number(r.currentSales || 0) > 0;
              const rate = r.yoyRate;
              const barVal = hasCurrent && rate != null ? Math.min(rate, scaleMax) : 0;
              const h = barVal > 0 ? Math.max(4, Math.round((barVal / scaleMax) * 100)) : 3;
              const topLabel = hasCurrent && rate != null ? pct1(rate) : "—";
              return (
                <div
                  key={r.targetMonth}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onMonthClick(r.targetMonth) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onMonthClick(r.targetMonth);
                          }
                        }
                      : undefined
                  }
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    textAlign: "center",
                    cursor: clickable ? "pointer" : "default",
                    borderRadius: 4,
                    padding: clickable ? ".12rem .04rem" : 0,
                  }}
                  {...(clickable ? yearlyRowHoverHandlers_() : {})}
                >
                  <div style={{ fontSize: ".48rem", color: "rgba(240,232,208,0.62)", marginBottom: ".12rem", lineHeight: 1.15 }}>{topLabel}</div>
                  <div style={{ height: 130, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div
                      style={{
                        width: "72%",
                        maxWidth: 28,
                        height: `${h}%`,
                        minHeight: 3,
                        borderRadius: "3px 3px 0 0",
                        background: yoyBarTone_(r),
                      }}
                    />
                  </div>
                  <div style={{ marginTop: ".18rem", fontSize: ".56rem", color: "rgba(240,232,208,0.58)" }}>{r.monthLabel}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
function YearlyRankList({ title, variant, items, valueLabel, formatValue }) {
  return (
    <div style={analysisCard(variant)}>
      <div style={analysisSecTitle(variant, ".5rem")}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
      ) : (
        items.map((r, i) => (
          <div key={r.targetMonth} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder(variant)}` }}>
            <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.monthLabel}</div>
            <div style={{ fontSize: ".82rem", color: "#f0e8d0" }}>
              <strong style={{ fontSize: ".94rem" }}>{formatValue(r)}</strong>
              <span style={{ marginLeft: ".35rem", fontSize: ".68rem", color: "rgba(240,232,208,0.55)" }}>{valueLabel}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
function readSalesTargetMonth() {
  try {
    const v = localStorage.getItem(SALES_TARGET_MONTH_KEY);
    return normalizeMonth(v || "");
  } catch {
    return normalizeMonth("");
  }
}
const VENUE_SALES_KEYS = ["venueFee", "venueSales"];
const RENTAL_SALES_KEYS = ["hallRentalSales", "rentalSales", "hallRentalFee", "rentalFee"];
const BAND_FOOD_DRINK_SALES_KEYS = ["bandFoodDrinkSales"];
const BAND_DRINK_SALES_KEYS = ["bandDrinkSales", "bandMealDrinkSales", "bandDrink"];
const BAND_FOOD_SALES_KEYS = ["bandFoodSales", "bandMealFoodSales", "bandFood", "bandMealSales"];
function bandFoodDrinkSalesFromMetrics_(metrics) {
  return pickMetricValue(metrics, BAND_FOOD_DRINK_SALES_KEYS);
}
function foodDrinkSalesIncludingBand_(foodDrinkSales, bandFoodDrinkSales) {
  const base = foodDrinkSales != null ? Number(foodDrinkSales) : 0;
  const band = bandFoodDrinkSales != null ? Number(bandFoodDrinkSales) : 0;
  if (foodDrinkSales == null && bandFoodDrinkSales == null) return null;
  return base + band;
}
function foodDrinkIncludingBandFromRecord_(record) {
  const m = record?.metrics;
  if (!m) return null;
  return foodDrinkSalesIncludingBand_(m.foodDrinkSales, pickMetricNullable(m, BAND_FOOD_DRINK_SALES_KEYS));
}
const SALES_COMPOSITION_COLORS = {
  drink: "linear-gradient(90deg, rgba(86,156,255,0.95), rgba(86,156,255,0.62))",
  food: "linear-gradient(90deg, rgba(102,197,124,0.95), rgba(102,197,124,0.62))",
  bandFoodDrink: "linear-gradient(90deg, rgba(232,128,168,0.95), rgba(232,128,168,0.62))",
  venue: "linear-gradient(90deg, rgba(222,181,78,0.95), rgba(222,181,78,0.6))",
  rental: "linear-gradient(90deg, rgba(167,126,255,0.95), rgba(167,126,255,0.62))",
  other: "linear-gradient(90deg, rgba(120,120,120,0.95), rgba(120,120,120,0.58))",
};
const SALES_COMPOSITION_CHIP_COLORS = {
  drink: "rgba(86,156,255,0.95)",
  food: "rgba(102,197,124,0.95)",
  bandFoodDrink: "rgba(232,128,168,0.95)",
  venue: "rgba(222,181,78,0.95)",
  rental: "rgba(167,126,255,0.95)",
  other: "rgba(120,120,120,0.95)",
};
function pickMetricValue(metrics, keys) {
  const m = metrics || {};
  for (const key of keys) {
    if (m[key] != null && !Number.isNaN(Number(m[key]))) return Number(m[key] || 0);
  }
  return 0;
}
function pickMetricNullable(metrics, keys) {
  const m = metrics || {};
  for (const key of keys) {
    if (m[key] != null && !Number.isNaN(Number(m[key]))) return Number(m[key]);
  }
  return null;
}
function compositionRatesFromParts(parts, total) {
  const totalN = Number(total || 0);
  const drinkRate = calcRate(parts.drink, totalN);
  const foodRate = calcRate(parts.food, totalN);
  const bandFoodDrinkRate = calcRate(parts.bandFoodDrink, totalN);
  const venueRate = calcRate(parts.venue, totalN);
  const rentalRate = calcRate(parts.rental, totalN);
  const otherRate = calcRate(parts.other, totalN);
  return { drinkRate, foodRate, bandFoodDrinkRate, venueRate, rentalRate, otherRate };
}
function SalesCompositionLegend() {
  return (
    <div style={{ display:"flex", gap:".85rem", flexWrap:"wrap", marginBottom:".42rem", fontSize:".78rem", color:"rgba(240,232,208,0.86)" }}>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.drink }} />ドリンク</span>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.food }} />フード</span>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.bandFoodDrink }} />バンド飲食代</span>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.venue }} />会場費</span>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.rental }} />レンタル</span>
      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.other }} />その他</span>
    </div>
  );
}
function SalesCompositionBar({ rates, barHeight = 16 }) {
  const r = rates || {};
  const leftAfterDrink = Number(r.drinkRate || 0);
  const leftAfterFood = leftAfterDrink + Number(r.foodRate || 0);
  const leftAfterBand = leftAfterFood + Number(r.bandFoodDrinkRate || 0);
  const leftAfterVenue = leftAfterBand + Number(r.venueRate || 0);
  return (
    <div style={{ position:"relative", width:"100%", height:barHeight, borderRadius:999, overflow:"hidden", background:"rgba(240,232,208,0.1)", border:"1px solid rgba(201,168,76,0.22)", marginBottom:".45rem" }}>
      <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, leftAfterDrink))}%`, background:SALES_COMPOSITION_COLORS.drink }} />
      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, leftAfterDrink))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(r.foodRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.food }} />
      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, leftAfterFood))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(r.bandFoodDrinkRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.bandFoodDrink }} />
      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, leftAfterBand))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(r.venueRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.venue }} />
      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, leftAfterVenue))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(r.rentalRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.rental }} />
      <div style={{ position:"absolute", right:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(r.otherRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.other }} />
    </div>
  );
}
function trendToneByAchievement(achievementRate, targetSales) {
  if (!(Number(targetSales || 0) > 0) || achievementRate == null) {
    return {
      label: "目標未設定",
      tone: "linear-gradient(180deg, rgba(132,132,132,0.95), rgba(132,132,132,0.55))",
    };
  }
  const r = Number(achievementRate || 0);
  if (r >= 100) {
    return {
      label: "目標達成",
      tone: "linear-gradient(180deg, rgba(102,197,124,0.95), rgba(102,197,124,0.58))",
    };
  }
  if (r >= 70) {
    return {
      label: "未達 70%以上",
      tone: "linear-gradient(180deg, rgba(222,181,78,0.95), rgba(222,181,78,0.58))",
    };
  }
  if (r >= 50) {
    return {
      label: "未達 50%以上",
      tone: "linear-gradient(180deg, rgba(223,137,79,0.95), rgba(223,137,79,0.58))",
    };
  }
  return {
    label: "未達 50%未満",
    tone: "linear-gradient(180deg, rgba(166,74,84,0.95), rgba(166,74,84,0.58))",
  };
}

function getCurrentBusinessDateForSales() {
  const d = new Date();
  if (d.getHours() < 7) {
    d.setDate(d.getDate() - 1);
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function eventNamesForDate(events, businessDate) {
  const list = (events || []).filter((e) => e.date === businessDate);
  return list.map((e) => e.name).filter(Boolean);
}
function eventsForDate(events, businessDate) {
  return (events || []).filter((e) => e.date === businessDate);
}
function isRentalLikeEvent(ev) {
  const name = String(ev?.name || "");
  const genre = String(ev?.genre || "");
  return /貸切|貸し切り/.test(name) || normText(genre) === "貸切";
}
function extractCustomerNameFromEventName(name) {
  if (!name) return "";
  let n = name;
  n = n.replace(/[\[（(](昼|夜|深夜|朝|午前|午後)[\]）)]/g, "");
  n = n.replace(/^[\s　]*(昼|夜|深夜|朝|午前|午後)[\s　]+/, "");
  n = n.replace(/貸し切り|貸切/g, "");
  n = n.replace(/様/g, "");
  n = n.replace(/[\s　]+/g, " ").trim();
  return n;
}
function pickEventText(ev, keys) {
  for (const key of keys) {
    const v = String(ev?.[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}
function normalizePerformText(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s*\n+\s*/g, " / ")
    .replace(/\s*[/／、，,]+\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();
}
function joinPerformParts(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const t = normalizePerformText(p);
    if (!t) continue;
    const key = normText(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(" / ");
}
function matchEventForRecord(record, dateEvents) {
  const list = Array.isArray(dateEvents) ? dateEvents : [];
  if (list.length === 0) return null;
  const sheetName = String(record?.sheetEventName || "").trim();
  const sheetNorm = normText(sheetName);
  if (sheetNorm) {
    const exact = list.find((e) => normText(e?.name) === sheetNorm);
    if (exact) return exact;
    const partial = list.find((e) => {
      const nn = normText(e?.name);
      return nn.includes(sheetNorm) || sheetNorm.includes(nn);
    });
    if (partial) return partial;
  }
  if (list.length === 1 && !record?.flags?.isDuplicateBusinessDate) return list[0];
  return null;
}
function formatEventPerformContent(ev) {
  if (!ev) return null;
  const PERFORM_KEYS = ["perf", "performers", "artistName", "artistNames", "artists", "performerName", "cast", "members", "bandName"];
  const CONTENT_KEYS = ["desc", "description", "subtitle"];
  const RENTAL_NAME_KEYS = [
    "rentalName", "rentalTitle", "rentalContent", "privateEventName", "privateEventTitle",
    "organizerName", "customerName", "companyName", "groupName", "partyName",
    "customerCompany", "contactName",
  ];
  const RENTAL_PURPOSE_KEYS = ["purpose", "usagePurpose", "rentalContent"];
  const NOTE_KEYS = ["notes", "remark", "galleryNote", "memo"];

  if (isRentalLikeEvent(ev)) {
    const parts = [];
    const customer = extractCustomerNameFromEventName(ev.name);
    if (customer) parts.push(customer);
    const organizer = pickEventText(ev, RENTAL_NAME_KEYS);
    if (organizer && normText(organizer) !== normText(customer)) parts.push(organizer);
    const purpose = pickEventText(ev, RENTAL_PURPOSE_KEYS);
    if (purpose) parts.push(purpose);
    const perf = pickEventText(ev, PERFORM_KEYS);
    if (perf) parts.push(perf);
    const desc = pickEventText(ev, CONTENT_KEYS);
    if (desc) parts.push(desc);
    const cap = String(ev?.cap ?? "").trim();
    if (cap) parts.push(`定員 ${cap}名`);
    const memo = pickEventText(ev, NOTE_KEYS);
    if (memo) parts.push(memo.length > 80 ? `${memo.slice(0, 80)}…` : memo);
    const text = joinPerformParts(parts);
    return text || null;
  }

  const parts = [];
  const perf = pickEventText(ev, PERFORM_KEYS);
  if (perf) parts.push(perf);
  const desc = pickEventText(ev, CONTENT_KEYS);
  if (desc && normText(desc) !== normText(ev.name)) parts.push(desc);
  const genre = String(ev?.genre ?? "").trim();
  if (genre && normText(genre) !== "ライブ" && normText(genre) !== normText(ev.name)) parts.push(genre);
  const text = joinPerformParts(parts);
  return text || null;
}
function formatPerformDisplay(text, maxLen = 140) {
  const full = normalizePerformText(text);
  if (!full) return { display: null, full: null };
  if (full.length <= maxLen) return { display: full, full };
  return { display: `${full.slice(0, maxLen)}…`, full };
}
function calcRate(numer, denom) {
  const n = Number(numer || 0);
  const d = Number(denom || 0);
  if (!(d > 0)) return null;
  return (n / d) * 100;
}
function buildPurchaseCostRates_(
  purchaseTotal,
  drinkPurchase,
  foodPurchase,
  foodDrinkSales,
  drinkSales,
  foodSales,
  bandFoodDrinkSales,
  hasBandDrinkBreakdown,
  bandDrinkSalesSum,
  hasBandFoodBreakdown,
  bandFoodSalesSum
) {
  const foodDrinkIncludingBand = Number(foodDrinkSales || 0) + Number(bandFoodDrinkSales || 0);
  let drinkCostRate = calcRate(drinkPurchase, drinkSales);
  if (hasBandDrinkBreakdown) {
    drinkCostRate = calcRate(drinkPurchase, Number(drinkSales || 0) + Number(bandDrinkSalesSum || 0));
  }
  let foodCostRate = calcRate(foodPurchase, foodSales);
  if (hasBandFoodBreakdown) {
    foodCostRate = calcRate(foodPurchase, Number(foodSales || 0) + Number(bandFoodSalesSum || 0));
  }
  return {
    totalPurchaseRate: calcRate(purchaseTotal, foodDrinkIncludingBand),
    drinkCostRate,
    foodCostRate,
  };
}
const YEARLY_TABLE_NUMBER_FONT = '"Consolas", "Roboto Mono", "Courier New", monospace';
const TABLE_NUMBER_STYLE = {
  textAlign: "right",
  fontFamily: YEARLY_TABLE_NUMBER_FONT,
  fontVariantNumeric: "tabular-nums",
  fontSize: ".9rem",
  fontWeight: 500,
  lineHeight: 1.45,
  whiteSpace: "nowrap",
  letterSpacing: 0,
  padding: ".44rem .38rem",
  color: "rgba(245,240,208,0.9)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  boxSizing: "border-box",
};
const TABLE_MUTED_NUMBER_STYLE = {
  ...TABLE_NUMBER_STYLE,
  fontWeight: 500,
  color: "rgba(245,240,208,0.58)",
};
const YEARLY_TABLE_STYLE = {
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
  fontVariantNumeric: "tabular-nums",
};
const YEARLY_TABLE_WRAP = {
  width: "100%",
  maxWidth: "100%",
  overflow: "hidden",
};
const YEARLY_TABLE_ROW = {
  borderBottom: "1px solid rgba(201,168,76,0.08)",
};
const YEARLY_BASIC_COL = {
  month: 48,
  yen: 120,
  pct: 80,
  status: 80,
};
const YEARLY_PURCHASE_COL = {
  month: 48,
  yen: 120,
  rate: 90,
  rateWide: 100,
};
const YEARLY_YOY_COL = {
  month: 44,
  yen: 108,
  pct: 72,
};
const YEARLY_TH = {
  textAlign: "right",
  padding: ".4rem .42rem",
  fontWeight: 500,
  color: "rgba(201,168,76,0.76)",
  borderBottom: "1px solid rgba(201,168,76,0.12)",
  fontSize: ".62rem",
  letterSpacing: ".02em",
  whiteSpace: "nowrap",
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  boxSizing: "border-box",
};
function yearlyThStyle_(widthPx, align = "right") {
  return { ...YEARLY_TH, width: widthPx, minWidth: widthPx, maxWidth: widthPx, textAlign: align };
}
const YEARLY_TD_MONTH = {
  textAlign: "left",
  fontSize: ".88rem",
  fontWeight: 600,
  color: "#e8dcc0",
  lineHeight: 1.45,
  whiteSpace: "nowrap",
  letterSpacing: 0,
  padding: ".46rem .42rem",
  overflow: "hidden",
  textOverflow: "ellipsis",
  boxSizing: "border-box",
};
function yearlyMonthTdStyle_(widthPx) {
  return { ...YEARLY_TD_MONTH, width: widthPx, minWidth: widthPx, maxWidth: widthPx };
}
function yearlyNumTdStyle_(widthPx, muted) {
  const base = muted ? TABLE_MUTED_NUMBER_STYLE : TABLE_NUMBER_STYLE;
  return { ...base, width: widthPx, minWidth: widthPx, maxWidth: widthPx };
}
function yearlyTableRowOpacity_(m) {
  if (m.status === "取得失敗") return 0.55;
  if (m.status === "未入力" || m.status === "予定あり") return 0.68;
  return 1;
}
function yearlyTableYenCell_(m, value, taxMode) {
  if (m.status === "取得失敗") return { text: "—", muted: true };
  const n = value != null ? Number(value) : null;
  if (n == null || Number.isNaN(n)) return { text: "—", muted: true };
  const muted = m.status === "未入力" || m.status === "予定あり" || n === 0;
  return { text: formatDisplayYen(n, taxMode), muted };
}
function yearlyTablePctCell_(m, rate) {
  if (m.status === "取得失敗") return { text: "—", muted: true };
  const muted = m.status === "未入力" || m.status === "予定あり" || rate == null;
  return { text: pct1(rate), muted };
}
function YearlyTableNumberCell({ m, value, kind = "yen", width, taxMode }) {
  const cell = kind === "pct" ? yearlyTablePctCell_(m, value) : yearlyTableYenCell_(m, value, taxMode);
  return <td style={yearlyNumTdStyle_(width, cell.muted)}>{cell.text}</td>;
}
const PURCHASE_BREAKDOWN_NOTE =
  "※ドリンク仕入れ・フード仕入れは仕入れ合計の内訳です。月合計欄の値を優先しています。";

function CostProfitBarRow({ bar, maxValue, isChild, taxMode }) {
  const isLaborZero = bar.key === "labor" && Number(bar.value || 0) === 0;
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const w = isLaborZero ? 0 : Math.max(isChild ? 3 : 4, Math.round((Number(bar.value || 0) / scaleMax) * 100));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isChild ? "132px 1fr auto" : "110px 1fr auto",
        alignItems: "center",
        gap: ".45rem",
        marginLeft: isChild ? ".28rem" : 0,
        paddingLeft: isChild ? ".55rem" : 0,
        borderLeft: isChild ? "2px solid rgba(205,134,74,0.22)" : "none",
      }}
    >
      <div
        style={{
          fontSize: isChild ? ".68rem" : ".74rem",
          color: isChild ? "rgba(240,232,208,0.58)" : "rgba(240,232,208,0.74)",
          lineHeight: 1.4,
        }}
      >
        {isChild ? `内訳：${bar.label}` : bar.label}
        {!isChild && bar.note ? (
          <span style={{ marginLeft: ".28rem", fontSize: ".6rem", color: "rgba(240,232,208,0.52)" }}>{bar.note}</span>
        ) : null}
      </div>
      <div
        style={{
          height: isChild ? 7 : 10,
          borderRadius: 999,
          background: isChild ? "rgba(240,232,208,0.06)" : "rgba(240,232,208,0.1)",
          border: isChild ? "1px solid rgba(201,168,76,0.12)" : "1px solid rgba(201,168,76,0.18)",
          overflow: "hidden",
        }}
      >
        {!isLaborZero ? (
          <div
            style={{
              height: "100%",
              width: `${w}%`,
              background: bar.tone,
              opacity: isChild ? 0.72 : 1,
            }}
          />
        ) : null}
      </div>
      <div style={{ fontSize: isChild ? ".7rem" : ".74rem", color: isChild ? "rgba(240,232,208,0.82)" : "#f0e8d0" }}>
        {isLaborZero ? "¥0 / 翌月反映" : formatDisplayYen(bar.value, taxMode)}
      </div>
    </div>
  );
}

function CostProfitBarList({ bars, maxValue, taxMode }) {
  const hasPurchaseChildren = bars.some((b) => b.isPurchaseChild);
  return (
    <>
      <div style={{ display: "grid", gap: ".4rem" }}>
        {bars.map((b) => (
          <CostProfitBarRow key={b.key} bar={b} maxValue={maxValue} isChild={!!b.isPurchaseChild} taxMode={taxMode} />
        ))}
      </div>
      {hasPurchaseChildren ? (
        <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".32rem", lineHeight: 1.5 }}>
          {PURCHASE_BREAKDOWN_NOTE}
        </div>
      ) : null}
    </>
  );
}

function YearlyTableStatusCell({ m, width }) {
  return (
    <td
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        textAlign: "center",
        padding: ".46rem .32rem",
        verticalAlign: "middle",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "inline-block",
          fontSize: ".54rem",
          fontWeight: 500,
          lineHeight: 1.25,
          padding: ".05rem .26rem",
          borderRadius: 2,
          maxWidth: "100%",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          border:
            m.status === "取得失敗"
              ? "1px solid rgba(200,90,90,0.28)"
              : m.status === "集計済み"
              ? "1px solid rgba(126,200,126,0.24)"
              : m.status === "予定あり"
              ? "1px solid rgba(201,168,76,0.24)"
              : "1px solid rgba(140,140,140,0.22)",
          color:
            m.status === "取得失敗"
              ? "rgba(232,160,160,0.88)"
              : m.status === "集計済み"
              ? "rgba(158,201,168,0.88)"
              : m.status === "予定あり"
              ? "rgba(223,192,106,0.88)"
              : "rgba(240,232,208,0.55)",
        }}
      >
        {m.status}
      </span>
    </td>
  );
}
function normText(s) {
  return String(s || "").trim().toLowerCase();
}
function resolveEventNameForStaff(record, matchedEventNames) {
  const sheetName = String(record?.sheetEventName || "").trim();
  const names = Array.isArray(matchedEventNames) ? matchedEventNames.filter(Boolean) : [];
  if (names.length === 1) return names[0];
  if (names.length >= 2) {
    const sheetNorm = normText(sheetName);
    if (sheetNorm) {
      const exact = names.find((n) => normText(n) === sheetNorm);
      if (exact) return exact;
      const partial = names.find((n) => {
        const nn = normText(n);
        return nn.includes(sheetNorm) || sheetNorm.includes(nn);
      });
      if (partial) return partial;
    }
  }
  return sheetName || "";
}
function resolveEventNameForAdmin(record, matchedEventNames) {
  const names = Array.isArray(matchedEventNames) ? matchedEventNames.filter(Boolean) : [];
  const isDup = !!record?.flags?.isDuplicateBusinessDate;
  if (isDup) return String(record?.sheetEventName || "").trim() || names[0] || "";
  if (names.length > 0) return names.join(" / ");
  return String(record?.sheetEventName || "").trim();
}

export default function SalesModule({ events = [], navigateBack }) {
  const [targetMonth, setTargetMonth] = useState(() => readSalesTargetMonth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [monthlySummary, setMonthlySummary] = useState(null);
  const [roleMode, setRoleMode] = useState(() => readSalesRoleMode()); // staff | admin
  const [taxMode, setTaxMode] = useState(() => readSalesTaxMode()); // gross | net
  const [adminTab, setAdminTab] = useState(() => readSalesAdminTab()); // daily | analysis | yearly
  const [targetYear, setTargetYear] = useState(2026);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyMonthData, setYearlyMonthData] = useState([]);
  const [selectedTrendRowKey, setSelectedTrendRowKey] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const currentBusinessDate = getCurrentBusinessDateForSales();

  const loadSales = async (monthArg) => {
    const month = normalizeMonth(monthArg || targetMonth);
    setLoading(true);
    setError("");
    try {
      const sep = SALES_API_URL.includes("?") ? "&" : "?";
      const url = `${SALES_API_URL}${sep}targetMonth=${encodeURIComponent(month)}`;
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`売上APIの応答がJSONではありません（HTTP ${res.status}）`);
      }
      if (!res.ok) {
        const msg = json?.error || `HTTP ${res.status}`;
        throw new Error(`売上API取得失敗: ${msg}`);
      }
      if (!json || !Array.isArray(json.records)) throw new Error("JSON形式が不正です");
      setRecords(json.records);
      setMonthlySummary(json?.monthlySummary || null);
      setUpdatedAt(json?.meta?.generatedAt || "");
    } catch (e) {
      setRecords([]);
      setMonthlySummary(null);
      setUpdatedAt("");
      setError(e?.message || "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSales(targetMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMonth]);
  useEffect(() => {
    try {
      localStorage.setItem(SALES_TAX_MODE_KEY, taxMode === "net" ? "net" : "gross");
    } catch {}
  }, [taxMode]);
  useEffect(() => {
    try {
      localStorage.setItem(SALES_ROLE_MODE_KEY, roleMode === "admin" ? "admin" : "staff");
    } catch {}
  }, [roleMode]);
  useEffect(() => {
    try {
      if (adminTab === "daily" || adminTab === "analysis" || adminTab === "yearly") {
        localStorage.setItem(SALES_ADMIN_TAB_KEY, adminTab);
      }
    } catch {}
  }, [adminTab]);
  useEffect(() => {
    if (roleMode !== "admin" || adminTab !== "yearly") return undefined;
    let cancelled = false;
    const months = buildYearMonths_(targetYear);
    setYearlyLoading(true);
    setYearlyMonthData([]);
    (async () => {
      const results = await Promise.all(
        months.map(async (month) => {
          try {
            const json = await fetchSalesMonth_(month);
            return {
              month,
              ok: true,
              records: json.records || [],
              monthlySummary: json?.monthlySummary || null,
              error: null,
            };
          } catch (e) {
            return { month, ok: false, records: [], monthlySummary: null, error: e?.message || "取得失敗" };
          }
        })
      );
      if (!cancelled) {
        setYearlyMonthData(results);
        setYearlyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleMode, adminTab, targetYear]);
  useEffect(() => {
    try {
      localStorage.setItem(SALES_TARGET_MONTH_KEY, normalizeMonth(targetMonth));
    } catch {}
  }, [targetMonth]);

  const rows = useMemo(() => {
    return records.map((r, idx) => {
      const names = eventNamesForDate(events, r.businessDate);
      return {
        ...r,
        _idx: idx,
        resolvedEventNames: names,
      };
    });
  }, [records, events]);

  const staffProgress = useMemo(() => {
    const monthRows = rows.filter((r) => (r.businessDate || "").startsWith(targetMonth));
    const actualRows = monthRows.filter((r) => (r.businessDate || "") < currentBusinessDate && r?.metrics?.totalSales != null);
    const salesSum = actualRows.reduce((s, r) => s + Number(r.metrics.totalSales || 0), 0);
    const targetSum = monthRows.reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);
    const achievementRate = targetSum > 0 ? (salesSum / targetSum) * 100 : null;
    const remaining = targetSum - salesSum;
    const todayTargetSum = monthRows
      .filter((r) => r.businessDate === currentBusinessDate)
      .reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);

    return {
      salesSum,
      targetSum,
      achievementRate,
      remaining,
      todayTargetSum,
    };
  }, [rows, targetMonth, currentBusinessDate]);

  const monthTone = achievementTone(staffProgress.achievementRate, staffProgress.targetSum > 0);
  const monthlyAnalysis = useMemo(() => {
    const monthRows = rows.filter((r) => (r.businessDate || "").startsWith(targetMonth));
    const actualRows = monthRows.filter(
      (r) => (r.businessDate || "") < currentBusinessDate && r?.metrics?.totalSales != null
    );
    const futureRows = monthRows.filter((r) => (r.businessDate || "") >= currentBusinessDate);

    const totalSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.totalSales || 0), 0);
    const actualTargetSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);
    const fullMonthTargetSalesSum = monthRows.reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);
    const monthlyProgressRate = calcRate(totalSalesSum, fullMonthTargetSalesSum);
    const actualAchievementRate = calcRate(totalSalesSum, actualTargetSalesSum);
    const actualDayCount = actualRows.length;
    const futureDayCount = futureRows.length;
    const avgDailySales = actualDayCount > 0 ? totalSalesSum / actualDayCount : null;
    const operatingProfitSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "operatingProfit");
    const operatingProfitRate = calcRate(operatingProfitSum, totalSalesSum);
    const foodDrinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodDrinkSales || 0), 0);
    const drinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.drinkSales || 0), 0);
    const foodSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodSales || 0), 0);
    const bandFoodDrinkSalesSum = actualRows.reduce((s, r) => s + bandFoodDrinkSalesFromMetrics_(r?.metrics), 0);
    const foodDrinkSalesIncludingBandSum = foodDrinkSalesSum + bandFoodDrinkSalesSum;
    const hasBandDrinkBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_DRINK_SALES_KEYS) != null);
    const hasBandFoodBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_FOOD_SALES_KEYS) != null);
    const bandDrinkSalesSum = hasBandDrinkBreakdown
      ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_DRINK_SALES_KEYS), 0)
      : null;
    const bandFoodSalesSum = hasBandFoodBreakdown
      ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_FOOD_SALES_KEYS), 0)
      : null;
    const venueFeeSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, VENUE_SALES_KEYS), 0);
    const rentalSalesSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, RENTAL_SALES_KEYS), 0);
    const otherSalesSum = Math.max(
      0,
      totalSalesSum - drinkSalesSum - foodSalesSum - bandFoodDrinkSalesSum - venueFeeSum - rentalSalesSum
    );
    const laborCostSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "laborCost");
    const purchaseTotalSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "purchaseTotal");
    const drinkPurchaseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "drinkPurchase");
    const foodPurchaseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "foodPurchase");
    const expenseSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "expense");
    const bandGuaranteeSum = pickMonthlyCostMetric_(monthlySummary, actualRows, "bandGuarantee");
    const hasMonthlyCostSummary = hasMonthlyCostSummary_(monthlySummary);
    const validTargetRows = actualRows.filter((r) => Number(r?.metrics?.targetSales || 0) > 0);
    const underTargetRows = validTargetRows.filter((r) => {
      const rate = calcRate(r?.metrics?.totalSales, r?.metrics?.targetSales);
      return rate != null && rate < 100;
    });

    const salesRankingTop5 = [...actualRows]
      .sort((a, b) => Number(b?.metrics?.totalSales || 0) - Number(a?.metrics?.totalSales || 0))
      .slice(0, 5)
      .map((r) => {
        const totalSales = Number(r?.metrics?.totalSales || 0);
        const targetSales = Number(r?.metrics?.targetSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_sales`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          totalSales,
          targetSales,
          achievementRate: calcRate(totalSales, targetSales),
        };
      });

    const underTargetWorst5 = [...underTargetRows]
      .sort((a, b) => {
        const ar = calcRate(a?.metrics?.totalSales, a?.metrics?.targetSales) ?? 9999;
        const br = calcRate(b?.metrics?.totalSales, b?.metrics?.targetSales) ?? 9999;
        return ar - br;
      })
      .slice(0, 5)
      .map((r) => {
        const totalSales = Number(r?.metrics?.totalSales || 0);
        const targetSales = Number(r?.metrics?.targetSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_under`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          achievementRate: calcRate(totalSales, targetSales),
          totalSales,
          shortfall: Math.max(0, targetSales - totalSales),
        };
      });

    const foodDrinkRankingTop10 = actualRows
      .map((r) => {
        const foodDrinkSalesBase = r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : null;
        const bandFoodDrinkSales = pickMetricNullable(r?.metrics, BAND_FOOD_DRINK_SALES_KEYS);
        const foodDrinkSalesIncludingBand = foodDrinkSalesIncludingBand_(foodDrinkSalesBase, bandFoodDrinkSales);
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_fooddrink`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          foodDrinkSalesBase,
          bandFoodDrinkSales: bandFoodDrinkSales != null ? Number(bandFoodDrinkSales) : null,
          foodDrinkSalesIncludingBand,
          foodDrinkUnitPrice: r?.metrics?.foodDrinkUnitPrice != null ? Number(r.metrics.foodDrinkUnitPrice) : null,
          foodDrinkRate: calcRate(foodDrinkSalesIncludingBand, totalSales),
        };
      })
      .filter((r) => r.foodDrinkSalesIncludingBand != null && r.foodDrinkSalesIncludingBand > 0)
      .sort((a, b) => Number(b.foodDrinkSalesIncludingBand || 0) - Number(a.foodDrinkSalesIncludingBand || 0))
      .slice(0, 10);
    const drinkRankingTop10 = actualRows
      .filter((r) => r?.metrics?.drinkSales != null)
      .sort((a, b) => Number(b?.metrics?.drinkSales || 0) - Number(a?.metrics?.drinkSales || 0))
      .slice(0, 10)
      .map((r) => {
        const drinkSales = Number(r?.metrics?.drinkSales || 0);
        const foodDrinkIncluding = foodDrinkIncludingBandFromRecord_(r) ?? 0;
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_drink`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          drinkSales,
          drinkInFoodDrinkRate: calcRate(drinkSales, foodDrinkIncluding),
          drinkInTotalRate: calcRate(drinkSales, totalSales),
        };
      });
    const foodRankingTop10 = actualRows
      .filter((r) => r?.metrics?.foodSales != null)
      .sort((a, b) => Number(b?.metrics?.foodSales || 0) - Number(a?.metrics?.foodSales || 0))
      .slice(0, 10)
      .map((r) => {
        const foodSales = Number(r?.metrics?.foodSales || 0);
        const foodDrinkIncluding = foodDrinkIncludingBandFromRecord_(r) ?? 0;
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_food`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          foodSales,
          foodInFoodDrinkRate: calcRate(foodSales, foodDrinkIncluding),
          foodInTotalRate: calcRate(foodSales, totalSales),
        };
      });

    const dailyTrendRows = [...actualRows]
      .sort((a, b) => {
        const d = (a.businessDate || "").localeCompare(b.businessDate || "");
        if (d !== 0) return d;
        return (a.sourceColumn || 0) - (b.sourceColumn || 0);
      })
      .map((r) => {
        const totalSales = Number(r?.metrics?.totalSales || 0);
        const targetSales = Number(r?.metrics?.targetSales || 0);
        const achievementRate = calcRate(totalSales, targetSales);
        const eventName = resolveEventNameForAdmin(r, r.resolvedEventNames) || "イベント未登録";
        const matchedEvent = matchEventForRecord(r, eventsForDate(events, r.businessDate));
        const performRaw = formatEventPerformContent(matchedEvent);
        const performFormatted = formatPerformDisplay(performRaw);
        const trendTone = trendToneByAchievement(achievementRate, targetSales);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_trend`,
          rowKey: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`,
          businessDate: r.businessDate,
          weekday: r.weekday || "—",
          eventName,
          eventPerformContent: performFormatted.display,
          eventPerformContentFull: performFormatted.full,
          isDuplicateBusinessDate: !!r?.flags?.isDuplicateBusinessDate,
          totalSales,
          targetSales,
          achievementRate,
          tone: trendTone.tone,
          trendLabel: trendTone.label,
          foodDrinkSalesBase: r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : null,
          foodDrinkSalesIncludingBand: foodDrinkIncludingBandFromRecord_(r),
          drinkSales: r?.metrics?.drinkSales != null ? Number(r.metrics.drinkSales) : null,
          foodSales: r?.metrics?.foodSales != null ? Number(r.metrics.foodSales) : null,
          customerUnitPrice: r?.metrics?.customerUnitPrice != null ? Number(r.metrics.customerUnitPrice) : null,
          foodDrinkUnitPrice: r?.metrics?.foodDrinkUnitPrice != null ? Number(r.metrics.foodDrinkUnitPrice) : null,
          operatingProfit: r?.metrics?.operatingProfit != null ? Number(r.metrics.operatingProfit) : null,
          cash: r?.metrics?.cash != null ? Number(r.metrics.cash) : null,
          creditCardSales: r?.metrics?.creditCardSales != null ? Number(r.metrics.creditCardSales) : null,
          paypaySales: r?.metrics?.paypaySales != null ? Number(r.metrics.paypaySales) : null,
          receivableTotal: r?.metrics?.receivableTotal != null ? Number(r.metrics.receivableTotal) : null,
          purchaseTotal: r?.metrics?.purchaseTotal != null ? Number(r.metrics.purchaseTotal) : null,
          drinkPurchase: r?.metrics?.drinkPurchase != null ? Number(r.metrics.drinkPurchase) : null,
          foodPurchase: r?.metrics?.foodPurchase != null ? Number(r.metrics.foodPurchase) : null,
          expense: r?.metrics?.expense != null ? Number(r.metrics.expense) : null,
          laborCost: r?.metrics?.laborCost != null ? Number(r.metrics.laborCost) : null,
          bandGuarantee: r?.metrics?.bandGuarantee != null ? Number(r.metrics.bandGuarantee) : null,
          bandFoodDrinkSales: pickMetricNullable(r?.metrics, BAND_FOOD_DRINK_SALES_KEYS),
          bandDrinkSales: pickMetricNullable(r?.metrics, BAND_DRINK_SALES_KEYS),
          bandFoodSales: pickMetricNullable(r?.metrics, BAND_FOOD_SALES_KEYS),
          venueFee: pickMetricNullable(r?.metrics, VENUE_SALES_KEYS),
          rentalSales: pickMetricNullable(r?.metrics, RENTAL_SALES_KEYS),
        };
      });
    const trendMaxSales = dailyTrendRows.reduce((m, r) => Math.max(m, Number(r.totalSales || 0)), 0);

    const salesComposition = {
      drink: drinkSalesSum,
      food: foodSalesSum,
      bandFoodDrink: bandFoodDrinkSalesSum,
      venue: venueFeeSum,
      rental: rentalSalesSum,
      other: otherSalesSum,
      total: totalSalesSum,
      drinkRate: calcRate(drinkSalesSum, totalSalesSum),
      foodRate: calcRate(foodSalesSum, totalSalesSum),
      bandFoodDrinkRate: calcRate(bandFoodDrinkSalesSum, totalSalesSum),
      venueRate: calcRate(venueFeeSum, totalSalesSum),
      rentalRate: calcRate(rentalSalesSum, totalSalesSum),
      otherRate: calcRate(otherSalesSum, totalSalesSum),
    };

    const purchaseCostRates = buildPurchaseCostRates_(
      purchaseTotalSum,
      drinkPurchaseSum,
      foodPurchaseSum,
      foodDrinkSalesSum,
      drinkSalesSum,
      foodSalesSum,
      bandFoodDrinkSalesSum,
      hasBandDrinkBreakdown,
      bandDrinkSalesSum,
      hasBandFoodBreakdown,
      bandFoodSalesSum
    );
    const costProfitBars = [
      { key: "profit", label: "営業利益", value: operatingProfitSum, tone: "linear-gradient(90deg, rgba(126,200,126,0.92), rgba(126,200,126,0.58))", note: "" },
      { key: "purchase", label: "仕入れ合計", value: purchaseTotalSum, tone: "linear-gradient(90deg, rgba(205,134,74,0.9), rgba(205,134,74,0.52))", note: "月末売掛反映あり" },
      { key: "drinkPurchase", label: "ドリンク仕入れ", value: drinkPurchaseSum, tone: "linear-gradient(90deg, rgba(205,134,74,0.75), rgba(205,134,74,0.42))", note: "", isPurchaseChild: true },
      { key: "foodPurchase", label: "フード仕入れ", value: foodPurchaseSum, tone: "linear-gradient(90deg, rgba(188,120,68,0.88), rgba(188,120,68,0.48))", note: "", isPurchaseChild: true },
      { key: "expense", label: "経費", value: expenseSum, tone: "linear-gradient(90deg, rgba(155,84,94,0.9), rgba(155,84,94,0.52))", note: "暫定" },
      { key: "labor", label: "人件費", value: laborCostSum, tone: "linear-gradient(90deg, rgba(201,168,76,0.9), rgba(201,168,76,0.5))", note: "翌月反映" },
    ];
    const costProfitMax = costProfitBars.reduce((m, r) => Math.max(m, Number(r.value || 0)), 0);

    const topSalesDay = salesRankingTop5[0];
    const biggestShortfallDay = underTargetWorst5[0];
    const topFoodDrinkDay = foodDrinkRankingTop10[0];
    const monthlyHighlights = [
      topFoodDrinkDay
        ? `飲食売上トップ日：${(topFoodDrinkDay.businessDate || "").slice(5).replace("-", "/")} ${topFoodDrinkDay.eventName} ${yen(topFoodDrinkDay.foodDrinkSalesIncludingBand)}`
        : "飲食売上トップ日：データなし",
      topSalesDay
        ? `売上トップ日：${(topSalesDay.businessDate || "").slice(5).replace("-", "/")} ${topSalesDay.eventName} ${yen(topSalesDay.totalSales)}`
        : "売上トップ日：データなし",
      biggestShortfallDay
        ? `最大未達日：${(biggestShortfallDay.businessDate || "").slice(5).replace("-", "/")} ${biggestShortfallDay.eventName} 不足 ${yen(biggestShortfallDay.shortfall)}`
        : "最大未達日：未達データなし",
      `売上構成：ドリンク ${pct(salesComposition.drinkRate)} / フード ${pct(salesComposition.foodRate)} / バンド飲食代 ${pct(salesComposition.bandFoodDrinkRate)} / 会場費 ${pct(salesComposition.venueRate)} / レンタル ${pct(salesComposition.rentalRate)} / その他 ${pct(salesComposition.otherRate)}`,
      `参考：バンドギャラ ${yen(bandGuaranteeSum)}（経費には含めていません）`,
    ];

    return {
      targetMonth,
      currentBusinessDate,
      monthRows,
      actualRows,
      futureRows,
      actualDayCount,
      futureDayCount,
      totalSalesSum,
      fullMonthTargetSalesSum,
      monthlyProgressRate,
      actualTargetSalesSum,
      actualAchievementRate,
      avgDailySales,
      operatingProfitSum,
      operatingProfitRate,
      foodDrinkSalesSum,
      foodDrinkSalesIncludingBandSum,
      drinkSalesSum,
      foodSalesSum,
      purchaseCostRates,
      bandFoodDrinkSalesSum,
      hasBandDrinkBreakdown,
      hasBandFoodBreakdown,
      bandDrinkSalesSum,
      bandFoodSalesSum,
      venueFeeSum,
      rentalSalesSum,
      otherSalesSum,
      laborCostSum,
      purchaseTotalSum,
      expenseSum,
      bandGuaranteeSum,
      drinkPurchaseSum,
      foodPurchaseSum,
      hasMonthlyCostSummary,
      dailyTrendRows,
      trendMaxSales,
      salesComposition,
      costProfitBars,
      costProfitMax,
      monthlyHighlights,
      validTargetRows,
      underTargetRows,
      salesRankingTop5,
      underTargetWorst5,
      foodDrinkRankingTop10,
      drinkRankingTop10,
      foodRankingTop10,
    };
  }, [rows, events, targetMonth, currentBusinessDate, monthlySummary]);
  useEffect(() => {
    if (!monthlyAnalysis.dailyTrendRows.length) {
      setSelectedTrendRowKey("");
      return;
    }
    const exists = monthlyAnalysis.dailyTrendRows.some((r) => r.rowKey === selectedTrendRowKey);
    if (!exists) {
      setSelectedTrendRowKey(monthlyAnalysis.dailyTrendRows[0].rowKey);
    }
  }, [monthlyAnalysis.dailyTrendRows, selectedTrendRowKey]);
  const selectedTrendRow = useMemo(
    () => monthlyAnalysis.dailyTrendRows.find((r) => r.rowKey === selectedTrendRowKey) || null,
    [monthlyAnalysis.dailyTrendRows, selectedTrendRowKey]
  );
  const yearlyAnalysis = useMemo(() => {
    if (!yearlyMonthData.length) return null;
    const monthRows = yearlyMonthData.map((item) => {
      if (!item.ok) {
        return emptyMonthAggregate_(item.month, "取得失敗", item.error);
      }
      return aggregateMonthFromRecords_(item.records, item.month, currentBusinessDate, item.monthlySummary);
    });
    const okMonths = monthRows.filter((m) => m.status !== "取得失敗");
    const aggregatedMonths = monthRows.filter((m) => m.status === "集計済み");
    const yearlyTotalSales = aggregatedMonths.reduce((s, m) => s + Number(m.totalSalesSum || 0), 0);
    const targetMetrics = buildYearlyTargetMetrics_(monthRows);
    const { enteredTargetSum, enteredTargetMonthCount, hasFullYearTarget, fullYearTargetSum } = targetMetrics;
    const yearlyOperatingProfit = aggregatedMonths.reduce((s, m) => s + Number(m.operatingProfitSum || 0), 0);
    const yearlyFoodDrink = aggregatedMonths.reduce((s, m) => s + Number(m.foodDrinkSalesIncludingBandSum || 0), 0);
    const yearlyBandFoodDrink = aggregatedMonths.reduce((s, m) => s + Number(m.bandFoodDrinkSalesSum || 0), 0);
    const yearlyHasBandDrink = aggregatedMonths.some((m) => m.hasBandDrinkBreakdown);
    const yearlyHasBandFood = aggregatedMonths.some((m) => m.hasBandFoodBreakdown);
    const yearlyBandDrink = yearlyHasBandDrink
      ? aggregatedMonths.reduce((s, m) => s + Number(m.bandDrinkSalesSum || 0), 0)
      : null;
    const yearlyBandFood = yearlyHasBandFood
      ? aggregatedMonths.reduce((s, m) => s + Number(m.bandFoodSalesSum || 0), 0)
      : null;
    const yearlyDrink = aggregatedMonths.reduce((s, m) => s + Number(m.drinkSalesSum || 0), 0);
    const yearlyFood = aggregatedMonths.reduce((s, m) => s + Number(m.foodSalesSum || 0), 0);
    const yearlyLabor = aggregatedMonths.reduce((s, m) => s + Number(m.laborCostSum || 0), 0);
    const yearlyPurchase = aggregatedMonths.reduce((s, m) => s + Number(m.purchaseTotalSum || 0), 0);
    const yearlyDrinkPurchase = aggregatedMonths.reduce((s, m) => s + Number(m.drinkPurchaseSum || 0), 0);
    const yearlyFoodPurchase = aggregatedMonths.reduce((s, m) => s + Number(m.foodPurchaseSum || 0), 0);
    const yearlyExpense = aggregatedMonths.reduce((s, m) => s + Number(m.expenseSum || 0), 0);
    const yearlyBandGuarantee = aggregatedMonths.reduce((s, m) => s + Number(m.bandGuaranteeSum || 0), 0);
    const yearlyFoodDrinkBase = aggregatedMonths.reduce((s, m) => s + Number(m.foodDrinkSalesSum || 0), 0);
    const yearlyPurchaseCostRates = buildPurchaseCostRates_(
      yearlyPurchase,
      yearlyDrinkPurchase,
      yearlyFoodPurchase,
      yearlyFoodDrinkBase,
      yearlyDrink,
      yearlyFood,
      yearlyBandFoodDrink,
      yearlyHasBandDrink,
      yearlyBandDrink,
      yearlyHasBandFood,
      yearlyBandFood
    );
    const topN = (list, cmp, n) => [...list].sort(cmp).slice(0, n);
    const salesTop3 = topN(
      aggregatedMonths,
      (a, b) => Number(b.totalSalesSum || 0) - Number(a.totalSalesSum || 0),
      3
    );
    const underWorst3 = topN(
      okMonths.filter((m) => Number(m.targetSalesSum || 0) > 0 && m.progressRate != null && m.progressRate < 100),
      (a, b) => Number(a.progressRate || 0) - Number(b.progressRate || 0),
      3
    );
    const foodDrinkTop3 = topN(
      aggregatedMonths,
      (a, b) => Number(b.foodDrinkSalesIncludingBandSum || 0) - Number(a.foodDrinkSalesIncludingBandSum || 0),
      3
    );
    const drinkTop3 = topN(
      aggregatedMonths,
      (a, b) => Number(b.drinkSalesSum || 0) - Number(a.drinkSalesSum || 0),
      3
    );
    const foodTop3 = topN(
      aggregatedMonths,
      (a, b) => Number(b.foodSalesSum || 0) - Number(a.foodSalesSum || 0),
      3
    );
    const costProfitMax = Math.max(
      yearlyOperatingProfit,
      yearlyLabor,
      yearlyPurchase,
      yearlyDrinkPurchase,
      yearlyFoodPurchase,
      yearlyExpense,
      1
    );
    const yearlyCostBars = [
      { key: "profit", label: "営業利益", value: yearlyOperatingProfit, tone: "linear-gradient(90deg, rgba(126,200,126,0.92), rgba(126,200,126,0.58))", note: "" },
      { key: "purchase", label: "仕入れ合計", value: yearlyPurchase, tone: "linear-gradient(90deg, rgba(205,134,74,0.9), rgba(205,134,74,0.52))", note: "月末売掛反映あり" },
      { key: "drinkPurchase", label: "ドリンク仕入れ", value: yearlyDrinkPurchase, tone: "linear-gradient(90deg, rgba(205,134,74,0.75), rgba(205,134,74,0.42))", note: "", isPurchaseChild: true },
      { key: "foodPurchase", label: "フード仕入れ", value: yearlyFoodPurchase, tone: "linear-gradient(90deg, rgba(188,120,68,0.88), rgba(188,120,68,0.48))", note: "", isPurchaseChild: true },
      { key: "expense", label: "経費", value: yearlyExpense, tone: "linear-gradient(90deg, rgba(155,84,94,0.9), rgba(155,84,94,0.52))", note: "暫定" },
      { key: "labor", label: "人件費", value: yearlyLabor, tone: "linear-gradient(90deg, rgba(201,168,76,0.9), rgba(201,168,76,0.5))", note: "翌月反映" },
    ];
    const yearlyFoodDrinkGrossProfit = yearlyFoodDrink - yearlyPurchase;
    const yearlyFoodDrinkGrossProfitRate = calcRate(yearlyFoodDrinkGrossProfit, yearlyFoodDrink);
    const monthlyYoYRows = buildMonthlyYoYRows_(monthRows);
    const previousYearTotal = PREVIOUS_YEAR_SALES_2025_TOTAL;
    const yoyDiff = yearlyTotalSales - previousYearTotal;
    const yoyRate = previousYearTotal > 0 ? (yearlyTotalSales / previousYearTotal) * 100 : null;
    const landing = buildLandingForecast_(monthRows, yearlyTotalSales, targetMetrics);
    const momComparison = buildMomComparison_(monthRows);
    return {
      targetYear,
      monthRows,
      aggregatedMonthCount: aggregatedMonths.length,
      yearlyTotalSales,
      enteredTargetSum,
      enteredTargetMonthCount,
      hasFullYearTarget,
      fullYearTargetSum,
      yearlyProgressRate: hasFullYearTarget
        ? calcRate(yearlyTotalSales, fullYearTargetSum)
        : calcRate(yearlyTotalSales, enteredTargetSum),
      yearlyOperatingProfit,
      yearlyOperatingProfitRate: calcRate(yearlyOperatingProfit, yearlyTotalSales),
      yearlyFoodDrink,
      yearlyDrink,
      yearlyFood,
      yearlyLabor,
      yearlyPurchase,
      yearlyDrinkPurchase,
      yearlyFoodPurchase,
      yearlyExpense,
      yearlyBandGuarantee,
      yearlyPurchaseCostRates,
      yearlyCostBars,
      costProfitMax,
      salesTop3,
      underWorst3,
      foodDrinkTop3,
      drinkTop3,
      foodTop3,
      previousYearTotal,
      yoyDiff,
      yoyRate,
      monthlyYoYRows,
      landing,
      momComparison,
      yearlyFoodDrinkGrossProfit,
      yearlyFoodDrinkGrossProfitRate,
    };
  }, [yearlyMonthData, targetYear, currentBusinessDate]);
  const staffTodayRows = useMemo(
    () => rows.filter((r) => r.businessDate === currentBusinessDate),
    [rows, currentBusinessDate]
  );
  const staffUpcomingRows = useMemo(
    () =>
      rows
        .filter((r) => (r.businessDate || "") > currentBusinessDate)
        .sort((a, b) => {
          const d = (a.businessDate || "").localeCompare(b.businessDate || "");
          if (d !== 0) return d;
          return (a.sourceColumn || 0) - (b.sourceColumn || 0);
        })
        .slice(0, 5),
    [rows, currentBusinessDate]
  );

  const dy = (v) => formatDisplayYen(v, taxMode);
  const compactDy = (v) => formatDisplayCompactYen(v, taxMode);
  const signedDy = (v) => formatSignedDisplayYen(v, taxMode);

  const navigateToMonthAnalysis = (month) => {
    const tm = normalizeMonth(month);
    if (tm) setTargetMonth(tm);
    setAdminTab("analysis");
    setRoleMode("admin");
  };

  const yearlyAlertsDisplay = useMemo(() => {
    if (!yearlyAnalysis) return [];
    return buildYearlyAlerts_({
      yearlyProgressRate: yearlyAnalysis.yearlyProgressRate,
      hasFullYearTarget: yearlyAnalysis.hasFullYearTarget,
      fullYearTargetSum: yearlyAnalysis.fullYearTargetSum,
      enteredTargetMonthCount: yearlyAnalysis.enteredTargetMonthCount,
      landing: yearlyAnalysis.landing,
      yearlyPurchaseCostRates: yearlyAnalysis.yearlyPurchaseCostRates,
      yearlyOperatingProfitRate: yearlyAnalysis.yearlyOperatingProfitRate,
      momComparison: yearlyAnalysis.momComparison,
      taxMode,
    });
  }, [yearlyAnalysis, taxMode]);

  return (
    <div style={{ padding:"1.5rem 2rem", maxWidth:1180, margin:"0 auto" }} className="hb-view">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:".5rem" }}>
        <h2 style={{ fontFamily:"Georgia,serif", fontSize:"1.2rem", color:"#c9a84c", letterSpacing:".15em", margin:0 }}>📈 売上管理</h2>
        <div style={{ display:"flex", gap:".45rem", flexWrap:"wrap", alignItems:"center" }}>
          <button type="button" style={S.btn(roleMode === "staff" ? "gold" : "ghost")} onClick={() => setRoleMode("staff")}>現場表示</button>
          <button type="button" style={S.btn(roleMode === "admin" ? "gold" : "ghost")} onClick={() => setRoleMode("admin")}>管理表示</button>
          <span style={{ display:"inline-flex", gap:".2rem", alignItems:"center", padding:".12rem .2rem", borderRadius:4, border:"1px solid rgba(201,168,76,0.22)", background:"rgba(0,0,0,0.2)" }}>
            <button type="button" style={S.btn(taxMode === "gross" ? "gold" : "ghost")} onClick={() => setTaxMode("gross")}>税込</button>
            <button type="button" style={S.btn(taxMode === "net" ? "gold" : "ghost")} onClick={() => setTaxMode("net")}>税抜</button>
          </span>
          <select
            style={S.inp}
            value={targetMonth}
            onChange={(e) => setTargetMonth(normalizeMonth(e.target.value))}
          >
            {SALES_MONTH_OPTIONS_2026.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button type="button" style={S.btn("sm")} onClick={() => loadSales(targetMonth)} disabled={loading}>{loading ? "読込中..." : "🔄 再読込"}</button>
          {navigateBack && <button type="button" style={S.btn("sm")} onClick={navigateBack}>← 戻る</button>}
        </div>
      </div>

      <div style={{ fontSize:".68rem", color:"rgba(240,232,208,0.55)", marginBottom:".7rem" }}>
        {updatedAt ? <>更新時刻: {updatedAt}</> : null}
        <span style={{ marginLeft: updatedAt ? ".55rem" : 0, color: "rgba(201,168,76,0.78)" }}>
          現在：{taxMode === "net" ? "税抜表示" : "税込表示"}
        </span>
      </div>
      {taxMode === "net" && (
        <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.52)", marginBottom: ".65rem", lineHeight: 1.45 }}>
          ※税抜表示は税込金額を10%で概算換算しています。
        </div>
      )}

      {roleMode === "admin" && (
        <div style={{ display:"flex", gap:".4rem", marginBottom:".75rem", flexWrap:"wrap" }}>
          <button type="button" style={S.btn(adminTab === "daily" ? "gold" : "ghost")} onClick={() => setAdminTab("daily")}>
            日別一覧
          </button>
          <button type="button" style={S.btn(adminTab === "analysis" ? "gold" : "ghost")} onClick={() => setAdminTab("analysis")}>
            月次分析
          </button>
          <button type="button" style={S.btn(adminTab === "yearly" ? "gold" : "ghost")} onClick={() => setAdminTab("yearly")}>
            年次分析
          </button>
        </div>
      )}

      {roleMode === "staff" && !loading && !error && (
        <>
        <div style={{ ...S.card, marginBottom: ".8rem", border: "2px solid rgba(108,148,202,0.48)", background: "linear-gradient(180deg, rgba(22,34,54,0.94), rgba(14,24,39,0.96))", boxShadow: "0 8px 26px rgba(15,28,50,0.35), inset 0 1px 0 rgba(154,186,231,0.08)", padding: "1.28rem 1.35rem" }}>
          <div style={{ ...S.secTitle, marginBottom: ".55rem" }}>今月の進捗</div>

          <div style={{ display:"flex", alignItems:"baseline", gap:".55rem", flexWrap:"wrap", marginBottom:".28rem" }}>
            <div style={{ fontFamily:"Georgia,serif", fontSize:"2.7rem", lineHeight:1, color:"#f3ead2", letterSpacing:".02em", textShadow:"0 0 16px rgba(201,168,76,0.18)" }}>
              {pct(staffProgress.achievementRate)}
            </div>
            <span style={{ fontSize: ".74rem", fontWeight: 600, padding: ".16rem .58rem", borderRadius: 999, background: monthTone.chipBg, border: "1px solid " + monthTone.chipBd, color: monthTone.chipTx }}>
              {monthTone.label}
            </span>
          </div>

          <div style={{ marginBottom: ".72rem", fontSize: ".92rem", color: "rgba(240,232,208,0.95)", fontWeight: 600 }}>
            {staffProgress.remaining > 0
              ? `あと ${dy(staffProgress.remaining)} で目標達成`
              : `月間目標達成 +${dy(Math.abs(staffProgress.remaining))}`}
          </div>

          <div style={{ marginBottom: ".85rem" }}>
            <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.86)", marginBottom: ".36rem" }}>
              目標達成までの進捗 {pct1(staffProgress.achievementRate)}
            </div>
            <div style={{ position: "relative", width: "100%", height: 16, borderRadius: 999, background: "rgba(107,138,180,0.2)", overflow: "hidden", border: "1px solid rgba(125,160,207,0.3)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(100, Number(staffProgress.achievementRate || 0)))}%`,
                  background: monthTone.bar,
                  transition: "width .2s ease",
                }}
              />
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(185px,1fr))", gap:".5rem .8rem", fontSize:".74rem", color:"rgba(220,233,255,0.75)", borderTop:"1px dashed rgba(128,164,212,0.34)", paddingTop:".62rem" }}>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>今月売上: <strong style={{ color:"#f3ead2" }}>{dy(staffProgress.salesSum)}</strong></div>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>今月目標: <strong style={{ color:"#f3ead2" }}>{dy(staffProgress.targetSum)}</strong></div>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>本日目標: <strong style={{ color:"#f3ead2" }}>{dy(staffProgress.todayTargetSum)}</strong></div>
          </div>
        </div>
        <div style={{ ...S.card, marginBottom: ".75rem", padding: "1rem 1.1rem" }}>
          <div style={{ ...S.secTitle, marginBottom: ".55rem" }}>本日の営業</div>
          {staffTodayRows.length === 0 ? (
            <div style={{ fontSize: ".76rem", color: "rgba(240,232,208,0.45)" }}>本日の売上予定はありません。</div>
          ) : (
            <div style={{ display: "grid", gap: ".55rem" }}>
              {staffTodayRows.map((r) => {
                const m = r.metrics || {};
                const isDup = !!r.flags?.isDuplicateBusinessDate;
                const label = m.targetSales == null ? "未確定" : "本日";
                const name = resolveEventNameForStaff(r, r.resolvedEventNames);
                return (
                  <div key={`today_${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`} style={{ padding: ".1rem 0 .45rem", borderBottom: "1px solid rgba(201,168,76,0.16)" }}>
                    <div style={{ display:"flex", gap:".45rem", alignItems:"center", flexWrap:"wrap", marginBottom:".25rem" }}>
                      <span style={{ color:"#c9a84c", fontSize:".8rem" }}>{r.businessDate}</span>
                      <span style={{ color:"rgba(240,232,208,0.65)", fontSize:".72rem" }}>{r.weekday || "—"}</span>
                      <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(126,200,126,0.4)", color:"#7ec87e" }}>{label}</span>
                      {isDup && <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(244,162,97,0.35)", color:"#f4a261" }}>同日複数</span>}
                    </div>
                    <div style={{ fontSize:".88rem", marginBottom:".2rem", lineHeight: 1.4 }}>イベント名: <strong>{name || "イベント未登録"}</strong></div>
                    <div style={{ fontSize:".8rem" }}>本日目標: <strong>{dy(m.targetSales)}</strong></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ ...S.card, marginBottom: ".75rem", padding: "1rem 1.1rem" }}>
          <div style={{ ...S.secTitle, marginBottom: ".55rem" }}>近日予定</div>
          {staffUpcomingRows.length === 0 ? (
            <div style={{ fontSize: ".76rem", color: "rgba(240,232,208,0.45)" }}>近日予定はありません。</div>
          ) : (
            <div style={{ display: "grid", gap: ".1rem" }}>
              {staffUpcomingRows.map((r) => {
                const m = r.metrics || {};
                const isDup = !!r.flags?.isDuplicateBusinessDate;
                const name = resolveEventNameForStaff(r, r.resolvedEventNames);
                return (
                  <div key={`upcoming_${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`} style={{ padding: ".5rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                    <div style={{ display:"grid", gridTemplateColumns:"140px 1fr auto", gap:".55rem", alignItems:"center" }}>
                      <div style={{ display:"flex", gap:".4rem", alignItems:"center", flexWrap:"wrap" }}>
                        <span style={{ color:"#c9a84c", fontSize:".8rem" }}>{r.businessDate}</span>
                        <span style={{ color:"rgba(240,232,208,0.65)", fontSize:".72rem" }}>{r.weekday || "—"}</span>
                      </div>
                      <div style={{ fontSize:".8rem", lineHeight:1.4, color:"#f0e8d0" }}>{name || "イベント未登録"}</div>
                      <div style={{ textAlign:"right", whiteSpace:"nowrap" }}>
                        <span style={{ fontSize:".74rem", color:"rgba(240,232,208,0.85)", marginRight:".45rem" }}>{dy(m.targetSales)}</span>
                        {isDup && <span style={{ marginLeft: ".28rem", fontSize:".56rem", padding:".06rem .35rem", borderRadius:3, border:"1px solid rgba(244,162,97,0.35)", color:"#f4a261" }}>同日複数</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
      )}

      {error && (
        <div style={{ ...S.card, marginBottom:".75rem", border:"1px solid rgba(226,75,74,0.4)", background:"rgba(226,75,74,0.08)", color:"#ff9999", fontSize:".82rem" }}>
          ⚠️ 取得失敗: {error}
        </div>
      )}

      {loading && (
        <div style={{ ...S.card, textAlign:"center", color:"rgba(201,168,76,0.8)", letterSpacing:".08em" }}>
          売上データを読み込んでいます...
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ ...S.card, textAlign:"center", color:"rgba(240,232,208,0.45)" }}>
          該当月の売上データはありません。
        </div>
      )}

      {!loading && !error && rows.length > 0 && roleMode === "admin" && adminTab === "analysis" && (
        <div style={{ display:"grid", gap:".75rem", marginBottom:".75rem" }}>
          <div style={analysisCard("summary")}>
            <div style={analysisSecTitle("summary", ".55rem")}>月次サマリー</div>
            <div style={{ display:"grid", gap:".52rem" }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:".45rem", flexWrap:"wrap" }}>
                <div style={{ fontFamily:"Georgia,serif", fontSize:"2.45rem", lineHeight:1, color:"#f8efd8", textShadow:"0 0 28px rgba(201,168,76,0.22), 0 2px 4px rgba(0,0,0,0.35)" }}>{pct(monthlyAnalysis.monthlyProgressRate)}</div>
                <span style={{ fontSize: ".76rem", fontWeight: 700, padding: ".16rem .58rem", borderRadius: 999, background: achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipBg, border: "1px solid " + achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipBd, color: achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipTx }}>
                  {achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).label}
                </span>
              </div>
              <div style={{ fontSize: ".94rem", color: "rgba(240,232,208,0.95)", fontWeight: 700 }}>
                {monthlyAnalysis.fullMonthTargetSalesSum > 0 && monthlyAnalysis.totalSalesSum >= monthlyAnalysis.fullMonthTargetSalesSum
                  ? `月間目標達成 +${dy(Math.abs(monthlyAnalysis.totalSalesSum - monthlyAnalysis.fullMonthTargetSalesSum))}`
                  : `あと ${dy(Math.max(0, monthlyAnalysis.fullMonthTargetSalesSum - monthlyAnalysis.totalSalesSum))}`}
              </div>
              <div style={{ fontSize: ".9rem" }}>
                月間進捗率 <strong style={{ fontSize: "1rem" }}>{pct(monthlyAnalysis.monthlyProgressRate)}</strong>
              </div>
              <div style={{ fontSize: ".9rem" }}>
                月間売上 <strong style={{ fontSize: "1rem" }}>{dy(monthlyAnalysis.totalSalesSum)}</strong> / 月間目標 <strong style={{ fontSize: "1rem" }}>{dy(monthlyAnalysis.fullMonthTargetSalesSum)}</strong>
              </div>
              <div style={{ fontSize: ".84rem", color:"rgba(240,232,208,0.75)" }}>
                実績日達成率: <strong>{pct(monthlyAnalysis.actualAchievementRate)}</strong>
                <span style={{ marginLeft: ".35rem" }}>（実績日ベース目標 {dy(monthlyAnalysis.actualTargetSalesSum)}）</span>
              </div>
              <div style={{ fontSize: ".72rem", color:"rgba(240,232,208,0.58)" }}>
                ※終了済み営業日の目標に対する達成率
              </div>
              <div style={{ fontSize: ".9rem" }}>
                営業利益 <strong style={{ fontSize: "1rem" }}>{dy(monthlyAnalysis.operatingProfitSum)}</strong> / 営業利益率 <strong style={{ fontSize: "1rem" }}>{pct(monthlyAnalysis.operatingProfitRate)}</strong>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".35rem .8rem", fontSize:".84rem", color:"rgba(240,232,208,0.85)" }}>
                <div>実績日数 <strong>{num(monthlyAnalysis.actualDayCount)}日</strong></div>
                <div>本日以降の予定 <strong>{num(monthlyAnalysis.futureDayCount)}件</strong></div>
                <div>1日平均売上 <strong>{dy(monthlyAnalysis.avgDailySales)}</strong></div>
              </div>
            </div>
          </div>

          <div style={analysisCard("composition")}>
            <div style={analysisSecTitle("composition", ".5rem")}>売上構成</div>
            <SalesCompositionLegend />
            <SalesCompositionBar rates={monthlyAnalysis.salesComposition} />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:".35rem .8rem", fontSize:".76rem" }}>
              <div>ドリンク: <strong>{dy(monthlyAnalysis.drinkSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.drinkRate)}）</div>
              <div>フード: <strong>{dy(monthlyAnalysis.foodSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.foodRate)}）</div>
              <div>
                バンド飲食代: <strong>{dy(monthlyAnalysis.bandFoodDrinkSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.bandFoodDrinkRate)}）
                {monthlyAnalysis.hasBandDrinkBreakdown ? (
                  <span style={{ display:"block", marginTop:".12rem", paddingLeft:".5rem", fontSize:".7rem", color:"rgba(240,232,208,0.68)" }}>
                    うちバンドドリンク {dy(monthlyAnalysis.bandDrinkSalesSum)}
                  </span>
                ) : null}
                {monthlyAnalysis.hasBandFoodBreakdown ? (
                  <span style={{ display:"block", marginTop:".12rem", paddingLeft:".5rem", fontSize:".7rem", color:"rgba(240,232,208,0.68)" }}>
                    うちバンドフード {dy(monthlyAnalysis.bandFoodSalesSum)}
                  </span>
                ) : null}
              </div>
              <div>会場費: <strong>{dy(monthlyAnalysis.venueFeeSum)}</strong>（{pct(monthlyAnalysis.salesComposition.venueRate)}）</div>
              <div>レンタル: <strong>{dy(monthlyAnalysis.rentalSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.rentalRate)}）</div>
              <div>その他: <strong>{dy(monthlyAnalysis.otherSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.otherRate)}）</div>
            </div>
          </div>

          <div style={analysisCard("costProfit")}>
            <div style={analysisSecTitle("costProfit", ".35rem")}>コスト・利益比較（暫定）</div>
            <div style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.62)", marginBottom: ".5rem", lineHeight: 1.5 }}>
              ※人件費は翌月まとめて反映されます。仕入・経費は月末に売掛分が加算されるため、月中は暫定値です。
              {monthlyAnalysis.hasMonthlyCostSummary ? (
                <span style={{ display: "block", marginTop: ".2rem", color: "rgba(201,168,76,0.78)" }}>
                  ※月合計欄の値を反映しています（月確定に近い数字です）。
                </span>
              ) : null}
            </div>
            <CostProfitBarList bars={monthlyAnalysis.costProfitBars} maxValue={monthlyAnalysis.costProfitMax} taxMode={taxMode} />
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>原価率</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".32rem .55rem", fontSize: ".74rem", color: "rgba(240,232,208,0.82)" }}>
                <div>総仕入率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.totalPurchaseRate)}</span></div>
                <div>ドリンク原価率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.drinkCostRate)}</span></div>
                <div>フード原価率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.foodCostRate)}</span></div>
              </div>
            </div>
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.78)" }}>
                参考：バンドギャラ <span style={{ color: "#f0e8d0" }}>{dy(monthlyAnalysis.bandGuaranteeSum)}</span>
              </div>
              <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.54)", marginTop: ".12rem" }}>
                ※経費には含めていません
              </div>
            </div>
          </div>

          <div style={analysisCard("trend")}>
            <div style={analysisSecTitle("trend", ".5rem")}>日別売上推移</div>
            <div style={{ display:"flex", gap:".7rem", flexWrap:"wrap", marginBottom:".45rem", fontSize:".72rem", color:"rgba(240,232,208,0.8)" }}>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(102,197,124,0.95)" }} />目標達成</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(222,181,78,0.95)" }} />未達 70%以上</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(223,137,79,0.95)" }} />未達 50%以上</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(166,74,84,0.95)" }} />未達 50%未満</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(132,132,132,0.95)" }} />目標未設定</span>
            </div>
            {monthlyAnalysis.dailyTrendRows.length === 0 ? (
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
            ) : (
              <div style={{ overflowX: "auto", paddingBottom: ".1rem" }}>
                <div style={{ display:"flex", alignItems:"flex-end", gap:".38rem", height:220, minWidth:"100%" }}>
                  {monthlyAnalysis.dailyTrendRows.map((r) => {
                    const h = monthlyAnalysis.trendMaxSales > 0
                      ? Math.max(2, Math.round((Number(r.totalSales || 0) / monthlyAnalysis.trendMaxSales) * 100))
                      : 2;
                    return (
                      <div
                        key={r.key}
                        style={{ flex: "0 0 28px", minWidth: 28, textAlign:"center", display:"flex", flexDirection:"column", height:"100%", cursor:"pointer", opacity: selectedTrendRowKey && selectedTrendRowKey !== r.rowKey ? 0.78 : 1 }}
                        title={`${r.businessDate} / ${r.eventName} / 売上 ${dy(r.totalSales)} / 目標 ${dy(r.targetSales)} / 達成率 ${pct(r.achievementRate)} / ${r.trendLabel}`}
                        onClick={() => setSelectedTrendRowKey(r.rowKey)}
                      >
                        <div style={{ fontSize:".52rem", color:"rgba(240,232,208,0.68)", marginBottom:".18rem", whiteSpace:"nowrap" }}>
                          {compactDy(r.totalSales)}
                        </div>
                        <div style={{ flex:1, height:170, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
                          <div style={{ width:"100%", height:`${h}%`, minHeight:6, borderRadius:"4px 4px 0 0", background:r.tone, boxShadow: selectedTrendRowKey === r.rowKey ? "0 0 0 1px rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.14)" : "inset 0 0 0 1px rgba(255,255,255,0.08)" }} />
                        </div>
                        <div style={{ marginTop:".22rem", fontSize:".58rem", color:"rgba(240,232,208,0.6)", whiteSpace:"nowrap" }}>{(r.businessDate || "").slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {selectedTrendRow && (
              <div style={{ marginTop: ".75rem", borderTop: "1px dashed rgba(175,180,190,0.2)", paddingTop: ".7rem" }}>
                <div style={analysisCard("dayReport")}>
                  <div style={{ ...analysisSecTitle("dayReport"), fontSize: ".86rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "none" }}>選択日の営業レポート</div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>A. 基本情報</div>
                    <div style={{ display:"grid", gap:".38rem", fontSize:".8rem" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:".34rem .7rem" }}>
                        <div>日付: <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.businessDate || "—"}</strong></div>
                        <div>曜日: <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.weekday || "—"}</strong></div>
                      </div>
                      <div>
                        イベント名:{" "}
                        <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.eventName || "イベント未登録"}</strong>
                        {selectedTrendRow.isDuplicateBusinessDate ? (
                          <span style={{ marginLeft: ".35rem", fontSize: ".6rem", padding: ".08rem .42rem", borderRadius: 3, border: "1px solid rgba(244,162,97,0.35)", color: "#f4a261" }}>同日複数</span>
                        ) : null}
                      </div>
                      {selectedTrendRow.eventPerformContent ? (
                        <div
                          title={selectedTrendRow.eventPerformContentFull || selectedTrendRow.eventPerformContent}
                          style={{ lineHeight: 1.45 }}
                        >
                          出演・内容:{" "}
                          <strong
                            style={{
                              fontSize: ".92rem",
                              color: "#e8dcc0",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              wordBreak: "break-word",
                            }}
                          >
                            {selectedTrendRow.eventPerformContent}
                          </strong>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>B. 売上・目標</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>売上合計: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{dy(selectedTrendRow.totalSales)}</strong></div>
                      <div>目標: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.targetSales)}</strong></div>
                      <div>達成率: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{pct(selectedTrendRow.achievementRate)}</strong></div>
                      <div>客単価: <strong style={{ fontSize: ".94rem" }}>{num(selectedTrendRow.customerUnitPrice)}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>C. 飲食内訳</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>飲食売上: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.foodDrinkSalesIncludingBand)}</strong></div>
                      <div>通常飲食売上: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.foodDrinkSalesBase)}</strong></div>
                      {selectedTrendRow.bandFoodDrinkSales != null && Number(selectedTrendRow.bandFoodDrinkSales) > 0 ? (
                        <div>バンド飲食代: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.bandFoodDrinkSales)}</strong></div>
                      ) : null}
                      <div>飲食比率: <strong style={{ fontSize: ".94rem" }}>{pct(calcRate(selectedTrendRow.foodDrinkSalesIncludingBand, selectedTrendRow.totalSales))}</strong></div>
                      <div>ドリンク売上: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.drinkSales)}</strong></div>
                      <div>フード売上: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.foodSales)}</strong></div>
                      <div>飲食単価: <strong style={{ fontSize: ".94rem" }}>{num(selectedTrendRow.foodDrinkUnitPrice)}</strong></div>
                      {selectedTrendRow.bandDrinkSales != null ? (
                        <div>バンドドリンク: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.bandDrinkSales)}</strong></div>
                      ) : null}
                      {selectedTrendRow.bandFoodSales != null ? (
                        <div>バンドフード: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.bandFoodSales)}</strong></div>
                      ) : null}
                    </div>
                    <div style={{ marginTop: ".4rem", fontSize: ".66rem", color: "rgba(240,232,208,0.72)" }}>売上構成</div>
                    <SalesCompositionLegend />
                    <SalesCompositionBar
                      rates={compositionRatesFromParts({
                        drink: Number(selectedTrendRow.drinkSales || 0),
                        food: Number(selectedTrendRow.foodSales || 0),
                        bandFoodDrink: Number(selectedTrendRow.bandFoodDrinkSales || 0),
                        venue: Number(selectedTrendRow.venueFee || 0),
                        rental: Number(selectedTrendRow.rentalSales || 0),
                        other: Math.max(0, Number(selectedTrendRow.totalSales || 0) - Number(selectedTrendRow.drinkSales || 0) - Number(selectedTrendRow.foodSales || 0) - Number(selectedTrendRow.bandFoodDrinkSales || 0) - Number(selectedTrendRow.venueFee || 0) - Number(selectedTrendRow.rentalSales || 0)),
                      }, selectedTrendRow.totalSales)}
                      barHeight={12}
                    />
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>D. 決済・入金</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>現金: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.cash)}</strong></div>
                      <div>クレジット: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.creditCardSales)}</strong></div>
                      <div>PayPay: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.paypaySales)}</strong></div>
                      <div>売掛合計: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.receivableTotal)}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>E. コスト・利益</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>営業利益: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{dy(selectedTrendRow.operatingProfit)}</strong></div>
                      <div>仕入れ合計: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.purchaseTotal)}</strong></div>
                      <div>ドリンク仕入れ: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.drinkPurchase)}</strong></div>
                      <div>フード仕入れ: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.foodPurchase)}</strong></div>
                      <div>経費: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.expense)}</strong></div>
                      <div>人件費: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.laborCost)}</strong></div>
                    </div>
                    <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".28rem", lineHeight: 1.45 }}>
                      ※仕入・経費・人件費は月末/翌月反映分を含まない場合があります。
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>F. 参考情報</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>参考：バンドギャラ <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.bandGuarantee)}</strong></div>
                    </div>
                    <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.55)", marginTop: ".2rem" }}>※経費には含めていません</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:".65rem" }}>
            <div style={analysisCard("rankSales")}>
              <div style={analysisSecTitle("rankSales", ".5rem")}>月間売上TOP5</div>
              {monthlyAnalysis.salesRankingTop5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.salesRankingTop5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankSales")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}><strong style={{ fontSize: ".94rem" }}>{dy(r.totalSales)}</strong>{r.achievementRate != null ? <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>達成率 {pct(r.achievementRate)}</span> : null}</div>
                </div>
              ))}
            </div>

            <div style={analysisCard("rankUnder")}>
              <div style={analysisSecTitle("rankUnder", ".5rem")}>月間目標未達ワースト5</div>
              {monthlyAnalysis.underTargetWorst5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>未達データなし</div>
              ) : monthlyAnalysis.underTargetWorst5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankUnder")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>売上 <strong style={{ fontSize: ".92rem" }}>{dy(r.totalSales)}</strong> / 達成率 <strong style={{ fontSize: ".9rem" }}>{pct(r.achievementRate)}</strong> / 不足 <strong style={{ fontSize: ".94rem" }}>{dy(r.shortfall)}</strong></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:".65rem" }}>
            <div style={analysisCard("rankFoodDrink")}>
              <div style={analysisSecTitle("rankFoodDrink", ".5rem")}>月間飲食売上TOP10</div>
              {monthlyAnalysis.foodDrinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodDrinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankFoodDrink")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{dy(r.foodDrinkSalesIncludingBand)}</strong>
                    {r.bandFoodDrinkSales != null && r.bandFoodDrinkSales > 0 ? (
                      <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                        バンド飲食代 {dy(r.bandFoodDrinkSales)}
                      </span>
                    ) : null}
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      飲食比率 {pct(r.foodDrinkRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={analysisCard("rankDrink")}>
              <div style={analysisSecTitle("rankDrink", ".5rem")}>月間ドリンク売上TOP10</div>
              {monthlyAnalysis.drinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.drinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankDrink")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{dy(r.drinkSales)}</strong>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      飲食比率 {pct(r.drinkInFoodDrinkRate)}
                    </span>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      総売上比率 {pct(r.drinkInTotalRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={analysisCard("rankFood")}>
              <div style={analysisSecTitle("rankFood", ".5rem")}>月間フード売上TOP10</div>
              {monthlyAnalysis.foodRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankFood")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{dy(r.foodSales)}</strong>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      飲食比率 {pct(r.foodInFoodDrinkRate)}
                    </span>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      総売上比率 {pct(r.foodInTotalRate)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {roleMode === "admin" && adminTab === "yearly" && (
        <div style={{ display: "grid", gap: ".75rem", marginBottom: ".75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".15rem" }}>
            <span style={{ fontSize: ".72rem", color: "rgba(201,168,76,0.85)" }}>対象年</span>
            <select
              style={{ ...S.inp, width: "auto", minWidth: 100 }}
              value={String(targetYear)}
              onChange={(e) => setTargetYear(Number(e.target.value) || 2026)}
            >
              <option value="2026">2026年</option>
            </select>
          </div>

          {yearlyLoading && (
            <div style={{ ...S.card, textAlign: "center", color: "rgba(201,168,76,0.85)", letterSpacing: ".08em", padding: "1.2rem" }}>
              年次データを読み込み中...
            </div>
          )}

          {!yearlyLoading && yearlyAnalysis && (
            <>
              <div style={analysisCard("summary")}>
                <div style={analysisSecTitle("summary", ".55rem")}>{targetYear}年 年次サマリー</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: ".45rem", flexWrap: "wrap", marginBottom: ".4rem" }}>
                  <div style={{ fontFamily: "Georgia,serif", fontSize: "2.1rem", lineHeight: 1, color: "#f8efd8", textShadow: "0 0 28px rgba(201,168,76,0.22)" }}>
                    {pct(yearlyAnalysis.yearlyProgressRate)}
                  </div>
                  <span style={{ fontSize: ".76rem", color: "rgba(240,232,208,0.72)" }}>
                    {yearlyAnalysis.hasFullYearTarget ? "年間進捗率" : "入力済み目標進捗率"}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".35rem .8rem", fontSize: ".84rem", color: "rgba(240,232,208,0.88)" }}>
                  <div>年間売上 <strong style={{ fontSize: "1rem" }}>{dy(yearlyAnalysis.yearlyTotalSales)}</strong></div>
                  {yearlyAnalysis.hasFullYearTarget ? (
                    <div>年間目標 <strong style={{ fontSize: "1rem" }}>{dy(yearlyAnalysis.fullYearTargetSum)}</strong></div>
                  ) : (
                    <>
                      <div>入力済み目標合計 <strong style={{ fontSize: "1rem" }}>{dy(yearlyAnalysis.enteredTargetSum)}</strong></div>
                      <div>
                        目標入力済み{" "}
                        <strong>
                          {num(yearlyAnalysis.enteredTargetMonthCount)}ヶ月 / 12ヶ月
                        </strong>
                      </div>
                    </>
                  )}
                  <div>年間営業利益 <strong>{dy(yearlyAnalysis.yearlyOperatingProfit)}</strong></div>
                  <div>年間営業利益率 <strong>{pct(yearlyAnalysis.yearlyOperatingProfitRate)}</strong></div>
                  <div>年間飲食売上 <strong>{dy(yearlyAnalysis.yearlyFoodDrink)}</strong></div>
                  <div>年間ドリンク <strong>{dy(yearlyAnalysis.yearlyDrink)}</strong></div>
                  <div>年間フード <strong>{dy(yearlyAnalysis.yearlyFood)}</strong></div>
                  <div>集計済み月数 <strong>{num(yearlyAnalysis.aggregatedMonthCount)}ヶ月</strong></div>
                </div>
              </div>

              {(() => {
                const landing = yearlyAnalysis.landing;
                const hasFullYearTarget = landing?.hasFullYearTarget;
                const pacePositive =
                  hasFullYearTarget &&
                  (landing?.targetAchievedOutlook || (landing?.forecastGap != null && landing.forecastGap >= 0));
                const landingTone = hasFullYearTarget
                  ? pacePositive
                    ? { border: "1px solid rgba(102,197,124,0.35)", accent: "#9ec9a8" }
                    : { border: "1px solid rgba(190,120,88,0.32)", accent: "#dca06a" }
                  : { border: "1px solid rgba(201,168,76,0.22)", accent: "#c9a84c" };
                return (
                  <div style={{ ...analysisCard("summary"), ...landingTone, marginTop: 0 }}>
                    <div style={analysisSecTitle("summary", ".5rem")}>着地予測</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: ".35rem .8rem", fontSize: ".82rem", color: "rgba(240,232,208,0.88)" }}>
                      <div>現在までの実績売上 <strong style={{ color: landingTone.accent }}>{dy(landing?.performanceSalesSum)}</strong></div>
                      {hasFullYearTarget ? (
                        <>
                          <div>年間目標 <strong>{dy(landing?.fullYearTargetSum)}</strong></div>
                          <div>
                            残り必要売上{" "}
                            <strong style={{ color: landingTone.accent }}>
                              {landing?.targetAchievedOutlook ? "目標達成見込み" : dy(Math.max(0, landing?.remainingNeeded ?? 0))}
                            </strong>
                          </div>
                          <div>残り月数 <strong>{num(landing?.remainingMonths)}ヶ月</strong></div>
                          <div>
                            目標達成に必要な月商{" "}
                            <strong>
                              {landing?.targetAchievedOutlook ? "—" : landing?.requiredMonthly != null ? dy(landing.requiredMonthly) : "—"}
                            </strong>
                          </div>
                          <div>
                            現在ペースでの年間着地予測{" "}
                            <strong style={{ color: landingTone.accent }}>{landing?.paceForecast != null ? dy(landing.paceForecast) : "—"}</strong>
                          </div>
                          <div>
                            着地予測と年間目標の差額{" "}
                            <strong style={{ color: landingTone.accent }}>
                              {landing?.forecastGap != null ? signedDy(landing.forecastGap) : "—"}
                            </strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>入力済み目標合計 <strong>{dy(landing?.enteredTargetSum)}</strong></div>
                          <div>
                            目標入力済み月数{" "}
                            <strong>
                              {num(landing?.enteredTargetMonthCount)}ヶ月 / 12ヶ月
                            </strong>
                          </div>
                          <div>
                            現在ペースでの年間着地予測{" "}
                            <strong style={{ color: landingTone.accent }}>{landing?.paceForecast != null ? dy(landing.paceForecast) : "—"}</strong>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".42rem", lineHeight: 1.5 }}>
                      ※実績月（売上が1円以上の月）{num(landing?.performanceMonthCount)}ヶ月の平均から年間12ヶ月分を試算しています。
                      {!hasFullYearTarget ? (
                        <span style={{ display: "block", marginTop: ".22rem" }}>
                          ※年間目標が未設定のため、必要月商・目標差額は表示していません。現在ペース着地は実績月平均からの概算です。
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })()}

              {yearlyAnalysis.momComparison && (
                <div style={analysisCard("composition")}>
                  <div style={analysisSecTitle("composition", ".5rem")}>前月比較</div>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.62)", marginBottom: ".45rem" }}>
                    {yearlyAnalysis.momComparison.latest.monthLabel} vs {yearlyAnalysis.momComparison.prev.monthLabel}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: ".35rem .8rem", fontSize: ".82rem" }}>
                    <div>
                      前月売上差額{" "}
                      <strong style={{ color: yearlyAnalysis.momComparison.salesDiff >= 0 ? "#9ec9a8" : "#dca06a" }}>
                        {signedDy(yearlyAnalysis.momComparison.salesDiff)}
                      </strong>
                    </div>
                    <div>
                      前月売上比率{" "}
                      <strong>{yearlyAnalysis.momComparison.salesRatio != null ? pct1(yearlyAnalysis.momComparison.salesRatio) : "—"}</strong>
                    </div>
                    <div>
                      前月飲食売上差額{" "}
                      <strong style={{ color: yearlyAnalysis.momComparison.foodDrinkDiff >= 0 ? "#9ec9a8" : "#dca06a" }}>
                        {signedDy(yearlyAnalysis.momComparison.foodDrinkDiff)}
                      </strong>
                    </div>
                    <div>
                      前月営業利益差額{" "}
                      <strong style={{ color: yearlyAnalysis.momComparison.operatingProfitDiff >= 0 ? "#9ec9a8" : "#dca06a" }}>
                        {signedDy(yearlyAnalysis.momComparison.operatingProfitDiff)}
                      </strong>
                    </div>
                    <div>
                      前月総仕入率差{" "}
                      <strong
                        style={{
                          color:
                            yearlyAnalysis.momComparison.purchaseRatePtDiff != null &&
                            yearlyAnalysis.momComparison.purchaseRatePtDiff > 0
                              ? "#dca06a"
                              : "#9ec9a8",
                        }}
                      >
                        {formatPtDiff(yearlyAnalysis.momComparison.purchaseRatePtDiff)}
                      </strong>
                    </div>
                    <div>
                      前月人件費差{" "}
                      <strong
                        style={{
                          color: yearlyAnalysis.momComparison.laborDiff > 0 ? "#dca06a" : "#9ec9a8",
                        }}
                      >
                        {signedDy(yearlyAnalysis.momComparison.laborDiff)}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              <div style={analysisCard("summary")}>
                <div style={analysisSecTitle("summary", ".5rem")}>前年比較（2025年固定データ）</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: ".35rem .8rem", fontSize: ".84rem", color: "rgba(240,232,208,0.88)" }}>
                  <div>今年売上合計 <strong style={{ fontSize: "1rem" }}>{dy(yearlyAnalysis.yearlyTotalSales)}</strong></div>
                  <div>前年売上合計 <strong style={{ fontSize: "1rem" }}>{dy(yearlyAnalysis.previousYearTotal)}</strong></div>
                  <div>
                    前年差額{" "}
                    <strong style={{ color: yearlyAnalysis.yoyDiff >= 0 ? "#9ec9a8" : "#dca06a" }}>
                      {signedDy(yearlyAnalysis.yoyDiff)}
                    </strong>
                  </div>
                  <div>
                    前年比 <strong>{yearlyAnalysis.yoyRate != null ? pct1(yearlyAnalysis.yoyRate) : "—"}</strong>
                  </div>
                </div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".38rem" }}>
                  ※2025年はスプレッドシート構造差のためAPI未取得。上記は税込固定値（合計 {dy(PREVIOUS_YEAR_SALES_2025_TOTAL)}）との比較です。
                </div>
              </div>

              <div
                style={{
                  ...analysisCard("trend"),
                  border: "1px solid rgba(190,120,88,0.22)",
                  background: "linear-gradient(180deg, rgba(18,16,12,0.99), rgba(10,10,10,1))",
                }}
              >
                <div style={{ ...analysisSecTitle("trend", ".5rem"), color: "#d4a88a" }}>注意アラート</div>
                {yearlyAlertsDisplay.length === 0 ? (
                  <div style={{ fontSize: ".78rem", color: "rgba(240,232,208,0.55)" }}>大きな注意項目はありません</div>
                ) : (
                  <div style={{ display: "grid", gap: ".42rem" }}>
                    {yearlyAlertsDisplay.map((a) => (
                      <div
                        key={a.key}
                        style={{
                          padding: ".42rem .55rem",
                          borderRadius: 4,
                          border: "1px solid rgba(201,168,76,0.16)",
                          background: "rgba(0,0,0,0.22)",
                          fontSize: ".76rem",
                          lineHeight: 1.45,
                        }}
                      >
                        <span style={{ color: "#c9a84c", fontWeight: 600 }}>{a.title}</span>
                        <span style={{ color: "rgba(240,232,208,0.72)", marginLeft: ".45rem" }}>{a.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={analysisCard("composition")}>
                <div style={analysisSecTitle("composition", ".5rem")}>月別一覧</div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.5)", marginBottom: ".35rem" }}>月をクリックすると月次分析へ移動します</div>
                <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.82)", marginBottom: ".35rem" }}>基本</div>
                <div style={YEARLY_TABLE_WRAP}>
                  <table style={YEARLY_TABLE_STYLE}>
                    <thead>
                      <tr>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.month, "left")}>月</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.yen)}>売上</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.yen)}>目標</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.pct)}>進捗率</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.yen)}>飲食</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.yen)}>営業利益</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.yen)}>人件費</th>
                        <th style={yearlyThStyle_(YEARLY_BASIC_COL.status, "center")}>状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyAnalysis.monthRows.map((m) => (
                        <tr
                          key={`${m.targetMonth}_basic`}
                          style={{ ...YEARLY_TABLE_ROW, opacity: yearlyTableRowOpacity_(m), cursor: "pointer" }}
                          onClick={() => navigateToMonthAnalysis(m.targetMonth)}
                          {...yearlyRowHoverHandlers_()}
                        >
                          <td style={yearlyMonthTdStyle_(YEARLY_BASIC_COL.month)}>{m.monthLabel}</td>
                          <YearlyTableNumberCell m={m} value={m.totalSalesSum} width={YEARLY_BASIC_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.targetSalesSum} width={YEARLY_BASIC_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.progressRate} kind="pct" width={YEARLY_BASIC_COL.pct} />
                          <YearlyTableNumberCell m={m} value={m.foodDrinkSalesIncludingBandSum} width={YEARLY_BASIC_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.operatingProfitSum} width={YEARLY_BASIC_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.laborCostSum} width={YEARLY_BASIC_COL.yen} taxMode={taxMode} />
                          <YearlyTableStatusCell m={m} width={YEARLY_BASIC_COL.status} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.82)", margin: ".65rem 0 .35rem" }}>仕入・原価率</div>
                <div style={YEARLY_TABLE_WRAP}>
                  <table style={YEARLY_TABLE_STYLE}>
                    <thead>
                      <tr>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.month, "left")}>月</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.yen)}>仕入れ合計</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.yen)}>ドリンク仕入れ</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.yen)}>フード仕入れ</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.rate)}>総仕入率</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.rateWide)}>ドリンク原価率</th>
                        <th style={yearlyThStyle_(YEARLY_PURCHASE_COL.rateWide)}>フード原価率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyAnalysis.monthRows.map((m) => (
                        <tr
                          key={`${m.targetMonth}_purchase`}
                          style={{ ...YEARLY_TABLE_ROW, opacity: yearlyTableRowOpacity_(m), cursor: "pointer" }}
                          onClick={() => navigateToMonthAnalysis(m.targetMonth)}
                          {...yearlyRowHoverHandlers_()}
                        >
                          <td style={yearlyMonthTdStyle_(YEARLY_PURCHASE_COL.month)}>{m.monthLabel}</td>
                          <YearlyTableNumberCell m={m} value={m.purchaseTotalSum} width={YEARLY_PURCHASE_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.drinkPurchaseSum} width={YEARLY_PURCHASE_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.foodPurchaseSum} width={YEARLY_PURCHASE_COL.yen} taxMode={taxMode} />
                          <YearlyTableNumberCell m={m} value={m.purchaseCostRates?.totalPurchaseRate} kind="pct" width={YEARLY_PURCHASE_COL.rate} />
                          <YearlyTableNumberCell m={m} value={m.purchaseCostRates?.drinkCostRate} kind="pct" width={YEARLY_PURCHASE_COL.rateWide} />
                          <YearlyTableNumberCell m={m} value={m.purchaseCostRates?.foodCostRate} kind="pct" width={YEARLY_PURCHASE_COL.rateWide} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".38rem", lineHeight: 1.55 }}>
                  ※総仕入率はバンド飲食代を含む飲食売上で計算しています。ドリンク/フード原価率は、バンド飲食代の内訳がある月のみ個別反映します。
                </div>
              </div>

              <div style={analysisCard("composition")}>
                <div style={analysisSecTitle("composition", ".5rem")}>月別前年比較</div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.5)", marginBottom: ".35rem" }}>月をクリックすると月次分析へ移動します</div>
                <div style={YEARLY_TABLE_WRAP}>
                  <table style={YEARLY_TABLE_STYLE}>
                    <thead>
                      <tr>
                        <th style={yearlyThStyle_(YEARLY_YOY_COL.month, "left")}>月</th>
                        <th style={yearlyThStyle_(YEARLY_YOY_COL.yen)}>今年売上</th>
                        <th style={yearlyThStyle_(YEARLY_YOY_COL.yen)}>前年売上</th>
                        <th style={yearlyThStyle_(YEARLY_YOY_COL.yen)}>差額</th>
                        <th style={yearlyThStyle_(YEARLY_YOY_COL.pct)}>前年比</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyAnalysis.monthlyYoYRows.map((r) => {
                        const diffMuted = r.currentSales === 0 && r.prevSales === 0;
                        return (
                          <tr
                            key={`${r.targetMonth}_yoy`}
                            style={{ ...YEARLY_TABLE_ROW, cursor: "pointer" }}
                            onClick={() => navigateToMonthAnalysis(r.targetMonth)}
                            {...yearlyRowHoverHandlers_()}
                          >
                            <td style={yearlyMonthTdStyle_(YEARLY_YOY_COL.month)}>{r.monthLabel}</td>
                            <td style={yearlyNumTdStyle_(YEARLY_YOY_COL.yen, r.currentSales === 0)}>{dy(r.currentSales)}</td>
                            <td style={yearlyNumTdStyle_(YEARLY_YOY_COL.yen, false)}>{dy(r.prevSales)}</td>
                            <td
                              style={{
                                ...yearlyNumTdStyle_(YEARLY_YOY_COL.yen, diffMuted),
                                color: r.diff > 0 ? "#9ec9a8" : r.diff < 0 ? "#dca06a" : undefined,
                              }}
                            >
                              {signedDy(r.diff)}
                            </td>
                            <td style={yearlyNumTdStyle_(YEARLY_YOY_COL.pct, r.yoyRate == null)}>{r.yoyRate != null ? pct1(r.yoyRate) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <YearlyYoYBarChart rows={yearlyAnalysis.monthlyYoYRows} onMonthClick={navigateToMonthAnalysis} />

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: ".65rem" }}>
                <YearlyMonthBarChart title="月別売上推移" rows={yearlyAnalysis.monthRows} valueKey="totalSalesSum" barTone="linear-gradient(180deg, rgba(201,168,76,0.95), rgba(201,168,76,0.55))" taxMode={taxMode} onMonthClick={navigateToMonthAnalysis} />
                <YearlyMonthBarChart title="月別目標達成率" rows={yearlyAnalysis.monthRows} valueKey="progressRate" barTone="linear-gradient(180deg, rgba(102,197,124,0.95), rgba(102,197,124,0.55))" formatTop={(r) => (r.progressRate != null ? pct(r.progressRate) : "—")} taxMode={taxMode} onMonthClick={navigateToMonthAnalysis} />
                <YearlyMonthBarChart title="月別飲食売上" rows={yearlyAnalysis.monthRows} valueKey="foodDrinkSalesIncludingBandSum" barTone="linear-gradient(180deg, rgba(102,197,124,0.9), rgba(102,197,124,0.5))" taxMode={taxMode} onMonthClick={navigateToMonthAnalysis} />
                <YearlyMonthBarChart title="月別営業利益" rows={yearlyAnalysis.monthRows} valueKey="operatingProfitSum" barTone="linear-gradient(180deg, rgba(126,200,126,0.95), rgba(126,200,126,0.55))" taxMode={taxMode} onMonthClick={navigateToMonthAnalysis} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: ".65rem" }}>
                <YearlyRankList title="月間売上TOP月" variant="rankSales" items={yearlyAnalysis.salesTop3} valueLabel="年間月次売上" formatValue={(r) => dy(r.totalSalesSum)} />
                <YearlyRankList title="月間未達ワースト月" variant="rankUnder" items={yearlyAnalysis.underWorst3} valueLabel="進捗率" formatValue={(r) => pct(r.progressRate)} />
                <YearlyRankList title="月間飲食売上TOP月" variant="rankFoodDrink" items={yearlyAnalysis.foodDrinkTop3} valueLabel="飲食売上" formatValue={(r) => dy(r.foodDrinkSalesIncludingBandSum)} />
                <YearlyRankList title="月間ドリンク売上TOP月" variant="rankDrink" items={yearlyAnalysis.drinkTop3} valueLabel="ドリンク売上" formatValue={(r) => dy(r.drinkSalesSum)} />
                <YearlyRankList title="月間フード売上TOP月" variant="rankFood" items={yearlyAnalysis.foodTop3} valueLabel="フード売上" formatValue={(r) => dy(r.foodSalesSum)} />
              </div>

              <div style={analysisCard("costProfit")}>
                <div style={analysisSecTitle("costProfit", ".35rem")}>年間コスト状況（暫定）</div>
                <div style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.62)", marginBottom: ".5rem", lineHeight: 1.5 }}>
                  ※人件費は翌月まとめて反映されます。仕入・経費は月末に売掛分が加算されるため、月中は暫定値です。
                  {yearlyAnalysis.monthRows.some((m) => m.hasMonthlyCostSummary) ? (
                    <span style={{ display: "block", marginTop: ".2rem", color: "rgba(201,168,76,0.78)" }}>
                      ※月合計欄の値を反映している月があります（月確定に近い数字です）。
                    </span>
                  ) : null}
                </div>
                <div style={{ marginBottom: ".65rem" }}>
                  <CostProfitBarList bars={yearlyAnalysis.yearlyCostBars} maxValue={yearlyAnalysis.costProfitMax} taxMode={taxMode} />
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>飲食粗利</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: ".32rem .55rem", fontSize: ".78rem", color: "rgba(240,232,208,0.85)" }}>
                    <div>
                      飲食粗利{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {yearlyAnalysis.yearlyFoodDrink > 0 ? dy(yearlyAnalysis.yearlyFoodDrinkGrossProfit) : "—"}
                      </span>
                    </div>
                    <div>
                      飲食粗利率{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {yearlyAnalysis.yearlyFoodDrinkGrossProfitRate != null
                          ? pct1(yearlyAnalysis.yearlyFoodDrinkGrossProfitRate)
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.5)", marginTop: ".22rem" }}>
                    ※飲食売上（バンド飲食代含む）− 仕入れ合計。仕入は月合計欄を優先しています。
                  </div>
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>年間原価率</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: ".32rem .55rem", fontSize: ".74rem", color: "rgba(240,232,208,0.82)" }}>
                    <div>総仕入率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.totalPurchaseRate)}</span></div>
                    <div>ドリンク原価率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.drinkCostRate)}</span></div>
                    <div>フード原価率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.foodCostRate)}</span></div>
                  </div>
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.78)" }}>
                    参考：バンドギャラ（年間合計） <span style={{ color: "#f0e8d0" }}>{dy(yearlyAnalysis.yearlyBandGuarantee)}</span>
                  </div>
                  <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.54)", marginTop: ".12rem" }}>※経費には含めていません</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !error && rows.length > 0 && roleMode === "admin" && adminTab === "daily" && (
        <div style={{ display:"grid", gap:".65rem" }}>
          {rows.map((r) => {
            const m = r.metrics || {};
            const hasEvents = r.resolvedEventNames.length > 0;
            const isDup = !!r.flags?.isDuplicateBusinessDate;
            const isFuture = !!r.businessDate && r.businessDate > currentBusinessDate;
            const isToday = !!r.businessDate && r.businessDate === currentBusinessDate;
            const primaryName = isDup
              ? (r.sheetEventName || (hasEvents ? r.resolvedEventNames[0] : ""))
              : (hasEvents ? r.resolvedEventNames.join(" / ") : (r.sheetEventName || ""));
            const plannedPrimaryName = r.sheetEventName || (hasEvents ? r.resolvedEventNames[0] : "");
            const futureBadge = m.targetSales == null ? "売上未入力" : "予定";
            const todayBadge = m.targetSales == null ? "未確定" : "本日";
            return (
              <div key={`${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`} style={S.card}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:".75rem", flexWrap:"wrap", marginBottom:".5rem" }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:".6rem", flexWrap:"wrap" }}>
                    <span style={{ fontFamily:"Georgia,serif", color:"#c9a84c", fontSize:".95rem" }}>{r.businessDate || "—"}</span>
                    <span style={{ fontSize:".75rem", color:"rgba(240,232,208,0.68)" }}>{r.weekday || "—"}</span>
                    {isToday && (
                      <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(126,200,126,0.4)", color:"#7ec87e" }}>
                        {todayBadge}
                      </span>
                    )}
                    {isFuture && (
                      <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(201,168,76,0.35)", color:"#c9a84c" }}>
                        {futureBadge}
                      </span>
                    )}
                    {isDup && (
                      <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(244,162,97,0.35)", color:"#f4a261" }}>
                        同日複数
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom:".55rem", fontSize:".78rem", lineHeight:1.5 }}>
                  {(isFuture || isToday ? plannedPrimaryName : primaryName) ? (
                    <div>
                      <span style={{ color:"rgba(201,168,76,0.7)" }}>イベント名: </span>
                      <span style={{ color:"#f0e8d0" }}>{isFuture || isToday ? plannedPrimaryName : primaryName}</span>
                    </div>
                  ) : (
                    <div>
                      <span style={{ color:"#f4a261" }}>イベント未登録</span>
                      {r.sheetEventName ? <span style={{ color:"rgba(240,232,208,0.62)" }}>（補助: {r.sheetEventName}）</span> : null}
                    </div>
                  )}
                </div>

                {(isFuture || isToday) ? (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:".35rem .8rem", fontSize:".78rem" }}>
                    <div>目標: <strong>{yen(m.targetSales)}</strong></div>
                  </div>
                ) : (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:".35rem .8rem", fontSize:".78rem" }}>
                      <div>売上合計: <strong>{yen(m.totalSales)}</strong></div>
                      <div>飲食代: <strong>{yen(m.foodDrinkSales)}</strong></div>
                      <div>ドリンク売上: <strong>{yen(m.drinkSales)}</strong></div>
                      <div>フード売上: <strong>{yen(m.foodSales)}</strong></div>
                      <div>目標: <strong>{yen(m.targetSales)}</strong></div>
                      <div>目標達成率: <strong>{pct(m.targetAchievementRate)}</strong></div>
                      <div>客単価: <strong>{num(m.customerUnitPrice)}</strong></div>
                      <div>飲食単価: <strong>{num(m.foodDrinkUnitPrice)}</strong></div>
                    </div>

                    {roleMode === "admin" && (
                      <div style={{ marginTop:".65rem", paddingTop:".55rem", borderTop:"1px dashed rgba(201,168,76,0.2)", fontSize:".72rem", color:"rgba(240,232,208,0.75)", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:".28rem .7rem" }}>
                        <div>キャッシュ: {yen(m.cash)}</div>
                        <div>累積現金: {yen(m.cumulativeCash)}</div>
                        <div>クレジット: {yen(m.creditCardSales)}</div>
                        <div>PayPay: {yen(m.paypaySales)}</div>
                        <div>売掛金合計: {yen(m.receivableTotal)}</div>
                        <div>営業利益: {yen(m.operatingProfit)}</div>
                        <div>人件費: {yen(m.laborCost)}</div>
                        <div>社員数: {num(m.employeeCount)}</div>
                        <div>アルバイト人数: {num(m.partTimeCount)}</div>
                        <div>仕入れ合計: {yen(m.purchaseTotal)}</div>
                        <div>ドリンク仕入れ: {yen(m.drinkPurchase)}</div>
                        <div>フード仕入れ: {yen(m.foodPurchase)}</div>
                        <div>経費: {yen(m.expense)}</div>
                        <div>バンドギャランティ: {yen(m.bandGuarantee)}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";

const SALES_API_URL = "/api/sales";
const SALES_ROLE_MODE_KEY = "honeybee:salesRoleMode";
const SALES_ADMIN_TAB_KEY = "honeybee:salesAdminTab";
const SALES_TARGET_MONTH_KEY = "honeybee:salesTargetMonth";
const SALES_MONTH_OPTIONS_2026 = Array.from({ length: 12 }, (_, i) => {
  const mm = String(i + 1).padStart(2, "0");
  return { value: `2026-${mm}`, label: `2026年${mm}月` };
});

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

function yen(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return "¥" + Number(v).toLocaleString("ja-JP");
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
    return v === "daily" || v === "analysis" ? v : "daily";
  } catch {
    return "daily";
  }
}
function readSalesTargetMonth() {
  try {
    const v = localStorage.getItem(SALES_TARGET_MONTH_KEY);
    return normalizeMonth(v || "");
  } catch {
    return normalizeMonth("");
  }
}
function compactYen(v) {
  const n = Number(v || 0);
  if (n >= 1000) return `¥${Math.round(n / 1000)}k`;
  return `¥${n.toLocaleString("ja-JP")}`;
}
const VENUE_SALES_KEYS = ["venueFee", "venueSales"];
const RENTAL_SALES_KEYS = ["hallRentalSales", "rentalSales", "hallRentalFee", "rentalFee"];
const SALES_COMPOSITION_COLORS = {
  drink: "linear-gradient(90deg, rgba(86,156,255,0.95), rgba(86,156,255,0.62))",
  food: "linear-gradient(90deg, rgba(102,197,124,0.95), rgba(102,197,124,0.62))",
  venue: "linear-gradient(90deg, rgba(222,181,78,0.95), rgba(222,181,78,0.6))",
  rental: "linear-gradient(90deg, rgba(167,126,255,0.95), rgba(167,126,255,0.62))",
  other: "linear-gradient(90deg, rgba(143,96,88,0.95), rgba(143,96,88,0.6))",
};
const SALES_COMPOSITION_CHIP_COLORS = {
  drink: "rgba(86,156,255,0.95)",
  food: "rgba(102,197,124,0.95)",
  venue: "rgba(222,181,78,0.95)",
  rental: "rgba(167,126,255,0.95)",
  other: "rgba(143,96,88,0.95)",
};
function pickMetricValue(metrics, keys) {
  const m = metrics || {};
  for (const key of keys) {
    if (m[key] != null && !Number.isNaN(Number(m[key]))) return Number(m[key] || 0);
  }
  return 0;
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
function calcRate(numer, denom) {
  const n = Number(numer || 0);
  const d = Number(denom || 0);
  if (!(d > 0)) return null;
  return (n / d) * 100;
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
  const [roleMode, setRoleMode] = useState(() => readSalesRoleMode()); // staff | admin
  const [adminTab, setAdminTab] = useState(() => readSalesAdminTab()); // daily | analysis
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
      setUpdatedAt(json?.meta?.generatedAt || "");
    } catch (e) {
      setRecords([]);
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
      localStorage.setItem(SALES_ROLE_MODE_KEY, roleMode === "admin" ? "admin" : "staff");
    } catch {}
  }, [roleMode]);
  useEffect(() => {
    try {
      localStorage.setItem(SALES_ADMIN_TAB_KEY, adminTab === "analysis" ? "analysis" : "daily");
    } catch {}
  }, [adminTab]);
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
    const operatingProfitSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.operatingProfit || 0), 0);
    const operatingProfitRate = calcRate(operatingProfitSum, totalSalesSum);
    const drinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.drinkSales || 0), 0);
    const foodSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodSales || 0), 0);
    const rawOtherSales = totalSalesSum - drinkSalesSum - foodSalesSum;
    const venueFeeSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, VENUE_SALES_KEYS), 0);
    const rentalSalesSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, RENTAL_SALES_KEYS), 0);
    const otherSalesSum = Math.max(0, rawOtherSales - venueFeeSum - rentalSalesSum);
    const laborCostSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.laborCost || 0), 0);
    const purchaseTotalSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.purchaseTotal || 0), 0);
    const expenseSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.expense || 0), 0);
    const bandGuaranteeSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.bandGuarantee || 0), 0);
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
      .filter((r) => r?.metrics?.foodDrinkSales != null)
      .sort((a, b) => Number(b?.metrics?.foodDrinkSales || 0) - Number(a?.metrics?.foodDrinkSales || 0))
      .slice(0, 10)
      .map((r) => {
        const foodDrinkSales = Number(r?.metrics?.foodDrinkSales || 0);
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_fooddrink`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          foodDrinkSales,
          foodDrinkUnitPrice: r?.metrics?.foodDrinkUnitPrice != null ? Number(r.metrics.foodDrinkUnitPrice) : null,
          foodDrinkRate: calcRate(foodDrinkSales, totalSales),
        };
      });
    const drinkRankingTop10 = actualRows
      .filter((r) => r?.metrics?.drinkSales != null)
      .sort((a, b) => Number(b?.metrics?.drinkSales || 0) - Number(a?.metrics?.drinkSales || 0))
      .slice(0, 10)
      .map((r) => {
        const drinkSales = Number(r?.metrics?.drinkSales || 0);
        const foodDrinkSales = Number(r?.metrics?.foodDrinkSales || 0);
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_drink`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          drinkSales,
          drinkInFoodDrinkRate: calcRate(drinkSales, foodDrinkSales),
          drinkInTotalRate: calcRate(drinkSales, totalSales),
        };
      });
    const foodRankingTop10 = actualRows
      .filter((r) => r?.metrics?.foodSales != null)
      .sort((a, b) => Number(b?.metrics?.foodSales || 0) - Number(a?.metrics?.foodSales || 0))
      .slice(0, 10)
      .map((r) => {
        const foodSales = Number(r?.metrics?.foodSales || 0);
        const foodDrinkSales = Number(r?.metrics?.foodDrinkSales || 0);
        const totalSales = Number(r?.metrics?.totalSales || 0);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_food`,
          businessDate: r.businessDate,
          eventName: resolveEventNameForAdmin(r, r.resolvedEventNames),
          foodSales,
          foodInFoodDrinkRate: calcRate(foodSales, foodDrinkSales),
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
        const trendTone = trendToneByAchievement(achievementRate, targetSales);
        return {
          key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_trend`,
          rowKey: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`,
          businessDate: r.businessDate,
          weekday: r.weekday || "—",
          eventName,
          isDuplicateBusinessDate: !!r?.flags?.isDuplicateBusinessDate,
          totalSales,
          targetSales,
          achievementRate,
          tone: trendTone.tone,
          trendLabel: trendTone.label,
          foodDrinkSales: r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : null,
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
        };
      });
    const trendMaxSales = dailyTrendRows.reduce((m, r) => Math.max(m, Number(r.totalSales || 0)), 0);

    const salesComposition = {
      drink: drinkSalesSum,
      food: foodSalesSum,
      venue: venueFeeSum,
      rental: rentalSalesSum,
      other: otherSalesSum,
      total: totalSalesSum,
      drinkRate: calcRate(drinkSalesSum, totalSalesSum),
      foodRate: calcRate(foodSalesSum, totalSalesSum),
      venueRate: calcRate(venueFeeSum, totalSalesSum),
      rentalRate: calcRate(rentalSalesSum, totalSalesSum),
      otherRate: calcRate(otherSalesSum, totalSalesSum),
    };

    const costProfitBars = [
      { key: "profit", label: "営業利益", value: operatingProfitSum, tone: "linear-gradient(90deg, rgba(126,200,126,0.92), rgba(126,200,126,0.58))", note: "" },
      { key: "labor", label: "人件費", value: laborCostSum, tone: "linear-gradient(90deg, rgba(201,168,76,0.9), rgba(201,168,76,0.5))", note: "翌月反映" },
      { key: "purchase", label: "仕入れ", value: purchaseTotalSum, tone: "linear-gradient(90deg, rgba(205,134,74,0.9), rgba(205,134,74,0.52))", note: "月末売掛反映あり" },
      { key: "expense", label: "経費", value: expenseSum, tone: "linear-gradient(90deg, rgba(155,84,94,0.9), rgba(155,84,94,0.52))", note: "暫定" },
    ];
    const costProfitMax = costProfitBars.reduce((m, r) => Math.max(m, Number(r.value || 0)), 0);

    const topSalesDay = salesRankingTop5[0];
    const biggestShortfallDay = underTargetWorst5[0];
    const topFoodDrinkDay = foodDrinkRankingTop10[0];
    const monthlyHighlights = [
      topFoodDrinkDay
        ? `飲食売上トップ日：${(topFoodDrinkDay.businessDate || "").slice(5).replace("-", "/")} ${topFoodDrinkDay.eventName} ${yen(topFoodDrinkDay.foodDrinkSales)}`
        : "飲食売上トップ日：データなし",
      topSalesDay
        ? `売上トップ日：${(topSalesDay.businessDate || "").slice(5).replace("-", "/")} ${topSalesDay.eventName} ${yen(topSalesDay.totalSales)}`
        : "売上トップ日：データなし",
      biggestShortfallDay
        ? `最大未達日：${(biggestShortfallDay.businessDate || "").slice(5).replace("-", "/")} ${biggestShortfallDay.eventName} 不足 ${yen(biggestShortfallDay.shortfall)}`
        : "最大未達日：未達データなし",
      `売上構成：ドリンク ${pct(salesComposition.drinkRate)} / フード ${pct(salesComposition.foodRate)} / 会場費 ${pct(salesComposition.venueRate)} / レンタル ${pct(salesComposition.rentalRate)} / その他 ${pct(salesComposition.otherRate)}`,
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
      drinkSalesSum,
      foodSalesSum,
      venueFeeSum,
      rentalSalesSum,
      otherSalesSum,
      laborCostSum,
      purchaseTotalSum,
      expenseSum,
      bandGuaranteeSum,
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
  }, [rows, targetMonth, currentBusinessDate]);
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

  return (
    <div style={{ padding:"1.5rem 2rem", maxWidth:1180, margin:"0 auto" }} className="hb-view">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1rem", flexWrap:"wrap", gap:".5rem" }}>
        <h2 style={{ fontFamily:"Georgia,serif", fontSize:"1.2rem", color:"#c9a84c", letterSpacing:".15em", margin:0 }}>📈 売上管理</h2>
        <div style={{ display:"flex", gap:".45rem", flexWrap:"wrap", alignItems:"center" }}>
          <button type="button" style={S.btn(roleMode === "staff" ? "gold" : "ghost")} onClick={() => setRoleMode("staff")}>現場表示</button>
          <button type="button" style={S.btn(roleMode === "admin" ? "gold" : "ghost")} onClick={() => setRoleMode("admin")}>管理表示</button>
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

      {updatedAt && (
        <div style={{ fontSize:".68rem", color:"rgba(240,232,208,0.55)", marginBottom:".7rem" }}>
          更新時刻: {updatedAt}
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
              ? `あと ${yen(staffProgress.remaining)} で目標達成`
              : `月間目標達成 +${yen(Math.abs(staffProgress.remaining))}`}
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
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>今月売上: <strong style={{ color:"#f3ead2" }}>{yen(staffProgress.salesSum)}</strong></div>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>今月目標: <strong style={{ color:"#f3ead2" }}>{yen(staffProgress.targetSum)}</strong></div>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(131,166,212,0.2)", borderRadius:6, padding:".45rem .55rem" }}>本日目標: <strong style={{ color:"#f3ead2" }}>{yen(staffProgress.todayTargetSum)}</strong></div>
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
                    <div style={{ fontSize:".8rem" }}>本日目標: <strong>{yen(m.targetSales)}</strong></div>
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
                        <span style={{ fontSize:".74rem", color:"rgba(240,232,208,0.85)", marginRight:".45rem" }}>{yen(m.targetSales)}</span>
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
          <div style={{ ...S.card }}>
            <div style={{ ...S.secTitle, marginBottom: ".55rem" }}>月次サマリー</div>
            <div style={{ display:"grid", gap:".52rem" }}>
              <div style={{ display:"flex", alignItems:"baseline", gap:".45rem", flexWrap:"wrap" }}>
                <div style={{ fontFamily:"Georgia,serif", fontSize:"2.25rem", lineHeight:1, color:"#f3ead2" }}>{pct(monthlyAnalysis.monthlyProgressRate)}</div>
                <span style={{ fontSize: ".76rem", fontWeight: 700, padding: ".16rem .58rem", borderRadius: 999, background: achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipBg, border: "1px solid " + achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipBd, color: achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).chipTx }}>
                  {achievementTone(monthlyAnalysis.monthlyProgressRate, monthlyAnalysis.fullMonthTargetSalesSum > 0).label}
                </span>
              </div>
              <div style={{ fontSize: ".94rem", color: "rgba(240,232,208,0.95)", fontWeight: 700 }}>
                {monthlyAnalysis.fullMonthTargetSalesSum > 0 && monthlyAnalysis.totalSalesSum >= monthlyAnalysis.fullMonthTargetSalesSum
                  ? `月間目標達成 +${yen(Math.abs(monthlyAnalysis.totalSalesSum - monthlyAnalysis.fullMonthTargetSalesSum))}`
                  : `あと ${yen(Math.max(0, monthlyAnalysis.fullMonthTargetSalesSum - monthlyAnalysis.totalSalesSum))}`}
              </div>
              <div style={{ fontSize: ".9rem" }}>
                月間進捗率 <strong style={{ fontSize: "1rem" }}>{pct(monthlyAnalysis.monthlyProgressRate)}</strong>
              </div>
              <div style={{ fontSize: ".9rem" }}>
                月間売上 <strong style={{ fontSize: "1rem" }}>{yen(monthlyAnalysis.totalSalesSum)}</strong> / 月間目標 <strong style={{ fontSize: "1rem" }}>{yen(monthlyAnalysis.fullMonthTargetSalesSum)}</strong>
              </div>
              <div style={{ fontSize: ".84rem", color:"rgba(240,232,208,0.75)" }}>
                実績日達成率: <strong>{pct(monthlyAnalysis.actualAchievementRate)}</strong>
                <span style={{ marginLeft: ".35rem" }}>（実績日ベース目標 {yen(monthlyAnalysis.actualTargetSalesSum)}）</span>
              </div>
              <div style={{ fontSize: ".72rem", color:"rgba(240,232,208,0.58)" }}>
                ※終了済み営業日の目標に対する達成率
              </div>
              <div style={{ fontSize: ".9rem" }}>
                営業利益 <strong style={{ fontSize: "1rem" }}>{yen(monthlyAnalysis.operatingProfitSum)}</strong> / 営業利益率 <strong style={{ fontSize: "1rem" }}>{pct(monthlyAnalysis.operatingProfitRate)}</strong>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".35rem .8rem", fontSize:".84rem", color:"rgba(240,232,208,0.85)" }}>
                <div>実績日数 <strong>{num(monthlyAnalysis.actualDayCount)}日</strong></div>
                <div>本日以降の予定 <strong>{num(monthlyAnalysis.futureDayCount)}件</strong></div>
                <div>1日平均売上 <strong>{yen(monthlyAnalysis.avgDailySales)}</strong></div>
              </div>
            </div>
          </div>

          <div style={{ ...S.card }}>
            <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>今月のポイント</div>
            <div style={{ display:"grid", gap:".3rem", fontSize:".84rem", color:"rgba(240,232,208,0.82)" }}>
              {monthlyAnalysis.monthlyHighlights.map((line, i) => (
                <div key={i}>・{line}</div>
              ))}
            </div>
          </div>

          <div style={{ ...S.card }}>
            <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>日別売上推移</div>
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
                        title={`${r.businessDate} / ${r.eventName} / 売上 ${yen(r.totalSales)} / 目標 ${yen(r.targetSales)} / 達成率 ${pct(r.achievementRate)} / ${r.trendLabel}`}
                        onClick={() => setSelectedTrendRowKey(r.rowKey)}
                      >
                        <div style={{ fontSize:".52rem", color:"rgba(240,232,208,0.68)", marginBottom:".18rem", whiteSpace:"nowrap" }}>
                          {compactYen(r.totalSales)}
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
              <div style={{ marginTop: ".75rem", borderTop: "1px dashed rgba(201,168,76,0.22)", paddingTop: ".7rem" }}>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(201,168,76,0.2)", borderRadius: 8, padding: ".8rem .9rem" }}>
                  <div style={{ fontSize: ".86rem", fontWeight: 700, color: "#e9dbb0", marginBottom: ".55rem" }}>選択日の営業レポート</div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>A. 基本情報</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>日付: <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.businessDate || "—"}</strong></div>
                      <div>曜日: <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.weekday || "—"}</strong></div>
                      <div>
                        イベント名: <strong style={{ fontSize: ".95rem" }}>{selectedTrendRow.eventName || "イベント未登録"}</strong>
                        {selectedTrendRow.isDuplicateBusinessDate ? <span style={{ marginLeft: ".35rem", fontSize: ".6rem", padding: ".08rem .42rem", borderRadius: 3, border: "1px solid rgba(244,162,97,0.35)", color: "#f4a261" }}>同日複数</span> : null}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>B. 売上・目標</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>売上合計: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{yen(selectedTrendRow.totalSales)}</strong></div>
                      <div>目標: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.targetSales)}</strong></div>
                      <div>達成率: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{pct(selectedTrendRow.achievementRate)}</strong></div>
                      <div>客単価: <strong style={{ fontSize: ".94rem" }}>{num(selectedTrendRow.customerUnitPrice)}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>C. 飲食内訳</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>飲食売上: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.foodDrinkSales)}</strong></div>
                      <div>ドリンク売上: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.drinkSales)}</strong></div>
                      <div>フード売上: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.foodSales)}</strong></div>
                      <div>飲食単価: <strong style={{ fontSize: ".94rem" }}>{num(selectedTrendRow.foodDrinkUnitPrice)}</strong></div>
                    </div>
                    <div style={{ marginTop: ".4rem", fontSize: ".66rem", color: "rgba(240,232,208,0.72)" }}>売上構成</div>
                    <div style={{ display:"flex", gap:".7rem", flexWrap:"wrap", margin:".2rem 0 .26rem", fontSize:".72rem", color:"rgba(240,232,208,0.82)" }}>
                      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.drink }} />ドリンク</span>
                      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.food }} />フード</span>
                      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.venue }} />会場費</span>
                      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.rental }} />レンタル</span>
                      <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.other }} />その他</span>
                    </div>
                    <div style={{ position:"relative", width:"100%", height:12, borderRadius:999, overflow:"hidden", background:"rgba(240,232,208,0.1)", border:"1px solid rgba(201,168,76,0.22)" }}>
                      <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(calcRate(selectedTrendRow.drinkSales, selectedTrendRow.totalSales) || 0)))}%`, background:SALES_COMPOSITION_COLORS.drink }} />
                      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(calcRate(selectedTrendRow.drinkSales, selectedTrendRow.totalSales) || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(calcRate(selectedTrendRow.foodSales, selectedTrendRow.totalSales) || 0)))}%`, background:SALES_COMPOSITION_COLORS.food }} />
                      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(calcRate(selectedTrendRow.drinkSales, selectedTrendRow.totalSales) || 0) + Number(calcRate(selectedTrendRow.foodSales, selectedTrendRow.totalSales) || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(calcRate(pickMetricValue(selectedTrendRow, VENUE_SALES_KEYS), selectedTrendRow.totalSales) || 0)))}%`, background:SALES_COMPOSITION_COLORS.venue }} />
                      <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(calcRate(selectedTrendRow.drinkSales, selectedTrendRow.totalSales) || 0) + Number(calcRate(selectedTrendRow.foodSales, selectedTrendRow.totalSales) || 0) + Number(calcRate(pickMetricValue(selectedTrendRow, VENUE_SALES_KEYS), selectedTrendRow.totalSales) || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(calcRate(pickMetricValue(selectedTrendRow, RENTAL_SALES_KEYS), selectedTrendRow.totalSales) || 0)))}%`, background:SALES_COMPOSITION_COLORS.rental }} />
                      <div style={{ position:"absolute", right:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(calcRate(Math.max(0, Number(selectedTrendRow.totalSales || 0) - Number(selectedTrendRow.drinkSales || 0) - Number(selectedTrendRow.foodSales || 0) - pickMetricValue(selectedTrendRow, VENUE_SALES_KEYS) - pickMetricValue(selectedTrendRow, RENTAL_SALES_KEYS)), selectedTrendRow.totalSales) || 0)))}%`, background:SALES_COMPOSITION_COLORS.other }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>D. 決済・入金</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>現金: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.cash)}</strong></div>
                      <div>クレジット: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.creditCardSales)}</strong></div>
                      <div>PayPay: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.paypaySales)}</strong></div>
                      <div>売掛合計: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.receivableTotal)}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem" }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>E. コスト・利益</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>営業利益: <strong style={{ fontSize: "1rem", color: "#f3ead2" }}>{yen(selectedTrendRow.operatingProfit)}</strong></div>
                      <div>仕入れ合計: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.purchaseTotal)}</strong></div>
                      <div>ドリンク仕入れ: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.drinkPurchase)}</strong></div>
                      <div>フード仕入れ: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.foodPurchase)}</strong></div>
                      <div>経費: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.expense)}</strong></div>
                      <div>人件費: <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.laborCost)}</strong></div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>F. 参考情報</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".34rem .7rem", fontSize:".8rem" }}>
                      <div>参考：バンドギャラ <strong style={{ fontSize: ".94rem" }}>{yen(selectedTrendRow.bandGuarantee)}</strong></div>
                    </div>
                    <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.55)", marginTop: ".2rem" }}>※経費には含めていません</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ ...S.card }}>
            <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>売上構成</div>
            <div style={{ display:"flex", gap:".9rem", flexWrap:"wrap", marginBottom:".42rem", fontSize:".78rem", color:"rgba(240,232,208,0.84)" }}>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.drink }} />ドリンク</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.food }} />フード</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.venue }} />会場費</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.rental }} />レンタル</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".34rem", borderRadius:2, background:SALES_COMPOSITION_CHIP_COLORS.other }} />その他</span>
            </div>
            <div style={{ position:"relative", width:"100%", height:16, borderRadius:999, overflow:"hidden", background:"rgba(240,232,208,0.1)", border:"1px solid rgba(201,168,76,0.22)", marginBottom:".45rem" }}>
              <div style={{ position:"absolute", left:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.drinkRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.drink }} />
              <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.drinkRate || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.foodRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.food }} />
              <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.drinkRate || 0) + Number(monthlyAnalysis.salesComposition.foodRate || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.venueRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.venue }} />
              <div style={{ position:"absolute", left:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.drinkRate || 0) + Number(monthlyAnalysis.salesComposition.foodRate || 0) + Number(monthlyAnalysis.salesComposition.venueRate || 0)))}%`, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.rentalRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.rental }} />
              <div style={{ position:"absolute", right:0, top:0, height:"100%", width:`${Math.max(0, Math.min(100, Number(monthlyAnalysis.salesComposition.otherRate || 0)))}%`, background:SALES_COMPOSITION_COLORS.other }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".35rem .8rem", fontSize:".76rem" }}>
              <div>ドリンク: <strong>{yen(monthlyAnalysis.drinkSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.drinkRate)}）</div>
              <div>フード: <strong>{yen(monthlyAnalysis.foodSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.foodRate)}）</div>
              <div>会場費: <strong>{yen(monthlyAnalysis.venueFeeSum)}</strong>（{pct(monthlyAnalysis.salesComposition.venueRate)}）</div>
              <div>レンタル: <strong>{yen(monthlyAnalysis.rentalSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.rentalRate)}）</div>
              <div>その他: <strong>{yen(monthlyAnalysis.otherSalesSum)}</strong>（{pct(monthlyAnalysis.salesComposition.otherRate)}）</div>
            </div>
          </div>

          <div style={{ ...S.card }}>
            <div style={{ ...S.secTitle, marginBottom: ".35rem" }}>コスト・利益比較（暫定）</div>
            <div style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.62)", marginBottom: ".5rem", lineHeight: 1.5 }}>
              ※人件費は翌月まとめて反映されます。仕入・経費は月末に売掛分が加算されるため、月中は暫定値です。
            </div>
            <div style={{ display:"grid", gap:".4rem" }}>
              {monthlyAnalysis.costProfitBars.map((b) => {
                const isLaborZero = b.key === "labor" && Number(b.value || 0) === 0;
                const w = isLaborZero
                  ? 0
                  : monthlyAnalysis.costProfitMax > 0
                  ? Math.max(4, Math.round((Number(b.value || 0) / monthlyAnalysis.costProfitMax) * 100))
                  : 4;
                return (
                  <div key={b.key} style={{ display:"grid", gridTemplateColumns:"110px 1fr auto", alignItems:"center", gap:".45rem" }}>
                    <div style={{ fontSize:".74rem", color:"rgba(240,232,208,0.74)" }}>
                      {b.label}
                      {b.note ? (
                        <span style={{ marginLeft: ".28rem", fontSize: ".6rem", color: "rgba(240,232,208,0.52)" }}>
                          {b.note}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ height:10, borderRadius:999, background:"rgba(240,232,208,0.1)", border:"1px solid rgba(201,168,76,0.18)", overflow:"hidden" }}>
                      {!isLaborZero ? <div style={{ height:"100%", width:`${w}%`, background:b.tone }} /> : null}
                    </div>
                    <div style={{ fontSize:".74rem", color:"#f0e8d0" }}>
                      {isLaborZero ? "¥0 / 翌月反映" : yen(b.value)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.78)" }}>
                参考：バンドギャラ <strong>{yen(monthlyAnalysis.bandGuaranteeSum)}</strong>
              </div>
              <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.54)", marginTop: ".12rem" }}>
                ※経費には含めていません
              </div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:".65rem" }}>
            <div style={{ ...S.card }}>
              <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>売上TOP5</div>
              {monthlyAnalysis.salesRankingTop5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.salesRankingTop5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}><strong style={{ fontSize: ".94rem" }}>{yen(r.totalSales)}</strong>{r.achievementRate != null ? <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>達成率 {pct(r.achievementRate)}</span> : null}</div>
                </div>
              ))}
            </div>

            <div style={{ ...S.card }}>
              <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>目標未達ワースト5</div>
              {monthlyAnalysis.underTargetWorst5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>未達データなし</div>
              ) : monthlyAnalysis.underTargetWorst5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>売上 <strong style={{ fontSize: ".92rem" }}>{yen(r.totalSales)}</strong> / 達成率 <strong style={{ fontSize: ".9rem" }}>{pct(r.achievementRate)}</strong> / 不足 <strong style={{ fontSize: ".94rem" }}>{yen(r.shortfall)}</strong></div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:".65rem" }}>
            <div style={{ ...S.card }}>
              <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>飲食売上TOP10</div>
              {monthlyAnalysis.foodDrinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodDrinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{yen(r.foodDrinkSales)}</strong>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      飲食比率 {pct(r.foodDrinkRate)}
                    </span>
                    <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontSize: ".68rem" }}>
                      飲食単価 {num(r.foodDrinkUnitPrice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card }}>
              <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>ドリンク売上TOP10</div>
              {monthlyAnalysis.drinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.drinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{yen(r.drinkSales)}</strong>
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
            <div style={{ ...S.card }}>
              <div style={{ ...S.secTitle, marginBottom: ".5rem" }}>フード売上TOP10</div>
              {monthlyAnalysis.foodRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: "1px solid rgba(201,168,76,0.14)" }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem" }}>
                    <strong style={{ fontSize: ".94rem" }}>{yen(r.foodSales)}</strong>
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

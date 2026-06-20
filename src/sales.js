import { useEffect, useMemo, useRef, useState } from "react";

const SALES_API_URL = "/api/sales";
const SALES_ROLE_MODE_KEY = "honeybee:salesRoleMode";
const SALES_ADMIN_UNLOCKED_KEY = "honeybee:salesAdminUnlocked";
const SALES_ADMIN_PIN = "2002";
const SALES_ADMIN_TAB_KEY = "honeybee:salesAdminTab";
const SALES_TARGET_MONTH_KEY = "honeybee:salesTargetMonth";
const SALES_TAX_MODE_KEY = "honeybee:salesTaxMode";
const TAX_RATE = 0.10;
// 損益分岐目安：固定費287.9万円 ÷ 限界利益率80.8% ≒ 税抜356万円
// 管理会計用の概算：固定費287.9万円、限界利益率80.8%
// 固定費控除後利益 = 税抜売上 × 限界利益率 − 固定費
const MONTHLY_FIXED_COST_EX_TAX = 2879000;
const CONTRIBUTION_MARGIN_RATE = 0.808;
const FIXED_COST_STRONG_MONTH_EX_TAX = 1000000;
const BREAK_EVEN_SALES_EX_TAX = 3560000;
const BREAK_EVEN_SAFE_LINE_EX_TAX = 3600000;
const BREAK_EVEN_SMALL_PROFIT_EX_TAX = 3800000;
const BREAK_EVEN_STABLE_LINE_EX_TAX = 4000000;
const BREAK_EVEN_GOOD_LINE_EX_TAX = 4500000;
const BREAK_EVEN_STRONG_LINE_EX_TAX = 5000000;
const BREAK_EVEN_LINE_NOTE = "※損益分岐判定は税抜売上ベースです。";
const OPERATING_BASE_PROFIT_NOTE =
  "※営業ベース利益は、固定費・税金・借入返済等を含む最終利益ではありません。";
const FIXED_COST_ADJUSTED_PROFIT_NOTE =
  "※固定費控除後利益は、税抜売上×限界利益率80.8%−固定費287.9万円で算出した管理会計上の概算です。";
const FIXED_COST_ADJUSTED_EX_TAX_NOTE = "※固定費控除後利益は税抜売上ベースの概算です。";
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

// ここに同系イベントカテゴリを追加（keywords を増やすだけで判定対象を拡張できます）
// 同じ名前でなくても同系比較したいイベントは、ここにカテゴリとして追加する。
// 将来的にはイベント管理側で category / seriesId を持たせる予定。
// TODO: 将来的にはイベント管理側で category / seriesId を持たせ、resolveEventSeries_ ではその値を優先する。
const EVENT_SERIES_FORBIDDEN_KEYWORDS = new Set([
  "band",
  "night",
  "live",
  "music",
  "event",
  "vol",
  "stage",
  "party",
  "バンド",
  "ナイト",
  "ライブ",
  "イベント",
  "パーティ",
]);
const EVENT_SERIES_RULES = [
  {
    id: "anison",
    label: "アニソン系イベント",
    priority: 100,
    keywords: [
      "アニソン",
      "アニソンナイト",
      "オオフナアニソンナイト",
      "OFUNA ANISON",
      "OFUNA ANISON NIGHT",
      "ANISON",
      "ANISON NIGHT",
    ],
  },
  {
    id: "disco",
    label: "DISCO系イベント",
    priority: 80,
    keywords: [
      "DISCO",
      "DISCO NIGHT",
      "HONEY BEE DISCO NIGHT",
      "HONEY BEE DISCO NIGHT 2026",
      "DISCO BAND",
      "ディスコ",
    ],
  },
  {
    id: "open_mic",
    label: "OPEN MIC系イベント",
    priority: 70,
    keywords: ["OPEN MIC", "オープンマイク", "OPENMIC"],
  },
  {
    id: "jam_session",
    label: "Jam / Session系イベント",
    priority: 70,
    keywords: ["JAM", "Jam", "Session", "SESSION", "セッション", "Shin's Jam", "Shins Jam"],
  },
  {
    id: "girls_collection",
    label: "GIRLS COLLECTION系イベント",
    priority: 70,
    keywords: ["OFUNA GIRLS COLLECTION", "GIRLS COLLECTION", "ガールズコレクション"],
  },
  {
    id: "monday",
    label: "月曜日もやってMONDAY系イベント",
    priority: 60,
    keywords: ["月曜日もやってMONDAY", "MONDAY"],
  },
  {
    id: "pagu",
    label: "PAGU系イベント",
    priority: 70,
    keywords: ["PAGU", "PAGU音楽事務所", "PAGU音楽事務所LIVE", "PAGU事務所"],
  },
  {
    id: "tamagawa_eiichi",
    label: "玉川永一系イベント",
    priority: 70,
    keywords: [
      "玉川永一",
      "玉・川・永・一",
      "玉 川 永 一",
      "玉川永一＆小西",
      "玉川永一&小西",
      "玉川永一 小西",
      "玉・川・永・一＆小・西",
      "玉・川・永・一&小・西",
    ],
  },
  {
    id: "surfside",
    label: "surfside系イベント",
    priority: 70,
    keywords: ["SURFSIDE", "THE SURFSIDE STOMP", "SURFSIDE STOMP", "surfside", "the surfside stomp"],
  },
  {
    id: "standard_jazz",
    label: "STANDARD JAZZ系イベント",
    priority: 70,
    keywords: ["STANDARD JAZZ", "STANDARD JAZZ LIVE", "Standard Jazz", "Standard Jazz Live"],
  },
];
const DISCO_STRONG_KEYWORDS = new Set([
  "DISCO",
  "DISCO NIGHT",
  "DISCO BAND",
  "HONEY BEE DISCO NIGHT",
  "HONEY BEE DISCO NIGHT 2026",
]);
/** 店主催・定例（店側で進行・表示設計を握りやすい系） */
const OWNER_RUN_SERIES_IDS = new Set([
  "anison",
  "disco",
  "open_mic",
  "jam_session",
  "girls_collection",
  "monday",
]);
/** タブレット/QR注文：テスト運用開始日（この日を含む） */
const TABLET_ORDER_TEST_START_DATE = "2026-05-23";
/** タブレット/QR注文：本格運用前提の開始日（この日を含む） */
const TABLET_ORDER_FULL_START_DATE = "2026-06-01";

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

const ANALYSIS_NOTE = {
  fontSize: ".58rem",
  color: "rgba(240,232,208,0.42)",
  lineHeight: 1.48,
};
const SALES_NUMBER_FONT_FAMILY =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const SALES_NUMBER_TABULAR = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum"',
};
const ANALYSIS_METRIC_HERO = {
  fontFamily: "Georgia,serif",
  fontSize: "2.45rem",
  lineHeight: 1,
  color: "#f8efd8",
  textShadow: "0 0 28px rgba(201,168,76,0.22), 0 2px 4px rgba(0,0,0,0.35)",
  ...SALES_NUMBER_TABULAR,
};
const ANALYSIS_METRIC_STRONG = {
  fontSize: "1.05rem",
  fontWeight: 600,
  color: "#f3ead2",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
};
const ANALYSIS_METRIC_MID = {
  fontSize: ".92rem",
  fontWeight: 600,
  color: "#f0e8d0",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
};
const ANALYSIS_METRIC_SUB = {
  fontSize: ".84rem",
  fontWeight: 500,
  color: "rgba(240,232,208,0.82)",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
};
const MOBILE_CARD_NUMBER_STYLE = {
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  fontSize: "1.05rem",
  fontWeight: 600,
  lineHeight: 1.45,
  color: "rgba(245,240,208,0.94)",
  wordBreak: "break-word",
  ...SALES_NUMBER_TABULAR,
};
const MOBILE_CARD_MUTED_NUMBER_STYLE = {
  ...MOBILE_CARD_NUMBER_STYLE,
  fontWeight: 500,
  color: "rgba(245,240,208,0.6)",
};
const MOBILE_CARD_LABEL_STYLE = {
  fontSize: ".78rem",
  color: "rgba(240,232,208,0.58)",
  lineHeight: 1.35,
  marginBottom: ".16rem",
};
const MOBILE_CARD_MONTH_TITLE_STYLE = {
  fontSize: "1.2rem",
  fontWeight: 700,
  color: "#c9a84c",
  lineHeight: 1.3,
};
const MOBILE_METRIC_STRONG = {
  fontSize: "1.2rem",
  fontWeight: 600,
  color: "#f3ead2",
  wordBreak: "break-word",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
};
const MOBILE_METRIC_MID = {
  fontSize: "1.08rem",
  fontWeight: 600,
  color: "#f0e8d0",
  wordBreak: "break-word",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
};

const RANK_LIST_METRIC_LINE = {
  fontSize: ".76rem",
  lineHeight: 1.45,
  color: "rgba(240,232,208,0.82)",
  wordBreak: "break-word",
};
const RANK_LIST_AMOUNT = {
  fontWeight: 600,
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
  color: "#f0e8d0",
};
const RANK_LIST_SUB = {
  fontWeight: 500,
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
  color: "rgba(240,232,208,0.55)",
};
const RANK_LIST_SHORTFALL = {
  fontWeight: 600,
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
  color: "rgba(212,168,138,0.9)",
};

const ANALYSIS_CARD = {
  summary: {
    card: {
      background: "linear-gradient(165deg, rgba(28,38,58,0.99) 0%, rgba(18,26,44,0.99) 50%, rgba(14,20,34,1) 100%)",
      border: "1px solid rgba(132,158,205,0.45)",
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
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(201,168,76,0.16)",
      boxShadow: "inset 2px 0 0 rgba(201,168,76,0.28)",
      padding: ".85rem .95rem",
    },
    title: { color: "rgba(223,192,106,0.88)", borderBottom: "1px solid rgba(201,168,76,0.16)", fontSize: ".7rem" },
    rowBorder: "rgba(201,168,76,0.1)",
  },
  rankUnder: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(190,120,88,0.16)",
      boxShadow: "inset 2px 0 0 rgba(190,110,78,0.28)",
      padding: ".85rem .95rem",
    },
    title: { color: "rgba(220,168,130,0.88)", borderBottom: "1px solid rgba(190,120,88,0.14)", fontSize: ".7rem" },
    rowBorder: "rgba(190,120,88,0.1)",
  },
  rankFoodDrink: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(110,170,120,0.16)",
      boxShadow: "inset 2px 0 0 rgba(102,170,118,0.26)",
      padding: ".85rem .95rem",
    },
    title: { color: "rgba(158,201,168,0.88)", borderBottom: "1px solid rgba(110,170,120,0.14)", fontSize: ".7rem" },
    rowBorder: "rgba(110,170,120,0.1)",
  },
  rankDrink: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(100,140,200,0.16)",
      boxShadow: "inset 2px 0 0 rgba(86,140,220,0.26)",
      padding: ".85rem .95rem",
    },
    title: { color: "rgba(158,184,224,0.88)", borderBottom: "1px solid rgba(100,140,200,0.14)", fontSize: ".7rem" },
    rowBorder: "rgba(100,140,200,0.1)",
  },
  rankFood: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(150,175,95,0.16)",
      boxShadow: "inset 2px 0 0 rgba(160,190,90,0.26)",
      padding: ".85rem .95rem",
    },
    title: { color: "rgba(184,201,138,0.88)", borderBottom: "1px solid rgba(150,175,95,0.14)", fontSize: ".7rem" },
    rowBorder: "rgba(150,175,95,0.1)",
  },
  forecast: {
    card: {
      background: "linear-gradient(165deg, rgba(18,36,38,0.98) 0%, rgba(14,28,32,0.99) 55%, rgba(10,22,26,1) 100%)",
      border: "1px solid rgba(102,170,140,0.32)",
      boxShadow: "inset 0 1px 0 rgba(120,200,170,0.06)",
      padding: "1.05rem 1.15rem",
    },
    title: { color: "#9ec9b8", borderBottom: "1px solid rgba(102,170,140,0.24)" },
    rowBorder: "rgba(102,170,140,0.12)",
  },
  insight: {
    card: {
      background: "linear-gradient(165deg, rgba(22,20,14,0.99) 0%, rgba(14,12,8,1) 100%)",
      border: "1px solid rgba(201,168,76,0.28)",
      boxShadow: "inset 0 1px 0 rgba(201,168,76,0.06)",
      padding: "1rem 1.1rem",
    },
    title: { color: "#c9a84c", borderBottom: "1px solid rgba(201,168,76,0.22)" },
    rowBorder: "rgba(201,168,76,0.12)",
  },
  causeAnalysis: {
    card: {
      background: "linear-gradient(180deg, rgba(14,14,14,0.99), rgba(8,8,8,1))",
      border: "1px solid rgba(190,120,88,0.22)",
      boxShadow: "inset 2px 0 0 rgba(190,110,78,0.24)",
      padding: ".95rem 1.05rem",
    },
    title: { color: "rgba(220,168,130,0.9)", borderBottom: "1px solid rgba(190,120,88,0.16)", fontSize: ".72rem" },
    rowBorder: "rgba(190,120,88,0.12)",
  },
  alert: {
    card: {
      background: "linear-gradient(180deg, rgba(32,22,18,0.98), rgba(20,14,12,0.99))",
      border: "1px solid rgba(168,118,88,0.26)",
      boxShadow: "inset 0 1px 0 rgba(200,140,100,0.04)",
      padding: "1rem 1.1rem",
    },
    title: { color: "#d4a88a", borderBottom: "1px solid rgba(168,118,88,0.2)" },
    rowBorder: "rgba(168,118,88,0.12)",
  },
  momCompare: {
    card: {
      background: "linear-gradient(180deg, rgba(16,24,40,0.99), rgba(12,18,32,1))",
      border: "1px solid rgba(100,140,200,0.28)",
      boxShadow: "inset 0 1px 0 rgba(100,140,200,0.05)",
      padding: "1rem 1.1rem",
    },
    title: { color: "#9eb8e0", borderBottom: "1px solid rgba(100,140,200,0.22)" },
    rowBorder: "rgba(100,140,200,0.12)",
  },
  yoyCompare: {
    card: {
      background: "linear-gradient(180deg, rgba(24,20,34,0.99), rgba(16,14,24,1))",
      border: "1px solid rgba(140,120,180,0.26)",
      boxShadow: "inset 0 1px 0 rgba(140,120,180,0.05)",
      padding: "1rem 1.1rem",
    },
    title: { color: "#c4b8dc", borderBottom: "1px solid rgba(140,120,180,0.2)" },
    rowBorder: "rgba(140,120,180,0.12)",
  },
};

function analysisCard(variant) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return { ...S.card, ...v.card };
}
function analysisCardWrap(variant, narrow) {
  const base = analysisCard(variant);
  return {
    ...base,
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  };
}
function analysisSectionWrap(narrow, extra = {}) {
  return {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    ...extra,
  };
}
function analysisSecTitle(variant, marginBottom) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return { ...S.secTitle, ...v.title, ...(marginBottom != null ? { marginBottom } : {}) };
}
function analysisRowBorder(variant) {
  const v = ANALYSIS_CARD[variant] || ANALYSIS_CARD.trend;
  return v.rowBorder;
}
function analysisNote(extra = {}, narrow = false) {
  const base = narrow ? { ...ANALYSIS_NOTE, fontSize: ".68rem" } : ANALYSIS_NOTE;
  return { ...base, ...extra };
}
function useSalesViewport() {
  const [vp, setVp] = useState(() => {
    if (typeof window === "undefined") return { narrow: false, mobile: false };
    return {
      narrow: window.matchMedia("(max-width: 768px)").matches,
      mobile: window.matchMedia("(max-width: 480px)").matches,
    };
  });
  useEffect(() => {
    const mq768 = window.matchMedia("(max-width: 768px)");
    const mq480 = window.matchMedia("(max-width: 480px)");
    const sync = () => setVp({ narrow: mq768.matches, mobile: mq480.matches });
    sync();
    mq768.addEventListener("change", sync);
    mq480.addEventListener("change", sync);
    return () => {
      mq768.removeEventListener("change", sync);
      mq480.removeEventListener("change", sync);
    };
  }, []);
  return vp;
}
function rGridCols(narrow, minPx = 170) {
  if (narrow) return "1fr";
  return `repeat(auto-fit, minmax(min(${minPx}px, 100%), 1fr))`;
}
const DAY_REPORT_BOX = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflow: "hidden",
};
const DAY_ANALYSIS_TEXT = {
  wordBreak: "break-word",
  overflowWrap: "anywhere",
};
function touchBtnExtra(narrow) {
  return narrow ? { minHeight: 44, fontSize: ".85rem", padding: ".48rem .85rem" } : {};
}
function analysisMetricHero(narrow, mobile) {
  return {
    ...ANALYSIS_METRIC_HERO,
    fontSize: mobile ? "2rem" : narrow ? "2.15rem" : ANALYSIS_METRIC_HERO.fontSize,
  };
}
function analysisMetricStrong(narrow) {
  return narrow ? MOBILE_METRIC_STRONG : ANALYSIS_METRIC_STRONG;
}
function analysisMetricMid(narrow) {
  return narrow ? MOBILE_METRIC_MID : ANALYSIS_METRIC_MID;
}
function AnalysisStackedRow({ label, value, valueStyle, narrow, border = true }) {
  if (!narrow) {
    return (
      <div style={{ minWidth: 0, maxWidth: "100%", wordBreak: "break-word" }}>
        {label} <strong style={valueStyle}>{value}</strong>
      </div>
    );
  }
  return (
    <div
      style={{
        padding: ".42rem 0",
        borderBottom: border ? "1px solid rgba(132,158,205,0.14)" : "none",
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={MOBILE_CARD_LABEL_STYLE}>{label}</div>
      <div style={{ ...MOBILE_CARD_NUMBER_STYLE, ...valueStyle }}>{value}</div>
    </div>
  );
}
function MobileFieldRow({ label, value, valueStyle, narrow }) {
  if (!narrow) {
    return (
      <div style={{ minWidth: 0, maxWidth: "100%", wordBreak: "break-word" }}>
        {label}: <strong style={valueStyle}>{value}</strong>
      </div>
    );
  }
  return (
    <div style={{ padding: ".3rem 0", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
      <div style={MOBILE_CARD_LABEL_STYLE}>{label}</div>
      <div style={{ ...MOBILE_CARD_NUMBER_STYLE, ...valueStyle }}>{value}</div>
    </div>
  );
}
const DAY_REPORT_FOOD_VALUE_STYLE = {
  fontSize: ".94rem",
  fontWeight: 600,
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
  color: "rgba(245,240,208,0.9)",
};
function DayReportFoodMetricRow({ label, value, narrow, valueStyle }) {
  const mergedValueStyle = { ...DAY_REPORT_FOOD_VALUE_STYLE, ...valueStyle };
  if (narrow) {
    return (
      <div style={{ padding: ".22rem 0", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
        <div style={{ ...MOBILE_CARD_LABEL_STYLE, marginBottom: ".1rem" }}>{label}</div>
        <div style={mergedValueStyle}>{value}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: ".65rem",
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <span style={{ fontSize: ".8rem", color: "rgba(240,232,208,0.78)", flex: "1 1 auto", minWidth: 0 }}>{label}</span>
      <strong style={{ ...mergedValueStyle, flex: "0 0 auto", textAlign: "right" }}>{value}</strong>
    </div>
  );
}
function SalesCompositionBreakdown({ items, narrow }) {
  const rowStyle = narrow
    ? {
        display: "flex",
        alignItems: "flex-start",
        gap: ".45rem",
        padding: ".42rem .55rem",
        borderRadius: 4,
        border: "1px solid rgba(88,128,178,0.16)",
        background: "rgba(0,0,0,0.15)",
        fontSize: ".88rem",
        lineHeight: 1.45,
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }
    : null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: rGridCols(narrow, 170), gap: narrow ? ".45rem" : ".35rem .8rem", fontSize: narrow ? ".88rem" : ".76rem", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
      {items.map((item) => (
        <div key={item.key} style={rowStyle || undefined}>
          {narrow ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  marginTop: ".22rem",
                  flexShrink: 0,
                  borderRadius: 2,
                  background: item.chipColor,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: "rgba(240,232,208,0.72)", marginBottom: ".1rem" }}>{item.label}</div>
                <div style={MOBILE_CARD_NUMBER_STYLE}>
                  {item.amount}{" "}
                  <span style={{ fontWeight: 500, color: "rgba(240,232,208,0.55)", fontSize: ".92rem" }}>({item.rate})</span>
                </div>
                {item.extra ? <div style={{ marginTop: ".14rem", fontSize: ".78rem", color: "rgba(240,232,208,0.58)", paddingLeft: ".1rem" }}>{item.extra}</div> : null}
              </div>
            </>
          ) : (
            <>
              {item.label}: <strong>{item.amount}</strong>（{item.rate}）
              {item.extra ? <span style={{ display: "block", marginTop: ".12rem", paddingLeft: ".5rem", fontSize: ".7rem", color: "rgba(240,232,208,0.68)" }}>{item.extra}</span> : null}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
function yearlyTableRowOpacity_(m) {
  if (m.status === "取得失敗") return 0.55;
  if (m.status === "未入力" || m.status === "予定あり") return 0.6;
  return 1;
}
function yearlyYoYRowOpacity_(r) {
  if (r.status === "未入力" || r.status === "予定あり") return 0.6;
  if (Number(r.currentSales || 0) <= 0) return 0.62;
  return 1;
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
function toExTaxSales_(grossSales) {
  if (grossSales == null || Number.isNaN(Number(grossSales))) return null;
  return displayMoneyValue(grossSales, "net");
}
function formatExTaxYen_(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return yen(Math.round(Number(value)));
}
function formatSignedExTaxYen_(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Math.round(Number(value));
  if (n === 0) return yen(0);
  return `${n > 0 ? "+" : "-"}${yen(Math.abs(n))}`;
}
const BREAK_EVEN_LINE_DEFINITIONS = [
  { key: "strong", threshold: BREAK_EVEN_STRONG_LINE_EX_TAX, label: "強い月", badge: "強い" },
  { key: "good", threshold: BREAK_EVEN_GOOD_LINE_EX_TAX, label: "かなり良い", badge: "良い" },
  { key: "stable", threshold: BREAK_EVEN_STABLE_LINE_EX_TAX, label: "安定ライン", badge: "安定" },
  { key: "smallProfit", threshold: BREAK_EVEN_SMALL_PROFIT_EX_TAX, label: "小幅黒字ライン", badge: "小幅黒字" },
  { key: "minimum", threshold: BREAK_EVEN_SAFE_LINE_EX_TAX, label: "最低ライン到達", badge: "最低" },
  { key: "below", threshold: 0, label: "損益分岐未達", badge: "未達" },
];
function resolveBreakEvenLine_(exTaxSales) {
  const sales = exTaxSales != null && Number.isFinite(Number(exTaxSales)) ? Number(exTaxSales) : null;
  if (sales == null || sales <= 0) {
    return {
      exTaxSales: sales,
      tierKey: null,
      label: null,
      badge: null,
      gapFromBreakEven: null,
      gapLabel: null,
      isAboveBreakEven: false,
      isAboveSafeLine: false,
      hasActualSales: false,
    };
  }
  let tier = BREAK_EVEN_LINE_DEFINITIONS.find((d) => d.key === "below");
  for (const def of BREAK_EVEN_LINE_DEFINITIONS) {
    if (def.key !== "below" && sales >= def.threshold) {
      tier = def;
      break;
    }
  }
  const gap = sales - BREAK_EVEN_SALES_EX_TAX;
  return {
    exTaxSales: sales,
    tierKey: tier.key,
    label: tier.label,
    badge: tier.badge,
    gapFromBreakEven: gap,
    gapLabel: gap >= 0 ? `損益分岐超過：${formatSignedExTaxYen_(gap)}` : `損益分岐まで：${formatExTaxYen_(Math.abs(gap))}`,
    isAboveBreakEven: sales >= BREAK_EVEN_SALES_EX_TAX,
    isAboveSafeLine: sales >= BREAK_EVEN_SAFE_LINE_EX_TAX,
    hasActualSales: true,
  };
}
function buildBreakEvenAnalysis_(totalSalesSum) {
  const line = resolveBreakEvenLine_(toExTaxSales_(totalSalesSum));
  return {
    breakEvenLineExTax: BREAK_EVEN_SALES_EX_TAX,
    safeLineExTax: BREAK_EVEN_SAFE_LINE_EX_TAX,
    ...line,
  };
}
function breakEvenLineBadgeTone_(tierKey) {
  switch (tierKey) {
    case "strong":
      return { bg: "rgba(102,197,124,0.22)", bd: "rgba(102,197,124,0.45)", tx: "#9ec9a8" };
    case "good":
      return { bg: "rgba(126,200,126,0.18)", bd: "rgba(126,200,126,0.4)", tx: "#9ec9b8" };
    case "stable":
      return { bg: "rgba(126,180,200,0.16)", bd: "rgba(126,180,200,0.38)", tx: "#a8c4d4" };
    case "smallProfit":
      return { bg: "rgba(201,168,76,0.14)", bd: "rgba(201,168,76,0.32)", tx: "rgba(230,210,160,0.92)" };
    case "minimum":
      return { bg: "rgba(201,168,76,0.1)", bd: "rgba(201,168,76,0.26)", tx: "rgba(210,195,150,0.85)" };
    case "below":
    default:
      return { bg: "rgba(190,120,88,0.14)", bd: "rgba(190,120,88,0.32)", tx: "#dca06a" };
  }
}
function countBreakEvenMonths_(months) {
  const actualMonths = (months || []).filter((m) => m.breakEvenAnalysis?.hasActualSales);
  const countTier = (key) =>
    actualMonths.filter((m) => {
      const sales = Number(m.breakEvenAnalysis?.exTaxSales || 0);
      if (key === "aboveBreakEven") return sales >= BREAK_EVEN_SALES_EX_TAX;
      if (key === "safeLine") return sales >= BREAK_EVEN_SAFE_LINE_EX_TAX;
      if (key === "stable") return sales >= BREAK_EVEN_STABLE_LINE_EX_TAX;
      if (key === "good") return sales >= BREAK_EVEN_GOOD_LINE_EX_TAX;
      if (key === "strong") return sales >= BREAK_EVEN_STRONG_LINE_EX_TAX;
      return false;
    }).length;
  return {
    actualMonthCount: actualMonths.length,
    aboveBreakEvenCount: countTier("aboveBreakEven"),
    safeLineCount: countTier("safeLine"),
    stableLineCount: countTier("stable"),
    goodLineCount: countTier("good"),
    strongLineCount: countTier("strong"),
  };
}
function buildBreakEvenMonthlyComment_(ctx) {
  const { analysis: a, tier, phase } = ctx;
  const be = a.breakEvenAnalysis;
  if (!be?.hasActualSales) return null;

  const safeMan = Math.round(BREAK_EVEN_SAFE_LINE_EX_TAX / 10000);

  if (be.tierKey === "good") {
    return "税抜450万円を超えており、かなり良い月です。ここからは売上だけでなく、営業ベース利益率・人件費率・仕入れ率が崩れていないかを確認してください。";
  }
  if (be.tierKey === "strong") {
    return "税抜500万円前後の強い月です。売上だけでなく、営業ベース利益率・人件費率・仕入れ率が崩れていないかを確認してください。";
  }
  if (!be.isAboveSafeLine) {
    const tail = phase.currentMonth
      ? "残り営業日は集客不足日と単価不足日のどちらを埋めるかを絞って対応してください。"
      : "次月はまず損益分岐超えを最優先にし、目標設定と集客・単価のどちらがボトルネックかを確認してください。";
    return `税抜${safeMan}万円の最低ラインに届いていません。まずは損益分岐超えを最優先にし、${tail}`;
  }
  if (tier !== "achieved" && be.isAboveSafeLine) {
    const tail = phase.currentMonth
      ? "残り営業日は利益の上積みを狙う局面です。"
      : "赤字回避ラインはクリアしています。";
    return `月間目標には届いていませんが、税抜${safeMan}万円の最低ラインは超えています。${tail}`;
  }
  if (tier === "achieved" && (be.tierKey === "minimum" || be.tierKey === "smallProfit")) {
    return `目標は達成していますが、税抜${safeMan}万円の最低ライン付近です。目標設定が低い可能性があるため、来月は損益分岐ラインを下回らない目標設計にしてください。`;
  }
  if (be.tierKey === "stable") {
    return "税抜400万円の安定ラインを超えています。目標達成とあわせ、営業ベース利益率・仕入れ率が崩れていないかも確認してください。";
  }
  return null;
}
function buildFixedCostAdjustedMonthlyComment_(ctx) {
  const a = ctx.analysis;
  const profit = a.fixedCostAdjustedProfit;
  const be = a.breakEvenAnalysis;
  if (profit == null || !(Number(a.totalSalesSum || 0) > 0)) return null;

  if (profit > FIXED_COST_STRONG_MONTH_EX_TAX) {
    return "固定費控除後利益が100万円を超えており、かなり良い月です。売上が強かったイベントと飲食単価を確認し、来月以降も再現できる形にしてください。";
  }
  if (profit > 0 && be?.isAboveBreakEven) {
    return "税抜売上は損益分岐を超えており、固定費控除後利益もプラスです。ここからは売上だけでなく、営業ベース利益率・人件費率・仕入れ率が崩れていないかを確認してください。";
  }
  if (profit <= 0) {
    const tail = ctx.phase?.currentMonth
      ? "残り営業日は、集客不足日と飲食単価不足日のどちらを埋めるかを絞って対応してください。"
      : "次月はまず損益分岐超えを最優先にし、集客不足か単価不足かを確認してください。";
    return `税抜売上が損益分岐に届いておらず、固定費控除後利益もマイナスです。${tail}`;
  }
  return null;
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
/** 営業粗利 = 売上 − 仕入れ合計 − 経費（人件費・固定費は含まない） */
function calcOperatingGrossProfit_(totalSales, purchaseTotal, expense) {
  return Number(totalSales || 0) - Number(purchaseTotal || 0) - Number(expense || 0);
}
/** 固定費控除後利益 = 税抜売上 × 限界利益率 − 固定費（管理会計概算） */
function calcFixedCostAdjustedProfitFromExTax_(exTaxSales) {
  const sales = exTaxSales != null && Number.isFinite(Number(exTaxSales)) ? Number(exTaxSales) : null;
  if (sales == null || sales <= 0) return { profit: null, rate: null, exTaxSales: sales };
  const profit = sales * CONTRIBUTION_MARGIN_RATE - MONTHLY_FIXED_COST_EX_TAX;
  return { profit, rate: (profit / sales) * 100, exTaxSales: sales };
}
function calcFixedCostAdjustedProfitFromGrossSales_(totalSalesSum) {
  return calcFixedCostAdjustedProfitFromExTax_(toExTaxSales_(totalSalesSum));
}
function formatFixedCostAdjustedProfit_(profit) {
  if (profit == null || !Number.isFinite(Number(profit))) return "—";
  return `約 ${formatExTaxYen_(Math.round(Number(profit)))}`;
}
function formatFixedCostAdjustedProfitRate_(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return "—";
  return pct1(rate);
}
function fixedCostProfitBadgeLabel_(profit) {
  if (profit == null || !Number.isFinite(Number(profit))) return null;
  return Number(profit) >= 0 ? "黒字" : "赤字";
}
function FixedCostProfitBadge({ profit, compact = false }) {
  const label = fixedCostProfitBadgeLabel_(profit);
  if (!label) return null;
  const positive = label === "黒字";
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: compact ? ".6rem" : ".62rem",
        fontWeight: 600,
        lineHeight: 1.25,
        padding: compact ? ".05rem .28rem" : ".06rem .34rem",
        borderRadius: 999,
        border: `1px solid ${positive ? "rgba(102,197,124,0.4)" : "rgba(190,120,88,0.38)"}`,
        background: positive ? "rgba(102,197,124,0.16)" : "rgba(190,120,88,0.14)",
        color: positive ? "#9ec9a8" : "#dca06a",
        whiteSpace: "nowrap",
      }}
    >
      固定費後：{label}
    </span>
  );
}
function buildMonthlyPriorYearComparison_(targetMonth, currentSales) {
  const monthNum = Number(String(targetMonth || "").slice(5, 7));
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
    return { prevMonthSales: null, prevMonthDiff: null, prevMonthRate: null };
  }
  const prevMonthSales = PREVIOUS_YEAR_SALES_2025_MAP[monthNum];
  if (prevMonthSales == null) {
    return { prevMonthSales: null, prevMonthDiff: null, prevMonthRate: null };
  }
  const prev = Number(prevMonthSales);
  const current = Number(currentSales || 0);
  return {
    prevMonthSales: prev,
    prevMonthDiff: current - prev,
    prevMonthRate: prev > 0 ? (current / prev) * 100 : null,
  };
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
  const avgMonthlySalesFromYearlyTotal =
    performanceMonthCount > 0 ? yearlyTotalSales / performanceMonthCount : null;
  return {
    hasFullYearTarget,
    enteredTargetSum,
    enteredTargetMonthCount,
    fullYearTargetSum,
    performanceSalesSum,
    performanceMonthCount,
    remainingMonths,
    avgMonthlySales,
    avgMonthlySalesFromYearlyTotal,
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
function buildYearlyCheckpoints_(ctx) {
  const items = [];
  const {
    yearlyProgressRate,
    hasFullYearTarget,
    fullYearTargetSum,
    enteredTargetMonthCount,
    landing,
    yearlyPurchaseCostRates,
    yearlyOperatingProfitRate,
    yearlyOperatingGrossProfitRate,
    yearlyFixedCostAdjustedProfitRate,
    momComparison,
    belowBreakEvenMonthCount,
    negativeOperatingProfitMonthCount,
    taxMode,
  } = ctx;

  if (momComparison && momComparison.salesDiff < 0) {
    items.push({
      key: "momSales",
      title: "前月より売上減少",
      message:
        "前月より売上が落ちています。売上減の月は、集客減・客単価減・飲食単価減のどれが原因かを月別分析で確認してください。",
      detail: formatSignedDisplayYen(momComparison.salesDiff, taxMode),
    });
  }
  if (!hasFullYearTarget) {
    items.push({
      key: "noAnnualTarget",
      title: "目標未設定の月があります",
      message: "年間進捗を正確に見るため、未設定月の目標を入力してください。",
      detail: `目標設定済み月 ${enteredTargetMonthCount}/12ヶ月`,
    });
  }
  if (
    hasFullYearTarget &&
    yearlyProgressRate != null &&
    yearlyProgressRate < 100 &&
    landing?.paceForecast != null &&
    fullYearTargetSum != null &&
    fullYearTargetSum > 0 &&
    landing.paceForecast < fullYearTargetSum
  ) {
    items.push({
      key: "targetRisk",
      title: "年間目標未達の見込み",
      message: "現在ペースの着地見込みが年間目標を下回っています。弱い月の集客・単価を月別経営レビューで確認してください。",
      detail: landing?.forecastGap != null ? `差額 ${formatSignedDisplayYen(landing.forecastGap, taxMode)}` : null,
    });
  }
  if (belowBreakEvenMonthCount > 0) {
    items.push({
      key: "belowBreakEven",
      title: "損益分岐未達の月があります",
      message: "該当月は、集客不足か単価不足かを月次分析で確認してください。",
      detail: `${belowBreakEvenMonthCount}ヶ月`,
    });
  }
  if (negativeOperatingProfitMonthCount > 0) {
    items.push({
      key: "negativeOpProfit",
      title: "固定費控除後利益がマイナスの月があります",
      message: "売上だけでなく、仕入れ・人件費・飲食比率も確認してください。",
      detail: `${negativeOperatingProfitMonthCount}ヶ月`,
    });
  }
  const totalPurchaseRate = yearlyPurchaseCostRates?.totalPurchaseRate;
  if (totalPurchaseRate != null && totalPurchaseRate >= 30) {
    items.push({
      key: "purchaseHigh",
      title: "年間仕入率が高め",
      message: "仕入率が高い月は、ドリンク・フードの原価率とメニュー構成を月次分析で確認してください。",
      detail: pct1(totalPurchaseRate),
    });
  }
  const foodCostRate = yearlyPurchaseCostRates?.foodCostRate;
  if (foodCostRate != null && foodCostRate >= 35) {
    items.push({
      key: "foodCost",
      title: "フード原価率が高め",
      message: "フード仕入と販売メニューのバランスを、利益率の低い月から確認してください。",
      detail: pct1(foodCostRate),
    });
  }
  const drinkCostRate = yearlyPurchaseCostRates?.drinkCostRate;
  if (drinkCostRate != null && drinkCostRate >= 25) {
    items.push({
      key: "drinkCost",
      title: "ドリンク原価率が高め",
      message: "ドリンク仕入と販売構成を、飲食単価の低い月とあわせて確認してください。",
      detail: pct1(drinkCostRate),
    });
  }
  if (yearlyFixedCostAdjustedProfitRate != null && yearlyFixedCostAdjustedProfitRate < 12) {
    items.push({
      key: "opProfit",
      title: "固定費控除後利益率が低め",
      message: "売上のある月でも固定費控除後の利益率が弱い場合は、人件費・仕入れの月別差を確認してください。",
      detail: pct1(yearlyFixedCostAdjustedProfitRate),
    });
  }
  if (yearlyOperatingProfitRate != null && yearlyOperatingProfitRate < 12) {
    items.push({
      key: "opBaseProfit",
      title: "営業ベース利益率が低め",
      message: "営業ベース利益率が低い場合は、仕入れ・経費・人件費の月別差を確認してください。",
      detail: pct1(yearlyOperatingProfitRate),
    });
  }
  if (yearlyOperatingGrossProfitRate != null && yearlyOperatingGrossProfitRate < 60) {
    items.push({
      key: "opGrossProfit",
      title: "営業粗利率が低め",
      message: "仕入れ・経費の影響が大きい月がないか、月別経営レビューで確認してください。",
      detail: pct1(yearlyOperatingGrossProfitRate),
    });
  }
  if (momComparison) {
    const prevLabor = Number(momComparison.prev?.laborCostSum || 0);
    const laborDiff = momComparison.laborDiff;
    const laborIncreased =
      laborDiff > 0 && (prevLabor > 0 ? laborDiff / prevLabor >= 0.15 : laborDiff >= 100000);
    if (laborIncreased) {
      items.push({
        key: "momLabor",
        title: "前月比で人件費が増加",
        message: "人件費の増加が利益を圧迫していないか、固定費控除後利益の月別推移を確認してください。",
        detail: formatSignedDisplayYen(laborDiff, taxMode),
      });
    }
  }
  return items.slice(0, 6);
}
function buildMonthlyReviewComment_(m, operatingGrossProfitRate) {
  const be = m.breakEvenAnalysis;
  const sales = Number(m.totalSalesSum || 0);
  const progress = m.progressRate;
  const hasTarget = Number(m.targetSalesSum || 0) > 0;
  const targetMet = hasTarget && progress != null && progress >= 100;
  const targetUnder = hasTarget && progress != null && progress < 100;
  const aboveBE = be?.isAboveBreakEven;
  const strongMonth = be?.tierKey === "strong" || be?.tierKey === "good";
  const opProfitRate = m.operatingProfitRate;

  if (m.status !== "集計済み" || sales <= 0) {
    if (m.status === "予定あり") return "予定月です。実績確定後に月次分析で確認してください。";
    if (m.status === "取得失敗") return "データ取得に失敗しました。再読込後に確認してください。";
    return "実績がありません。";
  }
  if (strongMonth && aboveBE && (!hasTarget || targetMet) && operatingGrossProfitRate != null && operatingGrossProfitRate >= 55) {
    return "売上・損益分岐ともに良好です。飲食単価と利益率が崩れていなければ、成功月として再現要因を確認してください。";
  }
  if (sales > 0 && operatingGrossProfitRate != null && operatingGrossProfitRate < 50 && (opProfitRate == null || opProfitRate < 10)) {
    return "売上は取れていますが、利益率が弱い月です。仕入れ・人件費・飲食比率を確認してください。";
  }
  if (targetUnder && aboveBE) {
    return "目標には届いていませんが、損益分岐は超えています。赤字回避はできているため、次月は集客か飲食単価のどちらを伸ばすか確認してください。";
  }
  if (!aboveBE && be?.hasActualSales) {
    return "損益分岐に届いていません。まずは売上不足の原因が集客なのか、単価なのかを月次分析で確認してください。";
  }
  if (targetMet && aboveBE) {
    return "目標達成かつ経営ラインも良好です。成功要因を月次分析で記録してください。";
  }
  return "月次分析で売上・集客・単価・利益のバランスを確認してください。";
}
function buildYearlyMonthReviewRows_(monthRows, monthlyYoYRows) {
  const yoyMap = Object.fromEntries((monthlyYoYRows || []).map((r) => [r.targetMonth, r]));
  return (monthRows || []).map((m) => {
    const yoy = yoyMap[m.targetMonth];
    const operatingGrossProfitSum = calcOperatingGrossProfit_(m.totalSalesSum, m.purchaseTotalSum, m.expenseSum);
    const operatingGrossProfitRate = calcRate(operatingGrossProfitSum, m.totalSalesSum);
    const fixedCostAdjusted = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
    return {
      ...m,
      yoyRate: yoy?.yoyRate ?? null,
      yoyDiff: yoy?.diff ?? null,
      operatingGrossProfitSum,
      operatingGrossProfitRate,
      fixedCostAdjustedProfit: fixedCostAdjusted.profit,
      fixedCostAdjustedProfitRate: fixedCostAdjusted.rate,
      fixedCostAdjustedProfitAbs: fixedCostAdjusted.profit != null ? Math.abs(fixedCostAdjusted.profit) : null,
      fixedCostProfitBadge: fixedCostProfitBadgeLabel_(fixedCostAdjusted.profit),
      breakEvenGapExTax: m.breakEvenAnalysis?.gapFromBreakEven ?? null,
      reviewComment: buildMonthlyReviewComment_(m, operatingGrossProfitRate),
      breakEvenGapLabel: m.breakEvenAnalysis?.gapLabel ?? "—",
    };
  });
}
function enhanceYearlyMonthRowsForCharts_(monthRows) {
  return (monthRows || []).map((m) => {
    const operatingGrossProfitSum = calcOperatingGrossProfit_(m.totalSalesSum, m.purchaseTotalSum, m.expenseSum);
    const fixedCostAdjusted = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
    const gap = m.breakEvenAnalysis?.gapFromBreakEven ?? null;
    return {
      ...m,
      operatingGrossProfitSum,
      operatingGrossProfitRate: calcRate(operatingGrossProfitSum, m.totalSalesSum),
      fixedCostAdjustedProfit: fixedCostAdjusted.profit,
      fixedCostAdjustedProfitRate: fixedCostAdjusted.rate,
      fixedCostAdjustedProfitAbs: fixedCostAdjusted.profit != null ? Math.abs(fixedCostAdjusted.profit) : null,
      breakEvenGapExTax: gap,
      breakEvenGapAbsExTax: gap != null ? Math.abs(gap) : null,
    };
  });
}
function countUnderTargetCategories_(causeAnalysis) {
  const counts = {};
  for (const r of causeAnalysis || []) {
    const cat = r?.category;
    if (!cat || cat === "判定不可") continue;
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}
function pickProgressWeakSide_(causeAnalysis) {
  const counts = countUnderTargetCategories_(causeAnalysis);
  const customerWeak = (counts["集客不足型"] || 0) + (counts["集客・単価不足型"] || 0);
  const unitWeak = (counts["単価不足型"] || 0) + (counts["集客・単価不足型"] || 0);
  if (customerWeak > unitWeak) return "customer";
  if (unitWeak > customerWeak) return "unit";
  return "both";
}
function resolveMonthPhase_(targetMonth, currentBusinessDate) {
  const selected = normalizeMonth(targetMonth) || "";
  const current = String(currentBusinessDate || "").slice(0, 7);
  if (!selected || !current) {
    return { endedMonth: false, currentMonth: true, futureMonth: false };
  }
  if (selected < current) return { endedMonth: true, currentMonth: false, futureMonth: false };
  if (selected > current) return { endedMonth: false, currentMonth: false, futureMonth: true };
  return { endedMonth: false, currentMonth: true, futureMonth: false };
}
function resolveProgressTier_(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return "unknown";
  if (rate >= 100) return "achieved";
  if (rate >= 90) return "almost";
  return "atRisk";
}
function buildAdviceContext_(analysis, taxMode, targetMonth, currentBusinessDate, yearlyMonthData) {
  const a = analysis || {};
  const phase = resolveMonthPhase_(targetMonth, currentBusinessDate);
  const tier = resolveProgressTier_(a.monthlyProgressRate);
  const comparison = buildComparisonContext_(a, yearlyMonthData, targetMonth, currentBusinessDate);
  return { analysis: a, taxMode, phase, tier, comparison };
}
function shiftTargetMonth_(targetMonth, deltaMonths) {
  const m = normalizeMonth(targetMonth);
  if (!m) return null;
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + deltaMonths, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function buildMonthSnapshotFromYearlyData_(yearlyMonthData, month, currentBusinessDate) {
  const item = (yearlyMonthData || []).find((d) => d.month === month && d.ok);
  if (!item) return null;
  const snap = aggregateMonthFromRecords_(item.records, month, currentBusinessDate, item.monthlySummary);
  return snap.status === "集計済み" ? snap : null;
}
function findRecentAchievedMonthSnapshot_(yearlyMonthData, targetMonth, currentBusinessDate) {
  const current = normalizeMonth(targetMonth);
  const candidates = (yearlyMonthData || [])
    .filter((d) => d.ok && d.month < current)
    .map((d) => aggregateMonthFromRecords_(d.records, d.month, currentBusinessDate, d.monthlySummary))
    .filter((m) => m.status === "集計済み" && Number(m.progressRate || 0) >= 100 && Number(m.targetSalesSum || 0) > 0)
    .sort((x, y) => String(y.targetMonth).localeCompare(String(x.targetMonth)));
  return candidates[0] || null;
}
function computeDayGroupMetrics_(recordRows, filterFn) {
  const rows = (recordRows || []).filter(filterFn);
  if (!rows.length) return null;
  const totalSales = rows.reduce((s, r) => s + Number(r?.metrics?.totalSales || 0), 0);
  const customerCount = rows.reduce((s, r) => s + pickMetricValue(r?.metrics, CUSTOMER_COUNT_KEYS), 0);
  const barTimeCount = rows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAR_TIME_CUSTOMER_COUNT_KEYS), 0);
  const foodDrink = rows.reduce((s, r) => {
    const base = r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : 0;
    return s + base + bandFoodDrinkSalesFromMetrics_(r?.metrics);
  }, 0);
  return {
    dayCount: rows.length,
    avgDailyCustomerCount: customerCount / rows.length,
    customerUnitPrice: unitPriceByCustomerCount_(totalSales, customerCount),
    foodDrinkRate: calcRate(foodDrink, totalSales),
    barTimeCustomerRate: calcRate(barTimeCount, customerCount),
    avgDailySales: totalSales / rows.length,
  };
}
function buildComparisonContext_(analysis, yearlyMonthData, targetMonth, currentBusinessDate) {
  const priorMonthKey = shiftTargetMonth_(targetMonth, -1);
  const priorMonth = priorMonthKey
    ? buildMonthSnapshotFromYearlyData_(yearlyMonthData, priorMonthKey, currentBusinessDate)
    : null;
  const achievedMonth =
    resolveProgressTier_(analysis?.monthlyProgressRate) !== "achieved"
      ? findRecentAchievedMonthSnapshot_(yearlyMonthData, targetMonth, currentBusinessDate)
      : null;
  const achievedDays = computeDayGroupMetrics_(analysis?.actualRows, (r) => {
    const target = Number(r?.metrics?.targetSales || 0);
    if (target <= 0) return false;
    const rate = calcRate(r?.metrics?.totalSales, target);
    return rate != null && rate >= 100;
  });
  const underTargetDays = computeDayGroupMetrics_(analysis?.actualRows, (r) => {
    const target = Number(r?.metrics?.targetSales || 0);
    if (target <= 0) return false;
    const rate = calcRate(r?.metrics?.totalSales, target);
    return rate != null && rate < 100;
  });
  return { priorMonth, achievedMonth, achievedDays, underTargetDays };
}
function dominantUnderTargetCategory_(causeAnalysis) {
  const counts = countUnderTargetCategories_(causeAnalysis);
  const sorted = Object.entries(counts).sort((x, y) => y[1] - x[1]);
  const [topCat, topCount] = sorted[0] || [];
  if (!topCat || !topCount) return null;
  const rows = (causeAnalysis || []).filter((r) => r?.category && r.category !== "判定不可");
  const shouldShow = topCount >= 2 || topCount >= Math.ceil(rows.length / 2);
  return shouldShow || rows.length <= 2 ? topCat : null;
}
function buildMonthlyConclusionComment_(ctx) {
  const { analysis: a, taxMode, phase, tier } = ctx;
  const rate = a.monthlyProgressRate;
  const remaining = Math.max(0, Number(a.fullMonthTargetSalesSum || 0) - Number(a.totalSalesSum || 0));
  const yoyRate = a.priorYearMonth?.prevMonthRate;
  const yoyTail =
    yoyRate != null && yoyRate >= 110
      ? "前年同月比も好調で、売上基調は強めです。"
      : yoyRate != null && yoyRate >= 90
        ? "前年同月比はおおむね維持できています。"
        : yoyRate != null
          ? "前年同月比では弱さが見えます。"
          : "";

  if (tier === "achieved") {
    const driverHint =
      a.customerUnitPrice != null &&
      a.normalCustomerUnitPrice != null &&
      Number(a.customerUnitPrice) > Number(a.normalCustomerUnitPrice) * 1.03
        ? "客単価・飲食売上の寄与が相対的に大きい可能性があります。"
        : "集客人数・客単価・飲食売上のどれが効いたかを切り分ける必要があります。";
    if (phase.currentMonth) {
      return `月間目標は達成済みです。${yoyTail}${driverHint} 成功要因は「売上TOP5」と「飲食売上TOP10」で、集客数と客単価が高い日を比較してください。`;
    }
    return `月間目標は達成済みで着地しました。${yoyTail}${driverHint} 再現のため「売上TOP5」と「飲食売上TOP10」で成功パターンを確認してください。`;
  }

  if (tier === "almost") {
    if (phase.endedMonth) {
      return `売上は目標に対して ${formatDisplayYen(remaining, taxMode)} 不足し、月間進捗率は ${pct(rate)} でした。${yoyTail} 大きく崩れてはいませんが、あと一歩届かなかった要因を未達日の分類と達成日の差から確認してください。`;
    }
    if (phase.currentMonth) {
      return `月間進捗率 ${pct(rate)} で、目標達成まで ${formatDisplayYen(remaining, taxMode)} です。${yoyTail} 未達日と達成日の集客・客単価の差を見ると、残り営業日の重点施策が整理できます。`;
    }
  }

  if (tier === "atRisk") {
    if (phase.endedMonth) {
      return `月間進捗率 ${pct(rate)} で、目標未達で着地しました。${yoyTail} 月全体の課題は未達日の傾向と達成日との差から特定できます。`;
    }
    if (phase.currentMonth) {
      return `月間進捗率 ${pct(rate)} で、未達リスクがあります。${yoyTail} 未達日の傾向と達成日との差を先に確認してください。`;
    }
  }

  return null;
}
function buildMonthlyComparisonComment_(ctx) {
  const { analysis: a, phase, tier, comparison } = ctx;
  const { priorMonth, achievedMonth, achievedDays, underTargetDays } = comparison || {};

  if (priorMonth) {
    const salesUp = Number(a.totalSalesSum || 0) > Number(priorMonth.totalSalesSum || 0);
    const customerUp = Number(a.customerCountSum || 0) > Number(priorMonth.customerCountSum || 0);
    const unitUp =
      a.customerUnitPrice != null &&
      priorMonth.customerUnitPrice != null &&
      Number(a.customerUnitPrice) > Number(priorMonth.customerUnitPrice);
    const unitFlat =
      a.customerUnitPrice != null &&
      priorMonth.customerUnitPrice != null &&
      Math.abs(Number(a.customerUnitPrice) - Number(priorMonth.customerUnitPrice)) <=
        Number(priorMonth.customerUnitPrice) * 0.03;

    if (salesUp && unitUp && !customerUp) {
      return "前月より売上は伸びていますが、集客人数の伸びより客単価の上昇が効いています。高単価イベントの構成を確認し、同じ客層・メニュー提案を次月にも展開してください。";
    }
    if (!salesUp && unitFlat) {
      return "前月より売上は落ちていますが、客単価は維持されています。課題は単価より集客数なので、イベント告知・予約導線・出演者との集客共有を優先してください。";
    }
    if (salesUp && customerUp && unitUp) {
      return "前月比で売上・集客・客単価が揃って伸びています。好調要因が大型イベント依存か通常営業の底上げかを分けて確認すると、再現しやすくなります。";
    }
    const yoyRate = a.priorYearMonth?.prevMonthRate;
    if (yoyRate != null && yoyRate >= 100 && !salesUp) {
      return "売上は前年同月を上回っていますが、前月比では鈍化しています。大型イベントによる一時的な上振れではなく、通常イベントの底上げができているか確認してください。";
    }
    if (salesUp) {
      return "前月比では売上は改善しています。伸びの主因が集客人数か客単価か飲食比率かを分けると、次月の重点施策が明確になります。";
    }
    if (!salesUp) {
      return "前月比では売上が弱くなっています。集客人数・客単価・飲食比率のどれが前月から落ちたかを確認してください。";
    }
  }

  const yoyRate = a.priorYearMonth?.prevMonthRate;
  if (yoyRate != null) {
    if (tier === "achieved" && yoyRate >= 110) {
      return "前年同月比も好調です。大型イベントによる一時的な上振れなのか、通常営業の底上げなのかを分けて見ると、再現しやすい成功パターンが見つかります。";
    }
    if (yoyRate >= 110) {
      return `前年同月比 ${pct1(yoyRate)} と好調です。伸びの主因が集客増か客単価上昇かを分けて確認してください。`;
    }
    if (yoyRate >= 90) {
      if (phase.endedMonth) {
        return `前年同月比 ${pct1(yoyRate)} で、前年並みを維持しました。ただし大きな上振れではないため、次月は集客人数・客単価・飲食比率のどれを伸ばすかを明確にしてください。`;
      }
      return `前年同月比 ${pct1(yoyRate)} でほぼ横ばいです。大きな上振れを作るには、集客人数・客単価・飲食比率のどれかを伸ばす必要があります。`;
    }
    return phase.endedMonth
      ? "前年同月を下回りました。前年より集客が落ちていたのか、客単価が落ちていたのかを確認し、次月は弱い方に施策を寄せてください。"
      : "前年同月を下回っています。前年より集客が落ちているのか、客単価が落ちているのかを優先して確認してください。";
  }

  if (tier !== "achieved" && achievedMonth) {
    const countGap =
      a.avgDailyCustomerCount != null &&
      achievedMonth.avgDailyCustomerCount != null &&
      Number(a.avgDailyCustomerCount) < Number(achievedMonth.avgDailyCustomerCount) * 0.9;
    const unitGap =
      a.customerUnitPrice != null &&
      achievedMonth.customerUnitPrice != null &&
      Number(a.customerUnitPrice) < Number(achievedMonth.customerUnitPrice) * 0.95;
    if (countGap && !unitGap) {
      return `直近の達成月（${achievedMonth.monthLabel}）と比べると、客単価より集客人数の差が大きく出ています。目標達成には単価施策よりも、イベントごとの予約数と出演者側の集客共有を優先した方が効果的です。`;
    }
    if (!countGap && unitGap) {
      return `直近の達成月（${achievedMonth.monthLabel}）と比べると、集客人数は大きく落ちていませんが、客単価と飲食比率が弱くなっています。来店後の追加注文導線、フード提案、ドリンク2杯目の声かけを強化してください。`;
    }
    if (countGap && unitGap) {
      return `直近の達成月（${achievedMonth.monthLabel}）と比べると、集客人数・客単価の両面で差があります。達成月のイベント構成と告知設計を「売上TOP5」で確認してください。`;
    }
  }

  if (achievedDays && underTargetDays) {
    const countGap = underTargetDays.avgDailyCustomerCount < achievedDays.avgDailyCustomerCount * 0.9;
    const unitGap =
      underTargetDays.customerUnitPrice != null &&
      achievedDays.customerUnitPrice != null &&
      underTargetDays.customerUnitPrice < achievedDays.customerUnitPrice * 0.95;
    if (countGap && !unitGap) {
      return "月内で達成日と未達日を比べると、未達日は集客人数の差が目立ちます。客単価は大きく崩れていないため、イベント前の集客設計が課題です。";
    }
    if (!countGap && unitGap) {
      return "月内で達成日と未達日を比べると、集客数は維持できている一方で客単価・飲食比率が弱い日が目立ちます。来店後の注文導線が課題です。";
    }
    if (countGap && unitGap) {
      return "月内で達成日と未達日を比べると、集客人数・客単価の両面で差が出ています。達成日のイベント内容と未達日の差を「売上TOP5」で確認してください。";
    }
  }

  return null;
}
function isCustomerFocusedUnderTargetCause_(topCat, weakSide) {
  if (topCat === "集客不足型" || topCat === "集客・単価不足型") return true;
  if (!topCat && weakSide === "customer") return true;
  return false;
}
function hasRegularSeriesEventInCauseAnalysis_(causeAnalysis) {
  const pattern = /DISCO|アニソン|Jam|MONDAY|定例/i;
  return (causeAnalysis || []).some((r) => pattern.test(String(r?.eventName || "")));
}
function buildOrderUnitPriceAddonForCustomerAction_(orderPhase) {
  if (orderPhase === "before_tablet") {
    return " 集客対策に加え、卓上メニューやおすすめ表示でドリンク・フードが目に入る状態を作ってください。";
  }
  if (orderPhase === "tablet_test") {
    return " 集客対策に加え、タブレット/QR注文（テスト運用）のおすすめ枠にドリンク2品・提供が早いフード2品を出してください。";
  }
  return " 集客対策に加え、注文画面のおすすめ枠にドリンク2品・提供が早いフード2品を出してください。";
}
function buildCustomerAcquisitionActionComment_(ctx, used) {
  const { analysis: a, phase, tier } = ctx;
  if (tier === "achieved" || phase.futureMonth) return null;

  const topCat = dominantUnderTargetCategory_(a.underTargetCauseAnalysis);
  const weakSide = pickProgressWeakSide_(a.underTargetCauseAnalysis);

  if (topCat === "目標過大の可能性" || topCat === "単価不足型") return null;
  if (!isCustomerFocusedUnderTargetCause_(topCat, weakSide)) return null;

  const isDualCause = topCat === "集客・単価不足型";
  const orderPhase = resolveOrderOperationPhase_(a.currentBusinessDate);
  const hasRegularSeries = hasRegularSeriesEventInCauseAnalysis_(a.underTargetCauseAnalysis);
  const futureDayCount = Number(a.futureDayCount || 0);
  const diagnosis =
    topCat === "集客・単価不足型"
      ? "未達日は集客不足に加え、来店後の単価も月平均を下回る日が目立ちます。"
      : "未達日の多くは集客不足型です。";

  used.customer = true;
  used.customerAction = true;
  if (isDualCause) used.unit = true;

  if (phase.currentMonth) {
    const futureLead =
      futureDayCount > 0
        ? `本日以降の予定が${futureDayCount}件あるため、全件を同じ密度で告知するより、`
        : "残り予定が少なくても、直近7日以内の開催日は";
    const regularHint = hasRegularSeries
      ? " DISCO/アニソン/Jam/MONDAYなど定例系は固定客へ次回日程をLINE・店頭で案内し、"
      : "";
    let text = `${diagnosis}${futureLead}開催1週間前時点で予約数が目標の7割未満のイベントを優先してください。${regularHint}今月中の集客対応：①残りイベントの予約数確認 ②7割未満の日を抽出 ③出演者へ「現在○名・目標○名・あと○名」と告知用短文を共有 ④店側は開催3〜5日前に出演者名・見どころ・残席感・初来店歓迎を入れて再投稿（予約URLは投稿上部へ）。`;
    if (isDualCause) text += buildOrderUnitPriceAddonForCustomerAction_(orderPhase);
    return text;
  }

  if (phase.endedMonth) {
    let text = `${diagnosis}この月は集客不足で着地しました。次月はイベント登録時点で出演者ごとの見込み人数を入れ、開催1週間前に予約数が弱いイベントだけ再告知対象にしてください。出演者には「現在予約数・目標・不足人数」とそのまま使える告知文を渡し、店側投稿はスケジュール告知ではなく来店理由（誰が出るか・雰囲気・初めてでも入りやすいか）を書いてください。`;
    if (hasRegularSeries) {
      text += " 定例系イベントは前回参加者へ次回日程と「前回との違い」を伝えてください。";
    }
    if (isDualCause) text += buildOrderUnitPriceAddonForCustomerAction_(orderPhase);
    return text;
  }

  return null;
}
function buildCauseOrSuccessComment_(ctx, used) {
  const { analysis: a, tier } = ctx;
  const topCat = dominantUnderTargetCategory_(a.underTargetCauseAnalysis);
  const causeRows = (a.underTargetCauseAnalysis || []).filter((r) => r?.category && r.category !== "判定不可");
  const targetHighCount = (causeRows || []).filter((r) => r.category === "目標過大の可能性").length;

  if (tier === "achieved") {
    if (!topCat || causeRows.length === 0) {
      const topDay = a.salesRankingTop5?.[0];
      if (topDay) {
        return `売上TOP日（${(topDay.businessDate || "").slice(5).replace("-", "/")} ${topDay.eventName}）の集客・客単価・飲食構成が、今月の成功パターンの中心と考えられます。「売上TOP5」と「飲食売上TOP10」で再現要素を確認してください。`;
      }
      return null;
    }
    used.customer = used.customer || String(topCat).includes("集客");
    used.unit = used.unit || String(topCat).includes("単価");
    return `月間では達成していますが、一部未達日では${topCat}が見られます。全体達成を妨げた要因ではないため参考程度に、「未達日の要因分析」で傾向だけ確認してください。`;
  }

  if (!topCat && targetHighCount >= 2) {
    used.targetHigh = true;
    return "未達の中には目標過大の可能性がある日が複数あります。売上自体は月平均に近いため、目標設定がイベント規模に対して高すぎた可能性があります。詳細は「未達日の要因分析」で確認してください。";
  }

  if (!topCat) return null;

  used.customer = used.customer || String(topCat).includes("集客");
  used.unit = used.unit || String(topCat).includes("単価");

  const detailed = {
    集客不足型:
      "未達日の多くは集客不足型です。客単価は月平均を大きく下崩れていないため、来店後よりイベント前の集客が課題です。",
    単価不足型:
      "未達日は単価不足型が目立ちます。集客数は大きく崩れていないため、課題は来店後の注文導線です。フード提案、追加ドリンク、セットメニューを優先してください。詳細は「未達日の要因分析」で、単価不足型の日を確認してください。",
    "集客・単価不足型":
      "未達日は集客不足に加え、来店後の単価も月平均を下回る日が目立ちます。予約確認・出演者共有と、来店後の注文導線の両方が必要です。",
    目標過大の可能性:
      "目標過大の可能性がある日が複数あります。売上自体は月平均に近いため、集客施策より過去同系イベントの平均売上を基準にした目標見直しを優先してください。",
  };

  if (topCat === "目標過大の可能性") {
    used.targetHigh = true;
  }

  return detailed[topCat] || null;
}
function buildMonthlyActionComment_(ctx, used) {
  const { analysis: a, phase, tier, comparison } = ctx;
  const weakSide = pickProgressWeakSide_(a.underTargetCauseAnalysis);
  const barRate = a.barTimeCustomerRate;
  const grossRate = a.operatingGrossProfitRate;

  if (barRate != null && barRate >= 10 && !used.bar) {
    used.bar = true;
    return "バータイム比率が高い日は、終演後の滞在導線がうまく機能している可能性があります。イベント内容・終演時間・出演者との交流の流れを「選択日の営業レポート」で確認し、他イベントにも横展開してください。";
  }

  if (barRate != null && barRate < 5 && !used.bar) {
    used.bar = true;
    if (tier === "achieved") {
      return "売上は達成していますが、バータイム比率は低めです。現状でも売上は作れていますが、終演後に残る導線を作れれば追加売上の伸びしろになります。バータイム人数が多い日は「選択日の営業レポート」で確認してください。";
    }
    if (tier === "atRisk" || tier === "almost") {
      const tail = phase.endedMonth
        ? "次月は終演後の一杯、出演者との交流、軽いフード提案をイベント設計に組み込んでください。"
        : "集客だけでなく、終演後に残る理由を作ることで追加売上を積める可能性があります。";
      return `売上${tier === "atRisk" ? "未達" : "未達に近い"}状態で、バータイム比率も低めです。${tail} 詳細は「選択日の営業レポート」でバータイム人数が多い日を探してください。`;
    }
  }

  if (barRate != null && barRate >= 5 && barRate < 10 && !used.bar) {
    used.bar = true;
    return phase.endedMonth
      ? "バータイム比率は中間的でした。残留率が高い日と低い日を「選択日の営業レポート」で比較し、次月の終演後導線を見直してください。"
      : "バータイム比率は中間的です。残留率が高い日と低い日を「選択日の営業レポート」で比較し、終演後の導線を見直してください。";
  }

  if (grossRate != null && grossRate < 60) {
    const next = phase.endedMonth ? "次月は" : "";
    return `営業粗利率 ${pct1(grossRate)} は低めです。${next}売上があっても手元に残りにくい状態のため、仕入れ・経費・値付け・ロスの確認を優先してください。`;
  }

  if (tier === "achieved") {
    return "好調要因の再現のため、「売上TOP5」「飲食売上TOP10」「選択日の営業レポート」をセットで見比べ、集客・客単価・飲食のどれが効いたかを整理してください。";
  }

  if (used.customer && !used.unit && !used.customerAction) {
    return phase.endedMonth
      ? "次月はイベント登録時点で出演者ごとの見込み人数を入れ、開催1週間前に予約数が弱いイベントだけ再告知対象にしてください。"
      : "残り営業日は、開催1週間前時点で予約数が目標の7割未満のイベントを優先し、出演者へ不足人数と告知用短文を共有してください。";
  }

  if (used.unit && !used.customer) {
    return phase.endedMonth
      ? "次月はドリンク追加、フード提案、セットメニューなど、来店後の注文導線を見直してください。"
      : "残り営業日はフード提案と追加注文導線を優先してください。詳細は「未達日の要因分析」を参照してください。";
  }

  if (weakSide === "customer" && !used.customerAction) {
    return phase.endedMonth
      ? "次月は開催1週間前に予約数を確認し、目標の7割未満の日だけ出演者へ再告知用短文を渡してください。"
      : "残り営業日は、予約数が弱いイベントを優先し、出演者名・見どころ・残席感を入れた店側再投稿を開催3〜5日前に行ってください。";
  }

  if (weakSide === "unit") {
    return phase.endedMonth
      ? "次月は来店後の追加注文導線とフード提案を優先してください。"
      : "残り営業日はドリンク追加とフード提案で客単価を上げることを優先してください。";
  }

  if (comparison?.achievedDays && comparison?.underTargetDays) {
    return phase.endedMonth
      ? "次月のイベント設計では、月内の達成日のイベント構成を「売上TOP5」で基準にしてください。"
      : "残り営業日は月内の達成日と同じ集客・単価パターンを意識してください。「売上TOP5」で達成日を確認してください。";
  }

  return phase.endedMonth
    ? "次月は未達日の分類結果を起点に、集客設計と来店後の注文導線のどちらを優先するか決めてください。"
    : "残り営業日は未達日の分類結果を起点に、集客設計と来店後の注文導線のどちらを優先するか決めてください。";
}
function buildVenueUnitPriceMonthlyComment_(ctx) {
  const a = ctx.analysis;
  const venueSum = Number(a.venueFeeSum || 0);
  const total = Number(a.totalSalesSum || 0);
  if (venueSum <= 0 || total <= 0 || venueSum / total < 0.06) return null;

  const customerUnit = a.customerUnitPrice;
  const foodUnit = a.foodDrinkUnitPrice;

  if (customerUnit != null && foodUnit != null && customerUnit > foodUnit * 1.05) {
    return "客単価は高く見えますが、会場費の影響があります。飲食単価とドリンク・フード売上を確認してください。";
  }
  if (foodUnit != null) {
    return "飲食単価が維持できているため、来店後の売上化は大きく崩れていません。";
  }
  return null;
}
function buildMonthlyImprovementComments_(analysis, taxMode, targetMonth, currentBusinessDate, yearlyMonthData) {
  const ctx = buildAdviceContext_(analysis, taxMode, targetMonth, currentBusinessDate, yearlyMonthData);
  if (ctx.phase.futureMonth) {
    return ["この月はまだ実績が少ないため、月次分析コメントは実績反映後に表示します。"];
  }

  const used = { customer: false, unit: false, bar: false, targetHigh: false, customerAction: false };
  const conclusion = buildMonthlyConclusionComment_(ctx);
  const comparison = buildMonthlyComparisonComment_(ctx);
  const causeOrSuccess = buildCauseOrSuccessComment_(ctx, used);
  const customerAction = buildCustomerAcquisitionActionComment_(ctx, used);
  const action = customerAction || buildMonthlyActionComment_(ctx, used);
  const breakEvenComment = buildBreakEvenMonthlyComment_(ctx);
  const fixedCostComment = buildFixedCostAdjustedMonthlyComment_(ctx);
  const venueUnitComment = buildVenueUnitPriceMonthlyComment_(ctx);

  return [conclusion, breakEvenComment, fixedCostComment, venueUnitComment, comparison, causeOrSuccess, action].filter(Boolean).slice(0, 4);
}
function classifyUnderTargetDay_(ctx) {
  const customerCount = ctx.customerCount != null ? Number(ctx.customerCount) : null;
  const dayUnitPrice = ctx.dayUnitPrice != null ? Number(ctx.dayUnitPrice) : null;
  const totalSales = Number(ctx.totalSales || 0);
  const achievementRate = ctx.achievementRate;
  const avgDailyCustomerCount = ctx.avgDailyCustomerCount != null ? Number(ctx.avgDailyCustomerCount) : null;
  const avgUnitPrice = ctx.avgUnitPrice != null ? Number(ctx.avgUnitPrice) : null;
  const avgDailySales = ctx.avgDailySales != null ? Number(ctx.avgDailySales) : null;

  if (
    customerCount == null ||
    !Number.isFinite(customerCount) ||
    dayUnitPrice == null ||
    !Number.isFinite(dayUnitPrice) ||
    avgDailyCustomerCount == null ||
    !(avgDailyCustomerCount > 0) ||
    avgUnitPrice == null ||
    !(avgUnitPrice > 0)
  ) {
    return {
      category: "判定不可",
      comment: "集客人数または客単価のデータが不足しているため、分類の根拠が不足しています。",
    };
  }

  const countLow = customerCount < avgDailyCustomerCount * 0.85;
  const countOk = customerCount >= avgDailyCustomerCount * 0.85;
  const unitLow = dayUnitPrice < avgUnitPrice * 0.9;
  const unitOk = dayUnitPrice >= avgUnitPrice * 0.9;

  if (
    achievementRate != null &&
    achievementRate >= 70 &&
    avgDailySales != null &&
    avgDailySales > 0 &&
    totalSales >= avgDailySales * 0.85
  ) {
    return {
      category: "目標過大の可能性",
      comment: "売上は月平均に近い一方で目標に届いていません。イベント規模に対して目標設定が高かった可能性があります。",
    };
  }
  if (countLow && unitLow) {
    return {
      category: "集客・単価不足型",
      comment: "集客人数と客単価の両方が月平均を下回っています。イベント告知と来店後の注文導線を両方見直す必要があります。",
    };
  }
  if (countLow && unitOk) {
    return {
      category: "集客不足型",
      comment: "集客人数が月平均を下回っています。客単価は大きく崩れていないため、課題は来店前の集客設計です。",
    };
  }
  if (countOk && unitLow) {
    return {
      category: "単価不足型",
      comment: "集客人数は月平均に近い一方で、客単価が低めです。来店後の追加注文、フード提案、ドリンク2杯目の導線を確認してください。",
    };
  }
  return {
    category: "判定不可",
    comment: "分類条件に十分な差が出ていません。根拠数字を確認し、手動で要因を判断してください。",
  };
}
function buildUnderTargetCauseAnalysis_(underTargetRows, averages, resolveName) {
  return [...(underTargetRows || [])]
    .map((r) => {
      const totalSales = Number(r?.metrics?.totalSales || 0);
      const targetSales = Number(r?.metrics?.targetSales || 0);
      const customerCount = pickMetricNullable(r?.metrics, CUSTOMER_COUNT_KEYS);
      const bandFoodDrinkSales = pickMetricNullable(r?.metrics, BAND_FOOD_DRINK_SALES_KEYS);
      const foodDrinkSalesBase = r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : null;
      const foodDrinkSalesIncludingBand = foodDrinkSalesIncludingBand_(foodDrinkSalesBase, bandFoodDrinkSales);
      const dayUnitPrice =
        unitPriceByCustomerCount_(totalSales, customerCount) ??
        (r?.metrics?.customerUnitPrice != null ? Number(r.metrics.customerUnitPrice) : null);
      const achievementRate = calcRate(totalSales, targetSales);
      const shortfall = Math.max(0, targetSales - totalSales);
      const foodDrinkRate = calcRate(foodDrinkSalesIncludingBand, totalSales);
      const classified = classifyUnderTargetDay_({
        customerCount,
        dayUnitPrice,
        totalSales,
        achievementRate,
        avgDailyCustomerCount: averages.avgDailyCustomerCount,
        avgUnitPrice: averages.customerUnitPrice,
        avgDailySales: averages.avgDailySales,
      });
      return {
        key: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}_cause`,
        rowKey: `${r.businessDate}_${r.sourceBlock}_${r.sourceColumn}_${r._idx}`,
        businessDate: r.businessDate,
        eventName: resolveName(r),
        totalSales,
        targetSales,
        shortfall,
        achievementRate,
        customerCount,
        avgDailyCustomerCount: averages.avgDailyCustomerCount,
        dayUnitPrice,
        avgUnitPrice: averages.customerUnitPrice,
        foodDrinkRate,
        avgFoodDrinkRate: averages.avgFoodDrinkRate,
        category: classified.category,
        comment: classified.comment,
      };
    })
    .sort((a, b) => Number(b.shortfall || 0) - Number(a.shortfall || 0))
    .slice(0, 5);
}
function dayMetricLevel_(dayVal, refVal, { lowRatio = 0.85, highRatio = 1.05 } = {}) {
  if (dayVal == null || refVal == null || !(Number(refVal) > 0)) return null;
  const ratio = Number(dayVal) / Number(refVal);
  if (ratio < lowRatio) return "low";
  if (ratio >= highRatio) return "high";
  return "mid";
}
function buildDayDrinkFoodContext_(row, monthly, pastAvg) {
  const totalSales = Number(row.totalSales || 0);
  const customerCount = row.customerCount != null ? Number(row.customerCount) : null;
  const drinkSales = row.drinkSales != null ? Number(row.drinkSales) : null;
  const foodSales = row.foodSales != null ? Number(row.foodSales) : null;
  const monthlyDrink = monthly.avgDrinkSales != null ? Number(monthly.avgDrinkSales) : null;
  const monthlyFood = monthly.avgFoodSales != null ? Number(monthly.avgFoodSales) : null;
  const pastDrink = pastAvg?.drinkSales != null ? Number(pastAvg.drinkSales) : null;
  const pastFood = pastAvg?.foodSales != null ? Number(pastAvg.foodSales) : null;
  const refDrink = pastDrink ?? monthlyDrink;
  const refFood = pastFood ?? monthlyFood;
  const drinkLevel = dayMetricLevel_(drinkSales, refDrink);
  const foodLevel = dayMetricLevel_(foodSales, refFood);
  return {
    drinkSales,
    foodSales,
    drinkRate: calcRate(drinkSales, totalSales),
    foodRate: calcRate(foodSales, totalSales),
    drinkPerCustomer: unitPriceByCustomerCount_(drinkSales, customerCount),
    foodPerCustomer: unitPriceByCustomerCount_(foodSales, customerCount),
    monthlyDrink,
    monthlyFood,
    pastDrink,
    pastFood,
    drinkLevel,
    foodLevel,
    drinkWeak: drinkLevel === "low",
    foodWeak: foodLevel === "low",
    drinkStrong: drinkLevel === "high",
    foodStrong: foodLevel === "high",
    bothWeak: drinkLevel === "low" && foodLevel === "low",
    hasData: drinkSales != null || foodSales != null,
  };
}
function resolveOrderOperationPhase_(businessDate) {
  const dateKey = parseSalesDateKey_(businessDate);
  if (!dateKey) return "before_tablet";
  if (dateKey < TABLET_ORDER_TEST_START_DATE) return "before_tablet";
  if (dateKey < TABLET_ORDER_FULL_START_DATE) return "tablet_test";
  return "tablet_full";
}
function drinkFoodSummaryPhrase_(df, runKind, orderPhase) {
  if (!df?.hasData) return "";
  const phase = orderPhase || "before_tablet";
  let orderHint = "";
  if (phase === "before_tablet") {
    orderHint =
      runKind === "owner"
        ? "メニュー表のおすすめ欄・卓上POP・提供しやすいメニュー構成を見直してください。"
        : "メニュー表のおすすめ欄・卓上POP・スタッフ側で決めたおすすめメニューを見直してください。";
  } else if (phase === "tablet_test") {
    orderHint = "タブレット/QR注文（テスト運用）のおすすめ表示・並び順を見直してください。";
  } else {
    orderHint =
      runKind === "owner"
        ? "タブレット/QRのおすすめ枠を見直してください。"
        : "タブレット/QR注文画面のおすすめ表示を見直してください。";
  }
  if (df.drinkWeak && !df.foodWeak) {
    return `ドリンク売上は弱く、フードは大きく崩れていません。${orderHint}`;
  }
  if (!df.drinkWeak && df.foodWeak) {
    return `フード売上は弱く、ドリンクは大きく崩れていません。${orderHint}`;
  }
  if (df.bothWeak) {
    if (phase === "before_tablet") {
      return "ドリンク・フードともに弱く、メニュー構成・提供スピード・卓上POPで選びやすくなっているか確認してください。";
    }
    if (phase === "tablet_test") {
      return "ドリンク・フードともに弱く、テスト運用中の注文画面で選びやすい表示になっているか確認してください。";
    }
    return "ドリンク・フードともに弱く、注文画面で選びやすい表示になっているか確認してください。";
  }
  if (df.drinkStrong && df.foodStrong) {
    if (phase === "before_tablet") {
      return "ドリンク・フードともに取れています。同じメニュー表のおすすめ欄・卓上POPを次回も再現してください。";
    }
    if (phase === "tablet_test") {
      return "ドリンク・フードともに取れています。テスト運用中のおすすめ表示を次回も再現してください。";
    }
    return "ドリンク・フードともに取れています。同じおすすめ枠を次回も再現してください。";
  }
  return "";
}
function isCharterDay_(row, events) {
  const names = [row?.eventName, row?.sheetEventName].filter(Boolean).join(" ");
  if (/貸切|貸し切り/.test(names)) return true;
  const dayEvents = eventsForDate(events, row?.businessDate);
  if (dayEvents.some((ev) => isRentalLikeEvent(ev))) return true;
  for (const ev of dayEvents) {
    const type = String(ev?.type || ev?.category || ev?.status || "").trim();
    if (/貸切|貸し切り/.test(type)) return true;
  }
  return false;
}
function isCharterComparableRow_(row) {
  const names = `${row?.eventName || ""} ${row?.sheetEventName || ""}`;
  return /貸切|貸し切り/.test(names);
}
function resolveDayEventRunKind_(row, events) {
  if (isCharterDay_(row, events)) return "charter";
  const series = resolveEventSeries_({
    sheetEventName: row?.eventName,
    eventName: row?.eventName,
    eventPerformContentFull: row?.eventPerformContentFull,
    performContentFull: row?.eventPerformContentFull,
  });
  if (series?.id && OWNER_RUN_SERIES_IDS.has(series.id)) return "owner";
  if (series?.id) return "booking";
  const nameText = buildEventSeriesNameText_({
    sheetEventName: row?.eventName,
    eventName: row?.eventName,
  });
  const ownerHint = resolveEventSeriesMatchesInText_(nameText, { performOnly: false }).some((r) =>
    OWNER_RUN_SERIES_IDS.has(r.id)
  );
  if (ownerHint) return "owner";
  return "booking";
}
function drinkOrderAdvice_(runKind, variant, orderPhase) {
  const phase = orderPhase || "before_tablet";
  const ownerMc =
    runKind === "owner" ? " 店主催で進行を握れる場合は、終演前の一言案内も使えます。" : "";
  if (phase === "before_tablet") {
    if (variant === "weak") {
      return `メニュー表のおすすめ欄と卓上POPで、2杯目向けドリンク・高粗利ドリンク・終演後に頼みやすいドリンクを見せてください。スタッフ側でおすすめを事前に決めておくと再現しやすいです。${ownerMc}`;
    }
    if (variant === "strong") {
      return "ドリンク売上が取れています。メニュー表のおすすめ欄・卓上POPの構成が効いている可能性があるため、次回も同じ並びを再現してください。";
    }
    return "メニュー表のおすすめ欄・卓上POPでドリンクの見せ方を確認してください。";
  }
  if (phase === "tablet_test") {
    if (variant === "weak") {
      return `タブレット/QR注文（テスト運用）の画面で、2杯目向けドリンク・高粗利ドリンク・終演後に頼みやすいカテゴリが選ばれているか確認してください。${ownerMc}`;
    }
    if (variant === "strong") {
      return "ドリンク売上が取れています。テスト運用中のおすすめ表示の並びが効いている可能性があるため、次回も同じ構成を再現してください。";
    }
    return "タブレット/QR注文（テスト運用）のドリンクおすすめ表示を確認してください。";
  }
  const tablet =
    "タブレット/QR注文画面の上位に、2杯目向けドリンク・高粗利ドリンク・終演後に頼みやすいカテゴリを出してください。";
  const ownerExtra =
    runKind === "owner"
      ? " 店側で進行を握れる場合は、終演後おすすめ表示と合わせてMCの一言も使えます。"
      : "";
  if (variant === "weak") return tablet + ownerExtra;
  if (variant === "strong") {
    return "ドリンク売上が取れています。人気ドリンク・高粗利ドリンクをおすすめ枠に置いた表示が効いている可能性があるため、次回も同じ並びを再現してください。";
  }
  return tablet;
}
function foodOrderAdvice_(runKind, variant, orderPhase) {
  const phase = orderPhase || "before_tablet";
  if (phase === "before_tablet") {
    if (variant === "weak") {
      return "開演前に出しやすい軽食と、終演後につまめるメニューをメニュー表のおすすめ欄・卓上POPで見せてください。提供が早いメニューを優先してください。";
    }
    if (variant === "strong") {
      return "フードが取れています。メニュー表のおすすめ欄・卓上POPの2品構成が客層に合っていた可能性があるため、次回も同じ並びを再現してください。";
    }
    return "メニュー表のおすすめ欄・卓上POPでフードの見せ方を確認してください。";
  }
  if (phase === "tablet_test") {
    if (variant === "weak") {
      return "タブレット/QR注文（テスト運用）の画面で、開演前の軽食・終演後につまみやすいメニューが選ばれているか確認してください。提供が早いメニューを優先表示してください。";
    }
    if (variant === "strong") {
      return "フードが取れています。テスト運用中のおすすめ表示のメニュー構成が効いている可能性があるため、次回も同じ2品を再現してください。";
    }
    return "タブレット/QR注文（テスト運用）のフードおすすめ表示を確認してください。";
  }
  const tablet =
    "開演前に出しやすい軽食と、終演後につまみやすいメニューをタブレット/QRのおすすめ枠の上位に出してください。提供が早いメニューを優先表示すると選ばれやすくなります。";
  if (variant === "weak") return tablet;
  if (variant === "strong") {
    return "フードが取れています。おすすめ枠のメニュー構成が客層に合っていた可能性があるため、次回も同じ2品を上位表示してください。";
  }
  return tablet;
}
function buildBarTimeJudgment_(ctx) {
  const { barTimeCount, dayBarRate, avgBarRate, isAchieved, pastCustomerDiff, barLow, runKind, orderPhase } = ctx;
  const phase = orderPhase || "before_tablet";
  const gatheringWeak = pastCustomerDiff != null && pastCustomerDiff < -1;
  const barHigh = dayBarRate != null && avgBarRate != null && dayBarRate >= Math.max(12, avgBarRate * 1.15);
  const ownerMcNote =
    runKind === "owner"
      ? " 店主催で進行を握れる場合のみ、終演前の一言案内と連動させてもよいです。"
      : "";

  let afterShowAdvice = "";
  let afterShowSnippet = "";
  if (phase === "before_tablet") {
    afterShowAdvice =
      "終演後に残りやすい雰囲気（BGM・照明）と、メニュー表・卓上POPで終演後につまめるメニュー・追加ドリンクを見せてください。";
    afterShowSnippet =
      "終演後はメニュー表のおすすめ欄と卓上POPで、追加ドリンクと軽いつまみ2品を見せやすくしてください。";
  } else if (phase === "tablet_test") {
    afterShowAdvice =
      "終演後にタブレット/QR注文（テスト運用）で「終演後おすすめ」を出し、追加ドリンク・軽いつまみが実際に選ばれているか確認してください。";
    afterShowSnippet = afterShowAdvice;
  } else {
    afterShowAdvice =
      "終演後にタブレット/QR画面で「終演後おすすめ」を出し、追加ドリンク・軽いつまみ・カラオケ/ダーツなど残る理由を画面上で見せてください。";
    afterShowSnippet = afterShowAdvice;
  }

  if (barTimeCount === 0) {
    return {
      label: "終演後の注文導線",
      text: `バータイム0名です。${afterShowAdvice}${ownerMcNote}`,
      nextSnippet: afterShowSnippet,
    };
  }
  if (barHigh) {
    const highText =
      phase === "before_tablet"
        ? "バータイム比率が高めです。終演後の雰囲気づくりとメニュー表・卓上POPの構成が効いている可能性があるため、次回も同じ流れを再現してください。"
        : phase === "tablet_test"
          ? "バータイム比率が高めです。テスト運用中の終演後おすすめ表示が効いている可能性があるため、次回も同じ構成を再現してください。"
          : "バータイム比率が高めです。終演後おすすめ表示の内容・並びが効いている可能性があるため、次回も同じ画面構成を再現してください。";
    return { label: "終演後の注文導線", text: highText, nextSnippet: null };
  }
  if (isAchieved && barLow) {
    const lowAchievedSnippet =
      phase === "tablet_full"
        ? "終演後おすすめ枠に追加ドリンクと軽いつまみを2品だけ出してください。"
        : afterShowSnippet;
    return {
      label: "終演後の注文導線",
      text: `目標は達成していますが、終演後の追加注文は少なめです。${afterShowAdvice} 優先度は低めです。`,
      nextSnippet: lowAchievedSnippet,
    };
  }
  if (!isAchieved && barLow && gatheringWeak) {
    const weakGatherText =
      runKind === "booking"
        ? phase === "before_tablet"
          ? "未達で集客も弱い日です。終演後の導線より先に、予約数・目標設定・メニュー表のおすすめ欄を確認してください。"
          : phase === "tablet_test"
            ? "未達で集客も弱い日です。終演後より先に、予約数・目標設定・テスト運用中の来店前おすすめ表示を確認してください。"
            : "未達で集客も弱い日です。終演後の導線より先に、予約数・目標設定・タブレットの来店前おすすめ表示を確認してください。"
        : phase === "before_tablet"
          ? "未達で集客も弱い日です。終演後の雰囲気づくりより、来店前のメニュー表おすすめ欄と固定客向け案内を先に確認してください。"
          : "未達で集客も弱い日です。終演後の表示より、来店前〜開演中のおすすめ表示と予約・告知の確認を先にしてください。";
    return { label: "終演後の注文導線", text: weakGatherText, nextSnippet: null };
  }
  if (barLow && !gatheringWeak) {
    return {
      label: "終演後の注文導線",
      text: `来店人数はある一方、終演後の追加注文が弱い日です。${afterShowAdvice}`,
      nextSnippet: afterShowSnippet,
    };
  }
  if (barLow) {
    return {
      label: "終演後の注文導線",
      text: `バータイム比率が低めです。${afterShowAdvice}`,
      nextSnippet: afterShowSnippet,
    };
  }
  return null;
}
function buildCharterPastComparison_(selected, pool, taxMode, orderPhase) {
  if (!selected) return null;
  const selectedDateKey = parseSalesDateKey_(selected.businessDate);
  const charterPool = (pool || []).filter((row) => isCharterComparableRow_(row));
  const pastMatches = filterPastComparableMatches_(charterPool, selectedDateKey);
  const sampleCount = pastMatches.length;
  const avg = sampleCount > 0 ? averagePastComparableMetrics_(pastMatches) : null;
  const mk = (day, avgVal, fmt) => ({
    past: avgVal != null ? fmt(avgVal) : "—",
    today: day != null ? fmt(day) : "—",
  });
  const fmtYen = (v) => formatDisplayYen(v, taxMode);
  const fmtCount = (v) => `${num(v)}名`;
  const compareCards = [];
  if (avg) {
    if (avg.totalSales != null) {
      compareCards.push({ label: "売上", ...mk(selected.totalSales, avg.totalSales, fmtYen) });
    }
    if (avg.customerCount != null && selected.customerCount != null) {
      compareCards.push({ label: "人数", ...mk(selected.customerCount, avg.customerCount, fmtCount) });
    }
    if (avg.customerUnitPrice != null && selected.customerUnitPrice != null) {
      compareCards.push({ label: "客単価", ...mk(selected.customerUnitPrice, avg.customerUnitPrice, fmtYen) });
    }
    if (avg.drinkSales != null && selected.drinkSales != null) {
      compareCards.push({ label: "ドリンク売上", ...mk(selected.drinkSales, avg.drinkSales, fmtYen) });
    }
    if (avg.foodSales != null && selected.foodSales != null) {
      compareCards.push({ label: "フード売上", ...mk(selected.foodSales, avg.foodSales, fmtYen) });
    }
    if (avg.operatingProfit != null && selected.operatingProfit != null) {
      compareCards.push({ label: "営業利益", ...mk(selected.operatingProfit, avg.operatingProfit, fmtYen) });
    }
  }
  let comment = null;
  if (sampleCount > 0 && avg) {
    const salesDiff = Number(selected.totalSales || 0) - Number(avg.totalSales || 0);
    const countDiff =
      selected.customerCount != null && avg.customerCount != null
        ? Number(selected.customerCount) - Number(avg.customerCount)
        : null;
    if (salesDiff < -10000 && countDiff != null && countDiff < -3) {
      comment = "過去貸切平均より売上・人数ともに低い日です。次回は予約時点の人数見込み・最低保証・飲食プランを先に決めてください。";
    } else if (countDiff != null && countDiff >= 5 && salesDiff < 0) {
      if (orderPhase === "before_tablet") {
        comment =
          "人数は多い一方、売上・単価が弱い日です。事前フードプラン・卓上メニュー・飲み放題有無・提供しやすいメニュー構成を確認してください。";
      } else if (orderPhase === "tablet_test") {
        comment =
          "人数は多い一方、売上・単価が弱い日です。タブレット/QR注文（テスト運用）で追加ドリンク・フードが選ばれているか確認してください。";
      } else {
        comment =
          "人数は多い一方、売上・単価が弱い日です。タブレット/QRのおすすめ枠で追加ドリンク・フードが選ばれているか確認してください。";
      }
    } else if (salesDiff >= 0) {
      comment = "過去貸切平均を上回るか同水準です。人数・客単価・飲食構成を基準値として残してください。";
    } else {
      comment = "過去貸切平均と比べて位置づけを確認してください。人数×想定単価で次回の最低保証を組み立てるのが安全です。";
    }
  } else {
    comment = "過去貸切実績がまだ少ないため、今回の人数・客単価・ドリンク/フード売上・営業利益を基準値として記録してください。";
  }
  return {
    matchTypeLabel: "貸切実績",
    sampleCount,
    matches: pastMatches.slice(0, 3),
    avg,
    comment,
    compareCards,
    statusNote: sampleCount === 0 ? "過去貸切実績：該当なし" : null,
  };
}
function buildCharterDayAnalysis_(row, monthly, taxMode, charterPast, orderPhase) {
  const phase = orderPhase || resolveOrderOperationPhase_(row.businessDate);
  const targetSales = Number(row.targetSales || 0);
  const totalSales = Number(row.totalSales || 0);
  const customerCount = row.customerCount != null ? Number(row.customerCount) : null;
  const dayUnitPrice = row.customerUnitPrice != null ? Number(row.customerUnitPrice) : null;
  const operatingProfit = row.operatingProfit != null ? Number(row.operatingProfit) : null;
  const isAchieved = targetSales > 0 && row.achievementRate != null && row.achievementRate >= 100;
  const pastAvg = charterPast?.avg;
  const pastCount = charterPast?.sampleCount || 0;
  const drinkFood = buildDayDrinkFoodContext_(row, monthly, pastAvg);
  const countPhrase = customerCount != null ? `${num(customerCount)}名` : "—";
  const unitPhrase = dayUnitPrice != null ? formatDisplayYen(dayUnitPrice, taxMode) : "—";

  let businessSummary = "";
  if (isAchieved) {
    if (phase === "before_tablet") {
      businessSummary = `この日は貸切として目標を達成しています。人数${countPhrase}・客単価${unitPhrase}で、貸切時間内の飲食売上が取れています。次回貸切でも人数規模・飲食単価・メニュー構成（事前フードプラン・卓上メニュー）を基準値として残してください。`;
    } else if (phase === "tablet_test") {
      businessSummary = `この日は貸切として目標を達成しています。人数${countPhrase}・客単価${unitPhrase}で飲食売上が取れています。タブレット/QR注文（テスト運用）のおすすめ表示の反応も記録してください。`;
    } else {
      businessSummary = `この日は貸切として目標を達成しています。人数${countPhrase}・客単価${unitPhrase}で、貸切時間内の飲食売上が取れています。次回貸切でも人数規模・飲食単価・注文画面のおすすめ構成を基準値として残してください。`;
    }
  } else if (targetSales > 0) {
    businessSummary = `この日は貸切として目標未達です。人数に対して客単価が低いのか、そもそも人数が足りないのかを分けて確認してください。次回は最低保証金額・人数見込み・飲食プランを予約時点で決めてください。`;
    if (drinkFood.bothWeak) {
      if (phase === "before_tablet") {
        businessSummary +=
          " ドリンク・フードともに弱い場合は、飲み放題か単品注文かを確認し、事前フードプラン・卓上メニューで最低限の飲食売上を作ってください。";
      } else if (phase === "tablet_test") {
        businessSummary +=
          " ドリンク・フードともに弱い場合は、飲み放題か単品注文かを確認し、テスト運用中のおすすめ表示を絞って検証してください。";
      } else {
        businessSummary +=
          " ドリンク・フードともに弱い場合は、飲み放題か単品注文かを確認し、単品ならタブレット/QRのおすすめ枠を絞って表示してください。";
      }
    }
  } else {
    businessSummary =
      "貸切の目標売上が未入力です。次回までに最低保証・人数見込み・想定客単価から目標を作ってください。";
  }

  const judgmentPoints = [];
  if (operatingProfit != null && operatingProfit > 0) {
    judgmentPoints.push({
      label: "利益",
      text: "貸切として営業利益が出ています。同規模の貸切は積極的に受けてよい水準です。",
    });
  } else if (operatingProfit != null && operatingProfit <= 0) {
    judgmentPoints.push({
      label: "利益",
      text: "営業利益が出ていません。仕入れ・経費・最低保証とのバランスを、予約時点で再確認してください。",
    });
  }
  if (pastCount > 0 && pastAvg?.totalSales != null && totalSales >= Number(pastAvg.totalSales) * 1.05) {
    judgmentPoints.push({
      label: "開催判断",
      text: "過去貸切平均を上回る売上です。同規模の貸切は、今回実績を基準に受けてよい水準です。",
    });
  } else if (pastCount > 0 && pastAvg?.totalSales != null && totalSales < Number(pastAvg.totalSales) * 0.85) {
    judgmentPoints.push({
      label: "開催判断",
      text: "過去貸切平均より売上が低い日です。人数見込み・最低保証・飲食プランのいずれかを次回変える必要があります。",
    });
  }
  if (!isAchieved && targetSales > 0) {
    judgmentPoints.push({
      label: "目標設定",
      text: "人数が読めない貸切は、固定目標より人数×想定単価で目標を作る方が安全です。最低保証との差も同時に確認してください。",
    });
  } else if (isAchieved && pastCount > 0) {
    judgmentPoints.push({
      label: "目標設定",
      text: "今回実績を基準に、同規模貸切の最低保証・目標売上を設定できます。",
    });
  }
  const refUnit = pastAvg?.customerUnitPrice ?? monthly.customerUnitPrice;
  if (customerCount != null && dayUnitPrice != null && refUnit != null && dayUnitPrice < Number(refUnit) * 0.9) {
    judgmentPoints.push({
      label: "飲食単価",
      text:
        phase === "before_tablet"
          ? "人数に対して客単価が低い日です。事前フードプラン・軽食セット・卓上メニューで飲食単価を上げてください。"
          : phase === "tablet_test"
            ? "人数に対して客単価が低い日です。事前フードプラン・軽食セットの提案と、テスト運用中のおすすめ表示を確認してください。"
            : "人数に対して客単価が低い日です。事前フードプラン・軽食セットの提案、またはタブレット上位のおすすめ枠で飲食単価を上げてください。",
    });
  }
  if (drinkFood.drinkWeak) {
    judgmentPoints.push({
      label: "ドリンク",
      text:
        phase === "before_tablet"
          ? "ドリンク売上が弱い日です。飲み放題か単品注文かを確認し、単品ならメニュー表・卓上POPで追加ドリンク・ボトルを見せやすくしてください。"
          : phase === "tablet_test"
            ? "ドリンク売上が弱い日です。飲み放題か単品注文かを確認し、単品ならタブレット/QR（テスト運用）で追加ドリンクが選ばれているか確認してください。"
            : "ドリンク売上が弱い日です。飲み放題か単品注文かを確認し、単品ならタブレット/QR画面上部に追加ドリンク・ボトル・ソフトドリンクを表示してください。",
    });
  }
  if (drinkFood.foodWeak) {
    judgmentPoints.push({
      label: "フード",
      text:
        phase === "before_tablet"
          ? "フード売上が弱い日です。当日任せにせず、事前に軽食セットまたは大皿フードを提案し、卓上メニューで出すと安定しやすいです。"
          : phase === "tablet_test"
            ? "フード売上が弱い日です。事前に軽食セットまたは大皿フードを提案し、テスト運用中のおすすめ表示に出しているか確認してください。"
            : "フード売上が弱い日です。当日任せにせず、事前に軽食セットまたは大皿フードを提案し、タブレットのおすすめ枠に出すと安定しやすいです。",
    });
  }

  let nextAction = "次回貸切では、予約時点で人数見込み・最低保証金額・飲食プラン（飲み放題/単品）を確認してください。";
  if (isAchieved && dayUnitPrice != null && (pastAvg?.customerUnitPrice == null || dayUnitPrice >= Number(pastAvg?.customerUnitPrice || 0))) {
    nextAction = `次回貸切では、今回の人数・客単価・飲食構成を基準にしてください。人数60名以上なら、最低保証金額を今回実績に近づけてもよい可能性があります。`;
  } else if (customerCount != null && customerCount >= 50 && drinkFood.foodWeak) {
    nextAction =
      phase === "before_tablet"
        ? "次回貸切では、事前に軽食セットまたは大皿フードを提案してください。人数が多い日は卓上メニューを絞り、提供が早いメニューを優先してください。"
        : phase === "tablet_test"
          ? "次回貸切では、事前に軽食セットまたは大皿フードを提案してください。人数が多い日はテスト運用中のおすすめを絞り、提供が早いメニューが選ばれているか確認してください。"
          : "次回貸切では、事前に軽食セットまたは大皿フードを提案してください。人数が多い日はタブレット画面のおすすめを絞り、提供が早いメニューを上位に出してください。";
  } else if (drinkFood.drinkWeak) {
    nextAction =
      phase === "before_tablet"
        ? "次回貸切では、飲み放題の有無を確認し、単品注文ならメニュー表・卓上POPで追加ドリンク・ボトルを見せやすくしてください。"
        : phase === "tablet_test"
          ? "次回貸切では、飲み放題の有無を確認し、単品注文ならタブレット/QR（テスト運用）で追加ドリンクが選ばれているか確認してください。"
          : "次回貸切では、飲み放題の有無を確認し、単品注文ならタブレット/QR画面上部に追加ドリンク・ボトル・ソフトドリンクを表示してください。";
  } else if (!isAchieved) {
    nextAction =
      "次回貸切では、予約時点で人数見込み・最低保証・飲食プランを決めてください。人数が読めない場合は、人数×想定単価で目標を作り、固定の高い目標は避けてください。";
  }

  const referenceMetrics = [
    {
      label: "人数",
      day: customerCount != null ? `${num(customerCount)}名` : "—",
      ref:
        pastAvg?.customerCount != null
          ? `${num(Math.round(pastAvg.customerCount))}名`
          : monthly.avgDailyCustomerCount != null
            ? `${num(Math.round(monthly.avgDailyCustomerCount))}名`
            : "—",
      refLabel: pastAvg?.customerCount != null ? "過去貸切平均" : "月平均",
    },
    {
      label: "客単価",
      day: dayUnitPrice != null ? formatDisplayYen(dayUnitPrice, taxMode) : "—",
      ref:
        pastAvg?.customerUnitPrice != null
          ? formatDisplayYen(pastAvg.customerUnitPrice, taxMode)
          : monthly.customerUnitPrice != null
            ? formatDisplayYen(monthly.customerUnitPrice, taxMode)
            : "—",
      refLabel: pastAvg?.customerUnitPrice != null ? "過去貸切平均" : "月平均",
    },
  ];
  if (drinkFood.drinkSales != null) {
    referenceMetrics.push({
      label: "ドリンク売上",
      day: formatDisplayYen(drinkFood.drinkSales, taxMode),
      ref:
        drinkFood.pastDrink != null
          ? formatDisplayYen(drinkFood.pastDrink, taxMode)
          : drinkFood.monthlyDrink != null
            ? formatDisplayYen(drinkFood.monthlyDrink, taxMode)
            : "—",
      refLabel: drinkFood.pastDrink != null ? "過去貸切平均" : "月平均",
    });
  }
  if (drinkFood.foodSales != null) {
    referenceMetrics.push({
      label: "フード売上",
      day: formatDisplayYen(drinkFood.foodSales, taxMode),
      ref:
        drinkFood.pastFood != null
          ? formatDisplayYen(drinkFood.pastFood, taxMode)
          : drinkFood.monthlyFood != null
            ? formatDisplayYen(drinkFood.monthlyFood, taxMode)
            : "—",
      refLabel: drinkFood.pastFood != null ? "過去貸切平均" : "月平均",
    });
  }
  if (operatingProfit != null) {
    referenceMetrics.push({
      label: "営業利益",
      day: formatDisplayYen(operatingProfit, taxMode),
      ref:
        pastAvg?.operatingProfit != null ? formatDisplayYen(pastAvg.operatingProfit, taxMode) : "—",
      refLabel: "過去貸切平均",
    });
  }

  return {
    isCharterDay: true,
    analysisMode: "charter",
    businessSummary,
    seriesComparisonComment: charterPast?.comment,
    judgmentPoints: judgmentPoints.slice(0, 5),
    nextAction,
    referenceMetrics,
    seriesCompareCards: charterPast?.compareCards || [],
    pastSimilarComparison: {
      matchTypeLabel: "貸切実績",
      sampleCount: pastCount,
      matches: charterPast?.matches || [],
      avg: pastAvg,
      comment: charterPast?.comment,
      statusNote: charterPast?.statusNote,
    },
    charterPastComparison: charterPast,
    isAchieved,
    seriesLabel: "貸切",
    eventRunKind: "charter",
    orderOperationPhase: phase,
  };
}
function resolveDayAchievementTier_(achievementRate) {
  const rate = achievementRate != null ? Number(achievementRate) : null;
  if (rate == null || !Number.isFinite(rate)) return "unknown";
  if (rate >= 120) return "strongSuccess";
  if (rate >= 100) return "achieved";
  return "underTarget";
}
function pastCustomerCompareLevel_(customerCount, pastCustomerCount) {
  if (
    customerCount == null ||
    pastCustomerCount == null ||
    !Number.isFinite(Number(pastCustomerCount)) ||
    Number(pastCustomerCount) <= 0
  ) {
    return "unknown";
  }
  const ratio = (Number(customerCount) - Number(pastCustomerCount)) / Number(pastCustomerCount);
  if (Math.abs(ratio) <= 0.1) return "near";
  if (ratio < -0.1) return "low";
  return "high";
}
function orderDisplayLabelForDayAnalysis_(orderPhase) {
  if (orderPhase === "before_tablet") return "メニュー表・卓上POP";
  if (orderPhase === "tablet_test") return "テスト運用中の注文表示";
  return "注文画面のおすすめ表示";
}
function buildStrongSuccessBusinessSummary_(opts) {
  const { phaseLead, orderPhase, pastCustomerLevel, pastUnitDiff, pastSalesDiff, pastCount, dfPhrase } = opts;
  const displayLabel = orderDisplayLabelForDayAnalysis_(orderPhase);
  let customerPart = "集客はほぼ同水準";
  if (pastCustomerLevel === "high") customerPart = "集客は過去同イベントより高め";
  else if (pastCustomerLevel === "low") customerPart = "来場人数は過去同イベントより少なめだが、客単価で十分補えており";
  else if (pastCustomerLevel === "unknown") customerPart = "集客データは限定的ですが";

  let driverPart = "客単価が高く、売上を押し上げています";
  if (pastUnitDiff != null && pastUnitDiff < 100 && pastSalesDiff != null && pastSalesDiff > 0) {
    driverPart = "売上全体が過去実績を上回っています";
  }

  let text = `${phaseLead}この日は目標を大きく達成しています。`;
  if (pastCount > 0) {
    text += `過去同イベントと比べて${customerPart}、${driverPart}。次回は集客改善よりも、ドリンク・フード構成、${displayLabel}、客層との相性など、客単価を上げた要因を記録してください。`;
    if (pastCount === 1) {
      text += " 過去比較は参考値ですが、今回の達成率と客単価は好材料です。次回も同じ項目を記録し、再現性を確認してください。";
    }
  } else {
    text += " 過去同系実績はまだありませんが、今回の達成率と客単価は好材料です。次回も同じ項目を記録し、再現性を確認してください。";
  }
  if (dfPhrase) text += ` ${dfPhrase}`;
  return text;
}
function buildStrongSuccessSeriesComment_(seriesLabel, pastCustomerLevel, unitDiff, salesDiff, pastSampleCount, dfPhrase) {
  const pastOneTail =
    pastSampleCount === 1 ? " 過去比較はまだ1件のみのため、次回も同じ項目を残して判断材料を増やしてください。" : "";
  if (pastCustomerLevel === "low" && unitDiff != null && unitDiff >= -100) {
    return `来場人数は${seriesLabel}より少なめですが、客単価で十分補えて大きく達成しています。次回も客単価を作った要因（ドリンク・フード構成、おすすめ表示、客層との相性）の記録を優先してください。${pastOneTail}${dfPhrase}`;
  }
  if ((pastCustomerLevel === "near" || pastCustomerLevel === "unknown") && unitDiff != null && unitDiff >= 100) {
    return `${seriesLabel}と比べて集客はほぼ同水準です。売上増は客単価上昇が主因です。次回は集客対策より、今回の客単価を作った要因を記録してください。${pastOneTail}${dfPhrase}`;
  }
  if (salesDiff >= 0 && unitDiff != null && unitDiff >= 0) {
    return `${seriesLabel}平均より売上・客単価が高めです。今回うまくいった構成をメモし、次回の基準にしてください。${pastOneTail}${dfPhrase}`;
  }
  return `目標を大きく達成しています。${seriesLabel}との差分より、今回の成功要因（客単価・ドリンク・フード構成）を記録し、次回に再現できるか確認してください。${pastOneTail}${dfPhrase}`;
}
function buildSeriesComparisonComment_(seriesLabel, pastAvg, metrics, drinkFood, runKind, orderPhase, pastSampleCount) {
  if (!pastAvg || !seriesLabel) return null;
  const phase = orderPhase || "before_tablet";
  const { totalSales, customerCount, dayUnitPrice, targetSales, isAchieved, achievementRate } = metrics;
  const achievementTier = resolveDayAchievementTier_(achievementRate);
  const pastCustomerLevel = pastCustomerCompareLevel_(customerCount, pastAvg.customerCount);
  const salesDiff = Number(totalSales || 0) - Number(pastAvg.totalSales || 0);
  const unitDiff =
    dayUnitPrice != null && pastAvg.customerUnitPrice != null
      ? Number(dayUnitPrice) - Number(pastAvg.customerUnitPrice)
      : null;
  const nearPastAvg = Math.abs(salesDiff) <= Math.max(10000, Number(pastAvg.totalSales || 0) * 0.1);
  const dfPhrase = drinkFoodSummaryPhrase_(drinkFood, runKind, phase);
  let bookingGather = "";
  if (runKind === "booking") {
    if (phase === "before_tablet") {
      bookingGather =
        "通常ブッキングでは、メニュー表のおすすめ欄・卓上POP・予約・目標設定を中心に見てください。";
    } else if (phase === "tablet_test") {
      bookingGather =
        "通常ブッキングでは、タブレット/QR注文（テスト運用）のおすすめ表示と予約・目標設定を中心に見てください。";
    } else {
      bookingGather =
        "通常ブッキングでは、出演者へのMC依頼より、タブレット/QRのおすすめ表示と予約・目標設定を中心に見てください。";
    }
  }

  if (achievementTier === "strongSuccess") {
    return buildStrongSuccessSeriesComment_(seriesLabel, pastCustomerLevel, unitDiff, salesDiff, pastSampleCount, dfPhrase);
  }
  if (achievementTier === "achieved") {
    if (pastCustomerLevel === "low" && unitDiff != null && unitDiff >= -100) {
      return `集客は${seriesLabel}より低めですが、客単価で目標は達成しています。大きな上振れではないため、成功要因の記録と次回の伸ばしどころ（集客・客単価）を決めてください。${dfPhrase}`;
    }
    return `この日は目標を達成しています。大きな上振れではないため、成功要因を確認しつつ、次回は集客・客単価のどちらを伸ばすかを決めてください。${dfPhrase}`;
  }

  if (salesDiff < -10000 && pastCustomerLevel === "low") {
    return `${seriesLabel}平均より売上・集客ともに低い日です。${runKind === "booking" ? "再開催するなら、出演者への告知協力の事前共有と、店側の予約導線・目標設定を確認してください。" : "再開催するなら、固定客向けの次回案内とイベント専用おすすめ表示を確認してください。"}${dfPhrase}`;
  }
  if (pastCustomerLevel === "low" && unitDiff != null && unitDiff >= -100) {
    const unitOkFollow =
      phase === "before_tablet"
        ? "来店後のメニュー表・卓上POPの見せ方は機能している可能性があるため、"
        : phase === "tablet_test"
          ? "来店後の注文画面（テスト運用）のおすすめ表示は機能している可能性があるため、"
          : "来店後の注文画面設計は機能している可能性があるため、";
    return `集客は低めですが客単価は取れています。${unitOkFollow}次回は${runKind === "booking" ? "出演者への告知協力と1週間前の予約数確認" : "固定客向け案内とイベント専用おすすめ表示"}を優先してください。${dfPhrase}`;
  }
  if (pastCustomerLevel !== "low" && unitDiff != null && unitDiff < -100) {
    return `集客は取れていますが客単価が弱い日です。${drinkOrderAdvice_(runKind, "weak", phase)} ${foodOrderAdvice_(runKind, "weak", phase)}`;
  }
  if (nearPastAvg && !isAchieved && Number(targetSales || 0) > 0) {
    return `売上は${seriesLabel}平均に近いため、イベント内容だけが原因とは言い切れません。次回目標は過去平均売上＋10〜15%程度から設定してください。${bookingGather}`;
  }
  if (salesDiff >= 0 && unitDiff != null && unitDiff >= 0) {
    const successTail =
      phase === "before_tablet"
        ? "メニュー表のおすすめ欄・卓上POP・予約導線など、今回うまくいった店側の設計をメモして次回の基準にしてください。"
        : phase === "tablet_test"
          ? "タブレット/QR（テスト運用）のおすすめ表示・予約導線など、今回うまくいった店側の設計をメモして次回の基準にしてください。"
          : "タブレット/QRのおすすめ枠・予約導線など、今回うまくいった店側の設計をメモして次回の基準にしてください。";
    return `${seriesLabel}平均より売上・客単価が高めです。${successTail}`;
  }
  const closingTail =
    phase === "before_tablet"
      ? "次回までにメニュー表のおすすめ欄・卓上POPと目標設定を決めてください。"
      : phase === "tablet_test"
        ? "次回までにタブレット/QR（テスト運用）のおすすめ表示と目標設定を決めてください。"
        : "次回までにタブレット/QRのおすすめ枠と目標設定を決めてください。";
  return `${seriesLabel}平均と今回の差を確認し、${closingTail}${dfPhrase}`;
}
function buildSelectedDayAnalysis_(row, monthly, taxMode, pastSimilarComparison, analysisOptions = {}) {
  if (!row) return null;
  const events = analysisOptions.events || [];
  const pastComparablePool = analysisOptions.pastComparablePool || [];
  const orderPhase = resolveOrderOperationPhase_(row.businessDate);
  if (isCharterDay_(row, events)) {
    const charterPast = buildCharterPastComparison_(row, pastComparablePool, taxMode, orderPhase);
    return buildCharterDayAnalysis_(row, monthly, taxMode, charterPast, orderPhase);
  }
  const runKind = resolveDayEventRunKind_(row, events);
  const targetSales = Number(row.targetSales || 0);
  const totalSales = Number(row.totalSales || 0);
  const achievementRate = row.achievementRate;
  const customerCount = row.customerCount != null ? Number(row.customerCount) : null;
  const dayUnitPrice = row.customerUnitPrice != null ? Number(row.customerUnitPrice) : null;
  const avgCount = monthly.avgDailyCustomerCount != null ? Number(monthly.avgDailyCustomerCount) : null;
  const avgUnit = monthly.customerUnitPrice != null ? Number(monthly.customerUnitPrice) : null;
  const dayFoodRate = calcRate(row.foodDrinkSalesIncludingBand, totalSales);
  const avgFoodRate = monthly.avgFoodDrinkRate;
  const dayBarRate = row.barTimeCustomerRate;
  const avgBarRate = monthly.barTimeCustomerRate;
  const barTimeCount = row.barTimeCustomerCount != null ? Number(row.barTimeCustomerCount) : null;
  const isAchieved = targetSales > 0 && achievementRate != null && achievementRate >= 100;
  const achievementTier = resolveDayAchievementTier_(achievementRate);
  const unitLow = dayUnitPrice != null && avgUnit != null && avgUnit > 0 && dayUnitPrice < avgUnit * 0.9;
  const barLow =
    dayBarRate != null &&
    (barTimeCount === 0 || (avgBarRate != null && dayBarRate < Math.max(5, avgBarRate * 0.7)));
  const seriesLabel =
    pastSimilarComparison?.matchKind === "exactName"
      ? "同じイベント名"
      : pastSimilarComparison?.matchKind === "series"
        ? pastSimilarComparison.matchTypeLabel
        : resolveEventSeries_({
            sheetEventName: row.eventName,
            eventName: row.eventName,
            eventPerformContentFull: row.eventPerformContentFull,
            performContentFull: row.eventPerformContentFull,
          })?.label || "同系イベント";
  const pastAvg = pastSimilarComparison?.avg;
  const pastCount = pastSimilarComparison?.sampleCount || 0;
  const pastCustomerDiff =
    pastAvg?.customerCount != null && customerCount != null
      ? customerCount - Number(pastAvg.customerCount)
      : null;
  const pastUnitDiff =
    pastAvg?.customerUnitPrice != null && dayUnitPrice != null
      ? dayUnitPrice - Number(pastAvg.customerUnitPrice)
      : null;
  const pastSalesDiff =
    pastAvg?.totalSales != null ? totalSales - Number(pastAvg.totalSales) : null;
  const pastCustomerLevel = pastCustomerCompareLevel_(customerCount, pastAvg?.customerCount);
  const nearPastAvg =
    pastSalesDiff != null && Math.abs(pastSalesDiff) <= Math.max(10000, Number(pastAvg?.totalSales || 0) * 0.1);
  const drinkFood = buildDayDrinkFoodContext_(row, monthly, pastAvg);
  const dfPhrase = drinkFoodSummaryPhrase_(drinkFood, runKind, orderPhase);
  const metricCtx = { totalSales, customerCount, dayUnitPrice, targetSales, isAchieved, achievementRate };
  const seriesComparisonComment =
    pastCount > 0
      ? buildSeriesComparisonComment_(seriesLabel, pastAvg, metricCtx, drinkFood, runKind, orderPhase, pastCount)
      : null;
  const barJudgment = buildBarTimeJudgment_({
    barTimeCount,
    dayBarRate,
    avgBarRate,
    isAchieved,
    pastCustomerDiff,
    barLow,
    runKind,
    orderPhase,
  });
  const phaseLead =
    orderPhase === "before_tablet"
      ? "タブレット/QR注文導入前の営業日のため、"
      : orderPhase === "tablet_test"
        ? "タブレット/QR注文のテスト運用期間のため、"
        : "";
  const salesWellBelowPast =
    pastCount > 0 &&
    pastSalesDiff != null &&
    pastSalesDiff < -Math.max(15000, Number(pastAvg?.totalSales || 0) * 0.15);
  const gatheringWeak =
    achievementTier === "underTarget" &&
    (pastCustomerLevel === "low" || (pastCustomerDiff != null && pastCustomerDiff < -1 && pastCustomerLevel === "unknown"));
  const unitOkWithPast = pastUnitDiff != null && pastUnitDiff >= -100;
  const unitWeakWithPast = pastUnitDiff != null && pastUnitDiff < -100;
  const gatheringOkWithPast = pastCustomerLevel !== "low";

  let businessSummary = "";
  if (pastCount > 0) {
    if (achievementTier === "strongSuccess") {
      businessSummary = buildStrongSuccessBusinessSummary_({
        phaseLead,
        orderPhase,
        pastCustomerLevel,
        pastUnitDiff,
        pastSalesDiff,
        pastCount,
        dfPhrase,
      });
    } else if (achievementTier === "achieved") {
      businessSummary = `${phaseLead}この日は目標を達成しています。大きな上振れではないため、成功要因を確認しつつ、次回は集客・客単価のどちらを伸ばすかを決めてください。`;
      if (dfPhrase) businessSummary += ` ${dfPhrase}`;
    } else if (salesWellBelowPast && gatheringWeak) {
      businessSummary = `${phaseLead}同系平均より売上・集客ともに低い日です。${runKind === "booking" ? "再開催するなら、出演者への告知協力の事前共有と、店側の予約導線・目標設定を確認してください。" : "再開催するなら、固定客向け案内とイベント専用おすすめ表示を見直してください。"}${dfPhrase}`;
    } else if (gatheringWeak && unitOkWithPast) {
      businessSummary =
        runKind === "booking"
          ? `${phaseLead}目標未達ですが、来店後の飲食売上は取れています。次回は値上げより、出演者への告知協力と1週間前の予約数確認を先に行い、${orderPhase === "before_tablet" ? "メニュー表のおすすめ欄も維持してください。" : orderPhase === "tablet_test" ? "テスト運用中のおすすめ表示も維持してください。" : "タブレット/QRのおすすめ枠も維持してください。"}`
          : `${phaseLead}目標未達ですが、来店後の飲食売上は取れています。次回は固定客向け案内とイベント専用おすすめ表示を先に見直してください。`;
      if (drinkFood.drinkWeak && !drinkFood.foodWeak) {
        businessSummary += ` ${drinkOrderAdvice_(runKind, "weak", orderPhase)}`;
      } else if (!drinkFood.drinkWeak && drinkFood.foodWeak) {
        businessSummary += ` ${foodOrderAdvice_(runKind, "weak", orderPhase)}`;
      }
    } else if (gatheringOkWithPast && unitWeakWithPast) {
      businessSummary = `${phaseLead}集客は取れていますが客単価が弱い日です。${drinkOrderAdvice_(runKind, "weak", orderPhase)}`;
    } else if (nearPastAvg && targetSales > 0) {
      businessSummary = `${phaseLead}売上は同系平均に近く、イベント内容だけが原因とは言い切れません。次回目標は過去平均売上＋10〜15%程度から設定してください。`;
    } else {
      const fallbackTail =
        orderPhase === "before_tablet"
          ? "メニュー表のおすすめ欄・卓上POPと目標設定を次回までに決めておく日です。"
          : orderPhase === "tablet_test"
            ? "テスト運用中のおすすめ表示と目標設定を次回までに決めておく日です。"
            : "タブレット/QRのおすすめ枠と目標設定を次回までに決めておく日です。";
      businessSummary = seriesComparisonComment || `${phaseLead}同系イベントとして、${fallbackTail}${dfPhrase}`;
    }
  } else if (achievementTier === "strongSuccess" || achievementTier === "achieved") {
    businessSummary =
      achievementTier === "strongSuccess"
        ? `${phaseLead}目標を大きく達成しています。過去同系実績がないため比較はできませんが、今回の達成率・客単価・ドリンク売上・フード売上と${orderDisplayLabelForDayAnalysis_(orderPhase)}の構成を記録し、2回目以降の再現性を確認してください。`
        : `${phaseLead}目標は達成しています。過去同系実績がないため比較はできませんが、今回の売上・集客・ドリンク売上・フード売上と${orderDisplayLabelForDayAnalysis_(orderPhase)}の構成を記録し、2回目以降の基準にしてください。`;
  } else if (targetSales > 0) {
    businessSummary = `${phaseLead}過去同系実績がないため同系比較はできません。今回の売上・集客・客単価・ドリンク売上・フード売上を基準値として残し、次回から比較できるようにしてください。`;
  } else {
    businessSummary =
      orderPhase === "before_tablet"
        ? "目標が未入力です。次回までに目標売上と、メニュー表のおすすめ欄・卓上POPの仮決めをしてください。"
        : orderPhase === "tablet_test"
          ? "目標が未入力です。次回までに目標売上と、テスト運用中のおすすめ表示の仮決めをしてください。"
          : "目標が未入力です。次回までに目標売上と、タブレット/QRで出すおすすめ枠の仮決めをしてください。";
  }

  const venueFee = row.venueFee != null ? Number(row.venueFee) : 0;
  const venueFeeRate = totalSales > 0 ? venueFee / totalSales : 0;
  const venueFeeNote =
    venueFee > 0 && venueFeeRate >= 0.08
      ? "この日は会場費売上が含まれているため、客単価だけで飲食の強さを判断しないでください。飲食単価とドリンク・フード売上を分けて確認してください。"
      : "";
  if (venueFeeNote) {
    businessSummary = businessSummary ? `${businessSummary} ${venueFeeNote}` : venueFeeNote;
  }

  const judgmentPoints = [];
  if (achievementTier === "strongSuccess") {
    judgmentPoints.push({
      label: "開催判断",
      text:
        pastCount <= 1
          ? "目標を大きく達成しているため、同系イベントとして継続候補です。過去実績が少ないため、次回も同じ指標を記録してください。"
          : "目標を大きく達成しているため、同系イベントとして継続候補です。",
    });
    if (pastUnitDiff != null && pastUnitDiff >= 100) {
      judgmentPoints.push({
        label: "客単価",
        text:
          pastCustomerLevel === "near" || pastCustomerLevel === "unknown"
            ? "集客は過去同イベントとほぼ同水準ですが、客単価が上がったことで大きく達成しています。次回は集客対策より、客単価を上げた要因を確認してください。"
            : "売上増の主因は客単価です。ドリンク・フードのどちらが伸びたかを確認してください。",
      });
    }
    judgmentPoints.push({
      label: "目標設定",
      text: "次回は今回実績をそのまま基準にするのではなく、過去実績と今回実績の間、または今回実績の8〜9割を目安にしてもよい可能性があります。",
    });
  } else if (achievementTier === "achieved" && pastCount > 0) {
    judgmentPoints.push({
      label: "開催判断",
      text: "目標を達成しています。大きな上振れではないため、成功要因を記録し、次回の伸ばしどころ（集客・客単価）を決めてください。",
    });
  } else if (pastCount > 0 && salesWellBelowPast && gatheringWeak) {
    judgmentPoints.push({
      label: "開催判断",
      text:
        runKind === "booking"
          ? "同系平均より売上・集客ともに大きく低い日です。同条件で再開催するなら、目標を過去平均に近づけるか、出演者への告知協力内容を事前に共有してください。"
          : "同系平均より売上・集客ともに大きく低い日です。固定客向け案内とイベント専用おすすめ表示を見直してください。",
    });
  } else if (pastCount > 0 && gatheringWeak && unitOkWithPast) {
    judgmentPoints.push({
      label: "開催判断",
      text:
        runKind === "booking"
          ? `売上は未達ですが客単価は取れています。${orderPhase === "before_tablet" ? "メニュー表・卓上POPの見せ方は機能している可能性があるため、" : orderPhase === "tablet_test" ? "テスト運用中の注文画面のおすすめ表示は機能している可能性があるため、" : "タブレット/QRの注文画面は機能している可能性があるため、"}告知協力と予約数確認を先に行う価値があります。`
          : "売上は未達ですが客単価は取れています。来店後のおすすめ表示は機能している可能性があるため、固定客向け案内を先に見直す価値があります。",
    });
  } else if (pastCount > 0 && nearPastAvg && achievementTier === "underTarget" && targetSales > 0) {
    judgmentPoints.push({
      label: "開催判断",
      text: "売上は同系平均に近いため、イベント内容より目標設定を先に見直す方が近道です。",
    });
  } else if (pastCount === 0) {
    judgmentPoints.push({
      label: "開催判断",
      text:
        orderPhase === "before_tablet"
          ? "同系比較がまだできないため、今回の数値とメニュー表のおすすめ構成を記録し、2回目以降に開催判断の材料をそろえてください。"
          : "同系比較がまだできないため、今回の数値とおすすめ表示の構成を記録し、2回目以降に開催判断の材料をそろえてください。",
    });
  }
  if (!isAchieved && pastCount > 0 && nearPastAvg && targetSales > 0) {
    judgmentPoints.push({
      label: "目標設定",
      text: "今回の売上が過去平均に近い場合、次回目標は過去平均売上＋10〜15%程度から設定してください。",
    });
  } else if (salesWellBelowPast && targetSales > 0) {
    judgmentPoints.push({
      label: "目標設定",
      text:
        runKind === "booking"
          ? "過去平均より大きく低い場合、目標を据え置くなら、出演者への告知協力内容を事前に決めて共有してください。"
          : orderPhase === "before_tablet"
            ? "過去平均より大きく低い場合、目標を据え置くなら、固定客向け案内とメニュー表のおすすめ欄の見直しを先に行ってください。"
            : "過去平均より大きく低い場合、目標を据え置くなら、固定客向け案内とおすすめ表示の見直しを先に行ってください。",
    });
  }
  if (gatheringWeak) {
    judgmentPoints.push({
      label: "集客",
      text:
        runKind === "booking"
          ? "1週間前に予約数を確認し、足りなければ出演者へ告知協力を依頼してください。店側投稿と出演者投稿用の短い文案（見どころ3行）を用意してください。"
          : "固定客向け投稿に「前回との違い」「今回の見どころ」を入れ、イベント専用おすすめ表示と合わせて来店前の認知を上げてください。",
    });
  } else if (!isAchieved && pastCount === 0) {
    judgmentPoints.push({
      label: "集客",
      text:
        runKind === "booking"
          ? "初回イベントのため、次回は出演者への告知協力内容を事前に決め、1週間前に予約数を確認する運用にしてください。"
          : "初回イベントのため、次回は固定客向け案内とイベント専用おすすめ表示の構成を記録してください。",
    });
  }
  if (venueFeeNote) {
    judgmentPoints.push({
      label: "会場費",
      text: "会場費が総売上の一定割合を占めています。客単価だけではなく飲食単価・ドリンク・フード売上で来店後の実力を確認してください。",
    });
  }
  if (drinkFood.hasData && drinkFood.drinkSales != null) {
    if (drinkFood.drinkWeak && achievementTier === "underTarget") {
      judgmentPoints.push({ label: "ドリンク", text: drinkOrderAdvice_(runKind, "weak", orderPhase) });
    } else if (drinkFood.drinkStrong) {
      judgmentPoints.push({
        label: "ドリンク",
        text:
          achievementTier === "strongSuccess" || achievementTier === "achieved"
            ? "ドリンクが取れています。当日のメニュー構成・おすすめ表示・客層との相性を記録してください。"
            : drinkOrderAdvice_(runKind, "strong", orderPhase),
      });
    }
  }
  if (drinkFood.hasData && drinkFood.foodSales != null) {
    if (drinkFood.foodWeak && achievementTier === "underTarget") {
      judgmentPoints.push({ label: "フード", text: foodOrderAdvice_(runKind, "weak", orderPhase) });
    } else if (drinkFood.foodStrong) {
      judgmentPoints.push({
        label: "フード",
        text:
          achievementTier === "strongSuccess" || achievementTier === "achieved"
            ? "フードが取れています。当日のメニュー構成・おすすめ表示・客層との相性を記録してください。"
            : foodOrderAdvice_(runKind, "strong", orderPhase),
      });
    }
  } else if (unitLow && !drinkFood.foodWeak && achievementTier === "underTarget") {
    judgmentPoints.push({
      label: "ドリンク・フード単価",
      text: `客単価が弱い日です。${drinkOrderAdvice_(runKind, "weak", orderPhase)} ${foodOrderAdvice_(runKind, "weak", orderPhase)}`,
    });
  }
  if (barJudgment) {
    judgmentPoints.push({ label: barJudgment.label, text: barJudgment.text });
  }

  const eventTag = seriesLabel === "同系イベント" ? "同系イベント" : seriesLabel;
  const recordTail =
    orderPhase === "before_tablet"
      ? "メニュー表のおすすめ欄・卓上POPの構成"
      : orderPhase === "tablet_test"
        ? "テスト運用中のおすすめ表示の構成"
        : "タブレット/QRおすすめ枠の構成";
  let nextAction = `次回の${eventTag}では、今回の売上・集客・ドリンク売上・フード売上と${recordTail}を記録し、2回目以降の比較に使えるようにしてください。`;
  const orderDisplayLabel = orderDisplayLabelForDayAnalysis_(orderPhase);
  if (achievementTier === "strongSuccess") {
    nextAction = `次回は、今回の客単価が上がった要因を確認してください。ドリンク・フードの売上内訳、${orderDisplayLabel}の表示順、おすすめメニュー、客層との相性を記録し、同じ構成を再現できるか確認してください。`;
    if (pastCount === 1) {
      nextAction += " 過去比較はまだ1件のみのため、次回も同じ項目を残して判断材料を増やしてください。";
    }
  } else if (achievementTier === "achieved" && pastCount > 0) {
    nextAction = `次回の${eventTag}では、今回の成功要因（集客・客単価・${orderDisplayLabel}）を記録し、大きな上振れを作るにはどちらを伸ばすか決めてください。`;
  } else if (pastCount > 0 && gatheringWeak && unitOkWithPast) {
    nextAction =
      runKind === "booking"
        ? `次回の${eventTag}では、出演者への告知協力を事前に決め、1週間前に予約数を確認してください。足りない場合は店側投稿用と出演者投稿用の短い文案（見どころ3行）を用意してください。`
        : `次回の${eventTag}では、固定客向け案内とイベント専用おすすめ表示を先に決めてください。`;
    if (drinkFood.drinkWeak) {
      nextAction += ` ${drinkOrderAdvice_(runKind, "weak", orderPhase)}`;
    }
    if (drinkFood.foodWeak) {
      nextAction += ` ${foodOrderAdvice_(runKind, "weak", orderPhase)}`;
    }
  } else if (pastCount > 0 && gatheringOkWithPast && unitWeakWithPast) {
    nextAction =
      orderPhase === "before_tablet"
        ? `次回の${eventTag}では、メニュー表のおすすめ欄・卓上POPに2杯目向けドリンク・終演後ドリンク・フード2品を決め、来店後に選びやすい表示にしてください。`
        : orderPhase === "tablet_test"
          ? `次回の${eventTag}では、テスト運用中のおすすめ表示に2杯目向けドリンク・終演後ドリンク・フード2品を出し、実際に選ばれているか確認してください。`
          : `次回の${eventTag}では、タブレット/QRのおすすめ枠に2杯目向けドリンク・終演後ドリンク・フード2品を決め、来店後に自然に選ばれる表示にしてください。`;
  } else if (pastCount > 0 && nearPastAvg && achievementTier === "underTarget" && targetSales > 0) {
    nextAction = `次回の${eventTag}では、過去平均売上＋10〜15%を目標の起点にし、${orderPhase === "before_tablet" ? "メニュー表のおすすめ欄" : "おすすめ表示"}の構成も今回を基準にしてください。`;
  } else if (pastCount > 0 && salesWellBelowPast) {
    const changeWhat =
      runKind === "booking"
        ? "告知協力と目標設定"
        : orderPhase === "before_tablet"
          ? "固定客案内とメニュー表のおすすめ欄"
          : "固定客案内とおすすめ表示";
    nextAction = `次回の${eventTag}を開催するなら、${changeWhat}を変えるか、目標売上を過去平均に近づけてください。同系平均から大きく乖離している日は、同じ条件での再開催は慎重に判断してください。`;
  } else if (pastCount === 0) {
    nextAction = `次回の${eventTag}では、今回の売上・集客・ドリンク売上・フード売上と${recordTail}を記録してください。`;
  }
  if (barJudgment?.nextSnippet) {
    nextAction += ` ${barJudgment.nextSnippet}`;
  }

  const referenceMetrics = [
    { label: "集客", day: customerCount != null ? `${num(customerCount)}名` : "—", ref: avgCount != null ? `${num(Math.round(avgCount * 10) / 10)}名` : "—" },
    { label: "客単価", day: dayUnitPrice != null ? formatDisplayYen(dayUnitPrice, taxMode) : "—", ref: avgUnit != null ? formatDisplayYen(avgUnit, taxMode) : "—" },
    { label: "飲食比率", day: dayFoodRate != null ? pct(dayFoodRate) : "—", ref: avgFoodRate != null ? pct(avgFoodRate) : "—" },
    { label: "バータイム比率", day: dayBarRate != null ? pct(dayBarRate) : "—", ref: avgBarRate != null ? pct(avgBarRate) : "—" },
  ];
  if (drinkFood.drinkSales != null) {
    const drinkRefPast = drinkFood.pastDrink != null;
    referenceMetrics.push({
      label: "ドリンク売上",
      day: formatDisplayYen(drinkFood.drinkSales, taxMode),
      ref: drinkRefPast
        ? formatDisplayYen(drinkFood.pastDrink, taxMode)
        : drinkFood.monthlyDrink != null
          ? formatDisplayYen(drinkFood.monthlyDrink, taxMode)
          : "—",
      refLabel: drinkRefPast ? "同系平均" : "月平均",
    });
  }
  if (drinkFood.foodSales != null) {
    const foodRefPast = drinkFood.pastFood != null;
    referenceMetrics.push({
      label: "フード売上",
      day: formatDisplayYen(drinkFood.foodSales, taxMode),
      ref: foodRefPast
        ? formatDisplayYen(drinkFood.pastFood, taxMode)
        : drinkFood.monthlyFood != null
          ? formatDisplayYen(drinkFood.monthlyFood, taxMode)
          : "—",
      refLabel: foodRefPast ? "同系平均" : "月平均",
    });
  }

  const seriesCompareCards =
    pastCount > 0 && pastSimilarComparison?.comparisons
      ? [
          { label: "売上", past: pastSimilarComparison.comparisons.sales?.avg, pastFmt: (v) => formatDisplayYen(v, taxMode), today: pastSimilarComparison.comparisons.sales?.day, todayFmt: (v) => formatDisplayYen(v, taxMode) },
          { label: "集客", past: pastSimilarComparison.comparisons.customerCount?.avg, pastFmt: (v) => `${num(v)}名`, today: pastSimilarComparison.comparisons.customerCount?.day, todayFmt: (v) => `${num(v)}名` },
          { label: "客単価", past: pastSimilarComparison.comparisons.customerUnitPrice?.avg, pastFmt: (v) => formatDisplayYen(v, taxMode), today: pastSimilarComparison.comparisons.customerUnitPrice?.day, todayFmt: (v) => formatDisplayYen(v, taxMode) },
          { label: "飲食比率", past: pastSimilarComparison.comparisons.foodDrinkRate?.avg, pastFmt: (v) => pct(v), today: pastSimilarComparison.comparisons.foodDrinkRate?.day, todayFmt: (v) => pct(v) },
        ].map((card) => ({
          label: card.label,
          past: card.past != null ? card.pastFmt(card.past) : "—",
          today: card.today != null ? card.todayFmt(card.today) : "—",
        }))
      : [];

  return {
    isCharterDay: false,
    analysisMode: "live",
    businessSummary,
    seriesComparisonComment,
    judgmentPoints: judgmentPoints.slice(0, 5),
    nextAction,
    referenceMetrics,
    seriesCompareCards,
    pastSimilarComparison,
    isAchieved,
    seriesLabel,
    eventRunKind: runKind,
    orderOperationPhase: orderPhase,
  };
}
function DayAnalysisBlock({ analysis, taxMode, narrow, onSelectReferenceDay }) {
  if (!analysis) return null;
  const isCharter = !!analysis.isCharterDay;
  const past = analysis.pastSimilarComparison;
  const referenceChipStyle = {
    display: "inline-block",
    margin: ".12rem .18rem .12rem 0",
    padding: ".14rem .38rem",
    borderRadius: 999,
    border: "1px solid rgba(201,168,76,0.24)",
    background: "rgba(201,168,76,0.08)",
    color: "rgba(240,232,208,0.78)",
    font: "inherit",
    fontSize: ".68rem",
    lineHeight: 1.45,
    cursor: onSelectReferenceDay ? "pointer" : "default",
    textAlign: "left",
    maxWidth: "100%",
    ...DAY_ANALYSIS_TEXT,
  };
  const sectionCardStyle = {
    padding: ".45rem .55rem",
    borderRadius: 5,
    border: "1px solid rgba(201,168,76,0.16)",
    background: "rgba(0,0,0,0.14)",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    overflow: "hidden",
  };
  const grid2Style = {
    display: "grid",
    gridTemplateColumns: narrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: narrow ? ".22rem" : ".18rem .45rem",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  };
  const metricCardStyle = {
    padding: ".32rem .4rem",
    borderRadius: 4,
    border: "1px solid rgba(201,168,76,0.12)",
    background: "rgba(0,0,0,0.1)",
    minWidth: 0,
    ...DAY_ANALYSIS_TEXT,
  };
  return (
    <div style={{ ...DAY_REPORT_BOX, marginBottom: ".55rem" }}>
      <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>
        この日の分析
      </div>

      <div style={{ ...sectionCardStyle, marginBottom: ".38rem", borderColor: "rgba(201,168,76,0.28)", background: "rgba(201,168,76,0.06)" }}>
        <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.88)", marginBottom: ".18rem", fontWeight: 600 }}>
          {isCharter ? "A. 貸切営業サマリー" : "A. 経営判断サマリー"}
        </div>
        <div style={{ fontSize: narrow ? ".84rem" : ".8rem", lineHeight: 1.65, color: "rgba(240,232,208,0.92)", ...DAY_ANALYSIS_TEXT }}>
          {analysis.businessSummary}
        </div>
      </div>

      <div style={{ ...sectionCardStyle, marginBottom: ".38rem", borderColor: "rgba(201,168,76,0.22)", background: "rgba(201,168,76,0.04)" }}>
        <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.88)", marginBottom: ".22rem", fontWeight: 600 }}>
          {isCharter ? "B. 貸切実績比較" : "B. 同系イベント比較"}
        </div>
        <div style={{ fontSize: narrow ? ".78rem" : ".76rem", color: "rgba(201,168,76,0.88)", marginBottom: ".18rem", fontWeight: 600, ...DAY_ANALYSIS_TEXT }}>
          比較タイプ：{past?.matchTypeLabel || analysis.seriesLabel || "—"}
          {past?.sampleCount > 0 ? (
            <span style={{ marginLeft: ".35rem", color: "rgba(240,232,208,0.55)", fontWeight: 400 }}>
              （{num(past.sampleCount)}件）
            </span>
          ) : null}
        </div>
        {past?.sampleCount === 0 && past?.statusNote ? (
          <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)", marginBottom: ".22rem", ...DAY_ANALYSIS_TEXT }}>
            {past.statusNote}
          </div>
        ) : null}
        {past?.matchNote ? (
          <div style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.48)", marginBottom: ".18rem", ...DAY_ANALYSIS_TEXT }}>
            {past.matchNote}
          </div>
        ) : null}
        {analysis.seriesCompareCards?.length > 0 ? (
          <div style={{ ...grid2Style, marginBottom: ".28rem" }}>
            {analysis.seriesCompareCards.map((card) => (
              <div key={card.label} style={metricCardStyle}>
                <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.78)", marginBottom: ".1rem" }}>{card.label}</div>
                <div style={{ fontSize: narrow ? ".78rem" : ".74rem", lineHeight: 1.5, color: "rgba(240,232,208,0.84)" }}>
                  {isCharter ? "過去貸切平均" : "過去平均"} {card.past}
                </div>
                <div style={{ fontSize: narrow ? ".78rem" : ".74rem", lineHeight: 1.5, color: "rgba(240,232,208,0.92)", fontWeight: 600 }}>
                  今回 {card.today}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {(analysis.seriesComparisonComment || past?.comment) ? (
          <div style={{ fontSize: narrow ? ".8rem" : ".76rem", lineHeight: 1.6, color: "rgba(240,232,208,0.86)", marginBottom: ".24rem", ...DAY_ANALYSIS_TEXT }}>
            {analysis.seriesComparisonComment || past.comment}
          </div>
        ) : null}
        {past?.matches?.length > 0 ? (
          <div style={{ marginBottom: ".12rem", fontSize: ".7rem", color: "rgba(240,232,208,0.52)", lineHeight: 1.45, ...DAY_ANALYSIS_TEXT }}>
            <div style={{ marginBottom: ".12rem" }}>
              参考実績
              {onSelectReferenceDay ? (
                <span style={{ marginLeft: ".25rem", color: "rgba(240,232,208,0.38)" }}>（クリックで営業レポートを表示）</span>
              ) : null}
              ：
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".08rem", minWidth: 0 }}>
              {past.matches.map((row) => {
                const label = `${(row.businessDate || "").slice(5).replace("-", "/")} ${row.eventName || row.sheetEventName || "—"}`;
                const canSelect = onSelectReferenceDay && (row.rowKey || row.businessDate);
                if (!canSelect) {
                  return (
                    <span key={row.rowKey || label} style={referenceChipStyle}>
                      {label}
                    </span>
                  );
                }
                return (
                  <button
                    key={row.rowKey || `${row.businessDate}_${label}`}
                    type="button"
                    style={referenceChipStyle}
                    onClick={() => onSelectReferenceDay(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectReferenceDay(row);
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(201,168,76,0.16)";
                      e.currentTarget.style.color = "rgba(240,232,208,0.92)";
                      e.currentTarget.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(201,168,76,0.08)";
                      e.currentTarget.style.color = "rgba(240,232,208,0.78)";
                      e.currentTarget.style.textDecoration = "none";
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {analysis.judgmentPoints?.length > 0 ? (
        <div style={{ ...sectionCardStyle, marginBottom: ".38rem" }}>
          <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.82)", marginBottom: ".18rem", fontWeight: 600 }}>
            C. 判断ポイント
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: narrow ? ".8rem" : ".76rem", lineHeight: 1.6, color: "rgba(240,232,208,0.84)", ...DAY_ANALYSIS_TEXT }}>
            {analysis.judgmentPoints.map((point) => (
              <li key={point.label} style={{ marginBottom: ".12rem" }}>
                <strong style={{ color: "rgba(201,168,76,0.82)" }}>{point.label}</strong>：{point.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div style={{ ...sectionCardStyle, marginBottom: ".38rem", borderColor: "rgba(201,168,76,0.22)", background: "rgba(0,0,0,0.18)" }}>
        <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.88)", marginBottom: ".14rem", fontWeight: 600 }}>
          {isCharter ? "D. 次回貸切へのメモ" : "D. 次回アクション"}
        </div>
        <div style={{ fontSize: narrow ? ".8rem" : ".76rem", lineHeight: 1.6, color: "rgba(240,232,208,0.86)", ...DAY_ANALYSIS_TEXT }}>
          {analysis.nextAction}
        </div>
      </div>

      <div style={{ ...sectionCardStyle, opacity: 0.88 }}>
        <div style={{ fontSize: ".64rem", color: "rgba(201,168,76,0.68)", marginBottom: ".16rem", fontWeight: 600 }}>
          参考指標（月平均比）
        </div>
        <div style={{ ...grid2Style, fontSize: narrow ? ".74rem" : ".7rem", lineHeight: 1.5, color: "rgba(240,232,208,0.58)" }}>
          {(analysis.referenceMetrics || []).map((row) => (
            <div key={row.label} style={{ minWidth: 0, ...DAY_ANALYSIS_TEXT }}>
              {row.label} {row.day}
              <span style={{ marginLeft: ".28rem" }}>/ {row.refLabel || "月平均"} {row.ref}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function UnderTargetCauseEvidence({ row, taxMode, narrow }) {
  const fmtCount = (v) => (v != null ? `${num(v)}名` : "—");
  const fmtUnit = (v) => (v != null ? formatDisplayYen(v, taxMode) : "—");
  const rows = [
    { label: "集客", day: fmtCount(row.customerCount), avg: fmtCount(row.avgDailyCustomerCount) },
    { label: "客単価", day: fmtUnit(row.dayUnitPrice), avg: fmtUnit(row.avgUnitPrice) },
    { label: "飲食比率", day: row.foodDrinkRate != null ? pct(row.foodDrinkRate) : "—", avg: row.avgFoodDrinkRate != null ? pct(row.avgFoodDrinkRate) : "—" },
    { label: "達成率", day: row.achievementRate != null ? pct(row.achievementRate) : "—", avg: null },
  ];
  return (
    <div style={{ marginBottom: ".22rem" }}>
      <div style={{ fontSize: ".7rem", color: "rgba(240,232,208,0.58)", marginBottom: ".16rem" }}>根拠：</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: narrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
          gap: narrow ? ".18rem" : ".16rem .55rem",
          fontSize: narrow ? ".76rem" : ".74rem",
          lineHeight: 1.45,
          color: "rgba(240,232,208,0.72)",
        }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ wordBreak: "break-word" }}>
            {r.label} {r.day}
            {r.avg != null ? ` / 月平均 ${r.avg}` : ""}
          </div>
        ))}
      </div>
    </div>
  );
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
function clearLegacySalesAdminUnlocked_() {
  try {
    localStorage.removeItem(SALES_ADMIN_UNLOCKED_KEY);
  } catch {}
}
function readSalesAdminUnlocked() {
  try {
    return sessionStorage.getItem(SALES_ADMIN_UNLOCKED_KEY) === "true";
  } catch {
    return false;
  }
}
function setSalesAdminUnlocked(unlocked) {
  try {
    clearLegacySalesAdminUnlocked_();
    if (unlocked) {
      sessionStorage.setItem(SALES_ADMIN_UNLOCKED_KEY, "true");
    } else {
      sessionStorage.removeItem(SALES_ADMIN_UNLOCKED_KEY);
    }
  } catch {}
}
function requestSalesAdminAccess_() {
  if (readSalesAdminUnlocked()) return true;
  const input = window.prompt("管理表示用PINを入力してください");
  if (input === null) return false;
  if (String(input).trim() === SALES_ADMIN_PIN) {
    setSalesAdminUnlocked(true);
    return true;
  }
  window.alert("PINが違います。");
  return false;
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
    customerCountSum: 0,
    barTimeCustomerCountSum: 0,
    liveTimeCustomerCountSum: null,
    barTimeCustomerRate: null,
    avgDailyCustomerCount: null,
    customerUnitPrice: null,
    normalCustomerUnitPrice: null,
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
    breakEvenAnalysis: buildBreakEvenAnalysis_(0),
    fixedCostAdjustedProfit: null,
    fixedCostAdjustedProfitRate: null,
  };
}
function aggregateMonthFromRecords_(records, targetMonth, currentBusinessDate, monthlySummary) {
  const monthRows = (records || []).filter((r) => (r.businessDate || "").startsWith(targetMonth));
  const { actualRows, futureRows } = partitionMonthRowsForSales_(monthRows, currentBusinessDate);
  const totalSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.totalSales || 0), 0);
  const targetSalesSum = monthRows.reduce((s, r) => s + Number(r?.metrics?.targetSales || 0), 0);
  const foodDrinkSalesSum = actualRows.reduce((s, r) => s + Number(r?.metrics?.foodDrinkSales || 0), 0);
  const bandFoodDrinkSalesSum = actualRows.reduce((s, r) => s + bandFoodDrinkSalesFromMetrics_(r?.metrics), 0);
  const foodDrinkSalesIncludingBandSum = foodDrinkSalesSum + bandFoodDrinkSalesSum;
  const customerCountSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, CUSTOMER_COUNT_KEYS), 0);
  const barTimeCustomerCountSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAR_TIME_CUSTOMER_COUNT_KEYS), 0);
  const liveTimeCustomerCountSum = deriveLiveTimeCustomerCount_(customerCountSum, barTimeCustomerCountSum);
  const barTimeCustomerRate = calcRate(barTimeCustomerCountSum, customerCountSum);
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
  const venueFeeSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, VENUE_FEE_KEYS), 0);
  const rentalSalesSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, RENTAL_SALES_KEYS), 0);
  const unitPrices = buildUnitPriceMetrics_({
    totalSales: totalSalesSum,
    customerCount: customerCountSum,
    drinkSales: drinkSalesSum,
    foodSales: foodSalesSum,
    foodDrinkSales: foodDrinkSalesSum,
    bandFoodDrinkSales: bandFoodDrinkSalesSum,
    venueFee: venueFeeSum,
    rentalSales: rentalSalesSum,
  });
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
  const fixedCostAdjusted = calcFixedCostAdjustedProfitFromGrossSales_(totalSalesSum);
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
    customerCountSum,
    barTimeCustomerCountSum,
    liveTimeCustomerCountSum,
    barTimeCustomerRate,
    avgDailyCustomerCount: actualRows.length > 0 ? customerCountSum / actualRows.length : null,
    customerUnitPrice: unitPrices.customerUnitPrice,
    normalCustomerUnitPrice: unitPrices.normalCustomerUnitPrice,
    foodDrinkUnitPrice: unitPrices.foodDrinkUnitPrice,
    foodDrinkUnitPriceIncludingBand: unitPrices.foodDrinkUnitPriceIncludingBand,
    normalFoodDrinkUnitPrice: unitPrices.normalFoodDrinkUnitPrice,
    customerUnitPriceExVenue: unitPrices.customerUnitPriceExVenue,
    normalCustomerUnitPriceExVenue: unitPrices.normalCustomerUnitPriceExVenue,
    venueFeeSum,
    rentalSalesSum,
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
    breakEvenAnalysis: buildBreakEvenAnalysis_(totalSalesSum),
    fixedCostAdjustedProfit: fixedCostAdjusted.profit,
    fixedCostAdjustedProfitRate: fixedCostAdjusted.rate,
  };
}
async function fetchSalesMonth_(targetMonth) {
  const res = await fetch(buildSalesFetchUrl_(targetMonth), { cache: "no-store" });
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
function YearlyMonthBarChart({ title, rows, valueKey, barTone, formatTop, taxMode, onMonthClick, tall = false }) {
  const chartRows = rows.length ? rows : [];
  const maxVal = chartRows.reduce((m, r) => {
    if (r.status === "取得失敗") return m;
    const raw = r[valueKey];
    const v = raw == null ? 0 : Number(raw);
    return Math.max(m, Number.isFinite(v) ? v : 0);
  }, 0);
  const scaleMax = maxVal > 0 ? maxVal : 1;
  const clickable = typeof onMonthClick === "function";
  const chartHeight = tall ? 200 : 168;
  const barAreaHeight = tall ? 158 : 130;
  const topLabelSize = tall ? ".52rem" : ".48rem";
  const monthLabelSize = tall ? ".58rem" : ".56rem";
  return (
    <div style={analysisCard("trend")}>
      <div style={analysisSecTitle("trend", ".5rem")}>{title}</div>
      {chartRows.length === 0 ? (
        <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
      ) : (
        <div style={{ width: "100%", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: tall ? ".22rem" : ".18rem", height: chartHeight, width: "100%" }}>
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
                    opacity: yearlyTableRowOpacity_(r),
                    cursor: clickable ? "pointer" : "default",
                    borderRadius: 4,
                    padding: clickable ? ".12rem .04rem" : 0,
                  }}
                  {...(clickable ? yearlyRowHoverHandlers_() : {})}
                >
                  <div style={{ fontSize: topLabelSize, color: "rgba(240,232,208,0.62)", marginBottom: ".12rem", lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {topLabel}
                  </div>
                  <div style={{ height: barAreaHeight, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                    <div style={{ width: "72%", maxWidth: tall ? 34 : 28, height: `${h}%`, minHeight: hasValue ? 4 : 2, borderRadius: "3px 3px 0 0", background: hasValue ? barTone : "rgba(240,232,208,0.08)" }} />
                  </div>
                  <div style={{ marginTop: ".18rem", fontSize: monthLabelSize, color: "rgba(240,232,208,0.58)" }}>{monthShort}</div>
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
                    opacity: yearlyYoYRowOpacity_(r),
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
    <div style={{ ...analysisCard(variant), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
      <div style={analysisSecTitle(variant, ".5rem")}>{title}</div>
      {items.length === 0 ? (
        <div style={{ fontSize: ".78rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
      ) : (
        items.map((r, i) => (
          <div key={r.targetMonth} style={{ padding: ".32rem 0", borderBottom: `1px solid ${analysisRowBorder(variant)}` }}>
            <div style={{ fontSize: ".78rem", color: "rgba(240,232,208,0.55)" }}>{i + 1}. {r.monthLabel}</div>
            <div style={{ fontSize: ".82rem", color: "rgba(240,232,208,0.82)" }}>
              <strong style={{ fontSize: "1.02rem", fontWeight: 600, color: "rgba(240,232,208,0.92)", fontFamily: SALES_NUMBER_FONT_FAMILY, ...SALES_NUMBER_TABULAR }}>{formatValue(r)}</strong>
              <span style={{ marginLeft: ".35rem", fontSize: ".72rem", color: "rgba(240,232,208,0.5)" }}>{valueLabel}</span>
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
const VENUE_FEE_KEYS = [
  "venueFee",
  "hallFee",
  "venueSales",
  "hallRental",
  "roomFee",
  "spaceFee",
  "rentalVenueFee",
];
const VENUE_SALES_KEYS = VENUE_FEE_KEYS;
const RENTAL_SALES_KEYS = ["hallRentalSales", "rentalSales", "hallRentalFee", "rentalFee"];
const BAND_FOOD_DRINK_SALES_KEYS = ["bandFoodDrinkSales"];
const BAND_DRINK_SALES_KEYS = ["bandDrinkSales", "bandMealDrinkSales", "bandDrink"];
const BAND_FOOD_SALES_KEYS = ["bandFoodSales", "bandMealFoodSales", "bandFood", "bandMealSales"];
const CUSTOMER_COUNT_KEYS = [
  "customerCount",
  "guestCount",
  "visitorCount",
  "attendance",
  "attendees",
  "pax",
  "headcount",
  "customers",
  "attendanceCount",
];
const BAR_TIME_CUSTOMER_COUNT_KEYS = ["barTimeCustomerCount"];
const FOOD_DRINK_UNIT_PRICE_NOTE = "※飲食単価はドリンク＋フード売上 ÷ 集客人数です。";
function sumFoodDrinkSalesBase_(drinkSales, foodSales, foodDrinkSales) {
  if (drinkSales != null && foodSales != null) {
    const drink = Number(drinkSales);
    const food = Number(foodSales);
    if (Number.isFinite(drink) && Number.isFinite(food)) return drink + food;
  }
  if (foodDrinkSales != null && Number.isFinite(Number(foodDrinkSales))) return Number(foodDrinkSales);
  return null;
}
function buildUnitPriceMetrics_({
  totalSales,
  customerCount,
  drinkSales,
  foodSales,
  foodDrinkSales,
  bandFoodDrinkSales,
  venueFee,
  rentalSales,
}) {
  const band = bandFoodDrinkSales != null ? Number(bandFoodDrinkSales) : 0;
  const venue = venueFee != null ? Number(venueFee) : 0;
  const rental = rentalSales != null ? Number(rentalSales) : 0;
  const totalN = Number(totalSales || 0);
  const foodBase = sumFoodDrinkSalesBase_(drinkSales, foodSales, foodDrinkSales);
  const foodIncludingBand =
    foodBase != null ? foodBase + band : foodDrinkSalesIncludingBand_(foodDrinkSales, bandFoodDrinkSales);
  const otherNonFood = Math.max(
    0,
    totalN - Number(drinkSales || 0) - Number(foodSales || 0) - band - venue - rental
  );
  return {
    customerUnitPrice: unitPriceByCustomerCount_(totalSales, customerCount),
    normalCustomerUnitPrice: unitPriceByCustomerCount_(totalN - band, customerCount),
    foodDrinkUnitPrice: unitPriceByCustomerCount_(foodBase, customerCount),
    foodDrinkUnitPriceIncludingBand: unitPriceByCustomerCount_(foodIncludingBand, customerCount),
    normalFoodDrinkUnitPrice: unitPriceByCustomerCount_(foodBase, customerCount),
    customerUnitPriceExVenue: unitPriceByCustomerCount_(totalN - venue, customerCount),
    normalCustomerUnitPriceExVenue: unitPriceByCustomerCount_(totalN - venue - band, customerCount),
    hasVenueFee: venue > 0,
    hasAuxiliarySalesNote: venue > 0 || rental > 0 || otherNonFood > 0,
  };
}
function formatUnitYen_(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `¥${num(value)}`;
}
function barTimeCustomerCountFromMetrics_(metrics) {
  return pickMetricNullable(metrics, BAR_TIME_CUSTOMER_COUNT_KEYS);
}
function deriveLiveTimeCustomerCount_(customerCount, barTimeCustomerCount) {
  if (customerCount == null || barTimeCustomerCount == null) return null;
  const total = Number(customerCount);
  const bar = Number(barTimeCustomerCount);
  if (!Number.isFinite(total) || !Number.isFinite(bar)) return null;
  const live = total - bar;
  if (live < 0) return null;
  return live;
}
function formatCustomerCountLabel_(count) {
  return count != null ? `${num(count)}名` : "—";
}
function yearlyMonthChartGridCols_(narrow) {
  return narrow ? "1fr" : "repeat(2, minmax(0, 1fr))";
}
function CustomerCountSummaryBlock({ narrow, parentItems, breakdownItems }) {
  const parentRowStyle = narrow
    ? { display: "grid", gap: ".14rem" }
    : { display: "flex", flexWrap: "wrap", gap: ".3rem 1.15rem", alignItems: "baseline" };
  const parentLabelStyle = {
    fontSize: narrow ? ".78rem" : ".84rem",
    color: "rgba(240,232,208,0.88)",
  };
  const parentValueStyle = {
    fontWeight: 700,
    color: "rgba(245,240,208,0.95)",
    fontFamily: SALES_NUMBER_FONT_FAMILY,
    ...SALES_NUMBER_TABULAR,
  };
  const breakdownWrap = {
    marginTop: ".38rem",
    paddingLeft: narrow ? ".55rem" : ".7rem",
    borderLeft: "2px solid rgba(201,168,76,0.22)",
  };
  const breakdownHeadingStyle = {
    fontSize: ".68rem",
    color: "rgba(201,168,76,0.72)",
    marginBottom: ".22rem",
    letterSpacing: ".04em",
  };
  const breakdownRowStyle = {
    display: "grid",
    gap: ".12rem",
    fontSize: ".74rem",
    color: "rgba(240,232,208,0.62)",
  };
  return (
    <div style={{ minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
      <div style={parentRowStyle}>
        {parentItems.map((item) => (
          <div key={item.label} style={parentLabelStyle}>
            {item.label}{" "}
            <strong style={parentValueStyle}>{item.value}</strong>
          </div>
        ))}
      </div>
      <div style={breakdownWrap}>
        <div style={breakdownHeadingStyle}>内訳</div>
        <div style={breakdownRowStyle}>
          {breakdownItems.map((item) => (
            <div key={item.label} style={{ minWidth: 0, maxWidth: "100%" }}>
              {item.label}{" "}
              <strong
                style={{
                  fontWeight: 600,
                  color: "rgba(240,232,208,0.78)",
                  fontFamily: SALES_NUMBER_FONT_FAMILY,
                  ...SALES_NUMBER_TABULAR,
                }}
              >
                {item.value}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function bandFoodDrinkSalesFromMetrics_(metrics) {
  return pickMetricValue(metrics, BAND_FOOD_DRINK_SALES_KEYS);
}
function foodDrinkSalesIncludingBand_(foodDrinkSales, bandFoodDrinkSales) {
  const base = foodDrinkSales != null ? Number(foodDrinkSales) : 0;
  const band = bandFoodDrinkSales != null ? Number(bandFoodDrinkSales) : 0;
  if (foodDrinkSales == null && bandFoodDrinkSales == null) return null;
  return base + band;
}
function unitPriceByCustomerCount_(amount, customerCount) {
  const a = amount != null ? Number(amount) : null;
  const c = customerCount != null ? Number(customerCount) : null;
  if (!Number.isFinite(a) || !Number.isFinite(c) || !(c > 0)) return null;
  return Math.round(a / c);
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
function SalesCompositionLegend({ narrow }) {
  return (
    <div style={{ display:"flex", gap: narrow ? ".5rem .65rem" : ".85rem", flexWrap:"wrap", marginBottom:".42rem", fontSize: narrow ? ".82rem" : ".78rem", color:"rgba(240,232,208,0.86)", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
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
/** 営業日7:00切替は futureRows の予定判定のみ。売上入力済み行は日付に関わらず実績に含める。 */
function partitionMonthRowsForSales_(monthRows, currentBusinessDate) {
  const actualRows = monthRows.filter((r) => r?.metrics?.totalSales != null);
  const futureRows = monthRows.filter(
    (r) => r?.metrics?.totalSales == null && (r.businessDate || "") >= currentBusinessDate
  );
  return { actualRows, futureRows };
}
function buildSalesFetchUrl_(targetMonth) {
  const sep = SALES_API_URL.includes("?") ? "&" : "?";
  return `${SALES_API_URL}${sep}targetMonth=${encodeURIComponent(targetMonth)}&t=${Date.now()}`;
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
function normalizeEventNameForCompare_(text) {
  if (text == null || text === undefined) return "";
  let s = String(text).normalize("NFKC").trim().toLowerCase();
  s = s.replace(/\bvol\.?\s*\d+\b/gi, "").replace(/\bvol\d+\b/gi, "");
  s = s.replace(/[＆&]/g, "");
  s = s.replace(/[・･]/g, "");
  s = s.replace(/[〜～ｰー\-－―\s]/g, "");
  return s.trim();
}
function normalizeEventSeriesText_(text) {
  return String(text || "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function isForbiddenEventSeriesKeyword_(keyword) {
  const normalized = normalizeEventSeriesText_(keyword);
  if (!normalized) return true;
  if (EVENT_SERIES_FORBIDDEN_KEYWORDS.has(normalized.toLowerCase())) return true;
  if (normalized.length <= 4 && EVENT_SERIES_FORBIDDEN_KEYWORDS.has(normalized)) return true;
  return false;
}
function matchEventSeriesKeyword_(searchText, keyword, rule, { performOnly = false } = {}) {
  const normalized = normalizeEventSeriesText_(searchText);
  const normalizedKeyword = normalizeEventSeriesText_(keyword);
  if (!normalized || !normalizedKeyword || normalizedKeyword.length < 3) return false;
  if (isForbiddenEventSeriesKeyword_(normalizedKeyword)) return false;
  if (!normalized.includes(normalizedKeyword)) return false;

  if (rule?.id === "disco") {
    if (normalizedKeyword === "ディスコ" && performOnly) return false;
    if (performOnly && !DISCO_STRONG_KEYWORDS.has(normalizedKeyword)) return false;
  }
  return true;
}
function matchEventSeriesInText_(searchText, rule, options = {}) {
  if (!searchText || !rule?.keywords?.length) return false;
  return rule.keywords.some((keyword) => matchEventSeriesKeyword_(searchText, keyword, rule, options));
}
function resolveEventSeriesMatchesInText_(searchText, options = {}) {
  if (!searchText) return [];
  return EVENT_SERIES_RULES.filter((rule) => matchEventSeriesInText_(searchText, rule, options));
}
function pickHighestPrioritySeriesRule_(rules) {
  if (!rules?.length) return null;
  return [...rules].sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
}
function buildEventSeriesNameText_(info) {
  const event = info?.event || null;
  return [
    info?.sheetEventName,
    info?.record?.sheetEventName,
    info?.eventName,
    info?.eventTitle,
    event?.name,
  ]
    .filter(Boolean)
    .join(" ");
}
function buildEventSeriesPerformText_(info) {
  const event = info?.event || null;
  return [
    event?.perf,
    event?.performers,
    event?.desc,
    event?.description,
    info?.performContent,
    info?.performContentFull,
    info?.eventPerformContent,
    info?.eventPerformContentFull,
  ]
    .filter(Boolean)
    .join(" ");
}
function resolveEventSeries_(rowOrEventInfo) {
  const info = rowOrEventInfo || {};
  const event = info.event || null;
  const explicitSeriesId = info.seriesId || event?.seriesId || event?.category || event?.series;
  if (explicitSeriesId) {
    const matchedRule = EVENT_SERIES_RULES.find((rule) => rule.id === explicitSeriesId);
    if (matchedRule) return matchedRule;
  }

  const nameText = buildEventSeriesNameText_(info);
  const nameMatch = pickHighestPrioritySeriesRule_(resolveEventSeriesMatchesInText_(nameText, { performOnly: false }));
  if (nameMatch) return nameMatch;

  const performText = buildEventSeriesPerformText_(info);
  return pickHighestPrioritySeriesRule_(resolveEventSeriesMatchesInText_(performText, { performOnly: true }));
}
function collectComparableEventNameNorms_(row) {
  const seen = new Set();
  const out = [];
  for (const raw of [row?.sheetEventName, row?.eventName, row?.event?.name]) {
    const normalized = normalizeEventNameForCompare_(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
function primaryComparableEventNameNorm_(row) {
  const raw = String(row?.sheetEventName || row?.eventName || row?.event?.name || "").trim();
  return normalizeEventNameForCompare_(raw);
}
function primaryComparableEventNameRaw_(row) {
  return String(row?.sheetEventName || row?.eventName || row?.event?.name || "").trim();
}
function eventNamesExactMatch_(left, right) {
  const leftNorms = collectComparableEventNameNorms_(left);
  const rightNorms = collectComparableEventNameNorms_(right);
  if (!leftNorms.length || !rightNorms.length) return false;
  return leftNorms.some((leftNorm) => rightNorms.includes(leftNorm));
}
function eventNamesPartialMatch_(left, right) {
  const leftNorms = collectComparableEventNameNorms_(left).filter((norm) => norm.length >= 3);
  const rightNorms = collectComparableEventNameNorms_(right).filter((norm) => norm.length >= 3);
  if (!leftNorms.length || !rightNorms.length) return false;
  return leftNorms.some((leftNorm) =>
    rightNorms.some((rightNorm) => leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm))
  );
}
function hasNormalizedSpellingVariant_(selected, matches) {
  const selectedRaw = primaryComparableEventNameRaw_(selected);
  const selectedNorm = primaryComparableEventNameNorm_(selected);
  if (!selectedNorm) return false;
  return (matches || []).some((row) => {
    const rowRaw = primaryComparableEventNameRaw_(row);
    const rowNorm = primaryComparableEventNameNorm_(row);
    return rowNorm === selectedNorm && rowRaw && selectedRaw && rowRaw !== selectedRaw;
  });
}
function extractPerformerTokens_(text) {
  const normalized = normalizePerformText(text);
  if (!normalized) return [];
  return normalized
    .split(/\s*[\/／、，,+＋]\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}
function performerTokensMatch_(leftText, rightText) {
  const leftTokens = extractPerformerTokens_(leftText).map((token) => normText(token));
  const rightTokens = extractPerformerTokens_(rightText).map((token) => normText(token));
  if (!leftTokens.length || !rightTokens.length) return false;
  return leftTokens.some((left) =>
    rightTokens.some((right) => left === right || left.includes(right) || right.includes(left))
  );
}
function performerComboMatch_(selectedPerformText, candidatePerformText) {
  const selectedTokens = extractPerformerTokens_(selectedPerformText).map((token) => normText(token));
  const candidateTokens = extractPerformerTokens_(candidatePerformText).map((token) => normText(token));
  if (selectedTokens.length < 2 || !candidateTokens.length) return false;
  return selectedTokens.every((selected) =>
    candidateTokens.some((candidate) => candidate === selected || candidate.includes(selected) || selected.includes(candidate))
  );
}
function recordToPastComparableDay_(record, events) {
  const matchedEvent = matchEventForRecord(record, eventsForDate(events, record.businessDate));
  const performRaw = formatEventPerformContent(matchedEvent);
  const performFormatted = formatPerformDisplay(performRaw);
  const sheetName = String(record?.sheetEventName || "").trim();
  const eventName = resolveEventNameForAdmin(record, record.resolvedEventNames) || sheetName;
  const totalSales = Number(record?.metrics?.totalSales || 0);
  const customerCount = pickMetricNullable(record?.metrics, CUSTOMER_COUNT_KEYS);
  const bandFoodDrinkSales = pickMetricNullable(record?.metrics, BAND_FOOD_DRINK_SALES_KEYS);
  const foodDrinkSalesBase = record?.metrics?.foodDrinkSales != null ? Number(record.metrics.foodDrinkSales) : null;
  const foodDrinkSalesIncludingBand = foodDrinkSalesIncludingBand_(foodDrinkSalesBase, bandFoodDrinkSales);
  const idx = record?._idx != null ? record._idx : 0;
  const sourceBlock = record?.sourceBlock ?? "";
  const sourceColumn = record?.sourceColumn ?? "";
  return {
    rowKey: `${record.businessDate}_${sourceBlock}_${sourceColumn}_${idx}`,
    businessDate: record.businessDate,
    sourceBlock,
    sourceColumn,
    recordIdx: idx,
    sheetEventName: sheetName,
    eventName,
    event: matchedEvent,
    performContent: performFormatted.display,
    performContentFull: performFormatted.full,
    eventPerformContent: performFormatted.display,
    eventPerformContentFull: performFormatted.full,
    totalSales,
    customerCount,
    customerUnitPrice: unitPriceByCustomerCount_(totalSales, customerCount),
    foodDrinkRate: calcRate(foodDrinkSalesIncludingBand, totalSales),
    drinkSales: record?.metrics?.drinkSales != null ? Number(record.metrics.drinkSales) : null,
    foodSales: record?.metrics?.foodSales != null ? Number(record.metrics.foodSales) : null,
    operatingProfit: record?.metrics?.operatingProfit != null ? Number(record.metrics.operatingProfit) : null,
    targetSales: Number(record?.metrics?.targetSales || 0),
    achievementRate: calcRate(totalSales, record?.metrics?.targetSales),
  };
}
function trendRowToPastComparableDay_(row, events) {
  if (!row) return null;
  const record = {
    businessDate: row.businessDate,
    sourceBlock: String(row.rowKey || "").split("_")[1] || "",
    sourceColumn: String(row.rowKey || "").split("_")[2] || "",
    _idx: String(row.rowKey || "").split("_")[3] || 0,
    sheetEventName: row.eventName,
    resolvedEventNames: [row.eventName].filter(Boolean),
    metrics: {
      totalSales: row.totalSales,
      targetSales: row.targetSales,
      foodDrinkSales: row.foodDrinkSalesBase,
      drinkSales: row.drinkSales,
      foodSales: row.foodSales,
      customerUnitPrice: row.customerUnitPrice,
    },
  };
  const comparable = recordToPastComparableDay_(record, events);
  return {
    ...comparable,
    rowKey: row.rowKey,
    eventName: row.eventName,
    performContent: row.eventPerformContent,
    performContentFull: row.eventPerformContentFull,
    eventPerformContent: row.eventPerformContent,
    eventPerformContentFull: row.eventPerformContentFull,
    customerCount: row.customerCount,
    customerUnitPrice: row.customerUnitPrice,
    foodDrinkRate: calcRate(row.foodDrinkSalesIncludingBand, row.totalSales),
    drinkSales: row.drinkSales,
    foodSales: row.foodSales,
    operatingProfit: row.operatingProfit,
    achievementRate: row.achievementRate,
    totalSales: row.totalSales,
    targetSales: row.targetSales,
  };
}
function averagePastComparableMetrics_(matches) {
  if (!matches?.length) return null;
  let salesSum = 0;
  let customerSum = 0;
  let customerCountSamples = 0;
  let unitSum = 0;
  let unitSamples = 0;
  let foodRateSum = 0;
  let foodRateSamples = 0;
  let drinkSum = 0;
  let drinkSamples = 0;
  let foodSalesSum = 0;
  let foodSalesSamples = 0;
  let profitSum = 0;
  let profitSamples = 0;
  for (const row of matches) {
    salesSum += Number(row.totalSales || 0);
    if (row.customerCount != null) {
      customerSum += Number(row.customerCount || 0);
      customerCountSamples += 1;
    }
    if (row.customerUnitPrice != null) {
      unitSum += Number(row.customerUnitPrice || 0);
      unitSamples += 1;
    }
    if (row.foodDrinkRate != null) {
      foodRateSum += Number(row.foodDrinkRate || 0);
      foodRateSamples += 1;
    }
    if (row.drinkSales != null) {
      drinkSum += Number(row.drinkSales || 0);
      drinkSamples += 1;
    }
    if (row.foodSales != null) {
      foodSalesSum += Number(row.foodSales || 0);
      foodSalesSamples += 1;
    }
    if (row.operatingProfit != null) {
      profitSum += Number(row.operatingProfit || 0);
      profitSamples += 1;
    }
  }
  const n = matches.length;
  return {
    totalSales: salesSum / n,
    customerCount: customerCountSamples > 0 ? customerSum / customerCountSamples : null,
    customerUnitPrice: unitSamples > 0 ? unitSum / unitSamples : null,
    foodDrinkRate: foodRateSamples > 0 ? foodRateSum / foodRateSamples : null,
    drinkSales: drinkSamples > 0 ? drinkSum / drinkSamples : null,
    foodSales: foodSalesSamples > 0 ? foodSalesSum / foodSalesSamples : null,
    operatingProfit: profitSamples > 0 ? profitSum / profitSamples : null,
    sampleCount: n,
  };
}
function parseSalesDateKey_(value) {
  const raw = String(value || "").trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const dateKey = m[1];
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dateKey;
}
function isPastComparableDate_(candidateDate, selectedDate) {
  const candidateKey = parseSalesDateKey_(candidateDate);
  const selectedKey = parseSalesDateKey_(selectedDate);
  if (!candidateKey || !selectedKey) return false;
  return candidateKey < selectedKey;
}
function filterPastComparableMatches_(matches, selectedDate) {
  const selectedKey = parseSalesDateKey_(selectedDate);
  if (!selectedKey) return [];
  return (matches || []).filter((row) => isPastComparableDate_(row?.businessDate, selectedKey));
}
function findPastSimilarMatches_(selected, pool) {
  const selectedDateKey = parseSalesDateKey_(selected?.businessDate);
  const rawCandidates = (pool || []).filter((row) => row?.rowKey && row.rowKey !== selected?.rowKey);
  const candidates = selectedDateKey
    ? rawCandidates.filter((row) => isPastComparableDate_(row.businessDate, selectedDateKey))
    : [];
  const excludedFutureCount = selectedDateKey ? rawCandidates.length - candidates.length : rawCandidates.length;
  const attachMeta = (info) => ({ ...info, selectedDateKey, excludedFutureCount });
  const selectedPerformText =
    selected?.eventPerformContentFull || selected?.performContentFull || selected?.eventPerformContent || selected?.performContent || "";
  const compareKey = primaryComparableEventNameNorm_(selected);
  const selectedSeries = resolveEventSeries_(selected);
  const resolveSource = buildEventSeriesNameText_(selected) ? "イベント名" : "出演・内容";

  const exactMatches = filterPastComparableMatches_(candidates.filter((row) => eventNamesExactMatch_(selected, row)), selectedDateKey);
  if (exactMatches.length) {
    return attachMeta({
      matchTypeLabel: "同じイベント名",
      matchKind: "exactName",
      seriesRule: null,
      matches: exactMatches,
      compareKey,
      matchNote: hasNormalizedSpellingVariant_(selected, exactMatches) ? "表記ゆれを含めて比較しています" : null,
      resolveSource,
      seriesCategory: selectedSeries?.label || null,
    });
  }

  if (selectedSeries) {
    const matches = filterPastComparableMatches_(
      candidates.filter((row) => {
        const series = resolveEventSeries_(row);
        return series && series.id === selectedSeries.id;
      }),
      selectedDateKey
    );
    return attachMeta({
      matchTypeLabel: selectedSeries.label,
      matchKind: "series",
      seriesRule: selectedSeries,
      matches,
      compareKey,
      matchNote: null,
      resolveSource,
      seriesCategory: selectedSeries.label,
    });
  }

  const performerTokens = extractPerformerTokens_(selectedPerformText);
  if (performerTokens.length === 1) {
    const matches = filterPastComparableMatches_(
      candidates.filter((row) =>
        performerTokensMatch_(
          selectedPerformText,
          row.eventPerformContentFull || row.performContentFull || row.eventPerformContent || row.performContent || ""
        )
      ),
      selectedDateKey
    );
    if (matches.length) {
      return attachMeta({
        matchTypeLabel: "同じ出演者を含む実績（参考）",
        matchKind: "performerSingle",
        seriesRule: null,
        matches,
        compareKey,
        matchNote: null,
        resolveSource,
        seriesCategory: null,
      });
    }
  }

  if (performerTokens.length >= 2) {
    const matches = filterPastComparableMatches_(
      candidates.filter((row) =>
        performerComboMatch_(
          selectedPerformText,
          row.eventPerformContentFull || row.performContentFull || row.eventPerformContent || row.performContent || ""
        )
      ),
      selectedDateKey
    );
    if (matches.length) {
      return attachMeta({
        matchTypeLabel: "同じ出演者組み合わせ",
        matchKind: "performerCombo",
        seriesRule: null,
        matches,
        compareKey,
        matchNote: null,
        resolveSource,
        seriesCategory: null,
      });
    }
  }

  if (compareKey.length >= 3) {
    const matches = filterPastComparableMatches_(
      candidates.filter((row) => eventNamesPartialMatch_(selected, row)),
      selectedDateKey
    );
    if (matches.length) {
      return attachMeta({
        matchTypeLabel: "イベント名の部分一致",
        matchKind: "partialName",
        seriesRule: null,
        matches,
        compareKey,
        matchNote: hasNormalizedSpellingVariant_(selected, matches) ? "表記ゆれを含めて比較しています" : null,
        resolveSource,
        seriesCategory: null,
      });
    }
  }

  return attachMeta({
    matchTypeLabel: null,
    matchKind: null,
    seriesRule: null,
    matches: [],
    compareKey,
    matchNote: null,
    resolveSource,
    seriesCategory: null,
  });
}
function parseTrendRowKeyParts_(rowKey) {
  const m = String(rowKey || "").match(/^(\d{4}-\d{2}-\d{2})_(.+)_([^_]+)_(\d+)$/);
  if (!m) return null;
  return { businessDate: m[1], sourceBlock: m[2], sourceColumn: m[3], recordIdx: m[4] };
}
function resolveTrendRowKeyForReference_(reference, trendRows) {
  const rows = Array.isArray(trendRows) ? trendRows : [];
  if (!reference || !rows.length) return "";

  if (reference.rowKey) {
    const exact = rows.find((r) => r.rowKey === reference.rowKey);
    if (exact) return exact.rowKey;
  }

  const parsed = parseTrendRowKeyParts_(reference.rowKey);
  const businessDate = reference.businessDate || parsed?.businessDate || "";
  const sourceBlock = reference.sourceBlock ?? parsed?.sourceBlock ?? "";
  const sourceColumn = reference.sourceColumn ?? parsed?.sourceColumn ?? "";
  const recordIdx = reference.recordIdx ?? parsed?.recordIdx ?? "";

  if (businessDate && sourceBlock !== "" && sourceColumn !== "" && recordIdx !== "") {
    const structuralKey = `${businessDate}_${sourceBlock}_${sourceColumn}_${recordIdx}`;
    const structural = rows.find((r) => r.rowKey === structuralKey);
    if (structural) return structural.rowKey;
  }

  if (businessDate && sourceBlock !== "" && sourceColumn !== "") {
    const structuralMatches = rows.filter((r) =>
      String(r.rowKey || "").startsWith(`${businessDate}_${sourceBlock}_${sourceColumn}_`)
    );
    if (structuralMatches.length === 1) return structuralMatches[0].rowKey;
  }

  const refNorms = collectComparableEventNameNorms_(reference);
  if (businessDate && refNorms.length) {
    const byDateName = rows.filter((r) => {
      if (r.businessDate !== businessDate) return false;
      const rowNorms = collectComparableEventNameNorms_({
        sheetEventName: r.eventName,
        eventName: r.eventName,
      });
      return refNorms.some((norm) => rowNorms.includes(norm));
    });
    if (byDateName.length === 1) return byDateName[0].rowKey;
    if (byDateName.length > 1 && sourceBlock !== "" && sourceColumn !== "") {
      const narrowed = byDateName.filter((r) => {
        const parts = parseTrendRowKeyParts_(r.rowKey);
        return parts && parts.sourceBlock === sourceBlock && parts.sourceColumn === sourceColumn;
      });
      if (narrowed.length === 1) return narrowed[0].rowKey;
    }
  }

  return reference.rowKey || "";
}
function buildPastSimilarComparisonComment_(selected, avg, matchInfo, options = {}) {
  const { pastMonthsDataLoaded = false, yearlyLoading = false } = options;
  const { matchTypeLabel, matchKind, seriesRule, matches } = matchInfo || {};
  const sampleCount = matches?.length || 0;
  const seriesLabel = seriesRule?.label || matchTypeLabel || "同系イベント";

  if (matchKind === "series" && sampleCount === 0) {
    if (yearlyLoading && !pastMonthsDataLoaded) {
      return "対象年の過去月データを読み込み中です。完了後に同系イベントの比較が表示されます。";
    }
    if (!pastMonthsDataLoaded) {
      return "同系イベントの過去実績がまだ取得できていません。過去の DISCO BAND などを比較対象に含めるには、対象年の月次データが読み込まれている必要があります。";
    }
    return "選択日より前の同系実績がまだないため、今回は過去比較できません。今後の同系イベント実績を蓄積してください。";
  }

  if (matchKind === "exactName" && sampleCount === 0) {
    return "選択日より前の同名イベント実績がまだないため、今回は過去比較できません。";
  }

  if (!sampleCount || !avg) {
    return "選択日より前の比較実績が見つかりませんでした。同系イベントの実績が増えると、傾向比較がしやすくなります。";
  }
  if (matchKind === "series" && sampleCount < 2) {
    return "同系イベントの過去実績が少ないため、今回は参考比較です。今後のために、イベントカテゴリ別の実績を蓄積してください。";
  }

  const salesDiff = Number(selected.totalSales || 0) - Number(avg.totalSales || 0);
  const customerDiff =
    selected.customerCount != null && avg.customerCount != null
      ? Number(selected.customerCount) - Number(avg.customerCount)
      : null;
  const unitDiff =
    selected.customerUnitPrice != null && avg.customerUnitPrice != null
      ? Number(selected.customerUnitPrice) - Number(avg.customerUnitPrice)
      : null;
  const foodDiff =
    selected.foodDrinkRate != null && avg.foodDrinkRate != null
      ? Number(selected.foodDrinkRate) - Number(avg.foodDrinkRate)
      : null;

  if (matchKind === "exactName") {
    if (customerDiff != null && customerDiff < -1 && unitDiff != null && unitDiff >= 0) {
      return "同じイベント名の過去実績と比べて、今回は集客が弱めです。イベント自体の傾向よりも、今回の告知時期や出演者構成の影響を確認してください。";
    }
    if (unitDiff != null && unitDiff >= 100) {
      return "同じイベント名の過去実績と比べて、今回は客単価が高めです。来店後の飲食提案や終演後の滞在導線がうまく機能した可能性があります。";
    }
    if (salesDiff < 0 && customerDiff != null && customerDiff < -1) {
      return "同じイベント名の過去実績と比べて、今回は売上・集客とも弱めです。今回固有の告知時期や出演者構成を確認してください。";
    }
    if (salesDiff >= 0 && unitDiff != null && unitDiff >= 0) {
      return "同じイベント名の過去実績と比べて、今回は売上・客単価が高めです。再現できた告知・来店後導線を記録してください。";
    }
    return "同じイベント名の過去実績と比べて、今回の位置づけを確認してください。";
  }

  if (matchKind === "series") {
    if (customerDiff != null && customerDiff < -1 && unitDiff != null && unitDiff >= 0) {
      return `${seriesLabel}の過去平均より集客が低い一方、客単価は高めです。今回はイベント集客よりも、来店後の売上化で補っている可能性があります。`;
    }
    if (salesDiff < 0 && customerDiff != null && customerDiff < -1) {
      return `${seriesLabel}の過去平均より売上・集客とも低めです。告知時期、出演者構成、固定客への案内を見直してください。`;
    }
    if (unitDiff != null && unitDiff >= 100 && (customerDiff == null || Math.abs(customerDiff) <= 2)) {
      return `${seriesLabel}の過去平均より客単価が高めです。飲食提案や滞在導線は良い可能性があります。`;
    }
    if (
      seriesRule?.id === "surfside" &&
      Math.abs(salesDiff) <= Math.max(10000, Number(avg.totalSales || 0) * 0.1) &&
      customerDiff != null &&
      Math.abs(customerDiff) <= 3
    ) {
      return `${seriesLabel}の過去実績と比べて、今回は売上・集客ともに近い水準です。大きな崩れはないため、次回は飲食比率やバータイム比率の底上げを確認してください。`;
    }
    if (seriesRule?.id === "standard_jazz" && foodDiff != null && foodDiff >= 3) {
      return `${seriesLabel}の過去実績と比べて、今回は飲食比率が高めです。客層に合ったフード・ドリンク提案が機能している可能性があります。`;
    }
    if (salesDiff >= 0 && unitDiff != null && unitDiff >= 0) {
      return `${seriesLabel}の過去実績と比べて、今回は売上・客単価が高めです。同系イベントとして再現ポイントを記録してください。`;
    }
    if (customerDiff != null && customerDiff < -1 && (unitDiff == null || unitDiff >= -100)) {
      return `${seriesLabel}の過去平均より集客が弱めです。次回の同系イベントでは、告知時期・出演者構成・固定客への案内を優先してください。`;
    }
    return `${seriesLabel}の過去実績と比べて、今回の位置づけを確認してください。同系イベントとして傾向を蓄積していくと分析しやすくなります。`;
  }

  if (salesDiff >= 0 && unitDiff != null && unitDiff >= 0) {
    return `${matchTypeLabel}の過去実績と比べて、今回は売上・客単価が高めです。`;
  }
  if (customerDiff != null && customerDiff < 0) {
    return `${matchTypeLabel}の過去実績と比べて、今回は集客が弱めです。告知・予約導線を確認してください。`;
  }
  if (unitDiff != null && unitDiff < 0) {
    return `${matchTypeLabel}の過去実績と比べて、今回は客単価が弱めです。来店後の追加注文導線を確認してください。`;
  }
  return `${matchTypeLabel}の過去実績と比べて、今回の位置づけを確認してください。`;
}
function buildPastSimilarComparison_(selected, pool, taxMode, options = {}) {
  if (!selected) return null;
  const matchInfo = findPastSimilarMatches_(selected, pool);
  const selectedDateKey = parseSalesDateKey_(selected?.businessDate);
  const pastMatches = filterPastComparableMatches_(matchInfo.matches, selectedDateKey);
  const sampleCount = pastMatches.length;
  const avg = sampleCount > 0 ? averagePastComparableMetrics_(pastMatches) : null;
  const comment = buildPastSimilarComparisonComment_(selected, avg, { ...matchInfo, matches: pastMatches }, options);
  const hasPastStatus =
    sampleCount === 0 &&
    (matchInfo.matchKind === "series" || matchInfo.matchKind === "exactName") &&
    matchInfo.matchTypeLabel;
  return {
    matchTypeLabel: matchInfo.matchTypeLabel,
    matchKind: matchInfo.matchKind,
    sampleCount,
    matches: pastMatches.slice(0, 3),
    avg,
    comment,
    matchNote: matchInfo.matchNote || null,
    compareKey: matchInfo.compareKey || null,
    debugInfo: {
      resolveSource: matchInfo.resolveSource || null,
      seriesCategory: matchInfo.seriesCategory || matchInfo.seriesRule?.label || null,
      compareKey: matchInfo.compareKey || null,
      matchType: matchInfo.matchKind || null,
      selectedDate: selectedDateKey,
      pastComparableCount: sampleCount,
      excludedFutureCount: matchInfo.excludedFutureCount || 0,
    },
    statusNote: hasPastStatus ? "過去同系実績：該当なし" : null,
    pastMonthsDataLoaded: !!options.pastMonthsDataLoaded,
    yearlyLoading: !!options.yearlyLoading,
    selected,
    comparisons: {
      sales: {
        day: selected.totalSales,
        avg: avg?.totalSales ?? null,
      },
      customerCount: {
        day: selected.customerCount,
        avg: avg?.customerCount ?? null,
      },
      customerUnitPrice: {
        day: selected.customerUnitPrice,
        avg: avg?.customerUnitPrice ?? null,
      },
      foodDrinkRate: {
        day: selected.foodDrinkRate,
        avg: avg?.foodDrinkRate ?? null,
      },
    },
    taxMode,
  };
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
const TABLE_NUMBER_STYLE = {
  textAlign: "right",
  fontFamily: SALES_NUMBER_FONT_FAMILY,
  ...SALES_NUMBER_TABULAR,
  fontSize: ".9rem",
  fontWeight: 600,
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
  ...SALES_NUMBER_TABULAR,
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
  breakEven: 72,
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

function CostProfitBarRow({ bar, maxValue, isChild, taxMode, narrow }) {
  const isLaborZero = bar.key === "labor" && Number(bar.value || 0) === 0;
  const scaleMax = maxValue > 0 ? maxValue : 1;
  const w = isLaborZero ? 0 : Math.max(isChild ? 3 : 4, Math.round((Number(bar.value || 0) / scaleMax) * 100));
  const amountText = isLaborZero ? "¥0 / 翌月反映" : formatDisplayYen(bar.value, taxMode);
  const labelBlock = (
    <div
      style={{
        fontSize: narrow ? (isChild ? ".72rem" : ".78rem") : isChild ? ".68rem" : ".74rem",
        color: isChild ? "rgba(240,232,208,0.58)" : "rgba(240,232,208,0.74)",
        lineHeight: 1.4,
      }}
    >
      {isChild ? `内訳：${bar.label}` : bar.label}
      {!isChild && bar.note ? (
        <span style={{ display: narrow ? "block" : "inline", marginLeft: narrow ? 0 : ".28rem", marginTop: narrow ? ".08rem" : 0, fontSize: ".64rem", color: "rgba(240,232,208,0.52)" }}>{bar.note}</span>
      ) : null}
    </div>
  );
  const barBlock = (
    <div
      style={{
        height: isChild ? 7 : narrow ? 9 : 10,
        borderRadius: 999,
        background: isChild ? "rgba(240,232,208,0.06)" : "rgba(240,232,208,0.1)",
        border: isChild ? "1px solid rgba(201,168,76,0.12)" : "1px solid rgba(201,168,76,0.18)",
        overflow: "hidden",
        width: "100%",
        minWidth: 0,
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
  );
  const amountBlock = (
    <div
      style={{
        fontSize: narrow ? ".92rem" : isChild ? ".7rem" : ".74rem",
        fontWeight: narrow ? 600 : 600,
        fontFamily: SALES_NUMBER_FONT_FAMILY,
        ...SALES_NUMBER_TABULAR,
        color: isChild ? "rgba(240,232,208,0.82)" : "#f0e8d0",
      }}
    >
      {amountText}
    </div>
  );
  if (narrow) {
    return (
      <div
        style={{
          marginLeft: isChild ? ".2rem" : 0,
          paddingLeft: isChild ? ".55rem" : 0,
          borderLeft: isChild ? "2px solid rgba(205,134,74,0.22)" : "none",
          paddingBottom: ".28rem",
          borderBottom: "1px solid rgba(201,168,76,0.08)",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        {labelBlock}
        <div style={{ margin: ".28rem 0 .22rem" }}>{barBlock}</div>
        {amountBlock}
      </div>
    );
  }
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
      {labelBlock}
      {barBlock}
      {amountBlock}
    </div>
  );
}

function CostProfitBarList({ bars, maxValue, taxMode, narrow }) {
  const hasPurchaseChildren = bars.some((b) => b.isPurchaseChild);
  return (
    <>
      <div style={{ display: "grid", gap: ".4rem", width: "100%", maxWidth: "100%", minWidth: 0, boxSizing: "border-box" }}>
        {bars.map((b) => (
          <CostProfitBarRow key={b.key} bar={b} maxValue={maxValue} isChild={!!b.isPurchaseChild} taxMode={taxMode} narrow={narrow} />
        ))}
      </div>
      {hasPurchaseChildren ? (
        <div style={{ fontSize: narrow ? ".68rem" : ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".32rem", lineHeight: 1.5 }}>
          {PURCHASE_BREAKDOWN_NOTE}
        </div>
      ) : null}
    </>
  );
}

function YearlyCardMetricRow({ label, value, muted, valueStyle }) {
  return (
    <div style={{ padding: ".34rem 0", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" }}>
      <div style={MOBILE_CARD_LABEL_STYLE}>{label}</div>
      <div style={{ ...(muted ? MOBILE_CARD_MUTED_NUMBER_STYLE : MOBILE_CARD_NUMBER_STYLE), ...valueStyle }}>{value}</div>
    </div>
  );
}
function YearlySummaryMetricLine({ label, value, narrow, strong, emphasize, valueStyle }) {
  const labelSize = narrow ? "0.8rem" : "0.82rem";
  const valueSize = strong || emphasize ? (narrow ? "1.1rem" : "1.15rem") : narrow ? "1.02rem" : "1.08rem";
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "baseline", minWidth: 0, fontSize: labelSize, lineHeight: 1.5 }}>
      <span style={{ color: "rgba(240,232,208,0.65)", flexShrink: 0 }}>{label}</span>
      <strong
        style={{
          color: "rgba(240,232,208,0.94)",
          fontSize: valueSize,
          fontWeight: strong || emphasize ? 700 : 600,
          textAlign: "right",
          wordBreak: "break-word",
          fontFamily: SALES_NUMBER_FONT_FAMILY,
          ...SALES_NUMBER_TABULAR,
          ...valueStyle,
        }}
      >
        {value}
      </strong>
    </div>
  );
}
function YearlySummaryBlock({ title, children, narrow, accent }) {
  return (
    <div
      style={{
        padding: ".55rem .62rem",
        borderRadius: 6,
        border: accent ? "1px solid rgba(201,168,76,0.24)" : "1px solid rgba(201,168,76,0.16)",
        background: accent ? "rgba(201,168,76,0.05)" : "rgba(0,0,0,0.12)",
        minWidth: 0,
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: narrow ? "0.74rem" : "0.72rem", color: "rgba(201,168,76,0.88)", fontWeight: 600, marginBottom: ".34rem", letterSpacing: ".04em" }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: ".22rem" }}>{children}</div>
    </div>
  );
}
function YearlySummaryFiveBlocks({ yearlyAnalysis, narrow, dy, pct, pct1, signedDy, formatUnitYen_ }) {
  const a = yearlyAnalysis;
  const landing = a.landing;
  const progressLabel = a.hasFullYearTarget ? "年間進捗率" : "目標設定済み月の達成率";
  const topGrid = narrow ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const subGrid = narrow ? "1fr" : "repeat(2, minmax(0, 1fr))";
  const be = a.breakEvenMonthCounts;
  const landingAccent =
    landing?.hasFullYearTarget && (landing?.targetAchievedOutlook || (landing?.forecastGap != null && landing.forecastGap >= 0))
      ? "#9ec9a8"
      : landing?.hasFullYearTarget
      ? "#dca06a"
      : "#9ec9b8";

  return (
    <div style={{ display: "grid", gap: ".55rem", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: ".45rem", flexWrap: "wrap", marginBottom: ".1rem" }}>
        <div style={{ ...analysisMetricHero(narrow, false), fontSize: narrow ? "1.9rem" : "2rem" }}>{pct(a.yearlyProgressRate)}</div>
        <span style={{ fontSize: narrow ? "0.84rem" : "0.8rem", color: "rgba(240,232,208,0.72)" }}>{progressLabel}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: topGrid, gap: ".55rem" }}>
        <YearlySummaryBlock title="A. 年間進捗" narrow={narrow} accent>
          <YearlySummaryMetricLine narrow={narrow} label="年間売上" value={dy(a.yearlyTotalSales)} emphasize />
          {a.hasFullYearTarget ? (
            <YearlySummaryMetricLine narrow={narrow} label="年間目標" value={dy(a.fullYearTargetSum)} />
          ) : (
            <YearlySummaryMetricLine narrow={narrow} label="設定済み目標の合計" value={dy(a.enteredTargetSum)} />
          )}
          <YearlySummaryMetricLine narrow={narrow} label="目標設定済み月の達成率" value={pct(a.yearlyProgressRate)} strong />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="目標設定済み月数"
            value={`${num(a.enteredTargetMonthCount)}/12ヶ月`}
          />
        </YearlySummaryBlock>
        <YearlySummaryBlock title="B. 年間着地見込み" narrow={narrow}>
          <YearlySummaryMetricLine
            narrow={narrow}
            label="実績月の平均売上"
            value={landing?.avgMonthlySalesFromYearlyTotal != null ? dy(landing.avgMonthlySalesFromYearlyTotal) : "—"}
            emphasize
            valueStyle={{ color: landingAccent }}
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="現在ペースの年間着地見込み"
            value={landing?.paceForecast != null ? dy(landing.paceForecast) : "—"}
            strong
            valueStyle={{ color: landingAccent }}
          />
          {landing?.hasFullYearTarget ? (
            <YearlySummaryMetricLine
              narrow={narrow}
              label="年間目標との差額"
              value={landing?.forecastGap != null ? signedDy(landing.forecastGap) : "—"}
              valueStyle={{
                color: landing?.forecastGap != null ? (landing.forecastGap >= 0 ? "#9ec9a8" : "#dca06a") : undefined,
              }}
            />
          ) : null}
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".06rem" }}>
            ※実績月平均は年間売上合計 ÷ 実績月数（{num(landing?.performanceMonthCount)}ヶ月ベース）
          </div>
        </YearlySummaryBlock>
      </div>
      {be?.actualMonthCount > 0 ? (
        <YearlySummaryBlock title="C. 経営ライン" narrow={narrow}>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: ".2rem .55rem" }}>
            <YearlySummaryMetricLine narrow={narrow} label="損益分岐超え月数" value={`${num(be.aboveBreakEvenCount)}/${num(be.actualMonthCount)}ヶ月`} emphasize />
            <YearlySummaryMetricLine narrow={narrow} label="最低ライン到達月数" value={`${num(be.safeLineCount)}ヶ月`} />
            <YearlySummaryMetricLine narrow={narrow} label="安定ライン超え月数" value={`${num(be.stableLineCount)}ヶ月`} />
            <YearlySummaryMetricLine narrow={narrow} label="かなり良い月数" value={`${num(be.goodLineCount)}ヶ月`} />
            <YearlySummaryMetricLine narrow={narrow} label="強い月数" value={`${num(be.strongLineCount)}ヶ月`} />
          </div>
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".08rem" }}>{BREAK_EVEN_LINE_NOTE}</div>
        </YearlySummaryBlock>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: subGrid, gap: ".55rem" }}>
        <YearlySummaryBlock title="D. 集客・飲食" narrow={narrow}>
          <YearlySummaryMetricLine narrow={narrow} label="年間総集客人数" value={formatCustomerCountLabel_(a.yearlyCustomerCount)} emphasize />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="月平均集客"
            value={a.monthlyAvgCustomerCount != null ? `${num(a.monthlyAvgCustomerCount)}名` : "—"}
            emphasize
          />
          <YearlySummaryMetricLine narrow={narrow} label="年間客単価" value={formatUnitYen_(a.yearlyCustomerUnitPrice)} emphasize />
          <YearlySummaryMetricLine narrow={narrow} label="年間飲食単価" value={formatUnitYen_(a.yearlyFoodDrinkUnitPrice)} emphasize />
          <YearlySummaryMetricLine narrow={narrow} label="年間ドリンク売上" value={dy(a.yearlyDrink)} />
          <YearlySummaryMetricLine narrow={narrow} label="年間フード売上" value={dy(a.yearlyFood)} />
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45 }}>{FOOD_DRINK_UNIT_PRICE_NOTE}</div>
        </YearlySummaryBlock>
        <YearlySummaryBlock title="E. 利益" narrow={narrow}>
          <YearlySummaryMetricLine
            narrow={narrow}
            label="年間営業ベース利益"
            value={dy(a.yearlyOperatingBaseProfit)}
            strong
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="年間営業ベース利益率"
            value={a.yearlyOperatingBaseProfitRate != null ? pct1(a.yearlyOperatingBaseProfitRate) : "—"}
            emphasize
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="年間固定費控除後利益"
            value={a.yearlyFixedCostAdjustedProfit != null ? formatFixedCostAdjustedProfit_(a.yearlyFixedCostAdjustedProfit) : "—"}
            emphasize
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="年間固定費控除後利益率"
            value={formatFixedCostAdjustedProfitRate_(a.yearlyFixedCostAdjustedProfitRate)}
            emphasize
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="固定費控除後利益がプラスの月数"
            value={`${num(a.positiveFixedCostAdjustedMonthCount)}ヶ月`}
          />
          <YearlySummaryMetricLine
            narrow={narrow}
            label="固定費控除後利益100万円超えの月数"
            value={`${num(a.strongFixedCostAdjustedMonthCount)}ヶ月`}
          />
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".04rem" }}>
            {OPERATING_BASE_PROFIT_NOTE}
            <span style={{ display: "block", marginTop: ".12rem" }}>{FIXED_COST_ADJUSTED_PROFIT_NOTE}</span>
            <span style={{ display: "block", marginTop: ".08rem" }}>{FIXED_COST_ADJUSTED_EX_TAX_NOTE}</span>
          </div>
        </YearlySummaryBlock>
      </div>
    </div>
  );
}
function YearlyCheckpointList({ items, narrow }) {
  return (
    <div style={{ display: "grid", gap: ".42rem" }}>
      {items.length === 0 ? (
        <div style={{ fontSize: narrow ? "0.82rem" : "0.8rem", color: "rgba(240,232,208,0.55)" }}>
          大きなチェックポイントはありません。月別経営レビューで各月の状態を確認してください。
        </div>
      ) : (
        items.map((item) => (
          <div
            key={item.key}
            style={{
              padding: ".45rem .55rem",
              borderRadius: 6,
              border: "1px solid rgba(168,118,88,0.18)",
              background: "rgba(0,0,0,0.16)",
              minWidth: 0,
            }}
          >
            <div style={{ fontSize: narrow ? "0.84rem" : "0.82rem", color: "rgba(212,168,138,0.95)", fontWeight: 600, marginBottom: ".18rem" }}>
              {item.title}
              {item.detail ? (
                <span style={{ marginLeft: ".35rem", fontSize: narrow ? "0.76rem" : "0.74rem", fontWeight: 500, color: "rgba(240,232,208,0.62)" }}>
                  {item.detail}
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: narrow ? "0.8rem" : "0.78rem", color: "rgba(240,232,208,0.72)", lineHeight: 1.5 }}>{item.message}</div>
          </div>
        ))
      )}
    </div>
  );
}
function YearlyMonthReviewCard({ row, narrow, dy, pct, pct1, signedDy, formatUnitYen_, onMonthClick }) {
  const muted = row.status !== "集計済み";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onMonthClick(row.targetMonth)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onMonthClick(row.targetMonth);
        }
      }}
      style={{
        opacity: yearlyTableRowOpacity_(row),
        cursor: "pointer",
        padding: ".75rem .82rem",
        borderRadius: 6,
        border: "1px solid rgba(88,128,178,0.28)",
        background: "rgba(0,0,0,0.22)",
        minWidth: 0,
        boxSizing: "border-box",
      }}
      {...yearlyRowHoverHandlers_()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".45rem", flexWrap: "wrap", marginBottom: ".42rem" }}>
        <div style={{ ...MOBILE_CARD_MONTH_TITLE_STYLE, fontSize: narrow ? "1.02rem" : ".98rem" }}>{row.monthLabel}</div>
        <div style={{ display: "flex", alignItems: "center", gap: ".28rem", flexWrap: "wrap" }}>
          <BreakEvenLineBadge breakEvenAnalysis={row.breakEvenAnalysis} compact />
          <FixedCostProfitBadge profit={row.fixedCostAdjustedProfit} compact />
          <YearlyMonthStatusBadge m={row} />
        </div>
      </div>
      <div style={{ display: "grid", gap: ".14rem", marginBottom: ".38rem" }}>
        <YearlyCardMetricRow label="売上" value={dy(row.totalSalesSum)} muted={muted || !row.totalSalesSum} valueStyle={{ fontSize: narrow ? "1.05rem" : "1.02rem" }} />
        <YearlyCardMetricRow label="目標達成率" value={row.progressRate != null ? pct(row.progressRate) : "—"} muted={muted} />
        <YearlyCardMetricRow label="損益分岐" value={row.breakEvenGapLabel} muted={!row.breakEvenAnalysis?.hasActualSales} />
        <YearlyCardMetricRow
          label="固定費後利益"
          value={formatFixedCostAdjustedProfit_(row.fixedCostAdjustedProfit)}
          muted={muted || row.fixedCostAdjustedProfit == null}
          valueStyle={{
            color: row.fixedCostAdjustedProfit != null && row.fixedCostAdjustedProfit < 0 ? "#dca06a" : undefined,
          }}
        />
        <YearlyCardMetricRow
          label="固定費後利益率"
          value={formatFixedCostAdjustedProfitRate_(row.fixedCostAdjustedProfitRate)}
          muted={muted || row.fixedCostAdjustedProfitRate == null}
        />
        <YearlyCardMetricRow label="営業ベース利益" value={dy(row.operatingProfitSum)} muted={muted} />
        <YearlyCardMetricRow label="集客人数" value={formatCustomerCountLabel_(row.customerCountSum)} muted={muted} />
        <YearlyCardMetricRow label="客単価" value={formatUnitYen_(row.customerUnitPrice)} muted={muted} />
        <YearlyCardMetricRow label="飲食単価" value={formatUnitYen_(row.foodDrinkUnitPrice)} muted={muted} />
        <YearlyCardMetricRow
          label="営業ベース利益率"
          value={row.operatingProfitRate != null ? pct1(row.operatingProfitRate) : "—"}
          muted={muted}
        />
        {row.yoyRate != null ? (
          <YearlyCardMetricRow label="前年同月比" value={pct1(row.yoyRate)} muted={false} valueStyle={{ color: row.yoyDiff >= 0 ? "#9ec9a8" : "#dca06a" }} />
        ) : null}
      </div>
      <div style={{ fontSize: narrow ? "0.76rem" : "0.74rem", color: "rgba(240,232,208,0.68)", lineHeight: 1.5, borderTop: "1px dashed rgba(201,168,76,0.14)", paddingTop: ".32rem" }}>
        {row.reviewComment}
      </div>
      <div style={{ fontSize: "0.66rem", color: "rgba(201,168,76,0.55)", marginTop: ".28rem" }}>クリックで月次分析</div>
    </div>
  );
}
function YearlyMonthReviewSection({ rows, narrow, dy, pct, pct1, signedDy, formatUnitYen_, onMonthClick }) {
  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      {rows.map((row) => (
        <YearlyMonthReviewCard
          key={`review_${row.targetMonth}`}
          row={row}
          narrow={narrow}
          dy={dy}
          pct={pct}
          pct1={pct1}
          signedDy={signedDy}
          formatUnitYen_={formatUnitYen_}
          onMonthClick={onMonthClick}
        />
      ))}
    </div>
  );
}
function YearlyMonthReviewTable({ rows, narrow, dy, pct, pct1, formatUnitYen_, onMonthClick, taxMode }) {
  return (
    <div style={YEARLY_TABLE_WRAP}>
      <table style={YEARLY_TABLE_STYLE}>
        <thead>
          <tr>
            <th style={yearlyThStyle_(72, "left")}>月</th>
            <th style={yearlyThStyle_(88)}>売上</th>
            <th style={yearlyThStyle_(72)}>達成率</th>
            <th style={yearlyThStyle_(76, "center")}>経営ライン</th>
            <th style={yearlyThStyle_(120)}>損益分岐</th>
            <th style={yearlyThStyle_(88)}>固定費後利益</th>
            <th style={yearlyThStyle_(72)}>固定費後利益率</th>
            <th style={yearlyThStyle_(76, "center")}>固定費後</th>
            <th style={yearlyThStyle_(72)}>営業ベース利益率</th>
            <th style={yearlyThStyle_(72)}>集客</th>
            <th style={yearlyThStyle_(72)}>客単価</th>
            <th style={yearlyThStyle_(72)}>飲食単価</th>
            <th style={yearlyThStyle_(72)}>前年比</th>
            <th style={yearlyThStyle_(200, "left")}>評価コメント</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`review_tbl_${row.targetMonth}`}
              style={{ ...YEARLY_TABLE_ROW, opacity: yearlyTableRowOpacity_(row), cursor: "pointer" }}
              onClick={() => onMonthClick(row.targetMonth)}
              title="クリックで月次分析へ"
              {...yearlyRowHoverHandlers_()}
            >
              <td style={yearlyMonthTdStyle_(72)}>{row.monthLabel}</td>
              <YearlyTableNumberCell m={row} value={row.totalSalesSum} width={88} taxMode={taxMode} />
              <YearlyTableNumberCell m={row} value={row.progressRate} kind="pct" width={72} />
              <td style={yearlyNumTdStyle_(76, !row.breakEvenAnalysis?.hasActualSales)}>
                <BreakEvenLineBadge breakEvenAnalysis={row.breakEvenAnalysis} compact />
              </td>
              <td style={{ ...yearlyNumTdStyle_(120, !row.breakEvenAnalysis?.hasActualSales), fontSize: ".72rem", textAlign: "right" }}>
                {row.breakEvenGapLabel}
              </td>
              <td style={yearlyNumTdStyle_(88, row.fixedCostAdjustedProfit == null)}>
                {formatFixedCostAdjustedProfit_(row.fixedCostAdjustedProfit)}
              </td>
              <td style={yearlyNumTdStyle_(72, row.fixedCostAdjustedProfitRate == null)}>
                {formatFixedCostAdjustedProfitRate_(row.fixedCostAdjustedProfitRate)}
              </td>
              <td style={yearlyNumTdStyle_(76, row.fixedCostAdjustedProfit == null)}>
                <FixedCostProfitBadge profit={row.fixedCostAdjustedProfit} compact />
              </td>
              <YearlyTableNumberCell m={row} value={row.operatingProfitRate} kind="pct" width={72} />
              <td style={yearlyNumTdStyle_(72, row.status !== "集計済み")}>{formatCustomerCountLabel_(row.customerCountSum)}</td>
              <td style={yearlyNumTdStyle_(72, row.status !== "集計済み")}>{formatUnitYen_(row.customerUnitPrice)}</td>
              <td style={yearlyNumTdStyle_(72, row.status !== "集計済み")}>{formatUnitYen_(row.foodDrinkUnitPrice)}</td>
              <td style={yearlyNumTdStyle_(72, row.yoyRate == null)}>
                {row.yoyRate != null ? pct1(row.yoyRate) : "—"}
              </td>
              <td style={{ ...yearlyMonthTdStyle_(200), fontSize: ".72rem", color: "rgba(240,232,208,0.68)", lineHeight: 1.45 }}>
                {row.reviewComment}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function YearlyMonthStatusBadge({ m }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: ".62rem",
        fontWeight: 500,
        lineHeight: 1.25,
        padding: ".06rem .3rem",
        borderRadius: 2,
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
            ? "rgba(232,160,160,0.75)"
            : m.status === "集計済み"
            ? "rgba(158,201,168,0.88)"
            : m.status === "予定あり"
            ? "rgba(200,180,120,0.62)"
            : "rgba(200,195,175,0.5)",
        opacity: m.status === "未入力" || m.status === "予定あり" ? 0.85 : 1,
      }}
    >
      {m.status}
    </span>
  );
}
function BreakEvenLineBadge({ breakEvenAnalysis, compact = false }) {
  const be = breakEvenAnalysis;
  if (!be?.hasActualSales || !be.badge) return null;
  const tone = breakEvenLineBadgeTone_(be.tierKey);
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: compact ? ".6rem" : ".62rem",
        fontWeight: 600,
        lineHeight: 1.25,
        padding: compact ? ".05rem .28rem" : ".06rem .34rem",
        borderRadius: 999,
        border: `1px solid ${tone.bd}`,
        background: tone.bg,
        color: tone.tx,
        whiteSpace: "nowrap",
      }}
    >
      {be.badge}
    </span>
  );
}
function BreakEvenMonthlySummaryBlock({ breakEvenAnalysis, fixedCostAdjustedProfit, fixedCostAdjustedProfitRate, narrow }) {
  const be = breakEvenAnalysis;
  if (!be) return null;
  const tone = be.tierKey ? breakEvenLineBadgeTone_(be.tierKey) : null;
  const gapLabel = be.gapFromBreakEven >= 0 ? "超過" : "不足";
  const gapValue =
    be.gapFromBreakEven != null
      ? be.gapFromBreakEven >= 0
        ? formatSignedExTaxYen_(be.gapFromBreakEven)
        : formatExTaxYen_(Math.abs(be.gapFromBreakEven))
      : "—";

  return (
    <div
      style={{
        padding: ".55rem .62rem",
        borderRadius: 6,
        border: `1px solid ${tone?.bd || "rgba(201,168,76,0.22)"}`,
        background: tone?.bg || "rgba(0,0,0,0.14)",
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: narrow ? "0.72rem" : "0.7rem", color: "rgba(201,168,76,0.85)", fontWeight: 600, marginBottom: ".35rem", letterSpacing: ".04em" }}>
        経営ライン
      </div>
      {be.hasActualSales ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: ".4rem", flexWrap: "wrap", marginBottom: ".38rem" }}>
            <span style={{ fontSize: narrow ? "0.8rem" : "0.78rem", color: "rgba(240,232,208,0.65)" }}>判定</span>
            <BreakEvenLineBadge breakEvenAnalysis={be} />
            {be.label ? (
              <span style={{ fontSize: narrow ? "0.88rem" : "0.86rem", color: tone?.tx || "rgba(240,232,208,0.9)", fontWeight: 700 }}>{be.label}</span>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: ".22rem", fontSize: narrow ? "0.84rem" : "0.82rem", lineHeight: 1.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", minWidth: 0 }}>
              <span style={{ color: "rgba(240,232,208,0.6)" }}>損益分岐目安</span>
              <strong style={{ color: "rgba(240,232,208,0.92)", fontSize: narrow ? "1.02rem" : "1rem", wordBreak: "break-word", textAlign: "right" }}>税抜 {formatExTaxYen_(be.breakEvenLineExTax)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", minWidth: 0 }}>
              <span style={{ color: "rgba(240,232,208,0.6)" }}>現在</span>
              <strong style={{ color: "rgba(240,232,208,0.96)", fontSize: narrow ? "1.1rem" : "1.05rem", wordBreak: "break-word", textAlign: "right" }}>
                税抜 {formatExTaxYen_(be.exTaxSales)}
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", minWidth: 0 }}>
              <span style={{ color: "rgba(240,232,208,0.6)" }}>損益分岐まで{gapLabel === "超過" ? "の超過" : ""}</span>
              <strong style={{ color: gapLabel === "超過" ? "#9ec9a8" : "#dca06a", fontSize: narrow ? "1.02rem" : "1rem", wordBreak: "break-word", textAlign: "right" }}>{gapValue}</strong>
            </div>
            {fixedCostAdjustedProfit != null ? (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", minWidth: 0, marginTop: ".12rem", paddingTop: ".18rem", borderTop: "1px dashed rgba(201,168,76,0.14)" }}>
                  <span style={{ color: "rgba(240,232,208,0.6)" }}>固定費控除後利益</span>
                  <strong style={{ color: fixedCostAdjustedProfit >= 0 ? "#9ec9a8" : "#dca06a", fontSize: narrow ? "1.02rem" : "1rem", textAlign: "right" }}>
                    {formatFixedCostAdjustedProfit_(fixedCostAdjustedProfit)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", minWidth: 0 }}>
                  <span style={{ color: "rgba(240,232,208,0.6)" }}>利益率</span>
                  <strong style={{ color: "rgba(240,232,208,0.92)", fontSize: narrow ? "1rem" : ".98rem", textAlign: "right" }}>
                    {formatFixedCostAdjustedProfitRate_(fixedCostAdjustedProfitRate)}
                  </strong>
                </div>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <div style={{ fontSize: narrow ? "0.82rem" : "0.8rem", color: "rgba(240,232,208,0.6)", lineHeight: 1.55 }}>
          実績売上がないため、損益分岐判定はまだ出せません。
        </div>
      )}
      <div style={analysisNote({ marginTop: ".32rem" }, narrow)}>
        {BREAK_EVEN_LINE_NOTE}
        {fixedCostAdjustedProfit != null ? (
          <span style={{ display: "block", marginTop: ".1rem" }}>{FIXED_COST_ADJUSTED_EX_TAX_NOTE}</span>
        ) : null}
      </div>
    </div>
  );
}
function SummaryMetricLine({ label, value, valueStyle, strong, narrow, emphasize }) {
  const labelSize = narrow ? "0.78rem" : "0.82rem";
  const valueSize = strong || emphasize ? (narrow ? "1.12rem" : "1.18rem") : narrow ? "1.02rem" : "1.1rem";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: ".5rem",
        alignItems: "baseline",
        minWidth: 0,
        maxWidth: "100%",
        fontSize: labelSize,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: "rgba(240,232,208,0.65)", flexShrink: 0 }}>{label}</span>
      <strong
        style={{
          color: "rgba(240,232,208,0.94)",
          fontSize: valueSize,
          fontWeight: strong || emphasize ? 700 : 600,
          wordBreak: "break-word",
          textAlign: "right",
          fontFamily: SALES_NUMBER_FONT_FAMILY,
          ...SALES_NUMBER_TABULAR,
          ...valueStyle,
        }}
      >
        {value}
      </strong>
    </div>
  );
}
function SummarySubCard({ title, children, accent, narrow }) {
  return (
    <div
      style={{
        padding: ".5rem .58rem",
        borderRadius: 6,
        border: accent ? "1px solid rgba(201,168,76,0.24)" : "1px solid rgba(201,168,76,0.16)",
        background: accent ? "rgba(201,168,76,0.05)" : "rgba(0,0,0,0.12)",
        minWidth: 0,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontSize: narrow ? "0.72rem" : "0.7rem", color: "rgba(201,168,76,0.85)", fontWeight: 600, marginBottom: ".32rem", letterSpacing: ".04em" }}>{title}</div>
      <div style={{ display: "grid", gap: ".2rem" }}>{children}</div>
    </div>
  );
}
function MonthlySummaryPanel({ monthlyAnalysis, narrow, dy, pct, pct1, signedDy }) {
  const a = monthlyAnalysis;
  const tone = achievementTone(a.monthlyProgressRate, a.fullMonthTargetSalesSum > 0);
  const targetReached = a.fullMonthTargetSalesSum > 0 && a.totalSalesSum >= a.fullMonthTargetSalesSum;
  const targetGapLabel = targetReached ? "目標超過" : "目標まで";
  const targetGapValue = targetReached
    ? `+${dy(Math.abs(a.totalSalesSum - a.fullMonthTargetSalesSum))}`
    : dy(Math.max(0, a.fullMonthTargetSalesSum - a.totalSalesSum));
  const topGrid = narrow ? "1fr" : "minmax(0, 1.1fr) minmax(0, .9fr)";
  const subGrid = narrow ? "1fr" : "repeat(2, minmax(0, 1fr))";

  return (
    <div style={{ display: "grid", gap: ".55rem", minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: topGrid, gap: ".55rem", minWidth: 0, maxWidth: "100%" }}>
        <SummarySubCard title="進捗・売上" accent narrow={narrow}>
          <div style={{ display: "flex", alignItems: "baseline", gap: ".45rem", flexWrap: "wrap", marginBottom: ".15rem" }}>
            <div style={{ fontSize: narrow ? "1.35rem" : "1.28rem", fontWeight: 700, color: "#f0e8d0", lineHeight: 1.2 }}>{pct(a.monthlyProgressRate)}</div>
            <span
              style={{
                fontSize: ".72rem",
                fontWeight: 700,
                padding: ".14rem .5rem",
                borderRadius: 999,
                background: tone.chipBg,
                border: `1px solid ${tone.chipBd}`,
                color: tone.chipTx,
              }}
            >
              {tone.label}
            </span>
          </div>
          <SummaryMetricLine narrow={narrow} label="月間進捗率" value={pct(a.monthlyProgressRate)} />
          <SummaryMetricLine narrow={narrow} label={targetGapLabel} value={targetGapValue} strong valueStyle={{ color: "#f3ead2" }} />
          <SummaryMetricLine narrow={narrow} label="月間売上 / 目標" value={`${dy(a.totalSalesSum)} / ${dy(a.fullMonthTargetSalesSum)}`} emphasize />
          <SummaryMetricLine narrow={narrow} label="実績日達成率" value={pct(a.actualAchievementRate)} />
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".08rem" }}>
            実績日ベース目標 {dy(a.actualTargetSalesSum)}
          </div>
        </SummarySubCard>
        <BreakEvenMonthlySummaryBlock
          breakEvenAnalysis={a.breakEvenAnalysis}
          fixedCostAdjustedProfit={a.fixedCostAdjustedProfit}
          fixedCostAdjustedProfitRate={a.fixedCostAdjustedProfitRate}
          narrow={narrow}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: subGrid, gap: ".55rem", minWidth: 0, maxWidth: "100%" }}>
        <SummarySubCard title="集客・単価" narrow={narrow}>
          <SummaryMetricLine narrow={narrow} label="月間総集客" value={formatCustomerCountLabel_(a.customerCountSum)} emphasize />
          <SummaryMetricLine
            narrow={narrow}
            label="1日平均集客"
            value={a.avgDailyCustomerCount != null ? `${num(a.avgDailyCustomerCount)}名` : "—"}
            emphasize
          />
          <SummaryMetricLine narrow={narrow} label="客単価" value={formatUnitYen_(a.customerUnitPrice)} emphasize />
          <SummaryMetricLine narrow={narrow} label="飲食単価" value={formatUnitYen_(a.foodDrinkUnitPrice)} emphasize />
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".1rem" }}>
            {FOOD_DRINK_UNIT_PRICE_NOTE}
          </div>
        </SummarySubCard>
        <SummarySubCard title="利益" narrow={narrow}>
          <SummaryMetricLine narrow={narrow} label="営業ベース利益" value={dy(a.operatingProfitSum)} emphasize />
          <SummaryMetricLine narrow={narrow} label="営業ベース利益率" value={pct(a.operatingProfitRate)} emphasize />
          <SummaryMetricLine
            narrow={narrow}
            label="固定費控除後利益"
            value={formatFixedCostAdjustedProfit_(a.fixedCostAdjustedProfit)}
            strong
            valueStyle={{
              color: a.fixedCostAdjustedProfit != null && a.fixedCostAdjustedProfit < 0 ? "#dca06a" : undefined,
            }}
          />
          <SummaryMetricLine
            narrow={narrow}
            label="固定費控除後利益率"
            value={formatFixedCostAdjustedProfitRate_(a.fixedCostAdjustedProfitRate)}
            emphasize
          />
          <div style={{ fontSize: narrow ? "0.68rem" : "0.66rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.45, marginTop: ".08rem" }}>
            {OPERATING_BASE_PROFIT_NOTE}
            <span style={{ display: "block", marginTop: ".1rem" }}>{FIXED_COST_ADJUSTED_PROFIT_NOTE}</span>
            <span style={{ display: "block", marginTop: ".08rem" }}>{FIXED_COST_ADJUSTED_EX_TAX_NOTE}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: ".18rem .45rem", marginTop: ".18rem", fontSize: narrow ? "0.72rem" : "0.7rem", color: "rgba(240,232,208,0.55)" }}>
            <span>実績 {num(a.actualDayCount)}日</span>
            <span>予定 {num(a.futureDayCount)}件</span>
            <span>日平均 {dy(a.avgDailySales)}</span>
          </div>
        </SummarySubCard>
      </div>

      <div
        style={{
          padding: ".45rem .55rem",
          borderRadius: 6,
          border: "1px dashed rgba(201,168,76,0.14)",
          background: "rgba(0,0,0,0.08)",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        <div style={{ fontSize: narrow ? "0.72rem" : "0.7rem", color: "rgba(201,168,76,0.7)", marginBottom: ".22rem", fontWeight: 600 }}>前年同月比較（2025年固定）</div>
        <div style={{ display: "grid", gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: ".2rem .55rem", fontSize: narrow ? "0.84rem" : "0.82rem", color: "rgba(240,232,208,0.72)" }}>
          <div>
            前年同月売上 <strong style={{ color: "rgba(240,232,208,0.9)", fontSize: narrow ? "1.02rem" : "1rem" }}>{a.priorYearMonth.prevMonthSales != null ? dy(a.priorYearMonth.prevMonthSales) : "—"}</strong>
          </div>
          <div>
            前年同月差額{" "}
            <strong
              style={{
                fontSize: narrow ? "1.02rem" : "1rem",
                color:
                  a.priorYearMonth.prevMonthDiff != null ? (a.priorYearMonth.prevMonthDiff >= 0 ? "#9ec9a8" : "#dca06a") : "rgba(240,232,208,0.9)",
              }}
            >
              {a.priorYearMonth.prevMonthDiff != null ? signedDy(a.priorYearMonth.prevMonthDiff) : "—"}
            </strong>
          </div>
          <div>
            前年同月比 <strong style={{ color: "rgba(240,232,208,0.9)", fontSize: narrow ? "1.02rem" : "1rem" }}>{a.priorYearMonth.prevMonthRate != null ? pct1(a.priorYearMonth.prevMonthRate) : "—"}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
function YearlyMonthCardsBasic({ monthRows, onMonthClick, taxMode, dy }) {
  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      {monthRows.map((m) => {
        const salesCell = yearlyTableYenCell_(m, m.totalSalesSum, taxMode);
        const targetCell = yearlyTableYenCell_(m, m.targetSalesSum, taxMode);
        const foodCell = yearlyTableYenCell_(m, m.foodDrinkSalesIncludingBandSum, taxMode);
        const profitCell = yearlyTableYenCell_(m, m.operatingProfitSum, taxMode);
        const laborCell = yearlyTableYenCell_(m, m.laborCostSum, taxMode);
        const progressCell = yearlyTablePctCell_(m, m.progressRate);
        return (
          <div
            key={`${m.targetMonth}_card_basic`}
            role="button"
            tabIndex={0}
            onClick={() => onMonthClick(m.targetMonth)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMonthClick(m.targetMonth);
              }
            }}
            style={{
              opacity: yearlyTableRowOpacity_(m),
              cursor: "pointer",
              padding: ".85rem .9rem",
              borderRadius: 6,
              border: "1px solid rgba(88,128,178,0.28)",
              background: "rgba(0,0,0,0.22)",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            }}
            {...yearlyRowHoverHandlers_()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem", gap: ".5rem", flexWrap: "wrap" }}>
              <div style={MOBILE_CARD_MONTH_TITLE_STYLE}>{m.monthLabel}</div>
              <div style={{ display: "flex", alignItems: "center", gap: ".28rem", flexWrap: "wrap" }}>
                <BreakEvenLineBadge breakEvenAnalysis={m.breakEvenAnalysis} compact />
                <YearlyMonthStatusBadge m={m} />
              </div>
            </div>
            <YearlyCardMetricRow label="売上" value={salesCell.text} muted={salesCell.muted} />
            <YearlyCardMetricRow label="目標" value={targetCell.text} muted={targetCell.muted} />
            <YearlyCardMetricRow label="進捗率" value={progressCell.text} muted={progressCell.muted} />
            <YearlyCardMetricRow
              label="経営ライン"
              value={m.breakEvenAnalysis?.hasActualSales ? m.breakEvenAnalysis.label || "—" : "—"}
              muted={!m.breakEvenAnalysis?.hasActualSales}
            />
            <YearlyCardMetricRow label="飲食" value={foodCell.text} muted={foodCell.muted} />
            <YearlyCardMetricRow label="営業利益" value={profitCell.text} muted={profitCell.muted} />
            <YearlyCardMetricRow label="人件費" value={laborCell.text} muted={laborCell.muted} />
            <YearlyCardMetricRow
              label="バータイム人数"
              value={m.status === "集計済み" ? formatCustomerCountLabel_(m.barTimeCustomerCountSum) : "—"}
              muted={m.status !== "集計済み"}
            />
          </div>
        );
      })}
    </div>
  );
}
function YearlyMonthCardsPurchase({ monthRows, onMonthClick, taxMode }) {
  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      {monthRows.map((m) => {
        const purchaseCell = yearlyTableYenCell_(m, m.purchaseTotalSum, taxMode);
        const drinkCell = yearlyTableYenCell_(m, m.drinkPurchaseSum, taxMode);
        const foodCell = yearlyTableYenCell_(m, m.foodPurchaseSum, taxMode);
        const totalRate = yearlyTablePctCell_(m, m.purchaseCostRates?.totalPurchaseRate);
        const drinkRate = yearlyTablePctCell_(m, m.purchaseCostRates?.drinkCostRate);
        const foodRate = yearlyTablePctCell_(m, m.purchaseCostRates?.foodCostRate);
        return (
          <div
            key={`${m.targetMonth}_card_purchase`}
            role="button"
            tabIndex={0}
            onClick={() => onMonthClick(m.targetMonth)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMonthClick(m.targetMonth);
              }
            }}
            style={{
              opacity: yearlyTableRowOpacity_(m),
              cursor: "pointer",
              padding: ".85rem .9rem",
              borderRadius: 6,
              border: "1px solid rgba(88,128,178,0.28)",
              background: "rgba(0,0,0,0.22)",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            }}
            {...yearlyRowHoverHandlers_()}
          >
            <div style={{ ...MOBILE_CARD_MONTH_TITLE_STYLE, marginBottom: ".5rem" }}>{m.monthLabel}</div>
            <YearlyCardMetricRow label="仕入れ合計" value={purchaseCell.text} muted={purchaseCell.muted} />
            <YearlyCardMetricRow label="ドリンク仕入れ" value={drinkCell.text} muted={drinkCell.muted} />
            <YearlyCardMetricRow label="フード仕入れ" value={foodCell.text} muted={foodCell.muted} />
            <YearlyCardMetricRow label="総仕入率" value={totalRate.text} muted={totalRate.muted} />
            <YearlyCardMetricRow label="ドリンク原価率" value={drinkRate.text} muted={drinkRate.muted} />
            <YearlyCardMetricRow label="フード原価率" value={foodRate.text} muted={foodRate.muted} />
          </div>
        );
      })}
    </div>
  );
}
function YearlyYoYMonthCards({ rows, onMonthClick, dy, pct1, signedDy }) {
  return (
    <div style={{ display: "grid", gap: ".55rem" }}>
      {rows.map((r) => {
        const diffMuted = r.currentSales === 0 && r.prevSales === 0;
        const diffColor = r.diff > 0 ? "#9ec9a8" : r.diff < 0 ? "#dca06a" : undefined;
        return (
          <div
            key={`${r.targetMonth}_card_yoy`}
            role="button"
            tabIndex={0}
            onClick={() => onMonthClick(r.targetMonth)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMonthClick(r.targetMonth);
              }
            }}
            style={{
              opacity: yearlyYoYRowOpacity_(r),
              cursor: "pointer",
              padding: ".85rem .9rem",
              borderRadius: 6,
              border: "1px solid rgba(88,128,178,0.28)",
              background: "rgba(0,0,0,0.22)",
              width: "100%",
              maxWidth: "100%",
              minWidth: 0,
              boxSizing: "border-box",
            }}
            {...yearlyRowHoverHandlers_()}
          >
            <div style={{ ...MOBILE_CARD_MONTH_TITLE_STYLE, marginBottom: ".5rem" }}>{r.monthLabel}</div>
            <YearlyCardMetricRow label="今年売上" value={dy(r.currentSales)} muted={r.currentSales === 0} />
            <YearlyCardMetricRow label="前年売上" value={dy(r.prevSales)} muted={false} />
            <YearlyCardMetricRow label="差額" value={signedDy(r.diff)} muted={diffMuted} valueStyle={diffColor ? { color: diffColor } : undefined} />
            <YearlyCardMetricRow
              label="前年比"
              value={r.yoyRate != null ? pct1(r.yoyRate) : "—"}
              muted={r.yoyRate == null}
              valueStyle={diffColor ? { color: diffColor } : undefined}
            />
          </div>
        );
      })}
    </div>
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
              ? "rgba(232,160,160,0.75)"
              : m.status === "集計済み"
              ? "rgba(158,201,168,0.88)"
              : m.status === "予定あり"
              ? "rgba(200,180,120,0.62)"
              : "rgba(200,195,175,0.5)",
          opacity: m.status === "未入力" || m.status === "予定あり" ? 0.85 : 1,
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
  const [roleMode, setRoleMode] = useState("staff"); // staff | admin（起動時は常に現場表示）
  const [taxMode, setTaxMode] = useState(() => readSalesTaxMode()); // gross | net
  const [adminTab, setAdminTab] = useState(() => readSalesAdminTab()); // daily | analysis | yearly
  const [targetYear, setTargetYear] = useState(2026);
  const [yearlyLoading, setYearlyLoading] = useState(false);
  const [yearlyMonthData, setYearlyMonthData] = useState([]);
  const [selectedTrendRowKey, setSelectedTrendRowKey] = useState("");
  const dayReportRef = useRef(null);
  const pendingReportReferenceRef = useRef(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const currentBusinessDate = getCurrentBusinessDateForSales();
  const vp = useSalesViewport();

  const loadSales = async (monthArg) => {
    const month = normalizeMonth(monthArg || targetMonth);
    setLoading(true);
    setError("");
    try {
      const url = buildSalesFetchUrl_(month);
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
    clearLegacySalesAdminUnlocked_();
  }, []);
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
      if (roleMode === "staff") {
        localStorage.setItem(SALES_ROLE_MODE_KEY, "staff");
      }
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
    if (roleMode !== "admin") return undefined;
    if (adminTab !== "yearly" && adminTab !== "analysis") return undefined;
    let cancelled = false;
    const year =
      adminTab === "yearly"
        ? targetYear
        : Number(String(targetMonth).slice(0, 4)) || targetYear;
    const months = buildYearMonths_(year);
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
  }, [roleMode, adminTab, targetYear, targetMonth]);
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
    const { actualRows } = partitionMonthRowsForSales_(monthRows, currentBusinessDate);
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
    const { actualRows, futureRows } = partitionMonthRowsForSales_(monthRows, currentBusinessDate);

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
    const customerCountSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, CUSTOMER_COUNT_KEYS), 0);
    const barTimeCustomerCountSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAR_TIME_CUSTOMER_COUNT_KEYS), 0);
    const liveTimeCustomerCountSum = deriveLiveTimeCustomerCount_(customerCountSum, barTimeCustomerCountSum);
    const barTimeCustomerRate = calcRate(barTimeCustomerCountSum, customerCountSum);
    const hasBandDrinkBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_DRINK_SALES_KEYS) != null);
    const hasBandFoodBreakdown = actualRows.some((r) => pickMetricNullable(r?.metrics, BAND_FOOD_SALES_KEYS) != null);
    const bandDrinkSalesSum = hasBandDrinkBreakdown
      ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_DRINK_SALES_KEYS), 0)
      : null;
    const bandFoodSalesSum = hasBandFoodBreakdown
      ? actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, BAND_FOOD_SALES_KEYS), 0)
      : null;
    const venueFeeSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, VENUE_FEE_KEYS), 0);
    const rentalSalesSum = actualRows.reduce((s, r) => s + pickMetricValue(r?.metrics, RENTAL_SALES_KEYS), 0);
    const customerUnitPrice = unitPriceByCustomerCount_(totalSalesSum, customerCountSum);
    const unitPrices = buildUnitPriceMetrics_({
      totalSales: totalSalesSum,
      customerCount: customerCountSum,
      drinkSales: drinkSalesSum,
      foodSales: foodSalesSum,
      foodDrinkSales: foodDrinkSalesSum,
      bandFoodDrinkSales: bandFoodDrinkSalesSum,
      venueFee: venueFeeSum,
      rentalSales: rentalSalesSum,
    });
    const normalCustomerUnitPrice = unitPrices.normalCustomerUnitPrice;
    const foodDrinkUnitPrice = unitPrices.foodDrinkUnitPrice;
    const foodDrinkUnitPriceIncludingBand = unitPrices.foodDrinkUnitPriceIncludingBand;
    const normalFoodDrinkUnitPrice = unitPrices.normalFoodDrinkUnitPrice;
    const customerUnitPriceExVenue = unitPrices.customerUnitPriceExVenue;
    const normalCustomerUnitPriceExVenue = unitPrices.normalCustomerUnitPriceExVenue;
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
    const operatingGrossProfitSum = calcOperatingGrossProfit_(totalSalesSum, purchaseTotalSum, expenseSum);
    const operatingGrossProfitRate = calcRate(operatingGrossProfitSum, totalSalesSum);
    const priorYearMonth = buildMonthlyPriorYearComparison_(targetMonth, totalSalesSum);
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
        const customerCount = pickMetricNullable(r?.metrics, CUSTOMER_COUNT_KEYS);
        const barTimeCustomerCount = barTimeCustomerCountFromMetrics_(r?.metrics);
        const liveTimeCustomerCount = deriveLiveTimeCustomerCount_(customerCount, barTimeCustomerCount);
        const barTimeCustomerRate = calcRate(barTimeCustomerCount, customerCount);
        const bandFoodDrinkSales = pickMetricNullable(r?.metrics, BAND_FOOD_DRINK_SALES_KEYS);
        const foodDrinkSalesBase = r?.metrics?.foodDrinkSales != null ? Number(r.metrics.foodDrinkSales) : null;
        const foodDrinkSalesIncludingBand = foodDrinkSalesIncludingBand_(foodDrinkSalesBase, bandFoodDrinkSales);
        const drinkSalesVal = r?.metrics?.drinkSales != null ? Number(r.metrics.drinkSales) : null;
        const foodSalesVal = r?.metrics?.foodSales != null ? Number(r.metrics.foodSales) : null;
        const venueFeeVal = pickMetricNullable(r?.metrics, VENUE_FEE_KEYS);
        const rentalSalesVal = pickMetricNullable(r?.metrics, RENTAL_SALES_KEYS);
        const unitPrices = buildUnitPriceMetrics_({
          totalSales,
          customerCount,
          drinkSales: drinkSalesVal,
          foodSales: foodSalesVal,
          foodDrinkSales: foodDrinkSalesBase,
          bandFoodDrinkSales: bandFoodDrinkSales,
          venueFee: venueFeeVal,
          rentalSales: rentalSalesVal,
        });
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
          foodDrinkSalesBase,
          foodDrinkSalesIncludingBand,
          drinkSales: drinkSalesVal,
          foodSales: foodSalesVal,
          customerCount,
          barTimeCustomerCount,
          liveTimeCustomerCount,
          barTimeCustomerRate,
          customerUnitPrice: unitPrices.customerUnitPrice,
          normalCustomerUnitPrice: unitPrices.normalCustomerUnitPrice,
          foodDrinkUnitPrice: unitPrices.foodDrinkUnitPrice,
          foodDrinkUnitPriceIncludingBand: unitPrices.foodDrinkUnitPriceIncludingBand,
          normalFoodDrinkUnitPrice: unitPrices.normalFoodDrinkUnitPrice,
          customerUnitPriceExVenue: unitPrices.customerUnitPriceExVenue,
          normalCustomerUnitPriceExVenue: unitPrices.normalCustomerUnitPriceExVenue,
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
          venueFee: venueFeeVal,
          rentalSales: rentalSalesVal,
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
      { key: "profit", label: "営業ベース利益", value: operatingProfitSum, tone: "linear-gradient(90deg, rgba(126,200,126,0.92), rgba(126,200,126,0.58))", note: "" },
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
    const underTargetCauseAnalysis = buildUnderTargetCauseAnalysis_(
      underTargetRows,
      {
        avgDailyCustomerCount: actualDayCount > 0 ? customerCountSum / actualDayCount : null,
        customerUnitPrice,
        avgDailySales,
        avgFoodDrinkRate: calcRate(foodDrinkSalesIncludingBandSum, totalSalesSum),
      },
      (r) => resolveEventNameForAdmin(r, r.resolvedEventNames) || "イベント未登録"
    );
    const breakEvenAnalysis = buildBreakEvenAnalysis_(totalSalesSum);
    const fixedCostAdjusted = calcFixedCostAdjustedProfitFromGrossSales_(totalSalesSum);

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
      customerCountSum,
      barTimeCustomerCountSum,
      liveTimeCustomerCountSum,
      barTimeCustomerRate,
      avgDailyCustomerCount: actualDayCount > 0 ? customerCountSum / actualDayCount : null,
      customerUnitPrice,
      normalCustomerUnitPrice,
      foodDrinkUnitPrice,
      foodDrinkUnitPriceIncludingBand,
      normalFoodDrinkUnitPrice,
      customerUnitPriceExVenue,
      normalCustomerUnitPriceExVenue,
      hasVenueFeeInMonth: unitPrices.hasVenueFee,
      avgDailySales,
      operatingProfitSum,
      operatingProfitRate,
      operatingGrossProfitSum,
      operatingGrossProfitRate,
      priorYearMonth,
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
      underTargetCauseAnalysis,
      validTargetRows,
      underTargetRows,
      salesRankingTop5,
      underTargetWorst5,
      foodDrinkRankingTop10,
      drinkRankingTop10,
      foodRankingTop10,
      breakEvenAnalysis,
      fixedCostAdjustedProfit: fixedCostAdjusted.profit,
      fixedCostAdjustedProfitRate: fixedCostAdjusted.rate,
    };
  }, [rows, events, targetMonth, currentBusinessDate, monthlySummary]);
  useEffect(() => {
    if (!monthlyAnalysis.dailyTrendRows.length) {
      setSelectedTrendRowKey("");
      return;
    }
    if (pendingReportReferenceRef.current) {
      const resolvedKey = resolveTrendRowKeyForReference_(
        pendingReportReferenceRef.current,
        monthlyAnalysis.dailyTrendRows
      );
      if (resolvedKey && monthlyAnalysis.dailyTrendRows.some((r) => r.rowKey === resolvedKey)) {
        pendingReportReferenceRef.current = null;
        setSelectedTrendRowKey(resolvedKey);
        window.setTimeout(() => {
          dayReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 60);
        return;
      }
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
  const comparisonPastMonthsReady = useMemo(() => {
    const year = String(targetMonth).slice(0, 4);
    return (yearlyMonthData || []).some(
      (item) => item?.ok && item.month !== targetMonth && String(item.month || "").startsWith(year)
    );
  }, [yearlyMonthData, targetMonth]);
  const pastComparablePool = useMemo(() => {
    const pool = [];
    const seen = new Set();
    const pushComparable = (record, idx) => {
      const withMeta = {
        ...record,
        _idx: record?._idx != null ? record._idx : idx,
        resolvedEventNames: record.resolvedEventNames || eventNamesForDate(events, record.businessDate),
      };
      const comparable = recordToPastComparableDay_(withMeta, events);
      if (!comparable?.rowKey || seen.has(comparable.rowKey)) return;
      seen.add(comparable.rowKey);
      pool.push(comparable);
    };
    for (const record of monthlyAnalysis.actualRows || []) {
      pushComparable(record, record._idx);
    }
    for (const item of yearlyMonthData || []) {
      if (!item?.ok || !item?.month || item.month === targetMonth) continue;
      (item.records || []).forEach((record, idx) => {
        if (record?.metrics?.totalSales == null) return;
        pushComparable(record, idx);
      });
    }
    return pool;
  }, [monthlyAnalysis.actualRows, yearlyMonthData, events, targetMonth]);
  const selectedPastSimilarComparison = useMemo(() => {
    if (!selectedTrendRow) return null;
    const selectedRecord = (monthlyAnalysis.actualRows || []).find(
      (record) => `${record.businessDate}_${record.sourceBlock}_${record.sourceColumn}_${record._idx}` === selectedTrendRow.rowKey
    );
    const selected =
      selectedRecord != null
        ? recordToPastComparableDay_(
            {
              ...selectedRecord,
              resolvedEventNames:
                selectedRecord.resolvedEventNames || eventNamesForDate(events, selectedRecord.businessDate),
            },
            events
          )
        : trendRowToPastComparableDay_(selectedTrendRow, events);
    return buildPastSimilarComparison_(selected, pastComparablePool, taxMode, {
      pastMonthsDataLoaded: comparisonPastMonthsReady,
      yearlyLoading,
    });
  }, [
    selectedTrendRow,
    monthlyAnalysis.actualRows,
    pastComparablePool,
    events,
    taxMode,
    comparisonPastMonthsReady,
    yearlyLoading,
  ]);
  const selectedDayAnalysis = useMemo(() => {
    if (!selectedTrendRow) return null;
    const dayCount = monthlyAnalysis.actualDayCount || 0;
    return buildSelectedDayAnalysis_(
      selectedTrendRow,
      {
        avgDailyCustomerCount: monthlyAnalysis.avgDailyCustomerCount,
        customerUnitPrice: monthlyAnalysis.customerUnitPrice,
        avgFoodDrinkRate: calcRate(monthlyAnalysis.foodDrinkSalesIncludingBandSum, monthlyAnalysis.totalSalesSum),
        barTimeCustomerRate: monthlyAnalysis.barTimeCustomerRate,
        avgDailySales: monthlyAnalysis.avgDailySales,
        avgDrinkSales: dayCount > 0 ? Number(monthlyAnalysis.drinkSalesSum || 0) / dayCount : null,
        avgFoodSales: dayCount > 0 ? Number(monthlyAnalysis.foodSalesSum || 0) / dayCount : null,
      },
      taxMode,
      selectedPastSimilarComparison,
      { events, pastComparablePool }
    );
  }, [selectedTrendRow, monthlyAnalysis, taxMode, selectedPastSimilarComparison, events, pastComparablePool]);
  const selectCauseDayForReport_ = (rowKey) => {
    if (!rowKey) return;
    setSelectedTrendRowKey(rowKey);
    window.setTimeout(() => {
      dayReportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };
  const selectReferenceDayForReport_ = (row) => {
    if (!row?.rowKey && !row?.businessDate) return;
    const refMonth = normalizeMonth(String(row.businessDate || "").slice(0, 7));
    if (refMonth && refMonth !== normalizeMonth(targetMonth)) {
      pendingReportReferenceRef.current = row;
      setTargetMonth(refMonth);
      return;
    }
    const resolvedKey = resolveTrendRowKeyForReference_(row, monthlyAnalysis.dailyTrendRows);
    if (resolvedKey) selectCauseDayForReport_(resolvedKey);
  };
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
    const yearlyCustomerCount = aggregatedMonths.reduce((s, m) => s + Number(m.customerCountSum || 0), 0);
    const yearlyBarTimeCustomerCount = aggregatedMonths.reduce((s, m) => s + Number(m.barTimeCustomerCountSum || 0), 0);
    const yearlyLiveTimeCustomerCount = deriveLiveTimeCustomerCount_(yearlyCustomerCount, yearlyBarTimeCustomerCount);
    const yearlyBarTimeCustomerRate = calcRate(yearlyBarTimeCustomerCount, yearlyCustomerCount);
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
      { key: "profit", label: "営業ベース利益", value: yearlyOperatingProfit, tone: "linear-gradient(90deg, rgba(126,200,126,0.92), rgba(126,200,126,0.58))", note: "" },
      { key: "purchase", label: "仕入れ合計", value: yearlyPurchase, tone: "linear-gradient(90deg, rgba(205,134,74,0.9), rgba(205,134,74,0.52))", note: "月末売掛反映あり" },
      { key: "drinkPurchase", label: "ドリンク仕入れ", value: yearlyDrinkPurchase, tone: "linear-gradient(90deg, rgba(205,134,74,0.75), rgba(205,134,74,0.42))", note: "", isPurchaseChild: true },
      { key: "foodPurchase", label: "フード仕入れ", value: yearlyFoodPurchase, tone: "linear-gradient(90deg, rgba(188,120,68,0.88), rgba(188,120,68,0.48))", note: "", isPurchaseChild: true },
      { key: "expense", label: "経費", value: yearlyExpense, tone: "linear-gradient(90deg, rgba(155,84,94,0.9), rgba(155,84,94,0.52))", note: "暫定" },
      { key: "labor", label: "人件費", value: yearlyLabor, tone: "linear-gradient(90deg, rgba(201,168,76,0.9), rgba(201,168,76,0.5))", note: "翌月反映" },
    ];
    const yearlyFoodDrinkGrossProfit = yearlyFoodDrink - yearlyPurchase;
    const yearlyFoodDrinkGrossProfitRate = calcRate(yearlyFoodDrinkGrossProfit, yearlyFoodDrink);
    const yearlyOperatingGrossProfit = calcOperatingGrossProfit_(yearlyTotalSales, yearlyPurchase, yearlyExpense);
    const yearlyOperatingGrossProfitRate = calcRate(yearlyOperatingGrossProfit, yearlyTotalSales);
    const monthlyYoYRows = buildMonthlyYoYRows_(monthRows);
    const previousYearTotal = PREVIOUS_YEAR_SALES_2025_TOTAL;
    const yoyDiff = yearlyTotalSales - previousYearTotal;
    const yoyRate = previousYearTotal > 0 ? (yearlyTotalSales / previousYearTotal) * 100 : null;
    const landing = buildLandingForecast_(monthRows, yearlyTotalSales, targetMetrics);
    const momComparison = buildMomComparison_(monthRows);
    const yearlyCustomerUnitPrice = unitPriceByCustomerCount_(yearlyTotalSales, yearlyCustomerCount);
    const yearlyFoodDrinkUnitPrice = unitPriceByCustomerCount_(yearlyDrink + yearlyFood, yearlyCustomerCount);
    const breakEvenMonthCounts = countBreakEvenMonths_(aggregatedMonths);
    const belowBreakEvenMonthCount = Math.max(
      0,
      breakEvenMonthCounts.actualMonthCount - breakEvenMonthCounts.aboveBreakEvenCount
    );
    const yearlyOperatingBaseProfit = yearlyOperatingProfit;
    const yearlyOperatingBaseProfitRate = calcRate(yearlyOperatingBaseProfit, yearlyTotalSales);
    let yearlyFixedCostAdjustedProfit = 0;
    let yearlyExTaxSalesSum = 0;
    for (const m of aggregatedMonths) {
      const fc = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
      if (fc.profit != null) yearlyFixedCostAdjustedProfit += fc.profit;
      if (fc.exTaxSales != null) yearlyExTaxSalesSum += fc.exTaxSales;
    }
    const yearlyFixedCostAdjustedProfitRate =
      yearlyExTaxSalesSum > 0 ? (yearlyFixedCostAdjustedProfit / yearlyExTaxSalesSum) * 100 : null;
    const positiveFixedCostAdjustedMonthCount = aggregatedMonths.filter((m) => {
      const fc = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
      return fc.profit != null && fc.profit > 0;
    }).length;
    const strongFixedCostAdjustedMonthCount = aggregatedMonths.filter((m) => {
      const fc = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
      return fc.profit != null && fc.profit > FIXED_COST_STRONG_MONTH_EX_TAX;
    }).length;
    const negativeFixedCostAdjustedMonthCount = aggregatedMonths.filter((m) => {
      const fc = calcFixedCostAdjustedProfitFromGrossSales_(m.totalSalesSum);
      return fc.profit != null && fc.profit < 0;
    }).length;
    const positiveOperatingProfitMonthCount = positiveFixedCostAdjustedMonthCount;
    const negativeOperatingProfitMonthCount = negativeFixedCostAdjustedMonthCount;
    const monthReviewRows = buildYearlyMonthReviewRows_(monthRows, monthlyYoYRows);
    const chartMonthRows = enhanceYearlyMonthRowsForCharts_(monthRows);
    const profitTop3 = topN(
      aggregatedMonths.filter((m) => m.fixedCostAdjustedProfit != null && m.fixedCostAdjustedProfit > 0),
      (a, b) => Number(b.fixedCostAdjustedProfit || 0) - Number(a.fixedCostAdjustedProfit || 0),
      3
    );
    const foodDrinkUnitPriceTop3 = topN(
      aggregatedMonths.filter((m) => m.foodDrinkUnitPrice != null),
      (a, b) => Number(b.foodDrinkUnitPrice || 0) - Number(a.foodDrinkUnitPrice || 0),
      3
    );
    const customerCountTop3 = topN(
      aggregatedMonths.filter((m) => Number(m.customerCountSum || 0) > 0),
      (a, b) => Number(b.customerCountSum || 0) - Number(a.customerCountSum || 0),
      3
    );
    const operatingProfitRateTop3 = topN(
      aggregatedMonths.filter((m) => m.operatingProfitRate != null && Number(m.totalSalesSum || 0) > 0),
      (a, b) => Number(b.operatingProfitRate || 0) - Number(a.operatingProfitRate || 0),
      3
    );
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
      yearlyOperatingBaseProfit,
      yearlyOperatingBaseProfitRate,
      yearlyFixedCostAdjustedProfit: aggregatedMonths.length > 0 ? yearlyFixedCostAdjustedProfit : null,
      yearlyFixedCostAdjustedProfitRate,
      yearlyExTaxSalesSum: yearlyExTaxSalesSum > 0 ? yearlyExTaxSalesSum : null,
      yearlyFoodDrink,
      yearlyDrink,
      yearlyFood,
      yearlyCustomerCount,
      yearlyBarTimeCustomerCount,
      yearlyLiveTimeCustomerCount,
      yearlyBarTimeCustomerRate,
      monthlyAvgCustomerCount: aggregatedMonths.length > 0 ? yearlyCustomerCount / aggregatedMonths.length : null,
      yearlyCustomerUnitPrice,
      yearlyFoodDrinkUnitPrice,
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
      yearlyOperatingGrossProfit,
      yearlyOperatingGrossProfitRate,
      breakEvenMonthCounts,
      belowBreakEvenMonthCount,
      positiveOperatingProfitMonthCount,
      negativeOperatingProfitMonthCount,
      positiveFixedCostAdjustedMonthCount,
      strongFixedCostAdjustedMonthCount,
      negativeFixedCostAdjustedMonthCount,
      monthReviewRows,
      chartMonthRows,
      profitTop3,
      foodDrinkUnitPriceTop3,
      customerCountTop3,
      operatingProfitRateTop3,
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
  const monthlyImprovementComments = useMemo(
    () =>
      buildMonthlyImprovementComments_(monthlyAnalysis, taxMode, targetMonth, currentBusinessDate, yearlyMonthData),
    [monthlyAnalysis, taxMode, targetMonth, currentBusinessDate, yearlyMonthData]
  );

  const switchToStaffMode = () => {
    setRoleMode("staff");
  };
  const switchToAdminMode = () => {
    if (roleMode === "admin") return;
    if (requestSalesAdminAccess_()) setRoleMode("admin");
  };
  const lockAdminView = () => {
    setSalesAdminUnlocked(false);
    setRoleMode("staff");
  };

  const navigateToMonthAnalysis = (month) => {
    const tm = normalizeMonth(month);
    if (tm) setTargetMonth(tm);
    setAdminTab("analysis");
    if (readSalesAdminUnlocked()) setRoleMode("admin");
  };

  const yearlyCheckpoints = useMemo(() => {
    if (!yearlyAnalysis) return [];
    return buildYearlyCheckpoints_({
      yearlyProgressRate: yearlyAnalysis.yearlyProgressRate,
      hasFullYearTarget: yearlyAnalysis.hasFullYearTarget,
      fullYearTargetSum: yearlyAnalysis.fullYearTargetSum,
      enteredTargetMonthCount: yearlyAnalysis.enteredTargetMonthCount,
      landing: yearlyAnalysis.landing,
      yearlyPurchaseCostRates: yearlyAnalysis.yearlyPurchaseCostRates,
      yearlyOperatingProfitRate: yearlyAnalysis.yearlyOperatingBaseProfitRate,
      yearlyOperatingGrossProfitRate: yearlyAnalysis.yearlyOperatingGrossProfitRate,
      yearlyFixedCostAdjustedProfitRate: yearlyAnalysis.yearlyFixedCostAdjustedProfitRate,
      momComparison: yearlyAnalysis.momComparison,
      belowBreakEvenMonthCount: yearlyAnalysis.belowBreakEvenMonthCount,
      negativeOperatingProfitMonthCount: yearlyAnalysis.negativeFixedCostAdjustedMonthCount,
      taxMode,
    });
  }, [yearlyAnalysis, taxMode]);

  return (
    <div
      style={{
        padding: vp.narrow ? (vp.mobile ? "1rem .65rem" : "1.25rem .85rem") : "1.5rem 2rem",
        maxWidth: vp.narrow ? "100%" : 1180,
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box",
        overflowX: "hidden",
      }}
      className="hb-view"
    >
      <div
        style={{
          display: "flex",
          flexDirection: vp.narrow ? "column" : "row",
          alignItems: vp.narrow ? "stretch" : "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          gap: vp.narrow ? ".65rem" : ".5rem",
        }}
      >
        <h2 style={{ fontFamily:"Georgia,serif", fontSize: vp.narrow ? "1.05rem" : "1.2rem", color:"#c9a84c", letterSpacing:".15em", margin:0 }}>📈 売上管理</h2>
        <div
          style={{
            display: "flex",
            gap: ".45rem",
            flexWrap: "wrap",
            alignItems: "center",
            width: vp.narrow ? "100%" : "auto",
          }}
        >
          <button type="button" style={{ ...S.btn(roleMode === "staff" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow) }} onClick={switchToStaffMode}>現場表示</button>
          <button type="button" style={{ ...S.btn(roleMode === "admin" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow) }} onClick={switchToAdminMode}>管理表示</button>
          {roleMode === "admin" && (
            <button type="button" style={{ ...S.btn("sm"), ...touchBtnExtra(vp.narrow), color: "rgba(220,168,130,0.9)", border: "1px solid rgba(201,168,76,0.28)" }} onClick={lockAdminView}>
              管理ロック
            </button>
          )}
          <span style={{ display:"inline-flex", gap:".2rem", alignItems:"center", padding:".12rem .2rem", borderRadius:4, border:"1px solid rgba(201,168,76,0.22)", background:"rgba(0,0,0,0.2)", flexWrap:"wrap" }}>
            <button type="button" style={{ ...S.btn(taxMode === "gross" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow) }} onClick={() => setTaxMode("gross")}>税込</button>
            <button type="button" style={{ ...S.btn(taxMode === "net" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow) }} onClick={() => setTaxMode("net")}>税抜</button>
          </span>
          <select
            style={{ ...S.inp, ...(vp.narrow ? { width: "100%", flex: "1 1 100%", minHeight: 44, fontSize: ".88rem" } : {}) }}
            value={targetMonth}
            onChange={(e) => setTargetMonth(normalizeMonth(e.target.value))}
          >
            {SALES_MONTH_OPTIONS_2026.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button type="button" style={{ ...S.btn("sm"), ...touchBtnExtra(vp.narrow), ...(vp.narrow ? { flex: "1 1 auto" } : {}) }} onClick={() => loadSales(targetMonth)} disabled={loading}>{loading ? "読込中..." : "🔄 再読込"}</button>
          {navigateBack && <button type="button" style={{ ...S.btn("sm"), ...touchBtnExtra(vp.narrow), ...(vp.narrow ? { flex: "1 1 auto" } : {}) }} onClick={navigateBack}>← 戻る</button>}
        </div>
      </div>

      <div style={{ fontSize:".68rem", color:"rgba(240,232,208,0.55)", marginBottom:".7rem" }}>
        {updatedAt ? <>更新時刻: {updatedAt}</> : null}
        <span style={{ marginLeft: updatedAt ? ".55rem" : 0, color: "rgba(201,168,76,0.78)" }}>
          現在：{taxMode === "net" ? "税抜表示" : "税込表示"}
        </span>
      </div>
      {taxMode === "net" && (
        <div style={{ ...analysisNote({}, vp.narrow), marginBottom: ".65rem" }}>
          ※税抜表示は税込金額を10%で概算換算しています。
        </div>
      )}

      {roleMode === "admin" && (
        <div
          style={{
            display: vp.narrow ? "grid" : "flex",
            gridTemplateColumns: vp.narrow ? "repeat(3, minmax(0, 1fr))" : undefined,
            gap: ".4rem",
            marginBottom: ".75rem",
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          <button type="button" style={{ ...S.btn(adminTab === "daily" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow), ...(vp.narrow ? { width: "100%" } : {}) }} onClick={() => setAdminTab("daily")}>
            日別一覧
          </button>
          <button type="button" style={{ ...S.btn(adminTab === "analysis" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow), ...(vp.narrow ? { width: "100%" } : {}) }} onClick={() => setAdminTab("analysis")}>
            月次分析
          </button>
          <button type="button" style={{ ...S.btn(adminTab === "yearly" ? "gold" : "ghost"), ...touchBtnExtra(vp.narrow), ...(vp.narrow ? { width: "100%" } : {}) }} onClick={() => setAdminTab("yearly")}>
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
              ? `目標まで ${dy(staffProgress.remaining)}`
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
        <div style={{ display:"grid", gap:".75rem", marginBottom:".75rem", ...analysisSectionWrap(vp.narrow) }}>
          <div style={analysisCardWrap("summary", vp.narrow)}>
            <div style={analysisSecTitle("summary", ".55rem")}>月次サマリー</div>
            <MonthlySummaryPanel
              monthlyAnalysis={monthlyAnalysis}
              narrow={vp.narrow}
              dy={dy}
              pct={pct}
              pct1={pct1}
              signedDy={signedDy}
            />
          </div>

          <div style={analysisCardWrap("insight", vp.narrow)}>
            <div style={analysisSecTitle("insight", ".5rem")}>月次分析コメント</div>
            {monthlyImprovementComments.length === 0 ? (
              <div style={{ fontSize: ".78rem", color: "rgba(240,232,208,0.5)", lineHeight: 1.55 }}>
                分析コメントを生成するデータが不足しています
              </div>
            ) : (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.2rem",
                  display: "grid",
                  gap: vp.narrow ? ".55rem" : ".5rem",
                  fontSize: vp.narrow ? ".82rem" : ".8rem",
                  lineHeight: 1.65,
                  color: "rgba(240,232,208,0.86)",
                }}
              >
                {monthlyImprovementComments.map((line, i) => (
                  <li
                    key={`improvement_${i}`}
                    style={{
                      wordBreak: "break-word",
                      paddingBottom: i < monthlyImprovementComments.length - 1 ? ".12rem" : 0,
                      borderBottom:
                        i < monthlyImprovementComments.length - 1
                          ? `1px solid ${analysisRowBorder("insight")}`
                          : "none",
                    }}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={analysisCardWrap("composition", vp.narrow)}>
            <div style={analysisSecTitle("composition", ".5rem")}>売上構成</div>
            <SalesCompositionLegend narrow={vp.narrow} />
            <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
              <SalesCompositionBar rates={monthlyAnalysis.salesComposition} />
            </div>
            <SalesCompositionBreakdown
              narrow={vp.narrow}
              items={[
                { key: "drink", label: "ドリンク", chipColor: SALES_COMPOSITION_CHIP_COLORS.drink, amount: dy(monthlyAnalysis.drinkSalesSum), rate: pct(monthlyAnalysis.salesComposition.drinkRate) },
                { key: "food", label: "フード", chipColor: SALES_COMPOSITION_CHIP_COLORS.food, amount: dy(monthlyAnalysis.foodSalesSum), rate: pct(monthlyAnalysis.salesComposition.foodRate) },
                {
                  key: "band",
                  label: "バンド飲食代",
                  chipColor: SALES_COMPOSITION_CHIP_COLORS.bandFoodDrink,
                  amount: dy(monthlyAnalysis.bandFoodDrinkSalesSum),
                  rate: pct(monthlyAnalysis.salesComposition.bandFoodDrinkRate),
                  extra: [
                    monthlyAnalysis.hasBandDrinkBreakdown ? `うちバンドドリンク ${dy(monthlyAnalysis.bandDrinkSalesSum)}` : null,
                    monthlyAnalysis.hasBandFoodBreakdown ? `うちバンドフード ${dy(monthlyAnalysis.bandFoodSalesSum)}` : null,
                  ].filter(Boolean).join(" / ") || null,
                },
                { key: "venue", label: "会場費", chipColor: SALES_COMPOSITION_CHIP_COLORS.venue, amount: dy(monthlyAnalysis.venueFeeSum), rate: pct(monthlyAnalysis.salesComposition.venueRate) },
                { key: "rental", label: "レンタル", chipColor: SALES_COMPOSITION_CHIP_COLORS.rental, amount: dy(monthlyAnalysis.rentalSalesSum), rate: pct(monthlyAnalysis.salesComposition.rentalRate) },
                { key: "other", label: "その他", chipColor: SALES_COMPOSITION_CHIP_COLORS.other, amount: dy(monthlyAnalysis.otherSalesSum), rate: pct(monthlyAnalysis.salesComposition.otherRate) },
              ]}
            />
          </div>

          <div style={analysisCardWrap("costProfit", vp.narrow)}>
            <div style={analysisSecTitle("costProfit", ".35rem")}>コスト・利益比較（暫定）</div>
            <div style={{ ...analysisNote({}, vp.narrow), marginBottom: ".45rem" }}>
              ※人件費は翌月まとめて反映されます。仕入・経費は月末に売掛分が加算されるため、月中は暫定値です。
              {monthlyAnalysis.hasMonthlyCostSummary ? (
                <span style={{ display: "block", marginTop: ".18rem", color: "rgba(201,168,76,0.55)" }}>
                  ※月合計欄の値を反映しています（月確定に近い数字です）。
                </span>
              ) : null}
            </div>
            <CostProfitBarList bars={monthlyAnalysis.costProfitBars} maxValue={monthlyAnalysis.costProfitMax} taxMode={taxMode} narrow={vp.narrow} />
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>営業粗利</div>
              <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 150), gap: ".32rem .55rem", fontSize: vp.narrow ? ".88rem" : ".74rem", color: "rgba(240,232,208,0.82)", ...analysisSectionWrap(vp.narrow) }}>
                {vp.narrow ? (
                  <>
                    <AnalysisStackedRow narrow label="営業粗利" value={monthlyAnalysis.totalSalesSum > 0 ? dy(monthlyAnalysis.operatingGrossProfitSum) : "—"} border={false} />
                    <AnalysisStackedRow narrow label="営業粗利率" value={monthlyAnalysis.operatingGrossProfitRate != null ? pct1(monthlyAnalysis.operatingGrossProfitRate) : "—"} border={false} />
                  </>
                ) : (
                  <>
                    <div>
                      営業粗利{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {monthlyAnalysis.totalSalesSum > 0 ? dy(monthlyAnalysis.operatingGrossProfitSum) : "—"}
                      </span>
                    </div>
                    <div>
                      営業粗利率{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {monthlyAnalysis.operatingGrossProfitRate != null ? pct1(monthlyAnalysis.operatingGrossProfitRate) : "—"}
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div style={analysisNote({ marginTop: ".2rem" }, vp.narrow)}>※売上 − 仕入れ合計 − 経費（人件費・営業利益の追加差引は含みません）</div>
            </div>
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>原価率</div>
              <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 150), gap: ".32rem .55rem", fontSize: vp.narrow ? ".88rem" : ".74rem", color: "rgba(240,232,208,0.82)", ...analysisSectionWrap(vp.narrow) }}>
                {vp.narrow ? (
                  <>
                    <AnalysisStackedRow narrow label="総仕入率" value={pct1(monthlyAnalysis.purchaseCostRates.totalPurchaseRate)} border={false} />
                    <AnalysisStackedRow narrow label="ドリンク原価率" value={pct1(monthlyAnalysis.purchaseCostRates.drinkCostRate)} border={false} />
                    <AnalysisStackedRow narrow label="フード原価率" value={pct1(monthlyAnalysis.purchaseCostRates.foodCostRate)} border={false} />
                  </>
                ) : (
                  <>
                    <div>総仕入率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.totalPurchaseRate)}</span></div>
                    <div>ドリンク原価率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.drinkCostRate)}</span></div>
                    <div>フード原価率 <span style={{ color: "#f0e8d0" }}>{pct1(monthlyAnalysis.purchaseCostRates.foodCostRate)}</span></div>
                  </>
                )}
              </div>
            </div>
            <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.78)" }}>
                参考：バンドギャラ <span style={{ color: "#f0e8d0" }}>{dy(monthlyAnalysis.bandGuaranteeSum)}</span>
              </div>
              <div style={analysisNote({ marginTop: ".1rem" }, vp.narrow)}>※経費には含めていません</div>
            </div>
          </div>

          <div style={analysisCardWrap("trend", vp.narrow)}>
            <div style={analysisSecTitle("trend", ".5rem")}>日別売上推移</div>
            <div style={{ display:"flex", gap: vp.narrow ? ".45rem .55rem" : ".7rem", flexWrap:"wrap", marginBottom:".45rem", fontSize: vp.narrow ? ".76rem" : ".72rem", color:"rgba(240,232,208,0.8)" }}>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(102,197,124,0.95)" }} />目標達成</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(222,181,78,0.95)" }} />未達 70%以上</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(223,137,79,0.95)" }} />未達 50%以上</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(166,74,84,0.95)" }} />未達 50%未満</span>
              <span><span style={{ display:"inline-block", width:12, height:12, marginRight:".32rem", borderRadius:2, background:"rgba(132,132,132,0.95)" }} />目標未設定</span>
            </div>
            {monthlyAnalysis.dailyTrendRows.length === 0 ? (
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
            ) : (
              <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: ".1rem", maxWidth: "100%" }}>
                <div
                  style={{
                    display:"flex",
                    alignItems:"flex-end",
                    gap:".38rem",
                    height:220,
                    minWidth: vp.narrow ? `${Math.max(100, monthlyAnalysis.dailyTrendRows.length * 34)}px` : "100%",
                  }}
                >
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
              <div
                ref={dayReportRef}
                style={{ marginTop: ".75rem", borderTop: "1px dashed rgba(175,180,190,0.2)", paddingTop: ".7rem", ...DAY_REPORT_BOX }}
              >
                <div style={{ ...analysisCardWrap("dayReport", vp.narrow), ...DAY_REPORT_BOX }}>
                  <div style={{ ...analysisSecTitle("dayReport"), fontSize: ".86rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "none" }}>選択日の営業レポート</div>

                  <div style={{ marginBottom: ".55rem", ...DAY_REPORT_BOX }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>A. 基本情報</div>
                    <div style={{ display:"grid", gap:".38rem", fontSize:".8rem", ...DAY_REPORT_BOX }}>
                      <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 140), gap:".34rem .7rem", minWidth: 0 }}>
                        <div>日付: <strong style={{ fontSize: vp.narrow ? "1rem" : ".95rem" }}>{selectedTrendRow.businessDate || "—"}</strong></div>
                        <div>曜日: <strong style={{ fontSize: vp.narrow ? "1rem" : ".95rem" }}>{selectedTrendRow.weekday || "—"}</strong></div>
                      </div>
                      <div style={{ minWidth: 0, maxWidth: "100%", wordBreak: "break-word" }}>
                        イベント名:{" "}
                        <strong style={{ fontSize: vp.narrow ? "1rem" : ".95rem", display: "block", marginTop: vp.narrow ? ".1rem" : 0 }}>{selectedTrendRow.eventName || "イベント未登録"}</strong>
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

                  <div style={{ marginBottom: ".55rem", ...DAY_REPORT_BOX }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>B. 売上・目標</div>
                    <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 160), gap:".34rem .7rem", fontSize: vp.narrow ? ".88rem" : ".8rem", ...analysisSectionWrap(vp.narrow) }}>
                      <MobileFieldRow narrow={vp.narrow} label="売上合計" value={dy(selectedTrendRow.totalSales)} valueStyle={{ color: "#f3ead2" }} />
                      <MobileFieldRow narrow={vp.narrow} label="総集客人数" value={formatCustomerCountLabel_(selectedTrendRow.customerCount)} />
                      <MobileFieldRow narrow={vp.narrow} label="ライブタイム人数" value={formatCustomerCountLabel_(selectedTrendRow.liveTimeCustomerCount)} />
                      <MobileFieldRow narrow={vp.narrow} label="バータイム人数" value={formatCustomerCountLabel_(selectedTrendRow.barTimeCustomerCount)} />
                      <MobileFieldRow narrow={vp.narrow} label="バータイム比率" value={pct(selectedTrendRow.barTimeCustomerRate)} />
                      <MobileFieldRow narrow={vp.narrow} label="目標" value={dy(selectedTrendRow.targetSales)} />
                      <MobileFieldRow narrow={vp.narrow} label="達成率" value={pct(selectedTrendRow.achievementRate)} valueStyle={{ color: "#f3ead2" }} />
                      <MobileFieldRow narrow={vp.narrow} label="客単価" value={formatUnitYen_(selectedTrendRow.customerUnitPrice)} />
                      <MobileFieldRow narrow={vp.narrow} label="飲食単価" value={formatUnitYen_(selectedTrendRow.foodDrinkUnitPrice)} />
                      {selectedTrendRow.venueFee != null && Number(selectedTrendRow.venueFee) > 0 ? (
                        <MobileFieldRow narrow={vp.narrow} label="会場費" value={dy(selectedTrendRow.venueFee)} />
                      ) : null}
                    </div>
                    <div style={{ ...analysisNote({ marginTop: ".28rem" }, vp.narrow) }}>{FOOD_DRINK_UNIT_PRICE_NOTE}</div>
                  </div>

                  <DayAnalysisBlock
                    analysis={selectedDayAnalysis}
                    taxMode={taxMode}
                    narrow={vp.narrow}
                    onSelectReferenceDay={selectReferenceDayForReport_}
                  />

                  <div style={{ marginBottom: ".55rem", ...DAY_REPORT_BOX }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>C. 飲食内訳</div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: vp.narrow ? "1fr" : "repeat(2, minmax(0, 1fr))",
                        gap: vp.narrow ? ".1rem" : ".28rem .65rem",
                        fontSize: vp.narrow ? ".88rem" : ".8rem",
                        ...DAY_REPORT_BOX,
                      }}
                    >
                      <DayReportFoodMetricRow narrow={vp.narrow} label="飲食売上" value={dy(selectedTrendRow.foodDrinkSalesIncludingBand)} />
                      <DayReportFoodMetricRow narrow={vp.narrow} label="お客様飲食売上" value={dy(selectedTrendRow.foodDrinkSalesBase)} />
                      <DayReportFoodMetricRow narrow={vp.narrow} label="バンド飲食代" value={dy(selectedTrendRow.bandFoodDrinkSales)} />
                      <DayReportFoodMetricRow
                        narrow={vp.narrow}
                        label="飲食比率"
                        value={pct(calcRate(selectedTrendRow.foodDrinkSalesIncludingBand, selectedTrendRow.totalSales))}
                      />
                      <DayReportFoodMetricRow narrow={vp.narrow} label="ドリンク売上" value={dy(selectedTrendRow.drinkSales)} />
                      <DayReportFoodMetricRow narrow={vp.narrow} label="フード売上" value={dy(selectedTrendRow.foodSales)} />
                      <DayReportFoodMetricRow narrow={vp.narrow} label="会場費" value={dy(selectedTrendRow.venueFee)} />
                      {selectedTrendRow.bandDrinkSales != null ? (
                        <DayReportFoodMetricRow narrow={vp.narrow} label="バンドドリンク" value={dy(selectedTrendRow.bandDrinkSales)} />
                      ) : null}
                      {selectedTrendRow.bandFoodSales != null ? (
                        <DayReportFoodMetricRow narrow={vp.narrow} label="バンドフード" value={dy(selectedTrendRow.bandFoodSales)} />
                      ) : null}
                    </div>
                    <div style={{ marginTop: ".4rem", fontSize: ".66rem", color: "rgba(240,232,208,0.72)" }}>売上構成</div>
                    <SalesCompositionLegend narrow={vp.narrow} />
                    <div style={{ width: "100%", maxWidth: "100%", overflow: "hidden" }}>
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
                  </div>

                  <div style={{ marginBottom: ".55rem", ...DAY_REPORT_BOX }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>D. 決済・入金</div>
                    <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 160), gap:".34rem .7rem", fontSize: vp.narrow ? ".88rem" : ".8rem", ...analysisSectionWrap(vp.narrow) }}>
                      <div>現金: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.cash)}</strong></div>
                      <div>クレジット: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.creditCardSales)}</strong></div>
                      <div>PayPay: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.paypaySales)}</strong></div>
                      <div>売掛合計: <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.receivableTotal)}</strong></div>
                    </div>
                  </div>

                  <div style={{ marginBottom: ".55rem", ...DAY_REPORT_BOX }}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>E. コスト・利益</div>
                    <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 160), gap:".34rem .7rem", fontSize: vp.narrow ? ".88rem" : ".8rem", ...analysisSectionWrap(vp.narrow) }}>
                      <MobileFieldRow narrow={vp.narrow} label="営業利益" value={dy(selectedTrendRow.operatingProfit)} valueStyle={{ color: "#f3ead2" }} />
                      <MobileFieldRow narrow={vp.narrow} label="仕入れ合計" value={dy(selectedTrendRow.purchaseTotal)} />
                      <MobileFieldRow narrow={vp.narrow} label="ドリンク仕入れ" value={dy(selectedTrendRow.drinkPurchase)} />
                      <MobileFieldRow narrow={vp.narrow} label="フード仕入れ" value={dy(selectedTrendRow.foodPurchase)} />
                      <MobileFieldRow narrow={vp.narrow} label="経費" value={dy(selectedTrendRow.expense)} />
                      <MobileFieldRow narrow={vp.narrow} label="人件費" value={dy(selectedTrendRow.laborCost)} />
                    </div>
                    <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.52)", marginTop: ".28rem", lineHeight: 1.45 }}>
                      ※仕入・経費・人件費は月末/翌月反映分を含まない場合があります。
                    </div>
                  </div>

                  <div style={DAY_REPORT_BOX}>
                    <div style={{ fontSize: ".66rem", letterSpacing: ".08em", color: "rgba(201,168,76,0.85)", marginBottom: ".25rem" }}>F. 参考情報</div>
                    <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 180), gap:".34rem .7rem", fontSize: vp.narrow ? ".88rem" : ".8rem", ...analysisSectionWrap(vp.narrow) }}>
                      <div>参考：バンドギャラ <strong style={{ fontSize: ".94rem" }}>{dy(selectedTrendRow.bandGuarantee)}</strong></div>
                    </div>
                    <div style={{ fontSize: ".64rem", color: "rgba(240,232,208,0.55)", marginTop: ".2rem" }}>※経費には含めていません</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={analysisCardWrap("causeAnalysis", vp.narrow)}>
            <div style={analysisSecTitle("causeAnalysis", ".5rem")}>未達日の要因分析</div>
            {monthlyAnalysis.underTargetCauseAnalysis.length === 0 ? (
              <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>目標未達日はありません</div>
            ) : (
              <div style={{ display: "grid", gap: ".55rem" }}>
                {monthlyAnalysis.underTargetCauseAnalysis.map((r) => (
                  <div
                    key={r.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectCauseDayForReport_(r.rowKey)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectCauseDayForReport_(r.rowKey);
                      }
                    }}
                    style={{
                      padding: ".55rem .65rem",
                      borderRadius: 5,
                      border: `1px solid ${analysisRowBorder("causeAnalysis")}`,
                      background: "rgba(0,0,0,0.18)",
                      cursor: r.rowKey ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (!r.rowKey) return;
                      e.currentTarget.style.background = "rgba(201,168,76,0.08)";
                      e.currentTarget.style.borderColor = "rgba(201,168,76,0.32)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(0,0,0,0.18)";
                      e.currentTarget.style.borderColor = analysisRowBorder("causeAnalysis");
                    }}
                  >
                    <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)", marginBottom: ".18rem" }}>
                      {r.businessDate}
                    </div>
                    <div
                      style={{
                        fontSize: ".8rem",
                        color: "#f0e8d0",
                        fontWeight: 600,
                        marginBottom: ".28rem",
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {r.eventName}
                    </div>
                    <div style={{ fontSize: ".76rem", lineHeight: 1.5, color: "rgba(240,232,208,0.82)", marginBottom: ".22rem" }}>
                      売上 <strong style={RANK_LIST_AMOUNT}>{dy(r.totalSales)}</strong>
                      {" / "}
                      目標 <strong style={RANK_LIST_SUB}>{dy(r.targetSales)}</strong>
                      {" / "}
                      不足 <strong style={RANK_LIST_SHORTFALL}>{dy(r.shortfall)}</strong>
                    </div>
                    <div style={{ fontSize: ".74rem", color: "rgba(212,168,138,0.92)", fontWeight: 600, marginBottom: ".14rem" }}>
                      分類：{r.category}
                    </div>
                    <UnderTargetCauseEvidence row={r} taxMode={taxMode} narrow={vp.narrow} />
                    <div style={{ fontSize: ".72rem", lineHeight: 1.45, color: "rgba(240,232,208,0.62)", marginBottom: ".12rem" }}>
                      コメント：{r.comment}
                    </div>
                    {r.rowKey ? (
                      <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.62)" }}>クリックで営業レポートを表示</div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 280), gap:".65rem" }}>
            <div style={{ ...analysisCardWrap("rankSales", vp.narrow), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div style={analysisSecTitle("rankSales", ".5rem")}>月間売上TOP5</div>
              {monthlyAnalysis.salesRankingTop5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.salesRankingTop5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankSales")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".76rem", lineHeight: 1.45, wordBreak: "break-word" }}>
                    <strong style={{ ...(vp.narrow ? MOBILE_CARD_NUMBER_STYLE : { fontSize: ".84rem", fontWeight: 600, fontFamily: SALES_NUMBER_FONT_FAMILY, ...SALES_NUMBER_TABULAR }) }}>{dy(r.totalSales)}</strong>
                    {r.achievementRate != null ? (
                      <span style={{ display: "block", marginTop: ".12rem", color: "rgba(240,232,208,0.55)", fontSize: vp.narrow ? ".88rem" : ".62rem" }}>達成率 {pct(r.achievementRate)}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...analysisCardWrap("rankUnder", vp.narrow), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div style={analysisSecTitle("rankUnder", ".5rem")}>月間目標未達ワースト5</div>
              {monthlyAnalysis.underTargetWorst5.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>未達データなし</div>
              ) : monthlyAnalysis.underTargetWorst5.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankUnder")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.eventName || "イベント未登録"}</div>
                  {vp.narrow ? (
                    <div style={{ display: "grid", gap: ".14rem", marginTop: ".15rem" }}>
                      <div style={RANK_LIST_METRIC_LINE}>
                        売上 <span style={RANK_LIST_AMOUNT}>{dy(r.totalSales)}</span>
                      </div>
                      <div style={RANK_LIST_METRIC_LINE}>
                        達成率 <span style={RANK_LIST_SUB}>{pct(r.achievementRate)}</span>
                      </div>
                      <div style={RANK_LIST_METRIC_LINE}>
                        不足 <span style={RANK_LIST_SHORTFALL}>{dy(r.shortfall)}</span>
                      </div>
                    </div>
                  ) : (
                    <div style={RANK_LIST_METRIC_LINE}>
                      売上 <strong style={RANK_LIST_AMOUNT}>{dy(r.totalSales)}</strong> / 達成率{" "}
                      <strong style={RANK_LIST_SUB}>{pct(r.achievementRate)}</strong> / 不足{" "}
                      <strong style={RANK_LIST_SHORTFALL}>{dy(r.shortfall)}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns: rGridCols(vp.narrow, 260), gap:".65rem" }}>
            <div style={{ ...analysisCardWrap("rankFoodDrink", vp.narrow), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div style={analysisSecTitle("rankFoodDrink", ".5rem")}>月間飲食売上TOP10</div>
              {monthlyAnalysis.foodDrinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodDrinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankFoodDrink")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem", lineHeight: 1.45 }}>
                    <strong style={{ fontSize: ".84rem", fontWeight: 600, fontFamily: SALES_NUMBER_FONT_FAMILY, ...SALES_NUMBER_TABULAR }}>{dy(r.foodDrinkSalesIncludingBand)}</strong>
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
            <div style={{ ...analysisCardWrap("rankDrink", vp.narrow), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div style={analysisSecTitle("rankDrink", ".5rem")}>月間ドリンク売上TOP10</div>
              {monthlyAnalysis.drinkRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.drinkRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankDrink")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem", lineHeight: 1.45 }}>
                    <strong style={{ fontSize: ".84rem", fontWeight: 600, fontFamily: SALES_NUMBER_FONT_FAMILY, ...SALES_NUMBER_TABULAR }}>{dy(r.drinkSales)}</strong>
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
            <div style={{ ...analysisCardWrap("rankFood", vp.narrow), width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div style={analysisSecTitle("rankFood", ".5rem")}>月間フード売上TOP10</div>
              {monthlyAnalysis.foodRankingTop10.length === 0 ? (
                <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.45)" }}>データなし</div>
              ) : monthlyAnalysis.foodRankingTop10.map((r, i) => (
                <div key={r.key} style={{ padding: ".3rem 0", borderBottom: `1px solid ${analysisRowBorder("rankFood")}` }}>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.58)" }}>{i + 1}. {r.businessDate}</div>
                  <div style={{ fontSize: ".78rem", color: "#f0e8d0", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.eventName || "イベント未登録"}</div>
                  <div style={{ fontSize: ".82rem", lineHeight: 1.45 }}>
                    <strong style={{ fontSize: ".84rem", fontWeight: 600, fontFamily: SALES_NUMBER_FONT_FAMILY, ...SALES_NUMBER_TABULAR }}>{dy(r.foodSales)}</strong>
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
          <div style={{ display: "flex", alignItems: "center", gap: ".5rem", flexWrap: "wrap", marginBottom: ".15rem", width: "100%" }}>
            <span style={{ fontSize: ".72rem", color: "rgba(201,168,76,0.85)" }}>対象年</span>
            <select
              style={{ ...S.inp, width: vp.narrow ? "100%" : "auto", minWidth: vp.narrow ? undefined : 100, minHeight: vp.narrow ? 44 : undefined, fontSize: vp.narrow ? ".88rem" : undefined }}
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
                <div style={{ fontSize: vp.narrow ? "0.78rem" : "0.76rem", color: "rgba(240,232,208,0.55)", marginBottom: ".45rem" }}>
                  実績月数 {num(yearlyAnalysis.aggregatedMonthCount)}ヶ月
                </div>
                <YearlySummaryFiveBlocks
                  yearlyAnalysis={yearlyAnalysis}
                  narrow={vp.narrow}
                  dy={dy}
                  pct={pct}
                  pct1={pct1}
                  signedDy={signedDy}
                  formatUnitYen_={formatUnitYen_}
                />
              </div>

              <div style={analysisCard("alert")}>
                <div style={analysisSecTitle("alert", ".5rem")}>年次チェックポイント</div>
                <YearlyCheckpointList items={yearlyCheckpoints} narrow={vp.narrow} />
              </div>

              {yearlyAnalysis.momComparison && (
                <div style={analysisCard("momCompare")}>
                  <div style={analysisSecTitle("momCompare", ".5rem")}>前月比較</div>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.62)", marginBottom: ".45rem" }}>
                    {yearlyAnalysis.momComparison.latest.monthLabel} vs {yearlyAnalysis.momComparison.prev.monthLabel}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 190), gap: ".35rem .8rem", fontSize: vp.narrow ? ".9rem" : ".82rem" }}>
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
                      前月営業ベース利益差額{" "}
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

              <div style={analysisCard("yoyCompare")}>
                <div style={analysisSecTitle("yoyCompare", ".5rem")}>前年比較（2025年固定データ）</div>
                <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 180), gap: ".35rem .8rem", fontSize: vp.narrow ? ".9rem" : ".84rem", color: "rgba(240,232,208,0.88)" }}>
                  <div>今年売上合計 <strong style={vp.narrow ? MOBILE_METRIC_STRONG : { fontSize: "1rem" }}>{dy(yearlyAnalysis.yearlyTotalSales)}</strong></div>
                  <div>前年売上合計 <strong style={vp.narrow ? MOBILE_METRIC_STRONG : { fontSize: "1rem" }}>{dy(yearlyAnalysis.previousYearTotal)}</strong></div>
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
                <div style={{ ...analysisNote({}, vp.narrow), marginTop: ".32rem" }}>
                  ※2025年はスプレッドシート構造差のためAPI未取得。上記は税込固定値（合計 {dy(PREVIOUS_YEAR_SALES_2025_TOTAL)}）との比較です。
                </div>
              </div>

              <div style={analysisCard("composition")}>
                <div style={analysisSecTitle("composition", ".5rem")}>月別経営レビュー</div>
                <div style={{ fontSize: vp.narrow ? "0.78rem" : "0.76rem", color: "rgba(240,232,208,0.58)", marginBottom: ".45rem" }}>
                  月をクリックすると月次分析へ移動します
                </div>
                {vp.narrow ? (
                  <YearlyMonthReviewSection
                    rows={yearlyAnalysis.monthReviewRows}
                    narrow={vp.narrow}
                    dy={dy}
                    pct={pct}
                    pct1={pct1}
                    signedDy={signedDy}
                    formatUnitYen_={formatUnitYen_}
                    onMonthClick={navigateToMonthAnalysis}
                  />
                ) : (
                  <YearlyMonthReviewTable
                    rows={yearlyAnalysis.monthReviewRows}
                    narrow={vp.narrow}
                    dy={dy}
                    pct={pct}
                    pct1={pct1}
                    formatUnitYen_={formatUnitYen_}
                    onMonthClick={navigateToMonthAnalysis}
                    taxMode={taxMode}
                  />
                )}

                <div style={{ fontSize: vp.narrow ? "0.74rem" : "0.72rem", color: "rgba(201,168,76,0.82)", margin: ".75rem 0 .35rem", fontWeight: 600 }}>仕入・原価率（参考）</div>
                {vp.narrow ? (
                  <YearlyMonthCardsPurchase monthRows={yearlyAnalysis.monthRows} onMonthClick={navigateToMonthAnalysis} taxMode={taxMode} />
                ) : (
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
                )}
                <div style={{ ...analysisNote({}, vp.narrow), marginTop: ".32rem" }}>
                  ※総仕入率はバンド飲食代を含む飲食売上で計算しています。ドリンク/フード原価率は、バンド飲食代の内訳がある月のみ個別反映します。
                </div>
              </div>

              <div style={analysisCard("composition")}>
                <div style={analysisSecTitle("composition", ".5rem")}>月別前年比較</div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.5)", marginBottom: ".35rem" }}>月をクリックすると月次分析へ移動します</div>
                {vp.narrow ? (
                  <YearlyYoYMonthCards rows={yearlyAnalysis.monthlyYoYRows} onMonthClick={navigateToMonthAnalysis} dy={dy} pct1={pct1} signedDy={signedDy} />
                ) : (
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
                              style={{ ...YEARLY_TABLE_ROW, opacity: yearlyYoYRowOpacity_(r), cursor: "pointer" }}
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
                )}
              </div>

              <div style={{ fontSize: vp.narrow ? "0.78rem" : "0.76rem", color: "rgba(240,232,208,0.55)", marginBottom: ".35rem" }}>
                グラフの月をクリックすると月次分析へ移動します
              </div>
              <YearlyYoYBarChart rows={yearlyAnalysis.monthlyYoYRows} onMonthClick={navigateToMonthAnalysis} />

              <div style={{ display: "grid", gridTemplateColumns: yearlyMonthChartGridCols_(vp.narrow), gap: ".75rem", width: "100%", maxWidth: "100%", minWidth: 0 }}>
                <YearlyMonthBarChart tall title="月別売上推移" rows={yearlyAnalysis.chartMonthRows} valueKey="totalSalesSum" barTone="linear-gradient(180deg, rgba(201,168,76,0.95), rgba(201,168,76,0.55))" taxMode={taxMode} onMonthClick={navigateToMonthAnalysis} />
                <YearlyMonthBarChart
                  tall
                  title="月別 損益分岐との差"
                  rows={yearlyAnalysis.chartMonthRows}
                  valueKey="breakEvenGapAbsExTax"
                  barTone="linear-gradient(180deg, rgba(222,181,78,0.95), rgba(222,181,78,0.55))"
                  formatTop={(r) => r.breakEvenAnalysis?.gapLabel || "—"}
                  onMonthClick={navigateToMonthAnalysis}
                />
                <YearlyMonthBarChart
                  tall
                  title="月別 固定費控除後利益"
                  rows={yearlyAnalysis.chartMonthRows}
                  valueKey="fixedCostAdjustedProfitAbs"
                  barTone="linear-gradient(180deg, rgba(126,200,126,0.95), rgba(126,200,126,0.55))"
                  formatTop={(r) => formatFixedCostAdjustedProfit_(r.fixedCostAdjustedProfit)}
                  onMonthClick={navigateToMonthAnalysis}
                />
                <YearlyMonthBarChart
                  tall
                  title="月別 集客人数"
                  rows={yearlyAnalysis.chartMonthRows}
                  valueKey="customerCountSum"
                  barTone="linear-gradient(180deg, rgba(167,126,255,0.95), rgba(167,126,255,0.55))"
                  formatTop={(r) =>
                    r.status === "集計済み" && r.customerCountSum != null ? `${num(r.customerCountSum)}名` : "—"
                  }
                  onMonthClick={navigateToMonthAnalysis}
                />
                <YearlyMonthBarChart
                  tall
                  title="月別 飲食単価"
                  rows={yearlyAnalysis.chartMonthRows}
                  valueKey="foodDrinkUnitPrice"
                  barTone="linear-gradient(180deg, rgba(102,197,124,0.9), rgba(102,197,124,0.5))"
                  formatTop={(r) => (r.foodDrinkUnitPrice != null ? formatUnitYen_(r.foodDrinkUnitPrice) : "—")}
                  onMonthClick={navigateToMonthAnalysis}
                />
                <YearlyMonthBarChart
                  tall
                  title="月別 営業ベース利益率"
                  rows={yearlyAnalysis.chartMonthRows}
                  valueKey="operatingProfitRate"
                  barTone="linear-gradient(180deg, rgba(86,156,255,0.95), rgba(86,156,255,0.55))"
                  formatTop={(r) => (r.operatingProfitRate != null ? pct1(r.operatingProfitRate) : "—")}
                  onMonthClick={navigateToMonthAnalysis}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 220), gap: ".65rem" }}>
                <YearlyRankList title="売上が強い月" variant="rankSales" items={yearlyAnalysis.salesTop3} valueLabel="売上" formatValue={(r) => dy(r.totalSalesSum)} />
                <YearlyRankList title="目標との差が大きい月" variant="rankUnder" items={yearlyAnalysis.underWorst3} valueLabel="達成率" formatValue={(r) => pct(r.progressRate)} />
                <YearlyRankList title="飲食が強い月" variant="rankFoodDrink" items={yearlyAnalysis.foodDrinkTop3} valueLabel="飲食売上" formatValue={(r) => dy(r.foodDrinkSalesIncludingBandSum)} />
                <YearlyRankList title="ドリンクが強い月" variant="rankDrink" items={yearlyAnalysis.drinkTop3} valueLabel="ドリンク売上" formatValue={(r) => dy(r.drinkSalesSum)} />
                <YearlyRankList title="フードが強い月" variant="rankFood" items={yearlyAnalysis.foodTop3} valueLabel="フード売上" formatValue={(r) => dy(r.foodSalesSum)} />
                <YearlyRankList title="固定費控除後利益が強い月" variant="rankSales" items={yearlyAnalysis.profitTop3} valueLabel="固定費控除後利益" formatValue={(r) => formatFixedCostAdjustedProfit_(r.fixedCostAdjustedProfit)} />
                <YearlyRankList title="飲食単価が高い月" variant="rankFoodDrink" items={yearlyAnalysis.foodDrinkUnitPriceTop3} valueLabel="飲食単価" formatValue={(r) => formatUnitYen_(r.foodDrinkUnitPrice)} />
                <YearlyRankList title="集客が多い月" variant="rankDrink" items={yearlyAnalysis.customerCountTop3} valueLabel="集客人数" formatValue={(r) => formatCustomerCountLabel_(r.customerCountSum)} />
                <YearlyRankList title="営業ベース利益率が高い月" variant="rankFood" items={yearlyAnalysis.operatingProfitRateTop3} valueLabel="営業ベース利益率" formatValue={(r) => pct1(r.operatingProfitRate)} />
              </div>

              <div style={analysisCard("costProfit")}>
                <div style={analysisSecTitle("costProfit", ".35rem")}>年間コスト状況（暫定）</div>
                <div style={{ ...analysisNote({}, vp.narrow), marginBottom: ".45rem" }}>
                  ※人件費は翌月まとめて反映されます。仕入・経費は月末に売掛分が加算されるため、月中は暫定値です。
                  {yearlyAnalysis.monthRows.some((m) => m.hasMonthlyCostSummary) ? (
                    <span style={{ display: "block", marginTop: ".18rem", color: "rgba(201,168,76,0.55)" }}>
                      ※月合計欄の値を反映している月があります（月確定に近い数字です）。
                    </span>
                  ) : null}
                </div>
                <div style={{ marginBottom: ".65rem" }}>
                  <CostProfitBarList bars={yearlyAnalysis.yearlyCostBars} maxValue={yearlyAnalysis.costProfitMax} taxMode={taxMode} narrow={vp.narrow} />
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>営業粗利</div>
                  <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 170), gap: ".32rem .55rem", fontSize: vp.narrow ? ".88rem" : ".78rem", color: "rgba(240,232,208,0.85)" }}>
                    <div>
                      営業粗利{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {yearlyAnalysis.yearlyTotalSales > 0 ? dy(yearlyAnalysis.yearlyOperatingGrossProfit) : "—"}
                      </span>
                    </div>
                    <div>
                      営業粗利率{" "}
                      <span style={{ color: "#f0e8d0" }}>
                        {yearlyAnalysis.yearlyOperatingGrossProfitRate != null
                          ? pct1(yearlyAnalysis.yearlyOperatingGrossProfitRate)
                          : "—"}
                      </span>
                    </div>
                  </div>
                  <div style={analysisNote({ marginTop: ".18rem" }, vp.narrow)}>※売上 − 仕入れ合計 − 経費。営業利益（既存値）は人件費等を含む別指標です。</div>
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>飲食粗利</div>
                  <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 170), gap: ".32rem .55rem", fontSize: vp.narrow ? ".88rem" : ".78rem", color: "rgba(240,232,208,0.85)" }}>
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
                  <div style={analysisNote({ marginTop: ".18rem" }, vp.narrow)}>※飲食売上（バンド飲食代含む）− 仕入れ合計。仕入は月合計欄を優先しています。</div>
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".66rem", color: "rgba(201,168,76,0.85)", marginBottom: ".32rem" }}>年間原価率</div>
                  <div style={{ display: "grid", gridTemplateColumns: rGridCols(vp.narrow, 150), gap: ".32rem .55rem", fontSize: vp.narrow ? ".88rem" : ".74rem", color: "rgba(240,232,208,0.82)" }}>
                    <div>総仕入率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.totalPurchaseRate)}</span></div>
                    <div>ドリンク原価率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.drinkCostRate)}</span></div>
                    <div>フード原価率 <span style={{ color: "#f0e8d0" }}>{pct1(yearlyAnalysis.yearlyPurchaseCostRates.foodCostRate)}</span></div>
                  </div>
                </div>
                <div style={{ marginTop: ".55rem", paddingTop: ".5rem", borderTop: "1px dashed rgba(201,168,76,0.2)" }}>
                  <div style={{ fontSize: ".74rem", color: "rgba(240,232,208,0.78)" }}>
                    参考：バンドギャラ（年間合計） <span style={{ color: "#f0e8d0" }}>{dy(yearlyAnalysis.yearlyBandGuarantee)}</span>
                  </div>
                  <div style={analysisNote({ marginTop: ".1rem" }, vp.narrow)}>※経費には含めていません</div>
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

import { useEffect, useMemo, useState } from "react";

const SALES_API_URL = "/api/sales";
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

export default function SalesModule({ events = [], navigateBack }) {
  const [targetMonth, setTargetMonth] = useState(normalizeMonth(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [records, setRecords] = useState([]);
  const [roleMode, setRoleMode] = useState("staff"); // staff | admin
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

      {roleMode === "staff" && !loading && !error && (
        <>
        <div style={{ ...S.card, marginBottom: ".75rem", border: "2px solid rgba(201,168,76,0.34)", background: "linear-gradient(180deg, rgba(46,36,20,0.42), rgba(17,17,17,0.95))", padding: "1.2rem 1.25rem" }}>
          <div style={{ ...S.secTitle, marginBottom: ".55rem" }}>今月の進捗</div>

          <div style={{ display:"flex", alignItems:"baseline", gap:".55rem", flexWrap:"wrap", marginBottom:".28rem" }}>
            <div style={{ fontFamily:"Georgia,serif", fontSize:"2.35rem", lineHeight:1, color:"#f0e8d0", letterSpacing:".02em" }}>
              {pct(staffProgress.achievementRate)}
            </div>
            <span style={{ fontSize: ".74rem", fontWeight: 600, padding: ".16rem .58rem", borderRadius: 999, background: monthTone.chipBg, border: "1px solid " + monthTone.chipBd, color: monthTone.chipTx }}>
              {monthTone.label}
            </span>
          </div>

          <div style={{ marginBottom: ".6rem", fontSize: ".88rem", color: "rgba(240,232,208,0.92)", fontWeight: 500 }}>
            {staffProgress.remaining > 0
              ? `あと ${yen(staffProgress.remaining)} で目標達成`
              : `月間目標達成 +${yen(Math.abs(staffProgress.remaining))}`}
          </div>

          <div style={{ marginBottom: ".7rem" }}>
            <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.8)", marginBottom: ".3rem" }}>
              目標達成までの進捗 {pct1(staffProgress.achievementRate)}
            </div>
            <div style={{ position: "relative", width: "100%", height: 14, borderRadius: 999, background: "rgba(201,168,76,0.15)", overflow: "hidden" }}>
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

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:".45rem .8rem", fontSize:".74rem", color:"rgba(240,232,208,0.72)", borderTop:"1px dashed rgba(201,168,76,0.24)", paddingTop:".58rem" }}>
            <div>今月売上: <strong style={{ color:"#f0e8d0" }}>{yen(staffProgress.salesSum)}</strong></div>
            <div>今月目標: <strong style={{ color:"#f0e8d0" }}>{yen(staffProgress.targetSum)}</strong></div>
            <div>本日目標: <strong style={{ color:"#f0e8d0" }}>{yen(staffProgress.todayTargetSum)}</strong></div>
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
                const hasEvents = r.resolvedEventNames.length > 0;
                const isDup = !!r.flags?.isDuplicateBusinessDate;
                const label = m.targetSales == null ? "未確定" : "本日";
                const name = r.sheetEventName || (hasEvents ? r.resolvedEventNames[0] : "");
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
                const hasEvents = r.resolvedEventNames.length > 0;
                const isDup = !!r.flags?.isDuplicateBusinessDate;
                const name = r.sheetEventName || (hasEvents ? r.resolvedEventNames[0] : "");
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
                        <span style={{ fontSize:".58rem", padding:".08rem .42rem", borderRadius:3, border:"1px solid rgba(201,168,76,0.35)", color:"#c9a84c" }}>予定</span>
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

      {!loading && !error && rows.length > 0 && roleMode === "admin" && (
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

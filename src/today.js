import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from "firebase/firestore";

// 業務チェックリストのテンプレート
const CHECKLIST_TEMPLATE = {
  prep: {
    label: "開店前",
    icon: "🌅",
    items: [
      "店内清掃", "トイレ清掃", "客席テーブル拭き", "ステージ周り確認",
      "マイク・PA電源確認", "受付準備", "釣銭確認", "予約リスト確認",
      "メニュー表確認", "タブレット注文端末確認", "Wi-Fi確認", "ゴミ袋設置",
    ],
  },
  during: {
    label: "イベント中",
    icon: "🎵",
    items: [
      "受付状況確認", "ドリンク提供状況確認", "フード提供状況確認",
      "客席状況確認", "出演者対応", "転換時間確認",
      "物販スペース確認", "トイレ状態確認",
    ],
  },
  after: {
    label: "終演後",
    icon: "🌙",
    items: [
      "出演者精算", "忘れ物確認", "ステージ片付け", "マイク・ケーブル回収",
      "客席片付け", "テーブル清掃", "洗い物確認", "ゴミまとめ",
      "レジ締め確認", "翌日イベント確認",
    ],
  },
  close: {
    label: "閉店",
    icon: "🔒",
    items: [
      "火元確認", "フライヤー確認", "冷蔵庫確認", "エアコン確認",
      "照明確認", "音響電源OFF", "入口施錠", "裏口施錠", "最終報告",
    ],
  },
};

const S = {
  card: { background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderRadius:6, padding:"1rem 1.25rem", marginBottom:".75rem" },
  secTitle: { fontFamily:"Georgia,serif", fontSize:".7rem", letterSpacing:".25em", textTransform:"uppercase", color:"#c9a84c", borderBottom:"1px solid rgba(201,168,76,0.2)", paddingBottom:".5rem", marginBottom:".75rem", marginTop:"1.25rem" },
  lbl: { fontSize:".65rem", letterSpacing:".12em", textTransform:"uppercase", color:"rgba(201,168,76,0.6)", fontWeight:500, display:"block", marginBottom:".28rem" },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".9rem", padding:".55rem .7rem", outline:"none", width:"100%" },
  btn: (v) => {
    const b = { padding:".5rem 1rem", borderRadius:4, fontFamily:"inherit", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", border:"none" };
    if (v==="gold") return { ...b, background:"#c9a84c", color:"#0a0a0a" };
    if (v==="ghost") return { ...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    if (v==="danger") return { ...b, background:"transparent", color:"#e24b4a", border:"1px solid rgba(226,75,74,0.27)" };
    if (v==="sm") return { ...b, padding:".3rem .65rem", fontSize:".62rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    return b;
  },
};

const DAYS = ["日","月","火","水","木","金","土"];
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${DAYS[dt.getDay()]}）`;
}

function getYesterday(dateStr) {
  const dt = new Date(dateStr + "T00:00:00");
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().split("T")[0];
}

// GoogleドライブのviewリンクをサムネイルURLに変換
function gdriveDirectUrl(url) {
  if (!url) return "";
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!m) return url;
  return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
}

// ミニカレンダー（申し送り日付ピッカー用）
function MiniCalendar({ selectedDates = [], onToggle, mode = "multi", rangeStart, rangeEnd, fromDate }) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prev = () => { if (calMonth === 0) { setCalYear(y=>y-1); setCalMonth(11); } else setCalMonth(m=>m-1); };
  const next = () => { if (calMonth === 11) { setCalYear(y=>y+1); setCalMonth(0); } else setCalMonth(m=>m+1); };
  const todayStr = today.toISOString().split("T")[0];

  const isInRange = (dateStr) => {
    if (mode !== "range") return false;
    if (!rangeStart || !rangeEnd) return false;
    return dateStr >= rangeStart && dateStr <= rangeEnd;
  };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{background:"#0a0a0a",border:"1px solid rgba(244,162,97,0.2)",borderRadius:5,padding:".6rem",marginTop:".4rem"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".5rem"}}>
        <button type="button" onClick={prev} style={{padding:".2rem .55rem",background:"transparent",border:"1px solid rgba(244,162,97,0.27)",borderRadius:3,color:"#f4a261",cursor:"pointer",fontSize:".65rem"}}>◀</button>
        <span style={{fontFamily:"Georgia,serif",fontSize:".82rem",color:"#f4a261",letterSpacing:".05em"}}>{calYear}年{calMonth+1}月</span>
        <button type="button" onClick={next} style={{padding:".2rem .55rem",background:"transparent",border:"1px solid rgba(244,162,97,0.27)",borderRadius:3,color:"#f4a261",cursor:"pointer",fontSize:".65rem"}}>▶</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,marginBottom:1}}>
        {["日","月","火","水","木","金","土"].map((d,i)=>(
          <div key={d} style={{textAlign:"center",fontSize:".58rem",padding:".2rem 0",color:i===0?"#e24b4a":i===6?"#7ec8e3":"rgba(240,232,208,0.4)"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((day, idx) => {
          if (!day) return <div key={"e"+idx}/>;
          const dateStr = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isSelected = selectedDates.includes(dateStr);
          const isToday = dateStr === todayStr;
          const isRangeBetween = isInRange(dateStr);
          const isPast = fromDate && dateStr < fromDate;
          const dow = (firstDay + day - 1) % 7;
          let bg = "transparent";
          if (isSelected) bg = "#f4a261";
          else if (isRangeBetween) bg = "rgba(244,162,97,0.25)";
          else if (isToday) bg = "rgba(201,168,76,0.15)";
          return (
            <button
              key={idx}
              type="button"
              onClick={()=>!isPast && onToggle(dateStr)}
              disabled={isPast}
              style={{
                padding:".35rem 0",fontSize:".68rem",
                background: bg,
                border: isToday && !isSelected ? "1px solid rgba(201,168,76,0.5)" : "1px solid transparent",
                borderRadius:3,
                color: isSelected ? "#0a0a0a" : isPast ? "rgba(240,232,208,0.2)" : isRangeBetween ? "#f4a261" : (dow===0?"#e24b4a":dow===6?"#7ec8e3":"#f0e8d0"),
                cursor: isPast ? "not-allowed" : "pointer",
                fontFamily:"inherit",
                fontWeight: isSelected ? 600 : 400,
                opacity: isPast ? 0.4 : 1,
              }}
            >{day}</button>
          );
        })}
      </div>
    </div>
  );
}

export default function TodayModule({ events = [], navigateBack, onEditEvent }) {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState({});
  const [yesterdayData, setYesterdayData] = useState({});
  const [allDays, setAllDays] = useState([]);
  const [allHandovers, setAllHandovers] = useState([]);
  const [expandedSection, setExpandedSection] = useState("");
  const [newHandoverItem, setNewHandoverItem] = useState("");
  const [newHandoverNote, setNewHandoverNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [handoverMode, setHandoverMode] = useState("nextday"); // nextday | single | multi | range
  const [handoverDate, setHandoverDate] = useState("");
  const [handoverDates, setHandoverDates] = useState([]); // multi
  const [handoverRangeStart, setHandoverRangeStart] = useState("");
  const [handoverRangeEnd, setHandoverRangeEnd] = useState("");

  // Firestore同期：daily + handovers
  useEffect(() => {
    const unsub1 = onSnapshot(collection(db, "daily"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllDays(list);
    });
    const unsub2 = onSnapshot(collection(db, "handovers"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllHandovers(list);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  // 選択日が変わったらデータを切り替え
  useEffect(() => {
    const d = allDays.find(x => x._id === selectedDate);
    setDayData(d || {});
    const y = allDays.find(x => x._id === getYesterday(selectedDate));
    setYesterdayData(y || {});
  }, [selectedDate, allDays]);

  // 保存（フィールド全体上書き用）
  const save = async (updates) => {
    const merged = { ...dayData, ...updates };
    setDayData(merged);
    const { _id, ...data } = merged;
    await setDoc(doc(db, "daily", selectedDate), { ...data, savedAt: new Date().toLocaleString("ja-JP") }, { merge: true });
  };

  // 個別フィールド更新（並列編集に強い：自分が変えたところだけ上書き）
  const updateField = async (path, value) => {
    try {
      // ドキュメントが存在しなければ作る
      const docRef = doc(db, "daily", selectedDate);
      await setDoc(docRef, { [path]: value, savedAt: new Date().toLocaleString("ja-JP") }, { merge: true });
    } catch (e) {
      // 存在しない場合は新規作成
      await setDoc(doc(db, "daily", selectedDate), { [path]: value, savedAt: new Date().toLocaleString("ja-JP") });
    }
  };

  // チェック切替（並列編集対応）
  const toggleCheck = async (category, idx) => {
    const checks = dayData.checks || {};
    const catChecks = [...(checks[category] || [])];
    catChecks[idx] = !catChecks[idx];
    // ドット記法でその位置だけ更新（他のスタッフのチェックを上書きしない）
    await updateField(`checks.${category}.${idx}`, catChecks[idx]);
  };

  // 申し送り：個別項目チェック切替（並列編集対応）
  const toggleHandoverItem = async (handoverId, currentDone) => {
    await updateField_handover(handoverId, "done", !currentDone);
  };

  // 申し送り共通：updateField
  const updateField_handover = async (id, field, value) => {
    await setDoc(doc(db, "handovers", id), { [field]: value, updatedAt: Date.now() }, { merge: true });
  };

  // 申し送り：個別項目追加（モードに応じて対象日を設定）
  const addHandoverItem = async () => {
    if (!newHandoverItem.trim()) return;
    const targetDates = computeTargetDates();
    if (targetDates === null) return;
    if (targetDates.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    const id = `ho_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    await setDoc(doc(db, "handovers", id), {
      type: "item",
      text: newHandoverItem.trim(),
      done: false,
      sourceDate: selectedDate,
      targetDates,
      createdAt: Date.now(),
    });
    setNewHandoverItem("");
  };

  // 申し送り：自由記述追加
  const addHandoverNote = async () => {
    if (!newHandoverNote.trim()) return;
    const targetDates = computeTargetDates();
    if (targetDates === null) return;
    if (targetDates.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    const id = `ho_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    await setDoc(doc(db, "handovers", id), {
      type: "note",
      text: newHandoverNote.trim(),
      sourceDate: selectedDate,
      targetDates,
      createdAt: Date.now(),
    });
    setNewHandoverNote("");
  };

  // 申し送り：削除
  const removeHandoverItem = async (id) => {
    if (!window.confirm("この申し送りを削除しますか？")) return;
    await deleteDoc(doc(db, "handovers", id));
  };

  // モードに応じて targetDates を計算
  const computeTargetDates = () => {
    if (handoverMode === "nextday") {
      const next = new Date(selectedDate + "T00:00:00");
      next.setDate(next.getDate() + 1);
      return [next.toISOString().split("T")[0]];
    }
    if (handoverMode === "single") {
      if (!handoverDate) return [];
      return [handoverDate];
    }
    if (handoverMode === "multi") {
      return [...handoverDates];
    }
    if (handoverMode === "range") {
      if (!handoverRangeStart || !handoverRangeEnd) return [];
      const start = new Date(handoverRangeStart + "T00:00:00");
      const end = new Date(handoverRangeEnd + "T00:00:00");
      if (end < start) { alert("終了日が開始日より前になっています"); return null; }
      const dates = [];
      const cur = new Date(start);
      while (cur <= end) {
        dates.push(cur.toISOString().split("T")[0]);
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    }
    return [];
  };

  // multi: 日付追加/削除
  const toggleMultiDate = (date) => {
    if (handoverDates.includes(date)) {
      setHandoverDates(handoverDates.filter(d => d !== date));
    } else {
      setHandoverDates([...handoverDates, date].sort());
    }
  };
  const addMultiDateInput = (e) => {
    if (e.target.value && !handoverDates.includes(e.target.value)) {
      setHandoverDates([...handoverDates, e.target.value].sort());
    }
    e.target.value = "";
  };

  // 当日に届く申し送り
  const incomingHandovers = allHandovers.filter(h => (h.targetDates || []).includes(selectedDate));
  // 自分が当日に発行した申し送り
  const outgoingHandovers = allHandovers.filter(h => h.sourceDate === selectedDate);

  // 日付ナビ
  const prevDay = () => {
    setSelectedDate(prev => {
      const dt = new Date(prev + "T00:00:00");
      dt.setDate(dt.getDate() - 1);
      return dt.toISOString().split("T")[0];
    });
  };
  const nextDay = () => {
    setSelectedDate(prev => {
      const dt = new Date(prev + "T00:00:00");
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString().split("T")[0];
    });
  };
  const goToday = () => setSelectedDate(today);
  const isToday = selectedDate === today;

  // 当日のイベント
  const todayEvents = events.filter(e => e.date === selectedDate);

  // 過去の申し送り履歴（過去14日に発行されたもの）
  const handoverHistory = allHandovers
    .filter(h => h.sourceDate && h.sourceDate < selectedDate)
    .sort((a, b) => (b.sourceDate || "").localeCompare(a.sourceDate || ""))
    .slice(0, 50);

  return (
    <div style={{padding:"1rem .85rem",maxWidth:720,margin:"0 auto"}} className="hb-view">
      {/* ヘッダー：日付選択 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <button type="button" onClick={prevDay} style={{...S.btn("sm"),padding:".4rem .7rem"}}>◀</button>
        <div style={{flex:1,textAlign:"center",minWidth:200}}>
          <input
            type="date"
            value={selectedDate}
            onChange={e=>e.target.value && setSelectedDate(e.target.value)}
            style={{...S.inp,fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".05em",textAlign:"center",cursor:"pointer",padding:".4rem .65rem",width:"auto",minWidth:160,display:"inline-block"}}
          />
          <div style={{fontSize:".68rem",color:"rgba(240,232,208,0.55)",marginTop:".2rem"}}>
            {fmtDate(selectedDate)}
            <span style={{marginLeft:".5rem",color:"rgba(240,232,208,0.4)"}}>
              {isToday ? "（本日）" : selectedDate < today ? "（過去）" : "（未来）"}
            </span>
            {!isToday && <button type="button" style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".55rem",marginLeft:".5rem"}} onClick={goToday}>今日へ</button>}
          </div>
        </div>
        <button type="button" onClick={nextDay} style={{...S.btn("sm"),padding:".4rem .7rem"}}>▶</button>
      </div>

      {/* 当日に届く申し送り */}
      {incomingHandovers.length > 0 && (
        <div style={{padding:"1rem 1.1rem",marginBottom:"1.25rem",background:"rgba(244,162,97,0.08)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:8}}>
          <div style={{fontSize:".7rem",letterSpacing:".15em",color:"#f4a261",marginBottom:".75rem",fontWeight:600}}>📋 申し送り</div>
          {incomingHandovers.map(h => {
            const isFromPast = h.sourceDate && h.sourceDate < selectedDate;
            const fromLabel = h.sourceDate === selectedDate
              ? "本日"
              : fmtDate(h.sourceDate || "").replace(/^\d+年/,"") + " から";
            return (
              <div key={h._id} style={{padding:".55rem .7rem",background:h.done?"rgba(126,200,127,0.08)":"rgba(244,162,97,0.04)",borderRadius:5,marginBottom:".4rem",display:"flex",alignItems:"flex-start",gap:".5rem"}}>
                {h.type === "item" && (
                  <input type="checkbox" checked={!!h.done} onChange={()=>toggleHandoverItem(h._id, h.done)} style={{accentColor:"#7ec87e",width:18,height:18,marginTop:"3px",flexShrink:0}}/>
                )}
                {h.type === "note" && <span style={{color:"#f4a261",marginTop:"2px"}}>•</span>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:".82rem",color:h.done?"rgba(126,200,127,0.6)":"rgba(240,232,208,0.85)",textDecoration:h.done?"line-through":"none",lineHeight:1.6,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>
                    {h.text}
                  </div>
                  <div style={{fontSize:".58rem",color:"rgba(240,232,208,0.4)",marginTop:".15rem",letterSpacing:".05em"}}>
                    {fromLabel}
                    {(h.targetDates||[]).length > 1 && ` / 計${h.targetDates.length}日`}
                  </div>
                </div>
                <button onClick={()=>removeHandoverItem(h._id)} style={{padding:".15rem .35rem",background:"transparent",border:"none",color:"rgba(226,75,74,0.5)",cursor:"pointer",fontSize:".7rem"}}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* 当日のイベント */}
      <div style={S.secTitle}>🎵 本日のイベント</div>
      {todayEvents.length === 0 ? (
        <div style={{textAlign:"center",padding:"1.5rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem",background:"#0d0d0d",borderRadius:5,marginBottom:"1rem"}}>
          イベントの予定はありません
        </div>
      ) : (
        todayEvents.map((ev, i) => (
          <div key={i} style={{...S.card,padding:"1rem 1.1rem"}}>
            {/* ポスター（上部に大きく表示） */}
            {ev.poster && (
              <a href={ev.poster} target="_blank" rel="noreferrer" style={{display:"block",marginBottom:".75rem",textAlign:"center",background:"#0a0a0a",borderRadius:5,overflow:"hidden",border:"1px solid rgba(201,168,76,0.15)"}}>
                <img
                  src={gdriveDirectUrl(ev.poster)}
                  alt={ev.name+"ポスター"}
                  style={{maxWidth:"100%",maxHeight:300,display:"block",margin:"0 auto",objectFit:"contain"}}
                  onError={(e)=>{e.target.style.display="none";e.target.nextSibling.style.display="block";}}
                />
                <div style={{display:"none",padding:"1rem",color:"#c9a84c",fontSize:".75rem"}}>🖼 ポスターを開く（プレビュー読み込み失敗）</div>
              </a>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:".5rem",marginBottom:".5rem",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",marginBottom:".25rem"}}>{ev.name}</div>
                <div style={{fontSize:".75rem",color:"rgba(240,232,208,0.6)",lineHeight:1.7}}>
                  {ev.open && <div>🚪 開場 {ev.open}{ev.start && ` / 開演 ${ev.start}`}</div>}
                  {ev.price && <div>💴 {ev.price}</div>}
                  {ev.cap && <div>👥 定員 {ev.cap}名</div>}
                  {ev.perf && <div style={{marginTop:".3rem"}}>✨ {ev.perf}</div>}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:".3rem"}}>
                {onEditEvent && <button type="button" style={S.btn("sm")} onClick={()=>onEditEvent(ev._id)}>📝 編集</button>}
              </div>
            </div>
            {ev.notes && (
              <div style={{marginTop:".5rem",padding:".5rem .7rem",background:"rgba(226,75,74,0.08)",borderLeft:"2px solid rgba(226,75,74,0.4)",borderRadius:3,fontSize:".75rem",color:"rgba(240,232,208,0.75)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                ⚠️ {ev.notes}
              </div>
            )}
          </div>
        ))
      )}

      {/* スタッフ向け注意事項 */}
      <div style={S.secTitle}>📝 スタッフ向け注意事項</div>
      <textarea
        style={{...S.inp,resize:"vertical",lineHeight:1.6,minHeight:80}}
        value={dayData.staffNote || ""}
        onChange={e=>{
          setDayData({...dayData, staffNote: e.target.value});
          updateField("staffNote", e.target.value);
        }}
        placeholder="例：佐藤様アレルギー対応 / VIP予約 / 急なシフト変更 など"
      />

      {/* 業務チェックリスト */}
      <div style={S.secTitle}>✅ 業務チェックリスト</div>
      {Object.entries(CHECKLIST_TEMPLATE).map(([key, cat]) => {
        const checks = (dayData.checks || {})[key] || [];
        const total = cat.items.length;
        const done = checks.filter(Boolean).length;
        const pct = Math.round((done/total)*100);
        const isExpanded = expandedSection === key;
        return (
          <div key={key} style={{marginBottom:".5rem",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,overflow:"hidden"}}>
            <button
              onClick={()=>setExpandedSection(isExpanded ? "" : key)}
              style={{
                width:"100%",padding:".75rem 1rem",background: done===total?"rgba(126,200,127,0.08)":"#111",
                border:"none",cursor:"pointer",fontFamily:"inherit",color:"#f0e8d0",
                display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem"
              }}
            >
              <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                <span style={{fontSize:"1.1rem"}}>{cat.icon}</span>
                <span style={{fontSize:".88rem"}}>{cat.label}</span>
                {done===total && total>0 && <span style={{color:"#7ec87e",fontSize:".7rem"}}>✓ 完了</span>}
              </div>
              <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
                <span style={{fontSize:".75rem",color:done===total?"#7ec87e":"rgba(240,232,208,0.5)"}}>{done}/{total}</span>
                <span style={{fontSize:".7rem",color:"rgba(240,232,208,0.4)"}}>{isExpanded?"▲":"▼"}</span>
              </div>
            </button>
            {/* プログレスバー */}
            <div style={{height:2,background:"rgba(255,255,255,0.05)"}}>
              <div style={{height:"100%",width:`${pct}%`,background:done===total?"#7ec87e":"#c9a84c",transition:"width .3s"}}/>
            </div>
            {isExpanded && (
              <div style={{padding:".5rem"}}>
                {cat.items.map((item, idx) => {
                  const checked = !!checks[idx];
                  return (
                    <label key={idx} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".7rem .8rem",cursor:"pointer",borderRadius:4,marginBottom:".15rem",background:checked?"rgba(126,200,127,0.05)":"transparent"}}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={()=>toggleCheck(key, idx)}
                        style={{accentColor:"#7ec87e",width:20,height:20,flexShrink:0}}
                      />
                      <span style={{fontSize:".88rem",color:checked?"rgba(126,200,127,0.7)":"rgba(240,232,208,0.85)",textDecoration:checked?"line-through":"none"}}>{item}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* 申し送り作成 */}
      <div style={S.secTitle}>📋 申し送りを送る</div>

      {/* 送り先の選択 */}
      <div style={{padding:".75rem .9rem",background:"#0d0d0d",border:"1px solid rgba(244,162,97,0.15)",borderRadius:5,marginBottom:".75rem"}}>
        <div style={{fontSize:".62rem",color:"rgba(244,162,97,0.7)",marginBottom:".5rem",letterSpacing:".1em"}}>📅 送り先</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:".4rem",marginBottom:".5rem"}}>
          {[
            {k:"nextday",l:"明日"},
            {k:"single",l:"日付指定"},
            {k:"multi",l:"複数日"},
            {k:"range",l:"期間"},
          ].map(m => (
            <button key={m.k} onClick={()=>setHandoverMode(m.k)} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(handoverMode===m.k?"#f4a261":"rgba(244,162,97,0.2)"),background:handoverMode===m.k?"#f4a261":"transparent",color:handoverMode===m.k?"#0a0a0a":"rgba(244,162,97,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{m.l}</button>
          ))}
        </div>

        {handoverMode === "nextday" && (
          <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.6)"}}>
            → 翌日（{(() => { const n = new Date(selectedDate+"T00:00:00"); n.setDate(n.getDate()+1); return fmtDate(n.toISOString().split("T")[0]); })()}）に表示
          </div>
        )}

        {handoverMode === "single" && (
          <>
            <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
              {handoverDate ? `→ ${fmtDate(handoverDate)} に表示` : "カレンダーから日付を選択"}
            </div>
            <MiniCalendar
              selectedDates={handoverDate ? [handoverDate] : []}
              onToggle={(d)=>setHandoverDate(d===handoverDate?"":d)}
              mode="single"
              fromDate={selectedDate}
            />
          </>
        )}

        {handoverMode === "multi" && (
          <>
            <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
              {handoverDates.length === 0 ? "カレンダーから複数の日付を選択" : `${handoverDates.length}日間に表示`}
            </div>
            <MiniCalendar
              selectedDates={handoverDates}
              onToggle={toggleMultiDate}
              mode="multi"
              fromDate={selectedDate}
            />
            {handoverDates.length > 0 && (
              <div style={{display:"flex",flexWrap:"wrap",gap:".3rem",marginTop:".4rem"}}>
                {handoverDates.map(d => (
                  <span key={d} style={{padding:".15rem .45rem",background:"rgba(244,162,97,0.13)",borderRadius:3,fontSize:".62rem",color:"#f4a261",display:"inline-flex",alignItems:"center",gap:".25rem"}}>
                    {d.slice(5)}
                    <button type="button" onClick={()=>toggleMultiDate(d)} style={{background:"transparent",border:"none",color:"#f4a261",cursor:"pointer",padding:0,fontSize:".62rem"}}>✕</button>
                  </span>
                ))}
                <button type="button" onClick={()=>setHandoverDates([])} style={{...S.btn("sm"),padding:".1rem .4rem",fontSize:".55rem"}}>クリア</button>
              </div>
            )}
          </>
        )}

        {handoverMode === "range" && (
          <>
            <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
              {!handoverRangeStart ? "開始日をタップ" : !handoverRangeEnd ? "終了日をタップ" : (() => {
                const s = new Date(handoverRangeStart+"T00:00:00");
                const e = new Date(handoverRangeEnd+"T00:00:00");
                return `${handoverRangeStart} 〜 ${handoverRangeEnd} （${Math.round((e-s)/86400000)+1}日間）`;
              })()}
            </div>
            <MiniCalendar
              selectedDates={[handoverRangeStart, handoverRangeEnd].filter(Boolean)}
              onToggle={(d)=>{
                if (!handoverRangeStart || (handoverRangeStart && handoverRangeEnd)) {
                  setHandoverRangeStart(d);
                  setHandoverRangeEnd("");
                } else {
                  if (d < handoverRangeStart) {
                    setHandoverRangeEnd(handoverRangeStart);
                    setHandoverRangeStart(d);
                  } else if (d === handoverRangeStart) {
                    setHandoverRangeStart("");
                  } else {
                    setHandoverRangeEnd(d);
                  }
                }
              }}
              mode="range"
              rangeStart={handoverRangeStart}
              rangeEnd={handoverRangeEnd}
              fromDate={selectedDate}
            />
            {(handoverRangeStart || handoverRangeEnd) && (
              <button type="button" onClick={()=>{setHandoverRangeStart("");setHandoverRangeEnd("");}} style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".58rem",marginTop:".4rem"}}>リセット</button>
            )}
          </>
        )}
      </div>

      {/* 自由記述欄 */}
      <div style={{display:"flex",gap:".4rem",marginBottom:".5rem"}}>
        <textarea
          style={{...S.inp,resize:"vertical",lineHeight:1.6,minHeight:60,flex:1}}
          value={newHandoverNote}
          onChange={e=>setNewHandoverNote(e.target.value)}
          placeholder="自由記述で送る（共有事項・特記など）"
        />
        <button style={{...S.btn("gold"),alignSelf:"flex-end"}} onClick={addHandoverNote}>送信</button>
      </div>

      {/* 個別チェック項目 */}
      <div style={{display:"flex",gap:".4rem",marginBottom:".75rem"}}>
        <input
          style={{...S.inp,flex:1}}
          value={newHandoverItem}
          onChange={e=>setNewHandoverItem(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addHandoverItem();}}}
          placeholder="チェック項目で送る（例：ケーキ用意 / 冷蔵庫確認）"
        />
        <button style={S.btn("gold")} onClick={addHandoverItem}>送信</button>
      </div>

      {/* 自分が今日送った申し送り */}
      {outgoingHandovers.length > 0 && (
        <div style={{marginBottom:"1rem"}}>
          <div style={{fontSize:".62rem",color:"rgba(201,168,76,0.5)",marginBottom:".4rem",letterSpacing:".1em"}}>📤 本日送信した申し送り（{outgoingHandovers.length}件）</div>
          {outgoingHandovers.map(h => (
            <div key={h._id} style={{padding:".4rem .65rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.08)",borderRadius:4,marginBottom:".25rem",display:"flex",alignItems:"center",gap:".5rem"}}>
              <span style={{fontSize:".55rem",padding:".1rem .4rem",borderRadius:2,background:h.type==="item"?"rgba(126,200,127,0.13)":"rgba(126,200,227,0.13)",color:h.type==="item"?"#7ec87e":"#7ec8e3",letterSpacing:".05em"}}>
                {h.type === "item" ? "☑" : "📝"}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".75rem",color:"rgba(240,232,208,0.7)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{h.text}</div>
                <div style={{fontSize:".58rem",color:"rgba(240,232,208,0.4)"}}>
                  {(h.targetDates||[]).length === 1 ? `→ ${h.targetDates[0]}` : `→ ${(h.targetDates||[]).length}日に送信`}
                </div>
              </div>
              <button onClick={()=>removeHandoverItem(h._id)} style={{padding:".2rem .4rem",background:"transparent",border:"none",color:"rgba(226,75,74,0.5)",cursor:"pointer",fontSize:".7rem"}}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* 過去の申し送り */}
      <button
        style={{...S.btn("ghost"),width:"100%",fontSize:".7rem"}}
        onClick={()=>setShowHistory(!showHistory)}
      >
        {showHistory ? "▲ 過去に発行された申し送りを隠す" : "▼ 過去に発行された申し送りを見る"}
      </button>

      {showHistory && (
        <div style={{marginTop:".75rem"}}>
          {handoverHistory.length === 0 ? (
            <div style={{textAlign:"center",padding:"1rem",color:"rgba(240,232,208,0.3)",fontSize:".8rem"}}>過去の申し送りはありません</div>
          ) : (
            (() => {
              const grouped = {};
              handoverHistory.forEach(h => {
                if (!grouped[h.sourceDate]) grouped[h.sourceDate] = [];
                grouped[h.sourceDate].push(h);
              });
              return Object.keys(grouped).sort((a,b)=>b.localeCompare(a)).map(date => (
                <div key={date} style={{padding:".75rem 1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.08)",borderRadius:5,marginBottom:".5rem"}}>
                  <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",marginBottom:".4rem",letterSpacing:".1em"}}>{fmtDate(date)} 発行</div>
                  {grouped[date].map(h => (
                    <div key={h._id} style={{fontSize:".75rem",color:h.done?"rgba(126,200,127,0.5)":"rgba(240,232,208,0.7)",textDecoration:h.done&&h.type==="item"?"line-through":"none",paddingLeft:".5rem",marginBottom:".15rem"}}>
                      {h.type === "item" ? (h.done?"✓":"☐") : "📝"} {h.text}
                      <span style={{fontSize:".58rem",color:"rgba(240,232,208,0.35)",marginLeft:".5rem"}}>→ {(h.targetDates||[]).length}日</span>
                    </div>
                  ))}
                </div>
              ));
            })()
          )}
        </div>
      )}
    </div>
  );
}

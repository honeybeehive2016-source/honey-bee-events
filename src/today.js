import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

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

export default function TodayModule({ events = [], navigateBack, onEditEvent }) {
  const today = new Date().toISOString().split("T")[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayData, setDayData] = useState({});  // 当日のデータ
  const [yesterdayData, setYesterdayData] = useState({}); // 前日のデータ
  const [allDays, setAllDays] = useState([]); // 全日付のデータ
  const [expandedSection, setExpandedSection] = useState("prep");
  const [newHandoverItem, setNewHandoverItem] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  // Firestore同期
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "daily"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllDays(list);
    });
    return () => unsub();
  }, []);

  // 選択日が変わったらデータを切り替え
  useEffect(() => {
    const d = allDays.find(x => x._id === selectedDate);
    setDayData(d || {});
    const y = allDays.find(x => x._id === getYesterday(selectedDate));
    setYesterdayData(y || {});
  }, [selectedDate, allDays]);

  // 保存
  const save = async (updates) => {
    const merged = { ...dayData, ...updates };
    setDayData(merged);
    const { _id, ...data } = merged;
    await setDoc(doc(db, "daily", selectedDate), { ...data, savedAt: new Date().toLocaleString("ja-JP") });
  };

  // チェック切替
  const toggleCheck = (category, idx) => {
    const checks = dayData.checks || {};
    const catChecks = checks[category] || [];
    const newCatChecks = [...catChecks];
    newCatChecks[idx] = !newCatChecks[idx];
    save({ checks: { ...checks, [category]: newCatChecks } });
  };

  // 申し送り：個別項目チェック切替
  const toggleHandoverItem = (idx) => {
    const items = [...(dayData.handoverItems || [])];
    if (!items[idx]) return;
    items[idx] = { ...items[idx], done: !items[idx].done };
    save({ handoverItems: items });
  };

  // 申し送り：個別項目追加
  const addHandoverItem = () => {
    if (!newHandoverItem.trim()) return;
    const items = [...(dayData.handoverItems || [])];
    items.push({ text: newHandoverItem.trim(), done: false, createdAt: Date.now() });
    save({ handoverItems: items });
    setNewHandoverItem("");
  };

  // 申し送り：個別項目削除
  const removeHandoverItem = (idx) => {
    const items = (dayData.handoverItems || []).filter((_, i) => i !== idx);
    save({ handoverItems: items });
  };

  // 日付ナビ
  const prevDay = () => {
    const dt = new Date(selectedDate + "T00:00:00");
    dt.setDate(dt.getDate() - 1);
    setSelectedDate(dt.toISOString().split("T")[0]);
  };
  const nextDay = () => {
    const dt = new Date(selectedDate + "T00:00:00");
    dt.setDate(dt.getDate() + 1);
    setSelectedDate(dt.toISOString().split("T")[0]);
  };
  const goToday = () => setSelectedDate(today);
  const isToday = selectedDate === today;

  // 当日のイベント
  const todayEvents = events.filter(e => e.date === selectedDate);

  // 過去の申し送り
  const handoverHistory = allDays
    .filter(d => d._id < selectedDate && (d.handoverNote || (d.handoverItems||[]).length > 0))
    .sort((a, b) => b._id.localeCompare(a._id))
    .slice(0, 14);

  return (
    <div style={{padding:"1rem .85rem",maxWidth:720,margin:"0 auto"}} className="hb-view">
      {/* ヘッダー：日付選択 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:".5rem",marginBottom:"1rem"}}>
        <button onClick={prevDay} style={{...S.btn("sm"),padding:".4rem .7rem"}}>◀</button>
        <div style={{flex:1,textAlign:"center"}}>
          <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".1em"}}>
            {fmtDate(selectedDate)}
          </div>
          <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginTop:".15rem"}}>
            {isToday ? "本日" : isToday===false && selectedDate < today ? "過去" : "未来"}
            {!isToday && <button style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".55rem",marginLeft:".5rem"}} onClick={goToday}>今日へ</button>}
          </div>
        </div>
        <button onClick={nextDay} style={{...S.btn("sm"),padding:".4rem .7rem"}}>▶</button>
      </div>

      {/* 前日からの申し送り */}
      {(yesterdayData.handoverNote || (yesterdayData.handoverItems||[]).filter(i=>!i.done).length > 0) && (
        <div style={{padding:"1rem 1.1rem",marginBottom:"1.25rem",background:"rgba(244,162,97,0.08)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:8}}>
          <div style={{fontSize:".7rem",letterSpacing:".15em",color:"#f4a261",marginBottom:".75rem",fontWeight:600}}>📋 前日からの申し送り</div>
          {yesterdayData.handoverNote && (
            <div style={{fontSize:".82rem",color:"rgba(240,232,208,0.85)",lineHeight:1.7,whiteSpace:"pre-wrap",marginBottom:(yesterdayData.handoverItems||[]).length>0?".75rem":0}}>
              {yesterdayData.handoverNote}
            </div>
          )}
          {(yesterdayData.handoverItems||[]).filter(i=>!i.done).map((item,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".4rem .55rem",background:"rgba(244,162,97,0.08)",borderRadius:4,marginBottom:".25rem",fontSize:".82rem",color:"rgba(240,232,208,0.85)"}}>
              <span style={{color:"#f4a261"}}>•</span>
              {item.text}
            </div>
          ))}
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
                {ev.poster && <a href={ev.poster} target="_blank" rel="noreferrer" style={{...S.btn("sm"),textDecoration:"none",display:"inline-block",textAlign:"center"}}>🖼 ポスター</a>}
                {onEditEvent && <button style={S.btn("sm")} onClick={()=>onEditEvent(ev._id)}>📝 編集</button>}
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
        onChange={e=>save({staffNote:e.target.value})}
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

      {/* 申し送り（次の日に伝える） */}
      <div style={S.secTitle}>📋 申し送り（明日に伝える）</div>

      {/* 自由記述欄 */}
      <textarea
        style={{...S.inp,resize:"vertical",lineHeight:1.6,minHeight:80,marginBottom:".75rem"}}
        value={dayData.handoverNote || ""}
        onChange={e=>save({handoverNote:e.target.value})}
        placeholder="自由記述：今日あった特記事項・全体的な共有事項など"
      />

      {/* 個別項目 */}
      <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",marginBottom:".5rem",letterSpacing:".1em"}}>個別チェック項目</div>
      {(dayData.handoverItems || []).map((item, i) => (
        <div key={i} style={{display:"flex",alignItems:"center",gap:".5rem",padding:".5rem .7rem",background:item.done?"rgba(126,200,127,0.08)":"#0d0d0d",border:"1px solid rgba(201,168,76,0.08)",borderRadius:4,marginBottom:".25rem"}}>
          <input type="checkbox" checked={!!item.done} onChange={()=>toggleHandoverItem(i)} style={{accentColor:"#7ec87e",width:18,height:18}}/>
          <span style={{flex:1,fontSize:".82rem",color:item.done?"rgba(126,200,127,0.7)":"rgba(240,232,208,0.85)",textDecoration:item.done?"line-through":"none",wordBreak:"break-word"}}>{item.text}</span>
          <button onClick={()=>removeHandoverItem(i)} style={{padding:".25rem .4rem",background:"transparent",border:"none",color:"rgba(226,75,74,0.6)",cursor:"pointer",fontSize:".8rem"}}>✕</button>
        </div>
      ))}

      <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
        <input
          style={{...S.inp,flex:1}}
          value={newHandoverItem}
          onChange={e=>setNewHandoverItem(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addHandoverItem();}}}
          placeholder="例：冷蔵庫の野菜を確認"
        />
        <button style={S.btn("gold")} onClick={addHandoverItem}>追加</button>
      </div>

      {/* 過去の申し送り */}
      <button
        style={{...S.btn("ghost"),width:"100%",fontSize:".7rem"}}
        onClick={()=>setShowHistory(!showHistory)}
      >
        {showHistory ? "▲ 過去の申し送りを隠す" : "▼ 過去の申し送りを見る"}
      </button>

      {showHistory && (
        <div style={{marginTop:".75rem"}}>
          {handoverHistory.length === 0 ? (
            <div style={{textAlign:"center",padding:"1rem",color:"rgba(240,232,208,0.3)",fontSize:".8rem"}}>過去の申し送りはありません</div>
          ) : handoverHistory.map(d => (
            <div key={d._id} style={{padding:".75rem 1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.08)",borderRadius:5,marginBottom:".5rem"}}>
              <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",marginBottom:".4rem",letterSpacing:".1em"}}>{fmtDate(d._id)}</div>
              {d.handoverNote && (
                <div style={{fontSize:".78rem",color:"rgba(240,232,208,0.7)",lineHeight:1.6,whiteSpace:"pre-wrap",marginBottom:(d.handoverItems||[]).length>0?".4rem":0}}>{d.handoverNote}</div>
              )}
              {(d.handoverItems||[]).map((item,i)=>(
                <div key={i} style={{fontSize:".75rem",color:item.done?"rgba(126,200,127,0.5)":"rgba(240,232,208,0.7)",textDecoration:item.done?"line-through":"none",paddingLeft:".5rem"}}>
                  {item.done?"✓":"•"} {item.text}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

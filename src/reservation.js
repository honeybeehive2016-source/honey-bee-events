import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { getOrderedStaffNames } from "./shift";
import { sendReservationEmails } from "./email";
import { SeatPicker, DayLayoutView, getDefaultLayout } from "./seatLayout";

const S = {
  card: { background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderRadius:6, padding:"1rem 1.25rem", marginBottom:".75rem" },
  secTitle: { fontFamily:"Georgia,serif", fontSize:".7rem", letterSpacing:".25em", textTransform:"uppercase", color:"#c9a84c", borderBottom:"1px solid rgba(201,168,76,0.2)", paddingBottom:".5rem", marginBottom:".75rem", marginTop:"1.25rem" },
  lbl: { fontSize:".65rem", letterSpacing:".12em", textTransform:"uppercase", color:"rgba(201,168,76,0.6)", fontWeight:500, display:"block", marginBottom:".28rem" },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".85rem", padding:".5rem .65rem", outline:"none", width:"100%" },
  btn: (v) => {
    const b = { padding:".5rem 1rem", borderRadius:4, fontFamily:"inherit", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", border:"none" };
    if (v==="gold") return { ...b, background:"#c9a84c", color:"#0a0a0a" };
    if (v==="ghost") return { ...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    if (v==="danger") return { ...b, background:"transparent", color:"#e24b4a", border:"1px solid rgba(226,75,74,0.27)" };
    if (v==="sm") return { ...b, padding:".3rem .65rem", fontSize:".62rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    return b;
  },
};

const Field = ({ label, children, full, required }) => (
  <div style={{ gridColumn: full ? "1/-1" : undefined, display:"flex", flexDirection:"column" }}>
    <label style={S.lbl}>{label}{required && <span style={{color:"#e24b4a",marginLeft:".25rem"}}>*</span>}</label>
    {children}
  </div>
);

const DAYS_JP = ["日","月","火","水","木","金","土"];
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${DAYS_JP[dt.getDay()]}）`;
}

// 予約経路リスト（並び順）
export const SOURCE_OPTIONS = [
  { value: "phone", label: "📞 電話", icon: "📞" },
  { value: "form", label: "📝 フォーム", icon: "📝" },
  { value: "walkin", label: "🚶 直接来店", icon: "🚶" },
  { value: "performer", label: "🤝 出演者経由", icon: "🤝" },
  { value: "email", label: "📧 メール", icon: "📧" },
  { value: "line", label: "💬 LINE", icon: "💬" },
  { value: "other", label: "✏️ その他", icon: "✏️" },
];
export const sourceIcon = (source) => SOURCE_OPTIONS.find(s => s.value === source)?.icon || "📞";
export const sourceLabel = (source) => SOURCE_OPTIONS.find(s => s.value === source)?.label || source;

const emptyReservation = {
  eventName: "",
  date: "",
  customerName: "",
  people: 1,
  phone: "",
  email: "",
  note: "",
  source: "phone",
  sourceDetail: "", // 「その他」の場合の詳細
  staff: "", // 受付担当者
  arrived: false,
  arrivedAt: "",
  seatNumber: "",
};

export default function ReservationModule({ events = [], shifts = [], navigateBack, onGoSeatLayout, initialFilter }) {
  const [reservations, setReservations] = useState([]);
  // メインビュー: list（一覧）/ calendar（カレンダー＆日付詳細）/ edit（編集）
  const [view, setView] = useState("calendar");
  const [form, setForm] = useState(emptyReservation);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState(initialFilter || "upcoming");
  const [dateFilter, setDateFilter] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [allReservations, setAllReservations] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [dayLayoutMap, setDayLayoutMap] = useState({}); // dateKey -> layoutId
  // カレンダーで選択中の日付（詳細表示用）
  const [calSelectedDate, setCalSelectedDate] = useState(new Date().toISOString().split("T")[0]);
  // カレンダーの月（年月）
  const [calYearMonth, setCalYearMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // シフトデータからスタッフ名を抽出（CSV順、社長は最後）
  const staffNames = getOrderedStaffNames(shifts);
  // 席選択ポップアップ
  const [showSeatPicker, setShowSeatPicker] = useState(false);

  useEffect(() => {
    const TRASH_TTL = 30 * 24 * 60 * 60 * 1000;
    const unsub = onSnapshot(collection(db, "reservations"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllReservations(list);
      setReservations(list.filter(r => !r._deleted));
      list.filter(r => r._deleted && r._deletedAt && (Date.now() - r._deletedAt) > TRASH_TTL)
        .forEach(r => deleteDoc(doc(db, "reservations", r._id)).catch(()=>{}));
    });
    const unsubL = onSnapshot(collection(db, "seatLayouts"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      list.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      setLayouts(list);
    });
    const unsubD = onSnapshot(collection(db, "daily"), (snap) => {
      const map = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.layoutId) map[d.id] = data.layoutId;
      });
      setDayLayoutMap(map);
    });
    return () => { unsub(); unsubL(); unsubD(); };
  }, []);

  // 一日のレイアウトを変更
  const setDayLayout = async (dateKey, layoutId) => {
    setDayLayoutMap(m => ({ ...m, [dateKey]: layoutId }));
    try {
      await setDoc(doc(db, "daily", dateKey), {
        layoutId,
        savedAt: new Date().toLocaleString("ja-JP"),
      }, { merge: true });
    } catch (e) {
      console.error("レイアウト保存失敗:", e);
    }
  };

  // initialFilter が "today" などの時は list view に切り替え
  useEffect(() => {
    if (initialFilter) {
      setFilter(initialFilter);
      setView("list");
    }
  }, [initialFilter]);

  const trashReservations = allReservations.filter(r => r._deleted);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startNew = () => {
    setForm({ ...emptyReservation, source: "phone", date: dateFilter || new Date().toISOString().split("T")[0] });
    setEditingId(null);
    setView("edit");
  };

  const startEdit = (r) => {
    setForm({ ...emptyReservation, ...r });
    setEditingId(r._id);
    setView("edit");
  };

  const handleSave = async () => {
    if (!form.customerName) { alert("お名前を入力してください"); return; }
    if (!form.date) { alert("日付を選択してください"); return; }
    try {
      const id = editingId || `res_${Date.now().toString(36)}`;
      const { _id, ...data } = form;
      data.savedAt = new Date().toLocaleString("ja-JP");
      if (!data.createdAt) data.createdAt = Date.now();
      await setDoc(doc(db, "reservations", id), data);

      // 新規予約でメアドあり、かつ確認メール送信が選択されていたら送る
      if (!editingId && data.email && data.sendEmail) {
        try {
          await sendReservationEmails(data);
        } catch (emailErr) {
          console.error("メール通知エラー:", emailErr);
        }
      }

      alert("✓ 保存しました" + (!editingId && data.email && data.sendEmail ? "\n📧 確認メールを送信しました" : ""));
      setView("list");
    } catch (e) { alert("保存失敗：" + e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この予約をゴミ箱に移動しますか？\n（30日以内なら復元できます）")) return;
    const target = allReservations.find(r => r._id === id);
    if (!target) return;
    const { _id, ...data } = target;
    await setDoc(doc(db, "reservations", id), { ...data, _deleted: true, _deletedAt: Date.now() });
  };

  const restoreReservation = async (id) => {
    const target = allReservations.find(r => r._id === id);
    if (!target) return;
    const { _id, _deleted, _deletedAt, ...data } = target;
    await setDoc(doc(db, "reservations", id), data);
  };

  const purgeReservation = async (id) => {
    if (!window.confirm("この予約を完全に削除しますか？")) return;
    await deleteDoc(doc(db, "reservations", id));
  };

  // 受付チェック切替
  const toggleArrived = async (id) => {
    const target = reservations.find(r => r._id === id);
    if (!target) return;
    const newArrived = !target.arrived;
    const { _id, ...data } = target;
    await setDoc(doc(db, "reservations", id), {
      ...data,
      arrived: newArrived,
      arrivedAt: newArrived ? new Date().toLocaleString("ja-JP") : "",
    });
  };

  // フィルター
  const today = new Date().toISOString().split("T")[0];
  const filtered = reservations.filter(r => {
    if (dateFilter) return r.date === dateFilter;
    if (filter === "today") return r.date === today;
    if (filter === "upcoming") return r.date >= today;
    if (filter === "past") return r.date < today;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const dateCmp = (a.date || "").localeCompare(b.date || "");
    if (dateCmp !== 0) return dateCmp;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  // 日付ごとにグループ化
  const grouped = {};
  sorted.forEach(r => {
    const d = r.date || "no_date";
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(r);
  });

  const upcomingCount = reservations.filter(r => r.date >= today).length;
  const todayCount = reservations.filter(r => r.date === today).length;
  const pastCount = reservations.filter(r => r.date < today).length;

  // ===== 編集画面 =====
  if (view === "edit") {
    // 選択日のイベント候補
    const candidateEvents = events.filter(e => e.date === form.date);
    return (
      <div style={{padding:"1.5rem 2rem",maxWidth:800,margin:"0 auto"}} className="hb-view">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>
            📞 {editingId ? "予約編集" : "新規予約"}
          </h2>
          <button style={S.btn("sm")} onClick={()=>setView("list")}>← 一覧</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
          <Field label="日付" required>
            <input type="date" style={S.inp} value={form.date} onChange={e=>{
              const newDate = e.target.value;
              setField("date", newDate);
              // 日付選択でイベント名を自動入力
              const evs = events.filter(ev => ev.date === newDate);
              if (evs.length === 1) {
                setField("eventName", evs[0].name);
              } else if (evs.length === 0) {
                setField("eventName", "");
              }
            }}/>
          </Field>
          <Field label="予約経路">
            <select style={S.inp} value={form.source} onChange={e=>{
              const newSource = e.target.value;
              setField("source", newSource);
              if (newSource === "phone") {
                setField("email", "");
                setField("sendEmail", false);
              }
            }}>
              {SOURCE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </Field>
          {form.source === "other" && (
            <Field label="経路詳細" full>
              <input style={S.inp} value={form.sourceDetail||""} onChange={e=>setField("sourceDetail",e.target.value)} placeholder="例：知人紹介 / Twitter DM など"/>
            </Field>
          )}
          <Field label="イベント名" full>
            {candidateEvents.length > 1 ? (
              <select style={S.inp} value={form.eventName} onChange={e=>setField("eventName",e.target.value)}>
                <option value="">-- イベントを選択 --</option>
                {candidateEvents.map(e=>(
                  <option key={e._id} value={e.name}>{e.name}{e.start?` (${e.start}〜)`:""}</option>
                ))}
              </select>
            ) : (
              <input style={S.inp} value={form.eventName} onChange={e=>setField("eventName",e.target.value)} placeholder={candidateEvents.length===0?"日付を選んでください or 手動入力":"イベント名"}/>
            )}
          </Field>
          <Field label="お名前" required>
            <input style={S.inp} value={form.customerName} onChange={e=>setField("customerName",e.target.value)} placeholder="例：山田太郎"/>
          </Field>
          <Field label="人数" required>
            <select style={S.inp} value={form.people} onChange={e=>setField("people",e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10,11,12,15,20].map(n=><option key={n} value={n}>{n}名</option>)}
            </select>
          </Field>
          <Field label="電話番号">
            <input style={S.inp} value={form.phone} onChange={e=>setField("phone",e.target.value)} placeholder="090-..."/>
          </Field>
          {form.source !== "phone" && (
            <Field label="メールアドレス">
              <input type="email" style={S.inp} value={form.email} onChange={e=>setField("email",e.target.value)} placeholder="@..."/>
            </Field>
          )}
          <Field label="受付担当者">
            <select style={S.inp} value={form.staff||""} onChange={e=>setField("staff",e.target.value)}>
              <option value="">未設定</option>
              {staffNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <Field label="席（手動入力 or レイアウトから選択）">
            <div style={{display:"flex",gap:".4rem"}}>
              <input style={{...S.inp,flex:1}} value={form.seatNumber||""} onChange={e=>setField("seatNumber",e.target.value)} placeholder="例：A1, B2-3, カウンター席"/>
              <button type="button" style={{...S.btn("ghost"),padding:".4rem .7rem",whiteSpace:"nowrap"}} onClick={()=>setShowSeatPicker(true)}>🪑 レイアウトから</button>
            </div>
          </Field>
          <Field label="備考（席希望など）" full>
            <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={3} value={form.note} onChange={e=>setField("note",e.target.value)} placeholder="席の希望・アレルギー対応など"/>
          </Field>
          <Field label="受付状況" full>
            <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".88rem",padding:".55rem 0",color:form.arrived?"#7ec87e":"rgba(240,232,208,0.55)"}}>
              <input type="checkbox" checked={!!form.arrived} onChange={e=>{
                setField("arrived",e.target.checked);
                if(e.target.checked) setField("arrivedAt",new Date().toLocaleString("ja-JP"));
                else setField("arrivedAt","");
              }} style={{accentColor:"#7ec87e",width:20,height:20}}/>
              {form.arrived?`✓ 来店済み（${form.arrivedAt}）`:"未来店"}
            </label>
          </Field>
          {!editingId && form.email && form.source !== "phone" && (
            <Field label="📧 メール通知" full>
              <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".82rem",padding:".4rem 0",color:form.sendEmail?"#7ec8e3":"rgba(240,232,208,0.55)"}}>
                <input type="checkbox" checked={!!form.sendEmail} onChange={e=>setField("sendEmail",e.target.checked)} style={{accentColor:"#7ec8e3",width:18,height:18}}/>
                保存時にお客様へ予約確認メールを送信する
              </label>
              <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.45)",marginLeft:"1.7rem"}}>
                チェックすると {form.email} へ確認メールが送られ、店舗にも通知が届きます。
              </div>
            </Field>
          )}
        </div>

        <div style={{display:"flex",gap:".5rem",marginTop:"1.5rem",flexWrap:"wrap"}}>
          <button style={{...S.btn("gold"),flex:1,maxWidth:200}} onClick={handleSave}>💾 保存</button>
          <button style={S.btn("ghost")} onClick={()=>setView("list")}>キャンセル</button>
          {editingId && (
            <button style={{...S.btn("danger"),marginLeft:"auto"}} onClick={async()=>{await handleDelete(editingId);setView("list");}}>🗑 削除</button>
          )}
        </div>

        {showSeatPicker && (
          <SeatPicker
            reservations={allReservations}
            currentDate={form.date}
            currentReservationId={editingId}
            currentSeats={form.seatNumber}
            onSelect={(seatNumber)=>setField("seatNumber", seatNumber)}
            onClose={()=>setShowSeatPicker(false)}
          />
        )}
      </div>
    );
  }

  // ===== 一覧画面 =====
  // カレンダー表示用：年月の日付一覧
  const calMonthDays = (() => {
    const { year, month } = calYearMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const firstDow = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const dateKey = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const dayRes = reservations.filter(r => r.date === dateKey);
      const dayEvents = events.filter(e => e.date === dateKey);
      cells.push({ date: dateKey, day: d, dow: (firstDow + d - 1) % 7, reservations: dayRes, events: dayEvents });
    }
    return cells;
  })();

  // 選択日の予約・イベント
  const dayReservations = reservations.filter(r => r.date === calSelectedDate)
    .sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
  const dayEvents = events.filter(e => e.date === calSelectedDate);
  const dayLayoutId = dayLayoutMap[calSelectedDate] || (getDefaultLayout(layouts)?._id || "");

  const prevMonth = () => {
    setCalYearMonth(p => p.month === 0 ? { year: p.year-1, month: 11 } : { year: p.year, month: p.month - 1 });
  };
  const nextMonth = () => {
    setCalYearMonth(p => p.month === 11 ? { year: p.year+1, month: 0 } : { year: p.year, month: p.month + 1 });
  };

  // 印刷
  const printSeatLayout = () => {
    const layout = layouts.find(l => l._id === dayLayoutId) || getDefaultLayout(layouts);
    if (!layout) { alert("レイアウトがありません"); return; }
    const seatStates = {};
    (layout.seats||[]).forEach(s => {
      const r = reservations.find(rr => {
        if (rr.date !== calSelectedDate || rr._deleted) return false;
        const seats = (rr.seatNumber||"").split(",").map(x=>x.trim()).filter(Boolean);
        return seats.includes(s.number);
      });
      seatStates[s.number] = r;
    });
    const eventLabel = dayEvents.map(e => e.name).join(" / ") || "";
    const dt = new Date(calSelectedDate + "T00:00:00");
    const dowJp = ["日","月","火","水","木","金","土"][dt.getDay()];
    const win = window.open("", "_blank");
    if (!win) { alert("ポップアップがブロックされました"); return; }
    const seatHtml = (layout.seats||[]).map(s => {
      const r = seatStates[s.number];
      const fillColor = r ? (r.arrived ? "#dbe9f4" : "#fde9d4") : "#ffffff";
      const borderColor = r ? (r.arrived ? "#5a8eae" : "#c47e3a") : "#888";
      const inner = r
        ? `<div style="font-size:9px;color:#666">${s.number}</div><div style="font-size:13px;font-weight:700;line-height:1.1">${r.customerName||""}</div><div style="font-size:9px">${r.people||""}名</div>`
        : `<div style="font-size:13px">${s.number}</div>`;
      return `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.width||50}px;height:${s.height||50}px;background:${fillColor};border:2px solid ${borderColor};border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#000;text-align:center;overflow:hidden">${inner}</div>`;
    }).join("");
    const bgImg = layout.bgImage ? `<img src="${layout.bgImage}" style="position:absolute;left:0;top:0;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;object-fit:contain"/>` : "";
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>席レイアウト ${calSelectedDate}</title><style>
      body{margin:0;padding:20px;font-family:'Hiragino Mincho ProN','游明朝',serif;background:#fff;color:#000}
      h1{font-size:20px;margin:0 0 4px 0}
      .meta{font-size:13px;color:#444;margin-bottom:14px}
      .canvas{position:relative;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;background:#f5f5f5;border:1px solid #888;margin:0 auto}
      .legend{margin-top:12px;font-size:12px;color:#444}
      .legend span{margin-right:14px}
      .legend i{display:inline-block;width:14px;height:14px;border:1px solid #555;border-radius:2px;vertical-align:middle;margin-right:4px}
      @media print{ body{padding:8px} .noprint{display:none} }
    </style></head><body>
      <h1>席レイアウト：${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dowJp}）</h1>
      <div class="meta">${eventLabel ? `イベント：${eventLabel} / `:""}レイアウト：${layout.name}</div>
      <div class="canvas">${bgImg}${seatHtml}</div>
      <div class="legend">
        <span><i style="background:#fff"></i>空席</span>
        <span><i style="background:#fde9d4"></i>予約あり</span>
        <span><i style="background:#dbe9f4"></i>来店済</span>
      </div>
      <div class="noprint" style="margin-top:16px;text-align:center"><button onclick="window.print()" style="padding:8px 24px">印刷</button></div>
    </body></html>`);
    win.document.close();
  };

  const printReservationList = () => {
    const eventLabel = dayEvents.map(e => e.name).join(" / ") || "";
    const dt = new Date(calSelectedDate + "T00:00:00");
    const dowJp = ["日","月","火","水","木","金","土"][dt.getDay()];
    const totalPeople = dayReservations.reduce((s,r)=>s+Number(r.people||0),0);
    const win = window.open("", "_blank");
    if (!win) { alert("ポップアップがブロックされました"); return; }
    const rows = dayReservations.map(r => `
      <tr>
        <td style="text-align:center;width:40px"><div style="display:inline-block;width:18px;height:18px;border:1.5px solid #555;border-radius:3px;background:${r.arrived?"#5a8eae":"#fff"};color:#fff;font-weight:700;line-height:18px;text-align:center;font-size:12px">${r.arrived?"✓":""}</div></td>
        <td>${r.customerName||""}</td>
        <td style="text-align:center">${r.people||""}名</td>
        <td>${r.phone||""}</td>
        <td>${sourceLabel(r.source)||""}</td>
        <td>${r.seatNumber||""}</td>
        <td style="font-size:11px">${(r.note||"").replace(/[<>]/g,"")}</td>
      </tr>`).join("");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>予約リスト ${calSelectedDate}</title><style>
      body{margin:0;padding:20px;font-family:'Hiragino Mincho ProN','游明朝',serif;background:#fff;color:#000}
      h1{font-size:20px;margin:0 0 4px 0}
      .meta{font-size:13px;color:#444;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #888;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#eee;font-weight:600;font-size:12px}
      @media print{ body{padding:8px} .noprint{display:none} }
    </style></head><body>
      <h1>予約リスト：${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dowJp}）</h1>
      <div class="meta">${eventLabel ? `イベント：${eventLabel} / `:""}${dayReservations.length}組 / 計${totalPeople}名 / 来店 ${dayReservations.filter(r=>r.arrived).length}/${dayReservations.length}</div>
      <table>
        <thead><tr><th>受付</th><th>お名前</th><th>人数</th><th>電話</th><th>経路</th><th>席</th><th>備考</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:#888;padding:20px">予約はありません</td></tr>'}</tbody>
      </table>
      <div class="noprint" style="margin-top:16px;text-align:center"><button onclick="window.print()" style="padding:8px 24px">印刷</button></div>
    </body></html>`);
    win.document.close();
  };

  return (
    <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:".5rem"}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>📞 予約管理</h2>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          {onGoSeatLayout && (
            <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={onGoSeatLayout}>🪑 席レイアウト</button>
          )}
          <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={()=>setShowTrash(true)}>🗑 ゴミ箱{trashReservations.length>0?` (${trashReservations.length})`:""}</button>
          <button style={S.btn("gold")} onClick={startNew}>＋ 電話予約を追加</button>
        </div>
      </div>

      {/* ビュー切替（カレンダー / リスト） */}
      <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
        <button onClick={()=>setView("calendar")} style={{padding:".4rem .9rem",borderRadius:3,border:"1px solid "+(view==="calendar"?"#c9a84c":"rgba(201,168,76,0.2)"),background:view==="calendar"?"#c9a84c":"transparent",color:view==="calendar"?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>📅 カレンダー</button>
        <button onClick={()=>setView("list")} style={{padding:".4rem .9rem",borderRadius:3,border:"1px solid "+(view==="list"?"#c9a84c":"rgba(201,168,76,0.2)"),background:view==="list"?"#c9a84c":"transparent",color:view==="list"?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>📋 リスト</button>
      </div>

      {/* カレンダービュー */}
      {view === "calendar" && (
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".5rem"}}>
            <button style={{...S.btn("sm"),padding:".3rem .65rem"}} onClick={prevMonth}>◀</button>
            <span style={{fontFamily:"Georgia,serif",fontSize:".95rem",color:"#c9a84c",letterSpacing:".1em"}}>
              {calYearMonth.year}年{calYearMonth.month+1}月
            </span>
            <button style={{...S.btn("sm"),padding:".3rem .65rem"}} onClick={nextMonth}>▶</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2,marginBottom:2}}>
            {["日","月","火","水","木","金","土"].map((d,i)=>(
              <div key={d} style={{textAlign:"center",fontSize:".62rem",padding:".25rem 0",color:i===0?"#e24b4a":i===6?"#7ec8e3":"rgba(240,232,208,0.4)"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:3,marginBottom:"1rem"}}>
            {calMonthDays.map((cell, idx) => {
              if (!cell) return <div key={"e"+idx}/>;
              const total = cell.reservations.reduce((s,r)=>s+Number(r.people||0),0);
              const arrived = cell.reservations.filter(r=>r.arrived).length;
              const hasEvent = cell.events.length > 0;
              const isSelected = cell.date === calSelectedDate;
              const isToday = cell.date === today;
              return (
                <button
                  key={cell.date}
                  onClick={()=>setCalSelectedDate(cell.date)}
                  style={{
                    minHeight: 70,
                    padding:".3rem .25rem",
                    background: isSelected ? "rgba(201,168,76,0.2)" : "#111",
                    border: isSelected ? "2px solid #c9a84c" : (isToday ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.04)"),
                    borderRadius: 4,
                    color: cell.dow===0 ? "#e24b4a" : cell.dow===6 ? "#7ec8e3" : "#f0e8d0",
                    cursor:"pointer",
                    fontFamily:"inherit",
                    textAlign:"left",
                    overflow:"hidden",
                    display:"flex",flexDirection:"column",
                  }}
                >
                  <div style={{fontSize:".72rem",fontWeight:isToday?700:500,marginBottom:"2px"}}>{cell.day}</div>
                  {hasEvent && (
                    <div style={{fontSize:".5rem",lineHeight:1.2,padding:"1px 3px",background:"rgba(201,168,76,0.13)",borderRadius:2,color:"#c9a84c",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",marginBottom:"2px"}}>
                      🎵 {cell.events[0].name}
                    </div>
                  )}
                  {cell.reservations.length > 0 && (
                    <div style={{fontSize:".55rem",color:"#f4a261",marginTop:"auto"}}>
                      📞 {cell.reservations.length}組 / {total}名
                      {arrived>0 && <span style={{color:"#7ec87e",marginLeft:"3px"}}>(✓{arrived})</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 選択した日の詳細 */}
          {calSelectedDate && (
            <div style={{marginTop:"1rem",padding:"1rem 1.1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.2)",borderRadius:6}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".5rem",marginBottom:".75rem",paddingBottom:".5rem",borderBottom:"1px solid rgba(201,168,76,0.13)"}}>
                <div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c"}}>
                    {fmtDate(calSelectedDate)}
                  </div>
                  {dayEvents.length > 0 && (
                    <div style={{fontSize:".75rem",color:"rgba(240,232,208,0.7)",marginTop:".15rem"}}>
                      🎵 {dayEvents.map(e=>e.name).join(" / ")}
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                  <button style={{...S.btn("ghost"),padding:".35rem .7rem",fontSize:".62rem"}} onClick={printSeatLayout}>🖨 席レイアウト印刷</button>
                  <button style={{...S.btn("ghost"),padding:".35rem .7rem",fontSize:".62rem"}} onClick={printReservationList}>🖨 予約リスト印刷</button>
                </div>
              </div>

              {/* 席レイアウト */}
              <div style={{marginBottom:"1rem"}}>
                <DayLayoutView
                  reservations={reservations}
                  dateKey={calSelectedDate}
                  layouts={layouts}
                  selectedLayoutId={dayLayoutId}
                  onLayoutChange={(id)=>setDayLayout(calSelectedDate, id)}
                />
              </div>

              {/* 予約リスト */}
              <div style={{marginBottom:".5rem",fontSize:".7rem",color:"rgba(201,168,76,0.7)",letterSpacing:".15em"}}>
                📞 予約リスト（{dayReservations.length}組 / 計{dayReservations.reduce((s,r)=>s+Number(r.people||0),0)}名 / 来店 {dayReservations.filter(r=>r.arrived).length}/{dayReservations.length}）
              </div>
              {dayReservations.length === 0 ? (
                <div style={{textAlign:"center",padding:"1.5rem",color:"rgba(240,232,208,0.4)",fontSize:".82rem",background:"#111",borderRadius:5}}>この日の予約はありません</div>
              ) : dayReservations.map(r => (
                <div key={r._id} style={{...S.card,padding:".7rem .9rem",marginBottom:".4rem",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:".6rem",alignItems:"center",borderLeft:r.arrived?"3px solid #7ec87e":"3px solid rgba(244,162,97,0.3)"}}>
                  <button onClick={()=>toggleArrived(r._id)} style={{
                    padding:".35rem .55rem",
                    background:r.arrived?"rgba(126,200,127,0.13)":"transparent",
                    border:`1px solid ${r.arrived?"#7ec87e":"rgba(244,162,97,0.4)"}`,
                    borderRadius:4,
                    color:r.arrived?"#7ec87e":"#f4a261",
                    cursor:"pointer",fontSize:".68rem",fontFamily:"inherit",
                    minWidth:60,
                  }}>
                    {r.arrived?"✓ 来店済":"未来店"}
                  </button>
                  <div onClick={()=>startEdit(r)} style={{cursor:"pointer",minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".15rem",flexWrap:"wrap"}}>
                      <span style={{fontSize:".7rem"}}>{sourceIcon(r.source)}</span>
                      <span style={{fontFamily:"Georgia,serif",fontSize:".92rem"}}>{r.customerName||"（無名）"}</span>
                      <span style={{padding:".1rem .4rem",background:"rgba(201,168,76,0.13)",borderRadius:2,fontSize:".62rem",color:"#c9a84c"}}>{r.people}名</span>
                      {r.seatNumber && <span style={{padding:".1rem .4rem",background:"rgba(126,200,227,0.13)",borderRadius:2,fontSize:".62rem",color:"#7ec8e3"}}>🪑 {r.seatNumber}</span>}
                    </div>
                    <div style={{fontSize:".66rem",color:"rgba(240,232,208,0.55)",display:"flex",gap:".7rem",flexWrap:"wrap"}}>
                      {r.phone && <span>📞 {r.phone}</span>}
                      {r.note && <span style={{color:"#f4a261"}}>📝 {r.note}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".25rem",flexDirection:"column"}}>
                    <button style={{...S.btn("sm"),padding:".25rem .5rem",fontSize:".55rem"}} onClick={()=>startEdit(r)}>編集</button>
                    <button style={{...S.btn("danger"),padding:".25rem .5rem",fontSize:".55rem"}} onClick={()=>handleDelete(r._id)}>削除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* リストビュー */}
      {view === "list" && (
        <>
      {/* フィルター */}
      <div style={{display:"flex",gap:".4rem",marginBottom:".75rem",flexWrap:"wrap",alignItems:"center"}}>
        {[
          {k:"today",l:`今日（${todayCount}）`},
          {k:"upcoming",l:`今後（${upcomingCount}）`},
          {k:"past",l:`過去（${pastCount}）`},
          {k:"all",l:`すべて（${reservations.length}）`},
        ].map(f=>(
          <button key={f.k} onClick={()=>{setFilter(f.k);setDateFilter("");}} style={{padding:".35rem .8rem",borderRadius:3,border:"1px solid "+(filter===f.k&&!dateFilter?"#c9a84c":"rgba(201,168,76,0.2)"),background:filter===f.k&&!dateFilter?"#c9a84c":"transparent",color:filter===f.k&&!dateFilter?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".68rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{f.l}</button>
        ))}
        <span style={{marginLeft:".5rem",fontSize:".62rem",color:"rgba(240,232,208,0.5)"}}>📅 日付指定:</span>
        <input type="date" style={{...S.inp,maxWidth:160,padding:".35rem .55rem",fontSize:".75rem"}} value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/>
        {dateFilter && <button style={{...S.btn("sm"),padding:".25rem .55rem",fontSize:".55rem"}} onClick={()=>setDateFilter("")}>✕</button>}
      </div>

      {sorted.length === 0 ? (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem"}}>
          📞 該当する予約はありません
        </div>
      ) : Object.keys(grouped).sort().map(date => {
        const dayReservations = grouped[date];
        const totalPeople = dayReservations.reduce((s,r)=>s+Number(r.people||0),0);
        const arrivedCount = dayReservations.filter(r=>r.arrived).length;
        return (
          <div key={date} style={{marginBottom:"1.25rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:".5rem",padding:".5rem 0",borderBottom:"1px solid rgba(201,168,76,0.15)"}}>
              <span style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c"}}>
                {fmtDate(date)}
              </span>
              <span style={{fontSize:".68rem",color:"rgba(240,232,208,0.55)"}}>
                {dayReservations.length}組 / 計{totalPeople}名 / 来店 {arrivedCount}/{dayReservations.length}
              </span>
            </div>
            {dayReservations.map(r => {
              return (
                <div key={r._id} style={{...S.card,padding:".75rem 1rem",display:"grid",gridTemplateColumns:"auto 1fr auto",gap:".75rem",alignItems:"center",borderLeft:r.arrived?"3px solid #7ec87e":"3px solid rgba(244,162,97,0.3)"}}>
                  <button onClick={()=>toggleArrived(r._id)} style={{
                    padding:".4rem .55rem",
                    background:r.arrived?"rgba(126,200,127,0.13)":"transparent",
                    border:`1px solid ${r.arrived?"#7ec87e":"rgba(244,162,97,0.4)"}`,
                    borderRadius:4,
                    color:r.arrived?"#7ec87e":"#f4a261",
                    cursor:"pointer",fontSize:".7rem",fontFamily:"inherit",
                    minWidth:60,
                  }}>
                    {r.arrived?"✓ 来店済":"未来店"}
                  </button>
                  <div onClick={()=>startEdit(r)} style={{cursor:"pointer",minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:".5rem",marginBottom:".2rem",flexWrap:"wrap"}}>
                      <span style={{fontSize:".7rem"}}>{sourceIcon(r.source)}</span>
                      <span style={{fontFamily:"Georgia,serif",fontSize:".95rem"}}>{r.customerName||"（無名）"}</span>
                      <span style={{padding:".1rem .4rem",background:"rgba(201,168,76,0.13)",borderRadius:2,fontSize:".62rem",color:"#c9a84c"}}>{r.people}名</span>
                      {r.seatNumber && <span style={{padding:".1rem .4rem",background:"rgba(126,200,227,0.13)",borderRadius:2,fontSize:".62rem",color:"#7ec8e3"}}>🪑 {r.seatNumber}</span>}
                      {r.staff && <span style={{padding:".1rem .4rem",background:"rgba(201,168,76,0.08)",borderRadius:2,fontSize:".58rem",color:"rgba(201,168,76,0.7)"}}>担当:{r.staff}</span>}
                    </div>
                    <div style={{fontSize:".68rem",color:"rgba(240,232,208,0.55)",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                      {r.eventName && <span>🎵 {r.eventName}</span>}
                      {r.phone && <span>📞 {r.phone}</span>}
                      {r.note && <span style={{color:"#f4a261"}}>📝 {r.note.length>30?r.note.slice(0,30)+"...":r.note}</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".3rem"}}>
                    <button style={S.btn("sm")} onClick={()=>startEdit(r)}>編集</button>
                    <button style={S.btn("danger")} onClick={()=>handleDelete(r._id)}>削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
        </>
      )}

      {/* お客様用フォームURL（一番下） */}
      <div style={{padding:".75rem 1rem",background:"rgba(201,168,76,0.05)",border:"1px solid rgba(201,168,76,0.15)",borderRadius:5,marginTop:"1.5rem",fontSize:".75rem",color:"rgba(240,232,208,0.7)",lineHeight:1.6}}>
        <div style={{color:"#c9a84c",marginBottom:".25rem",fontSize:".68rem",letterSpacing:".1em"}}>📝 お客様用予約フォーム：</div>
        <div style={{display:"flex",gap:".5rem",alignItems:"center",flexWrap:"wrap"}}>
          <code style={{background:"#0a0a0a",padding:".25rem .5rem",borderRadius:3,fontSize:".72rem"}}>{window.location.origin}/?reserve=1</code>
          <button style={{...S.btn("sm"),padding:".25rem .55rem",fontSize:".58rem"}} onClick={()=>{
            navigator.clipboard.writeText(window.location.origin + "/?reserve=1");
            alert("URLをコピーしました");
          }}>コピー</button>
        </div>
      </div>

      {/* ゴミ箱モーダル */}
      {showTrash && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setShowTrash(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:600,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em"}}>🗑 予約のゴミ箱</div>
              <button style={S.btn("sm")} onClick={()=>setShowTrash(false)}>閉じる</button>
            </div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",marginBottom:"1rem"}}>削除された予約は30日間保持されます。</div>
            {trashReservations.length === 0 ? (
              <div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem"}}>ゴミ箱は空です</div>
            ) : trashReservations.sort((a,b)=>(b._deletedAt||0)-(a._deletedAt||0)).map(r=>{
              const daysLeft = r._deletedAt ? Math.max(0,Math.ceil(30 - (Date.now()-r._deletedAt)/(24*60*60*1000))) : 30;
              return (
                <div key={r._id} style={{padding:".75rem 1rem",background:"#111",borderRadius:5,marginBottom:".5rem",display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:".88rem",marginBottom:".2rem"}}>{r.customerName||"（無名）"} {r.people}名</div>
                    <div style={{fontSize:".65rem",color:"rgba(240,232,208,0.4)"}}>
                      {r.date} / あと{daysLeft}日
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".4rem"}}>
                    <button style={{...S.btn("sm"),borderColor:"rgba(126,200,127,0.4)",color:"#7ec87e"}} onClick={()=>restoreReservation(r._id)}>↩ 復元</button>
                    <button style={S.btn("danger")} onClick={()=>purgeReservation(r._id)}>完全削除</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== お客様用予約フォーム =====
export function CustomerReservationForm({ events = [] }) {
  const [form, setForm] = useState({
    date: "",
    eventName: "",
    customerName: "",
    people: 1,
    phone: "",
    email: "",
    note: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 今日以降のイベントを日付別にグループ化（貸切除外）
  const today = new Date().toISOString().split("T")[0];
  const upcomingEvents = events.filter(e => e.date && e.date >= today && !/貸切|貸し切り/.test(e.name||""));
  const eventsByDate = {};
  upcomingEvents.forEach(e => {
    if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
    eventsByDate[e.date].push(e);
  });
  const sortedDates = Object.keys(eventsByDate).sort();

  const setField = (k,v) => setForm(f => ({...f, [k]: v}));

  // 日付選択時：イベント名を自動入力
  const handleDateChange = (newDate) => {
    setField("date", newDate);
    const evs = eventsByDate[newDate] || [];
    if (evs.length === 1) {
      setField("eventName", evs[0].name);
    } else if (evs.length > 1) {
      // 複数あったら最初のイベントを自動選択（後で変更可能）
      setField("eventName", evs[0].name);
    } else {
      setField("eventName", "");
    }
  };

  // 選択中のイベント情報を取得
  const selectedEvent = (() => {
    if (!form.date || !form.eventName) return null;
    const evs = eventsByDate[form.date] || [];
    return evs.find(e => e.name === form.eventName);
  })();

  const submit = async () => {
    if (!form.date) { setError("日付を選択してください"); return; }
    if (!form.eventName) { setError("イベントを選択してください"); return; }
    if (!form.customerName) { setError("お名前を入力してください"); return; }
    if (!form.people) { setError("人数を入力してください"); return; }
    if (!form.phone) { setError("電話番号を入力してください"); return; }
    if (!form.email) { setError("メールアドレスを入力してください"); return; }
    setError("");
    setSubmitting(true);
    try {
      const id = `res_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
      const reservationData = {
        ...form,
        people: Number(form.people),
        source: "form",
        sourceDetail: "",
        staff: "",
        arrived: false,
        arrivedAt: "",
        seatNumber: "",
        savedAt: new Date().toLocaleString("ja-JP"),
        createdAt: Date.now(),
      };
      await setDoc(doc(db, "reservations", id), reservationData);
      // メール通知（失敗してもDB保存は完了済みなので予約自体は成立）
      try {
        await sendReservationEmails(reservationData);
      } catch (emailErr) {
        console.error("メール通知エラー:", emailErr);
      }
      setSubmitted(true);
    } catch (e) {
      setError("送信失敗：" + e.message);
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div style={{minHeight:"100vh",background:"#0a0a0a",color:"#f0e8d0",fontFamily:"'Hiragino Mincho ProN','Yu Mincho','游明朝',serif",padding:"2rem 1rem",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <div style={{maxWidth:500,width:"100%",textAlign:"center",padding:"2rem"}}>
          <img
            src="/honeybee_logo.png"
            alt="HONEY BEE"
            style={{maxWidth:140,height:"auto",margin:"0 auto",display:"block",marginBottom:"1rem"}}
            onError={(e)=>{e.target.style.display="none";}}
          />
          <div style={{fontSize:"1rem",color:"#7ec87e",marginBottom:"1.5rem",lineHeight:1.7,marginTop:"1rem"}}>
            ✓ 予約を承りました<br/>
            <span style={{fontSize:".82rem",color:"rgba(240,232,208,0.7)"}}>ご予約ありがとうございます。当日お会いできることを楽しみにしております。</span>
          </div>
          <div style={{padding:"1rem",background:"#111",borderRadius:6,fontSize:".78rem",color:"rgba(240,232,208,0.7)",lineHeight:1.7,marginBottom:"1rem"}}>
            日付：{fmtDate(form.date)}<br/>
            イベント：{form.eventName}<br/>
            お名前：{form.customerName} 様<br/>
            人数：{form.people}名
          </div>
          <button style={{padding:".7rem 1.5rem",background:"transparent",color:"#c9a84c",border:"1px solid rgba(201,168,76,0.27)",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:".75rem",letterSpacing:".1em"}} onClick={()=>{setSubmitted(false);setForm({date:"",eventName:"",customerName:"",people:1,phone:"",email:"",note:""});}}>
            続けて予約する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0a0a",color:"#f0e8d0",fontFamily:"'Hiragino Mincho ProN','Yu Mincho','游明朝',serif",padding:"2rem 1rem"}}>
      <div style={{maxWidth:600,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <img
            src="/honeybee_logo.png"
            alt="HONEY BEE"
            style={{maxWidth:160,height:"auto",margin:"0 auto",display:"block",marginBottom:".5rem"}}
            onError={(e)=>{e.target.style.display="none";}}
          />
          <div style={{fontFamily:"Georgia, 'Times New Roman', serif",fontSize:".8rem",color:"rgba(201,168,76,0.7)",letterSpacing:".4em",marginTop:".5rem",fontWeight:300}}>RESERVATION</div>
        </div>

        <div style={{padding:"1.5rem",background:"#111",borderRadius:8,border:"1px solid rgba(201,168,76,0.15)"}}>
          {/* 日付選択 */}
          <Field label="日付" required>
            <select style={S.inp} value={form.date} onChange={e=>handleDateChange(e.target.value)}>
              <option value="">-- 日付を選択 --</option>
              {sortedDates.map(d=>(
                <option key={d} value={d}>{fmtDate(d)}</option>
              ))}
            </select>
            {sortedDates.length === 0 && (
              <div style={{fontSize:".7rem",color:"#f4a261",marginTop:".3rem"}}>現在受付中のイベントはありません</div>
            )}
          </Field>

          {/* イベント表示（自動入力、複数あれば選択） */}
          {form.date && eventsByDate[form.date] && (
            eventsByDate[form.date].length === 1 ? (
              <Field label="イベント">
                <div style={{padding:".7rem .75rem",background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.14)",borderRadius:4,fontSize:".88rem",color:"#c9a84c"}}>
                  🎵 {form.eventName}
                  {eventsByDate[form.date][0].start && (
                    <span style={{color:"rgba(240,232,208,0.55)",fontSize:".75rem",marginLeft:".5rem"}}>
                      {eventsByDate[form.date][0].open && `開場 ${eventsByDate[form.date][0].open}`}
                      {eventsByDate[form.date][0].start && ` / 開演 ${eventsByDate[form.date][0].start}`}
                    </span>
                  )}
                </div>
              </Field>
            ) : (
              <Field label="イベント" required>
                <select style={S.inp} value={form.eventName} onChange={e=>setField("eventName",e.target.value)}>
                  {eventsByDate[form.date].map((e,i)=>(
                    <option key={i} value={e.name}>{e.name}{e.start?` (${e.start}〜)`:""}</option>
                  ))}
                </select>
              </Field>
            )
          )}

          {/* イベント別の注意事項 */}
          {selectedEvent && (selectedEvent.seatable === false || selectedEvent.reserveNotes) && (
            <div style={{padding:".75rem 1rem",background:"rgba(244,162,97,0.08)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:5,marginBottom:".75rem",fontSize:".78rem",color:"#f4a261",lineHeight:1.6}}>
              {selectedEvent.seatable === false && (
                <div style={{marginBottom: selectedEvent.reserveNotes ? ".4rem" : 0}}>
                  ⚠️ <strong>このイベントは席指定をお受けできません。お席は先着順となります。</strong>
                </div>
              )}
              {selectedEvent.reserveNotes && (
                <div style={{whiteSpace:"pre-wrap"}}>
                  📌 {selectedEvent.reserveNotes}
                </div>
              )}
            </div>
          )}

          <Field label="お名前" required>
            <input style={S.inp} value={form.customerName} onChange={e=>setField("customerName",e.target.value)} placeholder="例：山田太郎"/>
          </Field>

          <Field label="人数" required>
            <select style={S.inp} value={form.people} onChange={e=>setField("people",e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}名</option>)}
            </select>
          </Field>

          <Field label="電話番号" required>
            <input type="tel" style={S.inp} value={form.phone} onChange={e=>setField("phone",e.target.value)} placeholder="090-1234-5678"/>
          </Field>

          <Field label="メールアドレス" required>
            <input type="email" style={S.inp} value={form.email} onChange={e=>setField("email",e.target.value)} placeholder="example@example.com"/>
          </Field>

          <Field label="備考" full>
            <textarea
              style={{...S.inp,resize:"vertical",lineHeight:1.5}}
              rows={3}
              value={form.note}
              onChange={e=>setField("note",e.target.value)}
              placeholder={selectedEvent && selectedEvent.seatable === false ? "ご要望があればこちらにご記入ください" : "席の希望がある場合は備考欄にご記入ください"}
            />
            <div style={{fontSize:".65rem",color:"rgba(240,232,208,0.5)",marginTop:".3rem",lineHeight:1.6}}>
              {selectedEvent && selectedEvent.seatable === false ? (
                <>※ このイベントはお席を先着順とさせていただきます。席のご指定はお受けできませんのでご了承ください。</>
              ) : (
                <>席の希望がある場合は備考欄にご記入ください。ご希望に沿えない場合は店舗よりご連絡いたします。</>
              )}
            </div>
          </Field>

          {error && (
            <div style={{padding:".7rem",background:"rgba(226,75,74,0.13)",border:"1px solid rgba(226,75,74,0.3)",borderRadius:4,fontSize:".78rem",color:"#ff6b6a",marginBottom:".75rem"}}>
              ⚠️ {error}
            </div>
          )}

          <button
            disabled={submitting}
            onClick={submit}
            style={{
              width:"100%",padding:"1rem",
              background:submitting?"rgba(201,168,76,0.4)":"#c9a84c",
              color:"#0a0a0a",
              border:"none",borderRadius:4,
              fontFamily:"Georgia,serif",fontSize:".95rem",letterSpacing:".15em",
              cursor:submitting?"wait":"pointer",
              marginTop:".5rem",
            }}
          >
            {submitting ? "送信中..." : "予約する"}
          </button>
        </div>

        {/* 共通の注意事項 */}
        <div style={{marginTop:"1.25rem",padding:"1rem 1.1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,fontSize:".72rem",color:"rgba(240,232,208,0.7)",lineHeight:1.9}}>
          <div style={{fontSize:".68rem",letterSpacing:".15em",color:"#c9a84c",marginBottom:".5rem"}}>📌 ご予約に際してのご案内</div>
          <div>● イベント時はご飲食代に別途、Music Chargeがかかります</div>
          <div>● お一人様につき1フード・1ドリンクのオーダーをお願いしております</div>
          <div>● OPEN・STARTの時間につきましては都合により変更になる場合がございます</div>
          <div>● ご予約のキャンセルは必ず前日までにご連絡ください。</div>
          <div style={{paddingLeft:"1em",marginTop:".15rem"}}>当日キャンセルや無断キャンセルの場合は、今後のご予約をお断りするほか、状況によりキャンセル料を頂戴する場合がございます。</div>
        </div>

        {/* 個人情報の取り扱いについて */}
        <div style={{marginTop:"1rem",padding:"1rem 1.1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,fontSize:".7rem",color:"rgba(240,232,208,0.65)",lineHeight:1.8}}>
          <div style={{fontSize:".68rem",letterSpacing:".15em",color:"#c9a84c",marginBottom:".5rem"}}>🔒 個人情報の取り扱いについて</div>
          <div>
            ご記入いただいた個人情報は、ご予約管理および店舗からのご連絡にのみ使用いたします。
            その他の目的では使用せず、第三者へ提供することは一切ございません。
            お客様の個人情報の取扱いには細心の注意を払い、適切に管理いたします。
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:"2rem",fontSize:".7rem",color:"rgba(240,232,208,0.4)",letterSpacing:".05em",lineHeight:1.7}}>
          神奈川県鎌倉市大船1-22-19 第2三友ビル3F<br/>
          TEL：0467-46-5576
        </div>
      </div>
    </div>
  );
}

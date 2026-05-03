import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { getOrderedStaffNames } from "./shift";
import { sendReservationEmails } from "./email";
import { SeatPicker, DayLayoutView, getDefaultLayout, sortLayouts } from "./seatLayout";

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

export default function ReservationModule({ events = [], shifts = [], navigateBack, onGoSeatLayout, initialDate }) {
  const [reservations, setReservations] = useState([]);
  // メインビュー: list（一覧）/ calendar（カレンダー＆日付詳細）/ edit（編集）
  const [view, setView] = useState("calendar");
  // 編集→保存後に戻るべきビュー（"calendar" or "list"）
  const [returnView, setReturnView] = useState("calendar");
  const [form, setForm] = useState(emptyReservation);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("upcoming");
  const [dateFilter, setDateFilter] = useState("");
  const [showTrash, setShowTrash] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [allReservations, setAllReservations] = useState([]);
  const [layouts, setLayouts] = useState([]);
  const [dayLayoutMap, setDayLayoutMap] = useState({}); // dateKey -> layoutId
  const [dayBlockedMap, setDayBlockedMap] = useState({}); // dateKey -> [seatNumber, ...]
  // カレンダーで選択中の日付（詳細表示用）— ローカルタイムゾーンで今日を取得
  const todayLocal = (() => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  })();
  const [calSelectedDate, setCalSelectedDate] = useState(initialDate || todayLocal);
  // カレンダーの月（年月）— initialDate があればその月を表示
  const [calYearMonth, setCalYearMonth] = useState(() => {
    const d = initialDate ? new Date(initialDate + "T00:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // シフトデータからスタッフ名を抽出（CSV順、社長は最後）
  const staffNames = getOrderedStaffNames(shifts);
  // 席選択ポップアップ
  const [showSeatPicker, setShowSeatPicker] = useState(false);
  // 紐付きチェックモーダル
  const [showLinkCheck, setShowLinkCheck] = useState(false);
  const [linkCheckResult, setLinkCheckResult] = useState(null);

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
      setLayouts(sortLayouts(list));
    });
    const unsubD = onSnapshot(collection(db, "daily"), (snap) => {
      const map = {};
      const blockedMap = {};
      snap.forEach(d => {
        const data = d.data();
        // dateKey フィールドがあればそれを使う（"2026-06-13::イベント名" 形式に対応）
        // 無ければドキュメントIDをそのまま使う（後方互換）
        const key = data.dateKey || d.id;
        if (data.layoutId) map[key] = data.layoutId;
        if (Array.isArray(data.blockedSeats)) blockedMap[key] = data.blockedSeats;
      });
      setDayLayoutMap(map);
      setDayBlockedMap(blockedMap);
    });
    return () => { unsub(); unsubL(); unsubD(); };
  }, []);

  // 一日（または一日×イベント）のレイアウトを変更
  // dateKey: "2026-06-13" or "2026-06-13::イベント名"
  // ストレージは "::" を含むIDをそのままドキュメントIDに使えないので、別形式で保存
  const dailyDocId = (dateKey) => dateKey.replace(/::/g, "__EV__");
  const setDayLayout = async (dateKey, layoutId) => {
    setDayLayoutMap(m => ({ ...m, [dateKey]: layoutId }));
    try {
      await setDoc(doc(db, "daily", dailyDocId(dateKey)), {
        layoutId,
        dateKey,
        savedAt: new Date().toLocaleString("ja-JP"),
      }, { merge: true });
    } catch (e) {
      console.error("レイアウト保存失敗:", e);
    }
  };

  // 一日（または一日×イベント）の使用不可席を保存（タップで切り替え）
  const toggleDayBlockedSeat = async (dateKey, seatNumber) => {
    const current = dayBlockedMap[dateKey] || [];
    const next = current.includes(seatNumber)
      ? current.filter(s => s !== seatNumber)
      : [...current, seatNumber];
    setDayBlockedMap(m => ({ ...m, [dateKey]: next }));
    try {
      await setDoc(doc(db, "daily", dailyDocId(dateKey)), {
        blockedSeats: next,
        dateKey,
        savedAt: new Date().toLocaleString("ja-JP"),
      }, { merge: true });
    } catch (e) {
      console.error("使用不可席保存失敗:", e);
    }
  };

  // initialDate（本日の営業から飛んできた時）はカレンダー表示でその日付を選択
  useEffect(() => {
    if (initialDate) {
      setCalSelectedDate(initialDate);
      const d = new Date(initialDate + "T00:00:00");
      setCalYearMonth({ year: d.getFullYear(), month: d.getMonth() });
      setView("calendar");
    }
  }, [initialDate]);

  const trashReservations = allReservations.filter(r => r._deleted);

  // ===== CSVインポート（Googleフォーム書き出し対応） =====
  // CSVの1行を簡易的にパース（クォート対応）
  const parseCSVLine = (line) => {
    const cells = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; }
          else inQuote = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === ',') { cells.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  };

  // 日付を「2026/02/01」「2026-02-01」「2026年2月1日」など色々な形式から「2026-02-01」に変換
  const normalizeDate = (raw) => {
    if (!raw) return "";
    const s = String(raw).trim();
    // 2026/02/01 / 2026-02-01 / 2026.02.01
    let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) {
      const yy = m[1];
      const mm = String(m[2]).padStart(2, "0");
      const dd = String(m[3]).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }
    // 2026年2月1日
    m = s.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
    if (m) {
      const yy = m[1];
      const mm = String(m[2]).padStart(2, "0");
      const dd = String(m[3]).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    }
    return s;
  };

  // 電話番号の正規化（先頭の0が消えていることがあるので補完）
  const normalizePhone = (raw) => {
    if (!raw) return "";
    let s = String(raw).trim().replace(/[^\d\-+]/g, "");
    // 9～10桁で始まりが0以外なら先頭に0を付ける（CSVの数値変換で0が落ちたケース）
    if (/^\d{9,10}$/.test(s) && !s.startsWith("0")) s = "0" + s;
    return s;
  };

  // CSVファイルを読み込んで予約として一括追加
  const handleImportCSV = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      // BOM除去
      const clean = text.replace(/^\uFEFF/, "");
      const lines = clean.split(/\r?\n/).filter(l => l.length > 0);
      if (lines.length < 2) {
        setImportResult({ ok: 0, errors: ["データ行がありません"] });
        setImporting(false);
        return;
      }
      const header = parseCSVLine(lines[0]);
      // Googleフォームの想定列を見つける（柔軟マッチ）
      const findCol = (...keywords) => {
        for (let i = 0; i < header.length; i++) {
          const h = header[i];
          if (keywords.some(k => h.includes(k))) return i;
        }
        return -1;
      };
      const idxEvent = findCol("イベント", "ライブ", "アーティスト");
      const idxDate = findCol("日付", "日時");
      const idxName = findCol("お名前", "氏名", "名前");
      const idxPeople = findCol("人数", "枚数");
      const idxPhone = findCol("電話");
      const idxEmail = findCol("メール", "Email", "email");
      const idxNote = findCol("備考", "コメント", "メッセージ");
      const idxTimestamp = findCol("タイムスタンプ", "送信", "受付日時");

      if (idxName < 0 || idxDate < 0) {
        setImportResult({ ok: 0, errors: ["「お名前」または「日付」の列が見つかりません。CSVの1行目（見出し）を確認してください。"] });
        setImporting(false);
        return;
      }

      let okCount = 0;
      const errors = [];
      for (let r = 1; r < lines.length; r++) {
        const cells = parseCSVLine(lines[r]);
        const customerName = (cells[idxName] || "").trim();
        const date = normalizeDate(cells[idxDate] || "");
        if (!customerName || !date) {
          errors.push(`${r+1}行目：名前または日付がありません（スキップ）`);
          continue;
        }
        const peopleRaw = idxPeople >= 0 ? (cells[idxPeople] || "").trim() : "1";
        const peopleNum = parseInt(peopleRaw.replace(/[^\d]/g, ""), 10);
        const reservationData = {
          eventName: idxEvent >= 0 ? (cells[idxEvent] || "").trim() : "",
          date,
          customerName,
          people: peopleNum > 0 ? peopleNum : 1,
          phone: idxPhone >= 0 ? normalizePhone(cells[idxPhone] || "") : "",
          email: idxEmail >= 0 ? (cells[idxEmail] || "").trim() : "",
          note: idxNote >= 0 ? (cells[idxNote] || "").trim() : "",
          source: "form",
          sourceDetail: "Googleフォーム（CSVインポート）",
          staff: "",
          arrived: false,
          arrivedAt: "",
          seatNumber: "",
          createdAt: Date.now() + r, // 重複しないように +r
          savedAt: new Date().toLocaleString("ja-JP"),
          importedAt: new Date().toLocaleString("ja-JP"),
        };
        // タイムスタンプ列があれば createdAt に反映
        if (idxTimestamp >= 0 && cells[idxTimestamp]) {
          const ts = new Date(cells[idxTimestamp]);
          if (!isNaN(ts.getTime())) reservationData.createdAt = ts.getTime();
        }
        try {
          const id = `res_imp_${Date.now().toString(36)}_${r}`;
          await setDoc(doc(db, "reservations", id), reservationData);
          okCount++;
        } catch (e) {
          errors.push(`${r+1}行目：保存失敗（${e.message || e}）`);
        }
      }
      setImportResult({ ok: okCount, errors });
    } catch (e) {
      console.error("CSVインポートエラー:", e);
      setImportResult({ ok: 0, errors: [`読み込み失敗：${e.message || e}`] });
    } finally {
      setImporting(false);
    }
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const startNew = () => {
    setForm({ ...emptyReservation, source: "phone", date: dateFilter || calSelectedDate || todayLocal });
    setEditingId(null);
    // 「電話予約を追加」ボタンは現在のビューから押されるので、それを覚える
    setReturnView(view);
    setView("edit");
  };

  const startEdit = (r) => {
    setForm({ ...emptyReservation, ...r });
    setEditingId(r._id);
    // どのビューから編集に入ったかを覚える
    setReturnView(view);
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
      setView(returnView || "calendar");
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
  const today = todayLocal;
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
          <button style={S.btn("sm")} onClick={()=>setView(returnView || "calendar")}>← 戻る</button>
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
              <>
                <div style={{padding:".4rem .65rem",background:"rgba(244,162,97,0.1)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:4,fontSize:".68rem",color:"#f4a261",marginBottom:".4rem"}}>
                  ⚠️ この日は複数のイベントがあります。お客様が予約したイベントを選んでください。
                </div>
                <select style={S.inp} value={form.eventName} onChange={e=>setField("eventName",e.target.value)}>
                  <option value="">-- イベントを選択 --</option>
                  {candidateEvents.map(e=>(
                    <option key={e._id} value={e.name}>{e.name}{e.start?` (${e.start}〜)`:""}</option>
                  ))}
                </select>
              </>
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
          <button style={S.btn("ghost")} onClick={()=>setView(returnView || "calendar")}>キャンセル</button>
          {editingId && (
            <button style={{...S.btn("danger"),marginLeft:"auto"}} onClick={async()=>{await handleDelete(editingId);setView(returnView || "calendar");}}>🗑 削除</button>
          )}
        </div>

        {showSeatPicker && (
          <SeatPicker
            reservations={allReservations}
            currentDate={form.date}
            currentReservationId={editingId}
            currentSeats={form.seatNumber}
            blockedSeats={dayBlockedMap[form.date] || []}
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
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 600;
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
      const isBlocked = (dayBlockedMap[calSelectedDate] || []).includes(s.number);
      const fillColor = isBlocked ? "#dadada" : (r ? (r.arrived ? "#dbe9f4" : "#fde9d4") : "#ffffff");
      const borderColor = isBlocked ? "#888" : (r ? (r.arrived ? "#5a8eae" : "#c47e3a") : "#888");
      const seatW = s.width || 50;
      const seatH = s.height || 50;
      // 名前の長さ・席幅から自動でフォントサイズを決定
      const nameLen = (r?.customerName || "").length;
      const usableW = Math.max(20, seatW - 4);
      let nameFs = Math.max(8, Math.min(14, Math.floor(usableW / Math.max(nameLen, 2))));
      const allowWrap = nameLen >= 5 && seatW <= 60;
      const peopleFs = Math.max(8, Math.min(11, Math.floor(seatW / 5)));
      const inner = isBlocked
        ? `<div style="font-size:11px;color:#666">使用不可</div>`
        : (r
            ? `<div style="font-size:${nameFs}px;font-weight:700;line-height:1.05;${allowWrap?'white-space:normal;word-break:break-all;':'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'}max-width:98%;max-height:${seatH*0.65}px">${r.customerName||""}</div><div style="font-size:${peopleFs}px;margin-top:1px">${r.people||""}名</div>`
            : `<div style="font-size:13px">${s.number}</div>`);
      return `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${seatW}px;height:${seatH}px;background:${fillColor};border:2px solid ${borderColor};border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#000;text-align:center;overflow:hidden;padding:0 1px;box-sizing:border-box">${inner}</div>`;
    }).join("");
    const bgImg = layout.bgImage ? `<img src="${layout.bgImage}" style="position:absolute;left:0;top:0;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;object-fit:contain"/>` : "";
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>席レイアウト ${calSelectedDate}</title><style>
      @page { size: A4 landscape; margin: 8mm; }
      *{box-sizing:border-box}
      html,body{margin:0;padding:0;font-family:'Hiragino Mincho ProN','游明朝',serif;background:#fff;color:#000}
      body{padding:10px 14px}
      h1{font-size:16px;margin:0 0 2px 0}
      .meta{font-size:11px;color:#444;margin-bottom:6px}
      .canvas-wrap{display:flex;justify-content:center;align-items:flex-start;width:100%;overflow:hidden}
      .canvas{position:relative;width:${CANVAS_WIDTH}px;height:${CANVAS_HEIGHT}px;background:#fff;border:1px solid #888;flex:none;transform-origin:top center}
      .legend{margin-top:6px;font-size:10px;color:#444;text-align:center}
      .legend span{margin:0 10px}
      .legend i{display:inline-block;width:12px;height:12px;border:1px solid #555;border-radius:2px;vertical-align:middle;margin-right:3px}
      @media print {
        body{padding:0}
        .noprint{display:none}
        /* A4横（約277×190mm印刷可能領域）に収まるよう、800×600キャンバスを縮小 */
        .canvas{transform:scale(0.92)}
      }
      @media screen {
        .canvas{transform:scale(0.85)}
      }
    </style></head><body>
      <h1>席レイアウト：${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dowJp}）</h1>
      <div class="meta">${eventLabel ? `イベント：${eventLabel} / `:""}レイアウト：${layout.name}</div>
      <div class="canvas-wrap"><div class="canvas">${bgImg}${seatHtml}</div></div>
      <div class="legend">
        <span><i style="background:#fff"></i>空席</span>
        <span><i style="background:#fde9d4"></i>予約あり</span>
        <span><i style="background:#dbe9f4"></i>来店済</span>
        <span><i style="background:#dadada"></i>使用不可</span>
      </div>
      <div class="noprint" style="margin-top:16px;text-align:center"><button onclick="window.print()" style="padding:8px 24px">印刷</button></div>
    </body></html>`);
    win.document.close();
  };

  const handleLinkCheck = () => {
    const activeRes = reservations; // _deleted除外済み
    const unlinked = activeRes.filter(r => {
      if (!r.eventName || !r.date) return true;
      return !events.some(e => e.date === r.date && e.name === r.eventName);
    });
    setLinkCheckResult({ total: activeRes.length, unlinked });
    setShowLinkCheck(true);
  };

  const printReservationList = () => {
    const dt = new Date(calSelectedDate + "T00:00:00");
    const dowJp = ["日","月","火","水","木","金","土"][dt.getDay()];
    const totalPeople = dayReservations.reduce((s,r)=>s+Number(r.people||0),0);
    const win = window.open("", "_blank");
    if (!win) { alert("ポップアップがブロックされました"); return; }

    // イベントごとにグループ化（複数ある場合のみ）
    const groups = [];
    if (dayEvents.length <= 1) {
      groups.push({
        title: dayEvents[0]?.name || "",
        event: dayEvents[0] || null,
        reservations: dayReservations,
      });
    } else {
      dayEvents.forEach(ev => {
        groups.push({
          title: ev.name,
          event: ev,
          reservations: dayReservations.filter(r => r.eventName === ev.name),
        });
      });
      const eventNames = dayEvents.map(e => e.name);
      const orphans = dayReservations.filter(r => !eventNames.includes(r.eventName));
      if (orphans.length > 0) {
        groups.push({ title: "（イベント未指定）", event: null, reservations: orphans });
      }
    }

    const renderRows = (list) => list.map(r => `
      <tr>
        <td style="text-align:center;width:40px"><div style="display:inline-block;width:18px;height:18px;border:1.5px solid #555;border-radius:3px;background:${r.arrived?"#5a8eae":"#fff"};color:#fff;font-weight:700;line-height:18px;text-align:center;font-size:12px">${r.arrived?"✓":""}</div></td>
        <td>${r.customerName||""}</td>
        <td style="text-align:center">${r.people||""}名</td>
        <td>${r.phone||""}</td>
        <td>${sourceLabel(r.source)||""}</td>
        <td>${r.seatNumber||""}</td>
        <td style="font-size:11px">${(r.note||"").replace(/[<>]/g,"")}</td>
      </tr>`).join("");

    const sections = groups.map(g => {
      const totalP = g.reservations.reduce((s,r)=>s+Number(r.people||0),0);
      const arrivedC = g.reservations.filter(r=>r.arrived).length;
      const ev = g.event;
      const evMeta = ev ? `${ev.open?`開店 ${ev.open}`:""}${ev.open&&ev.start?" / ":""}${ev.start?`開演 ${ev.start}`:""}` : "";
      const noBookingBadge = ev && ev.noBooking ? `<span style="background:#e24b4a;color:#fff;padding:2px 8px;border-radius:3px;font-size:11px;margin-left:8px;font-weight:700">🚫 予約不可</span>` : "";
      return `
        <div class="section">
          ${dayEvents.length > 1 || g.title ? `<div class="section-title">🎵 ${g.title || "（イベントなし）"}${noBookingBadge}</div>` : ""}
          ${evMeta ? `<div class="section-meta">🕒 ${evMeta}</div>` : ""}
          ${ev && ev.notes ? `<div class="notes">⚠️ <b>スタッフへの注意事項</b><br/>${(ev.notes||"").replace(/[<>]/g,"").replace(/\n/g,"<br/>")}</div>` : ""}
          <div class="section-stat">${g.reservations.length}組 / 計${totalP}名 / 来店 ${arrivedC}/${g.reservations.length}</div>
          <table>
            <thead><tr><th>受付</th><th>お名前</th><th>人数</th><th>電話</th><th>経路</th><th>席</th><th>備考</th></tr></thead>
            <tbody>${renderRows(g.reservations)||'<tr><td colspan="7" style="text-align:center;color:#888;padding:14px">予約はありません</td></tr>'}</tbody>
          </table>
        </div>`;
    }).join("");

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>予約リスト ${calSelectedDate}</title><style>
      body{margin:0;padding:20px;font-family:'Hiragino Mincho ProN','游明朝',serif;background:#fff;color:#000}
      h1{font-size:20px;margin:0 0 4px 0}
      .meta{font-size:13px;color:#444;margin-bottom:14px}
      .section{margin-bottom:18px;page-break-inside:avoid}
      .section-title{font-size:15px;font-weight:700;margin-bottom:4px;padding:4px 8px;background:#f5efde;border-left:4px solid #c9a84c}
      .section-meta{font-size:12px;color:#444;margin-bottom:4px;padding:0 8px}
      .section-stat{font-size:12px;color:#666;margin-bottom:6px;padding:0 8px}
      .notes{margin:6px 8px 8px 8px;padding:6px 10px;background:#fef4e6;border:1px solid #d68b3a;border-left:4px solid #d68b3a;font-size:12px;line-height:1.55}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #888;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#eee;font-weight:600;font-size:12px}
      @media print{ body{padding:8px} .noprint{display:none} }
    </style></head><body>
      <h1>予約リスト：${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${dowJp}）</h1>
      <div class="meta">${dayReservations.length}組 / 計${totalPeople}名 / 来店 ${dayReservations.filter(r=>r.arrived).length}/${dayReservations.length}</div>
      ${sections}
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
          <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={handleLinkCheck}>📊 紐付き確認</button>
          <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={()=>setShowImport(true)}>📥 CSVインポート</button>
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
                    <div style={{marginBottom:"2px",display:"flex",flexDirection:"column",gap:1}}>
                      {cell.events.slice(0,2).map((ev,i)=>(
                        <div key={i} style={{fontSize:".5rem",lineHeight:1.2,padding:"1px 3px",background:"rgba(201,168,76,0.13)",borderRadius:2,color:"#c9a84c",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>
                          🎵 {ev.name}
                        </div>
                      ))}
                      {cell.events.length > 2 && (
                        <div style={{fontSize:".48rem",color:"rgba(201,168,76,0.5)",paddingLeft:3}}>…他{cell.events.length-2}件</div>
                      )}
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
              {/* 日付タイトル＆印刷ボタン */}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:".5rem",marginBottom:".75rem"}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:"1.1rem",color:"#c9a84c"}}>
                  {fmtDate(calSelectedDate)}
                </div>
                <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                  <button style={{...S.btn("ghost"),padding:".35rem .7rem",fontSize:".62rem"}} onClick={printSeatLayout}>🖨 席レイアウト印刷</button>
                  <button style={{...S.btn("ghost"),padding:".35rem .7rem",fontSize:".62rem"}} onClick={printReservationList}>🖨 予約リスト印刷</button>
                </div>
              </div>

              {/* イベントごとの詳細カード（複数あれば縦に並ぶ） */}
              {dayEvents.length > 0 && (
                <div style={{display:"flex",flexDirection:"column",gap:".5rem",marginBottom:".75rem"}}>
                  {dayEvents.map((ev, idx) => (
                    <div key={ev._id || idx} style={{
                      padding:".7rem .9rem",
                      background: ev.noBooking
                        ? "repeating-linear-gradient(45deg,rgba(226,75,74,0.18),rgba(226,75,74,0.18) 10px,rgba(226,75,74,0.08) 10px,rgba(226,75,74,0.08) 20px)"
                        : "#0a0a0a",
                      border: `${ev.noBooking ? "2px" : "1px"} solid ${ev.noBooking ? "#e24b4a" : "rgba(201,168,76,0.2)"}`,
                      borderRadius: 5,
                      position: "relative",
                    }}>
                      {ev.noBooking && (
                        <div style={{
                          padding:".5rem .75rem",
                          marginBottom:".6rem",
                          background:"#e24b4a",
                          color:"#fff",
                          borderRadius:4,
                          fontSize:".82rem",
                          fontWeight:700,
                          letterSpacing:".08em",
                          textAlign:"center",
                          boxShadow:"0 2px 8px rgba(226,75,74,0.4)",
                        }}>
                          🚫 このイベントは予約受付不可です
                        </div>
                      )}
                      <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap",marginBottom:".25rem"}}>
                        <span style={{
                          fontSize:".88rem",
                          color: ev.noBooking ? "rgba(255,138,137,0.95)" : "#c9a84c",
                          fontWeight:600,
                        }}>🎵 {ev.name}</span>
                      </div>
                      {/* 時間情報 */}
                      {(ev.open || ev.start) && (
                        <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.7)",marginBottom:".15rem"}}>
                          🕒 {ev.open && `開店 ${ev.open}`}{ev.open && ev.start && " / "}{ev.start && `開演 ${ev.start}`}
                        </div>
                      )}
                      {/* スタッフ向け注意事項 */}
                      {ev.notes && (
                        <div style={{
                          marginTop:".5rem",
                          padding:".5rem .65rem",
                          background:"rgba(244,162,97,0.1)",
                          border:"1px solid rgba(244,162,97,0.35)",
                          borderRadius:4,
                          fontSize:".72rem",
                          color:"#f4a261",
                          whiteSpace:"pre-wrap",
                          lineHeight:1.55,
                        }}>
                          ⚠️ <span style={{color:"rgba(244,162,97,0.85)",fontWeight:600,letterSpacing:".05em"}}>スタッフへの注意事項</span><br/>
                          <span style={{color:"#f0e8d0"}}>{ev.notes}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 席レイアウト：イベントが0個 or 1個のときは1つだけ表示
                  複数イベントの場合は各グループ内に表示するのでここでは出さない */}
              {dayEvents.length <= 1 && (
                <details style={{marginBottom:"1rem"}}>
                  <summary style={{cursor:"pointer",padding:".5rem .75rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.2)",borderRadius:5,fontSize:".75rem",color:"rgba(201,168,76,0.85)",letterSpacing:".1em",userSelect:"none"}}>
                    🪑 席レイアウトを表示
                  </summary>
                  <div style={{marginTop:".75rem"}}>
                    <DayLayoutView
                      reservations={reservations}
                      dateKey={calSelectedDate}
                      layouts={layouts}
                      selectedLayoutId={dayLayoutMap[calSelectedDate] || (getDefaultLayout(layouts)?._id || "")}
                      onLayoutChange={(id)=>setDayLayout(calSelectedDate, id)}
                      blockedSeats={dayBlockedMap[calSelectedDate] || []}
                      onToggleBlocked={(seatNumber)=>toggleDayBlockedSeat(calSelectedDate, seatNumber)}
                    />
                  </div>
                </details>
              )}

              {/* 予約リスト：イベントごとにセクション分け */}
              {(() => {
                // イベントが0個 or 1個の場合：従来通り1セクション
                // イベントが2個以上の場合：イベントごとに分けて、未割り当てを最後に
                const groups = [];
                if (dayEvents.length <= 1) {
                  groups.push({
                    eventName: dayEvents[0]?.name || "",
                    event: dayEvents[0] || null,
                    reservations: dayReservations,
                  });
                } else {
                  // イベントごとに分ける
                  dayEvents.forEach(ev => {
                    groups.push({
                      eventName: ev.name,
                      event: ev,
                      reservations: dayReservations.filter(r => r.eventName === ev.name),
                    });
                  });
                  // どのイベントにも紐づかない予約
                  const eventNames = dayEvents.map(e => e.name);
                  const orphans = dayReservations.filter(r => !eventNames.includes(r.eventName));
                  if (orphans.length > 0) {
                    groups.push({
                      eventName: "（イベント未指定）",
                      event: null,
                      reservations: orphans,
                    });
                  }
                }

                const renderReservationCard = (r) => (
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
                );

                return groups.map((g, gi) => {
                  const totalP = g.reservations.reduce((s,r)=>s+Number(r.people||0),0);
                  const arrivedC = g.reservations.filter(r=>r.arrived).length;
                  // 複数イベント時は、イベント名をキーに付けて席レイアウトを分ける
                  const eventScopedKey = (dayEvents.length > 1 && g.eventName)
                    ? `${calSelectedDate}::${g.eventName}`
                    : calSelectedDate;
                  return (
                    <div key={gi} style={{marginBottom: gi<groups.length-1 ? "1.25rem" : 0}}>
                      <div style={{
                        display:"flex",
                        alignItems:"center",
                        gap:".5rem",
                        flexWrap:"wrap",
                        marginBottom:".5rem",
                        padding: dayEvents.length > 1 ? ".4rem .65rem" : 0,
                        background: dayEvents.length > 1 ? "#080808" : "transparent",
                        borderRadius: 4,
                        borderLeft: dayEvents.length > 1 ? "3px solid #c9a84c" : "none",
                      }}>
                        <span style={{fontSize:".72rem",color:"#c9a84c",letterSpacing:".1em",fontWeight:600}}>
                          📞 {dayEvents.length > 1 && g.eventName ? `${g.eventName} の予約` : "予約リスト"}
                        </span>
                        <span style={{fontSize:".68rem",color:"rgba(201,168,76,0.65)"}}>
                          （{g.reservations.length}組 / 計{totalP}名 / 来店 {arrivedC}/{g.reservations.length}）
                        </span>
                      </div>
                      {/* 複数イベント時のみ、各イベントに席レイアウト（折りたたみ式） */}
                      {dayEvents.length > 1 && g.event && (
                        <details style={{marginBottom:".75rem"}}>
                          <summary style={{cursor:"pointer",padding:".4rem .7rem",background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.18)",borderRadius:4,fontSize:".7rem",color:"rgba(201,168,76,0.8)",letterSpacing:".08em",userSelect:"none"}}>
                            🪑 「{g.eventName}」の席レイアウト
                          </summary>
                          <div style={{marginTop:".5rem"}}>
                            <DayLayoutView
                              reservations={g.reservations}
                              dateKey={calSelectedDate}
                              layouts={layouts}
                              selectedLayoutId={dayLayoutMap[eventScopedKey] || (getDefaultLayout(layouts)?._id || "")}
                              onLayoutChange={(id)=>setDayLayout(eventScopedKey, id)}
                              blockedSeats={dayBlockedMap[eventScopedKey] || []}
                              onToggleBlocked={(seatNumber)=>toggleDayBlockedSeat(eventScopedKey, seatNumber)}
                            />
                          </div>
                        </details>
                      )}
                      {g.reservations.length === 0 ? (
                        <div style={{textAlign:"center",padding:"1rem",color:"rgba(240,232,208,0.4)",fontSize:".78rem",background:"#111",borderRadius:5}}>
                          {dayEvents.length > 1 ? "このイベントの予約はまだありません" : "この日の予約はありません"}
                        </div>
                      ) : g.reservations.map(renderReservationCard)}
                    </div>
                  );
                });
              })()}
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

      {/* CSVインポートモーダル */}
      {showImport && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>!importing && setShowImport(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:560,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em"}}>📥 CSVインポート</div>
              <button style={S.btn("sm")} onClick={()=>!importing && setShowImport(false)} disabled={importing}>閉じる</button>
            </div>

            <div style={{fontSize:".78rem",color:"rgba(240,232,208,0.75)",lineHeight:1.7,marginBottom:"1rem"}}>
              Googleフォームの回答CSVを取り込みます。<br/>
              対応列：<span style={{color:"rgba(201,168,76,0.85)"}}>タイムスタンプ・イベント・日付・お名前・人数・電話番号・メールアドレス・備考</span>
            </div>

            <div style={{padding:".75rem .9rem",background:"rgba(244,162,97,0.1)",border:"1px solid rgba(244,162,97,0.3)",borderRadius:5,fontSize:".72rem",color:"rgba(244,162,97,0.9)",marginBottom:"1rem",lineHeight:1.6}}>
              ⚠️ 取り込みは <b>1件ずつそのまま追加</b> されます。CSVに重複がある場合は重複したまま登録されますのでご注意ください。<br/>
              間違って取り込んだ場合は、ゴミ箱から削除できます。
            </div>

            {!importing && !importResult && (
              <label style={{display:"block",padding:"1.25rem",border:"2px dashed rgba(201,168,76,0.4)",borderRadius:6,textAlign:"center",cursor:"pointer",background:"#080808"}}>
                <div style={{fontSize:"1rem",color:"#c9a84c",marginBottom:".5rem"}}>📂 CSVファイルを選択</div>
                <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)"}}>クリックしてファイルを選んでください</div>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  style={{display:"none"}}
                  onChange={(e)=>{
                    const f = e.target.files && e.target.files[0];
                    if (f) handleImportCSV(f);
                  }}
                />
              </label>
            )}

            {importing && (
              <div style={{textAlign:"center",padding:"2rem",color:"#c9a84c",fontSize:".9rem"}}>
                ⏳ 取り込み中...しばらくお待ちください
              </div>
            )}

            {importResult && (
              <div>
                <div style={{padding:"1rem",background:importResult.ok>0?"rgba(126,200,127,0.12)":"rgba(226,75,74,0.12)",border:`1px solid ${importResult.ok>0?"rgba(126,200,127,0.4)":"rgba(226,75,74,0.4)"}`,borderRadius:5,marginBottom:"1rem"}}>
                  <div style={{fontSize:".95rem",color:importResult.ok>0?"#7ec87e":"#ff8a89",fontWeight:600,marginBottom:".25rem"}}>
                    {importResult.ok > 0 ? `✅ ${importResult.ok}件 取り込み完了` : "❌ 取り込みに失敗しました"}
                  </div>
                  {importResult.errors.length > 0 && (
                    <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.7)",marginTop:".5rem",lineHeight:1.6}}>
                      <div style={{color:"rgba(244,162,97,0.85)",marginBottom:".25rem"}}>⚠️ {importResult.errors.length}件のスキップ・エラー：</div>
                      <div style={{maxHeight:160,overflowY:"auto",background:"#080808",padding:".5rem .75rem",borderRadius:3,fontSize:".68rem"}}>
                        {importResult.errors.map((err, i) => (
                          <div key={i}>・{err}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{display:"flex",gap:".5rem",justifyContent:"flex-end"}}>
                  <button
                    style={S.btn("ghost")}
                    onClick={()=>{setImportResult(null);}}
                  >もう一度インポート</button>
                  <button
                    style={S.btn("gold")}
                    onClick={()=>{setShowImport(false);setImportResult(null);}}
                  >閉じる</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 紐付きチェックモーダル */}
      {showLinkCheck && linkCheckResult && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setShowLinkCheck(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:640,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <h3 style={{fontFamily:"Georgia,serif",color:"#c9a84c",margin:"0 0 1rem 0",fontSize:"1rem"}}>📊 イベントと予約の紐付き状況</h3>
            <div style={{fontSize:".82rem",color:"#f0e8d0",marginBottom:".75rem"}}>
              全予約 <strong>{linkCheckResult.total}</strong> 件 / うち紐付くイベントなし <strong style={{color: linkCheckResult.unlinked.length > 0 ? "#e24b4a" : "#7ec87e"}}>{linkCheckResult.unlinked.length}</strong> 件
            </div>
            {linkCheckResult.unlinked.length > 0 ? (
              <>
                <div style={{padding:".6rem .8rem",background:"rgba(226,75,74,0.12)",border:"1px solid rgba(226,75,74,0.35)",borderRadius:4,fontSize:".75rem",color:"#f4a261",marginBottom:"1rem",lineHeight:1.6}}>
                  ⚠️ 紐付かない予約は、Today画面やレイアウト印刷でイベント名が正しく表示されません。<br/>
                  イベントのCSV再取り込み後、予約の「イベント名」が一致しているか確認・修正してください。
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:".75rem"}}>
                  <thead>
                    <tr style={{borderBottom:"1px solid rgba(201,168,76,0.2)"}}>
                      <th style={{textAlign:"left",padding:".4rem .5rem",color:"rgba(201,168,76,0.7)",fontWeight:500}}>日付</th>
                      <th style={{textAlign:"left",padding:".4rem .5rem",color:"rgba(201,168,76,0.7)",fontWeight:500}}>予約のイベント名</th>
                      <th style={{textAlign:"left",padding:".4rem .5rem",color:"rgba(201,168,76,0.7)",fontWeight:500}}>予約者名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkCheckResult.unlinked.map((r,i) => (
                      <tr key={r._id||i} style={{borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                        <td style={{padding:".4rem .5rem",color:"#f0e8d0"}}>{r.date||"―"}</td>
                        <td style={{padding:".4rem .5rem",color: r.eventName ? "#f4a261" : "rgba(240,232,208,0.35)"}}>{r.eventName||"（未設定）"}</td>
                        <td style={{padding:".4rem .5rem",color:"#f0e8d0"}}>{r.customerName||"―"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <div style={{padding:".75rem",background:"rgba(126,200,126,0.1)",border:"1px solid rgba(126,200,126,0.3)",borderRadius:4,fontSize:".8rem",color:"#7ec87e"}}>
                ✅ すべての予約がイベントと正しく紐付いています。
              </div>
            )}
            <div style={{marginTop:"1.25rem",textAlign:"right"}}>
              <button style={S.btn("ghost")} onClick={()=>setShowLinkCheck(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

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

  // 今日以降のイベントを日付別にグループ化（貸切除外）— ローカルタイムゾーン
  const today = (() => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  })();
  const upcomingEvents = events.filter(e => e.date && e.date >= today && !/貸切|貸し切り/.test(e.name||"") && !e.noBooking);
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

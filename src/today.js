import { useState, useEffect, useRef } from "react";
import { db, storage } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getShiftForDate, getRoleColor, getRoleLabel, isManager } from "./shift";
import { getBusinessDate } from "./businessDate";

const MAX_HANDOVER_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function sanitizeHandoverFileName(name) {
  const base = String(name || "file").replace(/[/\\?%*:|"<>]/g, "_").replace(/^\.+/, "").trim();
  return (base || "file").slice(0, 120);
}

function isAllowedHandoverMime(file) {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf") return true;
  if (t.startsWith("image/")) return true;
  return false;
}

/** handovers/{handoverId}/attachments/{timestamp}_{index}_{safeFileName} */
async function uploadHandoverAttachments(handoverId, fileList) {
  const files = fileList ? Array.from(fileList) : [];
  const attachments = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!isAllowedHandoverMime(file)) {
      alert(`画像またはPDFのみアップロードできます: ${file.name}`);
      continue;
    }
    if (file.size > MAX_HANDOVER_ATTACHMENT_BYTES) {
      alert(`1ファイルあたり10MBまでです: ${file.name}`);
      continue;
    }
    const safe = sanitizeHandoverFileName(file.name);
    const storagePath = `handovers/${handoverId}/attachments/${Date.now()}_${i}_${safe}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);
    attachments.push({
      storagePath,
      downloadURL,
      originalName: file.name || safe,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      uploadedAt: Date.now(),
    });
  }
  return attachments;
}

function isHandoverImageAtt(att) {
  return (att.contentType || "").toLowerCase().startsWith("image/");
}

function isHandoverPdfAtt(att) {
  if ((att.contentType || "").toLowerCase() === "application/pdf") return true;
  return String(att.originalName || "").toLowerCase().endsWith(".pdf");
}

/** YYYY-MM-DD 文字列の配列を重複除去して昇順ソート */
function normalizeHandoverTargetDates(arr) {
  const set = new Set((arr || []).filter(Boolean));
  return [...set].sort();
}

function HandoverAttachmentsBlock({ attachments, compact }) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (list.length === 0) return null;
  return (
    <div style={{ marginTop: compact ? ".25rem" : ".45rem", display: "flex", flexWrap: "wrap", gap: compact ? ".35rem" : ".45rem", alignItems: "flex-start" }}>
      {list.map((att, i) => {
        const url = att.downloadURL || "";
        const name = att.originalName || "file";
        if (isHandoverImageAtt(att) && url) {
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: "block", lineHeight: 0 }}>
              <img
                src={url}
                alt=""
                style={{ maxWidth: 160, maxHeight: 130, borderRadius: 4, objectFit: "cover", border: "1px solid rgba(244,162,97,0.25)" }}
              />
            </a>
          );
        }
        if (isHandoverPdfAtt(att)) {
          return (
            <div
              key={i}
              style={{
                padding: ".45rem .55rem",
                background: "rgba(226,75,74,0.06)",
                border: "1px solid rgba(244,162,97,0.2)",
                borderRadius: 4,
                fontSize: ".68rem",
                maxWidth: 220,
              }}
            >
              <div style={{ color: "#f4a261", marginBottom: ".25rem" }}>📄 PDF</div>
              <div style={{ color: "rgba(240,232,208,0.75)", wordBreak: "break-all", marginBottom: ".35rem", lineHeight: 1.35 }}>{name}</div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: ".2rem .45rem",
                    borderRadius: 3,
                    fontSize: ".58rem",
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: "transparent",
                    color: "#c9a84c",
                    border: "1px solid rgba(201,168,76,0.35)",
                    textDecoration: "none",
                    display: "inline-block",
                  }}
                >
                  PDFを開く
                </a>
              )}
            </div>
          );
        }
        return url ? (
          <a key={i} href={url} target="_blank" rel="noreferrer" style={{ fontSize: ".65rem", color: "#7ec8e3" }}>
            {name}
          </a>
        ) : null;
      })}
    </div>
  );
}

// 業務チェックリストのテンプレート
const NORMAL_CHECKLIST_TEMPLATE = [
  {
    key: "open",
    label: "開店前",
    icon: "🌅",
    items: [
      { id: "floor_cleaning", label: "店内床清掃" },
      { id: "entrance_cleaning", label: "1Fエントランス清掃" },
      { id: "sign_preparation", label: "1F看板準備" },
      { id: "elevator_poster_check", label: "エレベーター内ポスター確認" },
      { id: "toilet_cleaning", label: "トイレ清掃" },
      { id: "table_wipe", label: "客席テーブル拭き" },
      { id: "reception_preparation", label: "受付準備" },
      { id: "change_check", label: "釣銭確認" },
      { id: "reservation_list_check", label: "予約リスト確認" },
      { id: "stock_recommend_check", label: "欠品・おすすめ等確認" },
      { id: "morning_meeting", label: "朝礼" },
    ],
  },
  {
    key: "during",
    label: "イベント中",
    icon: "🎵",
    items: [
      { id: "customer_status_check", label: "来店状況確認" },
      { id: "toilet_status_check", label: "トイレ状態確認" },
    ],
  },
  {
    key: "after",
    label: "終演後",
    icon: "🌙",
    items: [
      { id: "seat_cleanup", label: "客席片付け" },
      { id: "lost_and_found_check", label: "忘れ物確認" },
      { id: "table_cleaning", label: "テーブル清掃" },
      { id: "dishwashing_check", label: "洗い物確認" },
      { id: "stage_cleanup", label: "ステージ片付け" },
      { id: "garbage_disposal", label: "ゴミ出し" },
      { id: "artist_settlement", label: "出演者精算" },
      { id: "cash_register_close", label: "レジ締め" },
      { id: "next_day_event_check", label: "翌日イベント確認" },
      { id: "handover_note", label: "申し送り" },
    ],
  },
];

const MULTI_CHECKLIST_TEMPLATE = [
  {
    key: "open",
    label: "開店前",
    icon: "🌅",
    items: [...NORMAL_CHECKLIST_TEMPLATE[0].items],
  },
  {
    key: "firstDuring",
    label: "前半イベント中",
    icon: "🎵",
    items: [
      { id: "customer_status_check", label: "来店状況確認" },
      { id: "toilet_status_check", label: "トイレ状態確認" },
    ],
  },
  {
    key: "handover",
    label: "前半終演後／後半引き継ぎ",
    icon: "🔄",
    items: [
      { id: "first_event_finished_check", label: "前半イベント終了状況確認" },
      { id: "reservation_share", label: "来店・予約状況の共有" },
      { id: "pending_tasks_check", label: "未対応事項確認" },
      { id: "seat_cleanup", label: "客席片付け" },
      { id: "lost_and_found_check", label: "忘れ物確認" },
      { id: "table_cleaning", label: "テーブル清掃" },
      { id: "toilet_status_check", label: "トイレ状態確認" },
      { id: "dishwashing_check", label: "洗い物確認" },
      { id: "stage_transition_check", label: "ステージ転換確認" },
      { id: "garbage_status_check", label: "ゴミ状況確認" },
      { id: "artist_settlement_check", label: "出演者精算確認" },
      { id: "handover_to_later_staff", label: "後半スタッフへの申し送り" },
    ],
  },
  {
    key: "laterDuring",
    label: "後半イベント中",
    icon: "🎶",
    items: [
      { id: "customer_status_check", label: "来店状況確認" },
      { id: "toilet_status_check", label: "トイレ状態確認" },
      { id: "handover_confirmed", label: "前半からの申し送り確認" },
    ],
  },
  {
    key: "finalAfter",
    label: "最終終演後",
    icon: "🌙",
    items: [
      { id: "seat_cleanup", label: "客席片付け" },
      { id: "lost_and_found_check", label: "忘れ物確認" },
      { id: "table_cleaning", label: "テーブル清掃" },
      { id: "dishwashing_check", label: "洗い物確認" },
      { id: "stage_cleanup", label: "ステージ片付け" },
      { id: "garbage_disposal", label: "ゴミ出し" },
      { id: "artist_settlement", label: "出演者精算" },
      { id: "cash_register_close", label: "レジ締め" },
      { id: "next_day_event_check", label: "翌日イベント確認" },
      { id: "handover_note", label: "申し送り" },
    ],
  },
];

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
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
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
  const todayStr = (() => {
    const yy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  })();

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

export default function TodayModule({ events = [], rentals = [], shifts = [], reservations = [], navigateBack, onEditEvent, onGoReservations }) {
  const today = getBusinessDate();
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
  const [handoverUploading, setHandoverUploading] = useState(false);
  const [pendingNoteFileCount, setPendingNoteFileCount] = useState(0);
  const [pendingItemFileCount, setPendingItemFileCount] = useState(0);
  const [editingHandoverId, setEditingHandoverId] = useState("");
  const [editingHandoverText, setEditingHandoverText] = useState("");
  const [savingHandoverEditId, setSavingHandoverEditId] = useState("");
  const [editingTargetHandoverId, setEditingTargetHandoverId] = useState("");
  const [editTargetMode, setEditTargetMode] = useState("multi"); // nextday | single | multi | range
  const [editTargetDate, setEditTargetDate] = useState("");
  const [editTargetDates, setEditTargetDates] = useState([]);
  const [editTargetRangeStart, setEditTargetRangeStart] = useState("");
  const [editTargetRangeEnd, setEditTargetRangeEnd] = useState("");
  const [savingTargetDatesId, setSavingTargetDatesId] = useState("");
  const handoverNoteFileRef = useRef(null);
  const handoverItemFileRef = useRef(null);

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

  // 個別フィールド更新（並列編集に強い）
  const updateField = async (path, value) => {
    const docRef = doc(db, "daily", selectedDate);
    try {
      // updateDoc はドキュメントが存在しないと失敗する
      await updateDoc(docRef, { [path]: value, savedAt: new Date().toLocaleString("ja-JP") });
    } catch (e) {
      // 無ければ作る（最初の保存）
      await setDoc(docRef, { [path]: value, savedAt: new Date().toLocaleString("ja-JP") });
    }
  };

  const getLegacyNormalCategoryKey = (categoryKey) => {
    if (categoryKey === "open") return "prep";
    if (categoryKey === "during") return "during";
    if (categoryKey === "after") return "after";
    return null;
  };

  const getCheckValue = (modeKey, categoryKey, itemId, idx) => {
    const checks = dayData.checks || {};
    const scopedChecks = checks[modeKey];
    const catChecks = scopedChecks && typeof scopedChecks === "object" ? scopedChecks[categoryKey] : null;
    if (catChecks && typeof catChecks === "object") {
      if (Object.prototype.hasOwnProperty.call(catChecks, itemId)) return !!catChecks[itemId];
      if (Object.prototype.hasOwnProperty.call(catChecks, String(idx))) return !!catChecks[String(idx)];
    }
    if (modeKey === "normal") {
      const legacyKey = getLegacyNormalCategoryKey(categoryKey);
      const legacyChecks = legacyKey ? checks[legacyKey] : null;
      if (Array.isArray(legacyChecks)) return !!legacyChecks[idx];
      if (legacyChecks && typeof legacyChecks === "object") {
        if (Object.prototype.hasOwnProperty.call(legacyChecks, itemId)) return !!legacyChecks[itemId];
        if (Object.prototype.hasOwnProperty.call(legacyChecks, String(idx))) return !!legacyChecks[String(idx)];
      }
    }
    return false;
  };

  // チェック切替（並列編集対応）
  const toggleCheck = async (modeKey, categoryKey, itemId, idx) => {
    const checks = dayData.checks || {};
    const current = getCheckValue(modeKey, categoryKey, itemId, idx);
    const newVal = !current;
    const nextChecks = {
      ...checks,
      [modeKey]: {
        ...(checks[modeKey] && typeof checks[modeKey] === "object" ? checks[modeKey] : {}),
        [categoryKey]: {
          ...(
            checks[modeKey] &&
            checks[modeKey][categoryKey] &&
            typeof checks[modeKey][categoryKey] === "object"
              ? checks[modeKey][categoryKey]
              : {}
          ),
          [itemId]: newVal,
        },
      },
    };
    setDayData({ ...dayData, checks: nextChecks });
    await updateField(`checks.${modeKey}.${categoryKey}.${itemId}`, newVal);
  };

  // 申し送り：個別項目チェック切替（並列編集対応）
  const toggleHandoverItem = async (handoverId, currentDone) => {
    await updateField_handover(handoverId, "done", !currentDone);
  };

  // 申し送り共通：updateField
  const updateField_handover = async (id, field, value) => {
    await setDoc(doc(db, "handovers", id), { [field]: value, updatedAt: Date.now() }, { merge: true });
  };

  const cancelEditTargetDates = () => {
    setEditingTargetHandoverId("");
    setEditTargetMode("multi");
    setEditTargetDate("");
    setEditTargetDates([]);
    setEditTargetRangeStart("");
    setEditTargetRangeEnd("");
  };

  const startEditHandover = (h) => {
    cancelEditTargetDates();
    setEditingHandoverId(h._id);
    setEditingHandoverText(String(h.text || ""));
  };

  const cancelEditHandover = () => {
    setEditingHandoverId("");
    setEditingHandoverText("");
  };

  const startEditTargetDates = (h) => {
    cancelEditHandover();
    const initial = normalizeHandoverTargetDates(h.targetDates);
    setEditingTargetHandoverId(h._id);
    setEditTargetMode("multi");
    setEditTargetDates(initial);
    setEditTargetDate("");
    setEditTargetRangeStart("");
    setEditTargetRangeEnd("");
  };

  const saveEditHandover = async (id) => {
    const nextText = editingHandoverText.trim();
    if (!nextText) {
      alert("本文を入力してください");
      return;
    }
    setSavingHandoverEditId(id);
    try {
      await setDoc(doc(db, "handovers", id), { text: nextText, updatedAt: Date.now(), editedAt: Date.now() }, { merge: true });
      cancelEditHandover();
    } finally {
      setSavingHandoverEditId("");
    }
  };

  const getHandoverUpdatedLabel = (h) => {
    const t = Number(h.editedAt || h.updatedAt || 0);
    if (!Number.isFinite(t) || t <= 0) return "";
    return `最終更新：${new Date(t).toLocaleString("ja-JP")}`;
  };

  // 申し送り：個別項目追加（モードに応じて対象日を設定）
  const addHandoverItem = async () => {
    const text = newHandoverItem.trim();
    const files = handoverItemFileRef.current?.files;
    const fileArr = files ? Array.from(files) : [];
    if (!text && fileArr.length === 0) return;
    const targetDates = computeTargetDates();
    if (targetDates === null) return;
    if (targetDates.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    const id = `ho_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    let attachments = [];
    if (fileArr.length > 0) {
      setHandoverUploading(true);
      try {
        attachments = await uploadHandoverAttachments(id, fileArr);
      } catch (e) {
        alert("アップロードに失敗しました: " + (e.message || String(e)));
        return;
      } finally {
        setHandoverUploading(false);
      }
    }
    if (!text && attachments.length === 0) return;
    const payload = {
      type: "item",
      text,
      done: false,
      sourceDate: selectedDate,
      targetDates,
      createdAt: Date.now(),
    };
    if (attachments.length > 0) payload.attachments = attachments;
    await setDoc(doc(db, "handovers", id), payload);
    setNewHandoverItem("");
    setPendingItemFileCount(0);
    if (handoverItemFileRef.current) handoverItemFileRef.current.value = "";
  };

  // 申し送り：自由記述追加
  const addHandoverNote = async () => {
    const text = newHandoverNote.trim();
    const files = handoverNoteFileRef.current?.files;
    const fileArr = files ? Array.from(files) : [];
    if (!text && fileArr.length === 0) return;
    const targetDates = computeTargetDates();
    if (targetDates === null) return;
    if (targetDates.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    const id = `ho_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
    let attachments = [];
    if (fileArr.length > 0) {
      setHandoverUploading(true);
      try {
        attachments = await uploadHandoverAttachments(id, fileArr);
      } catch (e) {
        alert("アップロードに失敗しました: " + (e.message || String(e)));
        return;
      } finally {
        setHandoverUploading(false);
      }
    }
    if (!text && attachments.length === 0) return;
    const payload = {
      type: "note",
      text,
      sourceDate: selectedDate,
      targetDates,
      createdAt: Date.now(),
    };
    if (attachments.length > 0) payload.attachments = attachments;
    await setDoc(doc(db, "handovers", id), payload);
    setNewHandoverNote("");
    setPendingNoteFileCount(0);
    if (handoverNoteFileRef.current) handoverNoteFileRef.current.value = "";
  };

  // 申し送り：削除
  const removeHandoverItem = async (id) => {
    if (!window.confirm("この申し送りを削除しますか？")) return;
    if (id === editingHandoverId) cancelEditHandover();
    if (id === editingTargetHandoverId) cancelEditTargetDates();
    const h = allHandovers.find(x => x._id === id);
    if (h && Array.isArray(h.attachments)) {
      for (const att of h.attachments) {
        if (!att.storagePath) continue;
        try {
          await deleteObject(ref(storage, att.storagePath));
        } catch (e) {
          console.warn(e);
        }
      }
    }
    await deleteDoc(doc(db, "handovers", id));
  };

  // モードに応じて targetDates を計算
  const computeTargetDates = () => {
    if (handoverMode === "nextday") {
      return [shiftDate(selectedDate, 1)];
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
      if (handoverRangeEnd < handoverRangeStart) { alert("終了日が開始日より前になっています"); return null; }
      const dates = [];
      let cur = handoverRangeStart;
      while (cur <= handoverRangeEnd) {
        dates.push(cur);
        cur = shiftDate(cur, 1);
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
  const sortedIncomingHandovers = incomingHandovers
    .slice()
    .sort((a, b) => {
      const ao = Number(a.sortOrder);
      const bo = Number(b.sortOrder);
      const aHas = Number.isFinite(ao);
      const bHas = Number.isFinite(bo);
      if (aHas && bHas) return ao - bo;
      if (aHas && !bHas) return -1;
      if (!aHas && bHas) return 1;
      const ac = Number(a.createdAt || 0);
      const bc = Number(b.createdAt || 0);
      if (ac !== bc) return ac - bc;
      return String(a._id || "").localeCompare(String(b._id || ""));
    });

  const moveIncomingHandover = async (index, direction) => {
    if (editingHandoverId || editingTargetHandoverId) return;
    const target = index + direction;
    if (target < 0 || target >= sortedIncomingHandovers.length) return;
    const next = [...sortedIncomingHandovers];
    [next[index], next[target]] = [next[target], next[index]];
    await Promise.all(
      next.map((h, i) =>
        setDoc(doc(db, "handovers", h._id), { sortOrder: i }, { merge: true })
      )
    );
  };

  // 日付ナビ（タイムゾーン対応：toISOString は UTC を返すので文字列を直接いじる）
  const shiftDate = (dateStr, days) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m-1, d); // ローカル日付として作る
    dt.setDate(dt.getDate() + days);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth()+1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };

  const computeEditTargetDates = () => {
    if (editTargetMode === "nextday") {
      return [shiftDate(selectedDate, 1)];
    }
    if (editTargetMode === "single") {
      if (!editTargetDate) return [];
      return [editTargetDate];
    }
    if (editTargetMode === "multi") {
      return [...editTargetDates];
    }
    if (editTargetMode === "range") {
      if (!editTargetRangeStart || !editTargetRangeEnd) return [];
      if (editTargetRangeEnd < editTargetRangeStart) {
        alert("終了日が開始日より前になっています");
        return null;
      }
      const dates = [];
      let cur = editTargetRangeStart;
      while (cur <= editTargetRangeEnd) {
        dates.push(cur);
        cur = shiftDate(cur, 1);
      }
      return dates;
    }
    return [];
  };

  const toggleEditMultiDate = (date) => {
    if (editTargetDates.includes(date)) {
      setEditTargetDates(editTargetDates.filter(d => d !== date));
    } else {
      setEditTargetDates([...editTargetDates, date].sort());
    }
  };

  const saveEditTargetDates = async (id) => {
    const computed = computeEditTargetDates();
    if (computed === null) return;
    const normalized = normalizeHandoverTargetDates(computed);
    if (normalized.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    setSavingTargetDatesId(id);
    try {
      await setDoc(doc(db, "handovers", id), {
        targetDates: normalized,
        updatedAt: Date.now(),
        editedAt: Date.now(),
      }, { merge: true });
      cancelEditTargetDates();
    } finally {
      setSavingTargetDatesId("");
    }
  };

  const prevDay = () => {
    setSelectedDate(prev => shiftDate(prev, -1));
  };
  const nextDay = () => {
    setSelectedDate(prev => shiftDate(prev, +1));
  };
  const goToday = () => setSelectedDate(today);
  const isToday = selectedDate === today;

  // 当日のイベント
  const parseEventMinutes = (ev) => {
    const raw = ev?.open || ev?.start || ev?.time || ev?.startTime || "";
    const m = String(raw).match(/(\d{1,2}):(\d{2})/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const todayEvents = events
    .filter(e => e.date === selectedDate)
    .slice()
    .sort((a, b) => {
      const diff = parseEventMinutes(a) - parseEventMinutes(b);
      if (diff !== 0) return diff;
      return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    });
  const isMultiEventDay = todayEvents.length >= 2;
  const checklistModeKey = isMultiEventDay ? "multi" : "normal";
  const checklistTemplate = isMultiEventDay ? MULTI_CHECKLIST_TEMPLATE : NORMAL_CHECKLIST_TEMPLATE;
  const checklistByKey = checklistTemplate.reduce((acc, cat) => {
    acc[cat.key] = cat;
    return acc;
  }, {});

  // 当日の貸切（仮押さえ・成約・完了のみ）
  const todayRentals = rentals.filter(r =>
    r.desiredDate === selectedDate && ["hold","won","done"].includes(r.status)
  );

  // 現在時刻（1分ごとに更新）
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 当日の最も早い開場時間を取得（イベント・貸切から）
  const getEarliestOpen = () => {
    const times = [];
    todayEvents.forEach(e => {
      if (e.open) times.push(e.open);
      else if (e.start) times.push(e.start);
    });
    todayRentals.forEach(r => {
      // desiredTime から HH:MM を抽出
      const m = (r.desiredTime || "").match(/(\d{1,2}:\d{2})/);
      if (m) times.push(m[1]);
    });
    if (times.length === 0) return null;
    // HH:MM をソート（文字列比較で OK）
    times.sort();
    return times[0];
  };

  // 警告判定
  const computeAlerts = () => {
    // 当日 OR 「昨日の日付を朝5時前に見ている」場合（深夜の終演後チェック確認）
    const isViewingToday = selectedDate === today;
    const isViewingYesterdayInEarlyMorning = (() => {
      if (selectedDate >= today) return false;
      // 昨日の日付を見ていて、現在時刻が朝5時前なら終演後警告だけ出す
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= 5 * 60) return false;
      // 1日だけ前か確認
      const prev = shiftDate(today, -1);
      return selectedDate === prev;
    })();
    if (!isViewingToday && !isViewingYesterdayInEarlyMorning) return [];
    if (todayEvents.length === 0 && todayRentals.length === 0) return []; // 店休日
    const alerts = [];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const parseMin = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + (m || 0);
    };

    const collectUndone = (catKey) => {
      const cat = checklistByKey[catKey];
      if (!cat) return [];
      const undone = [];
      cat.items.forEach((it, i) => {
        if (!getCheckValue(checklistModeKey, catKey, it.id, i)) undone.push(it.label);
      });
      return undone;
    };

    const prepCategoryKey = "open";
    const afterCategoryKey = isMultiEventDay ? "finalAfter" : "after";

    if (isViewingToday) {
      // 開店前：イベントの開場時間を過ぎても未完了
      const earliestOpen = getEarliestOpen();
      if (earliestOpen) {
        const openMin = parseMin(earliestOpen);
        if (nowMin >= openMin) {
          const undone = collectUndone(prepCategoryKey);
          if (undone.length > 0) alerts.push({ key: prepCategoryKey, label: checklistByKey[prepCategoryKey]?.label || "開店前", undone, since: earliestOpen });
        }
      }
      // 終演後：23:00 を過ぎても未完了
      if (nowMin >= 23 * 60) {
        const undone = collectUndone(afterCategoryKey);
        if (undone.length > 0) alerts.push({ key: afterCategoryKey, label: checklistByKey[afterCategoryKey]?.label || "終演後", undone, since: "23:00" });
      }
    } else if (isViewingYesterdayInEarlyMorning) {
      // 深夜：昨日の終演後チェックの未完了のみ警告
      const undone = collectUndone(afterCategoryKey);
      if (undone.length > 0) alerts.push({ key: afterCategoryKey, label: `${checklistByKey[afterCategoryKey]?.label || "終演後"}（前日）`, undone, since: "23:00" });
    }
    return alerts;
  };

  const alerts = computeAlerts();

  // 過去の申し送り履歴（過去14日に発行されたもの）
  const handoverHistory = allHandovers
    .filter(h => h.sourceDate && h.sourceDate < selectedDate)
    .sort((a, b) => (b.sourceDate || "").localeCompare(a.sourceDate || ""))
    .slice(0, 50);

  return (
    <div style={{padding:"1rem .85rem",maxWidth:720,margin:"0 auto"}} className="hb-view">
      <style>{`
        .hb-view .ho-meta-act {
          padding: .03rem .12rem;
          margin: 0;
          font-size: 0.68rem;
          font-family: inherit;
          line-height: 1.28;
          border: 1px solid transparent;
          border-radius: 2px;
          background: transparent;
          color: rgba(201,168,76,0.4);
          cursor: pointer;
        }
        .hb-view .ho-meta-act:hover:not(:disabled) {
          border-color: rgba(201,168,76,0.2);
          color: rgba(210,185,125,0.75);
          background: rgba(201,168,76,0.05);
        }
        .hb-view .ho-meta-act:disabled {
          opacity: 0.28;
          cursor: not-allowed;
        }
        .hb-view .ho-meta-act-del {
          color: rgba(226,75,74,0.32);
          padding: .02rem .1rem;
        }
        .hb-view .ho-meta-act-del:hover:not(:disabled) {
          color: rgba(230,130,128,0.85);
          border-color: rgba(226,75,74,0.18);
          background: rgba(226,75,74,0.05);
        }
      `}</style>
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

      {/* チェックリスト未完了アラート */}
      {alerts.length > 0 && (
        <div style={{padding:"1rem 1.1rem",marginBottom:"1.25rem",background:"rgba(226,75,74,0.1)",border:"2px solid #e24b4a",borderRadius:8,boxShadow:"0 0 12px rgba(226,75,74,0.25)"}}>
          <div style={{fontSize:".8rem",letterSpacing:".15em",color:"#ff6b6a",marginBottom:".75rem",fontWeight:700,display:"flex",alignItems:"center",gap:".4rem"}}>
            <span style={{fontSize:"1.1rem"}}>⚠️</span>
            チェックリスト未完了 — 残り{alerts.reduce((s,a)=>s+a.undone.length,0)}件
          </div>
          {alerts.map(alert => (
            <div key={alert.key} style={{marginBottom:".75rem",padding:".7rem .85rem",background:"rgba(0,0,0,0.3)",borderRadius:5,borderLeft:"3px solid #e24b4a"}}>
              <div style={{fontSize:".75rem",color:"#ff8e8d",marginBottom:".4rem",fontWeight:600,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:".3rem"}}>
                <span>{checklistByKey[alert.key]?.icon || "📋"} {alert.label}（{alert.undone.length}件）</span>
                <span style={{fontSize:".6rem",color:"rgba(255,142,141,0.6)",fontWeight:400}}>{alert.since} 過ぎ</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:".3rem"}}>
                {alert.undone.map((item,i) => (
                  <span key={i} style={{padding:".2rem .55rem",background:"rgba(226,75,74,0.15)",border:"1px solid rgba(226,75,74,0.3)",borderRadius:3,fontSize:".7rem",color:"#ffafae"}}>
                    □ {item}
                  </span>
                ))}
              </div>
              <button type="button" onClick={()=>setExpandedSection(alert.key)} style={{marginTop:".5rem",padding:".3rem .7rem",background:"transparent",border:"1px solid rgba(255,142,141,0.4)",borderRadius:3,color:"#ff8e8d",fontSize:".62rem",letterSpacing:".1em",cursor:"pointer",fontFamily:"inherit"}}>
                ↓ チェックリストを開く
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 当日に届く申し送り */}
      {sortedIncomingHandovers.length > 0 && (
        <div style={{padding:".6rem .72rem",marginBottom:".85rem",background:"rgba(244,162,97,0.06)",border:"1px solid rgba(244,162,97,0.22)",borderRadius:6}}>
          <div style={{fontSize:".65rem",letterSpacing:".12em",color:"#f4a261",marginBottom:".42rem",fontWeight:600}}>📋 申し送り</div>
          {sortedIncomingHandovers.map((h, idx) => {
            const fromLabel = h.sourceDate === selectedDate
              ? "本日"
              : fmtDate(h.sourceDate || "").replace(/^\d+年/,"") + " から";
            const isEditing = editingHandoverId === h._id;
            const isEditingTarget = editingTargetHandoverId === h._id;
            const updatedLabel = getHandoverUpdatedLabel(h);
            const sortingDisabled = !!editingHandoverId || !!editingTargetHandoverId;
            const metaLine = `${fromLabel}${(h.targetDates||[]).length > 1 ? ` · ${(h.targetDates||[]).length}日` : ""}${updatedLabel ? ` · ${updatedLabel}` : ""}`;
            return (
              <div key={h._id} style={{padding:".32rem .42rem",marginBottom: idx === sortedIncomingHandovers.length - 1 ? 0 : ".18rem",background:h.done?"rgba(126,200,127,0.06)":"rgba(0,0,0,0.28)",borderRadius:4,borderLeft:"2px solid rgba(201,168,76,0.38)"}}>
                <div style={{display:"flex",gap:".38rem",alignItems:"flex-start"}}>
                  {h.type === "item" && (
                    <input type="checkbox" checked={!!h.done} onChange={()=>toggleHandoverItem(h._id, h.done)} style={{accentColor:"#7ec87e",width:18,height:18,marginTop:2,flexShrink:0}}/>
                  )}
                  {h.type === "note" && <span style={{color:"#f4a261",marginTop:1,flexShrink:0,fontSize:".72rem",lineHeight:1.2}}>•</span>}
                  <div style={{flex:1,minWidth:0}}>
                  {isEditing ? (
                    <div style={{marginBottom:".28rem"}}>
                      <textarea
                        value={editingHandoverText}
                        onChange={e=>setEditingHandoverText(e.target.value)}
                        style={{...S.inp,resize:"vertical",lineHeight:1.5,minHeight:72,fontSize:".78rem"}}
                      />
                      <div style={{display:"flex",gap:".35rem",marginTop:".32rem"}}>
                        <button type="button" style={{...S.btn("gold"),padding:".28rem .55rem",fontSize:".62rem"}} onClick={()=>saveEditHandover(h._id)} disabled={savingHandoverEditId===h._id}>
                          {savingHandoverEditId===h._id ? "保存中…" : "保存"}
                        </button>
                        <button type="button" style={{...S.btn("ghost"),padding:".28rem .55rem",fontSize:".62rem"}} onClick={cancelEditHandover} disabled={savingHandoverEditId===h._id}>キャンセル</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: ".78rem",
                        color: h.done ? "rgba(126,200,127,0.62)" : "rgba(240,232,208,0.88)",
                        textDecoration: h.done ? "line-through" : "none",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {h.text || ((Array.isArray(h.attachments) && h.attachments.length > 0) ? "（ファイル添付）" : "")}
                    </div>
                  )}
                  <HandoverAttachmentsBlock attachments={h.attachments} compact />
                  {isEditingTarget && (
                    <div style={{marginTop:".5rem",padding:".65rem .75rem",background:"#111",border:"1px solid rgba(244,162,97,0.25)",borderRadius:5}}>
                      <div style={{fontSize:".62rem",color:"rgba(244,162,97,0.85)",marginBottom:".45rem",letterSpacing:".1em"}}>📅 表示日変更</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:".4rem",marginBottom:".5rem"}}>
                        {[
                          {k:"nextday",l:"明日"},
                          {k:"single",l:"日付指定"},
                          {k:"multi",l:"複数日"},
                          {k:"range",l:"期間"},
                        ].map(m => (
                          <button key={m.k} type="button" onClick={()=>setEditTargetMode(m.k)} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(editTargetMode===m.k?"#f4a261":"rgba(244,162,97,0.2)"),background:editTargetMode===m.k?"#f4a261":"transparent",color:editTargetMode===m.k?"#0a0a0a":"rgba(244,162,97,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{m.l}</button>
                        ))}
                      </div>
                      {editTargetMode === "nextday" && (
                        <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.6)"}}>
                          → 翌日（{fmtDate(shiftDate(selectedDate, 1))}）に表示
                        </div>
                      )}
                      {editTargetMode === "single" && (
                        <>
                          <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                            {editTargetDate ? `→ ${fmtDate(editTargetDate)} に表示` : "カレンダーから日付を選択"}
                          </div>
                          <MiniCalendar
                            selectedDates={editTargetDate ? [editTargetDate] : []}
                            onToggle={(d)=>setEditTargetDate(d===editTargetDate?"":d)}
                            mode="single"
                            fromDate={selectedDate}
                          />
                        </>
                      )}
                      {editTargetMode === "multi" && (
                        <>
                          <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                            {editTargetDates.length === 0 ? "カレンダーから複数の日付を選択" : `${editTargetDates.length}日間に表示`}
                          </div>
                          <MiniCalendar
                            selectedDates={editTargetDates}
                            onToggle={toggleEditMultiDate}
                            mode="multi"
                            fromDate={selectedDate}
                          />
                          {editTargetDates.length > 0 && (
                            <div style={{display:"flex",flexWrap:"wrap",gap:".3rem",marginTop:".4rem"}}>
                              {editTargetDates.map(d => (
                                <span key={d} style={{padding:".15rem .45rem",background:"rgba(244,162,97,0.13)",borderRadius:3,fontSize:".62rem",color:"#f4a261",display:"inline-flex",alignItems:"center",gap:".25rem"}}>
                                  {d.slice(5)}
                                  <button type="button" onClick={()=>toggleEditMultiDate(d)} style={{background:"transparent",border:"none",color:"#f4a261",cursor:"pointer",padding:0,fontSize:".62rem"}}>✕</button>
                                </span>
                              ))}
                              <button type="button" onClick={()=>setEditTargetDates([])} style={{...S.btn("sm"),padding:".1rem .4rem",fontSize:".55rem"}}>クリア</button>
                            </div>
                          )}
                        </>
                      )}
                      {editTargetMode === "range" && (
                        <>
                          <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                            {!editTargetRangeStart ? "開始日をタップ" : !editTargetRangeEnd ? "終了日をタップ" : (() => {
                              const s = new Date(editTargetRangeStart+"T00:00:00");
                              const e = new Date(editTargetRangeEnd+"T00:00:00");
                              return `${editTargetRangeStart} 〜 ${editTargetRangeEnd} （${Math.round((e-s)/86400000)+1}日間）`;
                            })()}
                          </div>
                          <MiniCalendar
                            selectedDates={[editTargetRangeStart, editTargetRangeEnd].filter(Boolean)}
                            onToggle={(d)=>{
                              if (!editTargetRangeStart || (editTargetRangeStart && editTargetRangeEnd)) {
                                setEditTargetRangeStart(d);
                                setEditTargetRangeEnd("");
                              } else {
                                if (d < editTargetRangeStart) {
                                  setEditTargetRangeEnd(editTargetRangeStart);
                                  setEditTargetRangeStart(d);
                                } else if (d === editTargetRangeStart) {
                                  setEditTargetRangeStart("");
                                } else {
                                  setEditTargetRangeEnd(d);
                                }
                              }
                            }}
                            mode="range"
                            rangeStart={editTargetRangeStart}
                            rangeEnd={editTargetRangeEnd}
                            fromDate={selectedDate}
                          />
                          {(editTargetRangeStart || editTargetRangeEnd) && (
                            <button type="button" onClick={()=>{setEditTargetRangeStart("");setEditTargetRangeEnd("");}} style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".58rem",marginTop:".4rem"}}>リセット</button>
                          )}
                        </>
                      )}
                      <div style={{display:"flex",gap:".35rem",marginTop:".5rem"}}>
                        <button type="button" style={{...S.btn("gold"),padding:".25rem .55rem",fontSize:".6rem"}} onClick={()=>saveEditTargetDates(h._id)} disabled={savingTargetDatesId===h._id}>
                          {savingTargetDatesId===h._id ? "保存中…" : "保存"}
                        </button>
                        <button type="button" style={{...S.btn("ghost"),padding:".25rem .55rem",fontSize:".6rem"}} onClick={cancelEditTargetDates} disabled={savingTargetDatesId===h._id}>キャンセル</button>
                      </div>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "baseline",
                      gap: ".12rem .22rem",
                      marginTop: ".14rem",
                      fontSize: "0.68rem",
                      lineHeight: 1.35,
                    }}
                  >
                    <span
                      style={{
                        flex: "1 1 120px",
                        minWidth: 0,
                        color: "rgba(240,232,208,0.30)",
                        letterSpacing: ".02em",
                        wordBreak: "break-word",
                      }}
                      title={metaLine}
                    >
                      {metaLine}
                    </span>
                    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: ".06rem", flexShrink: 0 }}>
                      <button type="button" className="ho-meta-act" onClick={()=>moveIncomingHandover(idx, -1)} disabled={sortingDisabled || idx === 0}>▲</button>
                      <button type="button" className="ho-meta-act" onClick={()=>moveIncomingHandover(idx, 1)} disabled={sortingDisabled || idx === sortedIncomingHandovers.length - 1}>▼</button>
                      {!isEditing && !isEditingTarget && (
                        <>
                          <button type="button" className="ho-meta-act" onClick={()=>startEditHandover(h)} disabled={!!editingTargetHandoverId}>編集</button>
                          <button type="button" className="ho-meta-act" onClick={()=>startEditTargetDates(h)} disabled={!!editingHandoverId}>表示日変更</button>
                        </>
                      )}
                      <button type="button" className="ho-meta-act ho-meta-act-del" onClick={()=>removeHandoverItem(h._id)}>✕</button>
                    </span>
                  </div>
                  </div>
                </div>
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
                {/* 撮影・喫煙の可否バッジ */}
                {(ev.photoOk && ev.photoOk !== "unset") || (ev.smokeOk && ev.smokeOk !== "unset") ? (
                  <div style={{display:"flex",gap:".4rem",marginTop:".5rem",flexWrap:"wrap"}}>
                    {ev.photoOk === "ok" && (
                      <span style={{padding:".2rem .55rem",borderRadius:3,background:"rgba(126,200,127,0.18)",border:"1px solid rgba(126,200,127,0.45)",color:"#7ec87e",fontSize:".68rem",fontWeight:600}}>📸 撮影 OK</span>
                    )}
                    {ev.photoOk === "ng" && (
                      <span style={{padding:".2rem .55rem",borderRadius:3,background:"rgba(226,75,74,0.18)",border:"1px solid rgba(226,75,74,0.5)",color:"#ff8a89",fontSize:".68rem",fontWeight:600}}>📸 撮影 NG</span>
                    )}
                    {ev.smokeOk === "ok" && (
                      <span style={{padding:".2rem .55rem",borderRadius:3,background:"rgba(126,200,127,0.18)",border:"1px solid rgba(126,200,127,0.45)",color:"#7ec87e",fontSize:".68rem",fontWeight:600}}>🚬 喫煙 OK</span>
                    )}
                    {ev.smokeOk === "ng" && (
                      <span style={{padding:".2rem .55rem",borderRadius:3,background:"rgba(226,75,74,0.18)",border:"1px solid rgba(226,75,74,0.5)",color:"#ff8a89",fontSize:".68rem",fontWeight:600}}>🚬 喫煙 NG</span>
                    )}
                  </div>
                ) : null}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:".3rem"}}>
                {onEditEvent && <button type="button" style={S.btn("sm")} onClick={()=>onEditEvent(ev._id)}>📝 編集</button>}
              </div>
            </div>
            {/* スタッフへの注意事項：目立たせて全文表示 */}
            {ev.notes && (
              <div style={{
                marginTop:".75rem",
                padding:"1rem 1.15rem",
                background:"linear-gradient(135deg,rgba(244,162,97,0.15),rgba(226,75,74,0.12))",
                border:"2px solid #f4a261",
                borderRadius:6,
                boxShadow:"0 2px 12px rgba(244,162,97,0.2)",
              }}>
                <div style={{
                  display:"flex",
                  alignItems:"center",
                  gap:".5rem",
                  marginBottom:".5rem",
                  fontSize:".82rem",
                  fontWeight:700,
                  color:"#f4a261",
                  letterSpacing:".08em",
                  textShadow:"0 0 8px rgba(244,162,97,0.5)",
                }}>
                  ⚠️ スタッフへの注意事項
                </div>
                <div style={{
                  fontSize:".88rem",
                  color:"#ffe5c7",
                  lineHeight:1.75,
                  whiteSpace:"pre-wrap",
                  wordBreak:"break-word",
                }}>
                  {ev.notes}
                </div>
              </div>
            )}
            {/* イベント画像（複数枚・横スクロール） */}
            {Array.isArray(ev.images) && ev.images.length > 0 && (
              <div style={{marginTop:".75rem"}}>
                <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.7)",letterSpacing:".1em",marginBottom:".4rem"}}>📷 関連画像</div>
                <div style={{display:"flex",gap:".5rem",overflowX:"auto",padding:".25rem 0"}}>
                  {ev.images.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noreferrer" style={{flexShrink:0,display:"block",borderRadius:5,overflow:"hidden",border:"1px solid rgba(201,168,76,0.2)"}}>
                      <img src={url} alt={`画像${idx+1}`} style={{height:160,display:"block"}}/>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* 本日の予約（サマリのみ。詳細は予約管理画面で） */}
      {(() => {
        const todayReservations = reservations.filter(r => r.date === selectedDate);
        const totalPeople = todayReservations.reduce((s,r)=>s+Number(r.people||0),0);
        const arrivedCount = todayReservations.filter(r=>r.arrived).length;
        const arrivedPeople = todayReservations.filter(r=>r.arrived).reduce((s,r)=>s+Number(r.people||0),0);
        const noteCount = todayReservations.filter(r=>r.note && r.note.trim()).length;
        const isEmpty = todayReservations.length === 0;
        return (
          <>
            <div style={S.secTitle}>📞 本日の予約</div>
            <div style={{...S.card,padding:"1rem 1.1rem"}}>
              {isEmpty ? (
                <div style={{textAlign:"center",padding:".25rem 0",fontSize:".82rem",color:"rgba(240,232,208,0.45)"}}>まだ予約はありません</div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:".5rem"}}>
                  <div style={{padding:".6rem .75rem",background:"#0a0a0a",borderRadius:5,border:"1px solid rgba(201,168,76,0.15)",textAlign:"center"}}>
                    <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",letterSpacing:".1em",marginBottom:".2rem"}}>予約組数</div>
                    <div style={{fontSize:"1.4rem",fontWeight:700,color:"#c9a84c",fontFamily:"Georgia,serif"}}>{todayReservations.length}<span style={{fontSize:".7rem",color:"rgba(201,168,76,0.6)",marginLeft:".2rem"}}>組</span></div>
                  </div>
                  <div style={{padding:".6rem .75rem",background:"#0a0a0a",borderRadius:5,border:"1px solid rgba(201,168,76,0.15)",textAlign:"center"}}>
                    <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",letterSpacing:".1em",marginBottom:".2rem"}}>総人数</div>
                    <div style={{fontSize:"1.4rem",fontWeight:700,color:"#c9a84c",fontFamily:"Georgia,serif"}}>{totalPeople}<span style={{fontSize:".7rem",color:"rgba(201,168,76,0.6)",marginLeft:".2rem"}}>名</span></div>
                  </div>
                  <div style={{padding:".6rem .75rem",background:"#0a0a0a",borderRadius:5,border:"1px solid rgba(126,200,127,0.2)",textAlign:"center"}}>
                    <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",letterSpacing:".1em",marginBottom:".2rem"}}>来店済</div>
                    <div style={{fontSize:"1.4rem",fontWeight:700,color:"#7ec87e",fontFamily:"Georgia,serif"}}>{arrivedCount}<span style={{fontSize:".7rem",color:"rgba(126,200,127,0.6)",marginLeft:".2rem"}}>/{todayReservations.length}組</span></div>
                    <div style={{fontSize:".62rem",color:"rgba(126,200,127,0.55)",marginTop:".1rem"}}>{arrivedPeople}名 ご来店</div>
                  </div>
                  {noteCount > 0 && (
                    <div style={{padding:".6rem .75rem",background:"#0a0a0a",borderRadius:5,border:"1px solid rgba(244,162,97,0.25)",textAlign:"center"}}>
                      <div style={{fontSize:".62rem",color:"rgba(244,162,97,0.7)",letterSpacing:".1em",marginBottom:".2rem"}}>備考あり</div>
                      <div style={{fontSize:"1.4rem",fontWeight:700,color:"#f4a261",fontFamily:"Georgia,serif"}}>{noteCount}<span style={{fontSize:".7rem",color:"rgba(244,162,97,0.6)",marginLeft:".2rem"}}>件</span></div>
                    </div>
                  )}
                </div>
              )}
              {onGoReservations && (
                <button type="button" style={{...S.btn("ghost"),width:"100%",marginTop:".75rem",fontSize:".72rem"}} onClick={()=>onGoReservations(selectedDate)}>
                  📞 予約管理画面で詳細を確認・編集{isEmpty?"・電話予約追加":""}
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* 本日の出勤者 */}
      {(() => {
        const todayShifts = getShiftForDate(shifts, selectedDate);
        if (todayShifts.length === 0) return null;
        const workers = todayShifts.filter(s => !s.isPerformer);
        const performers = todayShifts.filter(s => s.isPerformer);
        return (
          <>
            <div style={S.secTitle}>👥 本日の出勤者{workers.length>0?`（${workers.length}名）`:""}</div>
            <div style={{...S.card,padding:"1rem 1.1rem"}}>
              {workers.length === 0 && performers.length === 0 ? (
                <div style={{fontSize:".8rem",color:"rgba(240,232,208,0.4)"}}>出勤者の登録がありません</div>
              ) : (
                <>
                  {workers.length > 0 && (
                    <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                      {workers.map((w, i) => {
                        const color = getRoleColor(w.role);
                        const isMng = isManager(w.name);
                        return (
                          <div key={i} style={{display:"flex",alignItems:"center",gap:".55rem",flexWrap:"wrap"}}>
                            <span style={{fontSize:".88rem",color:"#f0e8d0",minWidth:90}}>{w.name}</span>
                            {!isMng && w.time && (
                              <span style={{fontSize:".75rem",color:"rgba(240,232,208,0.7)"}}>{w.time}〜</span>
                            )}
                            <span style={{padding:".15rem .5rem",borderRadius:3,background:color+"22",color:color,border:`1px solid ${color}55`,fontSize:".62rem",letterSpacing:".05em",fontWeight:600}}>
                              {getRoleLabel(w.role)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {performers.length > 0 && (
                    <div style={{marginTop: workers.length>0 ? ".75rem" : 0, paddingTop: workers.length>0 ? ".5rem" : 0, borderTop: workers.length>0 ? "1px dashed rgba(201,168,76,0.15)" : "none"}}>
                      <div style={{fontSize:".62rem",color:"rgba(181,140,209,0.7)",marginBottom:".3rem",letterSpacing:".1em"}}>🎤 出演として参加</div>
                      <div style={{display:"flex",gap:".4rem",flexWrap:"wrap"}}>
                        {performers.map((p,i) => (
                          <span key={i} style={{padding:".15rem .55rem",borderRadius:3,background:"rgba(181,140,209,0.13)",color:"#b58cd1",border:"1px solid rgba(181,140,209,0.3)",fontSize:".7rem"}}>
                            {p.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* スタッフ向け注意事項 */}
      <div style={S.secTitle}>📝 スタッフ向け注意事項</div>
      <textarea
        style={{...S.inp,resize:"none",lineHeight:1.6,minHeight:80,overflow:"hidden"}}
        value={dayData.staffNote || ""}
        ref={(el)=>{
          // マウント時・再描画時にも高さを内容にフィット
          if(el){ el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }
        }}
        onChange={e=>{
          // 入力に応じて自動で高さ調整
          e.target.style.height="auto";
          e.target.style.height=e.target.scrollHeight+"px";
          setDayData({...dayData, staffNote: e.target.value});
          updateField("staffNote", e.target.value);
        }}
        placeholder="例：佐藤様アレルギー対応 / VIP予約 / 急なシフト変更 など"
      />

      {/* 業務チェックリスト */}
      <div style={S.secTitle}>✅ 業務チェックリスト</div>
      {checklistTemplate.map((cat) => {
        const key = cat.key;
        const isCheckedAt = (idx) => {
          const item = cat.items[idx];
          return getCheckValue(checklistModeKey, key, item.id, idx);
        };
        const total = cat.items.length;
        let done = 0;
        for (let i = 0; i < total; i++) if (isCheckedAt(i)) done++;
        const pct = Math.round((done/total)*100);
        const isExpanded = expandedSection === key;
        return (
          <div key={key} style={{marginBottom:".5rem",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,overflow:"hidden"}}>
            <button
              type="button"
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
                  const checked = isCheckedAt(idx);
                  return (
                    <label key={idx} style={{display:"flex",alignItems:"center",gap:".75rem",padding:".7rem .8rem",cursor:"pointer",borderRadius:4,marginBottom:".15rem",background:checked?"rgba(126,200,127,0.05)":"transparent"}}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={()=>toggleCheck(checklistModeKey, key, item.id, idx)}
                        style={{accentColor:"#7ec87e",width:20,height:20,flexShrink:0}}
                      />
                      <span style={{fontSize:".88rem",color:checked?"rgba(126,200,127,0.7)":"rgba(240,232,208,0.85)",textDecoration:checked?"line-through":"none"}}>{item.label}</span>
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
            → 翌日（{fmtDate(shiftDate(selectedDate, 1))}）に表示
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
      <div style={{marginBottom:".5rem"}}>
        <div style={{display:"flex",gap:".4rem",marginBottom:".35rem"}}>
          <textarea
            style={{...S.inp,resize:"vertical",lineHeight:1.6,minHeight:60,flex:1}}
            value={newHandoverNote}
            onChange={e=>setNewHandoverNote(e.target.value)}
            onKeyDown={e=>{
              if (e.key !== "Enter") return;
              if (e.nativeEvent?.isComposing || e.isComposing) return;
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                addHandoverNote();
              }
            }}
            placeholder="自由記述で送る（共有事項・特記など）"
          />
          <button style={{...S.btn("gold"),alignSelf:"flex-end"}} onClick={addHandoverNote} disabled={handoverUploading}>
            {handoverUploading ? "アップロード中…" : "送信"}
          </button>
        </div>
        <input
          ref={handoverNoteFileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={e => setPendingNoteFileCount(e.target.files?.length || 0)}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: ".45rem", fontSize: ".62rem", color: "rgba(240,232,208,0.55)" }}>
          <button type="button" style={{ ...S.btn("sm"), padding: ".25rem .55rem" }} onClick={() => handoverNoteFileRef.current?.click()} disabled={handoverUploading}>
            写真・PDFを添付
          </button>
          {pendingNoteFileCount > 0 && <span>{pendingNoteFileCount}件選択中</span>}
          {handoverUploading && <span style={{ color: "#f4a261" }}>アップロード中…</span>}
        </div>
      </div>

      {/* 個別チェック項目 */}
      <div style={{marginBottom:".75rem"}}>
        <div style={{display:"flex",gap:".4rem",marginBottom:".35rem"}}>
          <input
            style={{...S.inp,flex:1}}
            value={newHandoverItem}
            onChange={e=>setNewHandoverItem(e.target.value)}
            onKeyDown={e=>{
              if (e.key !== "Enter") return;
              if (e.nativeEvent?.isComposing || e.isComposing) return;
              e.preventDefault();
              addHandoverItem();
            }}
            placeholder="チェック項目で送る（例：ケーキ用意 / 冷蔵庫確認）"
          />
          <button style={S.btn("gold")} onClick={addHandoverItem} disabled={handoverUploading}>
            {handoverUploading ? "アップロード中…" : "送信"}
          </button>
        </div>
        <input
          ref={handoverItemFileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          style={{ display: "none" }}
          onChange={e => setPendingItemFileCount(e.target.files?.length || 0)}
        />
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: ".45rem", fontSize: ".62rem", color: "rgba(240,232,208,0.55)" }}>
          <button type="button" style={{ ...S.btn("sm"), padding: ".25rem .55rem" }} onClick={() => handoverItemFileRef.current?.click()} disabled={handoverUploading}>
            写真・PDFを添付
          </button>
          {pendingItemFileCount > 0 && <span>{pendingItemFileCount}件選択中</span>}
          {handoverUploading && <span style={{ color: "#f4a261" }}>アップロード中…</span>}
        </div>
      </div>

      {/* 自分が今日送った申し送り */}
      {outgoingHandovers.length > 0 && (
        <div style={{marginBottom:".85rem"}}>
          <div style={{fontSize:".58rem",color:"rgba(201,168,76,0.48)",marginBottom:".32rem",letterSpacing:".1em"}}>📤 本日送信した申し送り（{outgoingHandovers.length}件）</div>
          {outgoingHandovers.map(h => {
            const isEditing = editingHandoverId === h._id;
            const isEditingTarget = editingTargetHandoverId === h._id;
            const updatedLabel = getHandoverUpdatedLabel(h);
            const outgoingMeta = `→ ${(h.targetDates||[]).length === 1 ? (h.targetDates||[])[0] : `${(h.targetDates||[]).length}日に送信`}${updatedLabel ? ` · ${updatedLabel}` : ""}`;
            return (
            <div key={h._id} style={{padding:".32rem .42rem",marginBottom:".18rem",background:"#0c0c0c",border:"1px solid rgba(201,168,76,0.1)",borderRadius:4,display:"flex",alignItems:"flex-start",gap:".38rem"}}>
              <span style={{fontSize:".52rem",padding:".12rem .34rem",borderRadius:2,background:h.type==="item"?"rgba(126,200,127,0.13)":"rgba(126,200,227,0.13)",color:h.type==="item"?"#7ec87e":"#7ec8e3",letterSpacing:".05em",flexShrink:0,marginTop:1}}>
                {h.type === "item" ? "☑" : "📝"}
              </span>
              <div style={{flex:1,minWidth:0}}>
                {isEditing ? (
                  <div style={{marginBottom:".28rem"}}>
                    <textarea
                      value={editingHandoverText}
                      onChange={e=>setEditingHandoverText(e.target.value)}
                      style={{...S.inp,resize:"vertical",lineHeight:1.5,minHeight:72,fontSize:".76rem"}}
                    />
                    <div style={{display:"flex",gap:".35rem",marginTop:".32rem"}}>
                      <button type="button" style={{...S.btn("gold"),padding:".28rem .55rem",fontSize:".6rem"}} onClick={()=>saveEditHandover(h._id)} disabled={savingHandoverEditId===h._id}>
                        {savingHandoverEditId===h._id ? "保存中…" : "保存"}
                      </button>
                      <button type="button" style={{...S.btn("ghost"),padding:".28rem .55rem",fontSize:".6rem"}} onClick={cancelEditHandover} disabled={savingHandoverEditId===h._id}>キャンセル</button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      fontSize: ".76rem",
                      color: "rgba(240,232,208,0.78)",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {h.text || ((Array.isArray(h.attachments) && h.attachments.length > 0) ? "（ファイル添付）" : "")}
                  </div>
                )}
                <HandoverAttachmentsBlock attachments={h.attachments} compact />
                {isEditingTarget && (
                  <div style={{marginTop:".5rem",padding:".65rem .75rem",background:"#111",border:"1px solid rgba(244,162,97,0.25)",borderRadius:5}}>
                    <div style={{fontSize:".62rem",color:"rgba(244,162,97,0.85)",marginBottom:".45rem",letterSpacing:".1em"}}>📅 表示日変更</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:".4rem",marginBottom:".5rem"}}>
                      {[
                        {k:"nextday",l:"明日"},
                        {k:"single",l:"日付指定"},
                        {k:"multi",l:"複数日"},
                        {k:"range",l:"期間"},
                      ].map(m => (
                        <button key={m.k} type="button" onClick={()=>setEditTargetMode(m.k)} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(editTargetMode===m.k?"#f4a261":"rgba(244,162,97,0.2)"),background:editTargetMode===m.k?"#f4a261":"transparent",color:editTargetMode===m.k?"#0a0a0a":"rgba(244,162,97,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{m.l}</button>
                      ))}
                    </div>
                    {editTargetMode === "nextday" && (
                      <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.6)"}}>
                        → 翌日（{fmtDate(shiftDate(selectedDate, 1))}）に表示
                      </div>
                    )}
                    {editTargetMode === "single" && (
                      <>
                        <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                          {editTargetDate ? `→ ${fmtDate(editTargetDate)} に表示` : "カレンダーから日付を選択"}
                        </div>
                        <MiniCalendar
                          selectedDates={editTargetDate ? [editTargetDate] : []}
                          onToggle={(d)=>setEditTargetDate(d===editTargetDate?"":d)}
                          mode="single"
                          fromDate={selectedDate}
                        />
                      </>
                    )}
                    {editTargetMode === "multi" && (
                      <>
                        <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                          {editTargetDates.length === 0 ? "カレンダーから複数の日付を選択" : `${editTargetDates.length}日間に表示`}
                        </div>
                        <MiniCalendar
                          selectedDates={editTargetDates}
                          onToggle={toggleEditMultiDate}
                          mode="multi"
                          fromDate={selectedDate}
                        />
                        {editTargetDates.length > 0 && (
                          <div style={{display:"flex",flexWrap:"wrap",gap:".3rem",marginTop:".4rem"}}>
                            {editTargetDates.map(d => (
                              <span key={d} style={{padding:".15rem .45rem",background:"rgba(244,162,97,0.13)",borderRadius:3,fontSize:".62rem",color:"#f4a261",display:"inline-flex",alignItems:"center",gap:".25rem"}}>
                                {d.slice(5)}
                                <button type="button" onClick={()=>toggleEditMultiDate(d)} style={{background:"transparent",border:"none",color:"#f4a261",cursor:"pointer",padding:0,fontSize:".62rem"}}>✕</button>
                              </span>
                            ))}
                            <button type="button" onClick={()=>setEditTargetDates([])} style={{...S.btn("sm"),padding:".1rem .4rem",fontSize:".55rem"}}>クリア</button>
                          </div>
                        )}
                      </>
                    )}
                    {editTargetMode === "range" && (
                      <>
                        <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)",marginBottom:".25rem"}}>
                          {!editTargetRangeStart ? "開始日をタップ" : !editTargetRangeEnd ? "終了日をタップ" : (() => {
                            const s = new Date(editTargetRangeStart+"T00:00:00");
                            const e = new Date(editTargetRangeEnd+"T00:00:00");
                            return `${editTargetRangeStart} 〜 ${editTargetRangeEnd} （${Math.round((e-s)/86400000)+1}日間）`;
                          })()}
                        </div>
                        <MiniCalendar
                          selectedDates={[editTargetRangeStart, editTargetRangeEnd].filter(Boolean)}
                          onToggle={(d)=>{
                            if (!editTargetRangeStart || (editTargetRangeStart && editTargetRangeEnd)) {
                              setEditTargetRangeStart(d);
                              setEditTargetRangeEnd("");
                            } else {
                              if (d < editTargetRangeStart) {
                                setEditTargetRangeEnd(editTargetRangeStart);
                                setEditTargetRangeStart(d);
                              } else if (d === editTargetRangeStart) {
                                setEditTargetRangeStart("");
                              } else {
                                setEditTargetRangeEnd(d);
                              }
                            }
                          }}
                          mode="range"
                          rangeStart={editTargetRangeStart}
                          rangeEnd={editTargetRangeEnd}
                          fromDate={selectedDate}
                        />
                        {(editTargetRangeStart || editTargetRangeEnd) && (
                          <button type="button" onClick={()=>{setEditTargetRangeStart("");setEditTargetRangeEnd("");}} style={{...S.btn("sm"),padding:".15rem .5rem",fontSize:".58rem",marginTop:".4rem"}}>リセット</button>
                        )}
                      </>
                    )}
                    <div style={{display:"flex",gap:".35rem",marginTop:".5rem"}}>
                      <button type="button" style={{...S.btn("gold"),padding:".25rem .55rem",fontSize:".6rem"}} onClick={()=>saveEditTargetDates(h._id)} disabled={savingTargetDatesId===h._id}>
                        {savingTargetDatesId===h._id ? "保存中…" : "保存"}
                      </button>
                      <button type="button" style={{...S.btn("ghost"),padding:".25rem .55rem",fontSize:".6rem"}} onClick={cancelEditTargetDates} disabled={savingTargetDatesId===h._id}>キャンセル</button>
                    </div>
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                    gap: ".12rem .22rem",
                    marginTop: ".14rem",
                    fontSize: "0.68rem",
                    lineHeight: 1.35,
                  }}
                >
                  <span
                    style={{
                      flex: "1 1 120px",
                      minWidth: 0,
                      color: "rgba(240,232,208,0.30)",
                      letterSpacing: ".02em",
                      wordBreak: "break-word",
                    }}
                    title={outgoingMeta}
                  >
                    {outgoingMeta}
                  </span>
                  <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: ".06rem", flexShrink: 0 }}>
                    {!isEditing && !isEditingTarget && (
                      <>
                        <button type="button" className="ho-meta-act" onClick={()=>startEditHandover(h)} disabled={!!editingTargetHandoverId}>編集</button>
                        <button type="button" className="ho-meta-act" onClick={()=>startEditTargetDates(h)} disabled={!!editingHandoverId}>表示日変更</button>
                      </>
                    )}
                    <button type="button" className="ho-meta-act ho-meta-act-del" onClick={()=>removeHandoverItem(h._id)}>✕</button>
                  </span>
                </div>
              </div>
            </div>
          );})}
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
                    <div key={h._id} style={{paddingLeft:".5rem",marginBottom:".55rem"}}>
                      <div style={{fontSize:".75rem",color:h.done?"rgba(126,200,127,0.5)":"rgba(240,232,208,0.7)",textDecoration:h.done&&h.type==="item"?"line-through":"none"}}>
                        {h.type === "item" ? (h.done?"✓":"☐") : "📝"}{" "}
                        {h.text || ((Array.isArray(h.attachments) && h.attachments.length > 0) ? "（ファイル添付）" : "")}
                        <span style={{fontSize:".58rem",color:"rgba(240,232,208,0.35)",marginLeft:".5rem"}}>→ {(h.targetDates||[]).length}日</span>
                        {getHandoverUpdatedLabel(h) && <span style={{fontSize:".58rem",color:"rgba(240,232,208,0.35)",marginLeft:".5rem"}}>{getHandoverUpdatedLabel(h)}</span>}
                      </div>
                      <HandoverAttachmentsBlock attachments={h.attachments} />
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

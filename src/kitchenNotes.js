import { useState, useEffect } from "react";
import { db, storage } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function sanitizeFileName(name) {
  const base = String(name || "image").replace(/[/\\?%*:|"<>]/g, "_").replace(/^\.+/, "").trim();
  return (base || "image").slice(0, 120);
}

export const KITCHEN_NOTE_CATEGORIES = [
  { key: "prep", label: "仕込みメモ" },
  { key: "stock", label: "欠品・残りわずか" },
  { key: "event_prep", label: "イベント／貸切準備" },
  { key: "notice", label: "連絡・注意事項" },
];

export function kitchenCategoryLabel(key) {
  return KITCHEN_NOTE_CATEGORIES.find(c => c.key === key)?.label || key;
}

/** 一覧カードのカテゴリ色分け（Firestore は変更しない） */
const CATEGORY_VISUAL = {
  prep: {
    accent: "#5aa9ff",
    rowBg: "rgba(90, 169, 255, 0.07)",
    rowBgImportant: "linear-gradient(180deg, rgba(244,162,97,0.1), rgba(90, 169, 255, 0.07))",
    border: "rgba(90, 169, 255, 0.32)",
    badgeBg: "rgba(90, 169, 255, 0.22)",
    badgeColor: "#a8d4ff",
  },
  stock: {
    accent: "#e76f51",
    rowBg: "rgba(231, 111, 81, 0.08)",
    rowBgImportant: "linear-gradient(180deg, rgba(244,162,97,0.11), rgba(231, 111, 81, 0.08))",
    border: "rgba(231, 111, 81, 0.38)",
    badgeBg: "rgba(231, 111, 81, 0.22)",
    badgeColor: "#ffc9b5",
  },
  event_prep: {
    accent: "#9b7ed9",
    rowBg: "rgba(155, 126, 217, 0.09)",
    rowBgImportant: "linear-gradient(180deg, rgba(244,162,97,0.1), rgba(155, 126, 217, 0.09))",
    border: "rgba(155, 126, 217, 0.38)",
    badgeBg: "rgba(155, 126, 217, 0.24)",
    badgeColor: "#dcc9fa",
  },
  notice: {
    accent: "#c9a84c",
    rowBg: "rgba(201, 168, 76, 0.1)",
    rowBgImportant: "linear-gradient(180deg, rgba(244,162,97,0.1), rgba(201, 168, 76, 0.1))",
    border: "rgba(201, 168, 76, 0.38)",
    badgeBg: "rgba(201, 168, 76, 0.22)",
    badgeColor: "#edd89a",
  },
  _default: {
    accent: "#7ec8b8",
    rowBg: "rgba(126, 200, 184, 0.06)",
    rowBgImportant: "linear-gradient(180deg, rgba(244,162,97,0.1), rgba(126, 200, 184, 0.06))",
    border: "rgba(126, 200, 184, 0.28)",
    badgeBg: "rgba(126, 200, 184, 0.18)",
    badgeColor: "#b8ebe0",
  },
};

function getCategoryVisual(categoryKey) {
  const k = String(categoryKey || "").trim();
  return CATEGORY_VISUAL[k] || CATEGORY_VISUAL._default;
}

/** 旧データ：targetDates が無ければ date を 1 日表示とみなす */
export function getResolvedTargetDates(n) {
  if (Array.isArray(n.targetDates) && n.targetDates.length > 0) return n.targetDates;
  if (n.date) return [n.date];
  return [];
}

function getNoteText(n) {
  const t = n.text;
  if (t != null && String(t).trim() !== "") return String(t);
  return String(n.body || "");
}

function getNoteType(n) {
  if (n.type === "note" || n.type === "item") return n.type;
  return "item";
}

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

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** today.js の申し送りと同型（厨房共有の送り先ピッカー用） */
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
    <div style={{background:"#0a0a0a",border:"1px solid rgba(126,200,127,0.22)",borderRadius:5,padding:".6rem",marginTop:".4rem"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".5rem"}}>
        <button type="button" onClick={prev} style={{padding:".2rem .55rem",background:"transparent",border:"1px solid rgba(126,200,127,0.35)",borderRadius:3,color:"#7ec8b8",cursor:"pointer",fontSize:".65rem"}}>◀</button>
        <span style={{fontFamily:"Georgia,serif",fontSize:".82rem",color:"#7ec8b8",letterSpacing:".05em"}}>{calYear}年{calMonth+1}月</span>
        <button type="button" onClick={next} style={{padding:".2rem .55rem",background:"transparent",border:"1px solid rgba(126,200,127,0.35)",borderRadius:3,color:"#7ec8b8",cursor:"pointer",fontSize:".65rem"}}>▶</button>
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
          const isTodayCell = dateStr === todayStr;
          const isRangeBetween = isInRange(dateStr);
          const isPast = fromDate && dateStr < fromDate;
          const dow = (firstDay + day - 1) % 7;
          let bg = "transparent";
          if (isSelected) bg = "#7ec8b8";
          else if (isRangeBetween) bg = "rgba(126,200,127,0.22)";
          else if (isTodayCell) bg = "rgba(126,200,127,0.12)";
          return (
            <button
              key={idx}
              type="button"
              onClick={()=>!isPast && onToggle(dateStr)}
              disabled={isPast}
              style={{
                padding:".35rem 0",fontSize:".68rem",
                background: bg,
                border: isTodayCell && !isSelected ? "1px solid rgba(126,200,127,0.45)" : "1px solid transparent",
                borderRadius:3,
                color: isSelected ? "#0a0a0a" : isPast ? "rgba(240,232,208,0.2)" : isRangeBetween ? "#b8f0e0" : (dow===0?"#e24b4a":dow===6?"#7ec8e3":"#f0e8d0"),
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

export default function KitchenNotesModule() {
  const today = (() => {
    const d = new Date();
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  })();
  const [selectedDate, setSelectedDate] = useState(today);
  const [allKitchenNotes, setAllKitchenNotes] = useState([]);
  const [kitchenSendMode, setKitchenSendMode] = useState("nextday");
  const [kitchenSendDate, setKitchenSendDate] = useState("");
  const [kitchenSendDates, setKitchenSendDates] = useState([]);
  const [kitchenRangeStart, setKitchenRangeStart] = useState("");
  const [kitchenRangeEnd, setKitchenRangeEnd] = useState("");
  const [newKitchenCategory, setNewKitchenCategory] = useState("prep");
  const [newKitchenAuthor, setNewKitchenAuthor] = useState("");
  const [newKitchenImportant, setNewKitchenImportant] = useState(false);
  const [newKitchenNote, setNewKitchenNote] = useState("");
  const [newKitchenItem, setNewKitchenItem] = useState("");
  const [uploadingNoteId, setUploadingNoteId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "kitchenNotes"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllKitchenNotes(list);
    });
    return () => unsub();
  }, []);

  const computeTargetDates = () => {
    if (kitchenSendMode === "nextday") {
      return [shiftDate(selectedDate, 1)];
    }
    if (kitchenSendMode === "single") {
      if (!kitchenSendDate) return [];
      return [kitchenSendDate];
    }
    if (kitchenSendMode === "multi") {
      return [...kitchenSendDates];
    }
    if (kitchenSendMode === "range") {
      if (!kitchenRangeStart || !kitchenRangeEnd) return [];
      if (kitchenRangeEnd < kitchenRangeStart) {
        alert("終了日が開始日より前になっています");
        return null;
      }
      const dates = [];
      let cur = kitchenRangeStart;
      while (cur <= kitchenRangeEnd) {
        dates.push(cur);
        cur = shiftDate(cur, 1);
      }
      return dates;
    }
    return [];
  };

  const toggleKitchenMultiDate = (date) => {
    if (kitchenSendDates.includes(date)) {
      setKitchenSendDates(kitchenSendDates.filter(d => d !== date));
    } else {
      setKitchenSendDates([...kitchenSendDates, date].sort());
    }
  };

  const saveKitchenEntry = async (type, text) => {
    const targetDates = computeTargetDates();
    if (targetDates === null) return;
    if (targetDates.length === 0) {
      alert("送り先の日付を指定してください");
      return;
    }
    const id = `kn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    const base = {
      type,
      text: text.trim(),
      sourceDate: selectedDate,
      targetDates,
      category: newKitchenCategory,
      author: (newKitchenAuthor || "").trim(),
      important: !!newKitchenImportant,
      createdAt: now,
      updatedAt: now,
    };
    if (type === "item") {
      base.done = false;
    }
    await setDoc(doc(db, "kitchenNotes", id), base);
  };

  const addKitchenNoteFree = async () => {
    if (!newKitchenNote.trim()) return;
    await saveKitchenEntry("note", newKitchenNote);
    setNewKitchenNote("");
  };

  const addKitchenItemCheck = async () => {
    if (!newKitchenItem.trim()) return;
    await saveKitchenEntry("item", newKitchenItem);
    setNewKitchenItem("");
  };

  const patchKitchenNote = async (id, patch) => {
    await setDoc(doc(db, "kitchenNotes", id), { ...patch, updatedAt: Date.now() }, { merge: true });
  };

  const uploadPhotosForNote = async (noteId, fileList) => {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    const note = allKitchenNotes.find(x => x._id === noteId);
    if (!note) return;
    const toUpload = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        alert(`画像以外はアップロードできません: ${file.name}`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        alert(`1枚あたり5MBまでです（${file.name}）`);
        continue;
      }
      toUpload.push(file);
    }
    if (toUpload.length === 0) return;
    setUploadingNoteId(noteId);
    try {
      const next = Array.isArray(note.attachments) ? [...note.attachments] : [];
      for (const file of toUpload) {
        const safe = sanitizeFileName(file.name);
        const uniqueSafe = `${Math.random().toString(36).slice(2, 9)}_${safe}`;
        const storagePath = `kitchenNotes/${noteId}/${Date.now()}_${uniqueSafe}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        next.push({
          storagePath,
          downloadURL,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploadedAt: Date.now(),
        });
      }
      await setDoc(doc(db, "kitchenNotes", noteId), { attachments: next, updatedAt: Date.now() }, { merge: true });
    } catch (e) {
      alert("アップロードに失敗しました: " + (e.message || String(e)));
    } finally {
      setUploadingNoteId(null);
    }
  };

  const removeAttachment = async (noteId, index) => {
    const note = allKitchenNotes.find(x => x._id === noteId);
    if (!note || !Array.isArray(note.attachments)) return;
    const list = [...note.attachments];
    if (index < 0 || index >= list.length) return;
    const att = list[index];
    if (!window.confirm("この写真を削除しますか？")) return;
    try {
      if (att.storagePath) {
        await deleteObject(ref(storage, att.storagePath));
      }
    } catch (e) {
      console.warn("Storage delete:", e);
    }
    list.splice(index, 1);
    await setDoc(doc(db, "kitchenNotes", noteId), { attachments: list, updatedAt: Date.now() }, { merge: true });
  };

  const removeKitchenNote = async (id) => {
    if (!window.confirm("この厨房共有を削除しますか？")) return;
    const note = allKitchenNotes.find(x => x._id === id);
    if (note?.attachments?.length) {
      for (const a of note.attachments) {
        try {
          if (a.storagePath) await deleteObject(ref(storage, a.storagePath));
        } catch (e) {
          console.warn("Storage delete:", e);
        }
      }
    }
    await deleteDoc(doc(db, "kitchenNotes", id));
  };

  const prevDay = () => {
    setSelectedDate(prev => shiftDate(prev, -1));
  };
  const nextDay = () => {
    setSelectedDate(prev => shiftDate(prev, +1));
  };
  const goToday = () => setSelectedDate(today);
  const isToday = selectedDate === today;

  const incomingKitchenNotes = allKitchenNotes
    .filter(n => getResolvedTargetDates(n).includes(selectedDate))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  return (
    <div style={{ padding:"1rem .85rem", maxWidth:720, margin:"0 auto" }} className="hb-view">
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".5rem", marginBottom:"1rem", flexWrap:"wrap" }}>
        <h1 style={{ fontFamily:"Georgia,serif", fontSize:"1.05rem", color:"rgba(126,200,127,0.95)", letterSpacing:".12em", margin:0 }}>🍳 厨房共有</h1>
      </div>

      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:".5rem", marginBottom:"1rem", flexWrap:"wrap" }}>
        <button type="button" onClick={prevDay} style={{ ...S.btn("sm"), padding:".4rem .7rem" }}>◀</button>
        <div style={{ flex:1, textAlign:"center", minWidth:200 }}>
          <input
            type="date"
            value={selectedDate}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            style={{ ...S.inp, fontFamily:"Georgia,serif", fontSize:"1rem", color:"#c9a84c", letterSpacing:".05em", textAlign:"center", cursor:"pointer", padding:".4rem .65rem", width:"auto", minWidth:160, display:"inline-block" }}
          />
          <div style={{ fontSize:".68rem", color:"rgba(240,232,208,0.55)", marginTop:".2rem" }}>
            {fmtDate(selectedDate)}
            <span style={{ marginLeft:".5rem", color:"rgba(240,232,208,0.4)" }}>
              {isToday ? "（本日）" : selectedDate < today ? "（過去）" : "（未来）"}
            </span>
            {!isToday && <button type="button" style={{ ...S.btn("sm"), padding:".15rem .5rem", fontSize:".55rem", marginLeft:".5rem" }} onClick={goToday}>今日へ</button>}
          </div>
        </div>
        <button type="button" onClick={nextDay} style={{ ...S.btn("sm"), padding:".4rem .7rem" }}>▶</button>
      </div>

      <div style={{ marginBottom:"1.25rem" }}>
        <div style={{ ...S.secTitle, borderBottomColor:"rgba(126,200,127,0.25)", color:"rgba(126,200,127,0.95)" }}>
          {fmtDate(selectedDate)} に届く共有
        </div>
        <div style={{ ...S.card, padding:"1rem 1.1rem", borderColor:"rgba(126,200,127,0.18)", background:"linear-gradient(180deg,rgba(126,200,127,0.06),#111)" }}>
          <div style={{ fontSize:".62rem", color:"rgba(126,200,127,0.65)", marginBottom:".65rem", letterSpacing:".08em" }}>
            送り先にこの日が含まれたメモだけ表示します（閲覧日を変えると一覧が変わります）
          </div>
          {incomingKitchenNotes.length === 0 ? (
            <div style={{ textAlign:"center", padding:".85rem", color:"rgba(240,232,208,0.35)", fontSize:".78rem" }}>
              この日に届く厨房共有はありません
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:".5rem" }}>
              {incomingKitchenNotes.map(n => {
                const nt = getNoteType(n);
                const cv = getCategoryVisual(n.category);
                const bodyText = getNoteText(n);
                const fromLabel = n.sourceDate === selectedDate
                  ? "本日投稿"
                  : `${fmtDate(n.sourceDate || "").replace(/^\d+年/, "")} 投稿`;
                const rowBackground = n.important ? cv.rowBgImportant : cv.rowBg;
                const rowBorder = n.important ? "rgba(244,162,97,0.42)" : cv.border;
                return (
                  <div
                    key={n._id}
                    style={{
                      padding:".65rem .75rem",
                      paddingLeft:".7rem",
                      background: rowBackground,
                      border:`1px solid ${rowBorder}`,
                      borderLeft:`4px solid ${cv.accent}`,
                      borderRadius:5,
                      opacity: nt === "item" && n.done ? 0.72 : 1,
                    }}
                  >
                    <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:".4rem", marginBottom:".35rem" }}>
                      <span style={{ fontSize:".55rem", padding:".1rem .4rem", borderRadius:3, background: nt === "note" ? "rgba(126,200,227,0.18)" : "rgba(126,200,127,0.15)", color: nt === "note" ? "#9cd4f0" : "#7ec8b8", letterSpacing:".05em" }}>
                        {nt === "note" ? "📝 自由記載" : "☑ チェック項目"}
                      </span>
                      <span style={{ fontSize:".58rem", padding:".12rem .45rem", borderRadius:3, background: cv.badgeBg, color: cv.badgeColor, letterSpacing:".05em", border:`1px solid ${cv.border}` }}>
                        {kitchenCategoryLabel(n.category)}
                      </span>
                      {n.author ? (
                        <span style={{ fontSize:".62rem", color:"rgba(240,232,208,0.5)" }}>👤 {n.author}</span>
                      ) : null}
                      <span style={{ fontSize:".58rem", color:"rgba(240,232,208,0.38)" }}>{fromLabel}</span>
                      <label style={{ display:"inline-flex", alignItems:"center", gap:".25rem", marginLeft:"auto", cursor:"pointer", fontSize:".62rem", color:"#f4a261" }}>
                        <input
                          type="checkbox"
                          checked={!!n.important}
                          onChange={() => patchKitchenNote(n._id, { important: !n.important })}
                          style={{ accentColor:"#f4a261", width:15, height:15 }}
                        />
                        重要
                      </label>
                      {nt === "item" && (
                        <label style={{ display:"inline-flex", alignItems:"center", gap:".25rem", cursor:"pointer", fontSize:".62rem", color:"#7ec87e" }}>
                          <input
                            type="checkbox"
                            checked={!!n.done}
                            onChange={() => patchKitchenNote(n._id, { done: !n.done })}
                            style={{ accentColor:"#7ec87e", width:15, height:15 }}
                          />
                          完了
                        </label>
                      )}
                      <button type="button" onClick={() => removeKitchenNote(n._id)} style={{ padding:".1rem .35rem", background:"transparent", border:"none", color:"rgba(226,75,74,0.55)", cursor:"pointer", fontSize:".68rem", marginLeft:".15rem" }}>削除</button>
                    </div>
                    <div style={{ fontSize:".84rem", color: nt === "item" && n.done ? "rgba(240,232,208,0.45)" : "rgba(240,232,208,0.88)", lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-word", textDecoration: nt === "item" && n.done ? "line-through" : "none" }}>
                      {bodyText}
                    </div>
                    {Array.isArray(n.attachments) && n.attachments.length > 0 ? (
                      <div style={{ display:"flex", flexWrap:"wrap", gap:".45rem", marginTop:".55rem" }}>
                        {n.attachments.map((att, idx) => (
                          <div
                            key={att.storagePath || `${n._id}-att-${idx}`}
                            style={{ position:"relative", width:88, height:88, flexShrink:0 }}
                          >
                            <a
                              href={att.downloadURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="新しいタブで開く"
                              style={{ display:"block", width:88, height:88, borderRadius:4, overflow:"hidden", border:`1px solid ${cv.border}` }}
                            >
                              <img
                                src={att.downloadURL}
                                alt=""
                                style={{ width:"100%", height:"100%", objectFit:"cover", display:"block", pointerEvents:"none" }}
                              />
                            </a>
                            <button
                              type="button"
                              aria-label="写真を削除"
                              onClick={() => removeAttachment(n._id, idx)}
                              style={{
                                position:"absolute",
                                top:2,
                                right:2,
                                width:22,
                                height:22,
                                padding:0,
                                lineHeight:"20px",
                                fontSize:".85rem",
                                borderRadius:3,
                                border:"1px solid rgba(226,75,74,0.5)",
                                background:"rgba(10,10,10,0.85)",
                                color:"#e24b4a",
                                cursor:"pointer",
                                fontFamily:"inherit",
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div style={{ marginTop:".5rem", display:"flex", alignItems:"center", gap:".5rem", flexWrap:"wrap" }}>
                      <label
                        style={{
                          ...S.btn("sm"),
                          cursor: uploadingNoteId === n._id ? "wait" : "pointer",
                          marginBottom:0,
                          opacity: uploadingNoteId === n._id ? 0.65 : 1,
                          pointerEvents: uploadingNoteId === n._id ? "none" : "auto",
                        }}
                      >
                        写真を添付
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          disabled={uploadingNoteId === n._id}
                          style={{ display:"none" }}
                          onChange={e => {
                            const fl = e.target.files;
                            uploadPhotosForNote(n._id, fl);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {uploadingNoteId === n._id ? (
                        <span style={{ fontSize:".65rem", color:"rgba(126,200,127,0.85)", letterSpacing:".06em" }}>アップロード中...</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={S.secTitle}>厨房共有を送る</div>
      <div style={{ padding:".75rem .9rem", background:"#0d0d0d", border:"1px solid rgba(126,200,127,0.15)", borderRadius:5, marginBottom:".75rem" }}>
        <div style={{ fontSize:".62rem", color:"rgba(126,200,127,0.75)", marginBottom:".5rem", letterSpacing:".1em" }}>📅 送り先（投稿日は {fmtDate(selectedDate)}）</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:".4rem", marginBottom:".5rem" }}>
          {[
            { k:"nextday", l:"明日" },
            { k:"single", l:"日付指定" },
            { k:"multi", l:"複数日" },
            { k:"range", l:"期間" },
          ].map(m => (
            <button key={m.k} type="button" onClick={() => setKitchenSendMode(m.k)} style={{ padding:".3rem .7rem", borderRadius:3, border:`1px solid ${kitchenSendMode === m.k ? "#7ec8b8" : "rgba(126,200,127,0.25)"}`, background: kitchenSendMode === m.k ? "#7ec8b8" : "transparent", color: kitchenSendMode === m.k ? "#0a0a0a" : "rgba(126,200,127,0.75)", fontSize:".65rem", cursor:"pointer", fontFamily:"inherit", letterSpacing:".05em" }}>{m.l}</button>
          ))}
        </div>

        {kitchenSendMode === "nextday" && (
          <div style={{ fontSize:".7rem", color:"rgba(240,232,208,0.6)" }}>
            → 翌日（{fmtDate(shiftDate(selectedDate, 1))}）に表示
          </div>
        )}

        {kitchenSendMode === "single" && (
          <>
            <div style={{ fontSize:".62rem", color:"rgba(240,232,208,0.5)", marginBottom:".25rem" }}>
              {kitchenSendDate ? `→ ${fmtDate(kitchenSendDate)} に表示` : "カレンダーから日付を選択"}
            </div>
            <MiniCalendar
              selectedDates={kitchenSendDate ? [kitchenSendDate] : []}
              onToggle={(d) => setKitchenSendDate(d === kitchenSendDate ? "" : d)}
              mode="single"
              fromDate={selectedDate}
            />
          </>
        )}

        {kitchenSendMode === "multi" && (
          <>
            <div style={{ fontSize:".62rem", color:"rgba(240,232,208,0.5)", marginBottom:".25rem" }}>
              {kitchenSendDates.length === 0 ? "カレンダーから複数の日付を選択" : `${kitchenSendDates.length}日に表示`}
            </div>
            <MiniCalendar
              selectedDates={kitchenSendDates}
              onToggle={toggleKitchenMultiDate}
              mode="multi"
              fromDate={selectedDate}
            />
            {kitchenSendDates.length > 0 && (
              <div style={{ display:"flex", flexWrap:"wrap", gap:".3rem", marginTop:".4rem" }}>
                {kitchenSendDates.map(d => (
                  <span key={d} style={{ padding:".15rem .45rem", background:"rgba(126,200,127,0.13)", borderRadius:3, fontSize:".62rem", color:"#7ec8b8", display:"inline-flex", alignItems:"center", gap:".25rem" }}>
                    {d.slice(5)}
                    <button type="button" onClick={() => toggleKitchenMultiDate(d)} style={{ background:"transparent", border:"none", color:"#7ec8b8", cursor:"pointer", padding:0, fontSize:".62rem" }}>✕</button>
                  </span>
                ))}
                <button type="button" onClick={() => setKitchenSendDates([])} style={{ ...S.btn("sm"), padding:".1rem .4rem", fontSize:".55rem" }}>クリア</button>
              </div>
            )}
          </>
        )}

        {kitchenSendMode === "range" && (
          <>
            <div style={{ fontSize:".62rem", color:"rgba(240,232,208,0.5)", marginBottom:".25rem" }}>
              {!kitchenRangeStart ? "開始日をタップ" : !kitchenRangeEnd ? "終了日をタップ" : (() => {
                const s = new Date(kitchenRangeStart+"T00:00:00");
                const e = new Date(kitchenRangeEnd+"T00:00:00");
                return `${kitchenRangeStart} 〜 ${kitchenRangeEnd} （${Math.round((e-s)/86400000)+1}日間）`;
              })()}
            </div>
            <MiniCalendar
              selectedDates={[kitchenRangeStart, kitchenRangeEnd].filter(Boolean)}
              onToggle={(d) => {
                if (!kitchenRangeStart || (kitchenRangeStart && kitchenRangeEnd)) {
                  setKitchenRangeStart(d);
                  setKitchenRangeEnd("");
                } else {
                  if (d < kitchenRangeStart) {
                    setKitchenRangeEnd(kitchenRangeStart);
                    setKitchenRangeStart(d);
                  } else if (d === kitchenRangeStart) {
                    setKitchenRangeStart("");
                  } else {
                    setKitchenRangeEnd(d);
                  }
                }
              }}
              mode="range"
              rangeStart={kitchenRangeStart}
              rangeEnd={kitchenRangeEnd}
              fromDate={selectedDate}
            />
            {(kitchenRangeStart || kitchenRangeEnd) && (
              <button type="button" onClick={() => { setKitchenRangeStart(""); setKitchenRangeEnd(""); }} style={{ ...S.btn("sm"), padding:".15rem .5rem", fontSize:".58rem", marginTop:".4rem" }}>リセット</button>
            )}
          </>
        )}
      </div>

      <div style={{ display:"grid", gap:".55rem", marginBottom:".75rem" }}>
        <div>
          <label style={{ ...S.lbl, color:"rgba(126,200,127,0.55)" }}>カテゴリ</label>
          <select style={S.inp} value={newKitchenCategory} onChange={e => setNewKitchenCategory(e.target.value)}>
            {KITCHEN_NOTE_CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ ...S.lbl, color:"rgba(126,200,127,0.55)" }}>記入者</label>
          <input style={S.inp} value={newKitchenAuthor} onChange={e => setNewKitchenAuthor(e.target.value)} placeholder="名前" />
        </div>
        <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".78rem", color:"rgba(240,232,208,0.85)" }}>
          <input type="checkbox" checked={newKitchenImportant} onChange={e => setNewKitchenImportant(e.target.checked)} style={{ accentColor:"#f4a261", width:18, height:18 }} />
          重要
        </label>
      </div>

      <div style={{ marginBottom:".75rem" }}>
        <div style={{ fontSize:".68rem", color:"rgba(126,200,227,0.85)", marginBottom:".35rem", letterSpacing:".08em" }}>📝 自由記載で送る</div>
        <div style={{ display:"flex", gap:".4rem", alignItems:"flex-end", flexWrap:"wrap" }}>
          <textarea
            style={{ ...S.inp, resize:"vertical", lineHeight:1.6, minHeight:56, flex:1, minWidth:200 }}
            value={newKitchenNote}
            onChange={e => setNewKitchenNote(e.target.value)}
            placeholder="共有メモ（自由記載）"
          />
          <button type="button" style={{ ...S.btn("gold"), alignSelf:"flex-end" }} onClick={addKitchenNoteFree}>送信</button>
        </div>
      </div>

      <div style={{ marginBottom:"1rem" }}>
        <div style={{ fontSize:".68rem", color:"rgba(126,200,127,0.85)", marginBottom:".35rem", letterSpacing:".08em" }}>☑ チェック項目で送る</div>
        <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap" }}>
          <input
            style={{ ...S.inp, flex:1, minWidth:200 }}
            value={newKitchenItem}
            onChange={e => setNewKitchenItem(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKitchenItemCheck(); } }}
            placeholder="例：〇〇の仕込み確認 / 冷蔵庫の〇〇"
          />
          <button type="button" style={S.btn("gold")} onClick={addKitchenItemCheck}>送信</button>
        </div>
      </div>
    </div>
  );
}

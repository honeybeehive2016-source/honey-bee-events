import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

export const KITCHEN_NOTE_CATEGORIES = [
  { key: "prep", label: "仕込みメモ" },
  { key: "stock", label: "欠品・残りわずか" },
  { key: "event_prep", label: "イベント／貸切準備" },
  { key: "notice", label: "連絡・注意事項" },
];

export function kitchenCategoryLabel(key) {
  return KITCHEN_NOTE_CATEGORIES.find(c => c.key === key)?.label || key;
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
  const [newKitchenCategory, setNewKitchenCategory] = useState("prep");
  const [newKitchenBody, setNewKitchenBody] = useState("");
  const [newKitchenAuthor, setNewKitchenAuthor] = useState("");
  const [newKitchenImportant, setNewKitchenImportant] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "kitchenNotes"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllKitchenNotes(list);
    });
    return () => unsub();
  }, []);

  const addKitchenNote = async () => {
    if (!newKitchenBody.trim()) {
      alert("本文を入力してください");
      return;
    }
    const id = `kn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    await setDoc(doc(db, "kitchenNotes", id), {
      date: selectedDate,
      category: newKitchenCategory,
      body: newKitchenBody.trim(),
      author: (newKitchenAuthor || "").trim(),
      important: !!newKitchenImportant,
      done: false,
      createdAt: now,
      updatedAt: now,
    });
    setNewKitchenBody("");
    setNewKitchenImportant(false);
  };

  const patchKitchenNote = async (id, patch) => {
    await setDoc(doc(db, "kitchenNotes", id), { ...patch, updatedAt: Date.now() }, { merge: true });
  };

  const removeKitchenNote = async (id) => {
    if (!window.confirm("この厨房メモを削除しますか？")) return;
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

  const kitchenNotesForSelectedDate = allKitchenNotes
    .filter(n => n.date === selectedDate)
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
        <div style={{ ...S.secTitle, borderBottomColor:"rgba(126,200,127,0.25)", color:"rgba(126,200,127,0.95)" }}>メモ一覧・追加</div>
        <div style={{ ...S.card, padding:"1rem 1.1rem", borderColor:"rgba(126,200,127,0.18)", background:"linear-gradient(180deg,rgba(126,200,127,0.06),#111)" }}>
          <div style={{ fontSize:".62rem", color:"rgba(126,200,127,0.65)", marginBottom:".65rem", letterSpacing:".08em" }}>
            {fmtDate(selectedDate)} のメモ（日付を変えるとその日の一覧が表示されます）
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
              <label style={{ ...S.lbl, color:"rgba(126,200,127,0.55)" }}>本文</label>
              <textarea
                style={{ ...S.inp, resize:"vertical", lineHeight:1.6, minHeight:72 }}
                value={newKitchenBody}
                onChange={e => setNewKitchenBody(e.target.value)}
                placeholder="仕込み・欠品・準備・連絡など"
              />
            </div>
            <div>
              <label style={{ ...S.lbl, color:"rgba(126,200,127,0.55)" }}>記入者</label>
              <input style={S.inp} value={newKitchenAuthor} onChange={e => setNewKitchenAuthor(e.target.value)} placeholder="名前" />
            </div>
            <label style={{ display:"flex", alignItems:"center", gap:".5rem", cursor:"pointer", fontSize:".78rem", color:"rgba(240,232,208,0.85)" }}>
              <input type="checkbox" checked={newKitchenImportant} onChange={e => setNewKitchenImportant(e.target.checked)} style={{ accentColor:"#f4a261", width:18, height:18 }} />
              重要
            </label>
            <button type="button" style={{ ...S.btn("gold"), alignSelf:"flex-start" }} onClick={addKitchenNote}>追加</button>
          </div>
          {kitchenNotesForSelectedDate.length === 0 ? (
            <div style={{ textAlign:"center", padding:".85rem", color:"rgba(240,232,208,0.35)", fontSize:".78rem" }}>
              この日の厨房メモはまだありません
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:".5rem" }}>
              {kitchenNotesForSelectedDate.map(n => (
                <div
                  key={n._id}
                  style={{
                    padding:".65rem .75rem",
                    background: n.important ? "rgba(244,162,97,0.08)" : "#0a0a0a",
                    border:`1px solid ${n.important ? "rgba(244,162,97,0.35)" : "rgba(126,200,127,0.15)"}`,
                    borderRadius:5,
                    opacity: n.done ? 0.72 : 1,
                  }}
                >
                  <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:".4rem", marginBottom:".35rem" }}>
                    <span style={{ fontSize:".58rem", padding:".12rem .45rem", borderRadius:3, background:"rgba(126,200,127,0.15)", color:"#7ec8b8", letterSpacing:".05em" }}>
                      {kitchenCategoryLabel(n.category)}
                    </span>
                    {n.author ? (
                      <span style={{ fontSize:".62rem", color:"rgba(240,232,208,0.5)" }}>👤 {n.author}</span>
                    ) : null}
                    <label style={{ display:"inline-flex", alignItems:"center", gap:".25rem", marginLeft:"auto", cursor:"pointer", fontSize:".62rem", color:"#f4a261" }}>
                      <input
                        type="checkbox"
                        checked={!!n.important}
                        onChange={() => patchKitchenNote(n._id, { important: !n.important })}
                        style={{ accentColor:"#f4a261", width:15, height:15 }}
                      />
                      重要
                    </label>
                    <label style={{ display:"inline-flex", alignItems:"center", gap:".25rem", cursor:"pointer", fontSize:".62rem", color:"#7ec87e" }}>
                      <input
                        type="checkbox"
                        checked={!!n.done}
                        onChange={() => patchKitchenNote(n._id, { done: !n.done })}
                        style={{ accentColor:"#7ec87e", width:15, height:15 }}
                      />
                      完了
                    </label>
                    <button type="button" onClick={() => removeKitchenNote(n._id)} style={{ padding:".1rem .35rem", background:"transparent", border:"none", color:"rgba(226,75,74,0.55)", cursor:"pointer", fontSize:".68rem", marginLeft:".15rem" }}>削除</button>
                  </div>
                  <div style={{ fontSize:".84rem", color:n.done ? "rgba(240,232,208,0.45)" : "rgba(240,232,208,0.88)", lineHeight:1.65, whiteSpace:"pre-wrap", wordBreak:"break-word", textDecoration:n.done ? "line-through" : "none" }}>
                    {n.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

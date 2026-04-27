import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

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

const Field = ({ label, children, full }) => (
  <div style={{ gridColumn: full ? "1/-1" : undefined, display:"flex", flexDirection:"column" }}>
    <label style={S.lbl}>{label}</label>
    {children}
  </div>
);

const emptyArtist = {
  name: "",
  charge: "",       // 入場料
  attendance: "",   // 動員数
  method: "rate",   // "rate"=歩合 / "fixed"=固定額
  ratePercent: "",  // 歩合％
  minGuarantee: "", // 最低保証
  fixedFee: "",     // 固定額
  deductions: [],   // [{name,amount}]
  paid: false,
  paidDate: "",
  paymentMethod: "現金",
  memo: "",
};

const emptySettlement = {
  eventDate: "",
  eventName: "",
  eventId: "",
  artists: [],
};

// 計算ヘルパー
function calcArtist(a) {
  const charge = Number(a.charge || 0);
  const attendance = Number(a.attendance || 0);
  const sales = charge * attendance;
  let amount = 0;
  if (a.method === "fixed") {
    amount = Number(a.fixedFee || 0);
  } else {
    const rate = Number(a.ratePercent || 0);
    const calc = Math.round(sales * rate / 100);
    const min = Number(a.minGuarantee || 0);
    amount = Math.max(calc, min);
  }
  const deductionTotal = (a.deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0);
  const finalAmount = amount - deductionTotal;
  return { sales, amount, deductionTotal, finalAmount };
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  const days = ["日","月","火","水","木","金","土"];
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${days[dt.getDay()]}）`;
}

// 精算メモ生成
function buildSettlementMemo(settlement, artist) {
  const c = calcArtist(artist);
  const charge = Number(artist.charge || 0);
  const attendance = Number(artist.attendance || 0);
  const lines = [
    "━━━━━━━━━━━━━━━",
    `${fmtDate(settlement.eventDate)}`,
    `${settlement.eventName || "イベント"}`,
    `${artist.name || "出演者"} 様 精算`,
    "━━━━━━━━━━━━━━━",
    "",
  ];
  if (artist.method === "rate") {
    lines.push(`入場料：¥${charge.toLocaleString()} × ${attendance}名`);
    lines.push(`売上：¥${c.sales.toLocaleString()}`);
    lines.push("");
    if (c.amount > Math.round(c.sales * Number(artist.ratePercent||0) / 100)) {
      lines.push(`最低保証適用`);
    } else {
      lines.push(`歩合 ${artist.ratePercent}%`);
    }
    lines.push(`取り分：¥${c.amount.toLocaleString()}`);
  } else {
    lines.push(`入場料：¥${charge.toLocaleString()} × ${attendance}名`);
    lines.push(`売上：¥${c.sales.toLocaleString()}`);
    lines.push("");
    lines.push(`固定出演料：¥${c.amount.toLocaleString()}`);
  }

  if ((artist.deductions||[]).length > 0) {
    lines.push("");
    artist.deductions.forEach(d => {
      lines.push(`${d.name||"差引"}：−¥${Number(d.amount||0).toLocaleString()}`);
    });
    lines.push("─────────────");
  }
  lines.push("");
  lines.push(`お渡し金額：¥${c.finalAmount.toLocaleString()}`);
  lines.push("");
  if (artist.memo) {
    lines.push(`備考：${artist.memo}`);
    lines.push("");
  }
  lines.push("ありがとうございました！");
  lines.push("HONEY BEE");
  lines.push("━━━━━━━━━━━━━━━");
  return lines.join("\n");
}

export default function SettlementModule({ events = [], navigateBack }) {
  const [settlements, setSettlements] = useState([]);
  const [allSettlements, setAllSettlements] = useState([]);
  const [view, setView] = useState("list"); // list | edit
  const [form, setForm] = useState(emptySettlement);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | unpaid | paid
  const [copied, setCopied] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  useEffect(() => {
    const TRASH_TTL = 30 * 24 * 60 * 60 * 1000;
    const unsub = onSnapshot(collection(db, "settlements"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllSettlements(list);
      setSettlements(list.filter(s => !s._deleted));
      // 30日経過したゴミ箱を完全削除
      list.filter(s => s._deleted && s._deletedAt && (Date.now() - s._deletedAt) > TRASH_TTL)
        .forEach(s => deleteDoc(doc(db, "settlements", s._id)).catch(()=>{}));
    });
    return () => unsub();
  }, []);
  const trashSettlements = allSettlements.filter(s => s._deleted);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // イベントから新規作成
  const startFromEvent = (eventId) => {
    const ev = events.find(e => e._id === eventId);
    if (!ev) return;
    const perfList = (ev.perf || "").split(/[\/／,、]/).map(s => s.trim()).filter(Boolean);
    const artists = perfList.length > 0
      ? perfList.map(name => ({ ...emptyArtist, name, charge: ev.price?.replace(/[¥,円]/g,"").replace(/前売.*?(\d+).*/,"$1") || "" }))
      : [{ ...emptyArtist }];
    setForm({
      eventDate: ev.date || "",
      eventName: ev.name || "",
      eventId: ev._id || "",
      artists,
    });
    setEditingId(null);
    setView("edit");
  };

  const startNew = () => {
    setForm({ ...emptySettlement, eventDate: new Date().toISOString().split("T")[0], artists: [{ ...emptyArtist }] });
    setEditingId(null);
    setView("edit");
  };

  const startEdit = (s) => {
    setForm({ ...emptySettlement, ...s });
    setEditingId(s._id);
    setView("edit");
  };

  const handleSave = async () => {
    if (!form.eventName) { alert("イベント名を入力してください"); return; }
    try {
      const id = editingId || `settle_${Date.now().toString(36)}`;
      const { _id, ...data } = form;
      data.savedAt = new Date().toLocaleDateString("ja-JP");
      await setDoc(doc(db, "settlements", id), data);
      alert("✓ 保存しました");
      setView("list");
    } catch (e) { alert("保存失敗：" + e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この精算をゴミ箱に移動しますか？\n（30日以内なら復元できます）")) return;
    const target = allSettlements.find(s => s._id === id);
    if (!target) return;
    const { _id, ...data } = target;
    await setDoc(doc(db, "settlements", id), {
      ...data,
      _deleted: true,
      _deletedAt: Date.now(),
    });
  };

  const restoreSettlement = async (id) => {
    const target = allSettlements.find(s => s._id === id);
    if (!target) return;
    const { _id, _deleted, _deletedAt, ...data } = target;
    await setDoc(doc(db, "settlements", id), data);
  };

  const purgeSettlement = async (id) => {
    if (!window.confirm("この精算を完全に削除しますか？\nこの操作は取り消せません。")) return;
    await deleteDoc(doc(db, "settlements", id));
  };

  const updateArtist = (idx, key, value) => {
    const arr = [...(form.artists || [])];
    arr[idx] = { ...arr[idx], [key]: value };
    setField("artists", arr);
  };

  const addArtist = () => {
    setField("artists", [...(form.artists || []), { ...emptyArtist }]);
  };

  const removeArtist = (idx) => {
    if (!window.confirm("この出演者を削除しますか？")) return;
    setField("artists", form.artists.filter((_, i) => i !== idx));
  };

  const addDeduction = (idx) => {
    const arr = [...form.artists];
    arr[idx] = { ...arr[idx], deductions: [...(arr[idx].deductions || []), { name: "", amount: "" }] };
    setField("artists", arr);
  };

  const updateDeduction = (artistIdx, dedIdx, key, value) => {
    const arr = [...form.artists];
    const deds = [...(arr[artistIdx].deductions || [])];
    deds[dedIdx] = { ...deds[dedIdx], [key]: value };
    arr[artistIdx] = { ...arr[artistIdx], deductions: deds };
    setField("artists", arr);
  };

  const removeDeduction = (artistIdx, dedIdx) => {
    const arr = [...form.artists];
    arr[artistIdx] = {
      ...arr[artistIdx],
      deductions: arr[artistIdx].deductions.filter((_, i) => i !== dedIdx),
    };
    setField("artists", arr);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
  };

  // 一覧フィルタリング
  const filtered = settlements.filter(s => {
    if (filter === "all") return true;
    const allPaid = (s.artists || []).every(a => a.paid);
    const somePaid = (s.artists || []).some(a => a.paid);
    if (filter === "unpaid") return !allPaid;
    if (filter === "paid") return allPaid && (s.artists || []).length > 0;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => (b.eventDate || "").localeCompare(a.eventDate || ""));

  // ===== 編集画面 =====
  if (view === "edit") {
    return (
      <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem",flexWrap:"wrap",gap:".5rem"}}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>
            💰 {editingId ? "精算編集" : "新規精算"}
          </h2>
          <button style={S.btn("sm")} onClick={()=>setView("list")}>← 一覧</button>
        </div>

        {/* イベント情報 */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:".7rem",marginBottom:"1.5rem"}} className="hb-form-grid">
          <Field label="開催日"><input type="date" style={S.inp} value={form.eventDate} onChange={e=>setField("eventDate",e.target.value)}/></Field>
          <Field label="イベント名"><input style={S.inp} value={form.eventName} onChange={e=>setField("eventName",e.target.value)} placeholder="例：Jazz Night Premium"/></Field>
          <Field label="関連イベント"><input style={S.inp} value={form.eventId||""} disabled placeholder="（手動入力）"/></Field>
        </div>

        {/* 出演者ごとの精算 */}
        <div style={{...S.secTitle,marginTop:0}}>出演者（{(form.artists||[]).length}名）</div>

        {(form.artists || []).map((artist, idx) => {
          const c = calcArtist(artist);
          const memo = buildSettlementMemo(form, artist);
          return (
            <div key={idx} style={{...S.card,padding:"1.25rem",marginBottom:"1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".75rem",flexWrap:"wrap",gap:".5rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"Georgia,serif",fontSize:".95rem",color:"#c9a84c"}}>出演者 #{idx+1}</span>
                  {artist.paid && <span style={{padding:".15rem .55rem",borderRadius:3,fontSize:".58rem",letterSpacing:".1em",background:"rgba(126,200,126,0.15)",color:"#7ec87e",border:"1px solid rgba(126,200,126,0.4)"}}>✓ 精算済</span>}
                </div>
                <button style={S.btn("danger")} onClick={()=>removeArtist(idx)}>🗑 削除</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".7rem",marginBottom:".75rem"}} className="hb-form-grid">
                <Field label="出演者名" full><input style={S.inp} value={artist.name} onChange={e=>updateArtist(idx,"name",e.target.value)} placeholder="例：山田太郎"/></Field>
                <Field label="入場料"><input type="number" style={S.inp} value={artist.charge} onChange={e=>updateArtist(idx,"charge",e.target.value)} placeholder="3000"/></Field>
                <Field label="動員数"><input type="number" style={S.inp} value={artist.attendance} onChange={e=>updateArtist(idx,"attendance",e.target.value)} placeholder="12"/></Field>
                <Field label="売上合計（自動）"><input style={{...S.inp,color:"rgba(201,168,76,0.7)"}} value={`¥${c.sales.toLocaleString()}`} readOnly/></Field>
              </div>

              {/* 精算方式 */}
              <div style={{marginBottom:".75rem"}}>
                <label style={S.lbl}>精算方式</label>
                <div style={{display:"flex",gap:"1rem",marginTop:".25rem"}}>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:artist.method==="rate"?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="radio" name={`method-${idx}`} checked={artist.method==="rate"} onChange={()=>updateArtist(idx,"method","rate")} style={{accentColor:"#c9a84c"}}/>
                    歩合
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:artist.method==="fixed"?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="radio" name={`method-${idx}`} checked={artist.method==="fixed"} onChange={()=>updateArtist(idx,"method","fixed")} style={{accentColor:"#c9a84c"}}/>
                    固定額
                  </label>
                </div>
              </div>

              {artist.method === "rate" ? (
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem",marginBottom:".75rem"}} className="hb-form-grid">
                  <Field label="歩合％"><input type="number" style={S.inp} value={artist.ratePercent} onChange={e=>updateArtist(idx,"ratePercent",e.target.value)} placeholder="50"/></Field>
                  <Field label="最低保証（任意）"><input type="number" style={S.inp} value={artist.minGuarantee} onChange={e=>updateArtist(idx,"minGuarantee",e.target.value)} placeholder="¥0なら未設定"/></Field>
                </div>
              ) : (
                <div style={{display:"grid",gridTemplateColumns:"1fr",gap:".7rem",marginBottom:".75rem"}}>
                  <Field label="固定出演料"><input type="number" style={S.inp} value={artist.fixedFee} onChange={e=>updateArtist(idx,"fixedFee",e.target.value)} placeholder="30000"/></Field>
                </div>
              )}

              {/* 計算結果（取り分） */}
              <div style={{padding:".55rem .8rem",background:"rgba(201,168,76,0.06)",borderRadius:4,marginBottom:".75rem",fontSize:".82rem"}}>
                <span style={{color:"rgba(240,232,208,0.55)"}}>取り分：</span>
                <strong style={{color:"#c9a84c",fontSize:".95rem"}}>¥{c.amount.toLocaleString()}</strong>
              </div>

              {/* 差し引き項目 */}
              <div style={{padding:".75rem 1rem",background:"#0d0d0d",border:"1px dashed rgba(244,162,97,0.2)",borderRadius:5,marginBottom:".75rem"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".5rem"}}>
                  <span style={{fontSize:".68rem",letterSpacing:".15em",color:"#f4a261"}}>差し引き項目</span>
                  <button style={{...S.btn("sm"),padding:".25rem .55rem",fontSize:".58rem",borderColor:"rgba(244,162,97,0.3)",color:"#f4a261"}} onClick={()=>addDeduction(idx)}>＋ 追加</button>
                </div>
                {(artist.deductions || []).length === 0 ? (
                  <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.3)"}}>飲食代・DVD録画など、出演者から精算金より差し引く項目があれば追加</div>
                ) : (
                  (artist.deductions || []).map((d, di) => (
                    <div key={di} style={{display:"grid",gridTemplateColumns:"2fr 1fr 30px",gap:".4rem",marginBottom:".3rem",alignItems:"center"}}>
                      <input style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem"}} value={d.name||""} onChange={e=>updateDeduction(idx,di,"name",e.target.value)} placeholder="例：飲食代 / DVD録画"/>
                      <input type="number" style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem",textAlign:"right"}} value={d.amount||""} onChange={e=>updateDeduction(idx,di,"amount",e.target.value)} placeholder="0"/>
                      <button onClick={()=>removeDeduction(idx,di)} style={{padding:".25rem .35rem",background:"transparent",border:"1px solid rgba(226,75,74,0.27)",borderRadius:3,color:"#e24b4a",cursor:"pointer",fontSize:".7rem"}}>✕</button>
                    </div>
                  ))
                )}
              </div>

              {/* 最終支払額 */}
              <div style={{padding:".75rem 1rem",background:"linear-gradient(90deg,rgba(201,168,76,0.08),transparent)",border:"1px solid rgba(201,168,76,0.2)",borderRadius:5,marginBottom:".75rem",display:"flex",justifyContent:"space-between",alignItems:"baseline",flexWrap:"wrap",gap:".5rem"}}>
                <span style={{fontSize:".75rem",letterSpacing:".15em",color:"rgba(201,168,76,0.7)"}}>お渡し金額</span>
                <strong style={{color:"#c9a84c",fontSize:"1.2rem"}}>¥{c.finalAmount.toLocaleString()}</strong>
              </div>

              {/* 支払情報 */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".7rem",marginBottom:".75rem"}} className="hb-form-grid">
                <Field label="支払方法">
                  <select style={S.inp} value={artist.paymentMethod} onChange={e=>updateArtist(idx,"paymentMethod",e.target.value)}>
                    <option value="現金">現金</option>
                    <option value="銀行振込">銀行振込</option>
                    <option value="その他">その他</option>
                  </select>
                </Field>
                <Field label="精算済み">
                  <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".85rem",padding:".55rem 0",color:artist.paid?"#7ec87e":"rgba(240,232,208,0.55)"}}>
                    <input type="checkbox" checked={!!artist.paid} onChange={e=>{
                      updateArtist(idx,"paid",e.target.checked);
                      if(e.target.checked && !artist.paidDate) updateArtist(idx,"paidDate",new Date().toISOString().split("T")[0]);
                    }} style={{accentColor:"#7ec87e"}}/>
                    {artist.paid?"✓ 精算済":"未精算"}
                  </label>
                </Field>
                {artist.paid && <Field label="精算日"><input type="date" style={S.inp} value={artist.paidDate||""} onChange={e=>updateArtist(idx,"paidDate",e.target.value)}/></Field>}
              </div>

              <Field label="備考" full><textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={artist.memo||""} onChange={e=>updateArtist(idx,"memo",e.target.value)} placeholder="銀行口座など"/></Field>

              {/* 精算メモプレビュー */}
              <div style={{marginTop:".75rem"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".4rem"}}>
                  <span style={{fontSize:".62rem",letterSpacing:".1em",color:"rgba(201,168,76,0.7)"}}>📋 精算メモ（コピー用）</span>
                  <button style={{...S.btn("sm"),padding:".25rem .55rem",fontSize:".58rem"}} onClick={()=>copyText(memo,`memo-${idx}`)}>{copied===`memo-${idx}`?"✓ 完了":"コピー"}</button>
                </div>
                <div style={{background:"#0a0a0a",border:"1px solid rgba(201,168,76,0.1)",borderRadius:5,padding:".7rem .9rem",fontSize:".75rem",lineHeight:1.7,color:"rgba(240,232,208,0.7)",whiteSpace:"pre-wrap"}}>{memo}</div>
              </div>
            </div>
          );
        })}

        <button style={S.btn("ghost")} onClick={addArtist}>＋ 出演者を追加</button>

        {/* 合計 */}
        {(form.artists||[]).length > 0 && (() => {
          const totalSales = form.artists.reduce((s,a)=>s+calcArtist(a).sales,0);
          const totalPay = form.artists.reduce((s,a)=>s+calcArtist(a).finalAmount,0);
          const storeShare = totalSales - form.artists.reduce((s,a)=>s+calcArtist(a).amount,0);
          return (
            <div style={{padding:"1rem 1.25rem",marginTop:"1.5rem",background:"#111",border:"1px solid rgba(201,168,76,0.2)",borderRadius:6,display:"flex",justifyContent:"space-around",flexWrap:"wrap",gap:"1rem",fontSize:".82rem"}}>
              <div><span style={{color:"rgba(240,232,208,0.55)"}}>売上合計：</span><strong style={{color:"#f0e8d0"}}>¥{totalSales.toLocaleString()}</strong></div>
              <div><span style={{color:"rgba(240,232,208,0.55)"}}>店舗分：</span><strong style={{color:"#7ec8e3"}}>¥{storeShare.toLocaleString()}</strong></div>
              <div><span style={{color:"rgba(240,232,208,0.55)"}}>出演者支払い：</span><strong style={{color:"#c9a84c"}}>¥{totalPay.toLocaleString()}</strong></div>
            </div>
          );
        })()}

        <div style={{display:"flex",gap:".5rem",marginTop:"1.5rem",flexWrap:"wrap"}}>
          <button style={{...S.btn("gold"),flex:1,maxWidth:200}} onClick={handleSave}>💾 保存</button>
          <button style={S.btn("ghost")} onClick={()=>setView("list")}>キャンセル</button>
          {editingId && <button style={{...S.btn("danger"),marginLeft:"auto"}} onClick={async()=>{await handleDelete(editingId);setView("list");}}>🗑 削除</button>}
        </div>
      </div>
    );
  }

  // ===== 一覧画面 =====
  // イベント候補（過去・未来両方）
  const eventOptions = [...events].sort((a,b)=>(b.date||"").localeCompare(a.date||""));

  return (
    <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:".5rem"}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>💰 アーティスト精算</h2>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap",alignItems:"center"}}>
          <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={()=>setShowTrash(true)}>🗑 ゴミ箱{trashSettlements.length>0?` (${trashSettlements.length})`:""}</button>
          {eventOptions.length > 0 && (
            <select style={{...S.inp,maxWidth:240}} defaultValue="" onChange={e=>{if(e.target.value)startFromEvent(e.target.value);}}>
              <option value="">＋ イベントから精算作成</option>
              {eventOptions.map(ev=>(
                <option key={ev._id} value={ev._id}>{ev.date} {ev.name}</option>
              ))}
            </select>
          )}
          <button style={S.btn("gold")} onClick={startNew}>＋ 新規精算</button>
        </div>
      </div>

      {/* フィルター */}
      <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
        {[{k:"all",l:"すべて"},{k:"unpaid",l:"未精算あり"},{k:"paid",l:"精算済"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:".35rem .8rem",borderRadius:3,border:"1px solid "+(filter===f.k?"#c9a84c":"rgba(201,168,76,0.2)"),background:filter===f.k?"#c9a84c":"transparent",color:filter===f.k?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".68rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{f.l}</button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.25)",fontSize:".85rem"}}>
          💰 該当する精算はありません
        </div>
      ) : sorted.map(s=>{
        const totalPay = (s.artists||[]).reduce((sum,a)=>sum+calcArtist(a).finalAmount,0);
        const paidCount = (s.artists||[]).filter(a=>a.paid).length;
        const totalCount = (s.artists||[]).length;
        const allPaid = totalCount > 0 && paidCount === totalCount;
        return (
          <div key={s._id} style={{...S.card,display:"grid",gridTemplateColumns:"1fr auto",gap:".75rem",alignItems:"center"}} className="hb-card">
            <div onClick={()=>startEdit(s)} style={{cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:".35rem",flexWrap:"wrap"}}>
                <span style={{fontFamily:"Georgia,serif",fontSize:"1rem"}}>{s.eventName||"（無題）"}</span>
                {allPaid ? (
                  <span style={{padding:".15rem .5rem",borderRadius:3,fontSize:".58rem",background:"rgba(126,200,126,0.15)",color:"#7ec87e"}}>✓ すべて精算済</span>
                ) : (
                  <span style={{padding:".15rem .5rem",borderRadius:3,fontSize:".58rem",background:"rgba(244,162,97,0.15)",color:"#f4a261"}}>{paidCount}/{totalCount} 精算済</span>
                )}
              </div>
              <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",display:"flex",gap:"1rem",flexWrap:"wrap"}}>
                {s.eventDate && <span>📅 {s.eventDate}</span>}
                <span>👥 出演者 {totalCount}名</span>
                <span>💰 ¥{totalPay.toLocaleString()}</span>
              </div>
            </div>
            <div style={{display:"flex",gap:".4rem"}}>
              <button style={S.btn("sm")} onClick={()=>startEdit(s)}>編集</button>
              <button style={S.btn("danger")} onClick={()=>handleDelete(s._id)}>削除</button>
            </div>
          </div>
        );
      })}

      {/* ゴミ箱モーダル */}
      {showTrash && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setShowTrash(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:600,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em"}}>🗑 精算のゴミ箱</div>
              <button style={S.btn("sm")} onClick={()=>setShowTrash(false)}>閉じる</button>
            </div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",marginBottom:"1rem",lineHeight:1.6}}>
              削除された精算は30日間保持され、その後自動で完全削除されます。
            </div>
            {trashSettlements.length === 0 ? (
              <div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem"}}>ゴミ箱は空です</div>
            ) : trashSettlements.sort((a,b)=>(b._deletedAt||0)-(a._deletedAt||0)).map(s=>{
              const daysLeft = s._deletedAt ? Math.max(0,Math.ceil(30 - (Date.now()-s._deletedAt)/(24*60*60*1000))) : 30;
              return (
                <div key={s._id} style={{padding:".75rem 1rem",background:"#111",borderRadius:5,marginBottom:".5rem",display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:".88rem",marginBottom:".2rem"}}>{s.eventName||"（無題）"}</div>
                    <div style={{fontSize:".65rem",color:"rgba(240,232,208,0.4)",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                      {s.eventDate&&<span>📅 {s.eventDate}</span>}
                      <span>削除：{s._deletedAt?new Date(s._deletedAt).toLocaleDateString("ja-JP"):""}</span>
                      <span style={{color:daysLeft<7?"#f4a261":"rgba(240,232,208,0.5)"}}>あと{daysLeft}日</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".4rem"}}>
                    <button style={{...S.btn("sm"),borderColor:"rgba(126,200,127,0.4)",color:"#7ec87e"}} onClick={()=>restoreSettlement(s._id)}>↩ 復元</button>
                    <button style={S.btn("danger")} onClick={()=>purgeSettlement(s._id)}>完全削除</button>
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

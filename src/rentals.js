import { useState, useEffect } from "react";
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";

export const RENTAL_STATUSES = [
  { key: "new", label: "未対応", color: "#e24b4a" },
  { key: "replied", label: "返信済み", color: "#7ec8e3" },
  { key: "checking", label: "条件確認中", color: "#f4a261" },
  { key: "quoted", label: "見積提出済み", color: "#c9a84c" },
  { key: "hold", label: "仮押さえ", color: "#b58cd1" },
  { key: "won", label: "成約", color: "#7ec87e" },
  { key: "lost", label: "失注", color: "#888888" },
  { key: "done", label: "完了", color: "#5a8a5a" },
];

export const emptyRental = {
  inquiryDate: "", desiredDate: "", desiredTime: "",
  purpose: "", people: "", budget: "",
  food: "", drinks: "", stage: false, sound: false, mic: false,
  contactName: "", phone: "", email: "",
  status: "new",
  replyStatus: "", quoteStatus: "",
  outcome: "",
  memo: "",
  // 見積項目
  quoteItems: [], // [{name, qty, unit, price}]
  quoteNo: "",
  invoiceNo: "",
};

const HALL_RATES = {
  weekday_am: { label: "平日 10:00〜15:00", price: 50000 },
  weekday_pm: { label: "平日 15:00〜21:00", price: 80000 },
  holiday_am: { label: "土日祝 10:00〜15:00", price: 80000 },
  holiday_pm: { label: "土日祝 15:00〜21:00", price: 150000 },
};

const S = {
  card: { background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderRadius:6, padding:"1rem 1.25rem", marginBottom:".75rem", display:"grid", gridTemplateColumns:"1fr auto", gap:".75rem", alignItems:"center" },
  secTitle: { fontFamily:"Georgia,serif", fontSize:".7rem", letterSpacing:".25em", textTransform:"uppercase", color:"#c9a84c", borderBottom:"1px solid rgba(201,168,76,0.2)", paddingBottom:".5rem", marginBottom:".75rem", marginTop:"1.25rem" },
  lbl: { fontSize:".65rem", letterSpacing:".12em", textTransform:"uppercase", color:"rgba(201,168,76,0.6)", fontWeight:500, display:"block", marginBottom:".28rem" },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".85rem", padding:".5rem .65rem", outline:"none", width:"100%" },
  btn: (v) => {
    const b = { padding:".5rem 1rem", borderRadius:4, fontFamily:"inherit", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", border:"none" };
    if (v==="gold") return { ...b, background:"#c9a84c", color:"#0a0a0a" };
    if (v==="ghost") return { ...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    if (v==="danger") return { ...b, background:"transparent", color:"#e24b4a", border:"1px solid rgba(226,75,74,0.27)" };
    if (v==="sm") return { ...b, padding:".3rem .65rem", fontSize:".62rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)" };
    if (v==="ai") return { ...b, background:"linear-gradient(135deg,#7c4dff,#c9a84c)", color:"#fff", padding:".4rem .9rem", fontSize:".65rem" };
    return b;
  },
};

const StatusBadge = ({ status }) => {
  const s = RENTAL_STATUSES.find(x => x.key === status) || RENTAL_STATUSES[0];
  return (
    <span style={{display:"inline-block",padding:".2rem .55rem",borderRadius:3,fontSize:".58rem",letterSpacing:".1em",textTransform:"uppercase",background:s.color+"22",color:s.color,border:`1px solid ${s.color}55`}}>
      {s.label}
    </span>
  );
};

const Field = ({ label, children, full }) => (
  <div style={{ gridColumn: full ? "1/-1" : undefined, display:"flex", flexDirection:"column" }}>
    <label style={S.lbl}>{label}</label>
    {children}
  </div>
);

// AI返信文生成
async function generateReplyAI(rental, apiKey, type) {
  const prompts = {
    initial: `あなたは大船HONEY BEEの貸切担当者です。以下の貸切お問い合わせに対する初回返信メールを書いてください。

【お問い合わせ内容】
お名前：${rental.contactName || "未記入"}
希望日：${rental.desiredDate || "未定"} ${rental.desiredTime || ""}
人数：${rental.people || "未定"}名
利用目的：${rental.purpose || "未記入"}
予算：${rental.budget || "未記入"}
ご希望オプション：${[rental.food && "料理", rental.drinks && "飲み放題", rental.stage && "ステージ", rental.sound && "音響", rental.mic && "マイク"].filter(Boolean).join("、") || "なし"}
備考：${rental.memo || "なし"}

【HONEY BEEの貸切情報（必ず参考にしてください）】
- 大船にあるエンターテイメント×レストランバー
- 収容人数：約70名
- 設備：ベースアンプ・ギターアンプ・キーボード・ドラム・PA機材完備
- 料金（外税）：
  ・平日 10:00〜15:00：¥50,000+税
  ・平日 15:00〜21:00：¥80,000+税
  ・土日祝 10:00〜15:00：¥80,000+税
  ・土日祝 15:00〜21:00：¥150,000+税
  ※上記時間帯以外は要相談
  ※常設機材、PA・照明オペレーター料込み
- 予約金：¥30,000（入金時点で予約確定）
- キャンセル料：90日前まで¥30,000、90〜45日前は25%、45日前〜前日は50%、当日は100%
- TEL: 0467-46-5576

丁寧で温かみのある文体で、お問い合わせへの感謝、内容確認、料金や条件の概要、次のステップ案内を含めてください。署名は「HONEY BEE 西崎」で。`,

    quote: `あなたは大船HONEY BEEの貸切担当者です。条件確認後の見積提案メールを書いてください。

【条件】
お名前：${rental.contactName}様
希望日：${rental.desiredDate} ${rental.desiredTime}
人数：${rental.people}名
利用目的：${rental.purpose}

別途見積書を添付する想定で、内容確認のお願いと、ご質問・ご要望の問い合わせ案内を含めてください。署名は「HONEY BEE 西崎」で。`,

    confirmed: `あなたは大船HONEY BEEの貸切担当者です。成約のお礼メールを書いてください。

【内容】
お名前：${rental.contactName}様
日時：${rental.desiredDate} ${rental.desiredTime}
人数：${rental.people}名
利用目的：${rental.purpose}

予約金¥30,000のお振込確認、当日のスケジュール確認、何かあればいつでもご連絡くださいの旨を含めてください。署名は「HONEY BEE 西崎」で。`,
  };

  const prompt = prompts[type];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error?.message || "AI生成失敗");
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export default function RentalsModule({ apiKey, onRequireApiKey, navigateBack }) {
  const [rentals, setRentals] = useState([]);
  const [view, setView] = useState("list"); // list | edit
  const [form, setForm] = useState(emptyRental);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "rentals"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setRentals(list);
    });
    return () => unsub();
  }, []);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.contactName) { alert("担当者名を入力してください"); return; }
    try {
      const id = editingId || `rental_${Date.now().toString(36)}`;
      const { _id, ...data } = form;
      data.savedAt = new Date().toLocaleDateString("ja-JP");
      if (!data.inquiryDate) data.inquiryDate = new Date().toISOString().split("T")[0];
      await setDoc(doc(db, "rentals", id), data);
      alert("✓ 保存しました");
      setView("list");
      setForm(emptyRental);
      setEditingId(null);
    } catch (e) { alert("保存失敗：" + e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("この問い合わせを削除しますか？")) return;
    await deleteDoc(doc(db, "rentals", id));
  };

  const startNew = () => {
    setForm({ ...emptyRental, inquiryDate: new Date().toISOString().split("T")[0] });
    setEditingId(null);
    setAiReply("");
    setView("edit");
  };

  const startEdit = (r) => {
    setForm({ ...emptyRental, ...r });
    setEditingId(r._id);
    setAiReply("");
    setView("edit");
  };

  const handleAIReply = async (type) => {
    if (!apiKey) { onRequireApiKey(); return; }
    setAiLoading(true);
    try {
      const result = await generateReplyAI(form, apiKey, type);
      setAiReply(result);
    } catch (e) { alert("AI生成失敗：" + e.message); }
    setAiLoading(false);
  };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
  };

  // ステータス別件数
  const statusCounts = RENTAL_STATUSES.map(s => ({
    ...s,
    count: rentals.filter(r => r.status === s.key).length,
  }));

  const filtered = filter === "all" ? rentals : rentals.filter(r => r.status === filter);
  const sorted = [...filtered].sort((a, b) => (b.inquiryDate || "").localeCompare(a.inquiryDate || ""));

  if (view === "edit") {
    return (
      <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>
            🍽 {editingId ? "貸切お問い合わせ編集" : "新規お問い合わせ"}
          </h2>
          <button style={S.btn("sm")} onClick={()=>setView("list")}>← 一覧</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1.5rem"}} className="hb-form-layout">
          <div>
            <div style={S.secTitle}>お客様情報</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="担当者名" full><input style={S.inp} value={form.contactName} onChange={e=>setField("contactName",e.target.value)} placeholder="例：山田太郎"/></Field>
              <Field label="電話番号"><input style={S.inp} value={form.phone} onChange={e=>setField("phone",e.target.value)} placeholder="090-..."/></Field>
              <Field label="メール"><input type="email" style={S.inp} value={form.email} onChange={e=>setField("email",e.target.value)} placeholder="@..."/></Field>
              <Field label="問い合わせ日"><input type="date" style={S.inp} value={form.inquiryDate} onChange={e=>setField("inquiryDate",e.target.value)}/></Field>
            </div>

            <div style={S.secTitle}>希望条件</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="希望日"><input type="date" style={S.inp} value={form.desiredDate} onChange={e=>setField("desiredDate",e.target.value)}/></Field>
              <Field label="希望時間"><input style={S.inp} value={form.desiredTime} onChange={e=>setField("desiredTime",e.target.value)} placeholder="例：18:00〜21:00"/></Field>
              <Field label="人数"><input type="number" style={S.inp} value={form.people} onChange={e=>setField("people",e.target.value)} placeholder="30"/></Field>
              <Field label="予算"><input style={S.inp} value={form.budget} onChange={e=>setField("budget",e.target.value)} placeholder="例：¥150,000"/></Field>
              <Field label="利用目的" full><input style={S.inp} value={form.purpose} onChange={e=>setField("purpose",e.target.value)} placeholder="例：歓送迎会・誕生日・発表会"/></Field>
            </div>

            <div style={S.secTitle}>ご希望オプション</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="料理希望"><input style={S.inp} value={form.food} onChange={e=>setField("food",e.target.value)} placeholder="例：コース料理"/></Field>
              <Field label="飲み放題希望"><input style={S.inp} value={form.drinks} onChange={e=>setField("drinks",e.target.value)} placeholder="例：2時間"/></Field>
              <Field full><div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginTop:".25rem"}}>
                {[{k:"stage",l:"ステージ使用"},{k:"sound",l:"音響使用"},{k:"mic",l:"マイク使用"}].map(o=>(
                  <label key={o.k} style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:form[o.k]?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="checkbox" checked={!!form[o.k]} onChange={e=>setField(o.k,e.target.checked)} style={{accentColor:"#c9a84c"}}/>
                    {o.l}
                  </label>
                ))}
              </div></Field>
            </div>
          </div>

          <div>
            <div style={S.secTitle}>進行状況</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="ステータス" full>
                <select style={S.inp} value={form.status} onChange={e=>setField("status",e.target.value)}>
                  {RENTAL_STATUSES.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="返信状況"><input style={S.inp} value={form.replyStatus} onChange={e=>setField("replyStatus",e.target.value)} placeholder="例：4/27 初回返信済"/></Field>
              <Field label="見積状況"><input style={S.inp} value={form.quoteStatus} onChange={e=>setField("quoteStatus",e.target.value)} placeholder="例：見積提出済"/></Field>
            </div>

            <div style={S.secTitle}>メモ</div>
            <textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={4} value={form.memo} onChange={e=>setField("memo",e.target.value)} placeholder="自由記述"/>

            <div style={S.secTitle}>✨ AI返信文生成</div>
            <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",marginBottom:".75rem"}}>
              <button style={S.btn("ai")} disabled={aiLoading} onClick={()=>handleAIReply("initial")}>{aiLoading?"⏳":"✨ 初回返信"}</button>
              <button style={S.btn("ai")} disabled={aiLoading} onClick={()=>handleAIReply("quote")}>{aiLoading?"⏳":"✨ 見積提案"}</button>
              <button style={S.btn("ai")} disabled={aiLoading} onClick={()=>handleAIReply("confirmed")}>{aiLoading?"⏳":"✨ 成約御礼"}</button>
            </div>
            {aiReply && (
              <div style={{position:"relative",background:"#0f0f0f",border:"1px solid rgba(201,168,76,0.1)",borderRadius:6,padding:"1rem",fontSize:".82rem",lineHeight:1.75,color:"rgba(240,232,208,0.8)",whiteSpace:"pre-wrap"}}>
                {aiReply}
                <button style={{position:"absolute",top:".6rem",right:".6rem",padding:".25rem .6rem",background:"rgba(201,168,76,0.13)",border:"1px solid rgba(201,168,76,0.27)",borderRadius:3,color:"#c9a84c",fontSize:".6rem",cursor:"pointer"}} onClick={()=>copyText(aiReply,"reply")}>{copied==="reply"?"✓ 完了":"コピー"}</button>
              </div>
            )}
          </div>
        </div>

        <div style={{display:"flex",gap:".5rem",marginTop:"1.5rem",flexWrap:"wrap"}}>
          <button style={{...S.btn("gold"),flex:1,maxWidth:200}} onClick={handleSave}>💾 保存</button>
          <button style={S.btn("ghost")} onClick={()=>setView("list")}>キャンセル</button>
          {editingId && (
            <button style={{...S.btn("danger"),marginLeft:"auto"}} onClick={async()=>{await handleDelete(editingId);setView("list");}}>🗑 削除</button>
          )}
        </div>
      </div>
    );
  }

  // 一覧
  return (
    <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:".5rem"}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>🍽 貸切管理</h2>
        <button style={S.btn("gold")} onClick={startNew}>＋ 新規問い合わせ</button>
      </div>

      {/* ステータス別件数 */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:".5rem",marginBottom:"1.25rem"}}>
        <div onClick={()=>setFilter("all")} style={{padding:".55rem .7rem",background:filter==="all"?"rgba(201,168,76,0.15)":"#111",border:`1px solid ${filter==="all"?"#c9a84c":"rgba(201,168,76,0.1)"}`,borderRadius:4,cursor:"pointer",textAlign:"center"}}>
          <div style={{fontSize:".58rem",letterSpacing:".1em",color:"rgba(240,232,208,0.5)",marginBottom:".15rem"}}>すべて</div>
          <div style={{fontSize:"1.1rem",color:"#c9a84c",fontFamily:"Georgia,serif"}}>{rentals.length}</div>
        </div>
        {statusCounts.map(s=>(
          <div key={s.key} onClick={()=>setFilter(s.key)} style={{padding:".55rem .7rem",background:filter===s.key?s.color+"22":"#111",border:`1px solid ${filter===s.key?s.color:"rgba(201,168,76,0.1)"}`,borderRadius:4,cursor:"pointer",textAlign:"center"}}>
            <div style={{fontSize:".58rem",letterSpacing:".1em",color:s.color,marginBottom:".15rem"}}>{s.label}</div>
            <div style={{fontSize:"1.1rem",color:"#f0e8d0",fontFamily:"Georgia,serif"}}>{s.count}</div>
          </div>
        ))}
      </div>

      {/* 一覧 */}
      {sorted.length === 0 && (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.25)",fontSize:".85rem"}}>
          🍽 該当する問い合わせはありません
        </div>
      )}
      {sorted.map(r=>(
        <div key={r._id} style={S.card} className="hb-card">
          <div onClick={()=>startEdit(r)} style={{cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:".35rem"}}>
              <span style={{fontFamily:"Georgia,serif",fontSize:"1rem"}}>{r.contactName||"（無題）"}</span>
              <StatusBadge status={r.status}/>
            </div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",display:"flex",gap:"1rem",flexWrap:"wrap"}}>
              {r.desiredDate && <span>📅 希望: {r.desiredDate} {r.desiredTime}</span>}
              {r.people && <span>👥 {r.people}名</span>}
              {r.purpose && <span>📝 {r.purpose}</span>}
              {r.inquiryDate && <span style={{opacity:.6}}>問合: {r.inquiryDate}</span>}
            </div>
          </div>
          <div style={{display:"flex",gap:".4rem"}}>
            <button style={S.btn("sm")} onClick={()=>startEdit(r)}>編集</button>
            <button style={S.btn("danger")} onClick={()=>handleDelete(r._id)}>削除</button>
          </div>
        </div>
      ))}
    </div>
  );
}

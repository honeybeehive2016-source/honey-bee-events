import { useState, useEffect } from "react";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const emptyForm = {
  name: "", date: "", day: "", open: "", start: "",
  price: "", cap: "", perf: "", desc: "", url: "", notes: "", genre: "",
};

// ============================================================
// CSV パーサー
// 列：日付 / 曜日 / イベント名 / 内容 / 開場開演(18:00/19:00) / 料金 / バンド入り
// ============================================================
function parseCSVLine(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
    cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

function toTime(s) {
  if (!s) return "";
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2,"0")}:${m[2]}` : "";
}

function parseCSV(text) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const lines = text.trim().split(/\r?\n/);
  const results = [];

  // ヘッダー行スキップ判定
  const firstCol = parseCSVLine(lines[0])[0] || "";
  const startIdx = /^\d{1,2}\/\d{1,2}$|^\d{4}/.test(firstCol) ? 0 : 1;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const rawDate = cols[0] || "";
    const rawName = cols[2] || "";
    if (!rawName) continue;

    // 日付変換: 04/01 → YYYY-MM-DD
    let isoDate = "";
    const m4 = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    const m2 = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (m4) {
      isoDate = `${m4[1]}-${m4[2].padStart(2,"0")}-${m4[3].padStart(2,"0")}`;
    } else if (m2) {
      const mo = parseInt(m2[1]), da = parseInt(m2[2]);
      // 年をまたぐ処理：現在月より大幅に前の月は来年と判断
      let year = currentYear;
      if (mo < currentMonth - 3) year = currentYear + 1;
      isoDate = `${year}-${String(mo).padStart(2,"0")}-${String(da).padStart(2,"0")}`;
    }

    // 曜日
    let day = "";
    if (cols[1]) {
      day = cols[1].replace(/曜日?/, "").trim() + "曜日";
    } else if (isoDate) {
      const d = new Date(isoDate + "T00:00:00");
      day = DAYS[d.getDay()] + "曜日";
    }

    // 開場/開演: E列が "18:00/19:00" または "18:00" 形式
    const timeCol = cols[4] || "";
    const timeParts = timeCol.split("/");
    const open = toTime(timeParts[0]);
    const start = toTime(timeParts[1] || "");

    results.push({
      date: isoDate,
      day,
      name: rawName,
      perf: cols[3] || "",
      open,
      start,
      price: cols[5] || "",
      rehearsal: cols[6] || "",
      poster: cols[7] || "",
      timetable: cols[8] || "",
      desc: "", url: "", notes: "", genre: "", cap: "",
      savedAt: new Date().toLocaleDateString("ja-JP"),
    });
  }
  return results;
}

// ============================================================
// テキスト生成
// ============================================================
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日`;
}
function fmtTime(t) { return t ? t.substring(0,5) : ""; }

function generateTexts(d) {
  const date = fmtDate(d.date) || "日程未定";
  const open = fmtTime(d.open), start = fmtTime(d.start);
  const timeStr = [open && "開場 "+open, start && "開演 "+start].filter(Boolean).join(" / ");
  const name = d.name || "イベント";
  const genre = d.genre || "ライブ";

  const hp = [
    `■ ${name}`,"",`${date}（${d.day}）`,timeStr,
    `料金：${d.price||"未定"}`, d.cap?`定員：${d.cap}名`:"","",
    d.perf?`【出演】\n${d.perf}`:"",
    d.desc?`\n【内容】\n${d.desc}`:"",
    d.url?`\n▶ ご予約はこちら\n${d.url}`:"",
    d.notes?`\n【注意事項】\n${d.notes}`:"",
  ].filter(s=>s!=="").join("\n").trim();

  const ig = [
    `🎵 ${name} 🎵`,"",`📅 ${date}（${d.day}）`,
    open?`🚪 開場 ${open}`:"", start?`🎤 開演 ${start}`:"",
    `💴 ${d.price||"未定"}`, d.cap?`👥 定員：${d.cap}名`:"","",
    d.perf?`✨ 出演：${d.perf}`:"",
    d.desc?"\n"+d.desc:"",
    d.url?"\n🔗 ご予約・詳細はプロフのリンクから！":"",
    "\n#honeybee #ライブ #音楽イベント #大船 #"+name.replace(/\s/g,""),
  ].filter(s=>s!=="").join("\n").trim();

  const fb = [
    `【イベントのお知らせ】${name}`,"",
    "こんにちは、HONEY BEEです。\n素晴らしい夜をお届けするイベントのご案内です。","",
    "━━━━━━━━━━━━━━",
    `📅 日程：${date}（${d.day}）`, timeStr?`🕐 ${timeStr}`:"",
    `💴 料金：${d.price||"未定"}`, d.cap?`👥 定員：${d.cap}名（先着順）`:"",
    "━━━━━━━━━━━━━━","",
    d.perf?`【出演者】\n${d.perf}\n`:"", d.desc?d.desc+"\n":"",
    "ぜひお誘い合わせの上、ご来場ください。\n皆さまのお越しをお待ちしております。",
    d.url?`\n▶ ご予約はこちら\n${d.url}`:"",
    d.notes?"\n※ "+d.notes.split("\n").join("\n※ "):"",
  ].filter(s=>s!=="").join("\n").trim();

  const gf = [
    `このフォームは「${name}」のご予約専用フォームです。`,"","【イベント詳細】",
    `日程：${date}（${d.day}）`, timeStr, `料金：${d.price||"未定"}`,
    d.cap?`定員：${d.cap}名（先着順・定員になり次第締め切り）`:"",
    d.perf?`出演：${d.perf}`:"","", d.desc||"","",
    "ご予約の確認メールは自動送信されます。",
    d.notes?`\n【ご注意】\n${d.notes}`:"",
    "\nフォームの送信をもってご予約完了となります。\nご不明な点はHONEY BEEまでお問い合わせください。",
  ].filter(s=>s!=="").join("\n").trim();

  const cp = [
    `✦ ${name} ✦`, `${date}（${d.day}）— HONEY BEE`,
    `${d.price||""}${d.url?" | 予約受付中":""}`, "",
    d.desc?d.desc.slice(0,60)+(d.desc.length>60?"...":""):"",
    d.url?"\n"+d.url:"",
  ].filter(s=>s!=="").join("\n").trim();

  const wixDetail = [
    name,"","■ 日程",`${date}（${d.day}）`,"",
    "■ OPEN / START", timeStr||"未定","","■ 料金",d.price||"未定","",
    d.perf?`■ 出演者\n${d.perf}\n`:"",
    d.desc?`■ イベント説明\n${d.desc}\n`:"",
    "■ ご予約",
    d.url?`下記URLよりご予約ください。\n${d.url}`:"お電話またはSNSのDMよりお問い合わせください。",
    "", d.notes?`■ 注意事項\n${d.notes}\n`:"",
    "─────────────────────","INFO：HONEY BEE　0467-46-5576",
  ].filter(s=>s!=="").join("\n").trim();

  const wixSchedule = [
    `【${date}（${d.day}）】`, name, timeStr,
    `料金：${d.price||"未定"}`,
    d.perf?`出演：${d.perf}`:"", d.url?`予約：${d.url}`:"",
  ].filter(s=>s!=="").join("\n").trim();

  const shortDesc = d.desc?d.desc.slice(0,80)+(d.desc.length>80?"…":""):"";
  const wixPickup = [
    "▶ NEXT EVENT", `「${name}」`,
    `${date}（${d.day}）${timeStr?"　"+timeStr:""}`,
    shortDesc, d.url?`予約受付中 → ${d.url}`:"",
  ].filter(s=>s!=="").join("\n").trim();

  const seoTitle = `${name}｜大船HONEY BEE`;
  const seoDesc = [
    `大船のライブハウスHONEY BEEで開催される${genre}イベント「${name}」。`,
    `${date}（${d.day}）`, timeStr?timeStr+"。":"",
    d.perf?`出演：${d.perf}。`:"", d.price?`料金：${d.price}。`:"",
    "大船駅近く、こだわりの音楽空間でライブをお楽しみください。",
  ].filter(s=>s!=="").join("").slice(0,160);

  const altText = `大船HONEY BEEで開催される${d.perf?d.perf+"の":""}${genre}ライブイベント「${name}」${date}`;
  const reserveBtn = d.url?`「${name}」を予約する`:`「${name}」のご予約はお電話で`;

  return { hp, ig, fb, gf, cp, wixDetail, wixSchedule, wixPickup, seoTitle, seoDesc, altText, reserveBtn };
}

const OUTPUT_TABS = [
  { key:"hp", label:"HP用" }, { key:"ig", label:"Instagram" },
  { key:"fb", label:"Facebook" }, { key:"gf", label:"フォーム" },
  { key:"cp", label:"告知コピー" }, { key:"wix", label:"🌐 Wix" },
];
const WIX_SECTIONS = [
  { key:"wixDetail", label:"イベント詳細ページ本文" },
  { key:"wixSchedule", label:"月間スケジュール用" },
  { key:"wixPickup", label:"トップページ ピックアップ" },
  { key:"seoTitle", label:"SEOタイトル", note:v=>`${v.length}文字（推奨：60文字以内）` },
  { key:"seoDesc", label:"SEOディスクリプション", note:v=>`${v.length}文字（推奨：160文字以内）` },
  { key:"altText", label:"画像 alt テキスト" },
  { key:"reserveBtn", label:"予約ボタン文言" },
];

// ============================================================
// スタイル
// ============================================================
const S = {
  app: { background:"#0a0a0a", color:"#f0e8d0", minHeight:"100vh", fontFamily:"'DM Sans',sans-serif" },
  hdr: { background:"linear-gradient(180deg,#1a1400 0%,#0a0a0a 100%)", borderBottom:"1px solid rgba(201,168,76,0.27)", padding:"1.1rem 2rem", display:"flex", alignItems:"center", justifyContent:"space-between" },
  logo: { fontFamily:"Georgia,serif", fontSize:"1.4rem", fontWeight:700, color:"#c9a84c", letterSpacing:".15em" },
  logoSm: { color:"#f0e8d0", fontSize:".52em", letterSpacing:".3em", display:"block", fontWeight:300 },
  secTitle: { fontFamily:"Georgia,serif", fontSize:".7rem", letterSpacing:".25em", textTransform:"uppercase", color:"#c9a84c", borderBottom:"1px solid rgba(201,168,76,0.2)", paddingBottom:".5rem", marginBottom:".75rem" },
  btn: v => {
    const b = { padding:".5rem 1rem", borderRadius:4, fontFamily:"inherit", fontSize:".72rem", fontWeight:500, letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", transition:"all .15s", border:"none" };
    if (v==="gold") return {...b, background:"#c9a84c", color:"#0a0a0a"};
    if (v==="ghost") return {...b, background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)"};
    if (v==="danger") return {...b, background:"transparent", color:"#e24b4a", border:"1px solid rgba(226,75,74,0.27)"};
    if (v==="sm") return {...b, padding:".3rem .65rem", fontSize:".65rem", background:"transparent", color:"#c9a84c", border:"1px solid rgba(201,168,76,0.27)"};
    return b;
  },
  navTab: a => ({ padding:".38rem .9rem", borderRadius:3, border:"1px solid "+(a?"#c9a84c":"rgba(201,168,76,0.2)"), background:a?"#c9a84c":"transparent", color:a?"#0a0a0a":"rgba(201,168,76,0.55)", fontSize:".68rem", letterSpacing:".12em", textTransform:"uppercase", cursor:"pointer", fontFamily:"inherit" }),
  outTab: a => ({ padding:".32rem .65rem", borderRadius:3, border:"1px solid "+(a?"#c9a84c":"rgba(201,168,76,0.2)"), background:a?"#c9a84c":"transparent", color:a?"#0a0a0a":"rgba(201,168,76,0.55)", fontSize:".63rem", letterSpacing:".1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"inherit" }),
  card: tpl => ({ background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderLeft:tpl?"2px solid #c9a84c":undefined, borderRadius:6, padding:".85rem 1.1rem", marginBottom:".65rem", display:"grid", gridTemplateColumns:"1fr auto", gap:".75rem", alignItems:"center" }),
  badge: { display:"inline-block", padding:".12rem .45rem", borderRadius:2, fontSize:".58rem", letterSpacing:".1em", textTransform:"uppercase", background:"rgba(201,168,76,0.13)", color:"#c9a84c", marginLeft:".5rem" },
  lbl: { fontSize:".65rem", letterSpacing:".12em", textTransform:"uppercase", color:"rgba(201,168,76,0.6)", fontWeight:500, display:"block", marginBottom:".28rem" },
  inp: { background:"#111", border:"1px solid rgba(201,168,76,0.14)", borderRadius:4, color:"#f0e8d0", fontFamily:"inherit", fontSize:".85rem", padding:".5rem .65rem", outline:"none", width:"100%" },
  outTxt: { background:"#0f0f0f", border:"1px solid rgba(201,168,76,0.1)", borderRadius:6, padding:"1rem", fontSize:".8rem", lineHeight:1.75, color:"rgba(240,232,208,0.8)", whiteSpace:"pre-wrap", minHeight:160, position:"relative" },
  cpyBtn: { position:"absolute", top:".6rem", right:".6rem", padding:".22rem .55rem", background:"rgba(201,168,76,0.13)", border:"1px solid rgba(201,168,76,0.27)", borderRadius:3, color:"#c9a84c", fontSize:".58rem", letterSpacing:".1em", textTransform:"uppercase", cursor:"pointer", fontFamily:"inherit" },
  wixLbl: { fontSize:".63rem", letterSpacing:".15em", textTransform:"uppercase", color:"#7ec8e3", marginBottom:".38rem", display:"flex", alignItems:"center", justifyContent:"space-between" },
  wixCpy: done => ({ padding:".18rem .5rem", background:done?"rgba(126,200,227,0.25)":"rgba(126,200,227,0.1)", border:"1px solid rgba(126,200,227,0.3)", borderRadius:3, color:"#7ec8e3", fontSize:".58rem", cursor:"pointer", fontFamily:"inherit" }),
  wixTxt: { background:"#0a0f11", border:"1px solid rgba(126,200,227,0.12)", borderRadius:5, padding:".7rem .9rem", fontSize:".8rem", lineHeight:1.7, color:"rgba(240,232,208,0.75)", whiteSpace:"pre-wrap" },
};

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn:full?"1/-1":undefined, display:"flex", flexDirection:"column" }}>
      <label style={S.lbl}>{label}</label>
      {children}
    </div>
  );
}

// ============================================================
// カレンダーコンポーネント
// ============================================================
function CalendarView({ events, onEdit }) {
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  // イベントをdateでマップ化
  const eventMap = {};
  events.forEach(e => {
    if (!e.date) return;
    const key = e.date; // YYYY-MM-DD
    if (!eventMap[key]) eventMap[key] = [];
    eventMap[key].push(e);
  });

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y-1); setCalMonth(11); }
    else setCalMonth(m => m-1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y+1); setCalMonth(0); }
    else setCalMonth(m => m+1);
  };

  const monthStr = `${calYear}年${calMonth+1}月`;
  const dayLabels = ["日","月","火","水","木","金","土"];

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  return (
    <div style={{ marginBottom:"2rem" }}>
      {/* カレンダーヘッダー */}
      <div style={{ display:"flex", alignItems:"center", gap:"1rem", marginBottom:"1rem" }}>
        <button style={S.btn("ghost")} onClick={prevMonth}>◀</button>
        <div style={{ fontFamily:"Georgia,serif", fontSize:"1.1rem", color:"#c9a84c", flex:1, textAlign:"center" }}>{monthStr}</div>
        <button style={S.btn("ghost")} onClick={nextMonth}>▶</button>
      </div>

      {/* 曜日ラベル */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:2 }}>
        {dayLabels.map((d,i) => (
          <div key={d} style={{ textAlign:"center", fontSize:".65rem", padding:".3rem 0", color: i===0?"#e87c7c": i===6?"#7ec8e3":"rgba(240,232,208,0.4)", letterSpacing:".05em" }}>{d}</div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
        {cells.map((day, idx) => {
          if (!day) return <div key={idx} />;
          const mm = String(calMonth+1).padStart(2,"0");
          const dd = String(day).padStart(2,"0");
          const dateKey = `${calYear}-${mm}-${dd}`;
          const dayEvents = eventMap[dateKey] || [];
          const isToday = dateKey === todayStr;
          const dow = (firstDay + day - 1) % 7;
          const isSun = dow === 0, isSat = dow === 6;

          return (
            <div key={idx} style={{
              background: isToday ? "rgba(201,168,76,0.12)" : "#111",
              border: isToday ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(255,255,255,0.04)",
              borderRadius:4, padding:".3rem .25rem", minHeight:64,
            }}>
              <div style={{
                fontSize:".72rem", fontWeight:500, marginBottom:".2rem",
                color: isToday ? "#c9a84c" : isSun ? "#e87c7c" : isSat ? "#7ec8e3" : "rgba(240,232,208,0.6)",
              }}>{day}</div>
              {dayEvents.map((ev, ei) => (
                <div
                  key={ei}
                  onClick={() => onEdit(events.indexOf(ev))}
                  style={{
                    fontSize:".58rem", lineHeight:1.3, padding:".18rem .3rem", marginBottom:".15rem",
                    background:"rgba(201,168,76,0.15)", borderLeft:"2px solid #c9a84c",
                    borderRadius:2, cursor:"pointer", color:"#f0e8d0cc",
                    overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis",
                  }}
                  title={ev.name}
                >
                  {ev.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function App() {
  const [view, setView] = useState("list");
  const [listMode, setListMode] = useState("calendar"); // "calendar" | "list"
  const [form, setForm] = useState(emptyForm);
  const [editingIdx, setEditingIdx] = useState(null);
  const [events, setEvents] = useState(() => JSON.parse(localStorage.getItem("hb-events")||"[]"));
  const [templates, setTemplates] = useState(() => JSON.parse(localStorage.getItem("hb-templates")||"[]"));
  const [outputs, setOutputs] = useState(null);
  const [activeOut, setActiveOut] = useState("hp");
  const [tplName, setTplName] = useState("");
  const [showTplModal, setShowTplModal] = useState(false);
  const [copied, setCopied] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

  useEffect(() => { localStorage.setItem("hb-events", JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem("hb-templates", JSON.stringify(templates)); }, [templates]);

  const setField = (k, v) => setForm(f => {
    const next = {...f, [k]:v};
    if (k==="date" && v) { const d = new Date(v+"T00:00:00"); next.day = DAYS[d.getDay()]+"曜日"; }
    return next;
  });

  const clearForm = () => { setForm(emptyForm); setEditingIdx(null); setOutputs(null); };
  const handleGenerate = () => { setOutputs(generateTexts(form)); setActiveOut("hp"); };

  const handleSaveEvent = () => {
    if (!form.name) { alert("イベント名を入力してください"); return; }
    const d = {...form, savedAt:new Date().toLocaleDateString("ja-JP")};
    if (editingIdx !== null) { setEvents(ev => ev.map((e,i) => i===editingIdx?d:e)); }
    else { setEvents(ev => [...ev,d]); setEditingIdx(events.length); }
    alert("✓ イベントを保存しました");
  };

  const handleSaveTpl = () => {
    if (!tplName.trim()) { alert("テンプレート名を入力してください"); return; }
    setTemplates(t => [...t, {...form, name:tplName, savedAt:new Date().toLocaleDateString("ja-JP")}]);
    setShowTplModal(false); setTplName(""); alert("⭐ テンプレートを保存しました");
  };

  const editEvent = (i) => {
    if (i < 0 || i >= events.length) return;
    setForm(events[i]); setEditingIdx(i); setOutputs(null); setView("form");
  };
  const deleteEvent = (i) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    setEvents(ev => ev.filter((_,idx) => idx!==i));
  };
  const deleteTpl = (i) => {
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    setTemplates(t => t.filter((_,idx) => idx!==i));
  };
  const loadTpl = t => { setForm({...emptyForm,...t}); setOutputs(null); };
  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key); setTimeout(() => setCopied(""), 1600);
  };

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = parseCSV(ev.target.result);
        if (!imported.length) { setCsvMsg("⚠️ 読み込めるイベントがありませんでした。"); return; }
        setEvents(ev2 => {
          const merged = [...ev2];
          imported.forEach(imp => {
            const exists = merged.some(e => e.date===imp.date && e.name===imp.name);
            if (!exists) merged.push(imp);
          });
          return merged;
        });
        setCsvMsg(`✅ ${imported.length}件のイベントを読み込みました！`);
        setTimeout(() => setCsvMsg(""), 4000);
      } catch(err) {
        setCsvMsg("⚠️ 読み込みに失敗しました。CSVの形式を確認してください。");
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  // 日付順ソート
  const sortedEvents = [...events].sort((a,b) => (a.date||"").localeCompare(b.date||""));
  const currentOut = outputs && activeOut!=="wix" ? outputs[activeOut] : "";

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* ヘッダー */}
      <div style={S.hdr}>
        <div style={S.logo}>HONEY BEE <small style={S.logoSm}>Event Manager</small></div>
        <div style={{ display:"flex", gap:".4rem" }}>
          <button style={S.navTab(view==="list")} onClick={() => setView("list")}>📋 一覧</button>
          <button style={S.navTab(view==="form")} onClick={() => setView("form")}>✦ 新規作成</button>
        </div>
      </div>

      {/* ===== 一覧ビュー ===== */}
      {view==="list" && (
        <div style={{ padding:"1.5rem 2rem" }}>
          {/* ツールバー */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem", flexWrap:"wrap", gap:".5rem" }}>
            <div style={{ display:"flex", gap:".4rem" }}>
              <button style={S.navTab(listMode==="calendar")} onClick={() => setListMode("calendar")}>📅 カレンダー</button>
              <button style={S.navTab(listMode==="list")} onClick={() => setListMode("list")}>☰ リスト</button>
            </div>
            <div style={{ display:"flex", gap:".5rem", alignItems:"center" }}>
              <label style={{ ...S.btn("ghost"), cursor:"pointer" }}>
                📂 CSVを読み込む
                <input type="file" accept=".csv" onChange={handleCSV} style={{ display:"none" }} />
              </label>
              <button style={S.btn("gold")} onClick={() => { clearForm(); setView("form"); }}>＋ 新規</button>
            </div>
          </div>

          {csvMsg && (
            <div style={{ marginBottom:"1rem", padding:".6rem 1rem", borderRadius:5, background:csvMsg.startsWith("✅")?"rgba(100,200,100,0.1)":"rgba(226,75,74,0.1)", border:`1px solid ${csvMsg.startsWith("✅")?"rgba(100,200,100,0.3)":"rgba(226,75,74,0.3)"}`, fontSize:".8rem", color:csvMsg.startsWith("✅")?"#7ec87e":"#e24b4a" }}>
              {csvMsg}
            </div>
          )}

          {/* カレンダー表示 */}
          {listMode==="calendar" && (
            <CalendarView events={sortedEvents} onEdit={i => {
              // sortedEventsのiをeventsの実indexに変換
              const ev = sortedEvents[i];
              const realIdx = events.indexOf(ev);
              editEvent(realIdx);
            }} />
          )}

          {/* リスト表示 */}
          {listMode==="list" && (
            <>
              <div style={S.secTitle}>テンプレート</div>
              {templates.length===0 && <div style={{ color:"rgba(240,232,208,0.2)", fontSize:".75rem", marginBottom:"1rem" }}>テンプレートはまだありません</div>}
              {templates.map((t,i) => (
                <div key={i} style={S.card(true)}>
                  <div>
                    <div style={{ fontFamily:"Georgia,serif", fontSize:".95rem", marginBottom:".28rem" }}>⭐ {t.name} <span style={S.badge}>Template</span></div>
                    <div style={{ fontSize:".7rem", color:"rgba(240,232,208,0.4)" }}>保存日：{t.savedAt||"–"}</div>
                  </div>
                  <div style={{ display:"flex", gap:".4rem" }}>
                    <button style={S.btn("sm")} onClick={() => { loadTpl(t); setView("form"); }}>読み込み</button>
                    <button style={S.btn("danger")} onClick={() => deleteTpl(i)}>削除</button>
                  </div>
                </div>
              ))}

              <div style={{ ...S.secTitle, marginTop:"1.25rem" }}>イベント（{sortedEvents.length}件）</div>
              {sortedEvents.length===0 && <div style={{ textAlign:"center", padding:"2rem", color:"rgba(240,232,208,0.2)", fontSize:".8rem" }}>🍯 イベントはまだありません</div>}
              {sortedEvents.map((e, si) => {
                const realIdx = events.indexOf(e);
                return (
                  <div key={si} style={S.card(false)}>
                    <div>
                      <div style={{ fontFamily:"Georgia,serif", fontSize:".95rem", marginBottom:".28rem" }}>{e.name||"（無題）"}</div>
                      <div style={{ fontSize:".7rem", color:"rgba(240,232,208,0.4)", display:"flex", gap:".75rem", flexWrap:"wrap" }}>
                        {e.date && <span>📅 {fmtDate(e.date)}（{e.day}）</span>}
                        {e.open && <span>🚪 {e.open}</span>}
                        {e.price && <span>💴 {e.price}</span>}
                        {e.poster && <a href={e.poster} target="_blank" rel="noreferrer" style={{ color:"#c9a84c88", textDecoration:"none" }}>🖼 ポスター</a>}
                        {e.timetable && <a href={e.timetable} target="_blank" rel="noreferrer" style={{ color:"#c9a84c88", textDecoration:"none" }}>📋 TT</a>}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:".4rem" }}>
                      <button style={S.btn("sm")} onClick={() => editEvent(realIdx)}>編集</button>
                      <button style={S.btn("danger")} onClick={() => deleteEvent(realIdx)}>削除</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ===== フォームビュー ===== */}
      {view==="form" && (
        <div style={{ padding:"1.5rem 2rem" }}>
          {templates.length>0 && (
            <div style={{ display:"flex", alignItems:"center", gap:".75rem", padding:".7rem 1rem", background:"#111", border:"1px solid rgba(201,168,76,0.1)", borderRadius:5, marginBottom:"1.25rem" }}>
              <label style={{ ...S.lbl, margin:0, whiteSpace:"nowrap" }}>テンプレートから読み込み：</label>
              <select style={{ ...S.inp, flex:1 }} defaultValue="" onChange={e => { if (e.target.value!=="") loadTpl(templates[parseInt(e.target.value)]); }}>
                <option value="">── テンプレートを選択 ──</option>
                {templates.map((t,i) => <option key={i} value={i}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5rem" }}>
            {/* 左：フォーム */}
            <div>
              <div style={S.secTitle}>イベント情報</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:".7rem" }}>
                <Field label="イベント名" full><input style={S.inp} value={form.name} onChange={e=>setField("name",e.target.value)} placeholder="例：Jazz Night Premium" /></Field>
                <Field label="日程"><input type="date" style={S.inp} value={form.date} onChange={e=>setField("date",e.target.value)} /></Field>
                <Field label="曜日"><input style={{...S.inp,color:"rgba(201,168,76,0.6)"}} value={form.day} readOnly placeholder="自動入力" /></Field>
                <Field label="開場時間"><input type="time" style={S.inp} value={form.open} onChange={e=>setField("open",e.target.value)} /></Field>
                <Field label="開演時間"><input type="time" style={S.inp} value={form.start} onChange={e=>setField("start",e.target.value)} /></Field>
                <Field label="料金"><input style={S.inp} value={form.price} onChange={e=>setField("price",e.target.value)} placeholder="例：¥3,000（1ドリンク付）" /></Field>
                <Field label="定員"><input type="number" style={S.inp} value={form.cap} onChange={e=>setField("cap",e.target.value)} placeholder="例：50" /></Field>
                <Field label="ジャンル（SEO用）" full><input style={S.inp} value={form.genre} onChange={e=>setField("genre",e.target.value)} placeholder="例：ジャズ / ロック" /></Field>
                <Field label="出演者" full><input style={S.inp} value={form.perf} onChange={e=>setField("perf",e.target.value)} placeholder="例：山田太郎（Gt）/ 田中花子（Vo）" /></Field>
                <Field label="イベント説明" full><textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={3} value={form.desc} onChange={e=>setField("desc",e.target.value)} placeholder="イベントの雰囲気・内容" /></Field>
                <Field label="予約URL" full><input type="url" style={S.inp} value={form.url} onChange={e=>setField("url",e.target.value)} placeholder="https://..." /></Field>
                <Field label="注意事項" full><textarea style={{...S.inp,resize:"vertical",lineHeight:1.5}} rows={2} value={form.notes} onChange={e=>setField("notes",e.target.value)} placeholder="未成年者入場不可 / etc." /></Field>
              </div>
              <div style={{ display:"flex", gap:".5rem", marginTop:"1rem", flexWrap:"wrap" }}>
                <button style={{...S.btn("gold"),flex:1}} onClick={handleGenerate}>✦ 文章を生成</button>
                <button style={S.btn("ghost")} onClick={handleSaveEvent}>💾 保存</button>
                <button style={S.btn("ghost")} onClick={() => { setTplName(form.name); setShowTplModal(true); }}>⭐</button>
              </div>
              <div style={{ display:"flex", gap:".5rem", marginTop:".5rem" }}>
                <button style={S.btn("sm")} onClick={clearForm}>クリア</button>
                <button style={S.btn("sm")} onClick={() => setView("list")}>← 一覧に戻る</button>
              </div>
            </div>

            {/* 右：出力 */}
            <div style={{ borderLeft:"1px solid rgba(201,168,76,0.1)", paddingLeft:"1.5rem" }}>
              <div style={S.secTitle}>生成テキスト</div>
              <div style={{ display:"flex", gap:".35rem", marginBottom:"1rem", flexWrap:"wrap" }}>
                {OUTPUT_TABS.map(t => (
                  <button key={t.key} style={S.outTab(activeOut===t.key)} onClick={() => setActiveOut(t.key)}>{t.label}</button>
                ))}
              </div>

              {!outputs && <div style={{ textAlign:"center", padding:"2.5rem 1rem", color:"rgba(240,232,208,0.2)", fontSize:".8rem" }}>「文章を生成」を押してください 🍯</div>}

              {outputs && activeOut!=="wix" && (
                <div style={{ position:"relative" }}>
                  <div style={S.outTxt}>{currentOut}</div>
                  <button style={S.cpyBtn} onClick={() => copyText(currentOut, activeOut)}>{copied===activeOut?"✓ 完了":"コピー"}</button>
                  {activeOut==="ig" && <div style={{ fontSize:".62rem", color:"rgba(201,168,76,0.4)", textAlign:"right", marginTop:".25rem" }}>文字数：{currentOut.length}（目安：2,200字以内）</div>}
                </div>
              )}

              {outputs && activeOut==="wix" && (
                <div>
                  <div style={{ fontSize:".7rem", color:"#7ec8e3", marginBottom:"1rem", padding:".5rem .75rem", background:"rgba(126,200,227,0.06)", borderRadius:4, borderLeft:"2px solid rgba(126,200,227,0.4)" }}>
                    🌐 Wixサイト更新用テキスト
                  </div>
                  {WIX_SECTIONS.map(sec => (
                    <div key={sec.key} style={{ marginBottom:"1.1rem" }}>
                      <div style={S.wixLbl}>
                        <span>{sec.label}</span>
                        <button style={S.wixCpy(copied===sec.key)} onClick={() => copyText(outputs[sec.key], sec.key)}>{copied===sec.key?"✓ 完了":"コピー"}</button>
                      </div>
                      <div style={S.wixTxt}>{outputs[sec.key]}</div>
                      {sec.note && <div style={{ fontSize:".62rem", color:"rgba(126,200,227,0.4)", textAlign:"right", marginTop:".18rem" }}>{sec.note(outputs[sec.key])}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* テンプレート保存モーダル */}
      {showTplModal && (
        <div style={{ position:"fixed", top:0, left:0, width:"100%", height:"100%", background:"rgba(0,0,0,0.8)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#111", border:"1px solid rgba(201,168,76,0.27)", borderRadius:8, padding:"1.5rem", width:340 }}>
            <div style={{ fontFamily:"Georgia,serif", fontSize:".9rem", color:"#c9a84c", marginBottom:"1rem" }}>⭐ テンプレートとして保存</div>
            <label style={S.lbl}>テンプレート名</label>
            <input style={{...S.inp, marginTop:".3rem", marginBottom:".7rem"}} value={tplName} onChange={e=>setTplName(e.target.value)} placeholder="例：定期ジャズナイト" />
            <div style={{ display:"flex", gap:".5rem" }}>
              <button style={S.btn("gold")} onClick={handleSaveTpl}>保存</button>
              <button style={S.btn("ghost")} onClick={() => setShowTplModal(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

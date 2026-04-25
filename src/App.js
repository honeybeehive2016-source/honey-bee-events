import { useState, useEffect } from "react";

// ============================================================
// DATA STRUCTURE（将来のWix CMS API連携用）
// Wix CMS コレクション名: "Events"
//   name   -> title (Text)
//   date   -> date (Date)
//   day    -> dayOfWeek (Text)
//   open   -> openTime (Text)
//   start  -> startTime (Text)
//   price  -> price (Text)
//   cap    -> capacity (Number)
//   perf   -> performers (Text)
//   desc   -> description (RichText)
//   url    -> reservationUrl (URL)
//   notes  -> notes (Text)
//   genre  -> genre (Text) ※SEO用
// ============================================================

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

const emptyForm = {
  name: "", date: "", day: "", open: "", start: "",
  price: "", cap: "", perf: "", desc: "", url: "", notes: "", genre: "",
};

// スプレッドシートの列順：日付/曜日/イベント名/内容/開場/開演/料金/演者入り時間/ポスター/タイムテーブル
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const results = [];
  // 1行目がヘッダーかどうか判定（日付っぽくなければスキップ）
  const startIdx = lines[0] && /^\d{4}|^\d{1,2}\//.test(lines[0].trim()) ? 0 : 1;
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
    if (!cols[2]) continue; // イベント名がなければスキップ
    // 日付をYYYY-MM-DD形式に変換
    let rawDate = cols[0] || "";
    let isoDate = "";
    // 2026/4/25 や 2026-04-25 など対応
    const m = rawDate.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (m) isoDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
    // 曜日
    let day = cols[1] ? cols[1].replace(/曜日?/, "") + "曜日" : "";
    if (!day && isoDate) {
      const d = new Date(isoDate + "T00:00:00");
      day = DAYS[d.getDay()] + "曜日";
    }
    // 時間をHH:MM形式に変換
    const toTime = (s) => {
      if (!s) return "";
      const tm = s.match(/(\d{1,2}):(\d{2})/);
      if (tm) return `${tm[1].padStart(2,"0")}:${tm[2]}`;
      return "";
    };
    results.push({
      date: isoDate,
      day,
      name: cols[2] || "",
      perf: cols[3] || "",   // 内容 → 出演者
      open: toTime(cols[4]), // 開場
      start: toTime(cols[5]),// 開演
      price: cols[6] || "",
      rehearsal: cols[7] || "",   // 演者入り時間（参考情報として保持）
      poster: cols[8] || "",      // ポスターURL
      timetable: cols[9] || "",   // タイムテーブルURL
      desc: "",
      url: "",
      notes: "",
      genre: "",
      cap: "",
      savedAt: new Date().toLocaleDateString("ja-JP"),
    });
  }
  return results;
}

function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`;
}
function fmtTime(t) { return t ? t.substring(0, 5) : ""; }

function generateTexts(d) {
  const date = fmtDate(d.date) || "日程未定";
  const open = fmtTime(d.open);
  const start = fmtTime(d.start);
  const timeStr = [open && "開場 " + open, start && "開演 " + start].filter(Boolean).join(" / ");
  const name = d.name || "イベント";
  const genre = d.genre || "ライブ";

  const hp = [
    `■ ${name}`, "",
    `${date}（${d.day}）`, timeStr,
    `料金：${d.price || "未定"}`,
    d.cap ? `定員：${d.cap}名` : "", "",
    d.perf ? `【出演】\n${d.perf}` : "",
    d.desc ? `\n【内容】\n${d.desc}` : "",
    d.url ? `\n▶ ご予約はこちら\n${d.url}` : "",
    d.notes ? `\n【注意事項】\n${d.notes}` : "",
  ].filter(s => s !== "").join("\n").trim();

  const ig = [
    `🎵 ${name} 🎵`, "",
    `📅 ${date}（${d.day}）`,
    open ? `🚪 開場 ${open}` : "",
    start ? `🎤 開演 ${start}` : "",
    `💴 ${d.price || "未定"}`,
    d.cap ? `👥 定員：${d.cap}名` : "", "",
    d.perf ? `✨ 出演：${d.perf}` : "",
    d.desc ? "\n" + d.desc : "",
    d.url ? "\n🔗 ご予約・詳細はプロフのリンクから！" : "",
    "\n#honeybee #ライブ #音楽イベント #大船 #" + name.replace(/\s/g, ""),
  ].filter(s => s !== "").join("\n").trim();

  const fb = [
    `【イベントのお知らせ】${name}`, "",
    "こんにちは、HONEY BEEです。\n素晴らしい夜をお届けするイベントのご案内です。", "",
    "━━━━━━━━━━━━━━",
    `📅 日程：${date}（${d.day}）`,
    timeStr ? `🕐 ${timeStr}` : "",
    `💴 料金：${d.price || "未定"}`,
    d.cap ? `👥 定員：${d.cap}名（先着順）` : "",
    "━━━━━━━━━━━━━━", "",
    d.perf ? `【出演者】\n${d.perf}\n` : "",
    d.desc ? d.desc + "\n" : "",
    "ぜひお誘い合わせの上、ご来場ください。\n皆さまのお越しをお待ちしております。",
    d.url ? `\n▶ ご予約はこちら\n${d.url}` : "",
    d.notes ? "\n※ " + d.notes.split("\n").join("\n※ ") : "",
  ].filter(s => s !== "").join("\n").trim();

  const gf = [
    `このフォームは「${name}」のご予約専用フォームです。`, "",
    "【イベント詳細】",
    `日程：${date}（${d.day}）`, timeStr,
    `料金：${d.price || "未定"}`,
    d.cap ? `定員：${d.cap}名（先着順・定員になり次第締め切り）` : "",
    d.perf ? `出演：${d.perf}` : "", "",
    d.desc || "", "",
    "ご予約の確認メールは自動送信されます。",
    d.notes ? `\n【ご注意】\n${d.notes}` : "",
    "\nフォームの送信をもってご予約完了となります。\nご不明な点はHONEY BEEまでお問い合わせください。",
  ].filter(s => s !== "").join("\n").trim();

  const cp = [
    `✦ ${name} ✦`,
    `${date}（${d.day}）— HONEY BEE`,
    `${d.price || ""}${d.url ? " | 予約受付中" : ""}`, "",
    d.desc ? d.desc.slice(0, 60) + (d.desc.length > 60 ? "..." : "") : "",
    d.url ? "\n" + d.url : "",
  ].filter(s => s !== "").join("\n").trim();

  // ── Wix用 ──────────────────────────────────────

  const wixDetail = [
    name, "",
    "■ 日程", `${date}（${d.day}）`, "",
    "■ OPEN / START", timeStr || "未定", "",
    "■ 料金", d.price || "未定", "",
    d.perf ? `■ 出演者\n${d.perf}\n` : "",
    d.desc ? `■ イベント説明\n${d.desc}\n` : "",
    "■ ご予約",
    d.url ? `下記URLよりご予約ください。\n${d.url}` : "お電話またはSNSのDMよりお問い合わせください。",
    "",
    d.notes ? `■ 注意事項\n${d.notes}\n` : "",
    "─────────────────────",
    "INFO：HONEY BEE　0467-46-5576",
  ].filter(s => s !== "").join("\n").trim();

  const wixSchedule = [
    `【${date}（${d.day}）】`, name, timeStr,
    `料金：${d.price || "未定"}`,
    d.perf ? `出演：${d.perf}` : "",
    d.url ? `予約：${d.url}` : "",
  ].filter(s => s !== "").join("\n").trim();

  const shortDesc = d.desc ? d.desc.slice(0, 80) + (d.desc.length > 80 ? "…" : "") : "";
  const wixPickup = [
    "▶ NEXT EVENT",
    `「${name}」`,
    `${date}（${d.day}）${timeStr ? "　" + timeStr : ""}`,
    shortDesc,
    d.url ? `予約受付中 → ${d.url}` : "",
  ].filter(s => s !== "").join("\n").trim();

  const seoTitle = `${name}｜大船HONEY BEE`;

  const seoDesc = [
    `大船のライブハウスHONEY BEEで開催される${genre}イベント「${name}」。`,
    `${date}（${d.day}）`,
    timeStr ? timeStr + "。" : "",
    d.perf ? `出演：${d.perf}。` : "",
    d.price ? `料金：${d.price}。` : "",
    "大船駅近く、こだわりの音楽空間でライブをお楽しみください。",
  ].filter(s => s !== "").join("").slice(0, 160);

  const altText = `大船HONEY BEEで開催される${d.perf ? d.perf + "の" : ""}${genre}ライブイベント「${name}」${date}`;

  const reserveBtn = d.url ? `「${name}」を予約する` : `「${name}」のご予約はお電話で`;

  return { hp, ig, fb, gf, cp, wixDetail, wixSchedule, wixPickup, seoTitle, seoDesc, altText, reserveBtn };
}

const OUTPUT_TABS = [
  { key: "hp", label: "HP用" },
  { key: "ig", label: "Instagram" },
  { key: "fb", label: "Facebook" },
  { key: "gf", label: "フォーム" },
  { key: "cp", label: "告知コピー" },
  { key: "wix", label: "🌐 Wix" },
];

const WIX_SECTIONS = [
  { key: "wixDetail",   label: "イベント詳細ページ本文" },
  { key: "wixSchedule", label: "月間スケジュール用" },
  { key: "wixPickup",   label: "トップページ ピックアップ" },
  { key: "seoTitle",    label: "SEOタイトル", note: (v) => `${v.length}文字（推奨：60文字以内）` },
  { key: "seoDesc",     label: "SEOディスクリプション", note: (v) => `${v.length}文字（推奨：160文字以内）` },
  { key: "altText",     label: "画像 alt テキスト" },
  { key: "reserveBtn",  label: "予約ボタン文言" },
];

const S = {
  app: { background: "#0a0a0a", color: "#f0e8d0", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  hdr: { background: "linear-gradient(180deg,#1a1400 0%,#0a0a0a 100%)", borderBottom: "1px solid rgba(201,168,76,0.27)", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { fontFamily: "Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "#c9a84c", letterSpacing: ".15em" },
  logoSm: { color: "#f0e8d0", fontSize: ".55em", letterSpacing: ".3em", display: "block", fontWeight: 300 },
  secTitle: { fontFamily: "Georgia, serif", fontSize: ".7rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#c9a84c", borderBottom: "1px solid rgba(201,168,76,0.2)", paddingBottom: ".5rem", marginBottom: ".75rem" },
  btn: (v) => {
    const b = { padding: ".55rem 1.1rem", borderRadius: 4, fontFamily: "inherit", fontSize: ".72rem", fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", transition: "all .15s" };
    if (v === "gold") return { ...b, background: "#c9a84c", color: "#0a0a0a", border: "none" };
    if (v === "ghost") return { ...b, background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.27)" };
    if (v === "danger") return { ...b, background: "transparent", color: "#e24b4a", border: "1px solid rgba(226,75,74,0.27)" };
    if (v === "sm") return { ...b, padding: ".35rem .7rem", fontSize: ".65rem", background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.27)" };
    return b;
  },
  card: (tpl) => ({ background: "#111", border: "1px solid rgba(201,168,76,0.1)", borderLeft: tpl ? "2px solid #c9a84c" : undefined, borderRadius: 6, padding: "1rem 1.25rem", marginBottom: ".75rem", display: "grid", gridTemplateColumns: "1fr auto", gap: ".75rem", alignItems: "center" }),
  badge: { display: "inline-block", padding: ".15rem .5rem", borderRadius: 2, fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(201,168,76,0.13)", color: "#c9a84c", marginLeft: ".5rem" },
  fgrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" },
  lbl: { fontSize: ".67rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(201,168,76,0.6)", fontWeight: 500, display: "block", marginBottom: ".3rem" },
  inp: { background: "#111", border: "1px solid rgba(201,168,76,0.14)", borderRadius: 4, color: "#f0e8d0", fontFamily: "inherit", fontSize: ".85rem", padding: ".55rem .7rem", outline: "none", width: "100%" },
  outTab: (a) => ({ padding: ".35rem .7rem", borderRadius: 3, border: "1px solid " + (a ? "#c9a84c" : "rgba(201,168,76,0.2)"), background: a ? "#c9a84c" : "transparent", color: a ? "#0a0a0a" : "rgba(201,168,76,0.55)", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  navTab: (a) => ({ padding: ".4rem 1rem", borderRadius: 3, border: "1px solid " + (a ? "#c9a84c" : "rgba(201,168,76,0.2)"), background: a ? "#c9a84c" : "transparent", color: a ? "#0a0a0a" : "rgba(201,168,76,0.55)", fontSize: ".7rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  outTxt: { background: "#0f0f0f", border: "1px solid rgba(201,168,76,0.1)", borderRadius: 6, padding: "1rem", fontSize: ".82rem", lineHeight: 1.75, color: "rgba(240,232,208,0.8)", whiteSpace: "pre-wrap", minHeight: 160, position: "relative" },
  cpyBtn: { position: "absolute", top: ".6rem", right: ".6rem", padding: ".25rem .6rem", background: "rgba(201,168,76,0.13)", border: "1px solid rgba(201,168,76,0.27)", borderRadius: 3, color: "#c9a84c", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" },
  wixLbl: { fontSize: ".65rem", letterSpacing: ".15em", textTransform: "uppercase", color: "#7ec8e3", marginBottom: ".4rem", display: "flex", alignItems: "center", justifyContent: "space-between" },
  wixCpy: (done) => ({ padding: ".2rem .55rem", background: done ? "rgba(126,200,227,0.25)" : "rgba(126,200,227,0.1)", border: "1px solid rgba(126,200,227,0.3)", borderRadius: 3, color: "#7ec8e3", fontSize: ".6rem", cursor: "pointer", fontFamily: "inherit", letterSpacing: ".08em" }),
  wixTxt: { background: "#0a0f11", border: "1px solid rgba(126,200,227,0.12)", borderRadius: 5, padding: ".75rem 1rem", fontSize: ".82rem", lineHeight: 1.7, color: "rgba(240,232,208,0.75)", whiteSpace: "pre-wrap" },
};

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined, display: "flex", flexDirection: "column" }}>
      <label style={S.lbl}>{label}</label>
      {children}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState("list");
  const [form, setForm] = useState(emptyForm);
  const [editingIdx, setEditingIdx] = useState(null);
  const [events, setEvents] = useState(() => JSON.parse(localStorage.getItem("hb-events") || "[]"));
  const [templates, setTemplates] = useState(() => JSON.parse(localStorage.getItem("hb-templates") || "[]"));
  const [outputs, setOutputs] = useState(null);
  const [activeOut, setActiveOut] = useState("hp");
  const [tplName, setTplName] = useState("");
  const [showTplModal, setShowTplModal] = useState(false);
  const [copied, setCopied] = useState("");
  const [csvMsg, setCsvMsg] = useState("");

  useEffect(() => { localStorage.setItem("hb-events", JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem("hb-templates", JSON.stringify(templates)); }, [templates]);

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = parseCSV(ev.target.result);
        if (imported.length === 0) { setCsvMsg("⚠️ 読み込めるイベントがありませんでした。"); return; }
        setEvents(ev2 => {
          const merged = [...ev2];
          imported.forEach(imp => {
            const exists = merged.some(e => e.date === imp.date && e.name === imp.name);
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

  const setField = (k, v) => setForm(f => {
    const next = { ...f, [k]: v };
    if (k === "date" && v) { const d = new Date(v + "T00:00:00"); next.day = DAYS[d.getDay()] + "曜日"; }
    return next;
  });

  const clearForm = () => { setForm(emptyForm); setEditingIdx(null); setOutputs(null); };
  const handleGenerate = () => { setOutputs(generateTexts(form)); setActiveOut("hp"); };

  const handleSaveEvent = () => {
    if (!form.name) { alert("イベント名を入力してください"); return; }
    const d = { ...form, savedAt: new Date().toLocaleDateString("ja-JP") };
    if (editingIdx !== null) { setEvents(ev => ev.map((e, i) => i === editingIdx ? d : e)); }
    else { setEvents(ev => [...ev, d]); setEditingIdx(events.length); }
    alert("✓ イベントを保存しました");
  };

  const handleSaveTpl = () => {
    if (!tplName.trim()) { alert("テンプレート名を入力してください"); return; }
    setTemplates(t => [...t, { ...form, name: tplName, savedAt: new Date().toLocaleDateString("ja-JP") }]);
    setShowTplModal(false); setTplName(""); alert("⭐ テンプレートを保存しました");
  };

  const editEvent = (i) => { setForm(events[i]); setEditingIdx(i); setOutputs(null); setView("form"); };
  const deleteEvent = (i) => { if (!window.confirm("このイベントを削除しますか？")) return; setEvents(ev => ev.filter((_, idx) => idx !== i)); };
  const deleteTpl = (i) => { if (!window.confirm("このテンプレートを削除しますか？")) return; setTemplates(t => t.filter((_, idx) => idx !== i)); };
  const loadTpl = (t) => { setForm({ ...emptyForm, ...t }); setOutputs(null); };
  const copyText = (text, key) => { navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1600); };

  const currentOut = outputs && activeOut !== "wix" ? outputs[activeOut] : "";

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={S.hdr}>
        <div style={S.logo}>HONEY BEE <small style={S.logoSm}>Event Manager</small></div>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button style={S.navTab(view === "list")} onClick={() => setView("list")}>📋 イベント一覧</button>
          <button style={S.navTab(view === "form")} onClick={() => setView("form")}>✦ 新規作成</button>
        </div>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={{ padding: "1.5rem 2rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <span style={{ ...S.secTitle, border: "none", padding: 0, margin: 0 }}>イベント &amp; テンプレート一覧</span>
            <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
              <label style={{ ...S.btn("ghost"), padding: ".45rem .9rem", cursor: "pointer", fontSize: ".72rem" }}>
                📂 CSVを読み込む
                <input type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
              </label>
              <button style={S.btn("gold")} onClick={() => { clearForm(); setView("form"); }}>＋ 新規イベント</button>
            </div>
          </div>
          {csvMsg && (
            <div style={{ marginBottom: "1rem", padding: ".6rem 1rem", borderRadius: 5, background: csvMsg.startsWith("✅") ? "rgba(100,200,100,0.1)" : "rgba(226,75,74,0.1)", border: `1px solid ${csvMsg.startsWith("✅") ? "rgba(100,200,100,0.3)" : "rgba(226,75,74,0.3)"}`, fontSize: ".8rem", color: csvMsg.startsWith("✅") ? "#7ec87e" : "#e24b4a" }}>
              {csvMsg}
            </div>
          )}

          <div style={S.secTitle}>テンプレート</div>
          {templates.length === 0 && <div style={{ color: "rgba(240,232,208,0.2)", fontSize: ".75rem", marginBottom: "1rem" }}>テンプレートはまだありません</div>}
          {templates.map((t, i) => (
            <div key={i} style={S.card(true)}>
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", marginBottom: ".3rem" }}>⭐ {t.name} <span style={S.badge}>Template</span></div>
                <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.4)" }}>保存日：{t.savedAt || "–"}</div>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <button style={S.btn("sm")} onClick={() => { loadTpl(t); setView("form"); }}>読み込み</button>
                <button style={S.btn("danger")} onClick={() => deleteTpl(i)}>削除</button>
              </div>
            </div>
          ))}

          <div style={{ ...S.secTitle, marginTop: "1.5rem" }}>イベント</div>
          {events.length === 0 && <div style={{ textAlign: "center", padding: "2rem", color: "rgba(240,232,208,0.2)", fontSize: ".8rem" }}>🍯 イベントはまだありません</div>}
          {[...events].reverse().map((e, ri) => {
            const i = events.length - 1 - ri;
            return (
              <div key={i} style={S.card(false)}>
                <div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", marginBottom: ".3rem" }}>{e.name || "（無題）"}</div>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.4)", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    {e.date && <span>📅 {fmtDate(e.date)}</span>}
                    {e.price && <span>💴 {e.price}</span>}
                    {e.poster && <a href={e.poster} target="_blank" rel="noreferrer" style={{ color: "#c9a84c88", textDecoration: "none" }}>🖼 ポスター</a>}
                    {e.timetable && <a href={e.timetable} target="_blank" rel="noreferrer" style={{ color: "#c9a84c88", textDecoration: "none" }}>📋 TT</a>}
                    <span>保存：{e.savedAt || "–"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button style={S.btn("sm")} onClick={() => editEvent(i)}>編集</button>
                  <button style={S.btn("danger")} onClick={() => deleteEvent(i)}>削除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FORM VIEW */}
      {view === "form" && (
        <div style={{ padding: "1.5rem 2rem" }}>
          {templates.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".75rem 1rem", background: "#111", border: "1px solid rgba(201,168,76,0.1)", borderRadius: 5, marginBottom: "1.25rem" }}>
              <label style={{ ...S.lbl, margin: 0, whiteSpace: "nowrap" }}>テンプレートから読み込み：</label>
              <select style={{ ...S.inp, flex: 1 }} defaultValue="" onChange={e => { if (e.target.value !== "") loadTpl(templates[parseInt(e.target.value)]); }}>
                <option value="">── テンプレートを選択 ──</option>
                {templates.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Left: フォーム */}
            <div>
              <div style={S.secTitle}>イベント情報</div>
              <div style={S.fgrid}>
                <Field label="イベント名" full><input style={S.inp} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="例：Jazz Night Premium" /></Field>
                <Field label="日程"><input type="date" style={S.inp} value={form.date} onChange={e => setField("date", e.target.value)} /></Field>
                <Field label="曜日"><input style={{ ...S.inp, color: "rgba(201,168,76,0.6)" }} value={form.day} readOnly placeholder="自動入力" /></Field>
                <Field label="開場時間"><input type="time" style={S.inp} value={form.open} onChange={e => setField("open", e.target.value)} /></Field>
                <Field label="開演時間"><input type="time" style={S.inp} value={form.start} onChange={e => setField("start", e.target.value)} /></Field>
                <Field label="料金"><input style={S.inp} value={form.price} onChange={e => setField("price", e.target.value)} placeholder="例：¥3,000（1ドリンク付）" /></Field>
                <Field label="定員"><input type="number" style={S.inp} value={form.cap} onChange={e => setField("cap", e.target.value)} placeholder="例：50" /></Field>
                <Field label="イベントジャンル（SEO用）" full><input style={S.inp} value={form.genre} onChange={e => setField("genre", e.target.value)} placeholder="例：ジャズ / ロック / アコースティック" /></Field>
                <Field label="出演者" full><input style={S.inp} value={form.perf} onChange={e => setField("perf", e.target.value)} placeholder="例：山田太郎（Gt）/ 田中花子（Vo）" /></Field>
                <Field label="イベント説明" full><textarea style={{ ...S.inp, resize: "vertical", lineHeight: 1.5 }} rows={3} value={form.desc} onChange={e => setField("desc", e.target.value)} placeholder="イベントの雰囲気・内容" /></Field>
                <Field label="予約URL" full><input type="url" style={S.inp} value={form.url} onChange={e => setField("url", e.target.value)} placeholder="https://..." /></Field>
                <Field label="注意事項" full><textarea style={{ ...S.inp, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="未成年者入場不可 / etc." /></Field>
              </div>
              <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                <button style={{ ...S.btn("gold"), flex: 1 }} onClick={handleGenerate}>✦ 文章を生成</button>
                <button style={S.btn("ghost")} onClick={handleSaveEvent}>💾 保存</button>
                <button style={S.btn("ghost")} onClick={() => { setTplName(form.name); setShowTplModal(true); }}>⭐ テンプレート</button>
              </div>
              <button style={{ ...S.btn("sm"), marginTop: ".5rem" }} onClick={clearForm}>クリア</button>
            </div>

            {/* Right: 出力 */}
            <div style={{ borderLeft: "1px solid rgba(201,168,76,0.1)", paddingLeft: "1.5rem" }}>
              <div style={S.secTitle}>生成テキスト</div>
              <div style={{ display: "flex", gap: ".4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                {OUTPUT_TABS.map(t => (
                  <button key={t.key} style={S.outTab(activeOut === t.key)} onClick={() => setActiveOut(t.key)}>{t.label}</button>
                ))}
              </div>

              {!outputs && (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "rgba(240,232,208,0.2)", fontSize: ".8rem" }}>「文章を生成」を押してください 🍯</div>
              )}

              {/* 通常タブ */}
              {outputs && activeOut !== "wix" && (
                <div style={{ position: "relative" }}>
                  <div style={S.outTxt}>{currentOut}</div>
                  <button style={S.cpyBtn} onClick={() => copyText(currentOut, activeOut)}>
                    {copied === activeOut ? "✓ 完了" : "コピー"}
                  </button>
                  {activeOut === "ig" && <div style={{ fontSize: ".62rem", color: "rgba(201,168,76,0.4)", textAlign: "right", marginTop: ".25rem" }}>文字数：{currentOut.length}（目安：2,200字以内）</div>}
                </div>
              )}

              {/* Wixタブ */}
              {outputs && activeOut === "wix" && (
                <div>
                  <div style={{ fontSize: ".7rem", color: "#7ec8e3", marginBottom: "1rem", padding: ".5rem .75rem", background: "rgba(126,200,227,0.06)", borderRadius: 4, borderLeft: "2px solid rgba(126,200,227,0.4)" }}>
                    🌐 Wixサイト更新用テキスト — 各項目をコピーしてWixエディタに貼り付けてください
                  </div>
                  {WIX_SECTIONS.map(sec => (
                    <div key={sec.key} style={{ marginBottom: "1.25rem" }}>
                      <div style={S.wixLbl}>
                        <span>{sec.label}</span>
                        <button style={S.wixCpy(copied === sec.key)} onClick={() => copyText(outputs[sec.key], sec.key)}>
                          {copied === sec.key ? "✓ コピー完了" : "コピー"}
                        </button>
                      </div>
                      <div style={S.wixTxt}>{outputs[sec.key]}</div>
                      {sec.note && <div style={{ fontSize: ".62rem", color: "rgba(126,200,227,0.4)", textAlign: "right", marginTop: ".2rem" }}>{sec.note(outputs[sec.key])}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Template Modal */}
      {showTplModal && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#111", border: "1px solid rgba(201,168,76,0.27)", borderRadius: 8, padding: "1.5rem", width: 340 }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: ".9rem", color: "#c9a84c", marginBottom: "1rem" }}>⭐ テンプレートとして保存</div>
            <label style={S.lbl}>テンプレート名</label>
            <input style={{ ...S.inp, marginTop: ".35rem", marginBottom: ".75rem" }} value={tplName} onChange={e => setTplName(e.target.value)} placeholder="例：定期ジャズナイト" />
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button style={S.btn("gold")} onClick={handleSaveTpl}>保存</button>
              <button style={S.btn("ghost")} onClick={() => setShowTplModal(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

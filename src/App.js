import { useState, useEffect } from "react";

const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

const emptyForm = {
  name: "", date: "", day: "", open: "", start: "",
  price: "", cap: "", perf: "", desc: "", url: "", notes: "",
};

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

  const hp = [
    `■ ${name}`,
    "",
    `${date}（${d.day}）`,
    timeStr,
    `料金：${d.price || "未定"}`,
    d.cap ? `定員：${d.cap}名` : "",
    "",
    d.perf ? `【出演】\n${d.perf}` : "",
    d.desc ? `\n【内容】\n${d.desc}` : "",
    d.url ? `\n▶ ご予約はこちら\n${d.url}` : "",
    d.notes ? `\n【注意事項】\n${d.notes}` : "",
  ].filter(s => s !== "").join("\n").trim();

  const ig = [
    `🎵 ${name} 🎵`,
    "",
    `📅 ${date}（${d.day}）`,
    open ? `🚪 開場 ${open}` : "",
    start ? `🎤 開演 ${start}` : "",
    `💴 ${d.price || "未定"}`,
    d.cap ? `👥 定員：${d.cap}名` : "",
    "",
    d.perf ? `✨ 出演：${d.perf}` : "",
    d.desc ? "\n" + d.desc : "",
    d.url ? "\n🔗 ご予約・詳細はプロフのリンクから！" : "",
    "\n#honeybee #ライブ #音楽イベント #" + name.replace(/\s/g, ""),
  ].filter(s => s !== "").join("\n").trim();

  const fb = [
    `【イベントのお知らせ】${name}`,
    "",
    "こんにちは、HONEY BEEです。\n素晴らしい夜をお届けするイベントのご案内です。",
    "",
    "━━━━━━━━━━━━━━",
    `📅 日程：${date}（${d.day}）`,
    timeStr ? `🕐 ${timeStr}` : "",
    `💴 料金：${d.price || "未定"}`,
    d.cap ? `👥 定員：${d.cap}名（先着順）` : "",
    "━━━━━━━━━━━━━━",
    "",
    d.perf ? `【出演者】\n${d.perf}\n` : "",
    d.desc ? d.desc + "\n" : "",
    "ぜひお誘い合わせの上、ご来場ください。\n皆さまのお越しをお待ちしております。",
    d.url ? `\n▶ ご予約はこちら\n${d.url}` : "",
    d.notes ? "\n※ " + d.notes.split("\n").join("\n※ ") : "",
  ].filter(s => s !== "").join("\n").trim();

  const gf = [
    `このフォームは「${name}」のご予約専用フォームです。`,
    "",
    "【イベント詳細】",
    `日程：${date}（${d.day}）`,
    timeStr,
    `料金：${d.price || "未定"}`,
    d.cap ? `定員：${d.cap}名（先着順・定員になり次第締め切り）` : "",
    d.perf ? `出演：${d.perf}` : "",
    "",
    d.desc || "",
    "",
    "ご予約の確認メールは自動送信されます。",
    d.notes ? `\n【ご注意】\n${d.notes}` : "",
    "\nフォームの送信をもってご予約完了となります。\nご不明な点はHONEY BEEまでお問い合わせください。",
  ].filter(s => s !== "").join("\n").trim();

  const cp = [
    `✦ ${name} ✦`,
    `${date}（${d.day}）— HONEY BEE`,
    `${d.price || ""}${d.url ? " | 予約受付中" : ""}`,
    "",
    d.desc ? d.desc.slice(0, 60) + (d.desc.length > 60 ? "..." : "") : "",
    d.url ? "\n" + d.url : "",
  ].filter(s => s !== "").join("\n").trim();

  return { hp, ig, fb, gf, cp };
}

const OUTPUT_TABS = [
  { key: "hp", label: "HP用" },
  { key: "ig", label: "Instagram" },
  { key: "fb", label: "Facebook" },
  { key: "gf", label: "Googleフォーム" },
  { key: "cp", label: "告知コピー" },
];

const styles = {
  app: { background: "#0a0a0a", color: "#f0e8d0", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header: { background: "linear-gradient(180deg,#1a1400 0%,#0a0a0a 100%)", borderBottom: "1px solid rgba(201,168,76,0.27)", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" },
  logo: { fontFamily: "Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "#c9a84c", letterSpacing: ".15em" },
  logoSmall: { color: "#f0e8d0", fontSize: ".55em", letterSpacing: ".3em", display: "block", fontWeight: 300 },
  navTabs: { display: "flex", gap: ".5rem" },
  navTab: (active) => ({ padding: ".4rem 1rem", borderRadius: 3, border: "1px solid " + (active ? "#c9a84c" : "rgba(201,168,76,0.2)"), background: active ? "#c9a84c" : "transparent", color: active ? "#0a0a0a" : "rgba(201,168,76,0.55)", fontSize: ".7rem", letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  view: { padding: "1.5rem 2rem" },
  sectionTitle: { fontFamily: "Georgia, serif", fontSize: ".7rem", letterSpacing: ".25em", textTransform: "uppercase", color: "#c9a84c", borderBottom: "1px solid rgba(201,168,76,0.2)", paddingBottom: ".5rem", marginBottom: ".75rem" },
  btn: (variant) => {
    const base = { padding: ".55rem 1.1rem", borderRadius: 4, fontFamily: "inherit", fontSize: ".72rem", fontWeight: 500, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer", transition: "all .15s" };
    if (variant === "gold") return { ...base, background: "#c9a84c", color: "#0a0a0a", border: "none" };
    if (variant === "ghost") return { ...base, background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.27)" };
    if (variant === "danger") return { ...base, background: "transparent", color: "#e24b4a", border: "1px solid rgba(226,75,74,0.27)" };
    if (variant === "sm") return { ...base, padding: ".35rem .7rem", fontSize: ".65rem", background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.27)" };
    return base;
  },
  eventCard: (template) => ({ background: "#111", border: "1px solid rgba(201,168,76,0.1)", borderLeft: template ? "2px solid #c9a84c" : undefined, borderRadius: 6, padding: "1rem 1.25rem", marginBottom: ".75rem", display: "grid", gridTemplateColumns: "1fr auto", gap: ".75rem", alignItems: "center" }),
  badge: { display: "inline-block", padding: ".15rem .5rem", borderRadius: 2, fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", background: "rgba(201,168,76,0.13)", color: "#c9a84c", marginLeft: ".5rem" },
  formLayout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" },
  label: { fontSize: ".67rem", letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(201,168,76,0.6)", fontWeight: 500, display: "block", marginBottom: ".3rem" },
  input: { background: "#111", border: "1px solid rgba(201,168,76,0.14)", borderRadius: 4, color: "#f0e8d0", fontFamily: "inherit", fontSize: ".85rem", padding: ".55rem .7rem", outline: "none", width: "100%" },
  outTab: (active) => ({ padding: ".35rem .7rem", borderRadius: 3, border: "1px solid " + (active ? "#c9a84c" : "rgba(201,168,76,0.2)"), background: active ? "#c9a84c" : "transparent", color: active ? "#0a0a0a" : "rgba(201,168,76,0.55)", fontSize: ".65rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }),
  outText: { background: "#0f0f0f", border: "1px solid rgba(201,168,76,0.1)", borderRadius: 6, padding: "1rem", fontSize: ".82rem", lineHeight: 1.75, color: "rgba(240,232,208,0.8)", whiteSpace: "pre-wrap", minHeight: 200, position: "relative" },
  copyBtn: { position: "absolute", top: ".6rem", right: ".6rem", padding: ".25rem .6rem", background: "rgba(201,168,76,0.13)", border: "1px solid rgba(201,168,76,0.27)", borderRadius: 3, color: "#c9a84c", fontSize: ".6rem", letterSpacing: ".1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" },
};

function Field({ label, children, full }) {
  return (
    <div style={{ gridColumn: full ? "1/-1" : undefined, display: "flex", flexDirection: "column" }}>
      <label style={styles.label}>{label}</label>
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

  useEffect(() => { localStorage.setItem("hb-events", JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem("hb-templates", JSON.stringify(templates)); }, [templates]);

  const setField = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === "date" && v) {
        const d = new Date(v + "T00:00:00");
        next.day = DAYS[d.getDay()] + "曜日";
      }
      return next;
    });
  };

  const inp = (k, extra = {}) => (
    <input
      style={{ ...styles.input, ...extra }}
      value={form[k]}
      onChange={e => setField(k, e.target.value)}
      readOnly={k === "day"}
    />
  );

  const handleGenerate = () => {
    setOutputs(generateTexts(form));
    setActiveOut("hp");
  };

  const handleSaveEvent = () => {
    if (!form.name) { alert("イベント名を入力してください"); return; }
    const d = { ...form, savedAt: new Date().toLocaleDateString("ja-JP") };
    if (editingIdx !== null) {
      setEvents(ev => ev.map((e, i) => i === editingIdx ? d : e));
    } else {
      setEvents(ev => [...ev, d]);
      setEditingIdx(events.length);
    }
    alert("✓ イベントを保存しました");
  };

  const handleSaveTpl = () => {
    if (!tplName.trim()) { alert("テンプレート名を入力してください"); return; }
    setTemplates(t => [...t, { ...form, name: tplName, savedAt: new Date().toLocaleDateString("ja-JP") }]);
    setShowTplModal(false);
    setTplName("");
    alert("⭐ テンプレートを保存しました");
  };

  const editEvent = (i) => {
    setForm(events[i]);
    setEditingIdx(i);
    setOutputs(null);
    setView("form");
  };

  const deleteEvent = (i) => {
    if (!window.confirm("このイベントを削除しますか？")) return;
    setEvents(ev => ev.filter((_, idx) => idx !== i));
  };

  const deleteTpl = (i) => {
    if (!window.confirm("このテンプレートを削除しますか？")) return;
    setTemplates(t => t.filter((_, idx) => idx !== i));
  };

  const loadTpl = (t) => { setForm({ ...emptyForm, ...t, name: t.name }); setOutputs(null); };

  const clearForm = () => { setForm(emptyForm); setEditingIdx(null); setOutputs(null); };

  const copyText = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const currentOut = outputs ? outputs[activeOut] : "";

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>HONEY BEE <small style={styles.logoSmall}>Event Manager</small></div>
        <div style={styles.navTabs}>
          <button style={styles.navTab(view === "list")} onClick={() => setView("list")}>📋 イベント一覧</button>
          <button style={styles.navTab(view === "form")} onClick={() => { setView("form"); }}>✦ 新規作成</button>
        </div>
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div style={styles.view}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <span style={{ ...styles.sectionTitle, border: "none", padding: 0, margin: 0 }}>イベント &amp; テンプレート一覧</span>
            <button style={styles.btn("gold")} onClick={() => { clearForm(); setView("form"); }}>＋ 新規イベント</button>
          </div>

          <div style={styles.sectionTitle}>テンプレート</div>
          {templates.length === 0 && <div style={{ color: "rgba(240,232,208,0.2)", fontSize: ".75rem", marginBottom: "1rem" }}>テンプレートはまだありません</div>}
          {templates.map((t, i) => (
            <div key={i} style={styles.eventCard(true)}>
              <div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", marginBottom: ".3rem" }}>⭐ {t.name} <span style={styles.badge}>Template</span></div>
                <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.4)" }}>保存日：{t.savedAt || "–"}</div>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <button style={styles.btn("sm")} onClick={() => { loadTpl(t); setView("form"); }}>読み込み</button>
                <button style={styles.btn("danger")} onClick={() => deleteTpl(i)}>削除</button>
              </div>
            </div>
          ))}

          <div style={{ ...styles.sectionTitle, marginTop: "1.5rem" }}>イベント</div>
          {events.length === 0 && <div style={{ textAlign: "center", padding: "2rem", color: "rgba(240,232,208,0.2)", fontSize: ".8rem" }}>🍯 イベントはまだありません</div>}
          {[...events].reverse().map((e, ri) => {
            const i = events.length - 1 - ri;
            return (
              <div key={i} style={styles.eventCard(false)}>
                <div>
                  <div style={{ fontFamily: "Georgia, serif", fontSize: "1rem", marginBottom: ".3rem" }}>{e.name || "（無題）"}</div>
                  <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.4)", display: "flex", gap: "1rem" }}>
                    {e.date && <span>📅 {fmtDate(e.date)}</span>}
                    {e.price && <span>💴 {e.price}</span>}
                    <span>保存：{e.savedAt || "–"}</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  <button style={styles.btn("sm")} onClick={() => editEvent(i)}>編集</button>
                  <button style={styles.btn("danger")} onClick={() => deleteEvent(i)}>削除</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FORM VIEW */}
      {view === "form" && (
        <div style={styles.view}>
          {/* Template loader */}
          {templates.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".75rem 1rem", background: "#111", border: "1px solid rgba(201,168,76,0.1)", borderRadius: 5, marginBottom: "1.25rem" }}>
              <label style={{ ...styles.label, margin: 0, whiteSpace: "nowrap" }}>テンプレートから読み込み：</label>
              <select style={{ ...styles.input, flex: 1 }} defaultValue="" onChange={e => { if (e.target.value !== "") loadTpl(templates[parseInt(e.target.value)]); }}>
                <option value="">── テンプレートを選択 ──</option>
                {templates.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div style={styles.formLayout}>
            {/* Left: form */}
            <div>
              <div style={styles.sectionTitle}>イベント情報</div>
              <div style={styles.formGrid}>
                <Field label="イベント名" full><input style={styles.input} value={form.name} onChange={e => setField("name", e.target.value)} placeholder="例：Jazz Night Premium" /></Field>
                <Field label="日程"><input type="date" style={styles.input} value={form.date} onChange={e => setField("date", e.target.value)} /></Field>
                <Field label="曜日"><input style={{ ...styles.input, color: "rgba(201,168,76,0.6)" }} value={form.day} readOnly placeholder="自動入力" /></Field>
                <Field label="開場時間"><input type="time" style={styles.input} value={form.open} onChange={e => setField("open", e.target.value)} /></Field>
                <Field label="開演時間"><input type="time" style={styles.input} value={form.start} onChange={e => setField("start", e.target.value)} /></Field>
                <Field label="料金"><input style={styles.input} value={form.price} onChange={e => setField("price", e.target.value)} placeholder="例：¥3,000（1ドリンク付）" /></Field>
                <Field label="定員"><input type="number" style={styles.input} value={form.cap} onChange={e => setField("cap", e.target.value)} placeholder="例：50" /></Field>
                <Field label="出演者" full><input style={styles.input} value={form.perf} onChange={e => setField("perf", e.target.value)} placeholder="例：山田太郎（Gt）/ 田中花子（Vo）" /></Field>
                <Field label="イベント説明" full><textarea style={{ ...styles.input, resize: "vertical", lineHeight: 1.5 }} rows={3} value={form.desc} onChange={e => setField("desc", e.target.value)} placeholder="イベントの雰囲気・内容" /></Field>
                <Field label="予約URL" full><input type="url" style={styles.input} value={form.url} onChange={e => setField("url", e.target.value)} placeholder="https://..." /></Field>
                <Field label="注意事項" full><textarea style={{ ...styles.input, resize: "vertical", lineHeight: 1.5 }} rows={2} value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="未成年者入場不可 / etc." /></Field>
              </div>
              <div style={{ display: "flex", gap: ".5rem", marginTop: "1rem", flexWrap: "wrap" }}>
                <button style={{ ...styles.btn("gold"), flex: 1 }} onClick={handleGenerate}>✦ 文章を生成</button>
                <button style={styles.btn("ghost")} onClick={handleSaveEvent}>💾 保存</button>
                <button style={styles.btn("ghost")} onClick={() => { setTplName(form.name); setShowTplModal(true); }}>⭐ テンプレート</button>
              </div>
              <button style={{ ...styles.btn("sm"), marginTop: ".5rem" }} onClick={clearForm}>クリア</button>
            </div>

            {/* Right: output */}
            <div style={{ borderLeft: "1px solid rgba(201,168,76,0.1)", paddingLeft: "1.5rem" }}>
              <div style={styles.sectionTitle}>生成テキスト</div>
              <div style={{ display: "flex", gap: ".4rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                {OUTPUT_TABS.map(t => (
                  <button key={t.key} style={styles.outTab(activeOut === t.key)} onClick={() => setActiveOut(t.key)}>{t.label}</button>
                ))}
              </div>
              {!outputs && <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "rgba(240,232,208,0.2)", fontSize: ".8rem" }}>「文章を生成」を押してください 🍯</div>}
              {outputs && (
                <div style={{ position: "relative" }}>
                  <div style={styles.outText}>{currentOut}</div>
                  <button style={styles.copyBtn} onClick={() => copyText(currentOut, activeOut)}>
                    {copied === activeOut ? "✓ 完了" : "コピー"}
                  </button>
                  {activeOut === "ig" && <div style={{ fontSize: ".62rem", color: "rgba(201,168,76,0.4)", textAlign: "right", marginTop: ".25rem" }}>文字数：{currentOut.length}（目安：2,200字以内）</div>}
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
            <label style={styles.label}>テンプレート名</label>
            <input style={{ ...styles.input, marginTop: ".35rem", marginBottom: ".75rem" }} value={tplName} onChange={e => setTplName(e.target.value)} placeholder="例：定期ジャズナイト" />
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button style={styles.btn("gold")} onClick={handleSaveTpl}>保存</button>
              <button style={styles.btn("ghost")} onClick={() => setShowTplModal(false)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

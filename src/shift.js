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

const DAYS_JP = ["日","月","火","水","木","金","土"];

// ===== シフト解析ヘルパー =====
// セル内容から、出勤/出演/役割/時間を解釈する
export function parseShiftCell(cellStr, isManager = false) {
  if (!cellStr) return null;
  const cell = String(cellStr).trim();
  if (!cell) return null;

  // 「●」「○」「丸」だけのケース
  if (/^[●○丸]+$/.test(cell)) {
    return { time: "", role: "hall", isPerformer: false, raw: cell };
  }

  // 出演判定
  const isPerformer = /出演/.test(cell);

  // 役割判定
  let role = "hall";
  if (/PA/i.test(cell)) role = "pa";
  else if (/厨房|キッチン/.test(cell)) role = "kitchen";
  else if (/司会/.test(cell)) role = "mc";
  else if (/深夜/.test(cell)) role = "midnight";

  // 時間抽出（HH:MMやHH MMなど許容）
  let time = "";
  // パターン1: HH:MM または HH MM
  const m = cell.match(/(\d{1,2})[:：\s]?(\d{2})/);
  if (m && parseInt(m[2]) < 60) time = `${m[1].padStart(2,"0")}:${m[2]}`;

  // パターン2: 「●17」「17～」「17~」のような時間のみ
  if (!time) {
    const r = cell.match(/(\d{1,2})\s*[~〜～-]/);
    if (r) time = `${r[1].padStart(2,"0")}:00`;
  }
  // パターン3: 残りの数字だけ（最終手段）
  if (!time) {
    const x = cell.match(/(\d{1,2})/);
    if (x && parseInt(x[1]) >= 1 && parseInt(x[1]) <= 24) time = `${x[1].padStart(2,"0")}:00`;
  }

  return { time, role, isPerformer, raw: cell };
}

export function getRoleColor(role) {
  switch(role){
    case "pa": return "#4fc3f7";       // 鮮やかな水色
    case "kitchen": return "#ff8a3d";  // 鮮やかなオレンジ
    case "mc": return "#b58cd1";       // 紫
    case "midnight": return "#999999"; // グレー
    default: return "#ffd54f";          // 鮮やかな黄色（ホール）
  }
}

export function getRoleLabel(role) {
  switch(role){
    case "pa": return "PA";
    case "kitchen": return "厨房";
    case "mc": return "司会";
    case "midnight": return "深夜";
    default: return "ホール";
  }
}

// マネージャー（時間表示しない人）リスト
const MANAGER_NAMES = ["渡辺佑樹"];
/** 勤務表のスタッフ名列（「日」「曜」「バンド」と同じ列）の行ラベルで、人名ではないもの */
const SHIFT_ROW_LABELS = new Set([
  "バンド", "日", "曜",
  "リハ", "リハーサル",
  "MTG",
  "出演",
  "司会", "PA", "厨房",
  "メモ", "備考",
]);
// 「出演」だけ拾う行（出勤としては扱わない）
const PERFORMER_ONLY_NAMES = ["社長"];

function isShiftStaffName(name) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (SHIFT_ROW_LABELS.has(n)) return false;
  if (/^\d{1,2}$/.test(n)) return false;
  return true;
}

function getStaffNameFromShiftRow(row, nameCol) {
  if (!row || nameCol < 0) return "";
  return String(row[nameCol] || "").trim();
}

export function isManager(name) {
  return MANAGER_NAMES.includes(name);
}

// ===== CSV パーサー =====
// 月度のCSVを解析して、日付別の出勤データを返す
export function parseShiftCSV(csvText) {
  // 簡易CSVパーサー（クォート・改行対応）
  const parseCSVText = (text) => {
    const rows = [];
    let i = 0, row = [], cell = "", inQuote = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuote) {
        if (c === '"' && text[i+1] === '"') { cell += '"'; i += 2; continue; }
        if (c === '"') { inQuote = false; i++; continue; }
        cell += c; i++;
      } else {
        if (c === '"') { inQuote = true; i++; continue; }
        if (c === ',') { row.push(cell); cell = ""; i++; continue; }
        if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i+1] === '\n') i++;
          row.push(cell); rows.push(row); row = []; cell = ""; i++; continue;
        }
        cell += c; i++;
      }
    }
    if (cell || row.length > 0) { row.push(cell); rows.push(row); }
    return rows;
  };
  const rows = parseCSVText(csvText);

  // タイトル行から年と月を抽出
  let year = new Date().getFullYear();
  let month = new Date().getMonth() + 1;
  for (const row of rows.slice(0, 3)) {
    const text = row.join(" ");
    const m = text.match(/(\d{4})\s*(\d{1,2})月/);
    if (m) { year = parseInt(m[1]); month = parseInt(m[2]); break; }
  }

  // ブロック単位で処理（「日」行を起点）
  const blocks = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // A列空白で B列が「日」のような行を見つける
    const findIdx = row.findIndex(c => (c||"").trim() === "日");
    if (findIdx >= 0) {
      // この「日」行の右側に日付が並んでいる（数字）
      const dateRow = row;
      // 次の「曜」行を探す（連続している想定）
      const dayRow = rows[i+1] && rows[i+1].some(c => (c||"").trim() === "曜") ? rows[i+1] : null;
      // バンド行（イベント名）
      const bandRow = rows[i+2] && rows[i+2].some(c => (c||"").trim() === "バンド") ? rows[i+2] : null;
      // ブロック開始位置
      const startCol = findIdx + 1;
      // 列ごとの日付数値マップを作る
      const dateMap = {}; // colIdx -> day number (1-31)
      for (let c = startCol; c < dateRow.length; c++) {
        const v = (dateRow[c]||"").trim();
        const n = parseInt(v);
        if (!isNaN(n) && n >= 1 && n <= 31) dateMap[c] = n;
      }
      // データ行を集める：「日」行の次の次（バンド行の次）から、空行 or 次の「日」行 まで
      const dataStart = (bandRow ? i + 3 : (dayRow ? i + 2 : i + 1));
      let dataEnd = dataStart;
      while (dataEnd < rows.length) {
        const r = rows[dataEnd];
        // 空行 or 次の「日」行で終わり
        const isEmpty = !r || r.every(c => !(c||"").trim());
        const isNextDay = r && r.some(c => (c||"").trim() === "日");
        if (isEmpty || isNextDay) break;
        dataEnd++;
      }
      blocks.push({
        dateRow, dayRow, bandRow, dateMap, dataStart, dataEnd, nameCol: findIdx,
      });
      i = dataEnd - 1;
    }
  }

  // 日付別出勤者マップ
  const shiftByDate = {}; // "YYYY-MM-DD" -> [{name, time, role, isPerformer, raw}]
  // スタッフの登場順序を記録（CSVの上から順）
  const staffOrder = [];
  const staffSeen = new Set();

  for (const block of blocks) {
    for (let r = block.dataStart; r < block.dataEnd; r++) {
      const row = rows[r];
      if (!row) continue;
      // スタッフ名は「日」「曜」「バンド」と同じ列（nameCol）のみから取得
      const name = getStaffNameFromShiftRow(row, block.nameCol);
      if (!isShiftStaffName(name)) continue;
      const isPerformerOnlyRow = PERFORMER_ONLY_NAMES.includes(name);

      // スタッフ順序を記録
      if (!staffSeen.has(name)) {
        staffOrder.push(name);
        staffSeen.add(name);
      }

      // 各列をチェック
      for (const colStr in block.dateMap) {
        const col = parseInt(colStr);
        const day = block.dateMap[col];
        const cellVal = (row[col]||"").trim();
        if (!cellVal) continue;
        const parsed = parseShiftCell(cellVal, isManager(name));
        if (!parsed) continue;
        // 「出演者だけ拾う行」は出演以外は無視
        if (isPerformerOnlyRow && !parsed.isPerformer) continue;
        const dateKey = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
        if (!shiftByDate[dateKey]) shiftByDate[dateKey] = [];
        shiftByDate[dateKey].push({
          name,
          time: parsed.time,
          role: parsed.role,
          isPerformer: parsed.isPerformer,
          raw: parsed.raw,
        });
      }
    }
  }

  return { year, month, shiftByDate, staffOrder };
}

export const SHIFT_ROLE_OPTIONS = [
  { value: "hall", label: "ホール" },
  { value: "pa", label: "PA" },
  { value: "kitchen", label: "厨房" },
  { value: "mc", label: "司会" },
  { value: "midnight", label: "深夜" },
];

export function getShiftDayOverride(shiftOverrides, dateKey) {
  if (!shiftOverrides || !dateKey) return null;
  if (Array.isArray(shiftOverrides)) {
    return shiftOverrides.find((o) => o._id === dateKey || o.date === dateKey) || null;
  }
  return shiftOverrides[dateKey] || null;
}

export function hasShiftDayOverride(shiftOverrides, dateKey) {
  const ov = getShiftDayOverride(shiftOverrides, dateKey);
  if (!ov) return false;
  if (ov.memo && String(ov.memo).trim()) return true;
  if (Array.isArray(ov.removed) && ov.removed.length > 0) return true;
  if (Array.isArray(ov.added) && ov.added.length > 0) return true;
  if (ov.updated && typeof ov.updated === "object" && Object.keys(ov.updated).length > 0) return true;
  return false;
}

/** CSVベースの配列に当日修正を適用（表示用） */
export function applyShiftDayOverride(base, override) {
  const list = Array.isArray(base) ? base : [];
  if (!override) return [...list];

  const removed = new Set(
    (Array.isArray(override.removed) ? override.removed : [])
      .map((n) => String(n || "").trim())
      .filter(Boolean)
  );
  const updated =
    override.updated && typeof override.updated === "object" ? override.updated : {};
  const added = Array.isArray(override.added) ? override.added : [];

  let merged = list
    .filter((e) => {
      const name = String(e.name || "").trim();
      return name && !removed.has(name);
    })
    .map((e) => {
      const name = String(e.name || "").trim();
      const patch = updated[name];
      if (!patch || typeof patch !== "object") return { ...e, name };
      return { ...e, ...patch, name };
    });

  const indexByName = new Map(merged.map((e, i) => [String(e.name).trim(), i]));

  for (const a of added) {
    const name = String(a.name || "").trim();
    if (!name || removed.has(name)) continue;
    const entry = {
      name,
      time: a.time || "",
      role: a.role || "hall",
      isPerformer: !!a.isPerformer,
      raw: a.raw || "",
    };
    if (indexByName.has(name)) {
      const idx = indexByName.get(name);
      merged[idx] = { ...merged[idx], ...entry, name };
    } else {
      merged.push(entry);
      indexByName.set(name, merged.length - 1);
    }
  }

  return merged;
}

export function resolveShiftForDate(shifts, shiftOverrides, dateKey) {
  const base = getShiftForDate(shifts, dateKey);
  const override = getShiftDayOverride(shiftOverrides, dateKey);
  return applyShiftDayOverride(base, override);
}

function buildOverrideRowsFromBase(base, existing) {
  const removed = new Set(
    (existing?.removed || []).map((n) => String(n || "").trim()).filter(Boolean)
  );
  const updated = existing?.updated && typeof existing.updated === "object" ? existing.updated : {};
  return (base || []).map((e) => ({
    name: e.name,
    time: updated[e.name]?.time !== undefined ? updated[e.name].time : e.time || "",
    role: updated[e.name]?.role !== undefined ? updated[e.name].role : e.role || "hall",
    isPerformer:
      updated[e.name]?.isPerformer !== undefined ? !!updated[e.name].isPerformer : !!e.isPerformer,
    off: removed.has(e.name),
  }));
}

function buildOverridePayload(base, rows, added, memo) {
  const removed = rows.filter((r) => r.off).map((r) => r.name);
  const updated = {};
  rows
    .filter((r) => !r.off)
    .forEach((r) => {
      const orig = (base || []).find((b) => b.name === r.name);
      if (!orig) return;
      const patch = {};
      if ((r.time || "") !== (orig.time || "")) patch.time = r.time || "";
      if (r.role !== orig.role) patch.role = r.role;
      if (!!r.isPerformer !== !!orig.isPerformer) patch.isPerformer = !!r.isPerformer;
      if (Object.keys(patch).length > 0) updated[r.name] = patch;
    });
  const addedClean = added
    .map((a) => ({
      name: String(a.name || "").trim(),
      time: a.time || "",
      role: a.role || "hall",
      isPerformer: !!a.isPerformer,
    }))
    .filter((a) => a.name);
  return {
    removed,
    updated,
    added: addedClean,
    memo: String(memo || "").trim(),
  };
}

function isOverridePayloadEmpty(payload) {
  if (payload.memo) return false;
  if (payload.removed.length > 0) return false;
  if (payload.added.length > 0) return false;
  if (Object.keys(payload.updated).length > 0) return false;
  return true;
}

function ShiftDayOverridePanel({ dateKey, shifts, shiftOverrides, staffOrder, onClose }) {
  const base = getShiftForDate(shifts, dateKey);
  const existing = getShiftDayOverride(shiftOverrides, dateKey);
  const [memo, setMemo] = useState(() => existing?.memo || "");
  const [rows, setRows] = useState(() => buildOverrideRowsFromBase(base, existing));
  const [added, setAdded] = useState(() =>
    (existing?.added || []).map((a, i) => ({ ...a, _key: `added-${i}-${a.name}` }))
  );
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");
  const [newRole, setNewRole] = useState("hall");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ov = getShiftDayOverride(shiftOverrides, dateKey);
    const b = getShiftForDate(shifts, dateKey);
    setMemo(ov?.memo || "");
    setRows(buildOverrideRowsFromBase(b, ov));
    setAdded((ov?.added || []).map((a, i) => ({ ...a, _key: `added-${i}-${a.name}` })));
    setNewName("");
    setNewTime("");
    setNewRole("hall");
  }, [dateKey, shifts, shiftOverrides]);

  const nameOptions = (() => {
    const seen = new Set();
    const out = [];
    for (const n of staffOrder || []) {
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    for (const r of rows) {
      if (r.name && !seen.has(r.name)) {
        seen.add(r.name);
        out.push(r.name);
      }
    }
    return out;
  })();

  const handleSave = async () => {
    const payload = buildOverridePayload(base, rows, added, memo);
    setSaving(true);
    try {
      if (isOverridePayloadEmpty(payload)) {
        if (existing) {
          await deleteDoc(doc(db, "shiftDayOverrides", dateKey));
        }
      } else {
        await setDoc(doc(db, "shiftDayOverrides", dateKey), {
          date: dateKey,
          monthId: dateKey.slice(0, 7),
          memo: payload.memo,
          removed: payload.removed,
          updated: payload.updated,
          added: payload.added,
          updatedAt: Date.now(),
        });
      }
      onClose?.();
    } catch (e) {
      alert("保存に失敗しました: " + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async () => {
    if (!existing) return;
    if (!window.confirm("この日の当日修正をすべて取り消し、CSVの元シフトに戻しますか？")) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "shiftDayOverrides", dateKey));
      onClose?.();
    } catch (e) {
      alert("取り消しに失敗しました: " + (e.message || String(e)));
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = () => {
    const name = newName.trim();
    if (!name) {
      alert("名前を入力してください");
      return;
    }
    if (rows.some((r) => r.name === name && !r.off) || added.some((a) => a.name === name)) {
      alert("同じ名前のスタッフが既にいます");
      return;
    }
    setAdded((prev) => [
      ...prev,
      { _key: `new-${Date.now()}`, name, time: newTime.trim(), role: newRole, isPerformer: false },
    ]);
    setNewName("");
    setNewTime("");
    setNewRole("hall");
  };

  const resolvedPreview = resolveShiftForDate(shifts, shiftOverrides, dateKey);

  return (
    <div
      style={{
        marginTop: "1rem",
        padding: "1rem 1.1rem",
        background: "#0a0a0a",
        border: "1px solid rgba(244, 162, 97, 0.35)",
        borderRadius: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: ".65rem",
          flexWrap: "wrap",
          gap: ".4rem",
        }}
      >
        <div style={{ fontSize: ".68rem", color: "rgba(244, 162, 97, 0.9)", letterSpacing: ".12em", fontWeight: 600 }}>
          ✏️ 当日修正
          {hasShiftDayOverride(shiftOverrides, dateKey) ? (
            <span
              style={{
                marginLeft: ".45rem",
                fontSize: ".58rem",
                color: "rgba(244, 162, 97, 0.75)",
                fontWeight: 400,
              }}
            >
              （修正あり）
            </span>
          ) : null}
        </div>
        {hasShiftDayOverride(shiftOverrides, dateKey) ? (
          <button
            type="button"
            style={{ ...S.btn("danger"), padding: ".2rem .55rem", fontSize: ".58rem" }}
            onClick={handleRevert}
            disabled={saving}
          >
            元のCSVに戻す
          </button>
        ) : null}
      </div>

      {resolvedPreview.length > 0 ? (
        <div style={{ marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.45)", marginBottom: ".35rem" }}>
            反映後のシフト（{resolvedPreview.length}名）
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem" }}>
            {resolvedPreview.map((e) => {
              const color = getRoleColor(e.role);
              return (
                <span
                  key={e.name}
                  style={{
                    padding: ".15rem .45rem",
                    borderRadius: 3,
                    fontSize: ".62rem",
                    background: e.isPerformer ? "rgba(181,140,209,0.13)" : color + "22",
                    color: e.isPerformer ? "#b58cd1" : "#f0e8d0",
                    border: `1px solid ${e.isPerformer ? "#b58cd1" : color}44`,
                  }}
                >
                  {e.name}
                  {!e.isPerformer && !isManager(e.name) && e.time ? ` ${e.time}` : ""}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {rows.length === 0 && base.length === 0 ? (
        <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.4)", marginBottom: ".65rem" }}>
          この日のCSVシフトは未登録です。下から急遽出勤を追加できます。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: ".45rem", marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.45)", letterSpacing: ".08em" }}>CSV登録スタッフ</div>
          {rows.map((r) => (
            <div
              key={r.name}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: ".4rem",
                padding: ".45rem .55rem",
                background: r.off ? "rgba(226,75,74,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${r.off ? "rgba(226,75,74,0.25)" : "rgba(201,168,76,0.12)"}`,
                borderRadius: 4,
                opacity: r.off ? 0.55 : 1,
              }}
            >
              <span style={{ fontSize: ".78rem", color: "#f0e8d0", minWidth: 88 }}>{r.name}</span>
              {!r.off && !isManager(r.name) && !r.isPerformer ? (
                <input
                  style={{ ...S.inp, width: 72, padding: ".35rem .45rem", fontSize: ".75rem" }}
                  value={r.time}
                  onChange={(e) =>
                    setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, time: e.target.value } : x)))
                  }
                  placeholder="17:00"
                />
              ) : null}
              {!r.off && !r.isPerformer ? (
                <select
                  style={{ ...S.inp, width: "auto", minWidth: 88, padding: ".35rem .45rem", fontSize: ".75rem" }}
                  value={r.role}
                  onChange={(e) =>
                    setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, role: e.target.value } : x)))
                  }
                >
                  {SHIFT_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {r.isPerformer ? (
                <span style={{ fontSize: ".62rem", color: "#b58cd1" }}>出演</span>
              ) : null}
              <button
                type="button"
                style={{
                  ...S.btn(r.off ? "ghost" : "danger"),
                  padding: ".25rem .55rem",
                  fontSize: ".58rem",
                  marginLeft: "auto",
                }}
                onClick={() =>
                  setRows((prev) => prev.map((x) => (x.name === r.name ? { ...x, off: !x.off } : x)))
                }
              >
                {r.off ? "休み解除" : "休み"}
              </button>
            </div>
          ))}
        </div>
      )}

      {added.length > 0 ? (
        <div style={{ marginBottom: ".75rem" }}>
          <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.45)", marginBottom: ".35rem" }}>急遽追加</div>
          {added.map((a) => (
            <div
              key={a._key}
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: ".4rem",
                padding: ".45rem .55rem",
                marginBottom: ".35rem",
                background: "rgba(126, 200, 127, 0.06)",
                border: "1px solid rgba(126, 200, 127, 0.22)",
                borderRadius: 4,
              }}
            >
              <span style={{ fontSize: ".78rem", color: "#7ec8b8" }}>{a.name}</span>
              <input
                style={{ ...S.inp, width: 72, padding: ".35rem .45rem", fontSize: ".75rem" }}
                value={a.time || ""}
                onChange={(e) =>
                  setAdded((prev) =>
                    prev.map((x) => (x._key === a._key ? { ...x, time: e.target.value } : x))
                  )
                }
                placeholder="17:00"
              />
              <select
                style={{ ...S.inp, width: "auto", minWidth: 88, padding: ".35rem .45rem", fontSize: ".75rem" }}
                value={a.role || "hall"}
                onChange={(e) =>
                  setAdded((prev) =>
                    prev.map((x) => (x._key === a._key ? { ...x, role: e.target.value } : x))
                  )
                }
              >
                {SHIFT_ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={{ ...S.btn("danger"), padding: ".2rem .5rem", fontSize: ".58rem", marginLeft: "auto" }}
                onClick={() => setAdded((prev) => prev.filter((x) => x._key !== a._key))}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div
        style={{
          padding: ".55rem .65rem",
          marginBottom: ".75rem",
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(201,168,76,0.12)",
          borderRadius: 4,
        }}
      >
        <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.45)", marginBottom: ".35rem" }}>急遽出勤を追加</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", alignItems: "center" }}>
          <input
            list={`shift-add-names-${dateKey}`}
            style={{ ...S.inp, flex: "1 1 120px", minWidth: 100, padding: ".35rem .5rem", fontSize: ".78rem" }}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="名前"
          />
          <datalist id={`shift-add-names-${dateKey}`}>
            {nameOptions.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input
            style={{ ...S.inp, width: 72, padding: ".35rem .45rem", fontSize: ".75rem" }}
            value={newTime}
            onChange={(e) => setNewTime(e.target.value)}
            placeholder="17:00"
          />
          <select
            style={{ ...S.inp, width: "auto", minWidth: 88, padding: ".35rem .45rem", fontSize: ".75rem" }}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          >
            {SHIFT_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" style={{ ...S.btn("ghost"), padding: ".3rem .65rem", fontSize: ".62rem" }} onClick={handleAddStaff}>
            追加
          </button>
        </div>
      </div>

      <div style={{ marginBottom: ".75rem" }}>
        <label style={S.lbl}>メモ（任意）</label>
        <textarea
          style={{ ...S.inp, resize: "vertical", minHeight: 48, lineHeight: 1.5, fontSize: ".78rem" }}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例：〇〇急病のため交代"
        />
      </div>

      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
        <button type="button" style={{ ...S.btn("gold"), padding: ".4rem .9rem" }} onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "当日修正を保存"}
        </button>
        <button type="button" style={{ ...S.btn("ghost"), padding: ".4rem .75rem" }} onClick={onClose} disabled={saving}>
          閉じる
        </button>
      </div>
    </div>
  );
}

// ===== シフトモジュール =====
export default function ShiftModule({ navigateBack, shiftOverrides = [] }) {
  const [shifts, setShifts] = useState([]);
  const [csvMsg, setCsvMsg] = useState("");
  const [viewMode, setViewMode] = useState("calendar"); // calendar | list
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "shifts"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setShifts(list);
      // 当月のデータがあればそれを表示
      const currentMonthId = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      })();
      const hasCurrentMonth = list.some(s => s._id === currentMonthId);
      if (hasCurrentMonth) {
        setViewMonth(currentMonthId);
      } else if (list.length > 0) {
        // 当月がなければ最新の月
        const sorted = [...list].sort((a,b)=>(b._id||"").localeCompare(a._id||""));
        setViewMonth(sorted[0]._id);
      }
    });
    return () => unsub();
  }, []);

  const handleCSV = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const result = parseShiftCSV(ev.target.result);
        if (!result.shiftByDate || Object.keys(result.shiftByDate).length === 0) {
          setCsvMsg("⚠️ シフトデータが見つかりませんでした。");
          return;
        }
        const monthId = `${result.year}-${String(result.month).padStart(2,"0")}`;
        await setDoc(doc(db, "shifts", monthId), {
          year: result.year,
          month: result.month,
          monthLabel: `${result.year}年${result.month}月`,
          shiftByDate: result.shiftByDate,
          staffOrder: result.staffOrder || [],
          importedAt: new Date().toLocaleString("ja-JP"),
        });
        const totalDates = Object.keys(result.shiftByDate).length;
        const totalEntries = Object.values(result.shiftByDate).reduce((s,arr)=>s+arr.length,0);
        setCsvMsg(`✅ ${result.year}年${result.month}月のシフトを取り込みました（${totalDates}日 / ${totalEntries}件）`);
        setViewMonth(monthId);
        setTimeout(() => setCsvMsg(""), 6000);
      } catch (err) {
        setCsvMsg("⚠️ 読み込みに失敗しました：" + err.message);
      }
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleDelete = async (monthId) => {
    if (!window.confirm("この月のシフトデータを削除しますか？")) return;
    await deleteDoc(doc(db, "shifts", monthId));
  };

  // 月選択
  const sortedShifts = [...shifts].sort((a,b)=>(b._id||"").localeCompare(a._id||""));
  const currentShift = shifts.find(s => s._id === viewMonth);

  // 月別の日付一覧（リスト表示）
  const renderMonthList = () => {
    if (!currentShift) return null;
    const sd = currentShift.shiftByDate || {};
    const overrideDates = (shiftOverrides || [])
      .map((o) => o._id || o.date)
      .filter((d) => d && String(d).startsWith(currentShift._id + "-"));
    const dates = [...new Set([...Object.keys(sd), ...overrideDates])].sort();
    return (
      <div>
        {dates.map(date => {
          const entries = resolveShiftForDate(shifts, shiftOverrides, date);
          const hasOv = hasShiftDayOverride(shiftOverrides, date);
          const dt = new Date(date + "T00:00:00");
          const dow = DAYS_JP[dt.getDay()];
          const dowColor = dt.getDay() === 0 ? "#e24b4a" : dt.getDay() === 6 ? "#7ec8e3" : "#f0e8d0";
          return (
            <div key={date} style={{...S.card,padding:".75rem 1rem"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".4rem",flexWrap:"wrap",gap:".5rem"}}>
                <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                  <span style={{fontFamily:"Georgia,serif",fontSize:".95rem",color:"#c9a84c"}}>{dt.getMonth()+1}/{dt.getDate()}</span>
                  <span style={{fontSize:".7rem",color:dowColor}}>（{dow}）</span>
                  {hasOv ? (
                    <span style={{fontSize:".58rem",color:"rgba(244,162,97,0.85)",letterSpacing:".06em"}}>当日修正あり</span>
                  ) : null}
                </div>
                <span style={{fontSize:".62rem",color:"rgba(240,232,208,0.5)"}}>{entries.length}名</span>
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:".4rem"}}>
                {entries.map((e, i) => {
                  const isMng = isManager(e.name);
                  const color = getRoleColor(e.role);
                  return (
                    <div key={i} style={{
                      padding:".25rem .5rem",
                      background: e.isPerformer ? "rgba(181,140,209,0.13)" : color+"22",
                      border: `1px solid ${e.isPerformer ? "#b58cd1" : color}55`,
                      borderRadius: 3,
                      fontSize: ".7rem",
                      color: e.isPerformer ? "#b58cd1" : "#f0e8d0",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: ".25rem",
                    }}>
                      <span>{e.name}</span>
                      {!e.isPerformer && !isMng && e.time && <span style={{color:"rgba(240,232,208,0.6)",fontSize:".62rem"}}>{e.time}〜</span>}
                      {!e.isPerformer && (
                        <span style={{padding:".05rem .25rem",borderRadius:2,background:color+"33",color:color,fontSize:".55rem",fontWeight:600}}>
                          {getRoleLabel(e.role)}
                        </span>
                      )}
                      {e.isPerformer && (
                        <span style={{padding:".05rem .25rem",borderRadius:2,background:"#b58cd133",color:"#b58cd1",fontSize:".55rem",fontWeight:600}}>出演</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 月別カレンダー表示
  const [expandedDate, setExpandedDate] = useState("");
  const renderMonthCalendar = () => {
    if (!currentShift) return null;
    const sd = currentShift.shiftByDate || {};
    const year = currentShift.year;
    const month = currentShift.month;
    const firstDay = new Date(year, month-1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

    return (
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2,marginBottom:2}}>
          {DAYS_JP.map((d,i)=>(
            <div key={d} style={{textAlign:"center",fontSize:".65rem",padding:".3rem 0",color:i===0?"#e24b4a":i===6?"#7ec8e3":"rgba(240,232,208,0.4)"}}>{d}</div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:2}}>
          {cells.map((day, idx) => {
            if (!day) return <div key={"e"+idx}/>;
            const dateKey = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const entries = resolveShiftForDate(shifts, shiftOverrides, dateKey);
            const hasOv = hasShiftDayOverride(shiftOverrides, dateKey);
            const workers = entries.filter(e => !e.isPerformer);
            const performers = entries.filter(e => e.isPerformer);
            const isToday = dateKey === todayStr;
            const dow = (firstDay + day - 1) % 7;
            const isExpanded = expandedDate === dateKey;
            const canExpand = entries.length > 0 || hasOv || (sd[dateKey] || []).length > 0;
            return (
              <div key={idx}
                onClick={()=>canExpand && setExpandedDate(isExpanded ? "" : dateKey)}
                className="hb-cal-cell"
                style={{
                  background:isToday?"rgba(201,168,76,0.12)":hasOv?"rgba(244,162,97,0.06)":"#111",
                  border:isToday?"1px solid rgba(201,168,76,0.5)":hasOv?"1px solid rgba(244,162,97,0.35)":"1px solid rgba(255,255,255,0.04)",
                  borderRadius:4,padding:".3rem .25rem",minHeight:64,minWidth:0,
                  overflow:"hidden",cursor:canExpand?"pointer":"default",
                  position:"relative",
                }}>
                <div className="hb-cal-day-num" style={{fontSize:".72rem",fontWeight:500,marginBottom:".15rem",color:isToday?"#c9a84c":dow===0?"#e24b4a":dow===6?"#7ec8e3":"rgba(240,232,208,0.55)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span>{day}</span>
                  <span style={{fontSize:".55rem",color:hasOv?"rgba(244,162,97,0.75)":"rgba(240,232,208,0.4)",fontWeight:400}}>
                    {hasOv && entries.length === 0 ? "修" : entries.length > 0 ? `${entries.length}名` : ""}
                  </span>
                </div>
                {/* 全員の名前を表示 */}
                {workers.map((w,i)=>{
                  const color = getRoleColor(w.role);
                  const isMng = isManager(w.name);
                  const showTime = !isMng && w.time;
                  return (
                    <div key={i} style={{
                      fontSize:".5rem",lineHeight:1.25,padding:".1rem .25rem",marginBottom:".1rem",
                      background:color+"33",
                      borderLeft:`3px solid ${color}`,
                      borderRadius:2,
                      color:"#f0e8d0",
                      overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",
                      display:"flex",justifyContent:"space-between",gap:".15rem",
                    }}>
                      <span style={{overflow:"hidden",textOverflow:"ellipsis",minWidth:0}}>{w.name}</span>
                      {showTime && <span style={{color:color,fontWeight:600,fontSize:".48rem",flexShrink:0}}>{w.time}</span>}
                    </div>
                  );
                })}
                {performers.length > 0 && performers.map((p,i)=>(
                  <div key={"p"+i} style={{
                    fontSize:".5rem",lineHeight:1.25,padding:".1rem .25rem",marginBottom:".1rem",
                    background:"rgba(181,140,209,0.25)",
                    borderLeft:"3px solid #b58cd1",
                    borderRadius:2,
                    color:"#dcc4ee",
                    overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",
                  }}>
                    🎤 {p.name}
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 展開された詳細 */}
        {expandedDate && (
          <div style={{marginTop:"1rem",padding:"1rem 1.1rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:6}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:".5rem",flexWrap:"wrap",gap:".4rem"}}>
              <div style={{display:"flex",alignItems:"center",gap:".5rem",flexWrap:"wrap"}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:".95rem",color:"#c9a84c"}}>
                  {(() => {
                    const dt = new Date(expandedDate+"T00:00:00");
                    return `${dt.getMonth()+1}/${dt.getDate()}（${DAYS_JP[dt.getDay()]}）`;
                  })()}
                </div>
                {hasShiftDayOverride(shiftOverrides, expandedDate) ? (
                  <span style={{fontSize:".58rem",color:"rgba(244,162,97,0.85)",letterSpacing:".06em"}}>当日修正あり</span>
                ) : null}
              </div>
              <button type="button" onClick={()=>setExpandedDate("")} style={{...S.btn("sm"),padding:".2rem .6rem",fontSize:".58rem"}}>閉じる</button>
            </div>
            {resolveShiftForDate(shifts, shiftOverrides, expandedDate).length > 0 ? (
              <div style={{display:"flex",flexWrap:"wrap",gap:".4rem",marginBottom:".5rem"}}>
                {resolveShiftForDate(shifts, shiftOverrides, expandedDate).map((e)=>{
                  const isMng = isManager(e.name);
                  const color = getRoleColor(e.role);
                  return (
                    <div key={e.name} style={{
                      padding:".25rem .5rem",
                      background: e.isPerformer ? "rgba(181,140,209,0.13)" : color+"22",
                      border: `1px solid ${e.isPerformer ? "#b58cd1" : color}55`,
                      borderRadius: 3,
                      fontSize: ".75rem",
                      color: e.isPerformer ? "#b58cd1" : "#f0e8d0",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: ".3rem",
                    }}>
                      <span>{e.name}</span>
                      {!e.isPerformer && !isMng && e.time && <span style={{color:"rgba(240,232,208,0.6)",fontSize:".65rem"}}>{e.time}〜</span>}
                      {!e.isPerformer && (
                        <span style={{padding:".05rem .3rem",borderRadius:2,background:color+"33",color:color,fontSize:".58rem",fontWeight:600}}>
                          {getRoleLabel(e.role)}
                        </span>
                      )}
                      {e.isPerformer && (
                        <span style={{padding:".05rem .3rem",borderRadius:2,background:"#b58cd133",color:"#b58cd1",fontSize:".58rem",fontWeight:600}}>出演</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.4)",marginBottom:".5rem"}}>この日のシフトは未登録です</div>
            )}
            <ShiftDayOverridePanel
              dateKey={expandedDate}
              shifts={shifts}
              shiftOverrides={shiftOverrides}
              staffOrder={currentShift?.staffOrder || []}
              onClose={() => setExpandedDate("")}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{padding:"1.5rem 2rem",maxWidth:1100,margin:"0 auto"}} className="hb-view">
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:".5rem"}}>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:"1.2rem",color:"#c9a84c",letterSpacing:".15em",margin:0}}>👥 シフト管理</h2>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          <label style={{...S.btn("ghost"),cursor:"pointer",padding:".45rem .9rem"}}>
            📂 シフトCSVを読み込む
            <input type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/>
          </label>
        </div>
      </div>

      {csvMsg && (
        <div style={{padding:".7rem 1rem",background:csvMsg.startsWith("✅")?"rgba(126,200,127,0.1)":"rgba(244,162,97,0.1)",border:`1px solid ${csvMsg.startsWith("✅")?"#7ec87e":"#f4a261"}`,borderRadius:5,fontSize:".82rem",color:csvMsg.startsWith("✅")?"#7ec87e":"#f4a261",marginBottom:"1rem"}}>{csvMsg}</div>
      )}

      {/* 凡例 */}
      <div style={{display:"flex",gap:".75rem",flexWrap:"wrap",marginBottom:"1rem",fontSize:".62rem",color:"rgba(240,232,208,0.55)"}}>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:10,height:10,background:getRoleColor("hall")+"55",borderRadius:2}}/>ホール</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:10,height:10,background:getRoleColor("pa")+"55",borderRadius:2}}/>PA</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:10,height:10,background:getRoleColor("kitchen")+"55",borderRadius:2}}/>厨房</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:10,height:10,background:getRoleColor("mc")+"55",borderRadius:2}}/>司会</span>
        <span style={{display:"flex",alignItems:"center",gap:".25rem"}}><span style={{display:"inline-block",width:10,height:10,background:"rgba(181,140,209,0.4)",borderRadius:2}}/>出演</span>
      </div>

      {/* 月選択 */}
      {sortedShifts.length > 0 ? (
        <div style={{marginBottom:"1rem"}}>
          <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.6)",marginBottom:".4rem",letterSpacing:".15em"}}>取り込み済みの月：</div>
          <div style={{display:"flex",gap:".4rem",flexWrap:"wrap",alignItems:"center"}}>
            {sortedShifts.map(s => (
              <button key={s._id} onClick={()=>setViewMonth(s._id)} style={{padding:".35rem .8rem",borderRadius:3,border:"1px solid "+(viewMonth===s._id?"#c9a84c":"rgba(201,168,76,0.2)"),background:viewMonth===s._id?"#c9a84c":"transparent",color:viewMonth===s._id?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{s.monthLabel || s._id}</button>
            ))}
          </div>
          {currentShift && (
            <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginTop:".4rem"}}>
              {currentShift.monthLabel} 取り込み日時: {currentShift.importedAt}
              <button style={{...S.btn("danger"),marginLeft:".75rem",padding:".15rem .5rem",fontSize:".55rem"}} onClick={()=>handleDelete(currentShift._id)}>この月を削除</button>
            </div>
          )}
        </div>
      ) : (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem",background:"#0d0d0d",borderRadius:6,marginBottom:"1rem"}}>
          まだシフトが取り込まれていません。<br/>
          上の「📂 シフトCSVを読み込む」から月別の勤務表を読み込んでください。
        </div>
      )}

      {currentShift && (
        <>
          {/* 表示切替 */}
          <div style={{display:"flex",gap:".4rem",marginBottom:"1rem"}}>
            <button onClick={()=>setViewMode("calendar")} style={{padding:".4rem .9rem",borderRadius:3,border:"1px solid "+(viewMode==="calendar"?"#c9a84c":"rgba(201,168,76,0.2)"),background:viewMode==="calendar"?"#c9a84c":"transparent",color:viewMode==="calendar"?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>📅 カレンダー</button>
            <button onClick={()=>setViewMode("list")} style={{padding:".4rem .9rem",borderRadius:3,border:"1px solid "+(viewMode==="list"?"#c9a84c":"rgba(201,168,76,0.2)"),background:viewMode==="list"?"#c9a84c":"transparent",color:viewMode==="list"?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".7rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>📋 リスト</button>
          </div>
          {viewMode === "calendar" ? renderMonthCalendar() : renderMonthList()}
        </>
      )}
    </div>
  );
}

// ===== 当日のシフト取得（today.js から使う） =====
export function getShiftForDate(shifts, dateKey) {
  // dateKey: "YYYY-MM-DD"
  const monthId = dateKey.slice(0, 7); // "YYYY-MM"
  const monthData = shifts.find(s => s._id === monthId);
  if (!monthData) return [];
  return (monthData.shiftByDate || {})[dateKey] || [];
}

// ===== 全シフトから順序付きスタッフ一覧を取得 =====
// CSVの上から順、ただし社長など PERFORMER_ONLY は最後
export function getOrderedStaffNames(shifts) {
  const order = [];
  const seen = new Set();
  // 最新の月から順番に取り込み（順序の起点を最新にする）
  const sortedShifts = [...shifts].sort((a,b)=>(b._id||"").localeCompare(a._id||""));
  for (const monthData of sortedShifts) {
    const list = monthData.staffOrder || [];
    for (const name of list) {
      if (!seen.has(name) && isShiftStaffName(name)) {
        order.push(name);
        seen.add(name);
      }
    }
    // 後方互換：staffOrderがないデータからは shiftByDate から拾う
    if ((!monthData.staffOrder || monthData.staffOrder.length === 0) && monthData.shiftByDate) {
      Object.values(monthData.shiftByDate).forEach(entries => {
        (entries || []).forEach(e => {
          if (e.name && !seen.has(e.name) && isShiftStaffName(e.name)) {
            order.push(e.name);
            seen.add(e.name);
          }
        });
      });
    }
  }
  // 社長など PERFORMER_ONLY を最後に
  const performerOnly = order.filter(n => PERFORMER_ONLY_NAMES.includes(n));
  const others = order.filter(n => !PERFORMER_ONLY_NAMES.includes(n));
  return [...others, ...performerOnly];
}

import { useState, useEffect, useCallback } from "react";
import { db } from "./firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

/** 発注先マスタ（URL は未確定のため空。確定後に差し替え） */
export const PROCUREMENT_VENDORS = [
  { id: "miklead", name: "ミクリード", orderUrl: "", contactUrl: "" },
  { id: "kakuyasu", name: "カクヤス", orderUrl: "", contactUrl: "" },
  { id: "suntory", name: "サントリービバレッジ", orderUrl: "", contactUrl: "" },
  { id: "hanazawa", name: "花澤酒店", orderUrl: "", contactUrl: "" },
  { id: "nishihara", name: "西原商会", orderUrl: "", contactUrl: "" },
  { id: "salan", name: "SALAN", orderUrl: "", contactUrl: "" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "未対応" },
  { value: "planned", label: "発注予定" },
  { value: "ordered", label: "発注済み" },
];

function defaultRow() {
  return {
    plannedDate: "",
    lastOrderedDate: "",
    status: "pending",
    memo: "",
    updatedAt: null,
  };
}

function normalizeVendorDoc(data) {
  const d = data || {};
  const status = STATUS_OPTIONS.some((o) => o.value === d.status) ? d.status : "pending";
  return {
    plannedDate: String(d.plannedDate ?? "").trim(),
    lastOrderedDate: String(d.lastOrderedDate ?? "").trim(),
    status,
    memo: String(d.memo ?? ""),
    updatedAt: d.updatedAt ?? null,
  };
}

function formatUpdatedAt(v) {
  if (v == null) return "—";
  try {
    if (typeof v?.toDate === "function") return v.toDate().toLocaleString("ja-JP");
    if (v instanceof Date) return v.toLocaleString("ja-JP");
  } catch {
    return "—";
  }
  return "—";
}

const S = {
  card: {
    background: "#111",
    border: "1px solid rgba(201,168,76,0.14)",
    borderRadius: 8,
    padding: "1.1rem 1.2rem",
    marginBottom: "1rem",
  },
  secTitle: {
    fontFamily: "Georgia,serif",
    fontSize: ".72rem",
    letterSpacing: ".22em",
    textTransform: "uppercase",
    color: "#c9a84c",
    borderBottom: "1px solid rgba(201,168,76,0.2)",
    paddingBottom: ".45rem",
    marginBottom: ".75rem",
  },
  lbl: {
    fontSize: ".62rem",
    letterSpacing: ".12em",
    textTransform: "uppercase",
    color: "rgba(201,168,76,0.55)",
    fontWeight: 500,
    display: "block",
    marginBottom: ".25rem",
  },
  inp: {
    background: "#111",
    border: "1px solid rgba(201,168,76,0.14)",
    borderRadius: 4,
    color: "#f0e8d0",
    fontFamily: "inherit",
    fontSize: ".82rem",
    padding: ".45rem .55rem",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  btn: (v) => {
    const b = {
      padding: ".45rem .85rem",
      borderRadius: 4,
      fontFamily: "inherit",
      fontSize: ".68rem",
      fontWeight: 500,
      letterSpacing: ".08em",
      cursor: "pointer",
      border: "none",
    };
    if (v === "gold") return { ...b, background: "#c9a84c", color: "#0a0a0a" };
    if (v === "ghost") return { ...b, background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.3)" };
    if (v === "sm") return { ...b, padding: ".32rem .6rem", fontSize: ".62rem", background: "transparent", color: "#c9a84c", border: "1px solid rgba(201,168,76,0.27)" };
    return b;
  },
};

export default function ProcurementModule({ navigateBack }) {
  const [rows, setRows] = useState(() => {
    const init = {};
    PROCUREMENT_VENDORS.forEach((v) => {
      init[v.id] = defaultRow();
    });
    return init;
  });
  const [savingId, setSavingId] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "procurementVendors"), (snap) => {
      const fromSnap = {};
      snap.forEach((d) => {
        fromSnap[d.id] = normalizeVendorDoc(d.data());
      });
      setRows((prev) => {
        const next = { ...prev };
        PROCUREMENT_VENDORS.forEach((v) => {
          next[v.id] = fromSnap[v.id] ?? defaultRow();
        });
        return next;
      });
    });
    return () => unsub();
  }, []);

  const saveVendor = useCallback(async (vendorId) => {
    setSaveError("");
    const row = rows[vendorId];
    if (!row) return;
    setSavingId(vendorId);
    try {
      await setDoc(
        doc(db, "procurementVendors", vendorId),
        {
          plannedDate: row.plannedDate || "",
          lastOrderedDate: row.lastOrderedDate || "",
          status: row.status,
          memo: row.memo,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      setSaveError(e.message || String(e));
    } finally {
      setSavingId(null);
    }
  }, [rows]);

  const setField = (vendorId, key, value) => {
    setRows((r) => ({
      ...r,
      [vendorId]: { ...r[vendorId], [key]: value },
    }));
  };

  return (
    <div style={{ padding: "1.5rem 2rem", maxWidth: 1100, margin: "0 auto" }} className="hb-view">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: ".75rem" }}>
        <div>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: "1.2rem", color: "#c9a84c", letterSpacing: ".12em", margin: 0 }}>
            📦 発注管理
          </h2>
          <p style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.45)", margin: ".5rem 0 0", lineHeight: 1.55, maxWidth: 640 }}>
            ログインは各公式サイト上で行ってください。ID・パスワード・Cookie・APIキーは本アプリに保存しません。
          </p>
        </div>
        <button type="button" style={S.btn("sm")} onClick={navigateBack}>
          ← 戻る
        </button>
      </div>

      {saveError ? (
        <div style={{ fontSize: ".78rem", color: "#e24b4a", marginBottom: "1rem", padding: ".6rem .75rem", border: "1px solid rgba(226,75,74,0.35)", borderRadius: 6 }}>
          保存エラー: {saveError}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }} className="hb-module-grid">
        {PROCUREMENT_VENDORS.map((v) => {
          const row = rows[v.id] || defaultRow();
          const hasOrder = Boolean(String(v.orderUrl || "").trim());
          const hasContact = Boolean(String(v.contactUrl || "").trim());
          return (
            <div key={v.id} style={S.card}>
              <div style={{ ...S.secTitle, marginTop: 0 }}>{v.name}</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginBottom: ".85rem" }}>
                {hasOrder ? (
                  <a href={v.orderUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btn("gold"), textDecoration: "none", display: "inline-block" }}>
                    発注サイトを開く
                  </a>
                ) : null}
                {hasContact ? (
                  <a href={v.contactUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btn("ghost"), textDecoration: "none", display: "inline-block" }}>
                    連絡先を開く
                  </a>
                ) : null}
                {!hasOrder && !hasContact ? (
                  <span style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.35)", padding: ".35rem 0" }}>リンク未設定（URL 確定後にマスタへ追記）</span>
                ) : null}
              </div>

              <label style={S.lbl}>発注予定日</label>
              <input type="date" style={{ ...S.inp, marginBottom: ".65rem" }} value={row.plannedDate} onChange={(e) => setField(v.id, "plannedDate", e.target.value)} />

              <label style={S.lbl}>最終発注日</label>
              <input type="date" style={{ ...S.inp, marginBottom: ".65rem" }} value={row.lastOrderedDate} onChange={(e) => setField(v.id, "lastOrderedDate", e.target.value)} />

              <label style={S.lbl}>ステータス</label>
              <select style={{ ...S.inp, marginBottom: ".65rem" }} value={row.status} onChange={(e) => setField(v.id, "status", e.target.value)}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <label style={S.lbl}>メモ</label>
              <textarea style={{ ...S.inp, minHeight: 88, resize: "vertical", lineHeight: 1.45, marginBottom: ".75rem" }} value={row.memo} onChange={(e) => setField(v.id, "memo", e.target.value)} placeholder="発注内容・担当者・注意事項など" />

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: ".5rem" }}>
                <button type="button" style={S.btn("gold")} disabled={savingId === v.id} onClick={() => saveVendor(v.id)}>
                  {savingId === v.id ? "保存中…" : "💾 保存"}
                </button>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.4)", letterSpacing: ".04em" }}>
                  最終更新: {formatUpdatedAt(row.updatedAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

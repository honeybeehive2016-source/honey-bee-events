import { useState, useEffect, useRef } from "react";
import { db, storage } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

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
  purpose: "", people: "", budget: "", perPersonBudget: "",
  food: "", drinks: "", stage: false, sound: false, mic: false, projector: false,
  contactName: "", phone: "", email: "",
  customerCompany: "",
  /** 一覧・詳細の表示名（未設定時は法人/団体名・担当者名から自動） */
  rentalTitle: "",
  status: "new",
  replyStatus: "", quoteStatus: "",
  outcome: "",
  memo: "",
  quoteItems: [],
  quoteNo: "",
  invoiceNo: "",
  quoteSubject: "",
  invoiceSubject: "",
  validityDate: "",
  // 予約金管理
  depositPolicy: "required",
  depositReceived: false,
  depositDate: "",
  depositAmount: "30000",
  depositMemo: "",
  staff: "",
  documentHistory: [],
  /** 喫煙可否: unknown | no | yes（未設定ドキュメントは unknown 扱い） */
  smokingPolicy: "unknown",
  /** 見積明細の単価・行金額の表示: exclusive=税抜（保存の price は常に税抜単価）/ inclusive=税込相当の参考表示 */
  documentTaxMode: "exclusive",
  /** 添付: { storagePath, downloadURL, originalName, contentType, sizeBytes, uploadedAt }[] */
  attachments: [],
};

// 担当者リスト
export const STAFF_LIST = ["西崎", "渡辺"];

// プリセット項目
const PRESET_ITEMS = [
  // ホールレンタル料金
  { name: "ホールレンタル料金（平日10:00〜15:00）", price: 50000, unit: "式", group: "ホール" },
  { name: "ホールレンタル料金（平日15:00〜21:00）", price: 80000, unit: "式", group: "ホール" },
  { name: "ホールレンタル料金（土日祝10:00〜15:00）", price: 80000, unit: "式", group: "ホール" },
  { name: "ホールレンタル料金（土日祝15:00〜21:00）", price: 150000, unit: "式", group: "ホール" },
  // 飲み放題
  { name: "飲み放題（1時間）", price: 1500, unit: "名", group: "飲み放題" },
  { name: "飲み放題（2時間）", price: 2500, unit: "名", group: "飲み放題" },
  { name: "飲み放題（3時間）", price: 3500, unit: "名", group: "飲み放題" },
  // コース料理
  { name: "コース料理（5品）", price: 2500, unit: "名", group: "料理" },
  { name: "コース料理（7〜8品）", price: 3500, unit: "名", group: "料理" },
  { name: "コース料理（10品）", price: 4500, unit: "名", group: "料理" },
];

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

function normalizeSmokingPolicy(v) {
  if (v === "no" || v === "yes" || v === "unknown") return v;
  return "unknown";
}

function smokingPolicyLabel(v) {
  const t = { unknown: "未確認", no: "喫煙不可", yes: "喫煙可" };
  return t[normalizeSmokingPolicy(v)] || "未確認";
}

/** 明細・PDF の単価列表示モード（Firestore の price は常に税抜単価） */
function normalizeDocumentTaxMode(v) {
  return v === "inclusive" ? "inclusive" : "exclusive";
}

function quoteSubtotalExTax(items) {
  return (items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
}

const DetailRow = ({ label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 160px) 1fr", gap: ".75rem", padding: ".5rem 0", borderBottom: "1px solid rgba(201,168,76,0.08)", alignItems: "start" }}>
    <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.65)", letterSpacing: ".08em" }}>{label}</div>
    <div style={{ fontSize: ".86rem", color: "#f0e8d0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{value !== undefined && value !== null && value !== "" ? value : "—"}</div>
  </div>
);

const MAX_RENTAL_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function sanitizeRentalFileName(name) {
  const base = String(name || "file").replace(/[/\\?%*:|"<>]/g, "_").replace(/^\.+/, "").trim();
  return (base || "file").slice(0, 120);
}

function isAllowedRentalAttachmentMime(file) {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf") return true;
  if (t.startsWith("image/")) return true;
  return false;
}

function isImageAttachmentRecord(att) {
  return (att.contentType || "").toLowerCase().startsWith("image/");
}

function isPdfAttachmentRecord(att) {
  if ((att.contentType || "").toLowerCase() === "application/pdf") return true;
  const name = String(att.originalName || "").toLowerCase();
  return name.endsWith(".pdf");
}

function formatAttachmentSizeBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

/** YYYY-MM-DD の利用日が有効か */
function isValidDesiredDateYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function localTodayYmd() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 一覧・詳細で表示する貸切名（rentalTitle 優先、なければ従来どおり） */
function displayRentalTitle(r) {
  const t = String(r.rentalTitle || "").trim();
  if (t) return t;
  const parts = [r.customerCompany, r.contactName].filter((x) => String(x || "").trim());
  if (parts.length) return parts.join(" ／ ");
  return (r.contactName || "").trim() || "（無題）";
}

/** filtered 済みリストを、今後 / 過去 / 日付未設定に分割（各配列はソート済み） */
function partitionRentalsByDesiredDate(filteredList) {
  const todayYmd = localTodayYmd();
  const upcoming = [];
  const past = [];
  const undated = [];
  for (const r of filteredList) {
    const ymd = (r.desiredDate || "").trim();
    if (!isValidDesiredDateYmd(ymd)) {
      undated.push(r);
      continue;
    }
    if (ymd >= todayYmd) upcoming.push(r);
    else past.push(r);
  }
  upcoming.sort((a, b) => (a.desiredDate || "").localeCompare(b.desiredDate || ""));
  past.sort((a, b) => (b.desiredDate || "").localeCompare(a.desiredDate || ""));
  undated.sort((a, b) => (b.inquiryDate || "").localeCompare(a.inquiryDate || ""));
  return { upcoming, past, undated };
}

const attachmentOpenLinkStyle = {
  ...S.btn("gold"),
  fontSize: ".68rem",
  textDecoration: "none",
  display: "inline-block",
  textAlign: "center",
  padding: ".48rem 1rem",
  letterSpacing: ".06em",
  width: "100%",
  boxSizing: "border-box",
};

function RentalAttachmentTile({ att, idx, readOnly, onRemove }) {
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const url = att.downloadURL || "#";
  const isImg = isImageAttachmentRecord(att);
  const isPdf = isPdfAttachmentRecord(att);

  useEffect(() => {
    if (!pdfModalOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setPdfModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pdfModalOpen]);
  const wrapStyle = {
    width: 280,
    maxWidth: "100%",
    padding: ".55rem",
    background: "rgba(201,168,76,0.05)",
    borderRadius: 8,
    border: "1px solid rgba(201,168,76,0.15)",
    display: "flex",
    flexDirection: "column",
    gap: ".5rem",
    boxSizing: "border-box",
  };

  const removeBtn = !readOnly && onRemove ? (
    <button
      type="button"
      style={{ ...S.btn("sm"), fontSize: ".58rem", padding: ".2rem .45rem", color: "#e24b4a", borderColor: "rgba(226,75,74,0.35)", alignSelf: "stretch" }}
      onClick={() => onRemove(idx)}
    >
      削除
    </button>
  ) : null;

  if (isImg) {
    return (
      <div style={wrapStyle}>
        <div
          style={{
            height: 200,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#101010",
            borderRadius: 8,
            border: "1px solid rgba(201,168,76,0.15)",
            overflow: "hidden",
            padding: ".4rem",
            boxSizing: "border-box",
          }}
        >
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: "block", maxWidth: "100%", maxHeight: "100%" }}>
            <img
              src={url}
              alt=""
              style={{
                maxWidth: "100%",
                maxHeight: 188,
                width: "auto",
                height: "auto",
                objectFit: "contain",
                display: "block",
                margin: "0 auto",
                cursor: "zoom-in",
              }}
            />
          </a>
        </div>
        <div style={{ fontSize: ".65rem", color: "rgba(240,232,208,0.55)", wordBreak: "break-all", lineHeight: 1.35 }}>{att.originalName || "画像"}</div>
        <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.4)" }}>{formatAttachmentSizeBytes(att.sizeBytes)}</div>
        <a href={url} target="_blank" rel="noopener noreferrer" style={attachmentOpenLinkStyle}>
          画像を開く
        </a>
        {removeBtn}
      </div>
    );
  }

  if (isPdf) {
    const canOpen = url && url !== "#";
    const pdfLabel = att.originalName || "PDF";
    return (
      <>
        <div style={wrapStyle}>
          <div
            style={{
              minHeight: 120,
              borderRadius: 8,
              border: "1px solid rgba(201,168,76,0.22)",
              background: "linear-gradient(145deg, #1a1510 0%, #0e0e0e 100%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: ".35rem",
              padding: ".85rem .65rem",
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "2rem", lineHeight: 1 }} aria-hidden>📄</div>
            <div style={{ fontSize: ".62rem", letterSpacing: ".2em", textTransform: "uppercase", color: "#c9a84c", fontWeight: 600 }}>PDF</div>
          </div>
          <div style={{ fontSize: ".65rem", color: "rgba(240,232,208,0.55)", wordBreak: "break-all", lineHeight: 1.35 }}>{pdfLabel}</div>
          <div style={{ fontSize: ".6rem", color: "rgba(240,232,208,0.4)" }}>{formatAttachmentSizeBytes(att.sizeBytes)}</div>
          {canOpen ? (
            <a href={url} target="_blank" rel="noopener noreferrer" style={attachmentOpenLinkStyle}>
              PDFを開く
            </a>
          ) : (
            <span style={{ ...attachmentOpenLinkStyle, opacity: 0.45, cursor: "not-allowed", pointerEvents: "none" }}>PDFを開く</span>
          )}
          <button
            type="button"
            disabled={!canOpen}
            onClick={() => canOpen && setPdfModalOpen(true)}
            style={{
              ...S.btn("ghost"),
              width: "100%",
              boxSizing: "border-box",
              padding: ".48rem 1rem",
              fontSize: ".68rem",
              letterSpacing: ".06em",
              opacity: canOpen ? 1 : 0.45,
              cursor: canOpen ? "pointer" : "not-allowed",
            }}
          >
            PDFプレビュー
          </button>
          {removeBtn}
        </div>
        {pdfModalOpen && canOpen ? (
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 220,
              background: "rgba(0,0,0,0.88)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            onClick={() => setPdfModalOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="PDFプレビュー"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(960px, 100%)",
                height: "min(88vh, 900px)",
                maxHeight: "88vh",
                background: "#0d0d0d",
                border: "1px solid rgba(201,168,76,0.35)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                boxShadow: "0 12px 48px rgba(0,0,0,0.55)",
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: ".5rem",
                  padding: ".65rem .85rem",
                  borderBottom: "1px solid rgba(201,168,76,0.2)",
                  background: "rgba(201,168,76,0.06)",
                }}
              >
                <div style={{ fontSize: ".78rem", color: "#f0e8d0", fontWeight: 600, flex: "1 1 160px", minWidth: 0, wordBreak: "break-all" }}>{pdfLabel}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem", marginLeft: "auto" }}>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...S.btn("sm"), textDecoration: "none", display: "inline-block", borderColor: "rgba(201,168,76,0.45)", color: "#c9a84c" }}>
                    新しいタブで開く
                  </a>
                  <button type="button" style={S.btn("gold")} onClick={() => setPdfModalOpen(false)}>
                    閉じる
                  </button>
                </div>
              </div>
              <div style={{ flex: 1, minHeight: 0, position: "relative", background: "#111" }}>
                <iframe key={url} title={pdfLabel} src={url} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none", display: "block" }} />
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div style={wrapStyle}>
      <div style={{ fontSize: "2rem", lineHeight: 1, textAlign: "center" }}>📎</div>
      <div style={{ fontSize: ".78rem", color: "#f0e8d0", fontWeight: 500, wordBreak: "break-all", lineHeight: 1.35 }}>{att.originalName || "ファイル"}</div>
      <div style={{ fontSize: ".65rem", color: "rgba(240,232,208,0.45)" }}>{formatAttachmentSizeBytes(att.sizeBytes)}</div>
      <a href={url} target="_blank" rel="noopener noreferrer" style={attachmentOpenLinkStyle}>
        ファイルを開く
      </a>
      {removeBtn}
    </div>
  );
}

function RentalAttachmentsGallery({ attachments, readOnly, onRemove, uploading }) {
  const list = attachments || [];
  if (!list.length) {
    if (uploading) {
      return <div style={{ fontSize: ".68rem", color: "rgba(201,168,76,0.65)", padding: ".25rem 0 .75rem" }}>アップロード中...</div>;
    }
    return (
      <div style={{ fontSize: readOnly ? ".78rem" : ".68rem", color: "rgba(240,232,208,0.35)", padding: ".25rem 0 .75rem" }}>
        {readOnly ? "添付はありません" : "添付はまだありません"}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-start", padding: readOnly ? ".35rem 0 1rem" : ".25rem 0 .5rem" }}>
      {list.map((att, idx) => (
        <RentalAttachmentTile key={att.storagePath || `${att.uploadedAt}-${idx}`} att={att} idx={idx} readOnly={readOnly} onRemove={onRemove} />
      ))}
    </div>
  );
}

function RentalListCard({ r, onOpenDetail, onOpenEdit, onTrash }) {
  const ymd = (r.desiredDate || "").trim();
  const dated = isValidDesiredDateYmd(ymd);
  const [yy, mm, dd] = dated ? ymd.split("-") : ["", "", ""];
  const timeStr = String(r.desiredTime || "").trim();
  const title = displayRentalTitle(r);

  return (
    <div style={S.card} className="hb-card">
      <div onClick={onOpenDetail} style={{ cursor: "pointer" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(92px, 108px) 1fr", gap: ".85rem", alignItems: "start", marginBottom: ".35rem" }}>
          <div
            style={{
              textAlign: "center",
              padding: ".45rem .35rem",
              background: dated ? "rgba(201,168,76,0.14)" : "rgba(244,162,97,0.1)",
              borderRadius: 8,
              border: `1px solid ${dated ? "rgba(201,168,76,0.35)" : "rgba(244,162,97,0.35)"}`,
              minHeight: 88,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: ".15rem",
            }}
          >
            {dated ? (
              <>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#c9a84c", lineHeight: 1.05, letterSpacing: ".02em" }}>
                  {mm}/{dd}
                </div>
                <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.55)", fontWeight: 500 }}>{yy}</div>
                {timeStr ? (
                  <div style={{ fontSize: ".58rem", color: "rgba(240,232,208,0.65)", marginTop: ".15rem", lineHeight: 1.25, wordBreak: "break-all" }}>{timeStr}</div>
                ) : null}
              </>
            ) : (
              <div style={{ fontSize: ".78rem", fontWeight: 700, color: "#f4a261", lineHeight: 1.25, letterSpacing: ".04em" }}>
                日付
                <br />
                未設定
              </div>
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: ".45rem", marginBottom: ".35rem", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Georgia,serif", fontSize: "1.02rem", color: "#f0e8d0", wordBreak: "break-word" }}>{title}</span>
              <StatusBadge status={r.status} />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: ".35rem", marginBottom: ".25rem" }}>
              {r.staff && (
                <span style={{ display: "inline-block", padding: ".1rem .4rem", borderRadius: 2, fontSize: ".55rem", letterSpacing: ".08em", background: "rgba(201,168,76,0.1)", color: "rgba(201,168,76,0.8)" }}>
                  👤 {r.staff}
                </span>
              )}
              {r.depositPolicy === "required" && (
                <span
                  style={{
                    display: "inline-block",
                    padding: ".1rem .4rem",
                    borderRadius: 2,
                    fontSize: ".55rem",
                    letterSpacing: ".08em",
                    background: r.depositReceived ? "rgba(126,200,127,0.13)" : "rgba(244,162,97,0.13)",
                    color: r.depositReceived ? "#7ec87e" : "#f4a261",
                  }}
                >
                  {r.depositReceived ? "💰 受領済" : "💰 未受領"}
                </span>
              )}
              {r.depositPolicy === "waived" && (
                <span style={{ display: "inline-block", padding: ".1rem .4rem", borderRadius: 2, fontSize: ".55rem", letterSpacing: ".08em", background: "rgba(255,255,255,0.05)", color: "rgba(240,232,208,0.5)" }}>
                  予約金なし
                </span>
              )}
              {(r.documentHistory || []).length > 0 && (
                <span style={{ display: "inline-block", padding: ".1rem .4rem", borderRadius: 2, fontSize: ".55rem", letterSpacing: ".08em", background: "rgba(126,200,227,0.13)", color: "#7ec8e3" }}>
                  📄 {r.documentHistory.length}件
                </span>
              )}
            </div>
            <div style={{ fontSize: ".68rem", color: "rgba(240,232,208,0.48)", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "baseline" }}>
              {dated && <span style={{ fontWeight: 500, color: "rgba(240,232,208,0.55)" }}>{ymd.replace(/-/g, "/")}</span>}
              {r.people && <span>👥 {r.people}名</span>}
              {(r.budget || "").trim() ? <span>💴 {r.budget}</span> : null}
              {(r.perPersonBudget || "").trim() ? <span>👤💴 {r.perPersonBudget}</span> : null}
              {r.purpose && <span>📝 {r.purpose}</span>}
              {r.inquiryDate && <span style={{ opacity: 0.38, fontSize: ".6rem", letterSpacing: ".02em" }}>受付日 {r.inquiryDate}</span>}
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: ".4rem" }}>
        <button type="button" style={S.btn("sm")} onClick={(e) => { e.stopPropagation(); onOpenEdit(); }}>
          編集
        </button>
        <button type="button" style={S.btn("danger")} onClick={(e) => { e.stopPropagation(); onTrash(); }}>
          削除
        </button>
      </div>
    </div>
  );
}

async function deleteRentalAttachmentStorageObjects(attachments) {
  if (!attachments || !attachments.length) return;
  await Promise.all(
    attachments.map(async (a) => {
      if (!a || !a.storagePath) return;
      try {
        await deleteObject(ref(storage, a.storagePath));
      } catch (e) {
        console.warn("rental attachment storage delete:", a.storagePath, e);
      }
    })
  );
}

async function uploadRentalAttachmentFile(rentalId, file) {
  const safe = sanitizeRentalFileName(file.name);
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${safe}`;
  const storagePath = `rentals/${rentalId}/attachments/${unique}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);
  return {
    storagePath,
    downloadURL,
    originalName: file.name || safe,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    uploadedAt: Date.now(),
  };
}

// 連番取得（Firestoreで集中管理）
async function getNextNumber(type) {
  const ref = doc(db, "counters", type);
  const snap = await getDoc(ref);
  let next = 10001;
  if (snap.exists()) next = (snap.data().value || 10000) + 1;
  await setDoc(ref, { value: next });
  return String(next);
}

const COMPANY_INFO = {
  name: "ビーハイブ株式会社",
  zip: "〒247-0056",
  address: "鎌倉市大船1-22-19 第2三友ビル3F",
  tel: "0467-46-5576",
  hp: "https://www.ofunahoneybee.net",
  email: "info@beehive2016.com",
  staff: "西崎",
  bank: "湘南信用金庫 大船支店",
  bankNum: "(普) 4225938",
  bankName: "ビーハイブ カブシキガイシャ",
  invoiceRegNo: "T9021001059544",
};

function buildDocumentHTMLFromSnapshot(snap) {
  const isInvoice = snap.type === "invoice";
  const title = isInvoice ? "御請求書" : "御見積書";
  const dateLabel = isInvoice ? "請求日" : "見積日";
  const noLabel = isInvoice ? "請求No." : "見積No.";

  const docDate = snap.date ? new Date(snap.date) : new Date();
  const dateStr = `${docDate.getFullYear()}年${docDate.getMonth()+1}月${docDate.getDate()}日`;

  const subtotal = snap.subtotal || snap.items.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0);
  const tax = snap.tax || Math.round(subtotal * 0.1);
  const total = snap.total || subtotal + tax;
  const depositAmount = snap.depositAmount || 0;
  const balance = snap.balance != null ? snap.balance : (total - depositAmount);
  const showDeposit = isInvoice && depositAmount > 0;

  const validityStr = snap.validityDate
    ? `${new Date(snap.validityDate).getFullYear()}年${new Date(snap.validityDate).getMonth()+1}月${new Date(snap.validityDate).getDate()}日`
    : "発行日より30日間";

  const customerName = snap.customerName || "";
  const items = snap.items || [];
  const lineMode = normalizeDocumentTaxMode(snap.linePriceMode);
  const priceTh = lineMode === "inclusive" ? "単価（税込）" : "単価（税抜）";
  const amountTh = lineMode === "inclusive" ? "金額（税込相当）" : "金額";

  const minRows = 15;
  const itemRows = [];
  for (let i = 0; i < Math.max(minRows, items.length); i++) {
    const it = items[i];
    if (it) {
      const q = Number(it.qty || 0);
      const p = Number(it.price || 0);
      const unitDisp = lineMode === "inclusive" && p ? Math.round(p * 1.1) : (p || "");
      const amtEx = q && p ? q * p : 0;
      const amtDisp = lineMode === "inclusive" && amtEx ? Math.round(amtEx * 1.1) : (amtEx || "");
      const unitStr = unitDisp === "" ? "" : (typeof unitDisp === "number" ? unitDisp.toLocaleString() : String(unitDisp));
      const amtStr = amtDisp === "" ? "" : (typeof amtDisp === "number" ? amtDisp.toLocaleString() : String(amtDisp));
      itemRows.push(`
        <tr>
          <td class="desc">${escapeHtml(it.name||"")}</td>
          <td class="num">${it.qty||""}</td>
          <td class="num">${it.unit||""}</td>
          <td class="num">${unitStr}</td>
          <td class="num">${amtStr}</td>
        </tr>`);
    } else {
      itemRows.push(`<tr><td class="desc">　</td><td></td><td></td><td></td><td></td></tr>`);
    }
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "游明朝", "Yu Mincho", "ヒラギノ明朝 ProN", serif; color: #000; background: #fff; padding: 0; font-size: 10.5pt; line-height: 1.5; }
  .doc { max-width: 186mm; margin: 0 auto; position: relative; }
  h1 { text-align: center; font-size: 22pt; letter-spacing: 1em; padding-left: 1em; font-weight: normal; margin-bottom: 1.5em; }
  .top { display: grid; grid-template-columns: 1fr 1fr; gap: 1em; margin-bottom: 1em; }
  .customer { padding-top: .5em; }
  .customer-name { font-size: 14pt; border-bottom: 1px solid #000; padding: .5em 0 .25em; min-width: 200px; display: inline-block; }
  .customer-name + span { font-size: 11pt; padding-left: .5em; }
  .meta { text-align: right; font-size: 10pt; }
  .meta-row { display: flex; justify-content: flex-end; gap: .5em; margin-bottom: .25em; }
  .meta-label { width: 60px; }
  .meta-val { min-width: 100px; border-bottom: 1px solid #000; padding: 0 .3em; text-align: left; }
  .info-block { display: grid; grid-template-columns: 1fr 1fr; gap: 1em; margin-bottom: 1em; align-items: start; }
  .left-info { font-size: 10pt; line-height: 1.7; }
  .left-info .greeting { margin-bottom: .5em; }
  .left-info .field { margin-bottom: .3em; display: flex; align-items: center; gap: .5em; }
  .left-info .field-label { white-space: nowrap; }
  .left-info .field-value { flex: 1; border-bottom: 1px solid #000; padding: 0 .3em; }
  .company { font-size: 10pt; line-height: 1.7; }
  .total-box { border: 2px solid #000; padding: .6em 1em; margin: .5em 0 1em; display: flex; align-items: center; gap: 1em; }
  .total-label { font-size: 12pt; font-weight: bold; }
  .total-value { font-size: 14pt; font-weight: bold; flex: 1; }
  .tax-note { font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: .35em .5em; font-size: 9.5pt; }
  th { background: #d0d0d0; font-weight: normal; }
  .desc { text-align: left; }
  .num { text-align: right; }
  .total-row td { font-weight: bold; background: #f5f5f5; }
  .footer { margin-top: 1em; font-size: 9.5pt; line-height: 1.7; }
  .footer-grid { display: grid; grid-template-columns: 1fr; gap: .3em; }
  .bank { display: flex; gap: 1em; }
  .bank-label { white-space: nowrap; }
  .memo-box { border: 1px solid #000; padding: .5em; margin-top: 1em; min-height: 50px; }
  .memo-label { font-size: 9pt; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none; }
  }
  .actions { text-align: center; margin: 1em 0; }
  .btn { padding: .6em 1.5em; font-size: 11pt; cursor: pointer; background: #c9a84c; border: none; color: #000; font-weight: bold; border-radius: 4px; margin: 0 .3em; }
  .btn-secondary { background: #555; color: #fff; }
</style>
</head>
<body>
<div class="actions no-print">
  <button class="btn" onclick="window.print()">🖨 PDFとして保存 / 印刷</button>
  <button class="btn btn-secondary" onclick="window.close()">閉じる</button>
</div>
<div class="doc">
  <h1>${title}</h1>
  <div class="top">
    <div class="customer">
      <span class="customer-name">${escapeHtml(customerName)}</span><span>様</span>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="meta-label">${noLabel}</span><span class="meta-val">${escapeHtml(snap.no||"")}</span></div>
      <div class="meta-row"><span class="meta-label">${dateLabel}</span><span class="meta-val">${dateStr}</span></div>
    </div>
  </div>

  <div class="info-block">
    <div class="left-info">
      <div class="greeting">下記のとおり、${isInvoice?"御請求":"御見積"}申し上げます。</div>
      <div class="field">
        <span class="field-label">件　名：</span>
        <span class="field-value">${escapeHtml(snap.subject||"")}</span>
      </div>
      ${!isInvoice?`<div class="field">
        <span class="field-label">有効期限：</span>
        <span class="field-value">${validityStr}</span>
      </div>`:""}
    </div>
    <div class="company">
      <div><strong>${COMPANY_INFO.name}</strong></div>
      <div>${COMPANY_INFO.zip}</div>
      <div>${COMPANY_INFO.address}</div>
      <div>TEL：${COMPANY_INFO.tel}</div>
      <div>HP：<a href="${COMPANY_INFO.hp}">${COMPANY_INFO.hp.replace("https://","")}</a></div>
      <div>E-Mail：${COMPANY_INFO.email}</div>
      <div>担当：${COMPANY_INFO.staff}</div>
      <div style="font-size: 9pt; margin-top: .25em;">登録番号：${COMPANY_INFO.invoiceRegNo}</div>
    </div>
  </div>

  <div class="total-box">
    <span class="total-label">${showDeposit?"ご請求金額":"合計金額"}</span>
    <span class="total-value">¥${(showDeposit?balance:total).toLocaleString()}</span>
    <span class="tax-note">（税込）</span>
  </div>

  ${showDeposit?`
  <div style="font-size: 9.5pt; margin: -0.5em 0 0.7em; padding: 0.4em 0.8em; background: #f5f5f5; border-left: 3px solid #888;">
    合計金額 ¥${total.toLocaleString()}（税込）から、ご入金済み予約金 ¥${depositAmount.toLocaleString()}${snap.depositDate?`（${new Date(snap.depositDate).getFullYear()}/${new Date(snap.depositDate).getMonth()+1}/${new Date(snap.depositDate).getDate()}受領）`:""} を差し引いた残額となります。
  </div>`:""}

  ${lineMode === "inclusive" ? `<p style="font-size:8.5pt;margin:0 0 .5em;line-height:1.45;">※明細の単価・金額は税込相当額（税抜単価に10%を加えた額を四捨五入）の参考表示です。小計・消費税・合計は従来どおり税抜基準で計算しています。</p>` : ""}

  <table>
    <thead>
      <tr>
        <th class="desc" style="width: 50%;">摘要</th>
        <th style="width: 10%;">数量</th>
        <th style="width: 10%;">単位</th>
        <th style="width: 15%;">${priceTh}</th>
        <th style="width: 15%;">${amountTh}</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows.join("")}
      <tr class="total-row">
        <td colspan="4" class="num">小計</td>
        <td class="num">¥${subtotal.toLocaleString()}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="num">消費税（10%）</td>
        <td class="num">¥${tax.toLocaleString()}</td>
      </tr>
      <tr class="total-row">
        <td colspan="4" class="num">合計</td>
        <td class="num">¥${total.toLocaleString()}</td>
      </tr>
      ${showDeposit?`
      <tr class="total-row">
        <td colspan="4" class="num">ご入金済み（予約金）</td>
        <td class="num">－¥${depositAmount.toLocaleString()}</td>
      </tr>
      <tr class="total-row" style="background:#e8e8e8;">
        <td colspan="4" class="num"><strong>ご請求金額（残額）</strong></td>
        <td class="num"><strong>¥${balance.toLocaleString()}</strong></td>
      </tr>`:""}
    </tbody>
  </table>

  ${isInvoice?`
  <div class="footer">
    <div class="footer-grid">
      <div class="bank"><span class="bank-label">振込先</span><span>${COMPANY_INFO.bank}</span></div>
      <div class="bank"><span class="bank-label">口座番号</span><span>${COMPANY_INFO.bankNum}</span></div>
      <div class="bank"><span class="bank-label">口座名</span><span>${COMPANY_INFO.bankName}</span></div>
      <div style="font-size: 9pt; margin-top: .3em;">※振込手数料はお客様にてご負担にてお願い致します。</div>
    </div>
  </div>`:""}

  <div class="memo-box">
    <div class="memo-label">備考</div>
  </div>
</div>
</body>
</html>`;
}

// 旧 buildDocumentHTML は互換のため残す（呼ばれない）
function buildDocumentHTML(type, rental, items, no, subject) {
  const subtotal = items.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0);
  return buildDocumentHTMLFromSnapshot({
    type, no, date: new Date().toISOString().split("T")[0], subject,
    customerName: rental.customerCompany || rental.contactName || "",
    items, validityDate: rental.validityDate,
    subtotal, tax: Math.round(subtotal*0.1), total: subtotal + Math.round(subtotal*0.1),
  });
}

function escapeHtml(s) {
  if (!s) return "";
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function openDocumentWindow(type, rental, setRental) {
  const items = rental.quoteItems || [];
  if (items.length === 0) {
    alert("見積項目を1つ以上追加してください");
    return;
  }
  // 新しい連番を毎回取得（=新しい書類として履歴に残す）
  const no = await getNextNumber(type === "invoice" ? "invoice" : "quote");
  const subject = type === "invoice" ? (rental.invoiceSubject || rental.quoteSubject) : rental.quoteSubject;

  // 履歴用のスナップショット
  const today = new Date();
  const depositReceived = !!(rental.depositPolicy === "required" && rental.depositReceived);
  const depositAmount = depositReceived ? Number(rental.depositAmount || 0) : 0;
  const snapshot = {
    type,
    no,
    date: today.toISOString().split("T")[0],
    issuedAt: today.toLocaleString("ja-JP"),
    subject,
    customerName: rental.customerCompany || rental.contactName || "",
    items: JSON.parse(JSON.stringify(items)),
    validityDate: rental.validityDate || "",
    subtotal: items.reduce((s,i)=>s+(Number(i.qty||0)*Number(i.price||0)),0),
    depositReceived,
    depositAmount,
    depositDate: rental.depositDate || "",
  };
  snapshot.tax = Math.round(snapshot.subtotal * 0.1);
  snapshot.total = snapshot.subtotal + snapshot.tax;
  snapshot.balance = snapshot.total - snapshot.depositAmount;
  snapshot.linePriceMode = normalizeDocumentTaxMode(rental.documentTaxMode);

  // フォームに現在のNoと履歴を保存
  setRental(r => {
    const history = [...(r.documentHistory || []), snapshot];
    const update = { ...r, documentHistory: history };
    if (type === "invoice") update.invoiceNo = no;
    else update.quoteNo = no;
    return update;
  });

  // ウィンドウを開く（スナップショットから生成）
  openDocFromSnapshot(snapshot);
}

function openDocFromSnapshot(snapshot) {
  const html = buildDocumentHTMLFromSnapshot(snapshot);
  const w = window.open("", "_blank", "width=900,height=1200");
  if (!w) { alert("ポップアップがブロックされました。許可してください。"); return; }
  w.document.write(html);
  w.document.close();
}

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
一人当たり予算：${String(rental.perPersonBudget || "").trim() ? rental.perPersonBudget : "未記入"}
ご希望オプション：${[rental.food && "料理", rental.drinks && "飲み放題", rental.stage && "ステージ", rental.sound && "音響", rental.mic && "マイク", rental.projector && "プロジェクター"].filter(Boolean).join("、") || "なし"}
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

export default function RentalsModule({ apiKey, onRequireApiKey, navigateBack, initialOpenId, onConsumeOpenId, events = [], onConvertToEvent, onBulkImport }) {
  const [rentals, setRentals] = useState([]);
  const [view, setView] = useState("list"); // list | detail | edit
  const [form, setForm] = useState(emptyRental);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [staffFilter, setStaffFilter] = useState("all");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState("");
  const [copied, setCopied] = useState("");

  const [showTrash, setShowTrash] = useState(false);
  const [allRentals, setAllRentals] = useState([]); // 削除済みも含む
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const attachmentInputRef = useRef(null);
  const [showPastRentals, setShowPastRentals] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "rentals"), (snap) => {
      const list = [];
      snap.forEach(d => list.push({ ...d.data(), _id: d.id }));
      setAllRentals(list);
      setRentals(list.filter(r => !r._deleted));
    });
    return () => unsub();
  }, []);
  const trashRentals = allRentals.filter(r => r._deleted);

  // initialOpenId が来たら、そのrentalを自動で開く
  useEffect(() => {
    if (initialOpenId && rentals.length > 0) {
      const target = rentals.find(r => r._id === initialOpenId);
      if (target) {
        setForm({ ...emptyRental, ...target, rentalTitle: target.rentalTitle ?? "" });
        setEditingId(target._id);
        setAiReply("");
        setView("edit");
        if (onConsumeOpenId) onConsumeOpenId();
      }
    }
  }, [initialOpenId, rentals, onConsumeOpenId]);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.contactName) { alert("担当者名を入力してください"); return; }
    try {
      const id = editingId || `rental_${Date.now().toString(36)}`;
      const { _id, ...data } = form;
      data.rentalTitle = String(data.rentalTitle ?? "").trim();
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
    if (!window.confirm("この問い合わせをゴミ箱に移動しますか？\n（30日以内なら復元できます）")) return;
    const target = allRentals.find(r => r._id === id);
    if (!target) return;
    const { _id, ...data } = target;
    await setDoc(doc(db, "rentals", id), {
      ...data,
      _deleted: true,
      _deletedAt: Date.now(),
    });
  };

  const restoreRental = async (id) => {
    const target = allRentals.find(r => r._id === id);
    if (!target) return;
    const { _id, _deleted, _deletedAt, ...data } = target;
    await setDoc(doc(db, "rentals", id), data);
  };

  const purgeRental = async (id) => {
    if (!window.confirm("この問い合わせを完全に削除しますか？\nこの操作は取り消せません。")) return;
    const target = allRentals.find(r => r._id === id);
    if (target && (target.attachments || []).length) {
      await deleteRentalAttachmentStorageObjects(target.attachments);
    }
    await deleteDoc(doc(db, "rentals", id));
  };

  const startNew = () => {
    setForm({ ...emptyRental, inquiryDate: new Date().toISOString().split("T")[0] });
    setEditingId(null);
    setAiReply("");
    setView("edit");
  };

  const startDetail = (r) => {
    setForm({ ...emptyRental, ...r, rentalTitle: r.rentalTitle ?? "" });
    setEditingId(r._id);
    setAiReply("");
    setView("detail");
  };

  const startEdit = (r) => {
    setForm({ ...emptyRental, ...r, rentalTitle: r.rentalTitle ?? "" });
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

  const ensureUploadRentalId = () => {
    if (editingId) return editingId;
    const nid = `rental_${Date.now().toString(36)}`;
    setEditingId(nid);
    return nid;
  };

  const handleRentalAttachmentsInputChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const rentalId = ensureUploadRentalId();
    setAttachmentUploading(true);
    const next = [...(form.attachments || [])];
    try {
      for (const file of files) {
        if (!isAllowedRentalAttachmentMime(file)) {
          alert(`画像またはPDFのみアップロードできます: ${file.name}`);
          continue;
        }
        if (file.size > MAX_RENTAL_ATTACHMENT_BYTES) {
          alert(`1ファイルあたり10MBまでです: ${file.name}`);
          continue;
        }
        const meta = await uploadRentalAttachmentFile(rentalId, file);
        next.push(meta);
      }
      setField("attachments", next);
    } catch (err) {
      alert("アップロード失敗：" + (err.message || String(err)));
    } finally {
      e.target.value = "";
      setAttachmentUploading(false);
    }
  };

  const removeRentalAttachmentAt = async (index) => {
    const list = [...(form.attachments || [])];
    const att = list[index];
    if (!att || !window.confirm("この添付ファイルを削除しますか？")) return;
    try {
      if (att.storagePath) await deleteObject(ref(storage, att.storagePath));
    } catch (err) {
      console.warn(err);
    }
    list.splice(index, 1);
    setField("attachments", list);
  };

  // ステータス別件数
  const statusCounts = RENTAL_STATUSES.map(s => ({
    ...s,
    count: rentals.filter(r => r.status === s.key).length,
  }));

  const filtered = rentals.filter(r => {
    if (filter !== "all" && r.status !== filter) return false;
    if (staffFilter !== "all" && (r.staff||"") !== staffFilter) return false;
    return true;
  });
  const { upcoming: rentalsUpcoming, past: rentalsPast, undated: rentalsUndated } = partitionRentalsByDesiredDate(filtered);
  const listIsEmpty = rentalsUpcoming.length === 0 && rentalsPast.length === 0 && rentalsUndated.length === 0;

  if (view === "detail") {
    const nameLine = displayRentalTitle(form);
    const optYes = (on) => (on ? "利用" : "—");
    return (
      <div style={{ padding: "1.5rem 2rem", maxWidth: 720, margin: "0 auto" }} className="hb-view">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: ".75rem" }}>
          <h2 style={{ fontFamily: "Georgia,serif", fontSize: "1.15rem", color: "#c9a84c", letterSpacing: ".12em", margin: 0 }}>
            🍽 貸切の詳細
          </h2>
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <button type="button" style={S.btn("sm")} onClick={() => { setView("list"); setForm(emptyRental); setEditingId(null); }}>← 一覧</button>
            <button type="button" style={S.btn("gold")} onClick={() => setView("edit")}>✏ 編集</button>
          </div>
        </div>

        <div style={{ ...S.card, display: "block", marginBottom: "1rem", padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "Georgia,serif", fontSize: "1.05rem", color: "#f0e8d0" }}>{nameLine}</span>
            <StatusBadge status={form.status} />
          </div>

          <div style={S.secTitle}>基本情報</div>
          <DetailRow label="利用日" value={form.desiredDate || ""} />
          <DetailRow label="利用時間" value={form.desiredTime || ""} />
          <DetailRow label="人数" value={form.people ? `${form.people}名` : ""} />
          <DetailRow label="予算" value={form.budget} />
          <DetailRow label="一人当たり予算" value={form.perPersonBudget} />
          <DetailRow label="利用目的" value={form.purpose} />
          <DetailRow label="店舗担当者" value={form.staff || "未割当"} />

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>予約金</div>
          <DetailRow
            label="予約金の有無"
            value={
              form.depositPolicy === "waived"
                ? "もらわない"
                : `もらう${form.depositReceived ? "（受領済み）" : "（未受領）"}${form.depositPolicy === "required" && form.depositAmount ? ` ／ ¥${Number(form.depositAmount).toLocaleString()}` : ""}`
            }
          />

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>喫煙可否</div>
          <DetailRow label="状態" value={smokingPolicyLabel(form.smokingPolicy)} />

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>設備・オプション</div>
          <DetailRow label="ステージ使用" value={optYes(!!form.stage)} />
          <DetailRow label="音響使用" value={optYes(!!form.sound)} />
          <DetailRow label="マイク使用" value={optYes(!!form.mic)} />
          <DetailRow label="プロジェクター使用" value={optYes(!!form.projector)} />

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>メモ</div>
          <div style={{ fontSize: ".86rem", color: "#f0e8d0", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word", padding: ".5rem 0" }}>
            {form.memo || "—"}
          </div>

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>添付ファイル</div>
          <RentalAttachmentsGallery attachments={form.attachments} readOnly onRemove={null} />

          <div style={{ ...S.secTitle, marginTop: "1.25rem" }}>見積／請求の状況</div>
          <DetailRow label="返信状況" value={form.replyStatus} />
          <DetailRow label="見積状況" value={form.quoteStatus} />
          <DetailRow label="見積No." value={form.quoteNo} />
          <DetailRow label="請求No." value={form.invoiceNo} />
          <DetailRow label="発行履歴" value={(form.documentHistory || []).length ? `${(form.documentHistory || []).length}件` : "—"} />
        </div>
      </div>
    );
  }

  if (view === "edit") {
    const docTax = normalizeDocumentTaxMode(form.documentTaxMode);
    const unitColLabel = docTax === "inclusive" ? "単価(税込)" : "単価(税抜)";
    const amountColLabel = docTax === "inclusive" ? "金額(税込相当)" : "金額";
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
              <Field label="貸切タイトル" full>
                <input style={S.inp} value={form.rentalTitle ?? ""} onChange={(e) => setField("rentalTitle", e.target.value)} placeholder="一覧・詳細に表示（空なら法人名・担当者名を使用）"/>
              </Field>
              <Field label="担当者名" full><input style={S.inp} value={form.contactName} onChange={e=>setField("contactName",e.target.value)} placeholder="例：山田太郎"/></Field>
              <Field label="電話番号"><input style={S.inp} value={form.phone} onChange={e=>setField("phone",e.target.value)} placeholder="090-..."/></Field>
              <Field label="メール"><input type="email" style={S.inp} value={form.email} onChange={e=>setField("email",e.target.value)} placeholder="@..."/></Field>
              <Field label="問い合わせ日"><input type="date" style={S.inp} value={form.inquiryDate} onChange={e=>setField("inquiryDate",e.target.value)}/></Field>
              <Field label="店舗担当者" full>
                <select style={S.inp} value={form.staff||""} onChange={e=>setField("staff",e.target.value)}>
                  <option value="">未割当</option>
                  {STAFF_LIST.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <div style={S.secTitle}>利用条件</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="利用日"><input type="date" style={S.inp} value={form.desiredDate} onChange={e=>setField("desiredDate",e.target.value)}/></Field>
              <Field label="利用時間"><input style={S.inp} value={form.desiredTime} onChange={e=>setField("desiredTime",e.target.value)} placeholder="例：18:00〜21:00"/></Field>
              <Field label="人数"><input type="number" style={S.inp} value={form.people} onChange={e=>setField("people",e.target.value)} placeholder="30"/></Field>
              <Field label="予算"><input style={S.inp} value={form.budget} onChange={e=>setField("budget",e.target.value)} placeholder="例：¥150,000"/></Field>
              <Field label="一人当たり予算"><input style={S.inp} value={form.perPersonBudget || ""} onChange={(e) => setField("perPersonBudget", e.target.value)} placeholder="例：¥5,000"/></Field>
              <Field label="利用目的" full><input style={S.inp} value={form.purpose} onChange={e=>setField("purpose",e.target.value)} placeholder="例：歓送迎会・誕生日・発表会"/></Field>
            </div>

            <div style={S.secTitle}>ご希望オプション</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="料理希望"><input style={S.inp} value={form.food} onChange={e=>setField("food",e.target.value)} placeholder="例：コース料理"/></Field>
              <Field label="飲み放題希望"><input style={S.inp} value={form.drinks} onChange={e=>setField("drinks",e.target.value)} placeholder="例：2時間"/></Field>
              <Field full><div style={{display:"flex",gap:"1rem",flexWrap:"wrap",marginTop:".25rem"}}>
                {[{k:"stage",l:"ステージ使用"},{k:"sound",l:"音響使用"},{k:"mic",l:"マイク使用"},{k:"projector",l:"プロジェクター使用"}].map(o=>(
                  <label key={o.k} style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:form[o.k]?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="checkbox" checked={!!form[o.k]} onChange={e=>setField(o.k,e.target.checked)} style={{accentColor:"#c9a84c"}}/>
                    {o.l}
                  </label>
                ))}
              </div></Field>
            </div>

            <div style={S.secTitle}>喫煙可否</div>
            <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".25rem"}}>
              {[
                { k: "unknown", l: "未確認" },
                { k: "no", l: "喫煙不可" },
                { k: "yes", l: "喫煙可" },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setField("smokingPolicy", k)}
                  style={{
                    padding: ".4rem .75rem",
                    borderRadius: 4,
                    border: `1px solid ${normalizeSmokingPolicy(form.smokingPolicy) === k ? "#c9a84c" : "rgba(201,168,76,0.28)"}`,
                    background: normalizeSmokingPolicy(form.smokingPolicy) === k ? "#c9a84c" : "transparent",
                    color: normalizeSmokingPolicy(form.smokingPolicy) === k ? "#0a0a0a" : "rgba(201,168,76,0.85)",
                    fontSize: ".72rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: ".04em",
                  }}
                >
                  {l}
                </button>
              ))}
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

            {/* 予約金管理 */}
            <div style={S.secTitle}>💰 予約金</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:".7rem"}} className="hb-form-grid">
              <Field label="予約金の有無" full>
                <div style={{display:"flex",gap:"1rem",marginTop:".25rem"}}>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:form.depositPolicy==="required"?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="radio" name="depositPolicy" checked={form.depositPolicy==="required"} onChange={()=>setField("depositPolicy","required")} style={{accentColor:"#c9a84c"}}/>
                    もらう
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:".4rem",cursor:"pointer",fontSize:".85rem",color:form.depositPolicy==="waived"?"#c9a84c":"rgba(240,232,208,0.55)"}}>
                    <input type="radio" name="depositPolicy" checked={form.depositPolicy==="waived"} onChange={()=>setField("depositPolicy","waived")} style={{accentColor:"#c9a84c"}}/>
                    もらわない
                  </label>
                </div>
              </Field>
              {form.depositPolicy==="required" && (
                <>
                  <Field label="金額"><input type="number" style={S.inp} value={form.depositAmount} onChange={e=>setField("depositAmount",e.target.value)} placeholder="30000"/></Field>
                  <Field label="受領状態">
                    <label style={{display:"flex",alignItems:"center",gap:".5rem",cursor:"pointer",fontSize:".85rem",padding:".55rem 0",color:form.depositReceived?"#7ec87e":"rgba(240,232,208,0.55)"}}>
                      <input type="checkbox" checked={!!form.depositReceived} onChange={e=>setField("depositReceived",e.target.checked)} style={{accentColor:"#7ec87e"}}/>
                      {form.depositReceived?"✓ 受領済み":"未受領"}
                    </label>
                  </Field>
                  {form.depositReceived && (
                    <Field label="受領日" full>
                      <input type="date" style={S.inp} value={form.depositDate||""} onChange={e=>setField("depositDate",e.target.value)}/>
                    </Field>
                  )}
                  <Field label="メモ" full>
                    <input style={S.inp} value={form.depositMemo||""} onChange={e=>setField("depositMemo",e.target.value)} placeholder="例：銀行振込 / 現金受領 など"/>
                  </Field>
                </>
              )}
            </div>

            <div style={S.secTitle}>メモ</div>
            <textarea
              style={{...S.inp, resize:"vertical", lineHeight:1.6, minHeight:"14rem", fontSize:".85rem"}}
              rows={14}
              value={form.memo}
              onChange={e=>setField("memo",e.target.value)}
              placeholder="自由記述"
            />

            <div style={S.secTitle}>📎 添付ファイル</div>
            <div style={{ fontSize: ".62rem", color: "rgba(240,232,208,0.45)", marginBottom: ".5rem", lineHeight: 1.45 }}>
              画像・PDFのみ、1ファイル10MBまで。複数選択できます。
            </div>
            <input
              ref={attachmentInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              style={{ display: "none" }}
              onChange={handleRentalAttachmentsInputChange}
            />
            <button
              type="button"
              style={{ ...S.btn("sm"), marginBottom: ".65rem" }}
              disabled={attachmentUploading}
              onClick={() => attachmentInputRef.current?.click()}
            >
              {attachmentUploading ? "アップロード中..." : "＋ ファイルを追加"}
            </button>
            <RentalAttachmentsGallery attachments={form.attachments} readOnly={false} onRemove={removeRentalAttachmentAt} uploading={attachmentUploading} />

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

        {/* ===== 見積書・請求書セクション ===== */}
        <div style={{marginTop:"2rem",padding:"1.25rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.2)",borderRadius:8}}>
          <div style={{...S.secTitle,marginTop:0,fontSize:".75rem"}}>📄 見積書・請求書</div>

          <div style={{marginBottom:"1rem"}}>
            <label style={S.lbl}>明細の金額表示</label>
            <div style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginTop:".35rem"}}>
              {[
                { k: "exclusive", l: "税抜表示" },
                { k: "inclusive", l: "税込表示" },
              ].map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setField("documentTaxMode", k)}
                  style={{
                    padding: ".4rem .75rem",
                    borderRadius: 4,
                    border: `1px solid ${normalizeDocumentTaxMode(form.documentTaxMode) === k ? "#c9a84c" : "rgba(201,168,76,0.28)"}`,
                    background: normalizeDocumentTaxMode(form.documentTaxMode) === k ? "#c9a84c" : "transparent",
                    color: normalizeDocumentTaxMode(form.documentTaxMode) === k ? "#0a0a0a" : "rgba(201,168,76,0.85)",
                    fontSize: ".72rem",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: ".04em",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div style={{ fontSize: ".58rem", color: "rgba(240,232,208,0.38)", marginTop: ".35rem", lineHeight: 1.45 }}>
              入力する単価は税抜です。税込表示では単価・行金額を税込相当（税抜×1.1を四捨五入）で示します。小計・消費税・合計の計算は税抜基準で変わりません。
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:".7rem",marginBottom:"1rem"}} className="hb-form-grid">
            <Field label="法人/団体名（顧客名）"><input style={S.inp} value={form.customerCompany||""} onChange={e=>setField("customerCompany",e.target.value)} placeholder="個人の場合は空欄でOK"/></Field>
            <Field label="件名"><input style={S.inp} value={form.quoteSubject||""} onChange={e=>setField("quoteSubject",e.target.value)} placeholder="例：○月○日ホールレンタル代金として"/></Field>
            <Field label="見積有効期限"><input type="date" style={S.inp} value={form.validityDate||""} onChange={e=>setField("validityDate",e.target.value)}/></Field>
          </div>

          {/* 明細 */}
          <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.7)",marginBottom:".5rem",letterSpacing:".1em"}}>明細</div>

          {/* プリセット追加ボタン（グループ分け） */}
          <div style={{marginBottom:".75rem"}}>
            {["ホール","飲み放題","料理"].map(group=>(
              <div key={group} style={{display:"flex",gap:".35rem",flexWrap:"wrap",marginBottom:".4rem",alignItems:"center"}}>
                <span style={{fontSize:".6rem",letterSpacing:".1em",color:"rgba(201,168,76,0.5)",minWidth:60,textTransform:"uppercase"}}>{group}：</span>
                {PRESET_ITEMS.filter(p=>p.group===group).map((p,i)=>(
                  <button key={i} style={{...S.btn("sm"),fontSize:".6rem",padding:".25rem .5rem"}} onClick={()=>{
                    const qty = p.unit==="名" ? Number(form.people||1) : 1;
                    const newItem = { name: p.name, qty, unit: p.unit, price: p.price };
                    setField("quoteItems", [...(form.quoteItems||[]), newItem]);
                  }}>＋ {p.name.replace(group+"・","").replace(/^.*?（/,"（").length>20?p.name.slice(0,20)+"...":p.name}</button>
                ))}
              </div>
            ))}
          </div>

          {/* 明細テーブル */}
          <div style={{marginBottom:".75rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"3fr 60px 60px 100px 100px 30px",gap:".35rem",marginBottom:".3rem",fontSize:".62rem",color:"rgba(201,168,76,0.5)",letterSpacing:".05em"}}>
              <div>摘要</div><div>数量</div><div>単位</div><div>{unitColLabel}</div><div>{amountColLabel}</div><div></div>
            </div>
            {(form.quoteItems||[]).map((it,i)=>{
              const q = Number(it.qty || 0);
              const p = Number(it.price || 0);
              const lineEx = q * p;
              const rawDisp = docTax === "inclusive" ? Math.round(lineEx * 1.1) : lineEx;
              const lineDisp = Number.isFinite(rawDisp) ? rawDisp : 0;
              const total = lineDisp.toLocaleString();
              return (
                <div key={i} style={{display:"grid",gridTemplateColumns:"3fr 60px 60px 100px 100px 30px",gap:".35rem",marginBottom:".3rem",alignItems:"center"}}>
                  <input style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem"}} value={it.name||""} onChange={e=>{
                    const arr = [...form.quoteItems];
                    arr[i] = { ...arr[i], name: e.target.value };
                    setField("quoteItems", arr);
                  }}/>
                  <input type="number" style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem"}} value={it.qty||""} onChange={e=>{
                    const arr = [...form.quoteItems];
                    arr[i] = { ...arr[i], qty: e.target.value };
                    setField("quoteItems", arr);
                  }}/>
                  <input style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem"}} value={it.unit||""} onChange={e=>{
                    const arr = [...form.quoteItems];
                    arr[i] = { ...arr[i], unit: e.target.value };
                    setField("quoteItems", arr);
                  }} placeholder="式"/>
                  <input type="number" style={{...S.inp,padding:".4rem .55rem",fontSize:".78rem",textAlign:"right"}} value={it.price||""} onChange={e=>{
                    const arr = [...form.quoteItems];
                    arr[i] = { ...arr[i], price: e.target.value };
                    setField("quoteItems", arr);
                  }}/>
                  <div style={{padding:".4rem .55rem",fontSize:".78rem",textAlign:"right",color:"rgba(201,168,76,0.7)"}}>¥{total}</div>
                  <button onClick={()=>{
                    setField("quoteItems", form.quoteItems.filter((_,idx)=>idx!==i));
                  }} style={{padding:".25rem .35rem",background:"transparent",border:"1px solid rgba(226,75,74,0.27)",borderRadius:3,color:"#e24b4a",cursor:"pointer",fontSize:".7rem"}}>✕</button>
                </div>
              );
            })}
            <button style={S.btn("sm")} onClick={()=>setField("quoteItems",[...(form.quoteItems||[]),{name:"",qty:1,unit:"式",price:0}])}>＋ 行を追加</button>
          </div>

          {/* 合計プレビュー */}
          {(form.quoteItems||[]).length > 0 && (() => {
            const sub = quoteSubtotalExTax(form.quoteItems);
            const tax = Math.round(sub * 0.1);
            const total = sub + tax;
            const dep = (form.depositPolicy==="required" && form.depositReceived) ? Number(form.depositAmount||0) : 0;
            const balance = total - dep;
            return (
              <div style={{padding:".75rem 1rem",background:"#111",borderRadius:5,marginBottom:"1rem",fontSize:".82rem"}}>
                {docTax === "inclusive" && (
                  <div style={{ fontSize: ".58rem", color: "rgba(240,232,208,0.4)", marginBottom: ".45rem", lineHeight: 1.45 }}>
                    明細の税込相当額は参考表示です。以下の小計・税・合計は税抜基準の計算です。
                  </div>
                )}
                <div style={{display:"flex",gap:"1.5rem",justifyContent:"flex-end",alignItems:"baseline",flexWrap:"wrap"}}>
                  <span style={{color:"rgba(240,232,208,0.55)"}}>小計（税抜）: <strong style={{color:"#f0e8d0"}}>¥{sub.toLocaleString()}</strong></span>
                  <span style={{color:"rgba(240,232,208,0.55)"}}>消費税(10%): <strong style={{color:"#f0e8d0"}}>¥{tax.toLocaleString()}</strong></span>
                  <span style={{color:"#c9a84c"}}>合計（税込）: <strong style={{fontSize:"1.05rem"}}>¥{total.toLocaleString()}</strong></span>
                </div>
                {dep > 0 && (
                  <div style={{display:"flex",gap:"1.5rem",justifyContent:"flex-end",alignItems:"baseline",flexWrap:"wrap",marginTop:".4rem",paddingTop:".4rem",borderTop:"1px dashed rgba(201,168,76,0.15)"}}>
                    <span style={{color:"rgba(126,200,127,0.8)"}}>ご入金済み（予約金）: <strong>−¥{dep.toLocaleString()}</strong></span>
                    <span style={{color:"#c9a84c"}}>請求書の残額: <strong style={{fontSize:"1.1rem"}}>¥{balance.toLocaleString()}</strong></span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* 連番表示 */}
          <div style={{display:"flex",gap:"1rem",fontSize:".7rem",color:"rgba(240,232,208,0.5)",marginBottom:".75rem"}}>
            {form.quoteNo && <span>📄 見積No.{form.quoteNo}</span>}
            {form.invoiceNo && <span>📄 請求No.{form.invoiceNo}</span>}
          </div>

          {/* PDF出力ボタン */}
          <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
            <button style={S.btn("gold")} onClick={async()=>{
              if(!(form.quoteItems||[]).length){alert("明細を追加してください");return;}
              await openDocumentWindow("quote", form, setForm);
              // 自動保存
              setTimeout(handleSave, 500);
            }}>📄 見積書PDF</button>
            <button style={S.btn("gold")} onClick={async()=>{
              if(!(form.quoteItems||[]).length){alert("明細を追加してください");return;}
              await openDocumentWindow("invoice", form, setForm);
              setTimeout(handleSave, 500);
            }}>📄 請求書PDF</button>
          </div>
          <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginTop:".5rem"}}>
            ※ 新しいウィンドウが開きます。「PDFとして保存」ボタンでPDF出力 or 印刷できます。
          </div>

          {/* 発行履歴 */}
          {(form.documentHistory||[]).length>0 && (
            <div style={{marginTop:"1.5rem",paddingTop:"1.25rem",borderTop:"1px dashed rgba(201,168,76,0.2)"}}>
              <div style={{fontSize:".68rem",color:"rgba(201,168,76,0.7)",marginBottom:".75rem",letterSpacing:".15em"}}>📚 発行履歴（{form.documentHistory.length}件）</div>
              <div style={{display:"flex",flexDirection:"column",gap:".4rem"}}>
                {[...form.documentHistory].reverse().map((doc,ri)=>{
                  const i = form.documentHistory.length - 1 - ri;
                  return (
                    <div key={i} style={{display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:".75rem",alignItems:"center",padding:".55rem .75rem",background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.1)",borderRadius:5}}>
                      <div style={{fontSize:".58rem",letterSpacing:".1em",padding:".15rem .45rem",borderRadius:2,background:doc.type==="invoice"?"rgba(126,200,227,0.15)":"rgba(201,168,76,0.15)",color:doc.type==="invoice"?"#7ec8e3":"#c9a84c",textTransform:"uppercase"}}>
                        {doc.type==="invoice"?"請求書":"見積書"} No.{doc.no}
                      </div>
                      <div style={{fontSize:".72rem",color:"rgba(240,232,208,0.65)"}}>
                        <div>{doc.subject||"（件名未設定）"}</div>
                        <div style={{fontSize:".62rem",color:"rgba(240,232,208,0.4)",marginTop:".15rem"}}>発行日：{doc.issuedAt} ／ ¥{(doc.total||0).toLocaleString()}</div>
                      </div>
                      <button style={{...S.btn("sm"),padding:".25rem .55rem",fontSize:".58rem"}} onClick={()=>openDocFromSnapshot(doc)}>📄 表示</button>
                      <button style={{padding:".22rem .4rem",background:"transparent",border:"1px solid rgba(226,75,74,0.27)",borderRadius:3,color:"#e24b4a",cursor:"pointer",fontSize:".7rem"}} onClick={()=>{
                        if(!window.confirm("この履歴を削除しますか？(連番は復活しません)"))return;
                        setField("documentHistory", form.documentHistory.filter((_,idx)=>idx!==i));
                      }} title="履歴削除">✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{display:"flex",gap:".5rem",marginTop:"1.5rem",flexWrap:"wrap"}}>
          <button style={{...S.btn("gold"),flex:1,maxWidth:200}} onClick={handleSave}>💾 保存</button>
          <button style={S.btn("ghost")} onClick={()=>setView("list")}>キャンセル</button>
          {editingId && onConvertToEvent && (
            <button style={{...S.btn("sm"),padding:".5rem 1rem",fontSize:".7rem",borderColor:"rgba(201,168,76,0.4)"}} onClick={async()=>{
              const ok = await onConvertToEvent(form, editingId);
              if (ok === "deleted") setView("list");
            }}>🎵 イベントに変換</button>
          )}
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
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          <button style={{...S.btn("sm"),padding:".4rem .8rem"}} onClick={()=>setShowTrash(true)}>🗑 ゴミ箱{trashRentals.length>0?` (${trashRentals.length})`:""}</button>
          {onBulkImport && (
            <button style={{...S.btn("ghost"),fontSize:".62rem",padding:".4rem .8rem"}} onClick={onBulkImport}>🔄 既存イベントから取り込み</button>
          )}
          <button style={S.btn("gold")} onClick={startNew}>＋ 新規問い合わせ</button>
        </div>
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

      {/* 担当者フィルター */}
      <div style={{display:"flex",alignItems:"center",gap:".75rem",marginBottom:"1rem",flexWrap:"wrap"}}>
        <span style={{fontSize:".68rem",letterSpacing:".15em",color:"rgba(201,168,76,0.7)"}}>👤 担当:</span>
        <button onClick={()=>setStaffFilter("all")} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(staffFilter==="all"?"#c9a84c":"rgba(201,168,76,0.2)"),background:staffFilter==="all"?"#c9a84c":"transparent",color:staffFilter==="all"?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>全員</button>
        {STAFF_LIST.map(s=>(
          <button key={s} onClick={()=>setStaffFilter(s)} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(staffFilter===s?"#c9a84c":"rgba(201,168,76,0.2)"),background:staffFilter===s?"#c9a84c":"transparent",color:staffFilter===s?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>{s}</button>
        ))}
        <button onClick={()=>setStaffFilter("")} style={{padding:".3rem .7rem",borderRadius:3,border:"1px solid "+(staffFilter===""?"#c9a84c":"rgba(201,168,76,0.2)"),background:staffFilter===""?"#c9a84c":"transparent",color:staffFilter===""?"#0a0a0a":"rgba(201,168,76,0.7)",fontSize:".65rem",cursor:"pointer",fontFamily:"inherit",letterSpacing:".05em"}}>未割当</button>
      </div>

      {/* 一覧（利用日ベース：今後 / 過去は折りたたみ / 日付未設定） */}
      {listIsEmpty && (
        <div style={{textAlign:"center",padding:"3rem",color:"rgba(240,232,208,0.25)",fontSize:".85rem"}}>
          🍽 該当する問い合わせはありません
        </div>
      )}
      {!listIsEmpty && rentalsUpcoming.length > 0 && (
        <>
          <div style={{ ...S.secTitle, marginTop: 0, marginBottom: ".65rem" }}>今後の貸切</div>
          {rentalsUpcoming.map((r) => (
            <RentalListCard
              key={r._id}
              r={r}
              onOpenDetail={() => startDetail(r)}
              onOpenEdit={() => startEdit(r)}
              onTrash={() => handleDelete(r._id)}
            />
          ))}
        </>
      )}
      {/* 過去の貸切履歴：0件でも折りたたみ行を常時表示（rentalsPast.length>0 条件で非表示になっていた不具合の修正） */}
      <div
        style={{
          marginTop: !listIsEmpty && rentalsUpcoming.length > 0 ? "1.25rem" : listIsEmpty ? "0.5rem" : "0",
          marginBottom: "1rem",
        }}
      >
        <button
          type="button"
          onClick={() => setShowPastRentals((v) => !v)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: ".65rem .9rem",
            marginBottom: showPastRentals ? ".55rem" : ".15rem",
            background: "rgba(201,168,76,0.08)",
            border: "1px solid rgba(201,168,76,0.35)",
            borderRadius: 6,
            color: "#f0e8d0",
            fontFamily: "inherit",
            fontSize: ".78rem",
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: ".04em",
            boxShadow: "0 1px 0 rgba(0,0,0,0.35)",
          }}
        >
          {showPastRentals ? "▼" : "▶"} 過去の貸切履歴（{rentalsPast.length}件）
        </button>
        {showPastRentals && rentalsPast.length > 0 &&
          rentalsPast.map((r) => (
            <RentalListCard
              key={r._id}
              r={r}
              onOpenDetail={() => startDetail(r)}
              onOpenEdit={() => startEdit(r)}
              onTrash={() => handleDelete(r._id)}
            />
          ))}
        {showPastRentals && rentalsPast.length === 0 && (
          <div style={{ fontSize: ".72rem", color: "rgba(240,232,208,0.38)", padding: ".35rem 0 .25rem", lineHeight: 1.5 }}>
            {listIsEmpty
              ? "この条件に一致する貸切がありません。"
              : "この条件では過去の貸切（利用日が今日より前）はありません。日付未設定の案件は下の「日付未設定」に含まれます。"}
          </div>
        )}
      </div>
      {!listIsEmpty && rentalsUndated.length > 0 && (
        <>
          <div style={{ ...S.secTitle, marginTop: rentalsUpcoming.length || rentalsPast.length ? "1.25rem" : 0, marginBottom: ".65rem" }}>
            日付未設定
          </div>
          {rentalsUndated.map((r) => (
            <RentalListCard
              key={r._id}
              r={r}
              onOpenDetail={() => startDetail(r)}
              onOpenEdit={() => startEdit(r)}
              onTrash={() => handleDelete(r._id)}
            />
          ))}
        </>
      )}

      {/* ゴミ箱モーダル */}
      {showTrash && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={()=>setShowTrash(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#0d0d0d",border:"1px solid rgba(201,168,76,0.27)",borderRadius:8,padding:"1.5rem",maxWidth:600,width:"100%",maxHeight:"85vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",color:"#c9a84c",letterSpacing:".15em"}}>🗑 貸切のゴミ箱</div>
              <button style={S.btn("sm")} onClick={()=>setShowTrash(false)}>閉じる</button>
            </div>
            <div style={{fontSize:".7rem",color:"rgba(240,232,208,0.5)",marginBottom:"1rem",lineHeight:1.6}}>
              削除された問い合わせは30日間保持され、その後自動で完全削除されます。
            </div>
            {trashRentals.length === 0 ? (
              <div style={{textAlign:"center",padding:"2rem",color:"rgba(240,232,208,0.3)",fontSize:".85rem"}}>ゴミ箱は空です</div>
            ) : trashRentals.sort((a,b)=>(b._deletedAt||0)-(a._deletedAt||0)).map(r=>{
              const daysLeft = r._deletedAt ? Math.max(0,Math.ceil(30 - (Date.now()-r._deletedAt)/(24*60*60*1000))) : 30;
              return (
                <div key={r._id} style={{padding:".75rem 1rem",background:"#111",borderRadius:5,marginBottom:".5rem",display:"grid",gridTemplateColumns:"1fr auto",gap:".5rem",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:".88rem",marginBottom:".2rem"}}>{displayRentalTitle(r)}</div>
                    <div style={{fontSize:".65rem",color:"rgba(240,232,208,0.4)",display:"flex",gap:".75rem",flexWrap:"wrap"}}>
                      {r.desiredDate&&<span>📅 {r.desiredDate}</span>}
                      <span>削除：{r._deletedAt?new Date(r._deletedAt).toLocaleDateString("ja-JP"):""}</span>
                      <span style={{color:daysLeft<7?"#f4a261":"rgba(240,232,208,0.5)"}}>あと{daysLeft}日</span>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:".4rem"}}>
                    <button style={{...S.btn("sm"),borderColor:"rgba(126,200,127,0.4)",color:"#7ec87e"}} onClick={()=>restoreRental(r._id)}>↩ 復元</button>
                    <button style={S.btn("danger")} onClick={()=>purgeRental(r._id)}>完全削除</button>
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

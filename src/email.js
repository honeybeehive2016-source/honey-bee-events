// EmailJS で予約通知メールを送る
// EmailJS は CDN 経由でロード（npm install不要）

const EMAILJS_CONFIG = {
  serviceId: "service_qnzu6pi",
  templateIdStore: "template_8lzwevz",      // 店舗用
  templateIdCustomer: "template_shql8o6",    // お客様用
  publicKey: "wnnLaWdA6ALedXWSN",
};

// EmailJS のスクリプトを動的にロード
let emailjsLoaded = false;
let emailjsLoading = null;

function loadEmailJS() {
  if (emailjsLoaded) return Promise.resolve();
  if (emailjsLoading) return emailjsLoading;
  emailjsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    script.async = true;
    script.onload = () => {
      try {
        if (window.emailjs && window.emailjs.init) {
          window.emailjs.init({ publicKey: EMAILJS_CONFIG.publicKey });
        }
        emailjsLoaded = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    script.onerror = () => reject(new Error("EmailJSのロードに失敗しました"));
    document.head.appendChild(script);
  });
  return emailjsLoading;
}

// 予約データから日付を読みやすい形式に整形
function fmtJpDate(dateStr) {
  if (!dateStr) return "";
  const days = ["日","月","火","水","木","金","土"];
  const dt = new Date(dateStr + "T00:00:00");
  return `${dt.getFullYear()}年${dt.getMonth()+1}月${dt.getDate()}日（${days[dt.getDay()]}）`;
}

// 予約経路を日本語に
function sourceLabelJp(source) {
  const map = {
    phone: "電話",
    form: "予約フォーム",
    walkin: "直接来店",
    performer: "出演者経由",
    email: "メール",
    line: "LINE",
    other: "その他",
  };
  return map[source] || source || "";
}

// 予約通知メールを送る（店舗向け＆お客様向け）
export async function sendReservationEmails(reservation) {
  try {
    await loadEmailJS();
  } catch (e) {
    console.error("EmailJS load error:", e);
    return { ok: false, error: e.message };
  }
  if (!window.emailjs) {
    return { ok: false, error: "EmailJSが利用できません" };
  }

  const params = {
    customer_name: reservation.customerName || "",
    customer_email: reservation.email || "",
    event_date: fmtJpDate(reservation.date || ""),
    event_name: reservation.eventName || "",
    people: String(reservation.people || ""),
    phone: reservation.phone || "",
    source: sourceLabelJp(reservation.source),
    note: reservation.note || "（特になし）",
  };

  const results = { store: null, customer: null };

  // 店舗向け
  try {
    await window.emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateIdStore,
      params
    );
    results.store = { ok: true };
  } catch (e) {
    console.error("店舗向けメール送信失敗:", e);
    results.store = { ok: false, error: e.text || e.message || String(e) };
  }

  // お客様向け（メアドがあれば）
  if (reservation.email) {
    try {
      await window.emailjs.send(
        EMAILJS_CONFIG.serviceId,
        EMAILJS_CONFIG.templateIdCustomer,
        params
      );
      results.customer = { ok: true };
    } catch (e) {
      console.error("お客様向けメール送信失敗:", e);
      results.customer = { ok: false, error: e.text || e.message || String(e) };
    }
  } else {
    results.customer = { ok: false, error: "メアドなし" };
  }

  return { ok: results.store?.ok || false, results };
}

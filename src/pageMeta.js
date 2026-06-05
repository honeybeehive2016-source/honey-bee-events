export const PAGE_META = {
  admin: {
    title: "HONEY BEE Operation Center",
    description: "HONEY BEE 業務管理アプリ",
  },
  reserve: {
    title: "大船 HONEY BEE ご予約フォーム",
    description: "ライブ・イベントのご予約はこちらから",
  },
};

function setMetaContent(selector, content) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute("content", content);
}

/** ブラウザ表示用：title / description / OGP / Twitter カードを更新 */
export function applyPageMeta(profile) {
  if (typeof document === "undefined") return;
  const meta = PAGE_META[profile] || PAGE_META.admin;
  document.title = meta.title;
  setMetaContent('meta[name="description"]', meta.description);
  setMetaContent('meta[property="og:title"]', meta.title);
  setMetaContent('meta[property="og:description"]', meta.description);
  setMetaContent('meta[name="twitter:title"]', meta.title);
  setMetaContent('meta[name="twitter:description"]', meta.description);
}

export function isCustomerReservationUrl() {
  if (typeof window === "undefined") return false;
  return /(?:^|[?&])reserve=1(?:&|$)/.test(window.location.search);
}

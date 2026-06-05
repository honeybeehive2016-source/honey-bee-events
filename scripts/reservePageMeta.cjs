/** 予約URL用 OGP（middleware / ビルド検証で共通） */
const RESERVE_TITLE = "大船 HONEY BEE ご予約フォーム";
const RESERVE_DESC = "ライブ・イベントのご予約はこちらから";

function upsertMeta(html, attr, key, content) {
  const safe = String(content).replace(/"/g, "&quot;");
  const tag = `<meta ${attr}="${key}" content="${safe}" />`;
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`, "i");
  if (re.test(html)) return html.replace(re, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function patchHtmlForReserve(html, pageUrl) {
  let out = html;
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${RESERVE_TITLE}</title>`);
  out = upsertMeta(out, "name", "description", RESERVE_DESC);
  out = upsertMeta(out, "property", "og:title", RESERVE_TITLE);
  out = upsertMeta(out, "property", "og:description", RESERVE_DESC);
  out = upsertMeta(out, "property", "og:type", "website");
  if (pageUrl) out = upsertMeta(out, "property", "og:url", pageUrl);
  out = upsertMeta(out, "name", "twitter:card", "summary");
  out = upsertMeta(out, "name", "twitter:title", RESERVE_TITLE);
  out = upsertMeta(out, "name", "twitter:description", RESERVE_DESC);
  return out;
}

module.exports = {
  RESERVE_TITLE,
  RESERVE_DESC,
  patchHtmlForReserve,
};

/** Vercel Edge Middleware: ?reserve=1 のリンクプレビュー用 OGP をサーバー側で差し替え */
const RESERVE_TITLE = "大船 HONEY BEE ご予約フォーム";
const RESERVE_DESC = "ライブ・イベントのご予約はこちらから";

function upsertMeta(html, attr, key, content) {
  const safe = String(content).replace(/"/g, "&quot;");
  const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`, "i");
  const tag = `<meta ${attr}="${key}" content="${safe}" />`;
  if (re.test(html)) return html.replace(re, tag);
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.searchParams.get("reserve") !== "1") return;
  if (url.pathname !== "/" && url.pathname !== "/index.html") return;

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return;

  const indexRes = await fetch(new URL("/index.html", url.origin));
  if (!indexRes.ok) return;

  let html = await indexRes.text();
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${RESERVE_TITLE}</title>`);
  html = upsertMeta(html, "name", "description", RESERVE_DESC);
  html = upsertMeta(html, "property", "og:title", RESERVE_TITLE);
  html = upsertMeta(html, "property", "og:description", RESERVE_DESC);
  html = upsertMeta(html, "property", "og:type", "website");
  html = upsertMeta(html, "property", "og:url", url.href);
  html = upsertMeta(html, "name", "twitter:card", "summary");
  html = upsertMeta(html, "name", "twitter:title", RESERVE_TITLE);
  html = upsertMeta(html, "name", "twitter:description", RESERVE_DESC);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

export const config = {
  matcher: ["/"],
};

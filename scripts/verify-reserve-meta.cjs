const fs = require("fs");
const path = require("path");
const { RESERVE_TITLE, RESERVE_DESC, patchHtmlForReserve } = require("./reservePageMeta.cjs");

const indexPath = path.join(__dirname, "..", "build", "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("build/index.html がありません。先に npm run build を実行してください。");
  process.exit(1);
}

const html = fs.readFileSync(indexPath, "utf8");
const patched = patchHtmlForReserve(html, "https://honey-bee-operation.vercel.app/?reserve=1");

const checks = [
  ["title", `<title>${RESERVE_TITLE}</title>`],
  ["description", `name="description" content="${RESERVE_DESC}"`],
  ["og:title", `property="og:title" content="${RESERVE_TITLE}"`],
  ["og:description", `property="og:description" content="${RESERVE_DESC}"`],
  ["twitter:title", `name="twitter:title" content="${RESERVE_TITLE}"`],
  ["twitter:description", `name="twitter:description" content="${RESERVE_DESC}"`],
];

const missing = checks.filter(([, needle]) => !patched.includes(needle));
if (missing.length > 0) {
  console.error("予約用メタのパッチ検証に失敗:", missing.map(([k]) => k).join(", "));
  process.exit(1);
}

console.log("OK: reserve meta patch produces expected tags in HTML source");

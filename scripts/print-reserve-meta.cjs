const fs = require("fs");
const path = require("path");
const { patchHtmlForReserve } = require("./reservePageMeta.cjs");

const html = patchHtmlForReserve(
  fs.readFileSync(path.join(__dirname, "..", "build", "index.html"), "utf8"),
  "https://honey-bee-operation.vercel.app/?reserve=1"
);

const title = html.match(/<title>[^<]+<\/title>/)?.[0] || "MISSING";
const desc = html.match(/name="description" content="[^"]+"/)?.[0] || "MISSING";
const ogTitle = html.match(/property="og:title" content="[^"]+"/)?.[0] || "MISSING";
const ogDesc = html.match(/property="og:description" content="[^"]+"/)?.[0] || "MISSING";
const twTitle = html.match(/name="twitter:title" content="[^"]+"/)?.[0] || "MISSING";
const twDesc = html.match(/name="twitter:description" content="[^"]+"/)?.[0] || "MISSING";

console.log(title);
console.log(desc);
console.log(ogTitle);
console.log(ogDesc);
console.log(twTitle);
console.log(twDesc);

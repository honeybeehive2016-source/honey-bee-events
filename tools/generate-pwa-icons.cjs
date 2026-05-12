/**
 * public 内の旧ハチロゴ.jpg（またはフォールバック honeybee_logo.png）から
 * PWA 用 PNG を生成する。実行: node tools/generate-pwa-icons.cjs
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const pub = path.join(__dirname, "..", "public");
const bg = { r: 7, g: 7, b: 7, alpha: 1 };

function resolveSource() {
  const files = fs.readdirSync(pub);
  const jpg = files.find((f) => /\.jpe?g$/i.test(f));
  if (jpg) return path.join(pub, jpg);
  const png = path.join(pub, "honeybee_logo.png");
  if (fs.existsSync(png)) return png;
  throw new Error("Source logo not found in public/");
}

async function main() {
  const src = resolveSource();

  for (const size of [192, 512]) {
    await sharp(src)
      .resize(size, size, { fit: "contain", background: bg })
      .png()
      .toFile(path.join(pub, `honeybee-icon-${size}.png`));
  }

  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.72);
    const innerBuf = await sharp(src)
      .resize(inner, inner, { fit: "contain", background: bg })
      .png()
      .toBuffer();
    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: bg,
      },
    })
      .composite([{ input: innerBuf, gravity: "center" }])
      .png()
      .toFile(path.join(pub, `honeybee-icon-maskable-${size}.png`));
  }

  await sharp(src)
    .resize(32, 32, { fit: "contain", background: bg })
    .png()
    .toFile(path.join(pub, "honeybee-favicon-32.png"));

  console.log("PWA icons written to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

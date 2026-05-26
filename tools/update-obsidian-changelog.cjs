/**
 * 最新の git commit を Obsidian CHANGELOG に追記する。
 * 実行: npm run obsidian-log
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OBSIDIAN_ROOT = path.join(
  "C:",
  "Users",
  "honey",
  "Documents",
  "BEEHIVE Base",
  "05_AI活用",
  "HONEY_BEE_Obsidian_運用ノート"
);
const CHANGELOG_PATH = path.join(
  OBSIDIAN_ROOT,
  "02_CHANGELOG",
  "HONEY BEE業務アプリ_CHANGELOG.md"
);

const REPO_ROOT = path.join(__dirname, "..");

function runGit(args) {
  return execSync(`git ${args}`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function getLocalDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getLatestCommit() {
  const fullHash = runGit("rev-parse HEAD");
  const shortHash = runGit("rev-parse --short HEAD");
  const message = runGit('log -1 --format=%s');
  let files = [];
  try {
    const out = runGit("diff-tree --no-commit-id --name-only -r HEAD");
    files = out ? out.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    files = [];
  }
  return { fullHash, shortHash, message, files };
}

function buildEntry({ message, shortHash, files }) {
  const fileLines =
    files.length > 0
      ? files.map((f) => `  - ${f}`).join("\n")
      : "  - （変更ファイルなし）";
  return [
    "### 開発ログ",
    `- commit: ${message}`,
    `- hash: ${shortHash}`,
    "- files:",
    fileLines,
    "- memo:",
    "  - 自動記録。詳細は必要に応じて後で追記。",
    "",
  ].join("\n");
}

function hasDateHeading(content, dateStr) {
  const re = new RegExp(`^##\\s+${dateStr.replace(/-/g, "\\-")}\\s*$`, "m");
  return re.test(content);
}

function isHashAlreadyRecorded(content, shortHash, fullHash) {
  if (content.includes(`- hash: ${shortHash}`)) return true;
  if (content.includes(fullHash)) return true;
  return false;
}

function main() {
  if (!fs.existsSync(OBSIDIAN_ROOT)) {
    console.error(`エラー: Obsidianフォルダが見つかりません。\n  ${OBSIDIAN_ROOT}`);
    process.exit(1);
  }

  let commit;
  try {
    commit = getLatestCommit();
  } catch (e) {
    console.error("エラー: git の commit 情報を取得できませんでした。", e.message || e);
    process.exit(1);
  }

  const today = getLocalDateString();
  const entry = buildEntry(commit);

  const changelogDir = path.dirname(CHANGELOG_PATH);
  if (!fs.existsSync(changelogDir)) {
    fs.mkdirSync(changelogDir, { recursive: true });
  }

  let content = "";
  if (fs.existsSync(CHANGELOG_PATH)) {
    content = fs.readFileSync(CHANGELOG_PATH, "utf8");
  } else {
    content = "# HONEY BEE業務アプリ CHANGELOG\n\n";
    console.log(`CHANGELOGを新規作成します: ${CHANGELOG_PATH}`);
  }

  if (isHashAlreadyRecorded(content, commit.shortHash, commit.fullHash)) {
    console.log(
      `スキップ: commit ${commit.shortHash} は既に記録済みです。\n  ${CHANGELOG_PATH}`
    );
    process.exit(0);
  }

  let appendBlock = "";
  if (!hasDateHeading(content, today)) {
    appendBlock = `## ${today}\n\n${entry}`;
  } else {
    appendBlock = entry;
  }

  const trimmed = content.replace(/\s*$/, "");
  const next = `${trimmed}\n\n${appendBlock}`;

  fs.writeFileSync(CHANGELOG_PATH, next, "utf8");

  console.log(`追記しました: ${CHANGELOG_PATH}`);
  console.log(`  日付: ${today}`);
  console.log(`  commit: ${commit.message}`);
  console.log(`  hash: ${commit.shortHash}`);
  console.log(`  files: ${commit.files.length} 件`);
}

main();

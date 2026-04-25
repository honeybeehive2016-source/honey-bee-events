# 🍯 HONEY BEE Event Manager

大船のライブハウス HONEY BEE のイベント管理・テキスト自動生成アプリ。

## 機能

- イベント情報を一度入力するだけで以下を自動生成：
  - HP用告知文
  - Instagram投稿文（絵文字・ハッシュタグ付き）
  - Facebook投稿文
  - Googleフォーム説明文
  - 短い告知コピー
  - **🌐 Wixサイト更新用テキスト一式**
    - イベント詳細ページ本文
    - 月間スケジュール用テキスト
    - トップページ ピックアップ文
    - SEOタイトル（形式：`イベント名｜大船HONEY BEE`）
    - SEOディスクリプション（160文字以内・大船/ライブ/HONEY BEE含む）
    - 画像 alt テキスト
    - 予約ボタン文言
- イベントの保存・管理（複数イベント対応）
- テンプレート保存・再利用

## 起動方法

```bash
cd honey-bee-eventsnpm
npm start
```

ブラウザで http://localhost:3000 を開く。

---

## 🌐 Wix CMS API 連携 — 将来の方針

### イベントデータ構造（Wix CMS コレクション設計案）

| アプリ内フィールド | Wix CMSフィールド名 | 型 |
|---|---|---|
| name | title | Text |
| date | date | Date |
| day | dayOfWeek | Text |
| open | openTime | Text |
| start | startTime | Text |
| price | price | Text |
| cap | capacity | Number |
| perf | performers | Text |
| desc | description | Rich Text |
| url | reservationUrl | URL |
| notes | notes | Text |
| genre | genre | Text |

### 連携の実装イメージ

Wix CMS APIを使うことで、アプリからイベントを登録すると自動的にWixサイトに反映させることが可能。

```js
// Wix CMS API 連携サンプル（将来実装予定）
// Wix REST API: https://dev.wix.com/api/rest/cms/collection-items

async function pushToWixCMS(eventData) {
  const response = await fetch(
    "https://www.wixapis.com/cms/v3/items",
    {
      method: "POST",
      headers: {
        "Authorization": "Bearer YOUR_WIX_API_KEY",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        collectionId: "Events",
        item: {
          title: eventData.name,
          date: eventData.date,
          dayOfWeek: eventData.day,
          openTime: eventData.open,
          startTime: eventData.start,
          price: eventData.price,
          capacity: Number(eventData.cap),
          performers: eventData.perf,
          description: eventData.desc,
          reservationUrl: eventData.url,
          notes: eventData.notes,
          genre: eventData.genre,
        },
      }),
    }
  );
  return response.json();
}
```

### 連携に必要なもの

1. Wix の Business & Ecommerce プラン以上
2. Wix Headless / REST API キー（Wix管理画面 > API Keys から取得）
3. CMS コレクション「Events」の作成（上記フィールド設定）
4. アプリへの「Wixへ送信」ボタン追加

---

## 技術スタック

- React（Create React App）
- ローカルストレージでデータ永続化
- Vercel でホスティング

## 開発者向け

### デプロイ（更新時）

```bash
git add .
git commit -m "更新内容を記述"
git push
```

Vercelが自動でデプロイします。

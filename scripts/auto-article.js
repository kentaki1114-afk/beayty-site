/**
 * BeautyBests 自動記事生成スクリプト
 * 毎日5本の美容記事を自動生成してGitHubにpushする
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY=sk-ant-xxxxx (必須)
 *   GITHUB_TOKEN=ghp_xxxxx (必須)
 *   RAKUTEN_APP_ID=xxxxxx (任意: 楽天商品画像を取得)
 */

import Anthropic from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT_DIR, "articles");
const TOPICS_FILE = path.join(__dirname, "topics.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");

const ARTICLES_PER_DAY = 5;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ===== ユーティリティ =====

function loadTopics() {
  return JSON.parse(fs.readFileSync(TOPICS_FILE, "utf-8"));
}

function loadProgress() {
  if (!fs.existsSync(PROGRESS_FILE)) return { lastIndex: 0 };
  return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function titleToSlug() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `article-${date}-${random}`;
}

function formatDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

// ===== 楽天商品検索API =====

async function fetchRakutenProducts(keyword, count = 3) {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return [];

  try {
    const encodedKeyword = encodeURIComponent(keyword);
    const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?applicationId=${appId}&keyword=${encodedKeyword}&hits=${count}&imageFlag=1&formatVersion=2`;
    const data = await httpsGet(url);

    if (!data.Items || data.Items.length === 0) return [];

    return data.Items.map((item) => ({
      name: item.itemName.slice(0, 50),
      price: item.itemPrice.toLocaleString(),
      imageUrl: item.mediumImageUrls[0] || "",
      itemUrl: item.itemUrl,
      shopName: item.shopName,
    }));
  } catch (e) {
    console.log(`  ⚠️ 楽天API取得失敗 (${keyword}): ${e.message}`);
    return [];
  }
}

function buildProductHtml(products, keyword) {
  if (products.length === 0) return "";

  const cards = products.map((p) => `
      <div class="product-card">
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy" style="width:128px;height:128px;object-fit:contain;">` : ""}
        <div class="product-info">
          <p class="product-name">${p.name}</p>
          <p class="product-price">楽天価格: ¥${p.price}</p>
          <a href="${p.itemUrl}" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-rakuten">楽天で見る</a>
          <a href="https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=YOUR_ASSOCIATE_ID" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-amazon">Amazonで見る</a>
        </div>
      </div>`).join("\n");

  return `<div class="product-list">\n${cards}\n    </div>`;
}

// ===== 記事生成 =====

async function generateArticle(topic) {
  console.log(`  生成中: ${topic.title}`);

  // 楽天から商品情報を取得
  const products = await fetchRakutenProducts(topic.product, 3);
  const productHtml = buildProductHtml(products, topic.product);

  const productSection = products.length > 0
    ? `## 楽天から取得した実商品データ（記事内に必ず使用すること）\n${products.map((p, i) => `${i + 1}. 商品名: ${p.name} / 価格: ¥${p.price} / ショップ: ${p.shopName}`).join("\n")}\n\n以下のHTMLブロックを商品紹介セクションに挿入すること:\n${productHtml}`
    : `## 商品リンク形式\n楽天: <a href="https://search.rakuten.co.jp/search/mall/${encodeURIComponent(topic.product)}/" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-rakuten">楽天で見る</a>\nAmazon: <a href="https://www.amazon.co.jp/s?k=${encodeURIComponent(topic.product)}&tag=YOUR_ASSOCIATE_ID" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-amazon">Amazonで見る</a>`;

  const prompt = `あなたは日本の美容・コスメアフィリエイトサイト「BeautyBests」の専属ライターです。
以下の情報をもとに、SEOに強く読者に役立つ美容記事のHTMLを生成してください。

## 記事情報
- タイトル: ${topic.title}
- カテゴリ: ${topic.category}
- 対象キーワード: ${topic.keyword}
- 紹介する商品: ${topic.product}

## 執筆ルール
1. 文字数: 2000〜3000文字
2. 参考にするサイト: @cosme、LIPS、美的.com、MAQUIA Online、VOCE の情報を参考にする
3. 効果・効能の断定表現は使わない（薬機法対応）
4. 「治る」「治療する」等の医療的表現は使わない
5. 口コミや評価は「〜という声が多い」「〜という口コミがある」等の表現にする
6. 見出し（h2・h3）を適切に使い、読みやすく構成する
7. 目次、ポイントリスト、まとめを必ず含める

## HTMLテンプレート仕様
- 外部CSSは "../css/style.css" を使用
- ヘッダーのロゴは "Beauty<span>Bests</span>✦"
- フッターに必ずアフィリエイト免責表示を入れる

${productSection}

## 出力形式
完全なHTMLファイルのみ出力してください。説明文やコードブロックの囲み（\`\`\`）は不要です。
<!DOCTYPE html> から始まり </html> で終わるHTMLのみ出力してください。`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  let html = response.content[0].text.trim();
  html = html.replace(/^```html\n?/i, "").replace(/\n?```$/i, "").trim();

  const slug = titleToSlug();
  html = html
    .replace(/<title>.*?<\/title>/i, `<title>${topic.title} | BeautyBests</title>`)
    .replace(
      /<link rel="canonical"[^>]*>/i,
      `<link rel="canonical" href="https://beauty-bests.com/articles/${slug}.html">`
    );

  return { slug, html };
}

// ===== Git操作 =====

function gitPush(filenames) {
  try {
    execSync(
      `git -C "${ROOT_DIR}" add ${filenames.map((f) => `"articles/${f}"`).join(" ")}`,
      { stdio: "pipe" }
    );
    const msg = `自動記事生成: ${filenames.length}本追加 (${formatDate()})`;
    execSync(`git -C "${ROOT_DIR}" commit -m "${msg}"`, { stdio: "pipe" });

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      execSync(
        `git -C "${ROOT_DIR}" push https://kentaki1114-afk:${token}@github.com/kentaki1114-afk/beauty-site.git main`,
        { stdio: "pipe" }
      );
      console.log("✅ GitHubにpush完了");
    } else {
      console.log("⚠️ GITHUB_TOKEN未設定のためpushをスキップ");
    }
  } catch (e) {
    console.error("Git操作エラー:", e.message);
  }
}

// ===== メイン処理 =====

async function main() {
  console.log("🌸 BeautyBests 自動記事生成開始");
  console.log(`📅 ${formatDate()}`);
  console.log("─".repeat(40));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ ANTHROPIC_API_KEY が設定されていません");
    process.exit(1);
  }

  if (process.env.RAKUTEN_APP_ID) {
    console.log("🛍️ 楽天商品APIを使用します");
  } else {
    console.log("⚠️ RAKUTEN_APP_ID未設定: 商品画像なしで生成します");
  }

  const topics = loadTopics();
  const progress = loadProgress();
  const startIndex = progress.lastIndex % topics.length;

  const todayTopics = [];
  for (let i = 0; i < ARTICLES_PER_DAY; i++) {
    todayTopics.push(topics[(startIndex + i) % topics.length]);
  }

  console.log(`📝 本日のトピック (${ARTICLES_PER_DAY}本):`);
  todayTopics.forEach((t, i) => console.log(`  ${i + 1}. ${t.title}`));
  console.log("─".repeat(40));

  const generatedFiles = [];
  let successCount = 0;

  for (const topic of todayTopics) {
    try {
      const { slug, html } = await generateArticle(topic);
      const filename = `${slug}.html`;
      const filepath = path.join(ARTICLES_DIR, filename);

      fs.writeFileSync(filepath, html, "utf-8");
      generatedFiles.push(filename);
      successCount++;
      console.log(`  ✅ 保存: articles/${filename}`);

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  ❌ 生成失敗: ${topic.title}`, err.message);
    }
  }

  saveProgress({ lastIndex: startIndex + ARTICLES_PER_DAY, lastRun: new Date().toISOString() });

  console.log("─".repeat(40));
  console.log(`✨ 完了: ${successCount}/${ARTICLES_PER_DAY}本生成`);

  if (generatedFiles.length > 0) {
    console.log("📤 GitHubにpush中...");
    gitPush(generatedFiles);
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

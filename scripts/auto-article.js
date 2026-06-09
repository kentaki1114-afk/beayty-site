/**
 * BeautyBests 自動記事生成スクリプト
 * 毎日5本の美容記事を自動生成してGitHubにpushする
 *
 * 環境変数:
 *   ANTHROPIC_API_KEY=sk-ant-xxxxx (必須)
 *   GITHUB_TOKEN=ghp_xxxxx (必須)
 *   RAKUTEN_APP_ID=xxxxxx (任意: 楽天商品情報を取得)
 *   RAKUTEN_AFFILIATE_ID=xxxxxx (任意: 楽天アフィリエイトID)
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
const INDEX_FILE = path.join(ROOT_DIR, "index.html");

const ARTICLES_PER_DAY = 5;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// カテゴリ別絵文字
const CATEGORY_EMOJI = {
  "韓国コスメ": "🌸",
  "スキンケア": "🧴",
  "メイクアップ": "💄",
  "ヘアケア": "💇",
  "ボディケア": "🛁",
  "日焼け止め": "☀️",
  "ニキビケア": "🩹",
  "保湿": "💧",
  "default": "✨",
};

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

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      // リダイレクト対応
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location, headers).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    }).on("error", reject);
  });
}

// ===== 楽天商品検索API =====

async function fetchRakutenProducts(keyword, count = 3) {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return [];

  try {
    const params = new URLSearchParams({
      applicationId: appId,
      keyword: keyword,
      hits: String(count),
      imageFlag: "1",
      formatVersion: "2",
    });
    const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
    if (affiliateId) params.set("affiliateId", affiliateId);

    const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?${params.toString()}`;
    const data = await httpsGet(url);

    if (!data.Items || data.Items.length === 0) return [];

    return data.Items.map((item) => ({
      name: item.itemName.slice(0, 50),
      price: item.itemPrice.toLocaleString(),
      imageUrl: item.mediumImageUrls?.[0]?.imageUrl || item.mediumImageUrls?.[0] || "",
      itemUrl: affiliateId ? item.affiliateUrl : item.itemUrl,
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
        ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy" style="width:128px;height:128px;object-fit:contain;border-radius:8px;">` : ""}
        <div class="product-info">
          <p class="product-name">${p.name}</p>
          <p class="product-price">楽天価格: ¥${p.price}</p>
          <div class="product-actions">
            <a href="${p.itemUrl}" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-rakuten">楽天で見る</a>
            <a href="https://www.amazon.co.jp/s?k=${encodeURIComponent(keyword)}&tag=kentaki0d-22" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-amazon">Amazonで見る</a>
            <a href="https://af.moshimo.com/af/c/click?a_id=1194904&p_id=1225&pc_id=2274&pl_id=28877&url=${encodeURIComponent('https://shopping.yahoo.co.jp/search?p=' + encodeURIComponent(keyword))}" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-yahoo">Yahoo!で見る</a>
          </div>
        </div>
      </div>`).join("\n");

  return `<div class="product-list">\n${cards}\n    </div>`;
}

// ===== index.html 更新 =====

function updateIndexHtml(articles) {
  if (articles.length === 0) return;

  let html = fs.readFileSync(INDEX_FILE, "utf-8");

  const newCards = articles.map(({ slug, title, category, date }) => {
    const emoji = CATEGORY_EMOJI[category] || CATEGORY_EMOJI["default"];
    return `
        <a href="articles/${slug}.html" class="article-card">
          <div class="article-thumb">${emoji}</div>
          <div class="article-body">
            <div class="article-tags">
              <span class="tag tag-primary">${category}</span>
              <span class="tag">新着</span>
            </div>
            <p class="article-title">${title}</p>
            <div class="article-meta">
              <span>${date}</span>
              <span>約5分で読めます</span>
            </div>
          </div>
        </a>`;
  }).join("\n");

  // article-gridの先頭に挿入
  html = html.replace(
    /(<div class="article-grid">)/,
    `$1\n${newCards}`
  );

  fs.writeFileSync(INDEX_FILE, html, "utf-8");
  console.log(`  📄 index.html に ${articles.length} 件追加`);
}

// ===== 記事生成 =====

async function generateArticle(topic) {
  console.log(`  生成中: ${topic.title}`);

  const products = await fetchRakutenProducts(topic.product, 3);
  const productHtml = buildProductHtml(products, topic.product);

  const productSection = products.length > 0
    ? `## 紹介する商品データ\n${products.map((p, i) => `${i + 1}. 商品名: ${p.name} / 価格: ¥${p.price}`).join("\n")}\n\n商品を紹介するセクションに <!-- PRODUCT_CARDS --> というプレースホルダーを必ず1箇所だけ挿入すること。`
    : `## 商品リンク\n商品を紹介するセクションに <!-- PRODUCT_CARDS --> というプレースホルダーを必ず1箇所だけ挿入すること。`;

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

  if (productHtml) {
    if (html.includes("<!-- PRODUCT_CARDS -->")) {
      html = html.replace("<!-- PRODUCT_CARDS -->", productHtml);
    } else {
      const h2Match = html.match(/<h2[^>]*>/i);
      if (h2Match) {
        html = html.replace(h2Match[0], `${productHtml}\n${h2Match[0]}`);
      } else {
        html = html.replace("</body>", `${productHtml}\n</body>`);
      }
    }
  }

  return { slug, html, title: topic.title, category: topic.category };
}

// ===== Git操作 =====

function gitPush(filenames) {
  // GitHub Actions環境ではワークフローがcommit/pushを担当するためスキップ
  if (process.env.CI) {
    console.log("ℹ️ CI環境のためgit操作はワークフローに委譲");
    return;
  }

  try {
    const files = [...filenames.map((f) => `articles/${f}`), "index.html"].join(" ");
    execSync(`git -C "${ROOT_DIR}" add ${files}`, { stdio: "pipe" });
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
  const indexArticles = [];
  let successCount = 0;

  for (const topic of todayTopics) {
    try {
      const { slug, html, title, category } = await generateArticle(topic);
      const filename = `${slug}.html`;
      const filepath = path.join(ARTICLES_DIR, filename);

      fs.writeFileSync(filepath, html, "utf-8");
      generatedFiles.push(filename);
      indexArticles.push({ slug: filename.replace(".html", ""), title, category, date: formatDate() });
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
    updateIndexHtml(indexArticles);
    console.log("📤 GitHubにpush中...");
    gitPush(generatedFiles);
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

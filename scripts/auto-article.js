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
const SITEMAP_FILE = path.join(ROOT_DIR, "sitemap.xml");

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
        <a href="articles/${slug}.html" class="article-card" data-category="${category}">
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

  // article-gridの先頭に挿入(id属性等が付与されていてもマッチするように)
  const before = html;
  html = html.replace(
    /(<div class="article-grid"[^>]*>)/,
    `$1\n${newCards}`
  );

  if (html === before) {
    console.warn("  ⚠️ article-grid が見つからず index.html を更新できませんでした");
    return;
  }

  fs.writeFileSync(INDEX_FILE, html, "utf-8");
  console.log(`  📄 index.html に ${articles.length} 件追加`);
}

// ===== sitemap.xml 更新 =====

function updateSitemap(articles) {
  if (articles.length === 0) return;
  if (!fs.existsSync(SITEMAP_FILE)) {
    console.warn("  ⚠️ sitemap.xml が見つかりません");
    return;
  }

  let xml = fs.readFileSync(SITEMAP_FILE, "utf-8");

  const newEntries = articles.map(({ slug }) => `  <url>
    <loc>https://beauty-bests.com/articles/${slug}.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join("\n");

  const before = xml;
  xml = xml.replace(/(<\/urlset>)/, `${newEntries}\n$1`);

  if (xml === before) {
    console.warn("  ⚠️ </urlset> が見つからず sitemap.xml を更新できませんでした");
    return;
  }

  fs.writeFileSync(SITEMAP_FILE, xml, "utf-8");
  console.log(`  🗺️ sitemap.xml に ${articles.length} 件追加`);
}

// ===== 重複チェック =====

function getExistingTitles() {
  if (!fs.existsSync(ARTICLES_DIR)) return new Set();
  const titles = new Set();
  const files = fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".html"));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
      const match = content.match(/<title>([^<]+)<\/title>/i);
      if (match) {
        // "タイトル | BeautyBests" → "タイトル" に正規化
        titles.add(match[1].replace(/\s*\|\s*BeautyBests\s*$/i, "").trim());
      }
    } catch {
      // 読み取れないファイルはスキップ
    }
  }
  return titles;
}

// ===== 記事生成 =====

async function generateArticle(topic) {
  console.log(`  生成中: ${topic.title}`);

  const products = await fetchRakutenProducts(topic.product, 3);
  const productHtml = buildProductHtml(products, topic.product);

  const productSection = products.length > 0
    ? `## 紹介する商品データ\n${products.map((p, i) => `${i + 1}. 商品名: ${p.name} / 価格: ¥${p.price}`).join("\n")}\n\n商品を紹介するセクションに <!-- PRODUCT_CARDS --> というプレースホルダーを必ず1箇所だけ挿入すること。`
    : `## 商品リンク\n商品を紹介するセクションに <!-- PRODUCT_CARDS --> というプレースホルダーを必ず1箇所だけ挿入すること。`;

  const today = new Date().toISOString().split("T")[0];

  const prompt = `あなたは日本の美容・コスメアフィリエイトサイト「BeautyBests」のSEO専門ライターです。
Googleで検索上位を取るための高品質な記事HTMLを生成してください。

## 記事情報
- タイトル: ${topic.title}
- カテゴリ: ${topic.category}
- メインキーワード: ${topic.keyword}
- 紹介する商品: ${topic.product}
- 公開日: ${today}

## SEO必須要件（すべて必ず実装すること）

### 1. headタグ内
- <title>: メインキーワードを含む60文字以内
- <meta name="description">: メインキーワードを含む120文字以内で読者の行動を促す文章
- <meta name="keywords">: 関連キーワード5〜8個
- <link rel="canonical">: https://beauty-bests.com/articles/SLUG.html
- OGPタグ（og:title, og:description, og:type="article"）
- JSON-LD構造化データ（Article型）を必ず含める：
  \`\`\`json
  {"@context":"https://schema.org","@type":"Article","headline":"タイトル","datePublished":"${today}","dateModified":"${today}","author":{"@type":"Organization","name":"BeautyBests"},"publisher":{"@type":"Organization","name":"BeautyBests","url":"https://beauty-bests.com"}}
  \`\`\`

### 2. 記事構成（この順番で必ず作成）
1. **リード文**（200字）: 読者の悩みに共感し、この記事で解決できることを明示
2. **この記事でわかること**（箇条書き3〜5点）
3. **目次**（h2見出しをすべてリスト化）
4. **本文**（h2×4〜6個、各h2の下にh3×2〜3個）
5. **比較テーブル**（商品を表形式で比較。列：商品名・価格・特徴・おすすめ肌質）
6. **商品紹介セクション** ← ここに <!-- PRODUCT_CARDS --> を挿入
7. **よくある質問（FAQ）**（Q&A形式で4〜6問）
8. **まとめ**（結論＋読者へのアクション）
9. **関連記事リンク**（サイト内の関連カテゴリへのリンクを2〜3個）

### 3. 文章ルール
- 文字数: 3000〜4000文字（本文のみ）
- @cosme・LIPS・美的.com・MAQUIA Online・VOCE の情報を参考にした具体的な口コミを引用
- 「〜という声が多い」「〜という口コミが見られる」等の表現を使う（断定しない）
- 薬機法対応：「治る」「治療する」「効く」等の断定表現は使わない
- 読者が「この記事を全部読んで良かった」と感じる情報量にする

### 4. HTMLクラス・構造
- 外部CSS: "../css/style.css"
- ロゴ: Beauty<span>Bests</span>✦
- パンくずリスト: HOME > ${topic.category} > 記事タイトル
- FAQはschema.org FAQPageのJSON-LDも追加する
- フッターにアフィリエイト免責表示を必ず入れる

${productSection}

## 出力形式
<!DOCTYPE html>から始まり</html>で終わる完全なHTMLのみ出力してください。
コードブロック記号（\`\`\`）や説明文は不要です。`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 12000,
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
    const files = [...filenames.map((f) => `articles/${f}`), "index.html", "sitemap.xml"].join(" ");
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
  const existingTitles = getExistingTitles();
  console.log(`📚 既存記事: ${existingTitles.size} 件`);

  const todayTopics = [];
  let scanIndex = startIndex;
  while (todayTopics.length < ARTICLES_PER_DAY && scanIndex < startIndex + topics.length) {
    const topic = topics[scanIndex % topics.length];
    if (existingTitles.has(topic.title)) {
      console.log(`  ⏭️ スキップ (重複): ${topic.title}`);
    } else {
      todayTopics.push(topic);
    }
    scanIndex++;
  }

  console.log(`📝 本日のトピック (${todayTopics.length}本):`);
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

  saveProgress({ lastIndex: scanIndex, lastRun: new Date().toISOString() });

  console.log("─".repeat(40));
  console.log(`✨ 完了: ${successCount}/${ARTICLES_PER_DAY}本生成`);

  if (generatedFiles.length > 0) {
    updateIndexHtml(indexArticles);
    updateSitemap(indexArticles);
    console.log("📤 GitHubにpush中...");
    gitPush(generatedFiles);
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

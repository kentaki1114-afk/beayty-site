/**
 * BeautyBests 記事SEO一括修復スクリプト（再実行可能・冪等）
 *
 * 実行: node scripts/fix-article-seo.js
 *
 * 各記事に対して以下を実施:
 *  1. canonical の欠落補完・URL修正（実ファイル名に一致させる）
 *  2. og:url の修正 / OGPタグ一式の欠落補完（og:image, twitter:card 含む）
 *  3. 存在しないページへの内部リンク修正（../skincare.html 等 → 実在URL）
 *  4. 存在しない記事への関連リンクを実在記事へ差し替え
 *  5. Article構造化データ(JSON-LD)の欠落補完
 *  6. BreadcrumbList構造化データ(JSON-LD)の欠落補完
 *  7. 薬機法上問題のある表現の修正（「効く」「消す」等の断定表現）
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const ARTICLES_DIR = path.join(ROOT_DIR, "articles");
const SITE_URL = "https://beauty-bests.com";
const OG_IMAGE = `${SITE_URL}/images/og-image.png`;
const TODAY = new Date().toISOString().slice(0, 10);

// 存在しないページ → 実在ページへのリンク修正マップ
const LINK_FIXES = [
  ['href="../skincare.html"', 'href="../index.html#skincare"'],
  ['href="../makeup.html"', 'href="../index.html#makeup"'],
  ['href="../haircare.html"', 'href="../search.html?q=%E3%83%98%E3%82%A2%E3%82%B1%E3%82%A2"'],
  ['href="../bodycare.html"', 'href="../search.html?q=%E3%83%9C%E3%83%87%E3%82%A3%E3%82%B1%E3%82%A2"'],
  ['href="../privacy-policy.html"', 'href="../privacy.html"'],
];

// 存在しない記事 → 実在する関連記事への差し替えマップ
const RELATED_MAP = {
  "waterproof-mascara-ranking.html": "article-20260610-bqhc.html",
  "sensitive-skin-skincare.html": "article-20260607-yejz.html",
  "korean-toner-ranking.html": "article-20260609-3ldk.html",
  "foundation-ranking.html": "article-20260607-gax3.html",
  "eyeshadow-summer-long-lasting.html": "article-20260607-eqpa.html",
  "color-control-guide.html": "article-20260610-21mb.html",
  "base-makeup-sweat-proof.html": "article-20260610-21mb.html",
  "base-makeup-beginner.html": "article-20260604-xk42.html",
  "korean-skincare-routine.html": "article-20260607-lc3d.html",
  "glass-skin-howto.html": "article-20260606-v3zz.html",
  "serum-ranking-2026.html": "article-20260607-k0kg.html",
  "cleansing-sensitive-skin.html": "article-20260607-uajr.html",
  "skincare-routine-dryness.html": "article-20260607-lc3d.html",
  "pore-cover-makeup.html": "article-20260607-gax3.html",
  "summer-foundation-2026.html": "article-20260604-xk42.html",
  "oily-skin-skincare.html": "article-20260607-uajr.html",
  "mascara-ranking-2026.html": "article-20260604-xlem.html",
  "eye-makeup-summer-tips.html": "article-20260610-zw2m.html",
  "eyelash-care-guide.html": "article-20260606-bdof.html",
  "uv-protection-guide.html": "article-20260610-i2gt.html",
  "sensitive-skin-care.html": "article-20260607-yejz.html",
  "summer-skincare-routine.html": "article-20260607-lc3d.html",
};

// 存在しないカテゴリページ → 実在URLへのマッピング（basename基準）
const CATEGORY_LINK_MAP = {
  "skincare": "../index.html#skincare",
  "makeup": "../index.html#makeup",
  "makeup-base": "../index.html#makeup",
  "eye-makeup": "../index.html#makeup",
  "korean-cosmetics": "../search.html?q=%E9%9F%93%E5%9B%BD%E3%82%B3%E3%82%B9%E3%83%A1",
  "haircare": "../search.html?q=%E3%83%98%E3%82%A2%E3%82%B1%E3%82%A2",
  "bodycare": "../search.html?q=%E3%83%9C%E3%83%87%E3%82%A3%E3%82%B1%E3%82%A2",
  "lip-care": "../search.html?q=%E3%83%AA%E3%83%83%E3%83%97",
  "sunscreen": "../search.html?q=%E6%97%A5%E7%84%BC%E3%81%91%E6%AD%A2%E3%82%81",
};

// 薬機法対応: 断定表現の置換（タイトル・本文共通）
const YAKKIHO_FIXES = [
  ["乾燥肌に効くボディクリーム", "乾燥肌向けボディクリーム"],
  ["ダメージ髪に効くヘアケア", "ダメージ髪向けヘアケア"],
  ["ニキビ跡を消す方法", "ニキビ跡をケアする方法"],
  ["は本当に効く？", "の実力は？"],
  ["は実力は？", "の実力は？"], // 旧置換の修正用
];

// カテゴリ → 実在するカテゴリページURL
const CATEGORY_URLS = {
  "スキンケア": `${SITE_URL}/index.html#skincare`,
  "メイクアップ": `${SITE_URL}/index.html#makeup`,
  "メイク": `${SITE_URL}/index.html#makeup`,
};
function categoryUrl(cat) {
  return CATEGORY_URLS[cat] || `${SITE_URL}/search.html?q=${encodeURIComponent(cat)}`;
}

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return "";
  return m[1].replace(/\s*\|\s*BeautyBests\s*$/i, "").trim();
}

function getDescription(html) {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
  return m ? m[1] : "";
}

function getCategory(html) {
  let m = html.match(/<span class="category">([^<]+)<\/span>/);
  if (m) return m[1].trim();
  m = html.match(/<span class="tag tag-primary">([^<]+)<\/span>/);
  if (m) return m[1].trim();
  // パンくず: HOME > <a>カテゴリ</a> > ...
  m = html.match(/class="breadcrumb"[\s\S]{0,300}?<a href="[^"]*">(?:HOME|ホーム)<\/a>[^<]*<a href="[^"]*">([^<]+)<\/a>/);
  if (m) return m[1].trim();
  return "美容";
}

function getPublishedDate(html, filename) {
  let m = html.match(/datetime="(\d{4}-\d{2}-\d{2})"/);
  if (m) return m[1];
  m = html.match(/"datePublished":\s*"(\d{4}-\d{2}-\d{2})"/);
  if (m) return m[1];
  m = html.match(/(?:公開日|📅)[：:\s]*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  m = filename.match(/article-(\d{4})(\d{2})(\d{2})-/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "2026-05-28"; // サイト開設初期の手動記事フォールバック
}

function insertBeforeHeadClose(html, snippet) {
  return html.replace(/<\/head>/i, `${snippet}\n</head>`);
}

const existingFiles = new Set(fs.readdirSync(ARTICLES_DIR).filter((f) => f.endsWith(".html")));

// 差し替え先記事のタイトルをキャッシュ
const titleCache = {};
function titleOf(file) {
  if (!titleCache[file]) {
    const html = fs.readFileSync(path.join(ARTICLES_DIR, file), "utf-8");
    titleCache[file] = getTitle(html);
  }
  return titleCache[file];
}

let changedCount = 0;

for (const file of [...existingFiles].sort()) {
  const filepath = path.join(ARTICLES_DIR, file);
  let html = fs.readFileSync(filepath, "utf-8");
  const original = html;
  const pageUrl = `${SITE_URL}/articles/${file}`;
  const fixes = [];

  // ===== 7. 薬機法表現の修正（タイトル取得前に実施） =====
  for (const [from, to] of YAKKIHO_FIXES) {
    if (html.includes(from)) {
      html = html.split(from).join(to);
      fixes.push(`薬機法表現: "${from}"→"${to}"`);
    }
  }

  const title = getTitle(html);
  const description = getDescription(html);
  const category = getCategory(html);
  const published = getPublishedDate(html, file);

  // ===== 3. 存在しないページへのリンク修正 =====
  for (const [from, to] of LINK_FIXES) {
    if (html.includes(from)) {
      html = html.split(from).join(to);
      fixes.push(`リンク修正: ${from}`);
    }
  }

  // ===== 3b. 存在しないカテゴリページへのリンク修正（../categories/xxx.html, ../category/xxx.html等） =====
  html = html.replace(/href="\.\.\/(?:categories|category)\/([a-z0-9-]+)\.html"/g, (m, base) => {
    const to = CATEGORY_LINK_MAP[base] || `../search.html?q=${encodeURIComponent(base)}`;
    fixes.push(`カテゴリリンク修正: ${m} → ${to}`);
    return `href="${to}"`;
  });

  // ===== 4. 存在しない記事への関連リンク差し替え =====
  // href のパス形式ゆらぎ（"xxx.html" / "./xxx.html" / "../articles/xxx.html" / "../任意dir/xxx.html"）に対応
  html = html.replace(
    /<a href="(?:\.\/|\.\.\/articles\/|\.\.\/[a-z0-9-]+\/)?([a-z0-9-]+\.html)"([^>]*)>([^<]*)<\/a>/g,
    (m, base, attrs, text) => {
      if (existingFiles.has(base)) {
        // 実在記事: パスを articles/ 直下の相対参照に正規化
        if (!m.includes(`href="${base}"`)) {
          fixes.push(`記事リンクのパス正規化: → ${base}`);
          return `<a href="${base}"${attrs}>${text}</a>`;
        }
        return m;
      }
      // ルート直下の主要ページを誤って相対参照している場合
      if (["index.html", "ranking.html", "about.html", "contact.html", "privacy.html", "search.html"].includes(base)) {
        fixes.push(`ルートページへのパス修正: → ../${base}`);
        return `<a href="../${base}"${attrs}>${text}</a>`;
      }
      const target = RELATED_MAP[base];
      if (target && existingFiles.has(target)) {
        fixes.push(`関連リンク差し替え: ${base} → ${target}`);
        return `<a href="${target}"${attrs}>${titleOf(target)}</a>`;
      }
      // マップ未登録: アンカーテキストから検索ページへ（404防止のフォールバック）
      const q = encodeURIComponent(text.replace(/【[^】]*】/g, "").slice(0, 15));
      fixes.push(`関連リンクを検索へフォールバック: ${base}`);
      return `<a href="../search.html?q=${q}"${attrs}>${text}</a>`;
    }
  );

  // ===== 1. canonical =====
  if (/<link rel="canonical"/i.test(html)) {
    const fixed = html.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${pageUrl}">`);
    if (fixed !== html) { html = fixed; fixes.push("canonical URL修正"); }
  } else {
    html = insertBeforeHeadClose(html, `  <link rel="canonical" href="${pageUrl}">`);
    fixes.push("canonical 追加");
  }

  // ===== 2. OGP =====
  if (/property="og:url"/.test(html)) {
    const fixed = html.replace(/<meta property="og:url" content="[^"]*"/, `<meta property="og:url" content="${pageUrl}"`);
    if (fixed !== html) { html = fixed; fixes.push("og:url 修正"); }
  } else if (/property="og:title"/.test(html)) {
    html = insertBeforeHeadClose(html, `  <meta property="og:url" content="${pageUrl}">`);
    fixes.push("og:url 追加");
  } else {
    const ogp = [
      `  <meta property="og:title" content="${esc(title)} | BeautyBests">`,
      `  <meta property="og:description" content="${esc(description)}">`,
      `  <meta property="og:type" content="article">`,
      `  <meta property="og:url" content="${pageUrl}">`,
      `  <meta property="og:site_name" content="BeautyBests">`,
    ].join("\n");
    html = insertBeforeHeadClose(html, ogp);
    fixes.push("OGPタグ一式 追加");
  }

  if (!/property="og:image"/.test(html)) {
    const imgTags = [
      `  <meta property="og:image" content="${OG_IMAGE}">`,
      `  <meta name="twitter:card" content="summary_large_image">`,
      `  <meta name="twitter:image" content="${OG_IMAGE}">`,
    ].join("\n");
    html = insertBeforeHeadClose(html, imgTags);
    fixes.push("og:image / twitter:card 追加");
  }

  // ===== 5. Article JSON-LD =====
  if (!/"@type":\s*"Article"/.test(html)) {
    const articleLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${esc(title)}",
    "description": "${esc(description)}",
    "image": "${OG_IMAGE}",
    "datePublished": "${published}",
    "dateModified": "${TODAY}",
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${pageUrl}" },
    "author": { "@type": "Organization", "name": "BeautyBests編集部", "url": "${SITE_URL}/about.html" },
    "publisher": {
      "@type": "Organization",
      "name": "BeautyBests",
      "url": "${SITE_URL}",
      "logo": { "@type": "ImageObject", "url": "${OG_IMAGE}" }
    }
  }
  </script>`;
    html = insertBeforeHeadClose(html, articleLd);
    fixes.push("Article JSON-LD 追加");
  }

  // ===== 6. BreadcrumbList JSON-LD =====
  if (!/"@type":\s*"BreadcrumbList"/.test(html)) {
    const breadcrumbLd = `  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "ホーム", "item": "${SITE_URL}/" },
      { "@type": "ListItem", "position": 2, "name": "${esc(category)}", "item": "${categoryUrl(category)}" },
      { "@type": "ListItem", "position": 3, "name": "${esc(title)}", "item": "${pageUrl}" }
    ]
  }
  </script>`;
    html = insertBeforeHeadClose(html, breadcrumbLd);
    fixes.push("BreadcrumbList JSON-LD 追加");
  }

  // ===== 残存リンク切れの警告 =====
  const localLinks = [...html.matchAll(/href="([^"#?]+\.html)(?:[#?][^"]*)?"/g)]
    .map((m) => m[1])
    .filter((l) => !/^https?:/.test(l));
  for (const link of new Set(localLinks)) {
    const resolved = path.normalize(path.join(ARTICLES_DIR, link));
    if (!fs.existsSync(resolved)) {
      console.warn(`  ⚠️ ${file}: リンク切れ残存 → ${link}`);
    }
  }

  if (html !== original) {
    fs.writeFileSync(filepath, html, "utf-8");
    changedCount++;
    console.log(`✅ ${file}`);
    fixes.forEach((f) => console.log(`   - ${f}`));
  }
}

console.log(`\n完了: ${changedCount}/${existingFiles.size} ファイルを更新`);

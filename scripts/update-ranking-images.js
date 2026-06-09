/**
 * ランキングカード商品画像更新スクリプト
 * Rakuten Items Search API で商品画像を取得し index.html に反映する
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const INDEX_FILE = path.join(ROOT_DIR, "index.html");

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 300)}`)); }
      });
    }).on("error", reject);
  });
}

async function fetchImageUrl(keyword) {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) return null;

  const params = new URLSearchParams({
    applicationId: appId,
    keyword: keyword,
    hits: "1",
    imageFlag: "1",
    formatVersion: "2",
  });
  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;
  if (affiliateId) params.set("affiliateId", affiliateId);

  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?${params.toString()}`;

  try {
    const data = await httpsGet(url);
    if (!data.Items || data.Items.length === 0) {
      console.log(`    → 検索結果なし`);
      return null;
    }
    const item = data.Items[0];
    // formatVersion:2 では mediumImageUrls は文字列配列
    const imgs = item.mediumImageUrls;
    const imgUrl = Array.isArray(imgs)
      ? (typeof imgs[0] === "object" ? imgs[0].imageUrl : imgs[0])
      : null;
    console.log(`    → ${imgUrl ? "画像取得OK" : "画像URLなし"}`);
    return imgUrl || null;
  } catch (e) {
    console.log(`    → API失敗: ${e.message}`);
    return null;
  }
}

// HTMLエンティティをデコード（&amp; → & など）
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

async function main() {
  console.log("🖼️  ランキングカード商品画像更新開始");

  if (!process.env.RAKUTEN_APP_ID) {
    console.error("❌ RAKUTEN_APP_ID が設定されていません");
    process.exit(1);
  }

  let html = fs.readFileSync(INDEX_FILE, "utf-8");

  // ranking-card ブロックを個別に処理
  // placeholder が残っているカードのみ対象
  const cardRegex = /(<div class="ranking-card"[^>]*>)([\s\S]*?)(?=<div class="ranking-card"|<\/div>\s*<\/section>)/g;

  let updatedCount = 0;
  let totalCount = 0;
  const replacements = []; // { search, replace } のリスト

  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const cardHtml = match[0];

    // placeholder が既に置き換えられているカードはスキップ
    if (!cardHtml.includes('product-img-placeholder')) continue;

    // product-name を抽出（HTMLエンティティあり）
    const nameMatch = cardHtml.match(/<div class="product-name">([^<]+)<\/div>/);
    if (!nameMatch) continue;

    const nameInHtml = nameMatch[1].trim(); // HTML内の文字列（&amp;等を含む）
    const nameForApi = decodeHtmlEntities(nameInHtml); // API検索用にデコード

    totalCount++;
    console.log(`  [${totalCount}] 検索: ${nameForApi}`);

    await new Promise((r) => setTimeout(r, 800));
    const imgUrl = await fetchImageUrl(nameForApi);

    if (!imgUrl) continue;

    // このカード内の placeholder だけを img に置換
    // placeholder の直前にある product-img-wrap を特定
    const oldBlock = `<div class="product-img-placeholder">[^<]*</div>`;
    const newImg = `<img src="${imgUrl}" alt="${nameInHtml}" loading="lazy" style="width:100%;max-width:200px;height:auto;object-fit:contain;border-radius:8px;">`;

    const updatedCard = cardHtml.replace(
      new RegExp(oldBlock),
      newImg
    );

    if (updatedCard !== cardHtml) {
      replacements.push({ from: cardHtml, to: updatedCard, name: nameForApi });
      updatedCount++;
    }
  }

  // まとめて置換（順序の依存を避けるため後から一括）
  for (const { from, to, name } of replacements) {
    html = html.replace(from, to);
    console.log(`  ✅ 画像更新: ${name}`);
  }

  fs.writeFileSync(INDEX_FILE, html, "utf-8");
  console.log(`\n✨ 完了: ${updatedCount}/${totalCount} 件更新`);
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

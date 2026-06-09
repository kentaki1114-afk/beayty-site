/**
 * ランキングカード商品画像更新スクリプト
 * Rakuten Items Search API で商品画像を取得し index.html に反映する
 *
 * 環境変数:
 *   RAKUTEN_APP_ID=xxxxxx (必須)
 *   RAKUTEN_AFFILIATE_ID=xxxxxx (任意)
 */

import { execSync } from "child_process";
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
        catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    }).on("error", reject);
  });
}

async function fetchImageUrl(keyword) {
  const appId = process.env.RAKUTEN_APP_ID;
  const affiliateId = process.env.RAKUTEN_AFFILIATE_ID;

  const params = new URLSearchParams({
    applicationId: appId,
    keyword: keyword,
    hits: "1",
    imageFlag: "1",
    formatVersion: "2",
  });
  if (affiliateId) params.set("affiliateId", affiliateId);

  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?${params.toString()}`;

  try {
    const data = await httpsGet(url);
    if (!data.Items || data.Items.length === 0) return null;
    const item = data.Items[0];
    const imgUrl = item.mediumImageUrls?.[0]?.imageUrl || item.mediumImageUrls?.[0] || null;
    return imgUrl || null;
  } catch (e) {
    console.log(`  ⚠️ API取得失敗 (${keyword}): ${e.message}`);
    return null;
  }
}

function extractProductNames(html) {
  const names = [];
  const pattern = /<div class="product-img-placeholder">[^<]*<\/div>[\s\S]*?<div class="product-name">([^<]+)<\/div>/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    names.push(match[1].trim());
  }
  return names;
}

async function main() {
  console.log("🖼️  ランキングカード商品画像更新開始");

  if (!process.env.RAKUTEN_APP_ID) {
    console.error("❌ RAKUTEN_APP_ID が設定されていません");
    process.exit(1);
  }

  let html = fs.readFileSync(INDEX_FILE, "utf-8");
  const productNames = extractProductNames(html);
  console.log(`📦 対象商品: ${productNames.length} 件`);

  let updatedCount = 0;

  for (const name of productNames) {
    console.log(`  検索中: ${name}`);
    await new Promise((r) => setTimeout(r, 800)); // API制限対策

    const imgUrl = await fetchImageUrl(name);

    if (!imgUrl) {
      console.log(`  ⏭️ 画像なし: ${name}`);
      continue;
    }

    // product-img-placeholderをimgタグに置き換え（対象商品名の直前のもの）
    // 商品名でマッチするブロックを特定して置換
    const safeEscape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/&amp;/g, "&amp;").replace(/&/g, "(?:&amp;|&)");

    const blockPattern = new RegExp(
      `(<div class="product-img-wrap">)<div class="product-img-placeholder">[^<]*</div>(</div>[\\s\\S]*?<div class="product-name">${safeEscape(name)}</div>)`,
      "m"
    );

    const newImg = `<img src="${imgUrl}" alt="${name}" loading="lazy" width="200" height="200" style="object-fit:contain;border-radius:8px;width:100%;height:auto;">`;

    const updated = html.replace(blockPattern, `$1${newImg}$2`);

    if (updated !== html) {
      html = updated;
      updatedCount++;
      console.log(`  ✅ 画像更新: ${name}`);
    } else {
      console.log(`  ⚠️ パターン不一致: ${name}`);
    }
  }

  fs.writeFileSync(INDEX_FILE, html, "utf-8");
  console.log(`\n✨ 完了: ${updatedCount}/${productNames.length} 件更新`);

  // CI環境ではワークフローがcommit/pushを担当
  if (process.env.CI) {
    console.log("ℹ️ CI環境のためgit操作はワークフローに委譲");
    return;
  }
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

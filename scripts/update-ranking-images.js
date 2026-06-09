/**
 * ランキングカード商品画像更新スクリプト
 * product-img-placeholder と product-name を順序でペアリングして画像取得
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
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(data.slice(0, 200))); }
      });
    }).on("error", reject);
  });
}

async function fetchImageUrl(keyword) {
  const appId = process.env.RAKUTEN_APP_ID;
  const params = new URLSearchParams({
    applicationId: appId,
    keyword,
    hits: "1",
    imageFlag: "1",
    formatVersion: "2",
  });
  if (process.env.RAKUTEN_AFFILIATE_ID) params.set("affiliateId", process.env.RAKUTEN_AFFILIATE_ID);

  try {
    const data = await httpsGet(
      `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?${params}`
    );
    if (!data.Items?.length) { console.log("    → 結果なし"); return null; }
    const imgs = data.Items[0].mediumImageUrls;
    const url = typeof imgs?.[0] === "object" ? imgs[0].imageUrl : imgs?.[0];
    console.log(`    → ${url ? "OK: " + url.slice(0, 60) + "…" : "画像URLなし"}`);
    return url || null;
  } catch (e) {
    console.log(`    → API失敗: ${e.message}`);
    return null;
  }
}

function decodeHtml(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

async function main() {
  console.log("🖼️  ランキングカード商品画像更新開始");
  if (!process.env.RAKUTEN_APP_ID) { console.error("❌ RAKUTEN_APP_ID未設定"); process.exit(1); }

  let html = fs.readFileSync(INDEX_FILE, "utf-8");

  // placeholder と product-name を位置順にすべて収集
  const placeholderRe = /<div class="product-img-placeholder">([^<]*)<\/div>/g;
  const nameRe = /<div class="product-name">([^<]+)<\/div>/g;

  const placeholders = []; // { index, fullMatch, emoji }
  const names = [];        // { index, fullMatch, name }

  let m;
  while ((m = placeholderRe.exec(html)) !== null) {
    placeholders.push({ index: m.index, fullMatch: m[0], emoji: m[1] });
  }
  while ((m = nameRe.exec(html)) !== null) {
    names.push({ index: m.index, name: m[1].trim() });
  }

  console.log(`  placeholder: ${placeholders.length}件 / product-name: ${names.length}件`);

  // 各 placeholder の直後に来る product-name と対応させる
  const pairs = placeholders.map((ph) => {
    // ph.index より後にある最初の product-name
    const paired = names.find((n) => n.index > ph.index);
    return { ph, name: paired?.name || null };
  });

  // 画像取得して置換情報を収集（後ろから置換してindexがずれないようにする）
  const replacements = [];

  for (const { ph, name } of pairs) {
    if (!name) { console.log("  ⚠️ 対応する商品名なし"); continue; }

    const decodedName = decodeHtml(name);
    console.log(`  検索: ${decodedName}`);
    await new Promise((r) => setTimeout(r, 800));

    const imgUrl = await fetchImageUrl(decodedName);
    if (!imgUrl) continue;

    replacements.push({
      index: ph.index,
      oldStr: ph.fullMatch,
      newStr: `<img src="${imgUrl}" alt="${name}" loading="lazy" style="width:100%;max-width:180px;height:auto;object-fit:contain;border-radius:8px;">`,
    });
  }

  // 後ろから置換（位置がずれないように）
  replacements.sort((a, b) => b.index - a.index);
  for (const { index, oldStr, newStr } of replacements) {
    html = html.slice(0, index) + newStr + html.slice(index + oldStr.length);
  }

  fs.writeFileSync(INDEX_FILE, html, "utf-8");
  console.log(`\n✨ 完了: ${replacements.length}/${placeholders.length}件更新`);
}

main().catch((e) => { console.error(e); process.exit(1); });

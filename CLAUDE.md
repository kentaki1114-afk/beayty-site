# BeautyBests サイト CLAUDE.md

このファイルはBeautyBestsサイトで作業するClaude Codeへのガイダンスです。

---

## プロジェクト概要

- **サイト名**: BeautyBests（Beauty<span>Bests</span>✦）
- **URL**: https://beauty-bests.com
- **ジャンル**: 美容・コスメ アフィリエイトサイト
- **ターゲット**: 10〜20代女性、美容初心者〜中級者
- **運営者**: kentaki1114@gmail.com

---

## ホスティング・インフラ

| 項目 | 内容 |
|---|---|
| ホスティング | Vercel（無料プラン） |
| リポジトリ | github.com/kentaki1114-afk/beauty-site |
| ドメイン | beauty-bests.com（お名前.com取得） |
| DNS | お名前.com → Vercel（Aレコード: 76.76.21.21） |
| デプロイ方法 | GitHubにpushすると自動デプロイ |

---

## ファイル構成

```
beauty-site/
├── index.html              # トップページ
├── ranking.html            # 総合ランキングページ
├── privacy.html            # プライバシーポリシー
├── css/style.css           # 全ページ共通スタイル
├── js/main.js              # インタラクション全般
└── articles/               # 記事ページ
    ├── beginner-skincare.html      # スキンケア入門
    ├── medicube-review.html        # メディキューブレビュー
    ├── cosrx-acne-patch.html       # COSRXニキビパッチ
    ├── hince-tint-lip.html         # hinceティントリップ
    ├── mediheal-square-serum.html  # メディヒールスクエアセラム
    └── sunscreen-ranking-2026.html # 日焼け止めランキング
```

---

## アフィリエイト設定

| ASP | 状態 | メモ |
|---|---|---|
| 楽天アフィリエイト | 登録済み | リンク一部設置済み |
| Amazonアソシエイト | 申請中 | `YOUR_ASSOCIATE_ID` を差し替え必要 |
| もしもアフィリエイト | 未登録 |  |

### 楽天リンク設置済み商品
- ナチュリエ ハトムギ化粧水
- 肌ラボ 極潤プレミアム
- キュレル 泡洗顔
- CEZANNE BBクリーム
- アネッサ パーフェクトUV

### Amazonリンク未設置（`YOUR_ASSOCIATE_ID` を要差し替え）
全ファイルの `tag=YOUR_ASSOCIATE_ID` を実際のアソシエイトIDに置換する。

---

## デザイン仕様

### カラー変数（css/style.css）
```css
--primary: #d63384;       /* メインピンク */
--primary-light: #f8a5c2;
--primary-dark: #a01f5b;
--gold: #c9a84c;           /* ロゴのゴールド */
--bg: #fff9fb;             /* 背景 */
--border: #f0d0df;
```

### ロゴ表記
```html
Beauty<span>Bests</span>✦
```
- `Beauty` → `--primary` カラー
- `Bests` → `--gold` カラー（spanタグ）

### 共通レイアウト
- 最大幅: `1100px`（メインラッパー）/ `820px`（記事ページ）
- ヘッダー: `sticky top:0` / 高さ `64px`
- スマホ対応: `680px` / `480px` のブレークポイント

---

## 記事作成ルール

### HTMLテンプレート
新規記事を作成する際は `articles/beginner-skincare.html` を参考に構成する。

### 必須要素
1. `<title>` タグ（キーワード + サイト名）
2. `<meta name="description">` （120文字以内）
3. `<link rel="canonical">` （https://beauty-bests.com/articles/xxx.html）
4. パンくずリスト
5. 目次（`.toc`）
6. 著者ボックス（`.author-box`）
7. 関連記事セクション
8. アフィリエイト免責表示（フッター上）

### アフィリエイトリンクの書き方
```html
<a href="楽天リンクURL" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-rakuten">楽天で見る</a>
<a href="https://www.amazon.co.jp/dp/ASIN?tag=アソシエイトID" target="_blank" rel="nofollow sponsored noopener" class="btn-buy btn-amazon">Amazonで見る</a>
```

---

## GitHubへのpush手順

```bash
cd "c:\Users\81907\Documents\cursor\beauty-site"
git add .
git commit -m "コミットメッセージ"
git push origin main
```

pushするとVercelが自動デプロイ（1〜2分で反映）。

---

## 参考にする信頼できるサイト（必ずこの5サイトを参照すること）

記事・ランキング作成時は必ず以下のサイトの情報を参照し、口コミ・評価・トレンドの根拠とすること。

| サイト名 | URL | 用途 |
|---|---|---|
| **@cosme（アットコスメ）** | https://www.cosme.net | 口コミ数・評価点・ランキングの参照 |
| **LIPS（リップス）** | https://lipscosme.com | 最新口コミ・ランキング・成分情報の参照 |
| **美的.com（ビテキ）** | https://www.biteki.com | 美容プロ・編集部によるベストコスメ・トレンド情報 |
| **MAQUIA Online（マキア）** | https://maquia.hpplus.jp | 集英社発・ベストコスメ受賞情報・使い方記事 |
| **VOCE（ヴォーチェ）** | https://i-voce.jp | 講談社発・ベストコスメ・美容マニア向け詳細情報 |

### 参照ルール
- ランキング順位は上記5サイトの評価を総合的に判断して決定する
- 口コミ・評価点は @cosme または LIPS のデータを使用する
- 「ベストコスメ受賞」等の実績は 美的・MAQUIA・VOCE を確認する
- 価格は楽天市場・Amazonの実売価格を参照する
- SNSトレンドはサイト情報を参照し、独自の誇大表現は使わない

---

## 今後追加予定の記事テーマ

- COSRX スネイルムチン美容液
- rom&ndアイシャドウパレット比較
- 敏感肌おすすめスキンケアルーティン
- プチプラファンデーションランキング
- ヘアオイルおすすめランキング

---

## 注意事項

- 記事内の口コミ・評価は参考情報であり、効果・効能を保証するものではない
- 薬機法に注意：「治る」「治療する」等の表現は使わない
- ステマ規制対応：アフィリエイトリンクには必ず `rel="nofollow sponsored"` を付与
- 画像は現在絵文字で代替中。実商品画像を使う場合は楽天・Amazon提供の画像のみ使用可
ランキングは必ずtop10にする

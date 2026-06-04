@echo off
:: BeautyBests 自動記事生成スクリプト
:: Windowsタスクスケジューラから実行するバッチファイル

:: 環境変数を設定（ここに自分のキーを入力）
set ANTHROPIC_API_KEY=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
set GITHUB_TOKEN=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

:: スクリプトのディレクトリに移動
cd /d "c:\Users\81907\Documents\cursor\beauty-site"

:: ログファイルに日時を記録
echo [%date% %time%] 記事生成開始 >> scripts\auto-article.log

:: Node.jsで記事生成スクリプトを実行
node scripts\auto-article.js >> scripts\auto-article.log 2>&1

echo [%date% %time%] 記事生成完了 >> scripts\auto-article.log

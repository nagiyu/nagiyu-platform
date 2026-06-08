#!/usr/bin/env bash
#
# 共通ライブラリ（@nagiyu/*）を依存順にビルドする。
#
# 依存グラフ:
#   common  ← 依存なし（基盤）
#   aws     ← common
#   browser ← common
#   nextjs  ← common
#   react   ← browser, common
#   ui      ← browser, common（+ scripts/copy-assets.mjs）
#
# npm ci はビルドを走らせないため、dist/ が無いまま next dev / E2E を
# 起動するとモジュール解決に失敗する。dev / E2E の前に本スクリプトを実行する。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 各レイヤは依存が解決済みの順に並べる。レイヤ内は順不同でよい。
LAYERS=(
  "@nagiyu/common"
  "@nagiyu/aws @nagiyu/browser @nagiyu/nextjs"
  "@nagiyu/react @nagiyu/ui"
)

for layer in "${LAYERS[@]}"; do
  for pkg in $layer; do
    echo "==> building ${pkg}"
    npm run build --workspace "$pkg"
  done
done

echo "✅ 共通ライブラリのビルド完了"

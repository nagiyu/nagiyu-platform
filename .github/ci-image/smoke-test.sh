#!/usr/bin/env bash
# ビルドしたイメージの動作確認。使い方: smoke-test.sh <種類> <イメージ参照>
# PLAYWRIGHT_VERSION を環境変数で受け取る。
set -euo pipefail

KIND="$1"
IMAGE="$2"

# ジョブが依存する道具が揃っていないイメージを push しないため、バージョン表示だけでなく版も見る
NODE_VERSION="$(docker run --rm "$IMAGE" node --version)"
echo "node: ${NODE_VERSION}"
if [[ ! "$NODE_VERSION" =~ ^v26\. ]]; then
  echo "::error::Node の版が想定 (v26 系) と違います: ${NODE_VERSION}"
  exit 1
fi
docker run --rm "$IMAGE" aws --version
docker run --rm "$IMAGE" git --version

if [[ "$KIND" == "base" ]]; then
  exit 0
fi

# 依存パッケージの不足は起動してみないと分からないため、実際にブラウザを開く
docker run --rm -e PLAYWRIGHT_VERSION -e KIND="$KIND" "$IMAGE" bash -c '
  set -euo pipefail
  dir="$(mktemp -d)"
  cd "$dir"
  npm init -y >/dev/null
  npm install --no-audit --no-fund "playwright@${PLAYWRIGHT_VERSION}" >/dev/null
  node -e "
    const pw = require(\"playwright\");
    (async () => {
      const browser = await pw[process.env.KIND].launch();
      const page = await browser.newPage();
      await page.goto(\"about:blank\");
      console.log(process.env.KIND + \": \" + browser.version());
      await browser.close();
    })().catch((e) => { console.error(e); process.exit(1); });
  "
'

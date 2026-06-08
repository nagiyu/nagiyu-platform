#!/usr/bin/env bash
#
# Playwright ブラウザを「プロジェクト要求版」で導入する。
#
# 素の `npx playwright install` はベースイメージ同梱の global を呼ぶ罠があるため使わない。
# バージョンはハードコードせず、プロジェクトの @playwright/test から導出する。
# PLAYWRIGHT_BROWSERS_PATH は環境側設定をそのまま尊重する（sudo -E で保持）。
#
# Usage:
#   install.sh [chromium|webkit|firefox ...]   # 省略時は chromium
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BROWSERS=("$@")
if [ ${#BROWSERS[@]} -eq 0 ]; then
  BROWSERS=(chromium)
fi

# @playwright/test のバージョンを導出（ハードコードしない）
VERSION="$(node -e "process.stdout.write(require('./node_modules/@playwright/test/package.json').version)" 2>/dev/null || true)"
if [ -z "${VERSION}" ]; then
  # node_modules 未インストール時は workspace の package.json から拾う
  VERSION="$(grep -rh '"@playwright/test"' --include=package.json services libs 2>/dev/null \
    | head -1 | sed -E 's/.*"@playwright\/test": *"([^"]+)".*/\1/' | tr -d '^~')"
fi
if [ -z "${VERSION}" ]; then
  echo "ERROR: @playwright/test のバージョンを特定できませんでした" >&2
  exit 1
fi

echo "==> playwright@${VERSION} install --with-deps ${BROWSERS[*]}"
sudo -E npx --yes "playwright@${VERSION}" install --with-deps "${BROWSERS[@]}"

echo "✅ Playwright ブラウザ導入完了: ${BROWSERS[*]}"

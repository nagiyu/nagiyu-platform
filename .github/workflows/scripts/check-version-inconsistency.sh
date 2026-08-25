#!/bin/bash
set -euo pipefail

# バージョン不整合を単一行JSONで出力する。
# 「再実行で得られる情報は載せない」方針により、不整合の詳細（使用箇所ごとの
# バージョン一覧）ではなく件数のみを出力する（詳細は作業時に各 package.json を
# 確認すれば得られる）。
#
# 出力契約:
#   {"count":N}
#   - count: 複数バージョンが混在しているパッケージの数
#            （dependencies + devDependencies、ルート含む全 package.json 対象）

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key)|\(.value)"' "$pkg" >> "$TEMP_DIR/all-deps.txt" 2>/dev/null || true
done

if [ -f "$TEMP_DIR/all-deps.txt" ] && [ -s "$TEMP_DIR/all-deps.txt" ]; then
  # 「パッケージ名|バージョン」のペアを重複排除したうえで、パッケージ名が
  # 2回以上出現するもの（= 複数バージョンが混在するもの）を数える
  COUNT=$(sort -u "$TEMP_DIR/all-deps.txt" | cut -d'|' -f1 | sort | uniq -d | wc -l | tr -d ' ')
else
  COUNT=0
fi

printf '{"count":%d}\n' "$COUNT"

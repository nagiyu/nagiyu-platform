#!/bin/bash
set -euo pipefail

# 重複 devDependencies を単一行JSONで出力する。
# 「再実行で得られる情報は載せない」方針により、詳細な使用箇所ではなく
# 件数のみを出力する（詳細は作業時に各 package.json を確認すれば得られる）。
#
# 出力契約:
#   {"count":N}
#   - count: ルート以外の package.json で 3箇所以上使用されている
#            devDependencies パッケージの数

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  DIR=$(dirname "$pkg")
  jq -r '.devDependencies // {} | keys[] | "\(.)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/dev-deps.txt" 2>/dev/null || true
done

if [ -f "$TEMP_DIR/dev-deps.txt" ] && [ -s "$TEMP_DIR/dev-deps.txt" ]; then
  # ルートの package.json（location が "."）を除外し、3箇所以上で使用されている
  # パッケージ名の数を数える
  COUNT=$(grep -v '|\.$' "$TEMP_DIR/dev-deps.txt" | cut -d'|' -f1 | sort | uniq -c | awk '$1 >= 3' | wc -l | tr -d ' ')
else
  COUNT=0
fi

printf '{"count":%d}\n' "$COUNT"

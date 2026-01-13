#!/bin/bash
set -euo pipefail

echo "## バージョン不整合検出"
echo ""

TEMP_DIR=$(mktemp -d)

# 全package.jsonから依存関係を抽出
find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  DIR=$(dirname "$pkg")

  # 全依存関係を抽出
  jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/all-deps.txt" 2>/dev/null || true
done

if [ -f "$TEMP_DIR/all-deps.txt" ] && [ -s "$TEMP_DIR/all-deps.txt" ]; then
  # 一時ファイルに出力を保存
  TEMP_OUTPUT="$TEMP_DIR/output.txt"
  > "$TEMP_OUTPUT"
  
  INCONSISTENCY_FOUND=false
  
  # パッケージごとにバージョンをグループ化
  cut -d'|' -f1 "$TEMP_DIR/all-deps.txt" | sort -u | while read -r pkg; do
    VERSIONS=$(grep "^${pkg}|" "$TEMP_DIR/all-deps.txt" | cut -d'|' -f2 | sort -u)
    VERSION_COUNT=$(echo "$VERSIONS" | wc -l)

    # 2つ以上のバージョンがある場合のみ表示
    if [ "$VERSION_COUNT" -gt 1 ]; then
      if [ ! -s "$TEMP_OUTPUT" ]; then
        {
          echo "以下のパッケージで異なるバージョンが使用されています。"
          echo "バージョンを統一することを推奨します。"
          echo ""
          echo "| パッケージ | バージョン | 使用箇所 |"
          echo "|----------|----------|---------|"
        } >> "$TEMP_OUTPUT"
      fi
      
      echo "| **$pkg** | | |" >> "$TEMP_OUTPUT"
      grep "^${pkg}|" "$TEMP_DIR/all-deps.txt" | while IFS='|' read -r name ver loc; do
        echo "| | \`$ver\` | \`$loc\` |" >> "$TEMP_OUTPUT"
      done
    fi
  done
  
  # 出力内容を表示
  if [ -s "$TEMP_OUTPUT" ]; then
    cat "$TEMP_OUTPUT"
    echo ""
    echo "**推奨アクション**: バージョンを統一する場合は以下のコマンドを使用してください（ルートから実行）。"
    echo ""
    echo '```bash'
    echo "# 特定パッケージのバージョンを統一"
    echo "# 例: @testing-library/react を 16.3.1 に統一"
    echo "npm install --workspace @nagiyu/auth-web @testing-library/react@16.3.1"
    echo "npm install --workspace @nagiyu/admin @testing-library/react@16.3.1"
    echo '```'
  else
    echo "✅ バージョン不整合は検出されませんでした。"
  fi
else
  echo "✅ バージョン不整合は検出されませんでした。"
fi

rm -rf "$TEMP_DIR"

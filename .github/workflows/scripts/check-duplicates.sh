#!/bin/bash
set -euo pipefail

echo "## 重複パッケージ検出"
echo ""

# 全package.jsonから依存関係を抽出
TEMP_DIR=$(mktemp -d)

find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  DIR=$(dirname "$pkg")

  # devDependencies を抽出
  jq -r '.devDependencies // {} | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/dev-deps.txt" 2>/dev/null || true

  # dependencies を抽出
  jq -r '.dependencies // {} | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/deps.txt" 2>/dev/null || true
done

# devDependencies の重複をカウント
echo "### devDependencies の重複（ルート統合推奨）"
echo ""

if [ -f "$TEMP_DIR/dev-deps.txt" ] && [ -s "$TEMP_DIR/dev-deps.txt" ]; then
  # 一時ファイルに出力を保存
  TEMP_OUTPUT="$TEMP_DIR/output.txt"
  > "$TEMP_OUTPUT"
  
  # ルートのpackage.jsonを除外してカウント
  grep -v "|\\.\\?/package\\.json$" "$TEMP_DIR/dev-deps.txt" | cut -d'|' -f1 | sort | uniq -c | sort -rn | while read -r count pkg; do
    if [ "$count" -ge 3 ]; then
      if [ ! -s "$TEMP_OUTPUT" ]; then
        {
          echo "以下のdevDependenciesは3箇所以上のワークスペースで使用されています。"
          echo "ルートのpackage.jsonに移行することで管理が簡素化されます。"
          echo ""
        } >> "$TEMP_OUTPUT"
      fi
      
      echo "- **$pkg**: ${count}箇所で使用" >> "$TEMP_OUTPUT"
      
      # 各使用箇所を表示
      grep "^${pkg}|" "$TEMP_DIR/dev-deps.txt" | while IFS='|' read -r name version location; do
        echo "  - \`${version}\` in \`${location}\`" >> "$TEMP_OUTPUT"
      done
      echo "" >> "$TEMP_OUTPUT"
    fi
  done
  
  # 出力内容を表示
  if [ -s "$TEMP_OUTPUT" ]; then
    cat "$TEMP_OUTPUT"
    echo ""
    echo "**推奨アクション**: 重複パッケージをルートに統合する場合は以下のコマンドを使用してください。"
    echo ""
    echo '```bash'
    echo "# ルートのpackage.jsonに追加"
    echo "npm install --save-dev {PACKAGE_NAME}@{VERSION}"
    echo ""
    echo "# 各ワークスペースから削除（ルートから実行）"
    echo "npm uninstall --workspace {WORKSPACE_NAME} {PACKAGE_NAME}"
    echo '```'
  else
    echo "✅ 3箇所以上で重複しているdevDependenciesは検出されませんでした。"
  fi
else
  echo "✅ 3箇所以上で重複しているdevDependenciesは検出されませんでした。"
fi

rm -rf "$TEMP_DIR"

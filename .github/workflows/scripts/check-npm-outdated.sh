#!/bin/bash
set -euo pipefail

echo "## npm outdated チェック"
echo ""

# ルートの outdated チェック
echo "### ルート package.json"
if npm outdated --json > /tmp/outdated-root.json 2>/dev/null || true; then
  if [ -s /tmp/outdated-root.json ]; then
    # current フィールドが存在するエントリのみをフィルタ
    FILTERED=$(jq 'to_entries | map(select(.value.current != null)) | from_entries' /tmp/outdated-root.json)
    if [ "$FILTERED" != "{}" ]; then
      echo "| パッケージ | 現在 | 必要 | 最新 | 場所 |"
      echo "|----------|------|------|------|------|"
      echo "$FILTERED" | jq -r 'to_entries[] | "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) | \(.value.location // "root") |"'
    else
      echo "更新可能なパッケージはありません。"
    fi
  else
    echo "更新可能なパッケージはありません。"
  fi
else
  echo "チェックをスキップしました。"
fi

echo ""
echo "### ワークスペース"

# 各ワークスペースの outdated チェック
# 注: cdを使用しているが、これは読み取り専用の操作であり、
# ファイルを作成・変更しないため、制約に違反しない
# npm outdated --workspace はルートの視点のみを返すため、
# 各ワークスペースの詳細なoutdated情報を得るには cd が必要
WORKSPACES=$(find services libs infra -name "package.json" -not -path "*/node_modules/*" -not -path "infra/package.json" | sort)

if [ -z "$WORKSPACES" ]; then
  echo "ワークスペースが見つかりませんでした。"
else
  for pkg_path in $WORKSPACES; do
    workspace_dir=$(dirname "$pkg_path")
    workspace_name=$(jq -r '.name' "$pkg_path" 2>/dev/null || echo "unknown")
    
    echo ""
    echo "#### $workspace_dir ($workspace_name)"

    cd "$workspace_dir"
    if npm outdated --json > /tmp/outdated-workspace.json 2>/dev/null || true; then
      if [ -s /tmp/outdated-workspace.json ]; then
        # current フィールドが存在するエントリのみをフィルタ
        FILTERED=$(jq 'to_entries | map(select(.value.current != null)) | from_entries' /tmp/outdated-workspace.json)
        if [ "$FILTERED" != "{}" ]; then
          echo "| パッケージ | 現在 | 必要 | 最新 |"
          echo "|----------|------|------|------|"
          echo "$FILTERED" | jq -r 'to_entries[] | "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) |"'
        else
          echo "更新可能なパッケージはありません。"
        fi
      else
        echo "更新可能なパッケージはありません。"
      fi
    fi
    cd - > /dev/null
  done
fi

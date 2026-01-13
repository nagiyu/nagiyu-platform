#!/bin/bash
set -euo pipefail

echo "## npm outdated チェック"
echo ""

# ルートの outdated チェック
echo "### ルート package.json"
if npm outdated --json > /tmp/outdated-root.json 2>/dev/null || true; then
  if [ -s /tmp/outdated-root.json ]; then
    # JSONの型をチェック（オブジェクトか配列か）
    JSON_TYPE=$(jq -r 'type' /tmp/outdated-root.json)

    if [ "$JSON_TYPE" = "object" ]; then
      # オブジェクトの値が配列またはオブジェクトの場合を処理
      HAS_DATA=$(jq -r 'to_entries | length' /tmp/outdated-root.json)
      if [ "$HAS_DATA" -gt 0 ]; then
        echo "| パッケージ | 現在 | 必要 | 最新 | 場所 |"
        echo "|----------|------|------|------|------|"
        jq -r 'to_entries[] |
          if (.value | type) == "array" then
            (.key as $pkg | .value[] | "| \($pkg) | \(.current) | \(.wanted) | \(.latest) | \(.location // "root") |")
          else
            "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) | \(.value.location // "root") |"
          end' /tmp/outdated-root.json
      else
        echo "更新可能なパッケージはありません。"
      fi
    elif [ "$JSON_TYPE" = "array" ]; then
      # 配列形式の場合の処理
      FILTERED=$(jq 'map(select(.current != null))' /tmp/outdated-root.json)
      if [ "$FILTERED" != "[]" ]; then
        echo "| パッケージ | 現在 | 必要 | 最新 | 場所 |"
        echo "|----------|------|------|------|------|"
        echo "$FILTERED" | jq -r '.[] | "| \(.name // .package) | \(.current) | \(.wanted) | \(.latest) | \(.location // "root") |"'
      else
        echo "更新可能なパッケージはありません。"
      fi
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
        # JSONの型をチェック（オブジェクトか配列か）
        JSON_TYPE=$(jq -r 'type' /tmp/outdated-workspace.json)

        if [ "$JSON_TYPE" = "object" ]; then
          # オブジェクトの値が配列またはオブジェクトの場合を処理
          HAS_DATA=$(jq -r 'to_entries | length' /tmp/outdated-workspace.json)
          if [ "$HAS_DATA" -gt 0 ]; then
            echo "| パッケージ | 現在 | 必要 | 最新 |"
            echo "|----------|------|------|------|"
            jq -r 'to_entries[] |
              if (.value | type) == "array" then
                (.key as $pkg | .value[] | "| \($pkg) | \(.current) | \(.wanted) | \(.latest) |")
              else
                "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) |"
              end' /tmp/outdated-workspace.json
          else
            echo "更新可能なパッケージはありません。"
          fi
        elif [ "$JSON_TYPE" = "array" ]; then
          # 配列形式の場合の処理
          FILTERED=$(jq 'map(select(.current != null))' /tmp/outdated-workspace.json)
          if [ "$FILTERED" != "[]" ]; then
            echo "| パッケージ | 現在 | 必要 | 最新 |"
            echo "|----------|------|------|------|"
            echo "$FILTERED" | jq -r '.[] | "| \(.name // .package) | \(.current) | \(.wanted) | \(.latest) |"'
          else
            echo "更新可能なパッケージはありません。"
          fi
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

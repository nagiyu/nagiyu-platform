#!/bin/bash
set -euo pipefail

# 週次npm管理レポート Issue の本文を生成するスクリプト
#
# 環境変数:
#   OUTDATED - npm outdated のチェック結果
#   AUDIT - npm audit のチェック結果
#   NEXT_DATE - 次回チェック予定日

# 環境変数から読み込み（未設定の場合はデフォルト値）
OUTDATED="${OUTDATED:-}"
AUDIT="${AUDIT:-}"
NEXT_DATE="${NEXT_DATE:-未定}"

# テンプレートを読み込み
TEMPLATE=$(cat .github/workflows/templates/weekly-npm-body.md)

CREATE_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")

# 変数を置換（単一行の変数）
BODY=$(echo "$TEMPLATE" | \
  sed "s|{{NEXT_DATE}}|${NEXT_DATE}|g" | \
  sed "s|{{CREATE_TIME}}|${CREATE_TIME}|g")

# 複数行のセクションを置換
BODY=$(echo "$BODY" | awk -v audit="$AUDIT" '{gsub(/{{AUDIT}}/, audit)}1')
BODY=$(echo "$BODY" | awk -v outdated="$OUTDATED" '{gsub(/{{OUTDATED}}/, outdated)}1')

# 出力
echo "$BODY"

#!/bin/bash
set -euo pipefail

# 週次ドキュメントレビュー Issue の本文を生成するスクリプト
#
# 引数:
#   $1: UPDATED_DOCS - 過去1週間で更新されたドキュメント数
#   $2: PREV_ISSUE - 前回のレビュー Issue 番号
#   $3: NEXT_DATE - 次回レビュー予定日
#   $4: HAS_POLICY_CHANGES - 方針変更の有無 (true/false)
#   $5: POLICY_CHANGES - 方針変更の内容（複数行）

UPDATED_DOCS="$1"
PREV_ISSUE="$2"
NEXT_DATE="$3"
HAS_POLICY_CHANGES="$4"
POLICY_CHANGES="$5"

# テンプレートを読み込み
TEMPLATE=$(cat .github/workflows/templates/weekly-review-body.md)

# 方針変更セクションを生成
if [ "$HAS_POLICY_CHANGES" == "true" ]; then
  POLICY_SECTION="過去1週間で \`docs/development/\` に以下の変更が検出されました:

\`\`\`
${POLICY_CHANGES}
\`\`\`

⚠️ **方針変更が含まれる場合、Priority 4 の「14. 方針変更の追従漏れチェック」を必ず実施してください。**"
  POLICY_WARNING="（⚠️ 変更が検出されています）"
else
  POLICY_SECTION="変更なし"
  POLICY_WARNING=""
fi

CREATE_TIME=$(date -u +"%Y-%m-%d %H:%M UTC")

# 変数を置換（単一行の変数）
BODY=$(echo "$TEMPLATE" | \
  sed "s|{{UPDATED_DOCS}}|${UPDATED_DOCS}|g" | \
  sed "s|{{PREV_ISSUE}}|${PREV_ISSUE}|g" | \
  sed "s|{{NEXT_DATE}}|${NEXT_DATE}|g" | \
  sed "s|{{POLICY_WARNING}}|${POLICY_WARNING}|g" | \
  sed "s|{{CREATE_TIME}}|${CREATE_TIME}|g")

# 方針変更セクションを置換（複数行対応）
BODY=$(echo "$BODY" | awk -v section="$POLICY_SECTION" '{gsub(/{{POLICY_CHANGES_SECTION}}/, section)}1')

# 出力
echo "$BODY"

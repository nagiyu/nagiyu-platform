#!/bin/bash
set -euo pipefail

# 週次ドキュメントレビュー Issue の本文を生成するスクリプト
#
# 環境変数:
#   UPDATED_DOCS - 過去1週間で更新されたドキュメント数
#   PREV_ISSUE - 前回のレビュー Issue 番号
#   NEXT_DATE - 次回レビュー予定日
#   HAS_POLICY_CHANGES - 方針変更の有無 (true/false)
#   POLICY_CHANGES - 方針変更の内容（複数行）
#   CREATE_TIME - 作成日時 (未指定時は現在 JST 時刻)

# 環境変数から読み込み（未設定の場合はデフォルト値）
UPDATED_DOCS="${UPDATED_DOCS:-0}"
PREV_ISSUE="${PREV_ISSUE:-なし}"
NEXT_DATE="${NEXT_DATE:-未定}"
HAS_POLICY_CHANGES="${HAS_POLICY_CHANGES:-false}"
POLICY_CHANGES="${POLICY_CHANGES:-}"
CREATE_TIME="${CREATE_TIME:-$(TZ=Asia/Tokyo date +"%Y-%m-%d %H:%M JST")}"

TEMPLATE_PATH=.github/workflows/templates/weekly-review-body.md

if [ "$HAS_POLICY_CHANGES" == "true" ]; then
  POLICY_WARNING="（⚠️ 変更が検出されています）"
else
  POLICY_WARNING=""
fi

# 方針変更セクションを出力する。コミット件名には任意の文字が入るため、
# 置換の対象にせず printf '%s' でそのまま出力する
print_policy_section() {
  if [ "$HAS_POLICY_CHANGES" == "true" ]; then
    printf '%s\n' "過去1週間で \`docs/development/\` に以下の変更が検出されました:" ""
    printf '%s\n' '```'
    printf '%s\n' "$POLICY_CHANGES"
    printf '%s\n' '```' ""
    printf '%s\n' "⚠️ **方針変更が含まれる場合、Priority 4 の「14. 方針変更の追従漏れチェック」を必ず実施してください。**"
  else
    printf '%s\n' "変更なし"
  fi
}

# 複数行の節は行単位で差し込む (置換では件名中の & や \ が解釈されるため)
while IFS= read -r line || [ -n "$line" ]; do
  if [ "$line" == "{{POLICY_CHANGES_SECTION}}" ]; then
    print_policy_section
  else
    line="${line//\{\{UPDATED_DOCS\}\}/$UPDATED_DOCS}"
    line="${line//\{\{PREV_ISSUE\}\}/$PREV_ISSUE}"
    line="${line//\{\{NEXT_DATE\}\}/$NEXT_DATE}"
    line="${line//\{\{POLICY_WARNING\}\}/$POLICY_WARNING}"
    line="${line//\{\{CREATE_TIME\}\}/$CREATE_TIME}"
    printf '%s\n' "$line"
  fi
done < "$TEMPLATE_PATH"

#!/bin/bash
set -euo pipefail

# 週次の探索的テスト Issue の本文を生成するスクリプト
#
# 環境変数:
#   NEXT_DATE   - 次回作成予定日
#   CREATE_TIME - 作成日時 (未指定時は現在 JST 時刻)

NEXT_DATE="${NEXT_DATE:-未定}"
CREATE_TIME="${CREATE_TIME:-$(TZ=Asia/Tokyo date +"%Y-%m-%d %H:%M JST")}"

TEMPLATE=$(cat .github/workflows/templates/weekly-exploratory-test-body.md)

BODY=$(echo "$TEMPLATE" | \
  sed "s|{{NEXT_DATE}}|${NEXT_DATE}|g" | \
  sed "s|{{CREATE_TIME}}|${CREATE_TIME}|g")

echo "$BODY"

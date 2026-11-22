#!/bin/bash
set -euo pipefail

# テンプレートの {{NEXT_DATE}} と {{CREATE_TIME}} を置換して Issue 本文を生成するスクリプト
#
# 引数:
#   $1 - テンプレートファイルのパス
#
# 環境変数:
#   NEXT_DATE   - 次回作成予定日
#   CREATE_TIME - 作成日時 (未指定時は現在 JST 時刻)

TEMPLATE_PATH="${1:?テンプレートファイルのパスを指定してください}"

NEXT_DATE="${NEXT_DATE:-未定}"
CREATE_TIME="${CREATE_TIME:-$(TZ=Asia/Tokyo date +"%Y-%m-%d %H:%M JST")}"

TEMPLATE=$(cat "$TEMPLATE_PATH")

BODY=$(echo "$TEMPLATE" | \
  sed "s|{{NEXT_DATE}}|${NEXT_DATE}|g" | \
  sed "s|{{CREATE_TIME}}|${CREATE_TIME}|g")

echo "$BODY"

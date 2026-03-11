#!/bin/bash
set -euo pipefail

# 日次リファクタリング Issue の本文を生成するスクリプト
#
# 環境変数:
#   SERVICE_LIST - 調査対象サービス・ライブラリ一覧（複数行）
#   NEXT_DATE - 次回作成予定日
#   CREATE_TIME - 作成日時（未指定時は現在UTC時刻）

SERVICE_LIST="${SERVICE_LIST:-（対象なし）}"
NEXT_DATE="${NEXT_DATE:-未定}"
CREATE_TIME="${CREATE_TIME:-$(date -u +"%Y-%m-%d %H:%M UTC")}"

TEMPLATE=$(cat .github/workflows/templates/daily-refactoring-body.md)

BODY=$(echo "$TEMPLATE" | \
  sed "s|{{NEXT_DATE}}|${NEXT_DATE}|g" | \
  sed "s|{{CREATE_TIME}}|${CREATE_TIME}|g")

BODY=$(echo "$BODY" | awk -v list="$SERVICE_LIST" '{gsub(/{{SERVICE_LIST}}/, list)}1')

echo "$BODY"

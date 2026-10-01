#!/bin/bash
set -euo pipefail

# Stock Tracker 確度の定期点検 Issue の本文を生成するスクリプト
#
# 環境変数:
#   INCLUDE_MKT - Q-MKT の節を含めるか (true/false。未指定は false)
#   CREATE_TIME - 作成日時 (未指定時は現在 UTC 時刻)

INCLUDE_MKT="${INCLUDE_MKT:-false}"
CREATE_TIME="${CREATE_TIME:-$(date -u +"%Y-%m-%d %H:%M UTC")}"

TEMPLATE_DIR=.github/workflows/templates

if [ "$INCLUDE_MKT" == "true" ]; then
  TARGETS="Q-DIR・Q-VOL・Q-MKT (四半期点検)"
  MKT_SECTION_FILE="$TEMPLATE_DIR/stock-tracker-inspection-mkt-section.md"
else
  TARGETS="Q-DIR・Q-VOL"
  MKT_SECTION_FILE="$TEMPLATE_DIR/stock-tracker-inspection-no-mkt-section.md"
fi

# 複数行の節は行単位で差し込む (sed の置換では複数行を扱いにくいため)
while IFS= read -r line || [ -n "$line" ]; do
  if [ "$line" == "{{MKT_SECTION}}" ]; then
    cat "$MKT_SECTION_FILE"
  else
    line="${line//\{\{CREATE_TIME\}\}/$CREATE_TIME}"
    line="${line//\{\{TARGETS\}\}/$TARGETS}"
    printf '%s\n' "$line"
  fi
done < "$TEMPLATE_DIR/stock-tracker-inspection-body.md"

#!/usr/bin/env bash
# CloudFormation スタックの出力値を取得して step の出力 value に書く。
#
# 環境変数:
#   GET_STACK_OUTPUT_STACK_NAME (必須) スタック名
#   GET_STACK_OUTPUT_KEY        (必須) OutputKey
#   GET_STACK_OUTPUT_REGION     リージョン (既定 us-east-1)
set -euo pipefail

STACK_NAME="${GET_STACK_OUTPUT_STACK_NAME:-}"
OUTPUT_KEY="${GET_STACK_OUTPUT_KEY:-}"
REGION="${GET_STACK_OUTPUT_REGION:-us-east-1}"

if [ -z "$STACK_NAME" ] || [ -z "$OUTPUT_KEY" ]; then
  echo "::error::stack-name と output-key は必須です (stack-name='$STACK_NAME', output-key='$OUTPUT_KEY')"
  exit 1
fi

# aws の失敗 (スタックが無い・権限不足など) は握らず、そのまま失敗させる。
# 失敗を空文字に変えると、後続が欠落した値で動いて原因が分かりにくくなる
VALUE=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='${OUTPUT_KEY}'].OutputValue" \
  --output text \
  --region "$REGION")

# キーが無いとき --output text は None を返す。空や None のまま渡すと後続で欠落を検出できない
if [ -z "$VALUE" ] || [ "$VALUE" = "None" ]; then
  echo "::error::スタック $STACK_NAME に出力 $OUTPUT_KEY が見つからないか、値が空です"
  exit 1
fi

echo "value=$VALUE" >> "${GITHUB_OUTPUT:-/dev/null}"
echo "スタック出力 $STACK_NAME / $OUTPUT_KEY: $VALUE"

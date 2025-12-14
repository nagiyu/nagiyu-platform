#!/bin/bash
set -euo pipefail

# エントリポイントスクリプト
# AWS Batch ワーカーコンテナで動画変換処理を実行

echo "=== Codec Converter Worker Starting ==="

# 環境変数の検証
: "${JOB_ID:?Environment variable JOB_ID is required}"
: "${OUTPUT_CODEC:?Environment variable OUTPUT_CODEC is required}"
: "${S3_BUCKET:?Environment variable S3_BUCKET is required}"
: "${DYNAMODB_TABLE:?Environment variable DYNAMODB_TABLE is required}"
: "${AWS_REGION:?Environment variable AWS_REGION is required}"

echo "Job ID: ${JOB_ID}"
echo "Output Codec: ${OUTPUT_CODEC}"
echo "S3 Bucket: ${S3_BUCKET}"
echo "DynamoDB Table: ${DYNAMODB_TABLE}"
echo "AWS Region: ${AWS_REGION}"

# FFmpeg のバージョンを確認
echo "=== FFmpeg Version ==="
ffmpeg -version | head -n 1

# Node.js ワーカースクリプトを実行
echo "=== Starting Worker Process ==="
exec node /app/dist/index.js

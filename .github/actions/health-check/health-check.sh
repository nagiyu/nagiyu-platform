#!/usr/bin/env bash
# デプロイ後のヘルスチェック。URL が 200 を返すまで再試行し、尽きたら失敗する。
#
# 環境変数:
#   HEALTH_CHECK_BASE_URL         (必須) ベース URL。末尾の / の有無は問わない
#   HEALTH_CHECK_PATH             パス (既定 /api/health)
#   HEALTH_CHECK_MAX_ATTEMPTS     最大試行回数 (既定 10)
#   HEALTH_CHECK_INTERVAL_SECONDS 再試行の間隔 (秒, 既定 10)
set -euo pipefail

BASE_URL="${HEALTH_CHECK_BASE_URL:-}"
PATH_SUFFIX="${HEALTH_CHECK_PATH:-/api/health}"
MAX_ATTEMPTS="${HEALTH_CHECK_MAX_ATTEMPTS:-10}"
INTERVAL_SECONDS="${HEALTH_CHECK_INTERVAL_SECONDS:-10}"
# 応答の無い接続で試行が無期限に止まらないよう、1 回あたりの上限を設ける
CURL_MAX_TIME_SECONDS="${HEALTH_CHECK_CURL_MAX_TIME_SECONDS:-30}"

# URL が取れないことを成功扱いにすると、確認していないのに deploy が成功してしまう
if [ -z "$BASE_URL" ]; then
  echo "::error::ヘルスチェックの対象 URL が空です。URL の取得に失敗している可能性があります"
  exit 1
fi

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::max-attempts は 1 以上の整数で指定してください: $MAX_ATTEMPTS"
  exit 1
fi

if ! [[ "$INTERVAL_SECONDS" =~ ^[0-9]+$ ]]; then
  echo "::error::interval-seconds は 0 以上の整数で指定してください: $INTERVAL_SECONDS"
  exit 1
fi

# Function URL は末尾に / が付き、CloudFront ドメインや ALB は付かないため、両方を同じ形に正規化する
URL="${BASE_URL%/}/${PATH_SUFFIX#/}"

echo "ヘルスチェックを開始します: $URL (最大 ${MAX_ATTEMPTS} 回, 間隔 ${INTERVAL_SECONDS} 秒)"

LAST_STATUS="000"
for ((ATTEMPT = 1; ATTEMPT <= MAX_ATTEMPTS; ATTEMPT++)); do
  # 接続失敗時も curl は 000 を出力するため、-w の結果をそのまま採用する
  LAST_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time "$CURL_MAX_TIME_SECONDS" "$URL" || true)"
  LAST_STATUS="${LAST_STATUS:-000}"

  if [ "$LAST_STATUS" = "200" ]; then
    echo "ヘルスチェックに成功しました (${ATTEMPT} 回目): $URL"
    exit 0
  fi

  echo "ヘルスチェック ${ATTEMPT}/${MAX_ATTEMPTS} 回目: HTTP ${LAST_STATUS} (コールドスタート中の可能性があります)"

  if [ "$ATTEMPT" -lt "$MAX_ATTEMPTS" ]; then
    sleep "$INTERVAL_SECONDS"
  fi
done

echo "::error::ヘルスチェックに失敗しました: $URL が ${MAX_ATTEMPTS} 回の確認で 200 を返しませんでした (最後のステータス: ${LAST_STATUS})"
exit 1

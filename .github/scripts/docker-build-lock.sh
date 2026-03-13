#!/usr/bin/env bash
set -euo pipefail

readonly LOCK_BUCKET="nagiyu-docker-build-lock"
readonly LOCK_PREFIX="locks"
readonly LOCK_LIMIT=3
readonly POLL_INTERVAL_SECONDS=30
readonly ERROR_MESSAGE_INVALID_LOCK_COUNT="Docker ビルドロックの取得に失敗しました: ロック数が不正です"
readonly ERROR_MESSAGE_USAGE="使用方法: $0 <acquire|release>"

readonly WORKFLOW_NAME="${GITHUB_WORKFLOW:?GITHUB_WORKFLOW is required}"
readonly RUN_ID="${GITHUB_RUN_ID:?GITHUB_RUN_ID is required}"
readonly JOB_NAME="${GITHUB_JOB:?GITHUB_JOB is required}"
readonly LOCK_KEY="${WORKFLOW_NAME}/${RUN_ID}/${JOB_NAME}"
readonly LOCK_OBJECT_KEY="${LOCK_PREFIX}/${LOCK_KEY}"

function get_lock_count() {
  aws s3api list-objects-v2 \
    --bucket "${LOCK_BUCKET}" \
    --prefix "${LOCK_PREFIX}/" \
    --query 'length(Contents || `[]`)' \
    --output text
}

function acquire_lock() {
  while true; do
    local lock_count
    lock_count="$(get_lock_count)"
    if [[ ! "${lock_count}" =~ ^[0-9]+$ ]]; then
      echo "${ERROR_MESSAGE_INVALID_LOCK_COUNT} (${lock_count})" >&2
      return 1
    fi

    if (( lock_count < LOCK_LIMIT )); then
      local payload_file
      payload_file="$(mktemp)"

      local timestamp
      timestamp="$(date +%s)"
      printf '{"workflow":"%s","run_id":"%s","job":"%s","timestamp":%s}\n' \
        "${WORKFLOW_NAME}" \
        "${RUN_ID}" \
        "${JOB_NAME}" \
        "${timestamp}" >"${payload_file}"

      local put_status=0
      aws s3api put-object \
        --bucket "${LOCK_BUCKET}" \
        --key "${LOCK_OBJECT_KEY}" \
        --body "${payload_file}" >/dev/null || put_status=$?
      rm -f "${payload_file}"

      if (( put_status != 0 )); then
        return "${put_status}"
      fi

      echo "Docker build lock acquired: ${LOCK_OBJECT_KEY} (取得前: ${lock_count}/${LOCK_LIMIT})"
      return 0
    fi

    echo "Docker build lock is full (${lock_count}/${LOCK_LIMIT}). Waiting ${POLL_INTERVAL_SECONDS} seconds..."
    sleep "${POLL_INTERVAL_SECONDS}"
  done
}

function release_lock() {
  aws s3api delete-object \
    --bucket "${LOCK_BUCKET}" \
    --key "${LOCK_OBJECT_KEY}" >/dev/null

  echo "Docker build lock released: ${LOCK_OBJECT_KEY}"
}

readonly command="${1:-}"

case "${command}" in
acquire)
  acquire_lock
  ;;
release)
  release_lock
  ;;
*)
  echo "${ERROR_MESSAGE_USAGE}" >&2
  exit 1
  ;;
esac

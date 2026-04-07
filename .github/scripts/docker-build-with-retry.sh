#!/usr/bin/env bash
set -euo pipefail

readonly MAX_RETRIES="${DOCKER_BUILD_MAX_RETRIES:-5}"
readonly RETRY_WAIT_SECONDS="${DOCKER_BUILD_RETRY_WAIT_SECONDS:-60}"
readonly RATE_LIMIT_MESSAGE="toomanyrequests"
readonly ERROR_MESSAGE_MAX_RETRY_EXCEEDED="最大リトライ回数を超えました。"
readonly ERROR_MESSAGE_USAGE="使用方法: $0 <image-tag> <dockerfile>"

readonly IMAGE_TAG="${1:-}"
readonly DOCKERFILE="${2:-}"

if [ -z "${IMAGE_TAG}" ] || [ -z "${DOCKERFILE}" ]; then
  echo "${ERROR_MESSAGE_USAGE}" >&2
  exit 1
fi

stderr_file=""
cleanup_stderr_file() {
  if [ -n "${stderr_file}" ] && [ -f "${stderr_file}" ]; then
    rm -f "${stderr_file}"
  fi
}
trap cleanup_stderr_file EXIT

retry_count=0
while true; do
  stderr_file="$(mktemp "${RUNNER_TEMP:-/tmp}/docker-build-stderr.XXXXXX")"
  build_status=0

  build_args_flags=()
  if [ -n "${DOCKER_BUILD_ARGS:-}" ]; then
    while IFS= read -r arg || [ -n "${arg}" ]; do
      [ -n "${arg}" ] && build_args_flags+=(--build-arg "${arg}")
    done <<< "${DOCKER_BUILD_ARGS}"
  fi

  docker build ${build_args_flags:+"${build_args_flags[@]}"} -t "${IMAGE_TAG}" -f "${DOCKERFILE}" . \
    2>"${stderr_file}" || build_status=$?

  if [ "${build_status}" -eq 0 ]; then
    cleanup_stderr_file
    break
  fi

  if [ -f "${stderr_file}" ]; then
    cat "${stderr_file}" >&2
  fi

  is_rate_limited=false
  if [ -f "${stderr_file}" ] && grep -q "${RATE_LIMIT_MESSAGE}" "${stderr_file}"; then
    is_rate_limited=true
  fi

  cleanup_stderr_file

  if [ "${is_rate_limited}" = true ] && [ "${retry_count}" -lt "${MAX_RETRIES}" ]; then
    retry_count=$((retry_count + 1))
    echo "[retry ${retry_count}/${MAX_RETRIES}] Public ECR のレート制限（${RATE_LIMIT_MESSAGE}）を検知。${RETRY_WAIT_SECONDS} 秒待機してリトライします..."
    sleep "${RETRY_WAIT_SECONDS}"
    continue
  fi

  if [ "${is_rate_limited}" = true ]; then
    echo "[error] ${ERROR_MESSAGE_MAX_RETRY_EXCEEDED}（${MAX_RETRIES} 回）" >&2
  fi

  exit "${build_status}"
done

#!/bin/bash
set -euo pipefail

# npm audit の結果を単一行JSONで出力する。
# 「再実行で得られる情報は載せない」方針により、生の脆弱性データではなく
# 件数とパッケージ名のみを出力する（詳細は作業時に `npm audit` を叩けば得られる）。
#
# 出力契約:
#   {"critical":N,"high":N,"moderate":N,"low":N,"criticalPackages":[...],"highPackages":[...]}
#
# テスト用: 環境変数 NPM_AUDIT_JSON_FILE に `npm audit --json` 相当のJSONファイルパスを
# 指定すると、実際に npm audit を実行せずそのファイルを入力として集計する
# （node_modules が無い環境でも集計ロジックを検証できるようにするため）。

AUDIT_JSON_FILE="${NPM_AUDIT_JSON_FILE:-}"

if [ -z "$AUDIT_JSON_FILE" ]; then
  AUDIT_JSON_FILE=$(mktemp)
  npm audit --json > "$AUDIT_JSON_FILE" 2>/dev/null || true
fi

if [ ! -s "$AUDIT_JSON_FILE" ]; then
  echo '{"critical":0,"high":0,"moderate":0,"low":0,"criticalPackages":[],"highPackages":[]}'
  exit 0
fi

jq -c '{
  critical: (.metadata.vulnerabilities.critical // 0),
  high: (.metadata.vulnerabilities.high // 0),
  moderate: (.metadata.vulnerabilities.moderate // 0),
  low: (.metadata.vulnerabilities.low // 0),
  criticalPackages: ([(.vulnerabilities // {}) | to_entries[] | select(.value.severity == "critical") | .key] | sort),
  highPackages: ([(.vulnerabilities // {}) | to_entries[] | select(.value.severity == "high") | .key] | sort)
}' "$AUDIT_JSON_FILE"

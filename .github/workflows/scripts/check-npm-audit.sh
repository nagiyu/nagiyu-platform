#!/bin/bash
set -euo pipefail

echo "## セキュリティ脆弱性チェック (npm audit)"
echo ""

# npm audit の実行
if npm audit --json > /tmp/audit.json 2>/dev/null || true; then
  CRITICAL=$(jq '.metadata.vulnerabilities.critical // 0' /tmp/audit.json)
  HIGH=$(jq '.metadata.vulnerabilities.high // 0' /tmp/audit.json)
  MODERATE=$(jq '.metadata.vulnerabilities.moderate // 0' /tmp/audit.json)
  LOW=$(jq '.metadata.vulnerabilities.low // 0' /tmp/audit.json)

  echo "### サマリー"
  echo "- **Critical**: $CRITICAL"
  echo "- **High**: $HIGH"
  echo "- **Moderate**: $MODERATE"
  echo "- **Low**: $LOW"
  echo ""

  if [ "$CRITICAL" -gt 0 ] || [ "$HIGH" -gt 0 ]; then
    echo "### ⚠️ 緊急対応が必要な脆弱性"
    echo ""
    echo "<details>"
    echo "<summary>詳細を表示</summary>"
    echo ""
    echo '```json'
    jq '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high")' /tmp/audit.json
    echo '```'
    echo ""
    echo "</details>"
  else
    echo "✅ Critical/Highの脆弱性は検出されませんでした。"
  fi
else
  echo "npm audit の実行に失敗しました。"
fi

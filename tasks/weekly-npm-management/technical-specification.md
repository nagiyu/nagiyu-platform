# 週次npm管理 - 技術仕様

## アーキテクチャ概要

```
GitHub Actions Workflow
    ├── .github/workflows/weekly-npm-check.yml (メインワークフロー)
    └── .github/workflows/scripts/ (スクリプト群)
        ├── check-npm-outdated.sh (outdatedチェック)
        ├── check-npm-audit.sh (セキュリティチェック)
        ├── check-duplicates.sh (重複パッケージ検出)
        ├── check-version-inconsistency.sh (バージョン不整合検出)
        └── prepare-npm-issue.sh (Issue本文生成)
```

## Phase 1: 基本ワークフロー

### ワークフロー定義

**ファイル**: `.github/workflows/weekly-npm-check.yml`

```yaml
name: Weekly NPM Management Check

on:
  schedule:
    # 毎週月曜日 10:00 JST (1:00 UTC)
    - cron: '0 1 * * 1'
  workflow_dispatch: # 手動実行も可能

permissions:
  issues: write
  contents: read

jobs:
  npm-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: './package-lock.json'

      - name: Get current week info
        id: week_info
        run: |
          YEAR=$(date +%Y)
          WEEK=$(date +%U)
          DATE=$(date +%Y-%m-%d)

          echo "year=$YEAR" >> $GITHUB_OUTPUT
          echo "week=$WEEK" >> $GITHUB_OUTPUT
          echo "date=$DATE" >> $GITHUB_OUTPUT
          echo "title=[NPM管理] ${YEAR}年第${WEEK}週 パッケージ管理レポート (${DATE})" >> $GITHUB_OUTPUT

      - name: Calculate next check date
        id: next_check
        run: |
          NEXT_MONDAY=$(date -d "next monday" +%Y-%m-%d)
          echo "next_date=$NEXT_MONDAY" >> $GITHUB_OUTPUT

      - name: Install dependencies
        run: npm ci

      - name: Check npm outdated
        id: outdated
        run: |
          OUTPUT_FILE=$(mktemp)
          .github/workflows/scripts/check-npm-outdated.sh > "$OUTPUT_FILE"
          {
            echo 'outdated<<EOF'
            cat "$OUTPUT_FILE"
            echo EOF
          } >> $GITHUB_OUTPUT

      - name: Check npm audit
        id: audit
        run: |
          OUTPUT_FILE=$(mktemp)
          .github/workflows/scripts/check-npm-audit.sh > "$OUTPUT_FILE"
          {
            echo 'audit<<EOF'
            cat "$OUTPUT_FILE"
            echo EOF
          } >> $GITHUB_OUTPUT

      - name: Prepare issue body
        id: issue_body
        env:
          OUTDATED: ${{ steps.outdated.outputs.outdated }}
          AUDIT: ${{ steps.audit.outputs.audit }}
          NEXT_DATE: ${{ steps.next_check.outputs.next_date }}
        run: |
          BODY=$(.github/workflows/scripts/prepare-npm-issue.sh)
          {
            echo 'issue_body<<EOF'
            echo "$BODY"
            echo EOF
          } >> $GITHUB_OUTPUT

      - name: Create npm management issue
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh issue create \
            --title "${{ steps.week_info.outputs.title }}" \
            --label "dependencies,weekly-check" \
            --body "${{ steps.issue_body.outputs.issue_body }}"

      - name: Summary
        run: |
          echo "✅ 週次npm管理レポート Issue を作成しました" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "**タイトル**: ${{ steps.week_info.outputs.title }}" >> $GITHUB_STEP_SUMMARY
          echo "**次回チェック予定**: ${{ steps.next_check.outputs.next_date }}" >> $GITHUB_STEP_SUMMARY
```

### スクリプト: check-npm-outdated.sh

**ファイル**: `.github/workflows/scripts/check-npm-outdated.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "## npm outdated チェック"
echo ""

# ルートの outdated チェック
echo "### ルート package.json"
if npm outdated --json > /tmp/outdated-root.json 2>/dev/null || true; then
  if [ -s /tmp/outdated-root.json ]; then
    echo "| パッケージ | 現在 | 必要 | 最新 | 場所 |"
    echo "|----------|------|------|------|------|"
    jq -r 'to_entries[] | "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) | \(.value.location) |"' /tmp/outdated-root.json
  else
    echo "更新可能なパッケージはありません。"
  fi
else
  echo "チェックをスキップしました。"
fi

echo ""
echo "### ワークスペース"

# 各ワークスペースの outdated チェック
WORKSPACES=$(npm query .workspace | jq -r '.[].location' 2>/dev/null || echo "")

if [ -z "$WORKSPACES" ]; then
  echo "ワークスペースが見つかりませんでした。"
else
  for workspace in $WORKSPACES; do
    echo ""
    echo "#### $workspace"

    if [ -f "$workspace/package.json" ]; then
      cd "$workspace"
      if npm outdated --json > /tmp/outdated-workspace.json 2>/dev/null || true; then
        if [ -s /tmp/outdated-workspace.json ]; then
          echo "| パッケージ | 現在 | 必要 | 最新 |"
          echo "|----------|------|------|------|"
          jq -r 'to_entries[] | "| \(.key) | \(.value.current) | \(.value.wanted) | \(.value.latest) |"' /tmp/outdated-workspace.json
        else
          echo "更新可能なパッケージはありません。"
        fi
      fi
      cd - > /dev/null
    fi
  done
fi
```

### スクリプト: check-npm-audit.sh

**ファイル**: `.github/workflows/scripts/check-npm-audit.sh`

```bash
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
    echo "Critical/Highの脆弱性は検出されませんでした。"
  fi
else
  echo "npm audit の実行に失敗しました。"
fi
```

### スクリプト: prepare-npm-issue.sh

**ファイル**: `.github/workflows/scripts/prepare-npm-issue.sh`

```bash
#!/bin/bash
set -euo pipefail

cat <<EOF
# 週次npm管理レポート

このIssueは自動的に生成されました。検出された問題を確認し、必要に応じて対応してください。

## 📋 実行情報
- 実行日時: $(date '+%Y-%m-%d %H:%M:%S')
- 次回チェック予定: ${NEXT_DATE}

---

## 🚨 Priority 1: 緊急対応が必要

${AUDIT}

---

## 📦 Priority 2-3: パッケージ更新

${OUTDATED}

---

## 📝 対応方法

### このIssueはGitHub Copilot Agentに自動アサインされています

Copilot Agentが以下の手順で作業を進めます：

1. **Priority 1（セキュリティ脆弱性）の対応**
   - Critical/High脆弱性を優先的に修正
   - 該当パッケージのバージョンを更新

2. **Priority 2-3（パッケージ更新）の検討**
   - メジャーバージョン更新は破壊的変更の可能性を確認
   - マイナー・パッチ更新は比較的安全に実行

3. **PR作成**
   - 変更内容をまとめたPRを作成
   - テストが全てパスすることを確認

### 受け入れ基準

- [ ] Priority 1の脆弱性が全て解決されている
- [ ] 全てのテストがパスする
- [ ] ビルドエラーがない
- [ ] package-lock.json が更新されている

### 関連ドキュメント

- \`package.json\` - ルート依存関係
- 各ワークスペースの \`package.json\`

---

**Agent実行指示**: このIssueの内容を分析し、セキュリティ脆弱性とパッケージ更新を実施してください。
EOF
```

## Phase 2: 高度な分析機能

### スクリプト: check-duplicates.sh

**ファイル**: `.github/workflows/scripts/check-duplicates.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "## 重複パッケージ検出"
echo ""

# 全package.jsonから依存関係を抽出
TEMP_DIR=$(mktemp -d)

find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  DIR=$(dirname "$pkg")

  # devDependencies を抽出
  jq -r '.devDependencies // {} | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/dev-deps.txt" 2>/dev/null || true

  # dependencies を抽出
  jq -r '.dependencies // {} | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/deps.txt" 2>/dev/null || true
done

# devDependencies の重複をカウント
echo "### devDependencies の重複（ルート統合推奨）"
echo ""

if [ -f "$TEMP_DIR/dev-deps.txt" ]; then
  # ルートのpackage.jsonを除外してカウント
  grep -v "^\./package.json" "$TEMP_DIR/dev-deps.txt" | cut -d'|' -f1 | sort | uniq -c | sort -rn | while read -r count pkg; do
    if [ "$count" -ge 3 ]; then
      echo "- **$pkg**: ${count}箇所で使用"
      grep "^${pkg}|" "$TEMP_DIR/dev-deps.txt" | cut -d'|' -f2,3 | sed 's/^/  - /'
      echo ""
    fi
  done
else
  echo "重複するdevDependenciesは検出されませんでした。"
fi

rm -rf "$TEMP_DIR"
```

### スクリプト: check-version-inconsistency.sh

**ファイル**: `.github/workflows/scripts/check-version-inconsistency.sh`

```bash
#!/bin/bash
set -euo pipefail

echo "## バージョン不整合検出"
echo ""

TEMP_DIR=$(mktemp -d)

# 全package.jsonから依存関係を抽出
find . -name "package.json" -not -path "*/node_modules/*" -not -path "*/.next/*" | while read -r pkg; do
  DIR=$(dirname "$pkg")

  # 全依存関係を抽出
  jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key)|\(.value)|'"$DIR"'"' "$pkg" >> "$TEMP_DIR/all-deps.txt" 2>/dev/null || true
done

if [ -f "$TEMP_DIR/all-deps.txt" ]; then
  echo "| パッケージ | バージョン | 使用箇所 |"
  echo "|----------|----------|---------|"

  # パッケージごとにバージョンをグループ化
  cut -d'|' -f1 "$TEMP_DIR/all-deps.txt" | sort -u | while read -r pkg; do
    VERSIONS=$(grep "^${pkg}|" "$TEMP_DIR/all-deps.txt" | cut -d'|' -f2 | sort -u)
    VERSION_COUNT=$(echo "$VERSIONS" | wc -l)

    # 2つ以上のバージョンがある場合のみ表示
    if [ "$VERSION_COUNT" -gt 1 ]; then
      echo "| **$pkg** | | |"
      grep "^${pkg}|" "$TEMP_DIR/all-deps.txt" | while IFS='|' read -r name ver loc; do
        echo "| | $ver | $loc |"
      done
    fi
  done
else
  echo "バージョン不整合は検出されませんでした。"
fi

rm -rf "$TEMP_DIR"
```

## Phase 3: 最適化機能（オプション）

### depcheck による未使用パッケージ検出

```bash
#!/bin/bash
set -euo pipefail

echo "## 未使用パッケージ検出"
echo ""

# depcheck のインストール
npm install -g depcheck

# 各ワークスペースでdepcheckを実行
WORKSPACES=$(npm query .workspace | jq -r '.[].location' 2>/dev/null || echo "")

for workspace in $WORKSPACES; do
  echo "### $workspace"
  cd "$workspace"
  depcheck --json > /tmp/depcheck.json || true

  UNUSED=$(jq -r '.dependencies | length' /tmp/depcheck.json)
  if [ "$UNUSED" -gt 0 ]; then
    echo "未使用の可能性があるパッケージ:"
    jq -r '.dependencies[]' /tmp/depcheck.json | sed 's/^/- /'
  else
    echo "未使用パッケージは検出されませんでした。"
  fi

  cd - > /dev/null
  echo ""
done
```

## データフロー

```
1. GitHub Actions トリガー（週次cron / 手動）
    ↓
2. リポジトリチェックアウト
    ↓
3. Node.js セットアップ + npm ci
    ↓
4. 各種チェックスクリプト実行
    - npm outdated
    - npm audit
    - 重複パッケージ検出（Phase 2）
    - バージョン不整合検出（Phase 2）
    ↓
5. チェック結果を集約
    ↓
6. Issue本文生成
    ↓
7. Issue作成
    ↓
8. Priority別にSub-issueを作成（手動または自動）
    ↓
9. 開発者が各Sub-issueにCopilot Agentをアサイン
    ↓
10. Copilot Agent が各Sub-issueを実装
```

## 技術的考慮事項

### エラーハンドリング

- 各スクリプトは `set -euo pipefail` でエラー時に停止
- ただし、`npm outdated` と `npm audit` は終了コード1を返すことがあるため `|| true` で継続
- 空の結果も正常として扱う

### パフォーマンス

- `npm ci` でクリーンインストール（キャッシュ利用）
- ワークスペース数が多い場合、並列実行を検討
- 一時ファイルは `mktemp` で作成し、処理後削除

### セキュリティ

- GitHub Tokenは最小権限（issues: write, contents: read）
- スクリプトへの入力は適切にエスケープ
- 機密情報はログに出力しない

## 拡張性

将来的に以下の機能を追加可能：

- パッケージサイズの監視
- ライセンスコンプライアンスチェック
- 依存関係グラフの可視化
- 更新履歴のトレンド分析
- Slackなどへの通知連携

## テスト戦略

### 単体テスト

各スクリプトを個別に実行して動作確認：

```bash
# outdated チェック
.github/workflows/scripts/check-npm-outdated.sh

# audit チェック
.github/workflows/scripts/check-npm-audit.sh

# 重複パッケージ検出
.github/workflows/scripts/check-duplicates.sh

# バージョン不整合検出
.github/workflows/scripts/check-version-inconsistency.sh
```

### 統合テスト

- `workflow_dispatch` で手動実行
- 生成されたIssueの内容を確認
- Copilot Agentの動作を確認

## ロールアウト計画

1. **Phase 1を開発環境で実装**
    - 基本ワークフローとスクリプト作成
    - 手動実行でテスト

2. **Phase 1を本番リポジトリにデプロイ**
    - 週次実行を開始
    - 1-2週間運用して問題がないか確認

3. **Phase 2を追加**
    - 高度な分析機能を実装
    - 既存ワークフローに統合

4. **Phase 3を検討**
    - 必要に応じて最適化機能を追加

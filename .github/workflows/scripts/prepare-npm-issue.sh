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

### ワークスペース名の対応表

各ワークスペースを更新する際は、ルートから \`--workspace\` オプションで指定してください。

| ディレクトリパス | ワークスペース名 |
|---------------|-----------------|
| services/admin/web | @nagiyu/admin |
| services/auth/core | @nagiyu/auth-core |
| services/auth/web | @nagiyu/auth-web |
| services/codec-converter/batch | codec-converter-batch |
| services/codec-converter/core | codec-converter-core |
| services/codec-converter/web | codec-converter-web |
| services/tools | tools |
| libs/browser | @nagiyu/browser |
| libs/common | @nagiyu/common |
| libs/ui | @nagiyu/ui |
| infra/admin | @nagiyu/infra-admin |
| infra/auth | @nagiyu/infra-auth |
| infra/codec-converter | codec-converter |
| infra/shared | @nagiyu/shared-infra |
| infra/tools | @nagiyu/infra-tools |

### 更新コマンドの例

\`\`\`bash
# ルートのパッケージを更新
npm update

# 特定ワークスペースのパッケージを更新（ルートから実行）
npm install --workspace @nagiyu/auth-web <パッケージ名>@<バージョン>

# セキュリティ脆弱性の自動修正
npm audit fix

# 複数ワークスペースで同じパッケージを更新
npm install --workspace @nagiyu/auth-web --workspace @nagiyu/admin <パッケージ名>@<バージョン>
\`\`\`

### 関連ドキュメント

- \`package.json\` - ルート依存関係
- 各ワークスペースの \`package.json\`

---

**Agent実行指示**: このIssueの内容を分析し、セキュリティ脆弱性とパッケージ更新を実施してください。
EOF

# 週次npm管理レポート

このIssueは自動的に生成されました。検出された問題を確認し、必要に応じて対応してください。

## 📋 実行情報
- 実行日時: {{CREATE_TIME}}
- 次回チェック予定: {{NEXT_DATE}}

---

## 🚨 Priority 1: 緊急対応が必要

{{AUDIT}}

---

## ⚠️ Priority 2: 早めの対応推奨

### バージョン不整合

{{INCONSISTENCY}}

---

## 💡 Priority 3: 改善推奨

### 重複パッケージ（ルートへの統合推奨）

{{DUPLICATES}}

### パッケージ更新

{{OUTDATED}}

---

## 📝 対応方法

### このIssueはGitHub Copilot Agentに自動アサインされています

Copilot Agentが以下の手順で作業を進めます：

1. **Priority 1（セキュリティ脆弱性）の対応**
    - Critical/High脆弱性を優先的に修正
    - 該当パッケージのバージョンを更新

2. **Priority 2（バージョン不整合）の対応**
    - 同じパッケージのバージョンを統一
    - ルートから `--workspace` オプションで指定

3. **Priority 3（重複パッケージとパッケージ更新）の検討**
    - 重複パッケージをルートに統合
    - メジャーバージョン更新は破壊的変更の可能性を確認
    - マイナー・パッチ更新は比較的安全に実行

4. **PR作成**
    - 変更内容をまとめたPRを作成
    - テストが全てパスすることを確認

### 受け入れ基準

- [ ] Priority 1の脆弱性が全て解決されている
- [ ] Priority 2のバージョン不整合が解消されている
- [ ] 全てのテストがパスする
- [ ] ビルドエラーがない
- [ ] package-lock.json が更新されている

### ワークスペース操作の原則

**重要**: 各ワークスペースに`package-lock.json`や`node_modules`が作成されないよう、必ずルートから`--workspace`オプションを使用してください。

```bash
# 正しい例: ルートから実行
npm install --workspace @nagiyu/auth-web {PACKAGE_NAME}@{VERSION}
npm uninstall --workspace @nagiyu/auth-web {PACKAGE_NAME}

# 誤った例: ディレクトリ移動（避ける）
cd services/auth/web && npm install {PACKAGE_NAME}@{VERSION}
```

### 関連ドキュメント

- package.json - ルート依存関係
- 各ワークスペースの package.json

---

**Agent実行指示**: このIssueの内容を分析し、セキュリティ脆弱性、バージョン不整合、重複パッケージ、パッケージ更新を実施してください。

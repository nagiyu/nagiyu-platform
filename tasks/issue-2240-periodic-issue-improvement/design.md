# 定期 Issue の改善 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    本タスクは GitHub Actions ワークフロー改善（プラットフォームタスク）のため、
    サービス固有の architecture.md への ADR 追記は不要。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    入力: tasks/issue-2240-periodic-issue-improvement/requirements.md
    次に作成するドキュメント: tasks/issue-2240-periodic-issue-improvement/tasks.md
-->

## 対象ファイル

変更対象は以下の GitHub Actions ワークフロー・テンプレートファイルのみ。
新規ファイルの追加はない。

| ファイル | 変更種別 |
|---------|---------|
| `.github/workflows/templates/weekly-npm-body.md` | 修正（実装指示セクション削除） |
| `.github/workflows/templates/weekly-review-body.md` | 修正（エージェント指示削除） |
| `.github/workflows/create-task-issues.yml` | 修正（エージェントアサイン追加） |

---

## 変更設計

### 1. weekly-npm-body.md テンプレート修正

**現状**: 「📝 対応方法」セクションに以下が含まれている
- 「このIssueはGitHub Copilot Agentに自動アサインされています」
- Priority 別の具体的な実装手順
- 「受け入れ基準」チェックリスト
- 「ワークスペース操作の原則」コード例
- 「Agent実行指示」

**変更後**: 上記セクション（「📝 対応方法」以降）を全て削除し、事実報告のみにする。

残すセクション:
- `## 📋 実行情報`（実行日時・次回チェック予定）
- `## 🚨 Priority 1: 緊急対応が必要`（audit 結果）
- `## ⚠️ Priority 2: 早めの対応推奨`（バージョン不整合）
- `## 💡 Priority 3: 改善推奨`（重複パッケージ・更新候補）

### 2. weekly-review-body.md テンプレート修正

**現状**: 「✅ レビュー手順」に以下が含まれている
- 「このIssueを担当者にアサイン」という指示
- 担当者がレビューを実施することを前提とした手順

**変更後**: 「✅ レビュー手順」セクションを削除し、レビューチェックリストと自動収集情報のみにする。

残すセクション:
- `## 📊 自動収集メトリクス`
- `## 📋 チェックリスト`（Priority 1〜4 全て）
- `## 📝 発見した問題`

### 3. create-task-issues.yml 修正

#### サブ Issue へのエージェントアサイン

各サブ Issue 作成コマンドに `--assignee @copilot` を追加する。

- 「タスクドキュメント作成」Issue: `--assignee @copilot`
- 「実装」Issue: `--assignee @copilot`
- 「クリーンアップ」Issue: `--assignee @copilot`

---

## 実装上の注意点

### 既存の workflow_dispatch 動作の維持

`create-task-issues.yml` の既存の `workflow_dispatch` トリガーおよび手動実行フローは変更しない。
エージェントアサインのみを追加する。

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/` への統合は不要（GitHub Actions ワークフローの変更のみ）

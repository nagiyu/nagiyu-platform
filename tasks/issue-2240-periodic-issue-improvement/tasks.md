# 定期 Issue の改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2240-periodic-issue-improvement/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2240-periodic-issue-improvement/design.md — 変更設計
-->

## Phase 1: Issue テンプレートの事実化

- [ ] `.github/workflows/templates/weekly-npm-body.md` から「📝 対応方法」セクション以降（Agent 実行指示・受け入れ基準・ワークスペース操作原則を含む）を削除する
- [ ] `.github/workflows/templates/weekly-review-body.md` から「✅ レビュー手順」セクション（担当者アサイン指示を含む）を削除する

## Phase 2: create-task-issues.yml 改修

- [ ] `.github/workflows/create-task-issues.yml` に `on: workflow_call` トリガーを追加する（inputs: `issue_number`, `mode`）
- [ ] 「タスクドキュメント作成」Issue 作成コマンドに `--assignee @copilot` を追加する
- [ ] 「実装」Issue 作成コマンドに `--assignee @copilot` を追加する
- [ ] 「クリーンアップ」Issue 作成コマンドに `--assignee @copilot` を追加する

## Phase 3: 定期 Workflow からの呼び出し

- [ ] `.github/workflows/weekly-npm-check.yml` の `npm-check` job に作成 Issue 番号を job output として公開するステップを追加する
- [ ] `.github/workflows/weekly-npm-check.yml` に `create-task-issues.yml` を `uses:` で呼び出す job を追加する（`needs: npm-check`）
- [ ] `.github/workflows/weekly-docs-review.yml` の `create-review-issue` job に作成 Issue 番号を job output として公開するステップを追加する
- [ ] `.github/workflows/weekly-docs-review.yml` に `create-task-issues.yml` を `uses:` で呼び出す job を追加する（`needs: create-review-issue`）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件（UC-001〜004、F-001〜006）をすべて満たしている
- [ ] 既存の `workflow_dispatch` による手動実行動作が維持されている
- [ ] Lint・YAML 文法チェックが通過している
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除した

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

- [ ] 「タスクドキュメント作成」Issue 作成コマンドに `--assignee @copilot` を追加する
- [ ] 「実装」Issue 作成コマンドに `--assignee @copilot` を追加する
- [ ] 「クリーンアップ」Issue 作成コマンドに `--assignee @copilot` を追加する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件（UC-001〜003、F-001〜003）をすべて満たしている
- [ ] 既存の `workflow_dispatch` による手動実行動作が維持されている
- [ ] Lint・YAML 文法チェックが通過している
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除した

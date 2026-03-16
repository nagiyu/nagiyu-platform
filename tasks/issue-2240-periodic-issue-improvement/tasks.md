# 定期 Issue 改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2240-periodic-issue-improvement/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2240-periodic-issue-improvement/design.md — 変更ファイル・設計方針
-->

## Phase 1: Issue 本文テンプレートのファクト化

- [ ] `.github/workflows/templates/weekly-npm-body.md` からエージェント指示・受け入れ基準・対応手順セクションを削除し、検出結果（脆弱性・不整合・重複・更新情報）と実行情報のみを残す（F-001）
- [ ] `.github/workflows/templates/daily-refactoring-body.md` から「🤖 task.proposal エージェントへの指示」セクション全体を削除し、調査対象・チェックポイント・実行情報のみを残す（F-002）
- [ ] `.github/workflows/templates/weekly-review-body.md` から procedural な指示（「担当者にアサイン」等）を削除し、メトリクス・チェックリストのみを残す（F-003）

## Phase 2: `create-task-issues.yml` の `workflow_call` 対応

- [ ] `on:` に `workflow_call` トリガーを追加し、`inputs`（`issue_number`, `mode`）を `string` 型で定義する（F-004）
- [ ] `workflow_call` 用の `secrets: inherit` を設定する（呼び出し元の `GITHUB_TOKEN` を継承）
- [ ] `workflow_dispatch` 側の既存 inputs（`choice` 型）は変更しないこと
- [ ] `workflow_call` / `workflow_dispatch` の両トリガーで同一の job ロジックが動作することを確認する

## Phase 3: 定期ワークフローからのサブ Issue 自動生成

- [ ] `weekly-npm-check.yml` で `create-npm-issue` ジョブが作成した Issue 番号を outputs として出力し、`create-sub-issues` ジョブで `create-task-issues.yml` を呼び出す（F-005）
- [ ] `weekly-docs-review.yml` で同様に Issue 番号を outputs として出力し、`create-sub-issues` ジョブを追加する（F-005）
- [ ] `daily-refactoring-check.yml` で既存の `create_issue` ステップの `issue_number` output を使い、`create-sub-issues` ジョブを追加する。`should_create == 'false'` の場合はスキップする（F-005）

## Phase 4: 動作確認

- [ ] `create-task-issues.yml` を `workflow_dispatch` で手動実行し、既存の `task-document-completion` モードが引き続き動作することを確認する
- [ ] 各定期ワークフローを `workflow_dispatch` で手動実行し、親 Issue 作成後にサブ Issue が自動生成されることを確認する
- [ ] サブ Issue が親 Issue のサブ Issue として紐付けられることを確認する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している（YAML 構文エラーなし）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除した

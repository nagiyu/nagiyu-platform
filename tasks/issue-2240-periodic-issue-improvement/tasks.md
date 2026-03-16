# 定期 Issue の改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2240-periodic-issue-improvement/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2240-periodic-issue-improvement/design.md — 設計方針・変更仕様
-->

## Phase 1: `create-task-issues.yml` の再利用可能ワークフロー化

- [ ] T001: `on.workflow_call` トリガーを追加し、`issue_number`（必須）と `mode`（任意、デフォルト: `task-document-completion`）を入力として宣言する（依存: なし）
- [ ] T002: ジョブ内の `${{ github.event.inputs.issue_number }}` および `${{ github.event.inputs.mode }}` を `${{ inputs.issue_number }}` および `${{ inputs.mode }}` に変更する（依存: T001）
- [ ] T003: ジョブ条件 `if: github.event.inputs.mode == 'task-document-completion'` を `if: inputs.mode == 'task-document-completion'` に変更する（依存: T001）
- [ ] T004: `IMPLEMENTATION_BODY` と `CLEANUP_BODY` の「参照: 」欄に `#${PARENT_ISSUE_NUMBER}` を補完するよう修正する（依存: なし）

## Phase 2: Issue 本文テンプレートの事実化

- [ ] T005: `daily-refactoring-body.md` から `## 🤖 task.proposal エージェントへの指示` セクション全体を削除する（依存: なし）
- [ ] T006: `weekly-npm-body.md` から `## 📝 対応方法` セクション全体および末尾の `**Agent実行指示**:` 行を削除する（依存: なし）
- [ ] T007: `weekly-review-body.md` から `## ✅ レビュー手順` セクション全体を削除する（依存: なし）

## Phase 3: 定期ワークフローへの create-task-issues ジョブ追加

- [ ] T008: `daily-refactoring-check.yml` の `create-refactoring-issue` ジョブに `outputs.issue_number` を追加し、create_issue ステップで Issue 番号を `GITHUB_OUTPUT` に書き出す（依存: T001-T003）
- [ ] T009: `daily-refactoring-check.yml` に `create-task-issues` ジョブを追加し、`needs: create-refactoring-issue`、`uses: ./.github/workflows/create-task-issues.yml`、`with.issue_number` および `permissions.issues: write` を設定する（依存: T008）
- [ ] T010: `weekly-npm-check.yml` の `npm-check` ジョブに `outputs.issue_number` を追加し、npm issue 作成ステップで Issue 番号を `GITHUB_OUTPUT` に書き出す（依存: T001-T003）
- [ ] T011: `weekly-npm-check.yml` に `create-task-issues` ジョブを追加し、`needs: npm-check`、`uses: ./.github/workflows/create-task-issues.yml`、`with.issue_number` および `permissions.issues: write` を設定する（依存: T010）
- [ ] T012: `weekly-docs-review.yml` の `create-review-issue` ジョブに `outputs.issue_number` を追加し、review issue 作成ステップで Issue 番号を `GITHUB_OUTPUT` に書き出す（依存: T001-T003）
- [ ] T013: `weekly-docs-review.yml` に `create-task-issues` ジョブを追加し、`needs: create-review-issue`、`uses: ./.github/workflows/create-task-issues.yml`、`with.issue_number` および `permissions.issues: write` を設定する（依存: T012）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `create-task-issues.yml` が `workflow_dispatch` および `workflow_call` の両方で動作することを確認した
- [ ] 定期ワークフロー（3 つ）が Issue 作成後にサブ Issue を自動生成することを確認した（`workflow_dispatch` での手動実行で検証）
- [ ] Issue 本文テンプレート 3 つからエージェント指示が除去されていることを確認した
- [ ] サブ Issue 本文の「参照:」欄に親 Issue 番号が設定されていることを確認した
- [ ] Lint・型チェックがすべて通過している（YAML 構文確認）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除した

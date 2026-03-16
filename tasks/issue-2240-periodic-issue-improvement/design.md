# 定期 Issue 改善 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/ に ADR として抽出し、
    tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    入力: tasks/issue-2240-periodic-issue-improvement/requirements.md
    次に作成するドキュメント: tasks/issue-2240-periodic-issue-improvement/tasks.md
-->

## コンポーネント設計

### 変更対象ファイル一覧

| ファイル | 変更種別 | 変更概要 |
| ------- | -------- | -------- |
| `.github/workflows/create-task-issues.yml` | 修正 | `workflow_call` トリガー追加、inputs 定義 |
| `.github/workflows/weekly-npm-check.yml` | 修正 | Issue 作成後に `create-task-issues.yml` を呼び出す job 追加 |
| `.github/workflows/weekly-docs-review.yml` | 修正 | Issue 作成後に `create-task-issues.yml` を呼び出す job 追加 |
| `.github/workflows/daily-refactoring-check.yml` | 修正 | Issue 作成後に `create-task-issues.yml` を呼び出す job 追加 |
| `.github/workflows/templates/weekly-npm-body.md` | 修正 | エージェント指示・対応手順を削除し、事実のみに整理 |
| `.github/workflows/templates/daily-refactoring-body.md` | 修正 | エージェント指示を削除し、事実のみに整理 |
| `.github/workflows/templates/weekly-review-body.md` | 修正 | 「担当者にアサイン」指示等の procedural な記述を削除 |

---

## `create-task-issues.yml` 設計

### トリガー設計

現行の `workflow_dispatch` に加えて、`workflow_call` トリガーを追加する。

```yaml
on:
  workflow_dispatch:
    inputs:
      issue_number:
        description: 親Issue番号
        required: true
        type: string
      mode:
        description: 作成モード
        required: true
        default: task-document-completion
        type: choice
        options:
          - task-document-completion
  workflow_call:
    inputs:
      issue_number:
        description: 親Issue番号
        required: true
        type: string
      mode:
        description: 作成モード
        required: true
        type: string
    secrets: inherit   # 呼び出し元の GITHUB_TOKEN を継承
```

`workflow_call` の場合は `secrets: inherit` を使用して、呼び出し元ワークフローのトークンを継承する。

### permissions

`workflow_call` の場合、呼び出し元から権限が継承されるが、ジョブレベルで明示する。

```
permissions:
  issues: write
```

### inputs の拡張

`workflow_call` では `choice` 型が使用できないため、`string` 型で入力を受け付ける。`workflow_dispatch` 側は既存の `choice` 型を維持する。

両トリガーで同一の inputs 定義を使う場合は `workflow_call.inputs` に `string` 型で定義し、`workflow_dispatch.inputs` の `type: choice` は別途維持する。

---

## 定期ワークフロー設計

### 呼び出しパターン

各定期ワークフローで、Issue 作成ステップの後に `create-task-issues.yml` を `workflow_call` で呼び出す job を追加する。

```yaml
jobs:
  create-parent-issue:
    runs-on: ubuntu-latest
    outputs:
      issue_number: ${{ steps.create_issue.outputs.issue_number }}
    steps:
      # ... 既存の Issue 作成ステップ
      - name: Create issue
        id: create_issue
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          ISSUE_URL=$(gh issue create --title "..." --body "...")
          ISSUE_NUMBER="${ISSUE_URL##*/}"
          echo "issue_number=$ISSUE_NUMBER" >> "$GITHUB_OUTPUT"

  create-sub-issues:
    needs: create-parent-issue
    uses: ./.github/workflows/create-task-issues.yml
    with:
      issue_number: ${{ needs.create-parent-issue.outputs.issue_number }}
      mode: task-document-completion
    secrets: inherit
```

### daily-refactoring-check.yml の注意点

既存の重複チェック（`duplicate_check`）を考慮する。`should_create == 'false'` の場合は `create-sub-issues` ジョブもスキップする。

```yaml
create-sub-issues:
  needs: [duplicate_check, create-parent-issue]
  if: needs.duplicate_check.outputs.should_create == 'true'
  uses: ./.github/workflows/create-task-issues.yml
  with:
    issue_number: ${{ needs.create-parent-issue.outputs.issue_number }}
    mode: task-document-completion
  secrets: inherit
```

### Issue 番号の取り出し方

- `weekly-npm-check.yml`: `gh issue create` の出力 URL から番号を取り出す（末尾を `##*/` で抽出）
- `weekly-docs-review.yml`: 同様
- `daily-refactoring-check.yml`: 既存の `create_issue` ステップが `issue_number` を outputs として持っているため流用できる

---

## Issue 本文テンプレートの整理方針

### weekly-npm-body.md

**削除する内容**:
- 「このIssueはGitHub Copilot Agentに自動アサインされています」以降の対応手順セクション全体
- 「Agent実行指示」セクション
- 受け入れ基準セクション

**残す内容**:
- 検出結果（Priority 1〜3 の事実データ: 脆弱性・不整合・重複・更新情報）
- 実行情報（実行日時・次回チェック予定）

### daily-refactoring-body.md

**削除する内容**:
- 「task.proposal エージェントをアサインし...実施してください」という指示文
- 「🤖 task.proposal エージェントへの指示」セクション全体

**残す内容**:
- 調査対象一覧（自動収集されたサービス・ライブラリ）
- チェックポイント（コード共通化の確認項目）
- 実行情報（作成日時・次回作成予定）

### weekly-review-body.md

**削除する内容**:
- 「このIssueを担当者にアサイン」「担当者にアサインして作業を進める」等の procedural な指示
- レビュー完了後の「このIssueをクローズ」指示

**残す内容**:
- 自動収集メトリクス（更新ドキュメント数・方針変更履歴）
- チェックリスト（実際に確認すべき項目の事実ベースの列挙）

---

## 実装上の注意点

### 依存関係・前提条件

- `workflow_call` での `secrets: inherit` は GitHub Actions の制約上、同一リポジトリ内のワークフロー呼び出しでのみ有効
- `create-task-issues.yml` はローカル参照（`./.github/workflows/create-task-issues.yml`）で呼び出す

### `workflow_call` の inputs 型制約

- `workflow_call.inputs` では `type: choice` が使用不可。`type: string` で受け取り、ジョブの `if` 条件でモードを判定する
- `workflow_dispatch.inputs` の既存の `choice` 定義は変更不要

### エラーハンドリング

- `create-task-issues.yml` の呼び出しが失敗しても、親 Issue 自体は作成済みのため、エラーは `continue-on-error: false`（デフォルト）で検知できる
- 失敗時は GitHub Actions のワークフロー実行ページでエラーが可視化される

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/flow.md`（または `docs/development/architecture.md`）に「定期ワークフローのサブ Issue 自動生成パターン」を ADR として追記すること（`workflow_call` を使った reusable workflow パターン）
- [ ] `docs/README.md` の「AIエージェント」セクションにサブ Issue と各エージェントの対応関係を追記することを検討する

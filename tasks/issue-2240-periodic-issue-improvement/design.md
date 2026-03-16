# 定期 Issue の改善 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に ADR として抽出し、
    tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。

    入力: tasks/issue-2240-periodic-issue-improvement/requirements.md
    次に作成するドキュメント: tasks/issue-2240-periodic-issue-improvement/tasks.md
-->

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| ---------- | ---- |
| `.github/workflows/create-task-issues.yml` | サブ Issue 作成の再利用可能ワークフロー（`workflow_dispatch` + `workflow_call` 対応） |
| `.github/workflows/daily-refactoring-check.yml` | 日次コード共通化調査 Issue の作成 → create-task-issues.yml 呼び出し |
| `.github/workflows/weekly-npm-check.yml` | 週次 npm 管理レポート Issue の作成 → create-task-issues.yml 呼び出し |
| `.github/workflows/weekly-docs-review.yml` | 週次ドキュメントレビュー Issue の作成 → create-task-issues.yml 呼び出し |
| `.github/workflows/templates/daily-refactoring-body.md` | 日次リファクタリング Issue 本文テンプレート（事実のみに変更） |
| `.github/workflows/templates/weekly-npm-body.md` | 週次 npm 管理 Issue 本文テンプレート（事実のみに変更） |
| `.github/workflows/templates/weekly-review-body.md` | 週次ドキュメントレビュー Issue 本文テンプレート（手順指示を除去） |

---

## 設計方針

### `create-task-issues.yml` の再利用可能ワークフロー化

`workflow_call` トリガーを追加し、定期ワークフローから呼び出せるようにする。

**変更点**:

- `on.workflow_call` セクションを追加し、`workflow_dispatch` と同じ入力（`issue_number`, `mode`）を宣言する
- ステップ内の `${{ github.event.inputs.xxx }}` を `${{ inputs.xxx }}` に統一する
    - `inputs` コンテキストは `workflow_dispatch` と `workflow_call` の両方で利用可能
- サブ Issue 本文の「参照:」欄に親 Issue 番号を補完する
    - `IMPLEMENTATION_BODY` と `CLEANUP_BODY` の末尾 `参照: ` に `#${PARENT_ISSUE_NUMBER}` を追加する

**`workflow_call` 入力定義イメージ**:

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
        required: true
        type: string
      mode:
        required: false
        type: string
        default: task-document-completion
```

**ジョブ条件の修正イメージ**:

```yaml
jobs:
  create-issues:
    if: inputs.mode == 'task-document-completion'
```

---

### 定期ワークフローの変更方針

各定期ワークフロー（`daily-refactoring-check.yml`、`weekly-npm-check.yml`、`weekly-docs-review.yml`）に対して以下の変更を加える:

#### 1. 親 Issue 番号の出力

Issue 作成ジョブに `outputs` を追加し、作成した Issue 番号を後続ジョブに渡す。

```yaml
jobs:
  create-xxx-issue:
    outputs:
      issue_number: ${{ steps.create_issue.outputs.issue_number }}
```

Issue 作成ステップで Issue 番号を `GITHUB_OUTPUT` に書き出す。
既存のワークフローにある `gh issue create` コマンドに対して、`ISSUE_NUMBER` の取り出しと `GITHUB_OUTPUT` への書き出しを追加する:

```yaml
- name: Create daily refactoring issue
  id: create_issue
  if: steps.duplicate_check.outputs.should_create == 'true'
  env:
    GH_TOKEN: ${{ github.token }}
  run: |
    ISSUE_URL=$(gh issue create \
      --title "${{ steps.date_info.outputs.title }}" \
      --label "refactoring,code-consolidation" \
      --body "${{ steps.issue_body.outputs.issue_body }}")
    ISSUE_NUMBER="${ISSUE_URL##*/}"
    echo "issue_url=$ISSUE_URL" >> "$GITHUB_OUTPUT"
    echo "issue_number=$ISSUE_NUMBER" >> "$GITHUB_OUTPUT"
```

`weekly-npm-check.yml` および `weekly-docs-review.yml` も同様に、既存の `gh issue create` ステップに `id: create_issue` を付与し、`issue_number` を出力する。

#### 2. create-task-issues ジョブの追加

Issue 作成ジョブに依存する新しいジョブを追加し、再利用可能ワークフローを呼び出す:

```yaml
  create-task-issues:
    needs: create-xxx-issue
    uses: ./.github/workflows/create-task-issues.yml
    permissions:
      issues: write
    with:
      issue_number: ${{ needs.create-xxx-issue.outputs.issue_number }}
      mode: task-document-completion
```

---

### Issue 本文テンプレートの変更方針

#### `daily-refactoring-body.md`

**除去するセクション**:

- `## 🤖 task.proposal エージェントへの指示` 全体（エージェント作業指示のため）

**残すセクション**（事実情報）:

- `## 📋 実行情報`（CREATE_TIME, NEXT_DATE）
- `## 🎯 調査対象（自動収集）`（SERVICE_LIST）
- `## ✅ コード共通化のチェックポイント`（チェックリスト）
- `## 📚 参考ドキュメント`（リンク）
- フッター（自動作成表記）

#### `weekly-npm-body.md`

**除去するセクション**:

- `## 📝 対応方法`（エージェントへの手順指示・受け入れ基準・ワークスペース操作原則を含む全体）
- 末尾の `**Agent実行指示**:` 行

**残すセクション**（事実情報）:

- `## 📋 実行情報`（CREATE_TIME, NEXT_DATE）
- `## 🚨 Priority 1: 緊急対応が必要`（{{AUDIT}}）
- `## ⚠️ Priority 2: 早めの対応推奨`（{{INCONSISTENCY}}）
- `## 💡 Priority 3: 改善推奨`（{{DUPLICATES}}, {{OUTDATED}}）

#### `weekly-review-body.md`

**除去するセクション**:

- `## ✅ レビュー手順`（担当者へのステップバイステップ指示）

**残すセクション**（事実情報）:

- ヘッダー（説明文・注意書き）
- `## 📊 自動収集メトリクス`（UPDATED_DOCS, PREV_ISSUE, NEXT_DATE, POLICY_CHANGES_SECTION）
- `## 📋 チェックリスト`（Priority 1〜4 のレビュー項目）
- `## 📝 発見した問題`（空テンプレート）
- フッター（自動作成表記）

---

## 実装上の注意点

### 依存関係・前提条件

- `workflow_call` で呼び出す際、呼び出し元ワークフローの `permissions` に `issues: write` が含まれていること
    - または、`create-task-issues.yml` 側で `permissions: issues: write` を宣言することで対応可能
- 再利用可能ワークフロー（`workflow_call`）は同一リポジトリの場合 `./.github/workflows/xxx.yml` で参照できる

### `workflow_dispatch` の `type: choice` と `workflow_call`

- `workflow_dispatch` の `type: choice` は `workflow_call` では `type: string` として宣言する必要がある
    - 同一の `mode` 値（`task-document-completion`）を受け取る設計を維持する

### 既存の手動実行フローへの影響なし

- `workflow_dispatch` トリガーを残すことで、既存の手動実行フローは変更なく動作する

---

## docs/ への移行メモ

- [ ] `docs/development/flow.md` に「定期 Issue → サブ Issue 自動生成フロー」の説明を追記すること
- [ ] `tasks/issue-2240-periodic-issue-improvement/` ディレクトリを削除すること

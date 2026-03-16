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
| `.github/workflows/create-task-issues.yml` | 修正（workflow_call 追加、エージェントアサイン追加） |
| `.github/workflows/weekly-npm-check.yml` | 修正（create-task-issues.yml 呼び出し追加） |
| `.github/workflows/weekly-docs-review.yml` | 修正（create-task-issues.yml 呼び出し追加） |

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

#### 3.1 workflow_call トリガーの追加

現状の `on: workflow_dispatch` に加えて `on: workflow_call` トリガーを追加する。
`workflow_call` の inputs は `workflow_dispatch` と同じ `issue_number` と `mode` を受け付ける。

```yaml
on:
  workflow_dispatch:
    inputs:
      issue_number: ...
      mode: ...
  workflow_call:
    inputs:
      issue_number:
        required: true
        type: string
      mode:
        required: false
        default: task-document-completion
        type: string
```

#### 3.2 サブ Issue へのエージェントアサイン

各サブ Issue 作成コマンドに `--assignee @copilot` を追加する。

- 「タスクドキュメント作成」Issue: `--assignee @copilot`
- 「実装」Issue: `--assignee @copilot`
- 「クリーンアップ」Issue: `--assignee @copilot`

### 4. 定期 Workflow からの create-task-issues.yml 呼び出し

#### 4.1 weekly-npm-check.yml

「Create npm management issue」ステップの後に、`create-task-issues.yml` を呼び出す job を追加する。
または同一 job 内で `uses:` ステップとして呼び出す。

`on: workflow_call` を使うため、job レベルでの呼び出しが適切:

```yaml
call-create-task-issues:
  needs: npm-check
  uses: ./.github/workflows/create-task-issues.yml
  with:
    issue_number: ${{ needs.npm-check.outputs.issue_number }}
    mode: task-document-completion
  permissions:
    issues: write
```

これに対応して、`npm-check` job で作成した Issue 番号を output として公開する必要がある。

#### 4.2 weekly-docs-review.yml

同様に `create-review-issue` job の後に `create-task-issues.yml` を呼び出す job を追加する。

---

## 実装上の注意点

### workflow_call と workflow_dispatch の入力値共有

`workflow_call` と `workflow_dispatch` で同じ inputs を使う場合、
各トリガーの inputs を同じキー名で定義する必要がある。

`if` による条件分岐でトリガー種別を判定できる:
- `github.event_name == 'workflow_dispatch'`
- `github.event_name == 'workflow_call'`

### Issue 番号の伝達

`weekly-npm-check.yml` と `weekly-docs-review.yml` では、
作成した Issue の URL から番号を抽出して job output に設定する必要がある。

```bash
ISSUE_URL=$(gh issue create ...)
ISSUE_NUMBER="${ISSUE_URL##*/}"
echo "issue_number=$ISSUE_NUMBER" >> "$GITHUB_OUTPUT"
```

### permissions の継承

`workflow_call` で呼び出す場合、呼び出し元ワークフローが `issues: write` 権限を持っていることを確認する。
`create-task-issues.yml` は呼び出し元の権限を継承する。

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/` への統合は不要（GitHub Actions ワークフローの変更のみ）
- [ ] `docs/development/flow.md` に定期 Issue フロー（親 Issue 作成 → create-task-issues.yml 自動呼び出し → サブ Issue 作成）の説明を追記する

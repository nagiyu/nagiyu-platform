<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/development/ に統合して削除します。
-->

# 定期 Issue 改善 - 要件定義

## 1. ビジネス要件

### 1.1 背景・目的

週次 NPM 管理・週次ドキュメントレビュー・日次リファクタリングチェックの 3 つの定期ワークフローが自動生成する Issue に、エージェントへの実行指示が直接含まれている。

- Issue はあくまで「事実（発見された問題・状態）」を記述するものであるべき
- エージェントへの指示は作業用サブ Issue に委譲し、それぞれのサブ Issue に対して適切なエージェントが割り当てられる形にしたい
- `create-task-issues.yml` を `workflow_call` で呼び出せるようにし、定期ワークフローが作成した Issue に対して自動的にサブ Issue を作成する流れを整備する

### 1.2 対象ユーザー

- プラットフォーム管理者（定期 Issue を確認・トリアージする人）
- AI エージェント（タスクドキュメント作成・実装・クリーンアップを担当する Copilot agent）

### 1.3 ビジネスゴール

- 定期 Issue が「事実」のみを記述し、読み手が状況を即座に把握できる
- 各作業（タスクドキュメント作成・実装・クリーンアップ）が専用サブ Issue として分離されており、エージェントが担当作業を明確に把握できる
- 定期ワークフローと `create-task-issues.yml` の連携が自動化されている

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: 定期ワークフローが Issue を作成し、サブ Issue を自動生成する

- **概要**: 定期ワークフロー（weekly-npm-check、weekly-docs-review、daily-refactoring-check）が事実のみを記述した Issue を作成した後、`create-task-issues.yml` を呼び出してサブ Issue を作成する
- **アクター**: GitHub Actions（ワークフロー自動実行）
- **前提条件**: 対象の定期ワークフローが実行されている
- **正常フロー**:
    1. 定期ワークフローが事実（検出結果・メトリクス）のみを含む親 Issue を作成する
    2. 定期ワークフローが `create-task-issues.yml` を `workflow_call` で呼び出す（親 Issue 番号を渡す）
    3. `create-task-issues.yml` が「タスクドキュメント作成」「実装」「クリーンアップ」の 3 つのサブ Issue を作成する
    4. 3 つのサブ Issue が親 Issue のサブ Issue として紐付けられる
- **代替フロー**: 重複チェックにより作成がスキップされる場合（daily-refactoring-check の場合）、`create-task-issues.yml` の呼び出しもスキップする
- **例外フロー**: `create-task-issues.yml` の呼び出しが失敗した場合、エラーをワークフローサマリーに記録する

#### UC-002: 管理者が手動で特定 Issue に対してサブ Issue を作成する

- **概要**: 既存の `workflow_dispatch` モードはそのまま維持し、任意の Issue 番号に対して手動でサブ Issue を作成できる
- **アクター**: プラットフォーム管理者
- **前提条件**: 対象の親 Issue が存在する
- **正常フロー**: （現行の `workflow_dispatch` フローと同じ）

### 2.2 機能一覧

| 機能ID | 機能名                                          | 説明                                                                 | 優先度 |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------- | ------ |
| F-001  | Issue 本文のファクト化（weekly-npm-check）      | weekly-npm-body.md からエージェント指示・受け入れ基準・対応手順を削除 | 高     |
| F-002  | Issue 本文のファクト化（daily-refactoring）     | daily-refactoring-body.md からエージェント指示を削除                 | 高     |
| F-003  | Issue 本文のファクト化（weekly-docs-review）    | weekly-review-body.md から「担当者にアサイン」指示等を削除           | 中     |
| F-004  | `create-task-issues.yml` の `workflow_call` 対応 | 他ワークフローから呼び出せるよう `workflow_call` トリガーを追加       | 高     |
| F-005  | 定期ワークフローからの `create-task-issues` 呼び出し | 各定期ワークフローの Issue 作成後に `create-task-issues.yml` を呼び出す | 高     |
| F-006  | サブ Issue へのエージェント割り当て             | 「タスクドキュメント作成」サブ Issue に @copilot をアサイン          | 中     |

### 2.3 想定画面の概要

画面変更なし（GitHub Actions ワークフローと GitHub Issue のみ）

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目         | 要件                                     |
| ------------ | ---------------------------------------- |
| 応答時間     | サブ Issue 作成を含め 5 分以内に完了     |
| 信頼性       | Issue 作成失敗時はエラーをサマリーに記録 |

### 3.2 セキュリティ要件

- `GITHUB_TOKEN` の権限は `issues: write` のみ（最小権限原則を維持）
- `workflow_call` 呼び出し時も同様の権限スコープを維持する

### 3.3 保守性・拡張性要件

- 将来的に新しい定期ワークフローが追加された場合、同じ `workflow_call` パターンで `create-task-issues.yml` を呼び出せること
- Issue 本文テンプレート（`.github/workflows/templates/`）と生成スクリプト（`.github/workflows/scripts/`）は独立して編集可能であること

---

## 4. ドメインオブジェクト

| エンティティ           | 説明                                                           |
| ---------------------- | -------------------------------------------------------------- |
| 親 Issue               | 定期ワークフローが作成する事実のみを記述した Issue             |
| タスクドキュメント作成 | 親 Issue に紐付けられるサブ Issue。task.proposal agent が担当  |
| 実装                   | 親 Issue に紐付けられるサブ Issue。task.implement agent が担当 |
| クリーンアップ         | 親 Issue に紐付けられるサブ Issue。完了後の後処理を担当        |
| `create-task-issues.yml` | サブ Issue を作成・紐付けする共有ワークフロー                  |

---

## 5. スコープ外

- ❌ サブ Issue 作成後のエージェント自動割り当て完全自動化（GitHub Copilot のアサイン仕組みに依存するため、本改善では「アサイン可能な状態」にすることに留める）
- ❌ 既存の Issue（改善前に作成済みのもの）への遡及対応
- ❌ Issue テンプレート（`.github/ISSUE_TEMPLATE/`）の変更
- ❌ 定期ワークフローの実行スケジュール変更

---

## 6. 用語集

| 用語                 | 定義                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------- |
| 事実（ファクト）     | エージェントへの指示・対応手順を含まない、実行結果・検出結果のみの情報                |
| workflow_call        | GitHub Actions の reusable workflow 機能。別ワークフローから呼び出せる                |
| サブ Issue           | GitHub の Sub Issue 機能で親 Issue に紐付けられた Issue                               |
| 定期ワークフロー     | weekly-npm-check.yml / weekly-docs-review.yml / daily-refactoring-check.yml の総称   |

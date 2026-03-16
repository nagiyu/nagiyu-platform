<!--
    このドキュメントは開発時のみ使用します。
    本タスクは GitHub Actions ワークフロー改善（プラットフォームタスク）のため、
    サービス固有の docs/services/ への統合は不要。
    開発完了後に tasks/issue-2240-periodic-issue-improvement/ ディレクトリごと削除します。
-->

# 定期 Issue の改善 - 要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

週次 NPM 管理チェックおよび週次ドキュメントレビューの定期 Issue を自動作成するフローが存在する。
しかし現状では、作成される Issue の本文に実装手順や担当エージェントへの指示が直接含まれており、
`task.implement` エージェントによる実装を前提とした構造になっている。

本改善では、定期 Issue を「事実の記録のみ」に簡素化し、
`create-task-issues.yml` ワークフローを経由して作業用サブ Issue（タスクドキュメント作成・実装・クリーンアップ）を
自動的に作成・エージェントアサインする形に変更する。

### 1.2 対象

- プラットフォーム開発者・GitHub Actions ワークフロー

### 1.3 ビジネスゴール

- 定期 Issue の役割を「事実の報告」に限定し、作業フローを明確に分離する
- 各作業用サブ Issue に適切なエージェントを自動アサインすることで、作業開始のコストを下げる

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-001: 週次 NPM 管理チェック Issue の事実化

- **概要**: 週次 NPM チェックで作成される Issue を事実のみの報告に変更する
- **アクター**: GitHub Actions（スケジュール実行）
- **正常フロー**:
    1. `weekly-npm-check.yml` が週次スケジュールで実行される
    2. NPM パッケージの状態（脆弱性・更新・重複・バージョン不整合）を検出する
    3. 検出結果のみを本文に含む親 Issue を作成する（実装指示を含まない）
    4. `create-task-issues.yml` を呼び出し、3 つのサブ Issue を作成・エージェントアサインする

#### UC-002: 週次ドキュメントレビュー Issue の事実化

- **概要**: 週次ドキュメントレビューで作成される Issue を事実のみの報告に変更する
- **アクター**: GitHub Actions（スケジュール実行）
- **正常フロー**:
    1. `weekly-docs-review.yml` が週次スケジュールで実行される
    2. ドキュメント更新状況・方針変更を検出する
    3. 検出結果のみを本文に含む親 Issue を作成する（エージェント指示を含まない）
    4. `create-task-issues.yml` を呼び出し、3 つのサブ Issue を作成・エージェントアサインする

#### UC-003: サブ Issue へのエージェント自動アサイン

- **概要**: `create-task-issues.yml` で作成するサブ Issue に Copilot エージェントを自動アサインする
- **アクター**: `create-task-issues.yml` ワークフロー
- **正常フロー**:
    1. 「タスクドキュメント作成」Issue を作成し、Copilot をアサインする
    2. 「実装」Issue を作成し、Copilot をアサインする
    3. 「クリーンアップ」Issue を作成し、Copilot をアサインする

#### UC-004: create-task-issues.yml の workflow_call 対応

- **概要**: `create-task-issues.yml` を他のワークフローから呼び出せるようにする
- **アクター**: 定期 Workflow（weekly-npm-check.yml / weekly-docs-review.yml）
- **正常フロー**:
    1. 呼び出し元ワークフローが `issue_number` を渡して `create-task-issues.yml` を呼び出す
    2. `create-task-issues.yml` がサブ Issue を作成してエージェントアサインする

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001  | NPM Issue テンプレート簡素化 | 実装指示・受け入れ基準セクションを削除し、事実報告のみにする | 高 |
| F-002  | docs-review Issue エージェント指示削除 | 担当者アサイン指示を削除し、検出情報のみにする | 高 |
| F-003  | create-task-issues.yml workflow_call 対応 | 他ワークフローから呼び出せる `on: workflow_call` トリガーを追加する | 高 |
| F-004  | サブ Issue へのエージェントアサイン | 作成するサブ Issue に Copilot をアサインする | 高 |
| F-005  | weekly-npm-check.yml からの呼び出し | Issue 作成後に create-task-issues.yml を呼び出す | 高 |
| F-006  | weekly-docs-review.yml からの呼び出し | Issue 作成後に create-task-issues.yml を呼び出す | 高 |

---

## 3. 非機能要件

### 3.1 後方互換性

- 既存の `workflow_dispatch` による手動実行の動作を維持すること

### 3.2 保守性・拡張性要件

- 将来的に他の定期 Issue も同じフローに乗せられるよう、`create-task-issues.yml` を汎用的に保つこと

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| 親 Issue | 事実を記録する定期 Issue（NPM チェック・docs レビュー） |
| サブ Issue | 作業単位の Issue（タスクドキュメント作成・実装・クリーンアップ） |
| Copilot エージェント | サブ Issue にアサインされる自動実行エージェント |

---

## 5. スコープ外

- ❌ `daily-refactoring-check.yml` の変更（既に task.proposal エージェントへの指示形式になっている）
- ❌ Issue テンプレートの内容変更以外のワークフロー機能追加
- ❌ サブ Issue のラベル自動付与（必要に応じて後で追加）

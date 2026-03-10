# 週次リファクタリング Issue 自動作成ワークフローの追加

## 概要

コードの共通化を専門とするリファクタリング Issue を毎日実行し、オープンな同一ラベルの Issue が存在しない場合に新規作成するワークフローを追加する。
Issue には `task.proposal` エージェントを割り当て、エージェントが自律的に調査・計画立案を行えるような内容を含む。
重複 Issue を防ぐため、作成前に同一ラベルのオープン Issue を確認し、既存 Issue がある場合は新規作成をスキップする。

## 関連情報

- Issue: #TBD（週次リファクタリング Issue 自動作成ワークフロー）
- タスクタイプ: プラットフォームタスク
- 参照ワークフロー:
    - `.github/workflows/weekly-docs-review.yml`
    - `.github/workflows/weekly-npm-check.yml`

## 要件

### 機能要件

- FR1: 毎日、リファクタリング（コードの共通化）を目的とした Issue を自動作成する
- FR2: `task.proposal` エージェントが適切に計画立案できる内容を Issue に含める
    - 調査対象のサービス・ライブラリ一覧
    - コードの共通化観点のチェックポイント
- FR3: 同一ラベル（`code-consolidation`）のオープン Issue が存在する場合、新規 Issue 作成をスキップする
- FR4: スキップした場合も GitHub Step Summary に理由を記録する
- FR5: 手動実行（`workflow_dispatch`）にも対応する
- FR6: 将来的に「テスト観点」「脆弱性調査」等の横展開がしやすい構成にする

### 非機能要件

- NFR1: 毎日 18:00 UTC（翌 3:00 JST）に実行する
- NFR2: スクリプトは `.github/workflows/scripts/` に配置し、ワークフロー本体と分離する
- NFR3: Issue 本文のテンプレートは `.github/workflows/templates/` に配置する
- NFR4: ワークフロー名・ラベル・テンプレートの命名は既存パターンに準拠する

## 実装のヒント

### ファイル構成

```
.github/workflows/
├── daily-refactoring-check.yml           # 新規ワークフロー
├── scripts/
│   └── prepare-refactoring-issue.sh      # Issue 本文生成スクリプト（新規）
└── templates/
    └── daily-refactoring-body.md         # Issue 本文テンプレート（新規）
```

### ワークフローの処理フロー

1. **日付情報の取得**: 年・月・日付を取得してタイトルを生成
2. **重複チェック**: `gh issue list --label "code-consolidation" --state open` で既存オープン Issue を確認
    - オープン Issue が存在する場合 → オープン Issue の番号を Step Summary に記録してスキップ（ワークフロー自体は成功で終了）
    - オープン Issue が存在しない場合 → 次ステップへ
3. **コンテキスト収集**: リポジトリのサービス・ライブラリ一覧を収集
4. **Issue 本文生成**: テンプレートに変数を埋め込んでスクリプトで生成
5. **Issue 作成**: `gh issue create` で作成
6. **Summary 出力**: 作成結果を GitHub Step Summary に記録

### ラベル設計

新規ラベルとして以下を使用（GitHub UI で事前作成済み）:
- `refactoring`: リファクタリング全般（将来の横展開でも共用）
- `code-consolidation`: コードの共通化専門（重複チェックのキーとなるラベル）

重複チェックは `code-consolidation` ラベルのみで行い、`refactoring` は分類用として使う。

### Issue 本文の構成方針

`task.proposal` エージェントが調査・計画立案を行うために必要な情報を含める:

1. **エージェントへの指示**: `task.proposal` エージェントが実行すべき内容の説明
2. **調査対象**: リポジトリ内のサービス・ライブラリ一覧（自動収集）
3. **調査観点（コードの共通化）**:
    - 複数サービス間で重複している実装パターン
    - `libs/` への切り出しが可能なユーティリティ関数・コンポーネント
    - `libs/` 配下のパッケージで提供済みの機能を各サービスが独自実装していないか
    - 型定義の重複（複数サービスで同一インターフェースが定義されていないか）
4. **実施範囲の制限**: `libs/` の依存方向は `docs/development/architecture.md` を参照すること
5. **参考ドキュメント**: `docs/development/rules.md`, `docs/development/architecture.md` へのリンク

### スクリプト実装方針

`prepare-refactoring-issue.sh` は `prepare-review-issue.sh` と同様に Bash スクリプトとして実装し、
環境変数経由で値を受け取り、テンプレートファイルの変数を置換して Issue 本文を標準出力に書き出す。

## タスク

### Phase 1: ラベルとテンプレートの準備

- [x] T001: `refactoring` ラベル（説明: `リファクタリング全般`）を GitHub UI で手動作成済み
- [x] T002: `code-consolidation` ラベル（説明: `コードの共通化`）を GitHub UI で手動作成済み
- [ ] T003: `.github/workflows/templates/daily-refactoring-body.md` を作成
    - `task.proposal` エージェントへの指示文
    - 調査対象サービス・ライブラリ一覧（`{{SERVICE_LIST}}` プレースホルダー）
    - コードの共通化の調査観点チェックリスト
    - 参考ドキュメントリンク

### Phase 2: スクリプトとワークフローの作成

- [ ] T004: `.github/workflows/scripts/prepare-refactoring-issue.sh` を作成
    - 環境変数: `SERVICE_LIST`, `NEXT_DATE`, `CREATE_TIME`
    - テンプレートファイルを読み込み、変数置換して本文を標準出力
    - ※重複チェックのスキップ処理はワークフロー側で完結させ、スクリプトは Issue 本文生成のみを担う
- [ ] T005: `.github/workflows/daily-refactoring-check.yml` を作成
    - スケジュール: 毎日 18:00 UTC（翌 3:00 JST）
    - 権限: `issues: write`, `contents: read`
    - Step 1: 日付情報取得
    - Step 2: 翌日日付計算
    - Step 3: オープン Issue の重複チェック（`code-consolidation` ラベル）
    - Step 4: サービス・ライブラリ一覧の収集（`services/` と `libs/` のディレクトリ名を列挙）
    - Step 5: Issue 本文生成（スクリプト呼び出し）
    - Step 6: Issue 作成（`refactoring,code-consolidation` ラベル付き）
    - Step 7: GitHub Step Summary への出力

### Phase 3: ラベルの事前作成

- [x] T006: GitHub UI で `refactoring`, `code-consolidation` ラベルを手動作成済み

### Phase 4: 動作確認

- [ ] T007: `workflow_dispatch` で手動実行し、Issue が正しく作成されることを確認
- [ ] T008: 既にオープン Issue がある状態で再実行し、スキップされることを確認
- [ ] T009: 作成された Issue に `task.proposal` エージェントを手動でアサインし、計画立案が正しく行えることを確認

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md) - CI/CD ルール（第5部）
- [ブランチ戦略](../docs/branching.md) - ワークフロー設計の参考
- [アーキテクチャ方針](../docs/development/architecture.md) - ライブラリ依存関係の参考

## 備考・未決定事項

- **スケジュール**: 毎日 18:00 UTC（翌 3:00 JST）で実施する
- **ラベル作成**: GitHub UI で手動作成済み
- **`task.proposal` エージェントのアサイン**: Issue 作成後に手動でアサインする
- **将来の横展開**: テスト観点、脆弱性調査の Issue ワークフローを追加する場合、`refactoring` ラベルを共用し、サブラベル（`test-coverage`, `vulnerability-scan` 等）で区別する設計を推奨

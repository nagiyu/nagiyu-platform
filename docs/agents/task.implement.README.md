# Task Implementation Agent - 使用ガイド

## 概要

`task.implement.agent.md` は、nagiyu-platformのタスクを**ドキュメント駆動**で実装するための汎用 GitHub Copilot Agent です。

**重要**: このエージェントは **GitHub Issue に割り当てて使用** することを前提として設計されています。

## 動作原則

1. **GitHub Issue中心**: Issueに割り当てられて動作し、Issueコメントで進捗を報告
2. **ドキュメントが正（Source of Truth）**: 実装は常にドキュメントに記載された仕様に従う
3. **ドキュメント優先の更新**: 不明瞭な箇所があれば実装前にドキュメントを更新
4. **一貫性の維持**: 全てのドキュメント間（要件定義、基本設計、詳細設計、実装）で齟齬を生まない
5. **透明性**: 進捗、ブロッカー、決定事項をIssueコメントで明確に報告
6. **柔軟性**: タスクごとに異なるドキュメント構造を許容

## 使用方法

### 基本的な使い方

1. **GitHub Issueを作成**:
   ```markdown
   # タスク #69: Tools アプリの追加

   ## 概要
   便利な開発ツールを集約したWebアプリケーションを実装する

   ## 関連ドキュメント
   - docs/services/tools/README.md
   - docs/services/tools/requirements.md
   - docs/services/tools/architecture.md
   - docs/services/tools/deployment.md
   ```

2. **エージェントをIssueに割り当て**:
   GitHub の UI で `@task.implement` エージェントをIssueに割り当てる

3. **エージェントが自動的に**:
   - Issueからタスク番号（#69）を特定
   - `tasks/69-*.md` ファイルを読み込む
   - 関連ドキュメントを全て読み込む
   - ドキュメントの一貫性を検証
   - 実装計画をIssueコメントで報告
   - 実装を開始

### エージェントとのやりとり

エージェントは以下のタイミングでIssueコメントを投稿します:

1. **開始時**: 実装計画と読み込んだドキュメントの概要
2. **ドキュメント不整合検出時**: 問題点と修正案の提示
3. **各フェーズ/イテレーション完了時**: 進捗報告
4. **ブロッカー遭遇時**: ブロッカーの詳細と対処方法の提案
5. **完了時**: 実装サマリーと完了報告

## 対応可能なタスクタイプ

- **新機能開発**: 新しいサービスやアプリケーションの実装
- **機能追加**: 既存システムへの機能追加
- **バグ修正**: ドキュメント化された不具合の修正
- **リファクタリング**: コードベースの改善
- **インフラ構築**: AWS、GCP等のインフラストラクチャ構築
- **ドキュメント作成**: 設計書、仕様書の作成・更新
- **パフォーマンス改善**: 性能最適化
- **セキュリティ強化**: セキュリティ対策の実装

## 前提条件

### 必須
- GitHub Issueが作成されている
- Issueに関連ドキュメントのパスが明示的に記載されている

### 推奨
- 親タスクファイル（`tasks/` 配下）への参照（全体像把握のため）
- 基本的なドキュメント構造が存在（最低限README.mdまたは要件定義）

### 重要な注意点

**tasksファイルとIssueの関係**:
- `tasks/` 配下のファイル = 総括的なタスク管理ファイル（全体像、フェーズ、依存関係）
- 個別のIssue = 個別の実装単位（具体的な作業）
- Issue番号とtasksファイルの番号は **必ずしも一致しない**

**例**:
```
tasks/69-add-tools.md  （総括タスク: Toolsアプリ全体）
  ├── Issue #100: Phase 3.1 環境セットアップ
  ├── Issue #101: Phase 3.2 トップページ実装
  ├── Issue #102: Phase 3.3 乗り換え変換ツール実装
  └── Issue #103: Phase 4 インフラ構築
```

### プラットフォームのドキュメント構造

nagiyu-platformは複数のアプリケーションとインフラをホストするプラットフォームです。ドキュメントは以下のように階層化されています:

```
docs/
├── README.md                        # プラットフォーム全体の目次
├── branching.md                     # ブランチ戦略
├── agents/                          # エージェント関連ドキュメント
│   └── task.implement.README.md
├── services/                        # アプリケーション別ドキュメント
│   └── {サービス名}/               # 例: tools
│       ├── README.md                # 概要とドキュメント一覧
│       ├── requirements.md          # 要件定義書
│       ├── architecture.md          # アーキテクチャ設計書（基本設計・詳細設計を含む）
│       ├── deployment.md            # デプロイ手順書
│       └── appendix/                # 補足資料（任意）
│           ├── glossary.md          # 用語集
│           ├── decision-log.md      # 意思決定ログ
│           └── ...
│
│   注: 標準構造はガイドラインであり、サービスごとに適切な構成を選択可能
└── infra/                           # インフラストラクチャドキュメント
    ├── README.md                    # インフラドキュメント目次
    ├── architecture.md              # 全体設計と構成
    ├── setup.md                     # 初回セットアップ手順
    ├── deploy.md                    # デプロイ手順
    └── shared/                      # 共有リソース
        ├── README.md
        ├── iam.md                   # IAM設計と運用
        ├── vpc.md                   # VPC・ネットワーク設計
        ├── acm.md                   # SSL/TLS証明書管理
        └── cloudfront.md            # CloudFront設計と運用
```

**注**: 全てのドキュメントが必須ではありません。存在するドキュメントのみ読み込まれます。

## エージェントの動作フロー

### 1. 開始フェーズ

エージェントがIssueに割り当てられると:

1. Issueから タイトル、関連ドキュメント、親タスクへの参照を取得
2. 親タスクファイル（記載されている場合）を読み込んで全体像を把握
3. Issue に明示された関連ドキュメントを全て読み込む
4. ドキュメント間の整合性を検証
5. **Issueコメントで実装計画を報告**:
   ```markdown
   ## 実装開始

   Issue #100: Phase 3.1 環境セットアップ の実装を開始します。

   ### 親タスク
   tasks/69-add-tools.md (Toolsアプリ追加)

   ### 読み込んだドキュメント
   - ✅ docs/services/tools/README.md
   - ✅ docs/services/tools/requirements.md
   - ✅ docs/services/tools/architecture.md
   - ✅ docs/services/tools/deployment.md

   ### 実装スコープ
   Phase 3.1: 環境セットアップ

   ### 実行タスク
   1. Next.js プロジェクトの初期化
   2. 依存関係のインストール
   3. 基本設定ファイルの作成

   実装を開始します。
   ```

### 2. 実装フェーズ

各イテレーションまたはフェーズ完了時に**Issueコメントで進捗報告**:

```markdown
## Phase 3.1 完了: 環境セットアップ

### 完了したタスク
- ✅ Next.js 15 プロジェクト初期化
- ✅ Material UI 6 インストール
- ✅ TypeScript設定
- ✅ ESLint/Prettier設定

### 実装内容
- package.json, tsconfig.json, eslint.config.js を作成
- Material UIのテーマ設定を architecture.md に従って実装

### 次のステップ
Phase 3.2: 最小限のページ実装に進みます
```

### 3. ドキュメント不整合検出時

問題を発見したら**停止してIssueコメントで報告**:

```markdown
## ⚠️ ドキュメント不整合を検出

実装を一時停止しました。

### 問題箇所
`docs/services/tools/architecture.md` の乗り換えパーサー仕様

### 詳細
入力フォーマットの詳細が requirements.md と矛盾しています:
- requirements.md: "テキストエリアまたはクリップボードから入力"
- architecture.md: "テキストエリアのみ対応"と記載

### 提案
architecture.md を以下のように更新することを提案します:

\`\`\`markdown
#### 入力方法
- テキストエリアに手動で貼り付け
- クリップボード読み取りボタンで自動取得（Clipboard API使用）
\`\`\`

この修正を承認いただけますか？
承認いただけましたら、ドキュメントを更新して実装を再開します。
```

### 4. 完了フェーズ

全てのタスク完了時に**最終報告をIssueコメントで投稿**:

```markdown
## ✅ 実装完了

タスク #69: Tools アプリの追加 が完了しました。

### 実装サマリー
- Phase 3: MVP実装 ✅
- Phase 4: インフラ構築とデプロイ ✅
- Phase 5: イテレーティブ機能開発 ✅
- Phase 6: テスト ✅

### 成果物
- Next.js アプリケーション（apps/tools/）
- CloudFormation テンプレート（infra/tools/）
- GitHub Actions ワークフロー（.github/workflows/deploy-tools.yml）
- 全ドキュメント更新済み

### テスト結果
- 単体テスト: 全てパス (カバレッジ 85%)
- E2Eテスト: 全てパス
- デプロイ検証: 開発環境で動作確認済み

### デプロイ状況
- 開発環境: https://tools-dev.nagiyu.com （デプロイ済み）
- 本番環境: 未デプロイ（別タスクで実施予定）

このIssueをクローズしても問題ありません。
```

## 使用例

### 例1: 新機能開発の個別フェーズ実装

**親タスク**: `tasks/69-add-tools.md` (Toolsアプリ全体の総括タスク)

**Issue #100: Phase 3.1 環境セットアップ**

```markdown
# Phase 3.1: 環境セットアップ

## 親タスク
tasks/69-add-tools.md (Toolsアプリ追加)

## 概要
Toolsアプリの開発環境をセットアップする

## 実装スコープ
- Next.js 15 プロジェクトの初期化
- Material UI 6 のインストールと設定
- TypeScript、ESLint、Prettier の設定

## 関連ドキュメント
- docs/services/tools/README.md
- docs/services/tools/requirements.md
- docs/services/tools/architecture.md
- docs/services/tools/deployment.md
```

エージェントを割り当てると:
1. 親タスク `tasks/69-add-tools.md` を読み込んで全体像を把握
2. 関連ドキュメントを読み込んで環境セットアップの仕様を確認
3. Phase 3.1 のタスクのみを実装
4. 完了したら Issue をクローズ

### 例2: バグ修正

**Issue #85: ログイン後のリダイレクトが動作しない**

```markdown
# ログイン後のリダイレクトが動作しない

## 症状
ログイン成功後、ダッシュボードにリダイレクトされるべきだが、ログイン画面のまま

## 関連ドキュメント
- docs/services/auth/requirements.md
- docs/services/auth/architecture.md

## 期待される修正
architecture.md の認証フロー仕様に従って実装を修正
```

エージェントがドキュメントと実装を照らし合わせて修正します。

### 例3: インフラ構築

**Issue #105: 共有VPCとネットワーク構築**

```markdown
# 共有VPCとネットワーク構築

## 概要
全サービスで共有するVPCとサブネット構成を構築する

## 関連ドキュメント
- docs/infra/README.md
- docs/infra/architecture.md
- docs/infra/setup.md
- docs/infra/shared/vpc.md

## 要件
- VPC設計に従ったCloudFormationテンプレート作成
- パブリック/プライベートサブネットの構成
- NATゲートウェイの設定
```

エージェントがインフラドキュメントに従って共有VPCを構築します。

### 例4: アプリケーションのデプロイ

**Issue #110: Tools アプリの本番環境デプロイ**

```markdown
# Tools アプリの本番環境デプロイ

## 親タスク
tasks/69-add-tools.md (Toolsアプリ追加)

## 概要
開発環境で検証済みのToolsアプリを本番環境にデプロイ

## 関連ドキュメント
- docs/services/tools/deployment.md
- docs/infra/deploy.md

## 要件
deployment.md の手順に厳密に従ってデプロイ
```

エージェントがデプロイ手順書に従って本番環境を構築します。

## ベストプラクティス

### 1. Issueテンプレートの作成

`.github/ISSUE_TEMPLATE/task.md` を作成:

```markdown
---
name: タスク実装
about: ドキュメント駆動でタスクを実装
labels: task
assignees: task.implement
---

# タスク #{番号}: {タイトル}

## 概要
{タスクの概要}

## 関連ドキュメント
- docs/{プロジェクト}/README.md
- docs/{プロジェクト}/requirements.md
- docs/{プロジェクト}/architecture.md
- docs/{プロジェクト}/deployment.md

注: サービスごとに必要なドキュメントは異なります。存在するドキュメントのみを列挙してください。

## 備考
{追加情報}
```

### 2. タスクファイルの整備

`tasks/{番号}-{タイトル}.md` には必ず「関連ドキュメント」セクションを記載:

```markdown
## 関連ドキュメント

- [要件定義書](../services/tools/requirements.md)
- [アーキテクチャ設計書](../services/tools/architecture.md)
- [デプロイ手順書](../services/tools/deployment.md)
```

### 3. 進捗確認

エージェントの進捗はIssueコメントで確認できます:
- 各フェーズ完了時にコメント
- 問題発生時に即座にコメント
- 完了時に最終サマリーをコメント

## トラブルシューティング

### Q: エージェントが開始しない

A: Issueに以下が記載されているか確認:
   - タスク番号
   - 関連ドキュメントのパス
   - `tasks/` ディレクトリに対応するタスクファイルが存在

### Q: エージェントが途中で止まった

A: Issueコメントを確認してください。
   - ドキュメント不整合を検出した場合、修正案が提示されています
   - 承認コメントを投稿すると再開します

### Q: ドキュメント構造が標準と異なる

A: 問題ありません。エージェントは柔軟に対応します。
   Issueまたはタスクファイルに全ドキュメントのパスを明記してください。

### Q: 複数のタスクを並行実行したい

A: 各タスクごとにIssueを作成し、それぞれにエージェントを割り当ててください。

## エージェントの制約事項

1. **Issueベース**: GitHub Issueに割り当てて使用することが前提
2. **ドキュメント必須**: 最低限のドキュメント（README または要件定義）が必要
3. **ドキュメント優先**: ドキュメントと異なる実装は行わない（提案はする）
4. **手動設定**: AWS認証情報などの機密情報設定は手動で行う必要がある

## tools.implement エージェントとの違い

| 項目 | tools.implement | task.implement |
|------|----------------|----------------|
| **対象** | Tools アプリ専用 | 全タスク対応 |
| **使用方法** | コマンド実行 | Issue割り当て |
| **ドキュメントパス** | `docs/services/tools/` 固定 | Issue/タスクから取得 |
| **進捗報告** | 対話的 | Issueコメント |
| **柔軟性** | 低（特定プロジェクト用） | 高（汎用） |
| **推奨用途** | - | 全ての新規タスク |

## 推奨事項

**新しいタスクには `task.implement` エージェントをGitHub Issueに割り当てて使用してください。**

Issueベースの運用により:
- 進捗が可視化される
- コミュニケーション履歴が残る
- 複数タスクの並行実行が容易
- チーム全体で状況を把握しやすい

---

**作成日**: 2025-12-16
**最終更新日**: 2025-12-16
**用途**: nagiyu-platform の全タスク実装（GitHub Issue割り当て型）

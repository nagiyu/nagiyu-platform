# タスク #69: Tools アプリの追加

**関連Issue**: #69
**最終更新日**: 2025-12-16
**ステータス**: 進行中（詳細設計完了、承認待ち）

---

## 概要

便利な開発ツールを集約した Web アプリケーション「Tools」を nagiyu-platform に追加する。
MVP では乗り換え案内変換ツールを実装し、将来的に JSON Formatter や Base64 Encoder/Decoder などのツールを追加予定。

**技術スタック**: Next.js 15 (App Router, SSR), Material UI 6, AWS Lambda (Container), CloudFront

---

## タスク一覧

### フェーズ1: ドキュメント作成（要件定義・基本設計）

#### 1.1 ドキュメント構造の整備

- [x] ドキュメント構造の決定
- [x] README.md の作成
- [x] 各フェーズドキュメントの骨組み作成
    - [x] requirements.md
    - [x] basic-design.md
    - [x] detailed-design.md
    - [x] implementation.md
    - [x] testing.md
    - [x] deployment.md
- [x] appendix ドキュメントの作成
    - [x] glossary.md
    - [x] decision-log.md
    - [x] tools-catalog.md

#### 1.2 要件定義

- [x] ビジネス要件の定義
- [x] 機能要件の定義（MVP + 将来）
- [x] 非機能要件の定義
- [x] ユースケースの定義
- [x] ユースケース図の作成（usecase-diagram.drawio）
- [x] 制約事項・前提条件の整理
- [x] 用語定義
- [x] クリップボード読み取り機能の要件追加

#### 1.3 基本設計

- [x] 対話による技術選定（SSR, App Router, Lambda Web Adapter等）
- [x] システム全体構成の設計
- [x] システム全体構成図の作成（system-architecture.drawio）
- [x] AWS インフラ構成図の作成（aws-architecture.drawio）
- [x] アプリケーションレイヤー図の作成（application-layers.drawio）
- [x] 技術スタックの決定
- [x] ディレクトリ構造の設計
- [x] CloudFormation スタック設計
- [x] API 設計
- [x] 画面遷移図の作成（screen-transition.drawio）
- [x] ワイヤーフレームの作成
    - [x] トップページ（wireframe-top.drawio）
    - [x] 乗り換え変換ツール（wireframe-transit.drawio）
- [x] クリップボード読み取り機能の設計追加
- [x] AWS構成図の修正（GitHub Actions配置、Secrets Manager接続等）
- [x] 基本設計書の承認

---

### フェーズ2: 詳細設計

#### 2.1 コンポーネント設計

- [x] 共通コンポーネントの詳細設計
    - [x] Header コンポーネント
    - [x] Footer コンポーネント
    - [x] ToolCard コンポーネント
- [x] ページコンポーネントの詳細設計
    - [x] トップページ（ツール一覧）
    - [x] 乗り換え変換ツールページ

#### 2.2 ビジネスロジック設計

- [x] 乗り換えパーサーのロジック設計
    - [x] 入力フォーマットの仕様定義
    - [x] パース処理のアルゴリズム設計
    - [x] エラーハンドリング設計
- [x] クリップボード操作の詳細設計
    - [x] Clipboard API の使用方法
    - [x] 権限エラーハンドリング
    - [x] フォールバック処理
- [x] データ変換ロジックの設計
    - [x] 出力フォーマットの仕様定義

#### 2.3 状態管理設計

- [x] アプリケーション状態の設計
    - [x] ツール一覧の状態管理
    - [x] 入力データの状態管理
    - [x] 変換結果の状態管理
    - [x] エラー状態の管理

#### 2.4 スタイリング設計

- [x] Material UI テーマ設計
    - [x] カラーパレット定義
    - [x] タイポグラフィ定義
    - [x] ブレークポイント設定
- [x] レスポンシブデザイン詳細
    - [x] モバイルレイアウト
    - [x] タブレットレイアウト
    - [x] デスクトップレイアウト

#### 2.5 インフラ詳細設計

- [x] CloudFormation テンプレート設計
    - [x] ECR リポジトリテンプレート
    - [x] Lambda 関数テンプレート
    - [x] CloudFront Distribution テンプレート
- [x] Dockerfile 設計
    - [x] ベースイメージ選定
    - [x] Lambda Web Adapter 統合
    - [x] 最適化設定
- [x] GitHub Actions ワークフロー設計
    - [x] ビルドジョブ
    - [x] テストジョブ
    - [x] デプロイジョブ

---

### フェーズ3: 実装

#### 3.1 環境セットアップ

- [ ] Next.js プロジェクトの初期化
- [ ] 必要な依存関係のインストール
    - [ ] Material UI
    - [ ] その他ライブラリ
- [ ] ESLint / Prettier 設定
- [ ] TypeScript 設定

#### 3.2 共通コンポーネント実装

- [ ] Layout コンポーネント
- [ ] Header コンポーネント
- [ ] Footer コンポーネント
- [ ] ToolCard コンポーネント

#### 3.3 ページ実装

- [ ] トップページ（ツール一覧）
    - [ ] ページコンポーネント
    - [ ] ツールカード一覧表示
    - [ ] レスポンシブレイアウト
- [ ] 乗り換え変換ツールページ
    - [ ] ページコンポーネント
    - [ ] 入力エリア実装
    - [ ] クリップボード読み取りボタン実装
    - [ ] 変換ロジック実装
    - [ ] 出力エリア実装
    - [ ] クリップボードコピー機能実装

#### 3.4 ビジネスロジック実装

- [ ] Yahoo 乗り換えパーサー
    - [ ] パース処理の実装
    - [ ] エラーハンドリング
    - [ ] テストケース作成
- [ ] クリップボード操作ユーティリティ
    - [ ] 読み取り処理
    - [ ] 書き込み処理
    - [ ] エラーハンドリング
- [ ] データフォーマッター
    - [ ] 出力フォーマット変換
    - [ ] テストケース作成

#### 3.5 API 実装

- [ ] ヘルスチェック API (`/api/health`)
- [ ] （将来）その他 API

#### 3.6 スタイリング実装

- [ ] Material UI テーマ設定
- [ ] グローバルスタイル
- [ ] レスポンシブデザインの実装

---

### フェーズ4: インフラ構築

#### 4.1 CloudFormation テンプレート作成

- [ ] ECR リポジトリ (`infra/tools/ecr.yaml`)
- [ ] Lambda 関数 (`infra/tools/lambda.yaml`)
- [ ] CloudFront Distribution (`infra/tools/cloudfront.yaml`)

#### 4.2 Docker イメージ作成

- [ ] Dockerfile 作成
- [ ] Lambda Web Adapter 統合
- [ ] ビルド＆テスト

#### 4.3 GitHub Actions ワークフロー作成

- [ ] CI/CD ワークフロー定義
- [ ] ビルドジョブ実装
- [ ] テストジョブ実装
- [ ] デプロイジョブ実装

#### 4.4 インフラデプロイ

- [ ] 開発環境 (dev) へのデプロイ
    - [ ] ECR スタック
    - [ ] Lambda スタック
    - [ ] CloudFront スタック
- [ ] 本番環境 (prod) へのデプロイ
    - [ ] ECR スタック
    - [ ] Lambda スタック
    - [ ] CloudFront スタック

#### 4.5 DNS 設定

- [ ] 開発環境ドメイン設定 (`dev-tools.example.com`)
- [ ] 本番環境ドメイン設定 (`tools.example.com`)

---

### フェーズ5: テスト

#### 5.1 単体テスト

- [ ] コンポーネントテスト
    - [ ] Header
    - [ ] Footer
    - [ ] ToolCard
    - [ ] トップページ
    - [ ] 乗り換え変換ツールページ
- [ ] ビジネスロジックテスト
    - [ ] Yahoo 乗り換えパーサー
    - [ ] クリップボード操作
    - [ ] データフォーマッター

#### 5.2 統合テスト

- [ ] ページ遷移テスト
- [ ] API 統合テスト
- [ ] クリップボード機能テスト

#### 5.3 E2E テスト

- [ ] ユーザーシナリオテスト
    - [ ] ツール一覧表示
    - [ ] 乗り換え情報変換フロー（手動貼り付け）
    - [ ] 乗り換え情報変換フロー（クリップボード読み取り）
    - [ ] クリップボードへのコピー

#### 5.4 ブラウザテスト

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

#### 5.5 レスポンシブテスト

- [ ] スマートフォン（各種サイズ）
- [ ] タブレット
- [ ] デスクトップ

#### 5.6 パフォーマンステスト

- [ ] ページロード時間測定
- [ ] Lighthouse スコア確認
- [ ] Lambda コールドスタート時間測定

---

### フェーズ6: デプロイ・リリース

#### 6.1 開発環境リリース

- [ ] 開発環境へのデプロイ
- [ ] 動作確認
- [ ] 不具合修正

#### 6.2 本番環境リリース

- [ ] 本番環境へのデプロイ
- [ ] 動作確認
- [ ] モニタリング設定確認

#### 6.3 ドキュメント最終化

- [ ] deployment.md の完成
- [ ] README.md の更新
- [ ] tools-catalog.md の更新（実装済みに移動）

---

### フェーズ7: PWA 対応（将来）

- [ ] Service Worker 実装
- [ ] manifest.json 作成
- [ ] オフライン対応
- [ ] インストールプロンプト実装

---

### フェーズ8: 将来の機能追加

#### 8.1 追加ツールの実装

- [ ] JSON Formatter（優先度: 高）
- [ ] Base64 Encoder/Decoder（優先度: 高）
- [ ] Hash Generator（優先度: 高）
- [ ] URL Encoder/Decoder（優先度: 中）
- [ ] JWT Decoder（優先度: 中）
- [ ] Timestamp Converter（優先度: 中）
- [ ] UUID Generator（優先度: 低）
- [ ] Color Picker（優先度: 低）

#### 8.2 機能強化

- [ ] ダークモード対応
- [ ] ツール検索機能
- [ ] お気に入り機能（ローカルストレージ）
- [ ] 使用履歴（ローカルストレージ）

---

## 関連ドキュメント

- [要件定義書](../docs/services/tools/requirements.md)
- [基本設計書](../docs/services/tools/basic-design.md)
- [詳細設計書](../docs/services/tools/detailed-design.md)
- [実装ガイド](../docs/services/tools/implementation.md)
- [テスト仕様書](../docs/services/tools/testing.md)
- [デプロイ手順](../docs/services/tools/deployment.md)

### Appendix

- [用語集](../docs/services/tools/appendix/glossary.md)
- [意思決定ログ](../docs/services/tools/appendix/decision-log.md)
- [ツールカタログ](../docs/services/tools/appendix/tools-catalog.md)

---

## 備考

- 各フェーズの作業完了後、該当ドキュメントを更新すること
- 新しい技術的決定があれば [decision-log.md](../docs/services/tools/appendix/decision-log.md) に記録すること
- 実装中に発見した課題や変更点があればドキュメントにフィードバックすること
- このタスクファイルは進捗に応じて随時更新すること
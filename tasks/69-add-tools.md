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

### フェーズ3: 最小実装（MVP基盤）

#### 3.1 環境セットアップ

- [ ] Next.js プロジェクトの初期化
- [ ] 必要な依存関係のインストール
    - [ ] Material UI
    - [ ] その他ライブラリ
- [ ] ESLint / Prettier 設定
- [ ] TypeScript 設定

#### 3.2 最小限のページ実装

- [ ] トップページ（Hello World レベル）
    - [ ] 基本的なページ構造
    - [ ] 簡易的な Header/Footer
    - [ ] "Coming Soon" メッセージ
- [ ] ヘルスチェック API (`/api/health`)

#### 3.3 Dockerfile 作成

- [ ] Dockerfile 作成
- [ ] Lambda Web Adapter 統合
- [ ] ローカルでのビルド＆動作確認

---

### フェーズ4: インフラ構築と初回デプロイ

#### 4.1 CloudFormation テンプレート作成

- [ ] ECR リポジトリ (`infra/tools/ecr.yaml`)
- [ ] Lambda 関数 (`infra/tools/lambda.yaml`)
- [ ] CloudFront Distribution (`infra/tools/cloudfront.yaml`)

#### 4.2 GitHub Actions ワークフロー作成

- [ ] CI/CD ワークフロー定義
- [ ] ビルドジョブ実装
- [ ] デプロイジョブ実装（開発環境）

#### 4.3 開発環境への初回デプロイ

- [ ] ECR スタックのデプロイ
- [ ] Lambda スタックのデプロイ
- [ ] CloudFront スタックのデプロイ
- [ ] DNS 設定（開発環境）
- [ ] 動作確認（Hello World が表示されること）

---

### フェーズ5: 段階的な機能実装とデプロイ（反復）

#### 5.1 イテレーション1: 共通コンポーネント

- [ ] Layout コンポーネント実装
- [ ] Header コンポーネント実装
- [ ] Footer コンポーネント実装
- [ ] Material UI テーマ設定
- [ ] デプロイ & 開発環境で確認

#### 5.2 イテレーション2: トップページ

- [ ] ToolCard コンポーネント実装
- [ ] トップページ（ツール一覧）実装
    - [ ] ページコンポーネント
    - [ ] ツールカード一覧表示
    - [ ] レスポンシブレイアウト
- [ ] グローバルスタイル適用
- [ ] デプロイ & 開発環境で確認

#### 5.3 イテレーション3: 乗り換え変換ツール（基本機能）

- [ ] 乗り換えパーサー実装
    - [ ] パース処理の実装
    - [ ] エラーハンドリング
    - [ ] 単体テスト作成
- [ ] データフォーマッター実装
    - [ ] 出力フォーマット変換
    - [ ] 単体テスト作成
- [ ] 乗り換え変換ページ実装（基本版）
    - [ ] ページコンポーネント
    - [ ] 入力エリア（テキストエリアのみ）
    - [ ] 変換ロジック統合
    - [ ] 出力エリア
- [ ] デプロイ & 開発環境で確認

#### 5.4 イテレーション4: クリップボード機能

- [ ] クリップボード操作ユーティリティ実装
    - [ ] 読み取り処理
    - [ ] 書き込み処理
    - [ ] エラーハンドリング
- [ ] クリップボード読み取りボタン追加
- [ ] クリップボードコピー機能追加
- [ ] デプロイ & 開発環境で確認

#### 5.5 イテレーション5: スタイリング最終調整

- [ ] レスポンシブデザインの最終調整
- [ ] アクセシビリティ対応
- [ ] UX 改善
- [ ] デプロイ & 開発環境で確認

---

### フェーズ6: テスト

#### 6.1 統合テスト（開発環境）

- [ ] ページ遷移テスト
- [ ] API 統合テスト
- [ ] クリップボード機能テスト

#### 6.2 E2E テスト（開発環境）

- [ ] ユーザーシナリオテスト
    - [ ] ツール一覧表示
    - [ ] 乗り換え情報変換フロー（手動貼り付け）
    - [ ] 乗り換え情報変換フロー（クリップボード読み取り）
    - [ ] クリップボードへのコピー

#### 6.3 ブラウザテスト

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

#### 6.4 レスポンシブテスト

- [ ] スマートフォン（各種サイズ）
- [ ] タブレット
- [ ] デスクトップ

#### 6.5 パフォーマンステスト

- [ ] ページロード時間測定
- [ ] Lighthouse スコア確認
- [ ] Lambda コールドスタート時間測定

---

### フェーズ7: 本番リリース

#### 7.1 本番環境インフラ構築

- [ ] 本番環境用 CloudFormation スタックデプロイ
    - [ ] ECR スタック
    - [ ] Lambda スタック
    - [ ] CloudFront スタック
- [ ] DNS 設定（本番環境）

#### 7.2 本番環境デプロイ

- [ ] GitHub Actions ワークフロー更新（本番デプロイ対応）
- [ ] 本番環境への初回デプロイ
- [ ] 動作確認
- [ ] モニタリング設定確認

#### 7.3 ドキュメント最終化

- [ ] deployment.md の完成
- [ ] README.md の更新
- [ ] tools-catalog.md の更新（実装済みに移動）

---

### フェーズ8: PWA 対応（将来）

- [ ] Service Worker 実装
- [ ] manifest.json 作成
- [ ] オフライン対応
- [ ] インストールプロンプト実装

---

### フェーズ9: 将来の機能追加

#### 9.1 追加ツールの実装

- [ ] JSON Formatter（優先度: 高）
- [ ] Base64 Encoder/Decoder（優先度: 高）
- [ ] Hash Generator（優先度: 高）
- [ ] URL Encoder/Decoder（優先度: 中）
- [ ] JWT Decoder（優先度: 中）
- [ ] Timestamp Converter（優先度: 中）
- [ ] UUID Generator（優先度: 低）
- [ ] Color Picker（優先度: 低）

#### 9.2 機能強化

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
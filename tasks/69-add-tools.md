# タスク #69: Tools アプリの追加

## 概要

便利な開発ツールを集約した Web アプリケーション「Tools」を nagiyu-platform に追加する。
フェーズ1 (v1.0.0) では乗り換え案内変換ツールを実装し、将来的に JSON Formatter や Base64 Encoder/Decoder などのツールを追加予定。

**技術スタック**: Next.js 15 (App Router, SSR), Material UI 6, AWS Lambda (Container), CloudFront

---

## フェーズ1 (v1.0.0) リリースロードマップ

### ステップ1: ドキュメント作成（要件定義・アーキテクチャ設計）

#### 1.1 ドキュメント構造の整備

- [x] ドキュメント構造の決定
- [x] README.md の作成
- [x] プロジェクトドキュメントの作成
    - [x] requirements.md (要件定義書)
    - [x] architecture.md (アーキテクチャ設計書)
    - [x] deployment.md (デプロイ手順書)
    - [x] tools-catalog.md (ツールカタログ)

#### 1.2 要件定義

- [x] ビジネス要件の定義
- [x] 機能要件の定義（MVP + 将来）
- [x] 非機能要件の定義
- [x] ユースケースの定義
- [x] 制約事項・前提条件の整理
- [x] クリップボード機能の要件追加

#### 1.3 アーキテクチャ設計

- [x] 技術選定（Next.js 15, Material UI 6, Lambda Web Adapter）
- [x] システム全体構成の設計
- [x] システムアーキテクチャ図の作成
    - [x] システム全体構成図 (system-architecture.drawio.svg)
    - [x] アプリケーションレイヤー図 (application-layers.drawio.svg)
    - [x] AWS インフラ構成図 (aws-architecture.drawio.svg)
    - [x] 画面遷移図 (screen-transition.drawio.svg)
    - [x] ワイヤーフレーム (wireframe-top.drawio.svg, wireframe-transit.drawio.svg)
- [x] ディレクトリ構造の設計
- [x] CloudFormation スタック設計
- [x] API 設計

---

### ステップ2: コンポーネント・ロジック設計

#### 2.1 コンポーネント設計

- [x] 共通コンポーネントの設計
    - [x] Header コンポーネント
    - [x] Footer コンポーネント
    - [x] ToolCard コンポーネント
    - [x] ThemeRegistry コンポーネント
- [x] ページコンポーネントの設計
    - [x] トップページ（ツール一覧）
    - [x] 乗り換え変換ツールページ

#### 2.2 ビジネスロジック設計

- [x] 乗り換えパーサーの設計
    - [x] 入力フォーマットの仕様定義
    - [x] パース処理のアルゴリズム設計
    - [x] エラーハンドリング設計
- [x] データフォーマッターの設計
    - [x] 出力フォーマットの仕様定義
- [x] クリップボード操作の設計
    - [x] Clipboard API の使用方法
    - [x] 権限エラーハンドリング

#### 2.3 状態管理・スタイリング設計

- [x] アプリケーション状態の設計（React useState/useEffect）
- [x] Material UI テーマ設計
    - [x] カラーパレット定義
    - [x] タイポグラフィ定義
    - [x] ブレークポイント設定
- [x] レスポンシブデザイン設計

#### 2.4 インフラ詳細設計

- [x] CloudFormation テンプレート設計
    - [x] ECR リポジトリテンプレート (infra/tools/ecr.yaml)
    - [x] Lambda 関数テンプレート (infra/tools/lambda.yaml)
    - [x] CloudFront テンプレート (infra/tools/cloudfront.yaml)
- [x] Dockerfile 設計
    - [x] Node.js 22 ベースイメージ選定
    - [x] Lambda Web Adapter 統合
    - [x] マルチステージビルド最適化
- [x] GitHub Actions ワークフロー設計
    - [x] ビルド・テスト・デプロイジョブ設計
    - [x] CloudFormation 統合設計

---

### ステップ3: 開発環境セットアップ

#### 3.1 プロジェクト初期化

- [x] Next.js プロジェクトの作成 (`services/tools/`)
- [x] 依存パッケージのインストール
    - [x] Next.js 15.1.6
    - [x] React 19.0.0
    - [x] Material UI 6.2.0
    - [x] TypeScript 5.7.3
- [x] 開発ツール設定
    - [x] ESLint 設定
    - [x] TypeScript 設定 (tsconfig.json)
    - [x] Jest 設定 (jest.config.ts, jest.setup.ts)
    - [x] Next.js 設定 (next.config.ts)

#### 3.2 ディレクトリ構造の構築

- [x] `src/app/` - App Router ページ
- [x] `src/components/` - Reactコンポーネント
- [x] `src/lib/` - ビジネスロジック
- [x] `src/styles/` - スタイル定義
- [x] `src/types/` - TypeScript型定義

---

### ステップ4: コア機能実装

#### 4.1 共通コンポーネント実装

- [x] ThemeRegistry コンポーネント (`src/components/ThemeRegistry.tsx`)
    - [x] Material UI テーマプロバイダー統合
    - [x] Emotion キャッシュ設定
- [x] Header コンポーネント (`src/components/layout/Header.tsx`)
    - [x] AppBar 実装
    - [x] レスポンシブ対応
- [x] Footer コンポーネント (`src/components/layout/Footer.tsx`)
    - [x] バージョン表示
    - [x] レスポンシブ対応
- [x] ToolCard コンポーネント (`src/components/tools/ToolCard.tsx`)
    - [x] Material UI Card ベース
    - [x] ホバーエフェクト

#### 4.2 テーマ・スタイル実装

- [x] Material UI テーマ定義 (`src/styles/theme.ts`)
    - [x] カラーパレット（プライマリ: #1976d2）
    - [x] タイポグラフィ設定
    - [x] ブレークポイント設定
    - [x] コンポーネント個別スタイル

#### 4.3 ページ実装

- [x] ルートレイアウト (`src/app/layout.tsx`)
    - [x] HTML構造定義
    - [x] ThemeRegistry 統合
    - [x] メタデータ設定
- [x] トップページ (`src/app/page.tsx`)
    - [x] ツールカード一覧表示
    - [x] Grid レスポンシブレイアウト
- [x] 乗り換え変換ツールページ (`src/app/transit-converter/page.tsx`)
    - [x] 入力フォーム
    - [x] 変換ボタン
    - [x] 結果表示エリア
    - [x] クリップボード機能統合
- [x] ヘルスチェック API (`src/app/api/health/route.ts`)
    - [x] ステータス、タイムスタンプ、バージョン応答

#### 4.4 ビジネスロジック実装

- [x] 乗り換えパーサー (`src/lib/parsers/transitParser.ts`)
    - [x] URL/テキスト解析
    - [x] 区間・時刻・料金抽出
    - [x] エラーハンドリング
    - [x] 単体テスト (`__tests__/transitParser.test.ts`)
- [x] データフォーマッター (`src/lib/formatters/formatters.ts`)
    - [x] Markdown形式出力
    - [x] 単体テスト (`__tests__/formatters.test.ts`)
- [x] クリップボードユーティリティ (`src/lib/clipboard.ts`)
    - [x] 読み取り処理
    - [x] 書き込み処理
    - [x] 権限エラーハンドリング
    - [x] 単体テスト (`__tests__/clipboard.test.ts`)

#### 4.5 型定義

- [x] ツール型定義 (`src/types/tools.ts`)
    - [x] Tool インターフェース
    - [x] TransitInfo インターフェース

---

### ステップ5: インフラストラクチャ構築

#### 5.1 Dockerイメージ作成

- [x] Dockerfile 作成 (`services/tools/Dockerfile`)
    - [x] Node.js 22 ベースイメージ
    - [x] マルチステージビルド
    - [x] Lambda Web Adapter v0.9.0 統合
    - [x] 最適化設定 (NODE_ENV=production)

#### 5.2 CloudFormation テンプレート作成

- [x] ECR リポジトリ (`infra/tools/ecr.yaml`)
    - [x] リポジトリ定義
    - [x] ライフサイクルポリシー（最新10イメージ保持）
- [x] Lambda 関数 (`infra/tools/lambda.yaml`)
    - [x] コンテナイメージベース関数
    - [x] Function URL 設定
    - [x] 環境変数設定 (NODE_ENV, PORT)
    - [x] IAM ロール設定
- [x] CloudFront Distribution (`infra/tools/cloudfront.yaml`)
    - [x] Lambda Function URL オリジン
    - [x] キャッシュ無効化設定（SSR対応）
    - [x] カスタムドメイン設定
    - [x] ACM証明書統合

#### 5.3 CI/CD パイプライン構築

- [x] GitHub Actions デプロイワークフロー (`.github/workflows/tools-deploy.yml`)
    - [x] ECR スタックデプロイ
    - [x] Docker イメージビルド＆プッシュ
    - [x] Lambda スタックデプロイ
    - [x] Function URL ヘルスチェック
    - [x] CloudFront スタックデプロイ
    - [x] ブランチ別環境分離 (develop → dev, master → prod)
- [ ] GitHub Actions PR検証ワークフロー (`.github/workflows/tools-pr.yml`)
    - [ ] Next.js ビルド検証
    - [ ] Docker イメージビルド検証
    - [ ] 単体テスト実行
    - [ ] 対象ブランチ: develop, integration/**
- [ ] ブランチ保護ルールの設定
    - [ ] develop ブランチでPR検証を必須化
    - [ ] integration/** ブランチでPR検証を必須化

---

### ステップ6: 品質保証・最適化

#### 6.1 テスト実装

- [x] 単体テスト
    - [x] transitParser テスト (17件)
    - [x] formatters テスト (4件)
    - [x] clipboard テスト (8件)
- [x] テスト実行環境
    - [x] Jest 設定
    - [x] React Testing Library 統合

#### 6.2 レスポンシブ対応・アクセシビリティ

- [x] レスポンシブデザイン実装
    - [x] モバイル最適化 (xs: 0-600px)
    - [x] タブレット対応 (sm: 600-900px)
    - [x] デスクトップ対応 (md: 900px以上)
- [x] アクセシビリティ対応
    - [x] aria-label 追加
    - [x] セマンティックHTML使用
    - [x] キーボードナビゲーション対応
    - [x] カラーコントラスト確認

#### 6.3 UX改善

- [x] ローディング状態表示
- [x] エラーハンドリング
- [x] Snackbar フィードバック
- [x] ボタンホバーエフェクト

---

### ステップ7: PWA対応

#### 7.1 PWA設定

- [ ] next-pwa パッケージのインストール
- [ ] next.config.ts の PWA 設定
    - [ ] Service Worker 設定
    - [ ] キャッシュ戦略設定
- [ ] manifest.json の作成
    - [ ] アプリ名・説明
    - [ ] アイコン設定（複数サイズ）
    - [ ] テーマカラー設定
    - [ ] 表示モード設定（standalone）
- [ ] アイコン画像の作成
    - [ ] 192x192 アイコン
    - [ ] 512x512 アイコン
    - [ ] ファビコン

#### 7.2 PWA機能実装

- [ ] オフラインページの作成
- [ ] Service Worker のキャッシュ戦略実装
    - [ ] 静的アセットのキャッシュ
    - [ ] API レスポンスのキャッシュ（必要に応じて）
- [ ] インストールプロンプト実装（オプション）
- [ ] オンライン/オフライン状態表示（オプション）

#### 7.3 PWAテスト

- [ ] ローカル環境でのPWAテスト
    - [ ] manifest.json 読み込み確認
    - [ ] Service Worker 登録確認
    - [ ] オフライン動作確認
- [ ] Lighthouse PWA スコア確認（目標: 90以上）
- [ ] インストール動作確認
    - [ ] Chrome（デスクトップ）
    - [ ] Chrome（モバイル）
    - [ ] Safari（iOS）

---

### ステップ7.5: 詳細表示トグル機能実装

#### 7.5.1 型定義追加

- [ ] `DisplaySettings` インターフェースを `src/types/tools.ts` に追加
- [ ] `DEFAULT_DISPLAY_SETTINGS` 定数を定義
- [ ] `TransitRoute` インターフェースに以下を追加
    - [ ] `transferCount?: number` プロパティ
    - [ ] `distance?: string` プロパティ

#### 7.5.2 パーサー拡張

- [ ] `src/lib/parsers/transitParser.ts` に乗換回数抽出処理を追加
    - [ ] 正規表現: `/乗換\s+(\d+)回/`
- [ ] 距離抽出処理を追加
    - [ ] 正規表現: `/距離\s+([\d.]+)\s*km/`
- [ ] 単体テストを追加 (`__tests__/transitParser.test.ts`)
    - [ ] 乗換回数抽出テスト
    - [ ] 距離抽出テスト

#### 7.5.3 フォーマッター拡張

- [ ] `src/lib/formatters/formatters.ts` を拡張
    - [ ] `formatTransitRoute()` に `DisplaySettings` パラメータを追加
    - [ ] 各設定項目に応じた条件分岐を実装
    - [ ] 乗換回数の出力処理を追加
    - [ ] 距離の出力処理を追加
- [ ] 単体テストを追加 (`__tests__/formatters.test.ts`)
    - [ ] 設定による表示/非表示テスト
    - [ ] デフォルト設定テスト

#### 7.5.4 UI実装

- [ ] `DisplaySettingsSection` コンポーネントを作成
    - [ ] Accordion で折りたたみ可能にする
    - [ ] 各チェックボックスを実装
        - [ ] 日付を表示
        - [ ] 所要時間を表示
        - [ ] 運賃を表示
        - [ ] 乗換回数を表示
        - [ ] 距離を表示
        - [ ] ルート詳細を表示（親チェックボックス）
            - [ ] 時刻範囲を表示
            - [ ] 路線名を表示
            - [ ] 番線情報を表示
- [ ] `src/app/transit-converter/page.tsx` に統合
    - [ ] `DisplaySettings` の state 管理
    - [ ] チェックボックス変更時の処理
    - [ ] フォーマッター呼び出し時に設定を渡す

#### 7.5.5 LocalStorage 連携

- [ ] LocalStorage への保存処理を実装
    - [ ] キー: `'transit-converter-display-settings'`
    - [ ] チェックボックス変更時に保存
- [ ] LocalStorage からの読み込み処理を実装
    - [ ] `useEffect()` で初期化時に読み込み
    - [ ] デフォルト設定とマージ
- [ ] エラーハンドリング
    - [ ] LocalStorage が使えない環境への対応

#### 7.5.6 Web Share Target 対応（PWA完了後）

- [ ] `manifest.json` に `share_target` セクションを追加
    - [ ] `action: "/transit-converter"`
    - [ ] `method: "GET"`
    - [ ] `params: { title, text, url }`
- [ ] URLパラメータ処理を実装
    - [ ] `useSearchParams()` で `url` / `text` パラメータを取得
    - [ ] 入力欄に自動挿入
    - [ ] Suspense でラップ
- [ ] 動作確認
    - [ ] ngrok で HTTPS 環境構築
    - [ ] 実機（iOS/Android）でテスト

---

### ステップ8: デプロイ・動作確認

#### 8.1 開発環境デプロイ

- [ ] ECR スタックデプロイ (`nagiyu-tools-ecr-dev`)
- [ ] Docker イメージビルド＆プッシュ
- [ ] Lambda スタックデプロイ (`nagiyu-tools-lambda-dev`)
- [ ] CloudFront スタックデプロイ (`nagiyu-tools-cloudfront-dev`)
- [ ] DNS 設定（`dev-tools.example.com`）
- [ ] 動作確認
    - [ ] ヘルスチェック API 確認
    - [ ] トップページ表示確認
    - [ ] 乗り換え変換ツール動作確認
    - [ ] クリップボード機能確認
    - [ ] PWA インストール確認

#### 8.2 統合テスト（開発環境）

- [ ] ページ遷移テスト
- [ ] API統合テスト
- [ ] クリップボード機能テスト
- [ ] PWA機能テスト
    - [ ] オフライン動作確認
    - [ ] インストール・アンインストール確認
- [ ] レスポンシブ表示確認
    - [ ] モバイル表示
    - [ ] タブレット表示
    - [ ] デスクトップ表示

#### 8.3 ブラウザ互換性テスト

- [ ] Chrome
- [ ] Firefox
- [ ] Safari
- [ ] Edge

#### 8.4 パフォーマンステスト

- [ ] ページロード時間測定
- [ ] Lighthouse スコア確認（Performance, Accessibility, Best Practices, SEO, PWA）
- [ ] Lambda コールドスタート時間測定

---

### ステップ9: 本番リリース準備

#### 9.1 本番環境構築

- [ ] 本番環境 CloudFormation スタックデプロイ
    - [ ] ECR スタック (`nagiyu-tools-ecr-prod`)
    - [ ] Lambda スタック (`nagiyu-tools-lambda-prod`)
    - [ ] CloudFront スタック (`nagiyu-tools-cloudfront-prod`)
- [ ] DNS 設定（`tools.example.com`）

#### 9.2 本番環境デプロイ

- [ ] master ブランチへのマージ
- [ ] GitHub Actions 自動デプロイ実行
- [ ] 動作確認
    - [ ] ヘルスチェック API 確認
    - [ ] 全ページ表示確認
    - [ ] 全機能動作確認
    - [ ] PWA インストール確認
- [ ] モニタリング設定確認
    - [ ] CloudWatch Logs 確認
    - [ ] Lambda メトリクス確認

#### 9.3 最終テスト

- [ ] 本番環境でのE2Eテスト
    - [ ] ユーザーシナリオテスト
    - [ ] クリップボード機能テスト（複数ブラウザ）
    - [ ] PWA機能テスト（インストール、オフライン動作）
- [ ] パフォーマンステスト
    - [ ] Lighthouse 全スコア確認（目標: 各90以上）
    - [ ] Lambda コールドスタート確認
- [ ] セキュリティチェック
    - [ ] HTTPS 通信確認
    - [ ] セキュリティヘッダー確認
    - [ ] CORS 設定確認

#### 9.4 ドキュメント最終化

- [ ] バージョン 1.0.0 リリースノート作成
- [ ] README.md の更新
- [ ] deployment.md の最終確認
- [ ] tools-catalog.md の更新（乗り換え変換ツールを実装済みに移動）

---

### ステップ10: v1.0.0 リリース

- [ ] Git タグ作成 (`v1.0.0`)
- [ ] GitHub Release 作成
- [ ] リリースアナウンス
- [ ] ドキュメントサイト公開（該当する場合）

---

## v1.0.0 後の計画

### 追加ツールの実装（将来）

- [ ] JSON Formatter（優先度: 高）
- [ ] Base64 Encoder/Decoder（優先度: 高）
- [ ] Hash Generator（優先度: 高）
- [ ] URL Encoder/Decoder（優先度: 中）
- [ ] JWT Decoder（優先度: 中）
- [ ] Timestamp Converter（優先度: 中）
- [ ] UUID Generator（優先度: 低）
- [ ] Color Picker（優先度: 低）

### 機能強化（将来）

- [ ] ダークモード対応
- [ ] ツール検索機能
- [ ] お気に入り機能（ローカルストレージ）
- [ ] 使用履歴（ローカルストレージ）

---

## 関連ドキュメント

### プロジェクトドキュメント

- [README](../docs/services/tools/README.md)
- [要件定義書](../docs/services/tools/requirements.md)
- [アーキテクチャ設計書](../docs/services/tools/architecture.md)
- [デプロイ手順書](../docs/services/tools/deployment.md)
- [ツールカタログ](../docs/services/tools/tools-catalog.md)

### 実装参照

- アプリケーション: `services/tools/`
- インフラ定義: `infra/tools/`
- CI/CD: `.github/workflows/tools-deploy.yml`
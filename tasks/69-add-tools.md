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
- [x] GitHub Actions PR検証ワークフロー (`.github/workflows/tools-pr.yml`)
    - [x] Next.js ビルド検証
    - [x] Docker イメージビルド検証
    - [x] 単体テスト実行
    - [x] 対象ブランチ: develop, integration/**
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
- [x] **E2Eテストセットアップ**
    - [x] Playwright のインストール (`@playwright/test`)
    - [x] playwright.config.ts の作成
    - [x] テストディレクトリ構造作成 (`e2e/`)
    - [x] GitHub Actions PR ワークフロー更新
    - [x] Jest設定の修正（E2Eテストディレクトリを除外）
- [ ] **E2Eテスト実装 - 乗り換え変換ツール**
    - [ ] 基本フロー (入力 → 変換 → コピー)
    - [ ] クリップボード読み取り機能
    - [ ] Web Share Target 機能 (URLパラメータ経由)
    - [ ] 表示設定の永続化 (LocalStorage)
    - [ ] エラーハンドリング (無効な入力、空入力)
    - [ ] クリア機能
- [ ] **E2Eテスト実装 - その他ページ**
    - [ ] ホームページ - ツールカード表示とナビゲーション
    - [ ] オフライン対応 - PWA機能 (Service Worker)
- [ ] **レスポンシブテスト設定**
    - [ ] Chromium デスクトップ
    - [ ] Chromium モバイル (Pixel 5)
    - [ ] Safari モバイル (iPhone 12)
- [ ] **アクセシビリティテスト**
    - [ ] @axe-core/playwright のインストール
    - [ ] 全ページでアクセシビリティスキャン実行
    - [ ] WCAG 2.1 Level AA 準拠確認

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

- [x] next-pwa パッケージのインストール
- [x] next.config.ts の PWA 設定
    - [x] Service Worker 設定
    - [x] キャッシュ戦略設定
- [x] manifest.json の作成
    - [x] アプリ名・説明
    - [x] アイコン設定（複数サイズ）
    - [x] テーマカラー設定
    - [x] 表示モード設定（standalone）
- [x] アイコン画像の作成
    - [x] 192x192 アイコン
    - [x] 512x512 アイコン
    - [x] ファビコン

#### 7.2 PWA機能実装

- [x] オフラインページの作成
- [x] Service Worker のキャッシュ戦略実装
    - [x] 静的アセットのキャッシュ
    - [x] API レスポンスのキャッシュ（必要に応じて）
- [N/A] インストールプロンプト実装（オプション） - ブラウザデフォルトのプロンプトを使用
- [N/A] オンライン/オフライン状態表示（オプション） - 将来的な機能拡張

#### 7.3 PWAテスト

- [x] ローカル環境でのPWAテスト
    - [x] manifest.json 読み込み確認
    - [x] Service Worker 登録確認
    - [x] オフライン動作確認
- [ ] Lighthouse PWA スコア確認（目標: 90以上） - デプロイ後に実施
- [ ] インストール動作確認 - デプロイ後に実施
    - [ ] Chrome（デスクトップ）
    - [ ] Chrome（モバイル）
    - [ ] Safari（iOS）

---

### ステップ7.5: 詳細表示トグル機能実装

#### 7.5.1 型定義追加

- [x] `DisplaySettings` インターフェースを `src/types/tools.ts` に追加
- [x] `DEFAULT_DISPLAY_SETTINGS` 定数を定義
- [x] `TransitRoute` インターフェースに以下を追加
    - [x] `transferCount?: number` プロパティ
    - [x] `distance?: string` プロパティ

#### 7.5.2 パーサー拡張

- [x] `src/lib/parsers/transitParser.ts` に乗換回数抽出処理を追加
    - [x] 正規表現: `/乗換\s+(\d+)回/`
- [x] 距離抽出処理を追加
    - [x] 正規表現: `/距離\s+([\d.]+)\s*km/`
- [x] 単体テストを追加 (`__tests__/transitParser.test.ts`)
    - [x] 乗換回数抽出テスト
    - [x] 距離抽出テスト

#### 7.5.3 フォーマッター拡張

- [x] `src/lib/formatters/formatters.ts` を拡張
    - [x] `formatTransitRoute()` に `DisplaySettings` パラメータを追加
    - [x] 各設定項目に応じた条件分岐を実装
    - [x] 乗換回数の出力処理を追加
    - [x] 距離の出力処理を追加
- [x] 単体テストを追加 (`__tests__/formatters.test.ts`)
    - [x] 設定による表示/非表示テスト
    - [x] デフォルト設定テスト

#### 7.5.4 UI実装

- [x] `DisplaySettingsSection` コンポーネントを作成
    - [x] Accordion で折りたたみ可能にする
    - [x] 各チェックボックスを実装
        - [x] 日付を表示
        - [x] 所要時間を表示
        - [x] 運賃を表示
        - [x] 乗換回数を表示
        - [x] 距離を表示
        - [x] ルート詳細を表示（親チェックボックス）
            - [x] 時刻範囲を表示
            - [x] 路線名を表示
            - [x] 番線情報を表示
- [x] `src/app/transit-converter/page.tsx` に統合
    - [x] `DisplaySettings` の state 管理
    - [x] チェックボックス変更時の処理
    - [x] フォーマッター呼び出し時に設定を渡す

#### 7.5.5 LocalStorage 連携

- [x] LocalStorage への保存処理を実装
    - [x] キー: `'transit-converter-display-settings'`
    - [x] チェックボックス変更時に保存
- [x] LocalStorage からの読み込み処理を実装
    - [x] `useEffect()` で初期化時に読み込み
    - [x] デフォルト設定とマージ
- [x] エラーハンドリング
    - [x] LocalStorage が使えない環境への対応
- [ ] 手動動作確認（デプロイ環境）
    - [ ] 表示設定のAccordionが展開/折りたたみできる
    - [ ] 各チェックボックスをクリックすると即座に出力が更新される
    - [ ] ルート詳細の親チェックボックスを外すと子項目も無効になる
    - [ ] 子項目をチェックすると親項目も自動的に有効になる
    - [ ] 設定を変更してページをリロードしても設定が保持される
    - [ ] プライベートモードでもエラーなく動作する（設定は保存されない）
    - [ ] 距離と番線情報はデフォルトで非表示
    - [ ] その他の項目はデフォルトで表示

#### 7.5.6 Web Share Target 対応（PWA完了後）

- [x] `manifest.json` に `share_target` セクションを追加
    - [x] `action: "/transit-converter"`
    - [x] `method: "GET"`
    - [x] `params: { title, text, url }`
- [x] URLパラメータ処理を実装
    - [x] `useSearchParams()` で `url` / `text` パラメータを取得
    - [x] 入力欄に自動挿入
    - [x] Suspense でラップ
    - [x] URLパラメータのクリーンアップ処理
    - [x] ユーザー通知（Snackbar）
- [ ] 動作確認
    - [ ] ngrok で HTTPS 環境構築
    - [ ] 実機（iOS/Android）でテスト

---

### ステップ7.6: 初回訪問ダイアログ実装

#### 7.6.1 コンポーネント実装

- [ ] `MigrationDialog` コンポーネントを作成 (`src/components/dialogs/MigrationDialog.tsx`)
    - [ ] Material UI の `Dialog` コンポーネントを使用
    - [ ] Client Component として実装 (`'use client'`)
    - [ ] LocalStorage フラグの読み込み (`useEffect`)
    - [ ] ダイアログの表示/非表示状態管理 (`useState`)
    - [ ] 「今後表示しない」チェックボックス状態管理 (`useState`, デフォルト: `true`)
    - [ ] タイトル: 「Toolsアプリが新しくなりました」
    - [ ] 本文の実装:
        - [ ] 移行案内テキスト
        - [ ] 手順 (アンインストール→再インストール)
        - [ ] プライバシー情報
    - [ ] UI要素の実装:
        - [ ] FormControlLabel + Checkbox (「今後表示しない」)
        - [ ] 「閉じる」ボタン
    - [ ] 「閉じる」ボタンクリック時の処理:
        - [ ] チェックボックスがONの場合のみLocalStorageにフラグを保存
        - [ ] ダイアログを閉じる
    - [ ] 背景クリック無効化 (`disableEscapeKeyDown`, `onClose` 制御)
    - [ ] エラーハンドリング (LocalStorage アクセス失敗時)

#### 7.6.2 ThemeRegistry への統合

- [ ] `ThemeRegistry` コンポーネントに `MigrationDialog` を追加
    - [ ] `src/components/ThemeRegistry.tsx` を編集
    - [ ] `MigrationDialog` をインポート
    - [ ] `children` と同階層に配置

#### 7.6.3 LocalStorage 仕様の実装

- [ ] LocalStorage キー: `'tools-migration-dialog-shown'`
- [ ] 値: `'true'` (文字列)
- [ ] 読み込み処理:
    - [ ] コンポーネントマウント時に `useEffect` で実行
    - [ ] フラグが存在しない場合はダイアログを表示
- [ ] 保存処理:
    - [ ] 「今後表示しない」がONで「閉じる」をクリック時
    - [ ] `try-catch` でエラーハンドリング

#### 7.6.4 動作確認

- [ ] ローカル環境での動作確認
    - [ ] 初回訪問時にダイアログが表示される
    - [ ] 「今後表示しない」がデフォルトでチェックされている
    - [ ] チェックONで「閉じる」→次回表示されない
    - [ ] チェックOFFで「閉じる」→次回も表示される
    - [ ] 背景クリックでは閉じない
    - [ ] LocalStorage を手動削除すると再度表示される
    - [ ] プライベートモードでもエラーが発生しない
- [ ] レスポンシブ確認
    - [ ] モバイル表示
    - [ ] タブレット表示
    - [ ] デスクトップ表示

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
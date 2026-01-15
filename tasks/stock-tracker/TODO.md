# Stock Tracker 実装前 TODO

**作成日**: 2026-01-13
**ステータス**: 実装準備段階

このドキュメントは、Stock Tracker の実装を開始する前に準備すべきタスクをまとめたものです。

---

## 📋 全体進捗

- **完了**: 8 / 11 タスク
- **残り**: 3 タスク
- **推定所要時間**: 約 1-2.5 日

---

## ✅ 完了済み

### ドキュメント

- [x] **requirements.md** - 要件定義書（詳細な機能・非機能要件）
- [x] **wireframes/** - 6画面のワイヤーフレーム
- [x] **TradingView API 仕様** - requirements.md に追記完了
- [x] **Web Push 通知仕様** - requirements.md に追記完了
- [x] **architecture.md** - アーキテクチャ設計書（システム構成、データモデル、技術スタック）
- [x] **api-spec.md** - API 仕様書（22エンドポイント、認証方式、権限一覧）
- [x] **DynamoDB データモデル詳細化** - architecture.md に追記完了（5エンティティ、バリデーション、整合性ルール）

---

## 🔴 優先度: 高（実装前に必須）

### 1. TradingView API 仕様の詳細化
**所要時間**: 0.5日
**ファイル**: `tasks/stock-tracker/requirements.md` に追記

**追加すべき内容**:
- [ ] API エンドポイント
  - [ ] ベース URL
  - [ ] 認証方法（API Key など）
  - [ ] レート制限（1秒あたりのリクエスト数）
- [ ] データ取得仕様
  - [ ] 対応する時間枠（5分足、1時間足、日足など）
  - [ ] データ形式（OHLCV: Open, High, Low, Close, Volume）
  - [ ] タイムゾーン処理
- [ ] エラーハンドリング
  - [ ] タイムアウト時の挙動
  - [ ] レート制限超過時の対応
  - [ ] データ欠損時のフォールバック
- [ ] キャッシュ戦略
  - [ ] どのデータをキャッシュするか
  - [ ] キャッシュの有効期限

---

### 2. Web Push 通知の詳細仕様
**所要時間**: 0.5日
**ファイル**: `tasks/stock-tracker/requirements.md` に追記

**追加すべき内容**:
- [ ] 通知の実装方式
  - [ ] Service Worker の登録
  - [ ] Push Subscription の取得・保存
  - [ ] VAPID キーの生成・管理
- [ ] 通知のトリガー
  - [ ] EventBridge Scheduler の設定（例: 5分ごと）
  - [ ] Lambda Batch による条件チェック処理
  - [ ] 条件達成時の Web Push API 呼び出し
- [ ] 通知メッセージフォーマット
  - [ ] タイトル形式
  - [ ] 本文形式
  - [ ] クリック時のアクション（チャート画面へ遷移）
- [ ] エラーハンドリング
  - [ ] Subscription が無効になった場合の処理
  - [ ] 通知送信失敗時のリトライ戦略

---

### 3. architecture.md の作成 ✅
**所要時間**: 2-3日
**ファイル**: `tasks/stock-tracker/architecture.md`
**テンプレート**: `docs/templates/services/architecture.md`
**完了日**: 2026-01-13

**完了内容**:
- [x] システム全体構成図（Mermaid）
- [x] AWS インフラ構成図（Draw.io）
- [x] 技術スタック決定（Next.js 15.x, Material-UI v7, ECharts, TradingView API, Web Push API）
- [x] データモデル設計（DynamoDB Single Table Design, 3つの GSI）
- [x] データフロー図（チャート表示、アラート設定、通知処理）
- [x] 3層パッケージ構成（core/web/batch）
- [x] IAM ロール設計（WebRuntimePolicy, BatchRuntimePolicy, 開発用 IAM ユーザー）
- [x] 認証・認可設計（NextAuth.js, RBAC）
- [x] セキュリティ設計（CORS, セキュリティヘッダー、VAPID キー管理）
- [x] 技術選定理由と代替案比較

---

### 4. api-spec.md の作成 ✅
**所要時間**: 1-2日
**ファイル**: `tasks/stock-tracker/api-spec.md`
**テンプレート**: `docs/templates/services/api-spec.md`
**完了日**: 2026-01-13

**完了内容**:
- [x] API 概要
  - [x] ベース URL（dev / prod）
  - [x] 認証方式（Cookie ベース、NextAuth.js）
  - [x] 共通レスポンス形式（シンプル形式）
  - [x] HTTP ステータスコード一覧
  - [x] エラーコード一覧
- [x] エンドポイント一覧（22エンドポイント）
- [x] エンドポイント詳細
  - [x] **ヘルスチェック API** - `GET /api/health`
  - [x] **取引所管理 API** - 4エンドポイント（GET/POST/PUT/DELETE）
  - [x] **ティッカー管理 API** - 4エンドポイント（GET/POST/PUT/DELETE）
  - [x] **保有株式管理 API** - 4エンドポイント（GET/POST/PUT/DELETE）
  - [x] **ウォッチリスト管理 API** - 3エンドポイント（GET/POST/DELETE）
  - [x] **アラート管理 API** - 4エンドポイント（GET/POST/PUT/DELETE）
  - [x] **チャートデータ API** - `GET /api/chart-data/{ticker}`（TradingView TimeFrame 対応）
  - [x] **Web Push 通知 API** - 2エンドポイント（POST subscribe, DELETE unsubscribe）
- [x] 権限一覧
  - [x] stock-viewer: 閲覧のみ（stocks:read）
  - [x] stock-user: 閲覧 + アラート/Holding 管理（stocks:read, stocks:write-own）
  - [x] stock-admin: 全機能 + マスタデータ管理（stocks:read, stocks:write-own, stocks:manage-data）
- [x] エラーレスポンス例
- [x] ペジネーション仕様（lastKey 方式）
- [x] Phase 1 スコープ定義

---

### 5. DynamoDB データモデルの詳細化 ✅
**所要時間**: 1日
**ファイル**: `tasks/stock-tracker/architecture.md` のデータモデルセクション
**完了日**: 2026-01-13

**完了内容**:
- [x] 各エンティティの詳細属性（5エンティティ、全属性定義完了）
  - [x] Exchange: ExchangeID, Name, Key, Timezone, Start, End, CreatedAt, UpdatedAt
  - [x] Ticker: TickerID, Symbol, Name, ExchangeID, CreatedAt, UpdatedAt
  - [x] Holding: UserID, TickerID, ExchangeID, Quantity, AveragePrice, Currency, CreatedAt, UpdatedAt
  - [x] Alert: AlertID, UserID, TickerID, ExchangeID, Mode, Frequency, ConditionList, SubscriptionEndpoint, Keys, FirstNotificationSent, CreatedAt, UpdatedAt
  - [x] Watchlist: UserID, TickerID, ExchangeID, CreatedAt
- [x] バリデーションルール
  - [x] 必須フィールド（全エンティティ定義済み）
  - [x] データ型（string, number, array, boolean）
  - [x] 文字列長制限（1-50文字、1-200文字など）
  - [x] 数値範囲（0.0001〜1,000,000,000 など）
- [x] アクセスパターン（既に architecture.md に記載済み）
- [x] GSI 詳細設計
  - [x] GSI1: UserIndex（ユーザーごとのデータ取得）
  - [x] GSI2: AlertIndex（PK: ALERT#{Frequency}, SK: {UserID}#{AlertID}）
  - [x] GSI3: ExchangeTickerIndex（取引所ごとのティッカー一覧）
- [x] データ整合性ルール
  - [x] Exchange.Key 変更不可
  - [x] TickerID 自動生成・変更不可
  - [x] 関連データ削除制限
  - [x] TTL は Phase 1 では使用しない

---

## 🟡 優先度: 中（実装開始後すぐに必要）

### 6. Phase 1 スコープの確定 ✅
**所要時間**: 0.5日
**ファイル**: `tasks/stock-tracker/requirements.md` の「Phase 1 スコープ定義」セクション
**完了日**: 2026-01-14

**完了内容**:
- [x] Phase 1（MVP）に含める機能を明確化
  - [x] 株価チャート表示: 4つの時間枠（`1`, `5`, `60`, `D`）、`session: extended` 固定
  - [x] アラート設定・通知: 1条件のみ、演算子 `gte`/`lte`、条件達成時に毎回継続通知
  - [x] アラート有効/無効: `Enabled` フィールド実装
  - [x] 保有株式管理: 基本CRUD
  - [x] ウォッチリスト管理: 基本CRUD
  - [x] 取引所・ティッカーマスタ管理: stock-admin のみ
  - [x] 取引時間外の通知抑制: 時間帯 + 曜日チェック（祝日は Phase 2）
  - [x] Web Push 通知: 1ユーザー1デバイスのみ
  - [x] 目標価格の自動算出: `AveragePrice × 1.2` 固定
- [x] Phase 1 のスコープ外（Phase 2 以降）を明確化
  - [x] 追加の時間枠（3分、15分、30分、2時間、4時間、週足、月足）
  - [x] 完全一致演算子（`eq`）
  - [x] 複数条件（AND/OR 組み合わせ）
  - [x] 複数デバイス対応（Alert と Subscription の分離）
  - [x] サブスクリプション自動削除
  - [x] 祝日対応
  - [x] テクニカル指標（移動平均、ボリンジャーバンドなど）
  - [x] パターン認識（赤三兵、三川明けの明星など）
  - [x] ポートフォリオ分析
  - [x] CSV インポート/エクスポート

**データモデル変更**:
- [x] Alert エンティティに `Enabled` フィールド追加
- [x] `FirstNotificationSent` フィールド削除（不要）
- [x] `TerminalID` フィールド削除（Phase 2 で検討）
- [x] `ConditionList[].operator` は `gte`, `lte` のみ対応

---

### 7. testing.md の作成 ✅
**所要時間**: 0.5日
**ファイル**: `tasks/stock-tracker/testing.md`
**テンプレート**: `docs/templates/services/testing.md`
**完了日**: 2026-01-14

**完了内容**:
- [x] テスト戦略
  - [x] Core パッケージ: 80%以上のカバレッジ（ユニットテスト）
  - [x] Web パッケージ: カバレッジ目標なし（E2Eでカバー）
  - [x] Batch パッケージ: カバレッジ目標なし（ビジネスロジックはcoreでカバー）
- [x] テストデバイス/ブラウザ構成
  - [x] chromium-mobile (Fast CI)
  - [x] chromium-desktop, webkit-mobile (Full CI)
- [x] カバレッジ目標
  - [x] ビジネスロジック (core/): 80%以上
  - [x] Web/Batch: カバレッジ目標なし
  - [x] UI コンポーネント: 任意（E2Eでカバー）
- [x] E2Eテストシナリオ（9シナリオ）
  - [x] E2E-001: チャート表示フロー
  - [x] E2E-002: アラート設定フロー（Holding/Watchlistから + Alert編集）
  - [x] E2E-003: Holding 登録・更新・削除フロー
  - [x] E2E-004: ウォッチリスト管理フロー
  - [x] E2E-005: 権限チェック（stock-admin のみの画面）
  - [x] E2E-006: 取引所管理（CRUD操作と画面変化）
  - [x] E2E-007: ティッカー管理（CRUD操作と画面変化）
  - [x] E2E-008: エラーハンドリング
  - [x] E2E-009: ナビゲーション・画面遷移
- [x] ユニットテスト対象
  - [x] core/validation: バリデーション関数
  - [x] core/repositories: DynamoDB アクセス層（モックライブラリ使用）
  - [x] core/services: ビジネスロジック（アラート評価、目標価格算出、取引時間外判定）
- [x] テスト実行方法
  - [x] ローカル環境でのコマンド
  - [x] CI 環境での実行（2段階CI: Fast/Full）
- [x] 外部サービス連携のテスト方針
  - [x] TradingView API: ユニットは完全モック、E2Eは実API
  - [x] Web Push: 自動許可、送信処理のみ検証
  - [x] DynamoDB: dev環境使用、テストデータは全てクリーンアップ
- [x] 既知の問題・制約（React 19 + Jest、TradingView API非公式ライブラリ）

---

### 8. deployment.md の作成
**所要時間**: 0.5日
**ファイル**: `tasks/stock-tracker/deployment.md`
**テンプレート**: `docs/templates/services/deployment.md`

**含めるべき内容**:
- [x] 環境構成
  - [x] dev 環境（develop, integration/** ブランチ）
  - [x] prod 環境（master ブランチ）
- [x] リソース一覧
  - [x] Lambda (Web): stock-tracker-web-{env}
  - [x] Lambda (Batch): @nagiyu/stock-tracker-batch-{env}（3関数: minute, hourly, daily）
  - [x] DynamoDB: nagiyu-stock-tracker-main-{env}
  - [x] ECR: stock-tracker-web-{env}, @nagiyu/stock-tracker-batch-{env}
  - [x] CloudFront Distribution
  - [x] EventBridge Scheduler（3ルール）
  - [x] Secrets Manager（VAPID キー）
  - [x] CloudWatch Alarms（Lambda + DynamoDB 監視）
  - [x] SNS Topic（アラーム通知）
- [x] 前提条件
  - [x] 共有インフラの確認（ACM 証明書、Auth サービス）
  - [x] 必要なツール（Node.js, AWS CLI, Docker）
- [x] CI/CD パイプライン
  - [x] stock-tracker-verify-fast.yml (PR to integration/**)
  - [x] stock-tracker-verify-full.yml (PR to develop)
  - [x] stock-tracker-deploy.yml (push to develop/integration/**/master)
- [x] 初回セットアップ手順
  - [x] Secrets スタックデプロイ（PLACEHOLDER）
  - [x] VAPID キー生成と上書き
  - [x] ECR リポジトリ作成
  - [x] Docker イメージビルド & プッシュ
  - [x] CDK デプロイ（--all）
  - [x] 動作確認
- [x] 環境変数管理
  - [x] Secrets Manager からの取得方法
  - [x] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
  - [x] NEXTAUTH_SECRET（Auth サービスから参照）
- [x] ログ・監視
  - [x] CloudWatch Logs の確認方法（30日保持）
  - [x] Lambda メトリクス
  - [x] CloudWatch Alarms 設定（エラー率、実行時間、スロットリング）
  - [x] X-Ray トレーシング（有効化）
- [x] 運用手順
  - [x] バージョン管理（Git タグ）
  - [x] スケーリング対応
  - [x] セキュリティアップデート
- [x] 障害対応
  - [x] ロールバック手順（コンソール手動）
  - [x] よくある障害と対処法

---

### 9. 共通ライブラリへのロール追加
**所要時間**: 0.5日
**ファイル**: `libs/common/src/auth/roles.ts`, `libs/common/src/auth/types.ts`

**追加すべき内容**:
- [ ] `libs/common/src/auth/roles.ts` にロール追加
  ```typescript
  'stock-viewer': {
    id: 'stock-viewer',
    name: 'Stock 閲覧者',
    description: 'Stock Tracker のチャート閲覧のみ可能',
    permissions: ['stocks:read']
  },
  'stock-user': {
    id: 'stock-user',
    name: 'Stock ユーザー',
    description: 'Stock Tracker のアラート設定・Holding管理',
    permissions: ['stocks:read', 'stocks:write-own']
  },
  'stock-admin': {
    id: 'stock-admin',
    name: 'Stock 管理者',
    description: 'Stock Tracker のマスタデータ管理',
    permissions: ['stocks:read', 'stocks:write-own', 'stocks:manage-data']
  }
  ```
- [ ] `libs/common/src/auth/types.ts` に権限追加
  ```typescript
  export type Permission =
    | 'users:read'
    | 'users:write'
    | 'roles:assign'
    | 'stocks:read'
    | 'stocks:write-own'
    | 'stocks:manage-data';
  ```
- [ ] テストの追加・更新

---

## 📝 推奨される作業順序

実装を円滑に進めるため、以下の順序でドキュメントを整備することをお勧めします：

### ステップ1: 要件定義の詳細化（1日）
1. TradingView API の詳細仕様を追加
2. Web Push 通知の詳細仕様を追加
3. Phase 1 のスコープを明確化
4. requirements.md を更新

### ステップ2: アーキテクチャ設計（2-3日）
1. architecture.md を作成
2. システム構成図を作成（Mermaid または Draw.io）
3. DynamoDB データモデルを詳細設計
4. API 設計の概要を記述

### ステップ3: API 仕様書作成（1-2日）
1. api-spec.md を作成
2. 全エンドポイントの詳細仕様を記述
3. リクエスト/レスポンス型を定義

### ステップ4: テスト・デプロイ仕様（1日）
1. testing.md を作成
2. deployment.md を作成

### ステップ5: 共通ライブラリの拡張（0.5日）
1. `libs/common/src/auth/roles.ts` にロール追加
2. `libs/common/src/auth/types.ts` に権限追加

---

## 🎯 チェックリスト: 実装開始前の最終確認

実装を開始する前に、以下がすべて完了していることを確認してください：

- [ ] requirements.md が最新（TradingView API, Web Push, Phase 1 スコープ）
- [ ] architecture.md が作成済み（システム構成図、データモデル、技術スタック）
- [ ] api-spec.md が作成済み（全エンドポイントの詳細仕様）
- [ ] testing.md が作成済み（テスト戦略、シナリオ）
- [ ] deployment.md が作成済み（デプロイ手順、CI/CD 設定）
- [ ] libs/common にロール・権限が追加済み
- [ ] ワイヤーフレームと要件の整合性確認

---

## 📚 参考資料

- [プラットフォーム開発ガイドライン](../../docs/development/rules.md)
- [テンプレート集](../../docs/templates/services/)
- [ブランチ戦略](../../docs/branching.md)
- [既存サービスの実装例](../../services/codec-converter/)

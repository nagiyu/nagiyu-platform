# Stock Tracker テスト仕様書

**ステータス**: Draft（設計段階）
**作成日**: 2026-01-14
**最終更新**: 2026-01-14

---

## 1. テスト戦略概要

### 1.1 テストの目的

Stock Tracker サービスの品質を保証し、以下を実現する：

- 主要機能（株価チャート表示、アラート通知、保有株式管理）の動作保証
- リグレッション防止
- Phase 1（MVP）スコープの完全な検証

### 1.2 テスト方針

- **ビジネスロジック重視**: core パッケージで80%以上のカバレッジを確保
- **web 固有処理の検証**: E2Eテストで画面操作・画面変化を高い水準で検証
- **外部API依存の最小化**: TradingView API、Web Push API はモック化またはスタブ化
- **自動化**: CI/CDで継続的にテストを実行

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

| デバイス名       | 用途               | 画面サイズ  | User Agent              |
| ---------------- | ------------------ | ----------- | ----------------------- |
| chromium-desktop | デスクトップChrome | 1920x1080   | Chrome (最新安定版)     |
| chromium-mobile  | モバイルChrome     | Pixel 5相当 | Chrome Mobile (Android) |
| webkit-mobile    | モバイルSafari     | iPhone相当  | Safari Mobile (iOS)     |

### 2.2 テスト優先順位

#### Fast CI (高速フィードバック)

- **対象**: chromium-mobile のみ
- **目的**: 開発中の素早いフィードバック
- **トリガー**: `integration/**` ブランチへのPR

#### Full CI (完全テスト)

- **対象**: chromium-desktop, chromium-mobile, webkit-mobile
- **目的**: マージ前の完全な品質検証
- **トリガー**: `develop` ブランチへのPR

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| カテゴリ                | カバレッジ目標     | 測定方法      | 備考 |
| ----------------------- | ------------------ | ------------- | ---- |
| ビジネスロジック (core/) | 80%以上            | Jest coverage | ビジネスロジックを完全にカバー |
| UI コンポーネント (web/) | 任意 (E2Eでカバー) | E2E テスト    | ユニットテストは不要 |
| バッチ処理 (batch/) | 任意 | - | ビジネスロジックはcoreでカバー |

### 3.2 カバレッジ対象外

以下は Jest のカバレッジ対象外とします（E2E テストでカバー）:

- `app/**/page.tsx` - Next.js App Router の page コンポーネント
- `app/**/layout.tsx` - レイアウトコンポーネント
- `web/src/components/**/*.tsx` - UI コンポーネント（E2Eで検証）

### 3.3 カバレッジ計測方法

```bash
# カバレッジレポート生成
npm run test:coverage --workspace=stock-tracker-core

# カバレッジ結果の確認
# - コンソール出力: サマリー
# - coverage/lcov-report/index.html: 詳細レポート
```

**カバレッジ閾値**:
- core パッケージの `jest.config.ts` で `coverageThreshold` を80%に設定
- 閾値未満の場合、CI で自動的に失敗

---

## 4. E2Eテストシナリオ

### 4.1 テストシナリオ一覧

| シナリオID | シナリオ名   | 概要   | 優先度 | 対象デバイス          |
| ---------- | ------------ | ------ | ------ | --------------------- |
| E2E-001    | チャート表示フロー | 取引所・ティッカー選択→チャート表示 | 高 | 全デバイス |
| E2E-002    | アラート設定フロー | アラート作成→条件設定→保存 | 高 | 全デバイス |
| E2E-003    | Holding 管理フロー | Holding 登録・更新・削除 | 高 | 全デバイス |
| E2E-004    | Watchlist 管理フロー | Watchlist 登録・削除 | 高 | 全デバイス |
| E2E-005    | 権限チェック | stock-admin のみアクセス可能な画面 | 中 | chromium-mobile のみ |
| E2E-006    | 取引所管理 | 取引所CRUD操作と画面変化 | 中 | chromium-mobile のみ |
| E2E-007    | ティッカー管理 | ティッカーCRUD操作と画面変化 | 中 | chromium-mobile のみ |
| E2E-008    | エラーハンドリング | バリデーションエラー、APIエラーの表示 | 中 | chromium-mobile のみ |
| E2E-009    | ナビゲーション | 画面遷移の確認 | 低 | chromium-mobile のみ |

### 4.2 シナリオ詳細

#### E2E-001: チャート表示フロー

**目的**: 株価チャートが正しく表示されることを確認

**前提条件**:
- テスト用の取引所・ティッカーがDynamoDBに登録済み
- 認証スキップモード（`SKIP_AUTH_CHECK=true`）

**テスト手順**:
1. トップ画面にアクセス
2. 取引所を選択（例: TEST-EXCHANGE）
3. ティッカーを選択（例: TEST:DUMMY）
4. 時間枠を選択（例: 1時間足）
5. チャートが表示されることを確認

**期待結果**:
- チャート描画エリアが表示される
- TradingView API からデータを取得（実API使用）
- エラーメッセージが表示されない

**テストファイル**: `tests/e2e/chart-display.spec.ts`

**実行環境要件**:
- dev環境のDynamoDB接続
- TradingView API アクセス可能

#### E2E-002: アラート設定フロー

**目的**: アラート作成（Holding/Watchlistから）・編集が正しく動作することを確認

**前提条件**:
- 認証スキップモード
- 通知許可を自動付与（`context.grantPermissions(['notifications'])`）
- テスト用の取引所・ティッカーが登録済み

**テスト手順**:

**パターン1: 売りアラート設定（Holdingから）**
1. Holding管理画面にアクセス
2. テスト用Holdingを登録
3. 「売りアラート設定」ボタンをクリック
4. アラート設定モーダルが表示される（ティッカー・取引所は自動入力、Mode は Sell 固定）
5. 条件（operator: gte, value）を入力
6. 通知頻度を選択（MINUTE_LEVEL/HOURLY_LEVEL）
7. 保存ボタンをクリック
8. ボタンが「✅ アラート設定済」に変化することを確認

**パターン2: 買いアラート設定（Watchlistから）**
1. Watchlist管理画面にアクセス
2. テスト用Watchlistを登録
3. 「買いアラート設定」ボタンをクリック
4. アラート設定モーダルが表示される（ティッカー・取引所は自動入力、Mode は Buy 固定）
5. 条件（operator: lte, value）を入力
6. 通知頻度を選択
7. 保存ボタンをクリック
8. ボタンが「✅ アラート設定済」に変化することを確認

**パターン3: アラート編集（Alert一覧画面から）**
1. アラート一覧画面にアクセス
2. 既存アラートの編集ボタンをクリック
3. 条件値を変更
4. 保存ボタンをクリック
5. アラート一覧に変更内容が反映されることを確認

**期待結果**:
- アラートがDynamoDBに保存される
- Web Push サブスクリプションが登録される
- アラート設定ボタンの表示が変化する
- アラート編集が正しく動作する

**テストファイル**: `tests/e2e/alert-management.spec.ts`

**実行環境要件**:
- dev環境のDynamoDB接続

#### E2E-003: Holding 管理フロー

**目的**: 保有株式の登録・更新・削除と画面変化を確認

**前提条件**:
- 認証スキップモード
- テスト用の取引所・ティッカーが登録済み

**テスト手順**:
1. Holding 管理画面にアクセス
2. 新規登録ボタンをクリック
3. ティッカー、保有数、平均取得価格、通貨を入力
4. 保存→一覧に表示されることを確認
5. 編集ボタンをクリック→データを更新→反映を確認
6. 削除ボタンをクリック→一覧から消えることを確認

**期待結果**:
- CRUD操作後、画面が正しく更新される
- DynamoDBにデータが反映される

**テストファイル**: `tests/e2e/holding-management.spec.ts`

#### E2E-004: Watchlist 管理フロー

**目的**: ウォッチリストの登録・削除と画面変化を確認

**前提条件**:
- 認証スキップモード
- テスト用の取引所・ティッカーが登録済み

**テスト手順**:
1. Watchlist 管理画面にアクセス
2. 新規登録ボタンをクリック
3. ティッカーを選択
4. 保存→一覧に表示されることを確認
5. 削除ボタンをクリック→一覧から消えることを確認

**期待結果**:
- 登録・削除操作後、画面が正しく更新される

**テストファイル**: `tests/e2e/watchlist-management.spec.ts`

#### E2E-005: 権限チェック

**目的**: ロールベースのアクセス制御が正しく動作することを確認

**前提条件**:
- 認証スキップモード
- テストユーザーに `stock-admin` ロールを付与（`.env.test` で設定）

**テスト手順**:
1. stock-admin ロールで取引所管理画面にアクセス
2. 画面が表示されることを確認
3. stock-viewer ロールで取引所管理画面にアクセス
4. 403エラーまたはアクセス拒否メッセージが表示されることを確認

**期待結果**:
- stock-admin: マスタデータ管理画面にアクセス可能
- stock-viewer: アクセス拒否

**テストファイル**: `tests/e2e/authorization.spec.ts`

**備考**:
- 権限判定ロジックの詳細は core パッケージでユニットテスト

#### E2E-006: 取引所管理

**目的**: 取引所のCRUD操作と画面変化を確認

**前提条件**:
- 認証スキップモード
- stock-admin ロール

**テスト手順**:
1. 取引所管理画面にアクセス
2. 新規作成→入力→保存→一覧に表示
3. 編集→更新→反映確認
4. 削除→一覧から消える

**期待結果**:
- CRUD操作後、画面が正しく更新される

**テストファイル**: `tests/e2e/exchange-management.spec.ts`

#### E2E-007: ティッカー管理

**目的**: ティッカーのCRUD操作と画面変化を確認

**前提条件**:
- 認証スキップモード
- stock-admin ロール
- テスト用取引所が登録済み

**テスト手順**:
1. ティッカー管理画面にアクセス
2. 新規作成→シンボル、名前、取引所を入力→保存→一覧に表示
3. 編集→更新→反映確認
4. 削除→一覧から消える

**期待結果**:
- CRUD操作後、画面が正しく更新される
- TickerID が自動生成される（`{Exchange.Key}:{Symbol}` 形式）

**テストファイル**: `tests/e2e/ticker-management.spec.ts`

#### E2E-008: エラーハンドリング

**目的**: バリデーションエラー、APIエラーが正しく表示されることを確認

**前提条件**:
- 認証スキップモード

**テスト手順**:
1. Holding 登録画面で無効なデータを入力（負の数、文字列など）
2. バリデーションエラーメッセージが表示されることを確認
3. 存在しないティッカーを選択
4. APIエラーメッセージが表示されることを確認

**期待結果**:
- ユーザーフレンドリーなエラーメッセージが表示される
- エラー時に画面が壊れない

**テストファイル**: `tests/e2e/error-handling.spec.ts`

#### E2E-009: ナビゲーション

**目的**: 画面遷移が正しく動作することを確認

**前提条件**:
- 認証スキップモード

**テスト手順**:
1. トップ画面からHolding管理画面に遷移
2. Holding管理画面からアラート一覧画面に遷移
3. 各画面でブラウザバックボタンが正しく動作することを確認

**期待結果**:
- 画面遷移がスムーズ
- ブラウザバックで前の画面に戻る

**テストファイル**: `tests/e2e/navigation.spec.ts`

---

## 5. ユニットテスト対象

### 5.1 テスト対象の分類

#### ビジネスロジック (core/)

- **リポジトリ層** (`core/src/repositories/`)
    - Exchange, Ticker, Holding, Watchlist, Alert の CRUD 操作
    - DynamoDB クエリ（PK/SK、GSI）の正しさ
    - エラーハンドリング

- **サービス層** (`core/src/services/`)
    - アラート条件評価ロジック (`alert-evaluator.ts`)
        - `gte`, `lte` 演算子の動作
        - エッジケース（境界値、null値など）
    - 目標価格算出 (`price-calculator.ts`)
        - `AveragePrice × 1.2` の計算
    - 取引時間外判定 (`trading-hours-checker.ts`)
        - タイムゾーン、時間帯、曜日のチェック

- **バリデーション** (`core/src/validation/`)
    - 入力データのバリデーション
    - 数値範囲チェック
    - 文字列長チェック

### 5.2 テスト対象外

以下はユニットテストの対象外とします:

- ❌ **Next.js page コンポーネント** - E2Eテストでカバー
- ❌ **UI コンポーネント** - E2Eテストでカバー
- ❌ **バッチ処理のスケジューラー連携** - AWSの責務（EventBridge Scheduler）
- ❌ **TradingView API の実際の動作** - 外部サービスの責務
- ❌ **Web Push API の実際の送信** - 送信処理の構築のみ検証

---

## 6. テスト実行方法

### 6.1 ローカル環境での実行

#### ユニットテスト

```bash
# core パッケージのテスト実行
npm run test --workspace=stock-tracker-core

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch --workspace=stock-tracker-core

# カバレッジレポート生成
npm run test:coverage --workspace=stock-tracker-core

# 特定のテストファイルのみ実行
npm run test --workspace=stock-tracker-core -- tests/unit/services/alert-evaluator.test.ts
```

#### E2Eテスト

```bash
# 前提: .env.test ファイルを作成
# services/stock-tracker/web/.env.test
# TEST_USER_ID=test-user-stock
# TEST_USER_ROLES=stock-admin
# SKIP_AUTH_CHECK=true
# DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-main-dev

# すべての E2E テストを実行
npm run test:e2e --workspace=stock-tracker-web

# 特定のデバイスのみ実行
npm run test:e2e --workspace=stock-tracker-web -- --project=chromium-mobile
npm run test:e2e --workspace=stock-tracker-web -- --project=chromium-desktop
npm run test:e2e --workspace=stock-tracker-web -- --project=webkit-mobile

# 特定のテストファイルのみ実行
npm run test:e2e --workspace=stock-tracker-web tests/e2e/chart-display.spec.ts

# UI モードで実行（デバッグ用）
npm run test:e2e:ui --workspace=stock-tracker-web

# ブラウザ表示モード（headed モード）
npm run test:e2e:headed --workspace=stock-tracker-web
```

### 6.2 CI環境での実行

#### GitHub Actions

GitHub Actions で自動実行されます:

**Fast CI** (`.github/workflows/stock-tracker-verify-fast.yml`):

- トリガー: `integration/**` ブランチへのPR
- テスト:
    - Next.js ビルド検証
    - Docker ビルド検証（Web, Batch）
    - ユニットテスト（core）
    - E2E (chromium-mobile のみ)
    - Lint、Format チェック
    - インフラ型チェック、テスト

**Full CI** (`.github/workflows/stock-tracker-verify-full.yml`):

- トリガー: `develop` ブランチへのPR
- テスト: Fast CI の内容 + 以下
    - カバレッジチェック（core: 80%未満で失敗）
    - E2E (全デバイス: chromium-desktop, chromium-mobile, webkit-mobile)

#### 環境変数

CI 環境で必要な環境変数:

```bash
CI=true                                      # CI環境フラグ
BASE_URL=http://localhost:3000               # テスト対象URL
TEST_USER_ID=test-user-stock                 # テストユーザーID
TEST_USER_ROLES=stock-admin                  # テストユーザーロール
SKIP_AUTH_CHECK=true                         # 認証スキップ
DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-main-dev  # DynamoDBテーブル名
AWS_REGION=ap-northeast-1                    # AWSリージョン
```

---

## 7. CI/CD統合

### 7.1 ワークフロー構成

| ワークフロー               | トリガー                      | 実行内容                                       |
| -------------------------- | ----------------------------- | ---------------------------------------------- |
| stock-tracker-verify-fast | PR to `integration/**`        | ビルド、Docker、ユニット、E2E (chromium-mobile)、Lint、Format、インフラ |
| stock-tracker-verify-full | PR to `develop`               | Fast + カバレッジ、E2E (全デバイス) |
| stock-tracker-deploy      | Push to `develop` or `master` | デプロイ（テストは verify で完了済み）         |

### 7.2 ブランチ保護ルール

#### `integration/**` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `stock-tracker-verify-fast` ワークフローの成功が必須

#### `develop` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `stock-tracker-verify-full` ワークフローの成功が必須
- ✅ カバレッジ 80%以上の確保（core パッケージの `coverageThreshold` により自動チェック）

#### `master` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ 全ての CI/CD チェックの成功が必須
- ✅ レビュー承認が必須（推奨）

### 7.3 テスト失敗時の対応

#### ユニットテスト失敗

1. ローカルで再現確認
2. 該当テストを修正
3. カバレッジを再確認

#### E2Eテスト失敗

1. GitHub Actions のアーティファクトを確認（スクリーンショット、動画、トレース）
2. ローカルで再現確認（`npm run test:e2e:ui --workspace=stock-tracker-web`）
3. 不安定なテストの場合はリトライ設定を追加

#### カバレッジ不足

1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. カバーされていないコードを特定
3. 必要なテストを追加

---

## 8. 既知の問題・制約

### 8.1 技術的制約

#### React 19 + Next.js 15 + Jest の互換性問題

**問題内容**: React 19 の新しいアーキテクチャと Jest の組み合わせにおいて、Next.js App Router の page コンポーネントを直接ユニットテストすることができない。

**影響範囲**:
- 影響あり: Next.js App Router の page コンポーネント（`app/**/page.tsx`）
- 影響なし: 個別の React コンポーネント、ビジネスロジック、API routes

**回避策**:
- E2E テストでカバー（Playwright による検証）
- Page コンポーネントはカバレッジ対象外に設定（`jest.config.ts` で除外）

**将来の対応**: React 19 の testing ecosystem が成熟した時点で再評価

#### TradingView API の非公式ライブラリ使用

**問題内容**: `@mathieuc/tradingview` は非公式ライブラリのため、仕様変更のリスクがある。

**影響範囲**: 株価データ取得機能全般

**回避策**:
- ユニットテストでは完全モック化
- E2Eテストでは実APIを使用（仕様変更の早期検知）

**将来の対応**: 公式APIへの移行を検討（Phase 2以降）

### 8.2 環境依存のテスト

以下のテストは特定の環境が必要です:

- **E2Eテスト全般**: dev環境のDynamoDB接続が必要
- **チャート表示テスト**: TradingView API へのアクセスが必要
- **バッチ処理テスト**: DynamoDBモックライブラリが必要

---

## 9. テスト作成ガイドライン

### 9.1 ユニットテスト作成ガイドライン

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('Alert Evaluator', () => {
    describe('evaluate', () => {
        it('正常系: gte演算子で条件を満たす場合にtrueを返す', () => {
            // テストコード
        });

        it('正常系: gte演算子で条件を満たさない場合にfalseを返す', () => {
            // テストコード
        });

        it('エッジケース: 価格が境界値の場合', () => {
            // テストコード
        });
    });
});
```

#### モック対象

以下の副作用がある処理のみモック化:

- DynamoDB クライアント（`aws-sdk-client-mock` を使用）
- TradingView API（完全モック化）
- Web Push API（送信処理のみモック化）
- 現在時刻（取引時間外判定のテスト用）

### 9.2 E2Eテスト作成ガイドライン

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない
- **データクリーンアップ**: テスト後に作成したデータを削除

#### テスト粒度

- 主要フロー（E2E-001〜004）は細かくテスト
- 枝葉の機能（E2E-005〜009）は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

#### データクリーンアップパターン

```typescript
// 各テスト後にテストデータを削除
test.afterEach(async () => {
    // DynamoDB からテストデータを削除
    await deleteTestExchange('TEST-EXCHANGE');
    await deleteTestTicker('TEST:DUMMY');
    await deleteTestHolding(TEST_USER_ID, 'TEST:DUMMY');
    // ... 他のデータも削除
});
```

---

## 10. トラブルシューティング

### 10.1 よくある問題

#### E2Eテストでチャートが表示されない

**症状**: チャート描画エリアが空白

**原因**: TradingView API のレート制限、またはネットワークエラー

**解決方法**:
1. ブラウザの開発者ツールでネットワークエラーを確認
2. リトライ設定を追加（playwright.config.ts の `retries`）
3. TradingView API の呼び出し頻度を調整

#### カバレッジが80%に届かない

**症状**: CI でカバレッジチェックが失敗

**原因**: テストされていないコードパスが存在

**解決方法**:
1. カバレッジレポート（`coverage/lcov-report/index.html`）を確認
2. カバーされていない箇所を特定
3. 必要なテストケースを追加（特にエラーハンドリング、エッジケース）

#### DynamoDBへの接続エラー

**症状**: E2Eテストで "Unable to connect to DynamoDB" エラー

**原因**: AWS認証情報が設定されていない、またはdev環境へのアクセス権限がない

**解決方法**:
1. AWS認証情報を確認（`~/.aws/credentials`）
2. IAMロールに必要な権限があるか確認
3. DynamoDBテーブル名が正しいか確認（`.env.test`）

### 10.2 デバッグ方法

#### ユニットテストのデバッグ

```bash
# 特定のテストのみ実行
npm run test --workspace=stock-tracker-core -- tests/unit/services/alert-evaluator.test.ts

# デバッグ情報を出力
npm run test --workspace=stock-tracker-core -- --verbose

# カバレッジを確認しながらデバッグ
npm run test:coverage --workspace=stock-tracker-core
```

#### E2Eテストのデバッグ

```bash
# UI モードで実行（ステップバイステップで確認）
npm run test:e2e:ui --workspace=stock-tracker-web

# ブラウザ表示モードで実行
npm run test:e2e:headed --workspace=stock-tracker-web

# トレースビューアーで結果を確認
npx playwright show-trace test-results/{test-name}/trace.zip
```

---

## 11. 参考資料

### プラットフォームドキュメント

- [テスト戦略 (全体方針)](../../docs/development/testing.md)
- [コーディング規約](../../docs/development/rules.md)
- [共通設定ファイル](../../docs/development/configs.md)

### サービス固有ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [API仕様](./api-spec.md)
- [デプロイ・運用](./deployment.md)

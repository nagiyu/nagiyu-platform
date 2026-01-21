# Stock Tracker テスト仕様書

## 1. テスト戦略概要

### 1.1 テストの目的

Stock Tracker サービスの品質を保証し、以下を実現する:

- 主要機能（株価チャート表示、アラート通知、保有株式管理）の動作保証
- リグレッション防止
- Phase 1（MVP）スコープの完全な検証

### 1.2 テスト方針

- **ビジネスロジック重視**: core パッケージで80%以上のカバレッジを確保
- **web 固有処理の検証**: E2Eテストで画面操作・画面変化を高い水準で検証
- **外部API依存の最小化**: TradingView API、Web Push API はモック化
- **自動化**: CI/CDで継続的にテストを実行

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

| デバイス名       | 用途               | 画面サイズ  |
| ---------------- | ------------------ | ----------- |
| chromium-desktop | デスクトップChrome | 1920x1080   |
| chromium-mobile  | モバイルChrome     | Pixel 5相当 |
| webkit-mobile    | モバイルSafari     | iPhone相当  |

### 2.2 テスト優先順位

**Fast CI (高速フィードバック)**:
- 対象: chromium-mobile のみ
- トリガー: `integration/**` ブランチへのPR

**Full CI (完全テスト)**:
- 対象: 全デバイス（chromium-desktop, chromium-mobile, webkit-mobile）
- トリガー: `develop` ブランチへのPR

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| カテゴリ                | カバレッジ目標     | 測定方法      |
| ----------------------- | ------------------ | ------------- |
| ビジネスロジック (core/) | 80%以上            | Jest coverage |
| UI コンポーネント (web/) | 任意 (E2Eでカバー) | E2E テスト    |

### 3.2 カバレッジ計測方法

```bash
npm run test:coverage --workspace=stock-tracker-core
```

カバレッジ閾値は core パッケージの `jest.config.ts` で設定されており、80%未満の場合はCI失敗します。

---

## 4. E2Eテストシナリオ

### 4.1 テストシナリオ一覧

| シナリオID | シナリオ名   | 概要   | 優先度 | 対象デバイス          |
| ---------- | ------------ | ------ | ------ | --------------------- |
| E2E-001    | チャート表示フロー | 取引所・ティッカー選択→チャート表示 | 高 | 全デバイス |
| E2E-002    | アラート設定フロー | アラート作成→条件設定→保存 | 高 | 全デバイス |
| E2E-003    | Holding 管理フロー | Holding 登録・更新・削除 | 高 | 全デバイス |
| E2E-004    | Watchlist 管理フロー | Watchlist 登録・削除 | 高 | 全デバイス |
| E2E-005    | 権限チェック | stock-admin のみアクセス可能な画面 | 中 | chromium-mobile |
| E2E-006    | 取引所管理 | 取引所CRUD操作 | 中 | chromium-mobile |
| E2E-007    | ティッカー管理 | ティッカーCRUD操作 | 中 | chromium-mobile |
| E2E-008    | エラーハンドリング | バリデーションエラー、APIエラーの表示 | 中 | chromium-mobile |
| E2E-009    | ナビゲーション | 画面遷移の確認 | 低 | chromium-mobile |

### 4.2 シナリオ設計方針

**ユーザー視点でのテスト**:
- 実際のユーザー操作フローに沿ったシナリオ設計
- 画面遷移、データ入力、結果確認の一連の流れを検証

**優先度の考え方**:
- 高優先度: 主要機能（チャート表示、アラート設定、保有株式管理）は全デバイスでテスト
- 中優先度: 管理機能（取引所・ティッカー管理）は chromium-mobile のみでテスト
- 低優先度: ナビゲーションなど副次的な機能

**モバイルファースト**:
- Fast CI では chromium-mobile のみ実行（開発時の高速フィードバック重視）
- Full CI で全デバイス実行（リリース前の完全検証）

---

## 5. ユニットテスト戦略

### 5.1 core パッケージ（ビジネスロジック）

**対象**:
- `repositories/`: DynamoDB アクセスロジック
- `services/`: ビジネスロジック（アラート評価、価格計算、取引時間チェックなど）

**テスト方針**:
- 純粋関数を優先的にテスト
- 外部依存（DynamoDB、TradingView API）はモック化
- AAA パターン（Arrange, Act, Assert）を使用
- 一つのテストで一つの検証

**モック戦略**:
- DynamoDB: AWS SDK のモック（`aws-sdk-client-mock`）
- TradingView API: モッククラス提供
- Web Push: モッククラス提供

### 5.2 web パッケージ（UI）

**対象**:
- `app/api/`: API Routes

**テスト方針**:
- API Routes は E2E テストでカバー
- 複雑なロジックは core パッケージに移動してユニットテスト

---

## 6. テスト実行方法

### 6.1 ユニットテスト

```bash
# 通常実行
npm run test --workspace=stock-tracker-core

# watch モード
npm run test:watch --workspace=stock-tracker-core

# カバレッジ計測
npm run test:coverage --workspace=stock-tracker-core
```

### 6.2 E2Eテスト

```bash
# 全デバイスでテスト実行
npm run test:e2e --workspace=stock-tracker-web

# 特定デバイスのみ
npm run test:e2e --workspace=stock-tracker-web -- --project=chromium-mobile

# UI モード（開発時）
npm run test:e2e:ui --workspace=stock-tracker-web
```

### 6.3 CI/CD での実行

GitHub Actions ワークフローで自動実行されます:
- `.github/workflows/stock-tracker-verify-fast.yml` (Fast CI)
- `.github/workflows/stock-tracker-verify-full.yml` (Full CI)

---

## 7. テストデータ管理

### 7.1 テストデータ戦略

**E2Eテスト**:
- テスト用の DynamoDB テーブルを使用（`nagiyu-stock-tracker-main-test`）
- テスト前にシードデータを投入
- テスト後にクリーンアップ

**ユニットテスト**:
- モックデータを使用
- `tests/fixtures/` にテストデータを定義

### 7.2 認証情報

E2Eテストでは、テスト用ユーザーの認証情報を使用します:
- テストユーザー: 環境変数 `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` で設定
- テスト用 Admin ユーザー: `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`

---

## 8. テスト品質基準

### 8.1 合格基準

以下の全てを満たす場合、テストを合格とします:

- ユニットテスト: 全てのテストがパス
- カバレッジ: core パッケージで80%以上
- E2Eテスト: 全てのテストがパス（全対象デバイスで）
- Lint: エラーなし
- Format: フォーマットチェック通過

### 8.2 不安定なテストへの対応

- Playwright の `retry` 機能を活用（最大3回リトライ）
- テスト間の依存関係を排除
- 不安定なテストは修正または一時的に無効化（`test.skip`）

---

## 9. 参考リンク

- [要件定義書](./requirements.md)
- [アーキテクチャ設計書](./architecture.md)
- テストコード: `services/stock-tracker/core/tests/`, `services/stock-tracker/web/tests/e2e/`
- Playwright 設定: `services/stock-tracker/web/playwright.config.ts`
- Jest 設定: `services/stock-tracker/core/jest.config.ts`

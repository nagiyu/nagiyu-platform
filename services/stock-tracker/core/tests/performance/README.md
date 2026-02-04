# パフォーマンス測定ツール

このディレクトリには、Stock Tracker サービスのパフォーマンスを測定するためのツールが含まれています。

## ツール一覧

### 1. リポジトリベンチマークテスト

**ファイル**: `services/stock-tracker/core/tests/performance/benchmark-repositories.spec.ts`

**目的**: インメモリリポジトリの各操作のレイテンシーとメモリ使用量を測定

**実行方法**:

```bash
# ベンチマークテストを実行（coreパッケージから実行）
cd services/stock-tracker/core
npm run test tests/performance/benchmark-repositories.spec.ts

# 詳細な結果を表示
npm run test tests/performance/benchmark-repositories.spec.ts -- --verbose
```

**測定内容**:
- Alert Repository の CRUD 操作レイテンシー
- Holding Repository の CRUD 操作レイテンシー
- Ticker Repository の CRUD 操作レイテンシー
- Exchange Repository の CRUD 操作レイテンシー
- Watchlist Repository の CRUD 操作レイテンシー
- メモリ使用量（3000エンティティ作成時）

**出力**:
- コンソール: 各操作の平均・最小・最大・中央値
- テスト結果: Jest のテストレポート

### 2. E2E テスト実行時間測定スクリプト

**ファイル**: `services/stock-tracker/web/scripts/measure-e2e-performance.js`

**目的**: E2E テストの実行時間を測定し、JSON形式で保存

**実行方法**:

```bash
# chromium-mobile での測定（デフォルト）
cd services/stock-tracker/web
node scripts/measure-e2e-performance.js

# 特定のプロジェクトで測定
node scripts/measure-e2e-performance.js chromium-mobile
node scripts/measure-e2e-performance.js chromium-desktop
node scripts/measure-e2e-performance.js webkit-mobile

# 全プロジェクトで測定
node scripts/measure-e2e-performance.js all

# 2つの測定結果を比較
node scripts/measure-e2e-performance.js compare before.json after.json
```

**出力**:
- コンソール: 実行時間のサマリー
- ファイル: `test-results/performance/e2e-performance-*.json`

## パフォーマンス測定の実施手順

### ステップ1: ベースライン測定（DynamoDB使用時）

```bash
# 環境変数を DynamoDB モードに設定
export USE_IN_MEMORY_REPOSITORY=false

# E2E テスト実行時間を測定
cd services/stock-tracker/web
node scripts/measure-e2e-performance.js all
```

結果ファイルを `baseline.json` としてバックアップ:

```bash
cp test-results/performance/e2e-performance-summary-*.json baseline.json
```

### ステップ2: インメモリリポジトリでの測定

```bash
# 環境変数をインメモリモードに設定
export USE_IN_MEMORY_REPOSITORY=true

# E2E テスト実行時間を測定
node scripts/measure-e2e-performance.js all
```

結果ファイルを `in-memory.json` としてバックアップ:

```bash
cp test-results/performance/e2e-performance-summary-*.json in-memory.json
```

### ステップ3: 比較レポート生成

```bash
# 2つの結果を比較
node scripts/measure-e2e-performance.js compare baseline.json in-memory.json
```

### ステップ4: リポジトリベンチマーク実行

```bash
# リポジトリ操作のレイテンシーとメモリ使用量を測定
cd services/stock-tracker/core
npm run test tests/performance/benchmark-repositories.spec.ts -- --verbose
```

## 測定結果の記録

測定結果は以下のドキュメントに記録されています:

- **パフォーマンスレポート**: `docs/services/stock-tracker/performance-report.md`

## 期待値とパフォーマンス目標

### リポジトリ操作レイテンシー

| 操作 | 期待値 |
|------|--------|
| create | < 1.0ms |
| getById | < 0.5ms |
| getByUserId | < 1.0ms |
| update | < 1.0ms |
| delete | < 0.5ms |

### メモリ使用量

| データ量 | 期待値 |
|---------|--------|
| 3000エンティティ | < 50MB |

### E2E テスト実行時間

| 項目 | 目標 |
|------|------|
| DynamoDB 比での改善率 | 20%以上の短縮 |
| chromium-mobile での実行時間 | < 200秒 |

## トラブルシューティング

### Playwright がインストールされていない

```bash
# Playwright をインストール
npm install --workspace=stock-tracker-web
npx playwright install
```

### DynamoDB 接続エラー

E2E テストで DynamoDB を使用する場合、以下の環境変数が必要です:

```bash
export AWS_REGION=us-east-1
export DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-main-dev
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
```

インメモリモードでは不要です。

### メモリ不足エラー

大量のデータを作成するテストでメモリ不足が発生する場合:

```bash
# Node.js のヒープサイズを増やす
export NODE_OPTIONS="--max-old-space-size=4096"
npm run test tests/performance/benchmark-repositories.spec.ts
```

## 参考資料

- [パフォーマンスレポート](../../../docs/services/stock-tracker/performance-report.md)
- [テスト仕様書](../../../docs/services/stock-tracker/testing.md)
- [アーキテクチャ設計書](../../../docs/services/stock-tracker/architecture.md)
- [Playwright ドキュメント](https://playwright.dev/)
- [Jest ドキュメント](https://jestjs.io/)

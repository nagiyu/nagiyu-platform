# クイックスタート: Stock Tracker 日次サマリー表示

**ブランチ**: `001-stock-daily-summary` | **日付**: 2026-02-27

---

## 概要

このガイドは「Stock Tracker 日次サマリー表示」機能の実装・テスト・デプロイを素早く開始するための手順書です。

---

## 前提条件

- Node.js 22+ がインストール済み
- `npm install` 完了済み（モノレポルート）
- AWS 認証情報（開発環境用）が設定済み（本番 DynamoDB テスト時のみ必要）

---

## 1. ローカル開発環境のセットアップ

### 1.1 依存パッケージのビルド（依存順序を守ること）

```bash
# モノレポルートで実行
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/aws
npm run build --workspace @nagiyu/stock-tracker-core
```

### 1.2 Web サーバーの起動（インメモリモード）

```bash
cd services/stock-tracker/web
USE_IN_MEMORY_REPOSITORY=true npm run dev
```

ブラウザで `http://localhost:3000/summaries` を開くとサマリー画面が表示されます（データは空）。

---

## 2. 主要な実装ファイル一覧

| ファイル | 役割 | 新規/更新 |
|---------|------|---------|
| `core/src/types.ts` | `DailySummary` 型・`DynamoDBItem` 型更新 | 更新 |
| `core/src/entities/daily-summary.entity.ts` | エンティティ型定義 | **新規** |
| `core/src/mappers/daily-summary.mapper.ts` | DynamoDB ↔ Entity 変換 | **新規** |
| `core/src/repositories/daily-summary.repository.interface.ts` | リポジトリインターフェース | **新規** |
| `core/src/repositories/dynamodb-daily-summary.repository.ts` | DynamoDB 実装 | **新規** |
| `core/src/repositories/in-memory-daily-summary.repository.ts` | InMemory 実装（テスト用） | **新規** |
| `core/src/index.ts` | 新規エクスポート追加 | 更新 |
| `batch/src/summary.ts` | 日次サマリー生成バッチ（1時間間隔） | **新規** |
| `web/app/api/summaries/route.ts` | GET /api/summaries API ルート | **新規** |
| `web/app/summaries/page.tsx` | サマリー一覧ページ（React クライアントコンポーネント） | **新規** |
| `web/lib/repository-factory.ts` | `createDailySummaryRepository()` 追加 | 更新 |
| `infra/stock-tracker/lib/dynamodb-stack.ts` | GSI4 (ExchangeSummaryIndex) 追加 | 更新 |
| `infra/stock-tracker/lib/eventbridge-stack.ts` | Summary バッチ用 EventBridge ルール追加 | 更新 |
| `infra/stock-tracker/lib/lambda-stack.ts` | Summary Lambda 追加 | 更新 |

---

## 3. バッチのローカル動作確認

### 3.1 バッチのビルドと実行

```bash
cd services/stock-tracker/batch
npm run build

# バッチを手動実行（モック EventBridge イベント）
node -e "
const { handler } = await import('./dist/src/summary.js');
const event = {
  version: '0', id: 'test-001', 'detail-type': 'Scheduled Event',
  source: 'aws.events', account: '123456789', time: new Date().toISOString(),
  region: 'ap-northeast-1', resources: [], detail: {}
};
const result = await handler(event);
console.log(JSON.stringify(result, null, 2));
" --input-type=module
```

### 3.2 バッチのユニットテスト実行

```bash
cd services/stock-tracker/batch
npm run test -- --testPathPattern="summary"
```

---

## 4. Core パッケージのテスト

### 4.1 DailySummary リポジトリのテスト

```bash
cd services/stock-tracker/core
npm run test -- --testPathPattern="daily-summary"
```

### 4.2 カバレッジ確認（80% 以上が目標）

```bash
npm run test:coverage --workspace @nagiyu/stock-tracker-core
```

---

## 5. Web API・UI のテスト

### 5.1 ユニットテスト

```bash
npm run test --workspace @nagiyu/stock-tracker-web
```

### 5.2 E2E テスト（Playwright）

```bash
cd services/stock-tracker/web
# Fast CI 相当（chromium-mobile のみ）
npx playwright test --project=chromium-mobile --grep "summary"

# Full CI 相当（全デバイス）
npx playwright test --grep "summary"
```

---

## 6. DynamoDB の GSI4 追加について

ローカル開発では `USE_IN_MEMORY_REPOSITORY=true` を使用するため GSI4 は不要です。
開発・本番環境では CDK デプロイ時に GSI4 が自動作成されます。

```bash
# CDK デプロイ（インフラチームが実施）
cd infra
npx cdk deploy StockTrackerDynamoDB-dev --require-approval never
```

**注意**: 既存テーブルへの GSI 追加は DynamoDB のオンラインインデックス構築によりバックフィルが発生します。大規模テーブルでは完了まで数分〜数時間かかる場合があります。

---

## 7. サマリー画面の UI 確認

1. `http://localhost:3000` にアクセスしてログイン
2. サイドナビまたはクイックアクションから「サマリー」に遷移（`/summaries`）
3. 取引所ごとのティッカーサマリー一覧が表示される
4. データが空の場合は「データがありません」メッセージが表示される（ユーザーストーリー 1 - シナリオ 2）

---

## 8. よくある問題と解決策

### TradingView API タイムアウト

バッチ実行時に TradingView API がタイムアウトする場合:

```
Error: TradingView API のタイムアウトが発生しました
```

解決策: `getChartData` の `timeout` オプションを延長する（デフォルト 10000ms）。ローカル環境ではネットワーク遅延が発生しやすいため `30000ms` を推奨。

### GSI4 が見つからない（QueryCommand エラー）

DynamoDB 実装使用時に以下のエラーが発生する場合:

```
ValidationException: The table does not have the specified index: ExchangeSummaryIndex
```

解決策: CDK で `dynamodb-stack.ts` の更新をデプロイする。または `USE_IN_MEMORY_REPOSITORY=true` でインメモリモードを使用する。

### `isTradingHours` で全取引所がスキップされる

バッチをローカルで実行した際に全取引所がスキップされる場合、現在時刻が全取引所の取引時間内である可能性があります。`summary.ts` のデバッグログで各取引所の判定結果を確認してください。

---

## 9. 参考ドキュメント

- [spec.md](./spec.md) - 機能仕様書
- [plan.md](./plan.md) - 実装計画
- [research.md](./research.md) - 技術調査結果
- [data-model.md](./data-model.md) - データモデル定義
- [contracts/GET-api-summaries.md](./contracts/GET-api-summaries.md) - API コントラクト
- [constitution.md](../../.specify/memory/constitution.md) - 開発憲法

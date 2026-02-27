# API コントラクト: GET /api/summaries

**ブランチ**: `001-stock-daily-summary` | **日付**: 2026-02-27
**対応するデータモデル**: [data-model.md](../data-model.md)

---

## エンドポイント概要

| 項目 | 内容 |
|------|------|
| メソッド | `GET` |
| パス | `/api/summaries` |
| 認証 | 必須（`stocks:read` スコープ） |
| 説明 | 指定日（デフォルト: 当日）の全取引所の日次サマリーを取得する |

---

## リクエスト

### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|----------|------|
| `date` | `string` | ✗ | 当日（サーバー UTC 日付） | 対象日（`YYYY-MM-DD` 形式） |

#### リクエスト例

```
GET /api/summaries
GET /api/summaries?date=2024-01-15
```

### ヘッダー

| ヘッダー | 値 | 説明 |
|---------|-----|------|
| `Cookie` | セッションクッキー | NextAuth.js セッション（既存認証フロー） |

---

## レスポンス

### 200 OK

取引所ごとにグループ化されたサマリーリストを返す。

```typescript
// レスポンス型定義
interface SummariesResponse {
  /** 対象日（YYYY-MM-DD 形式） */
  date: string;
  /** 取引所ごとのグループリスト */
  exchanges: ExchangeSummaryGroup[];
}

interface ExchangeSummaryGroup {
  /** 取引所ID */
  exchangeId: string;
  /** 取引所名 */
  exchangeName: string;
  /** 当該取引所のティッカーサマリー一覧 */
  summaries: TickerSummary[];
}

interface TickerSummary {
  /** ティッカーID（例: "NSDQ:AAPL"） */
  tickerId: string;
  /** シンボル（例: "AAPL"） */
  symbol: string;
  /** 銘柄名（例: "Apple Inc."） */
  name: string;
  /** 始値 */
  open: number;
  /** 高値 */
  high: number;
  /** 安値 */
  low: number;
  /** 終値 */
  close: number;
  /** 更新日時（ISO 8601） */
  updatedAt: string;
}
```

#### レスポンス例

```json
{
  "date": "2024-01-15",
  "exchanges": [
    {
      "exchangeId": "NASDAQ",
      "exchangeName": "NASDAQ",
      "summaries": [
        {
          "tickerId": "NSDQ:AAPL",
          "symbol": "AAPL",
          "name": "Apple Inc.",
          "open": 182.15,
          "high": 183.92,
          "low": 181.44,
          "close": 183.31,
          "updatedAt": "2024-01-15T21:00:00.000Z"
        },
        {
          "tickerId": "NSDQ:NVDA",
          "symbol": "NVDA",
          "name": "NVIDIA Corporation",
          "open": 495.30,
          "high": 501.10,
          "low": 492.55,
          "close": 498.00,
          "updatedAt": "2024-01-15T21:00:00.000Z"
        }
      ]
    },
    {
      "exchangeId": "NYSE",
      "exchangeName": "NYSE",
      "summaries": []
    }
  ]
}
```

**備考**:
- `summaries` が空配列の場合: 当該取引所には当日のサマリーデータが存在しない（取引時間未終了 or データ未生成）
- 取引所は全件返す（`summaries: []` も含む）ことで UI 側でのグループ化が常に一定になる

---

### 400 Bad Request

`date` パラメータのフォーマットが不正な場合。

```json
{
  "error": "INVALID_DATE",
  "message": "日付はYYYY-MM-DD形式で指定してください"
}
```

---

### 401 Unauthorized

認証されていない場合（NextAuth.js セッション未存在）。

```json
{
  "error": "Unauthorized",
  "message": "認証が必要です"
}
```

---

### 403 Forbidden

`stocks:read` 権限がない場合。

```json
{
  "error": "Forbidden",
  "message": "権限がありません"
}
```

---

### 500 Internal Server Error

DynamoDB アクセスエラーなどサーバーエラー。

```json
{
  "error": "INTERNAL_ERROR",
  "message": "サマリーの取得に失敗しました"
}
```

---

## 実装詳細（Next.js API Route）

### ファイルパス
```
services/stock-tracker/web/app/api/summaries/route.ts
```

### 処理フロー

```
1. withAuth で認証チェック（stocks:read）
2. クエリパラメータ ?date= を取得（省略時は当日 UTC 日付）
3. YYYY-MM-DD 形式バリデーション
4. createExchangeRepository() で全取引所を取得
5. createDailySummaryRepository() で各取引所の DailySummary を取得（GSI4 Query）
6. 各サマリーに対して createTickerRepository() で Ticker.Name / Ticker.Symbol を解決
7. 取引所グループ化してレスポンスを組み立てる
8. JSON レスポンスを返す
```

**パフォーマンス考慮**: ティッカー名解決はティッカー一覧を一括取得（キャッシュまたは事前ロード）し、サマリーごとの個別 GetItem は避ける。

---

## 関連するバッチ API（参考）

本エンドポイントが返すデータは `services/stock-tracker/batch/src/summary.ts` によって生成される。バッチの動作は以下の通り:

```
1. 全取引所を取得
2. 各取引所に対して isTradingHours チェック
3. 取引時間外の取引所 → 全ティッカーに対して getChartData('D') を呼び出し
4. 取得した OHLCV → DailySummaryRepository.upsert() で保存
```

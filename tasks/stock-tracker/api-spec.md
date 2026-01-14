# Stock Tracker API 仕様書

**ステータス**: Draft（設計段階）
**作成日**: 2026-01-13
**最終更新**: 2026-01-13

---

## 1. API 概要

### 1.1 ベース URL

| 環境 | URL |
|------|-----|
| 開発 | `https://dev-stock-tracker.nagiyu.com` |
| 本番 | `https://stock-tracker.nagiyu.com` |

### 1.2 認証方式

#### JWT トークン (Cookie)

- **Cookie 名**: `__Secure-next-auth.session-token`
- **形式**: 暗号化された JWT
- **有効期限**: 30日
- **スコープ**: `.nagiyu.com` (全サブドメインで共有)
- **認証基盤**: Auth サービスによる共通認証（NextAuth.js）

#### リクエスト例

```http
GET /api/holdings HTTP/1.1
Host: stock-tracker.nagiyu.com
Cookie: __Secure-next-auth.session-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 1.3 共通レスポンス形式

#### 成功レスポンス

シンプルな形式を採用（Phase 1 MVP）：

```json
{
    "holdingId": "holding_abc123",
    "tickerId": "NSDQ:NVDA",
    "quantity": 100,
    "averagePrice": 850.5
}
```

#### エラーレスポンス

```json
{
    "error": "UNAUTHORIZED",
    "message": "認証が必要です"
}
```

### 1.4 HTTP ステータスコード

| コード | 意味 | 用途 |
|--------|------|------|
| 200 | OK | 成功 |
| 201 | Created | リソース作成成功 |
| 400 | Bad Request | リクエストが不正 |
| 401 | Unauthorized | 認証が必要 |
| 403 | Forbidden | 権限不足 |
| 404 | Not Found | リソースが存在しない |
| 500 | Internal Server Error | サーバーエラー |

### 1.5 エラーコード一覧

| コード | HTTP ステータス | 説明 |
|--------|----------------|------|
| `UNAUTHORIZED` | 401 | 認証が必要 |
| `FORBIDDEN` | 403 | 権限が不足している |
| `NOT_FOUND` | 404 | リソースが見つからない |
| `INVALID_REQUEST` | 400 | リクエストが不正 |
| `INTERNAL_ERROR` | 500 | 内部エラー |

---

## 2. エンドポイント一覧

| メソッド | パス | 説明 | 認証 | 権限 |
|---------|------|------|------|------|
| GET | `/api/health` | ヘルスチェック | 不要 | - |
| GET | `/api/exchanges` | 取引所一覧 | 必須 | `stocks:read` |
| POST | `/api/exchanges` | 取引所作成 | 必須 | `stocks:manage-data` |
| PUT | `/api/exchanges/{id}` | 取引所更新 | 必須 | `stocks:manage-data` |
| DELETE | `/api/exchanges/{id}` | 取引所削除 | 必須 | `stocks:manage-data` |
| GET | `/api/tickers` | ティッカー一覧 | 必須 | `stocks:read` |
| POST | `/api/tickers` | ティッカー作成 | 必須 | `stocks:manage-data` |
| PUT | `/api/tickers/{id}` | ティッカー更新 | 必須 | `stocks:manage-data` |
| DELETE | `/api/tickers/{id}` | ティッカー削除 | 必須 | `stocks:manage-data` |
| GET | `/api/holdings` | 保有株式一覧 | 必須 | `stocks:read` |
| POST | `/api/holdings` | 保有株式登録 | 必須 | `stocks:write-own` |
| PUT | `/api/holdings/{id}` | 保有株式更新 | 必須 | `stocks:write-own` |
| DELETE | `/api/holdings/{id}` | 保有株式削除 | 必須 | `stocks:write-own` |
| GET | `/api/watchlist` | ウォッチリスト一覧 | 必須 | `stocks:read` |
| POST | `/api/watchlist` | ウォッチリスト登録 | 必須 | `stocks:write-own` |
| DELETE | `/api/watchlist/{id}` | ウォッチリスト削除 | 必須 | `stocks:write-own` |
| GET | `/api/alerts` | アラート一覧 | 必須 | `stocks:read` |
| POST | `/api/alerts` | アラート作成 | 必須 | `stocks:write-own` |
| PUT | `/api/alerts/{id}` | アラート更新 | 必須 | `stocks:write-own` |
| DELETE | `/api/alerts/{id}` | アラート削除 | 必須 | `stocks:write-own` |
| GET | `/api/chart/{tickerId}` | チャートデータ取得 | 必須 | `stocks:read` |
| POST | `/api/push/subscribe` | Web Push 登録 | 必須 | `stocks:write-own` |
| DELETE | `/api/push/unsubscribe` | Web Push 解除 | 必須 | `stocks:write-own` |

---

## 3. エンドポイント詳細

### 3.1 ヘルスチェック API

#### 3.1.1 ヘルスチェック

サービスの稼働状況を確認します。

##### エンドポイント

```
GET /api/health
```

##### 認証

不要（公開エンドポイント）

##### レスポンス (200 OK)

```json
{
    "status": "ok",
    "timestamp": "2026-01-13T12:34:56.789Z",
    "version": "1.0.0"
}
```

---

### 3.2 取引所管理 API

#### 3.2.1 取引所一覧取得

登録されている全取引所を取得します。

##### エンドポイント

```
GET /api/exchanges
```

##### 必要な権限

- `stocks:read`

##### リクエスト例

```http
GET /api/exchanges HTTP/1.1
Host: stock-tracker.nagiyu.com
Cookie: nagiyu-session=...
```

##### レスポンス (200 OK)

```json
{
    "exchanges": [
        {
            "exchangeId": "NASDAQ",
            "name": "NASDAQ Stock Market",
            "key": "NSDQ",
            "timezone": "America/New_York",
            "tradingHours": {
                "start": "09:30",
                "end": "16:00"
            }
        },
        {
            "exchangeId": "NYSE",
            "name": "New York Stock Exchange",
            "key": "NYSE",
            "timezone": "America/New_York",
            "tradingHours": {
                "start": "09:30",
                "end": "16:00"
            }
        }
    ]
}
```

##### エラーレスポンス

```json
// 401 Unauthorized
{
    "error": "UNAUTHORIZED",
    "message": "認証が必要です"
}

// 403 Forbidden
{
    "error": "FORBIDDEN",
    "message": "この操作を実行する権限がありません"
}
```

#### 3.2.2 取引所作成

新しい取引所を登録します（stock-admin のみ）。

##### エンドポイント

```
POST /api/exchanges
```

##### 必要な権限

- `stocks:manage-data`

##### リクエストボディ

```json
{
    "exchangeId": "TSE",
    "name": "Tokyo Stock Exchange",
    "key": "TSE",
    "timezone": "Asia/Tokyo",
    "tradingHours": {
        "start": "09:00",
        "end": "15:00"
    }
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| exchangeId | string | ✅ | 取引所ID（一意、英数字） |
| name | string | ✅ | 取引所名 |
| key | string | ✅ | TradingView API用キー |
| timezone | string | ✅ | タイムゾーン（IANA形式） |
| tradingHours | object | ✅ | 取引時間 |
| tradingHours.start | string | ✅ | 開始時刻（HH:MM） |
| tradingHours.end | string | ✅ | 終了時刻（HH:MM） |

##### レスポンス (201 Created)

```json
{
    "exchangeId": "TSE",
    "name": "Tokyo Stock Exchange",
    "key": "TSE",
    "timezone": "Asia/Tokyo",
    "tradingHours": {
        "start": "09:00",
        "end": "15:00"
    },
    "createdAt": "2026-01-13T12:34:56.789Z"
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": "INVALID_REQUEST",
    "message": "exchangeId は既に存在します"
}

// 403 Forbidden
{
    "error": "FORBIDDEN",
    "message": "この操作を実行する権限がありません"
}
```

#### 3.2.3 取引所更新

取引所情報を更新します（stock-admin のみ）。

##### エンドポイント

```
PUT /api/exchanges/{id}
```

##### 必要な権限

- `stocks:manage-data`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | 取引所ID |

##### リクエストボディ

```json
{
    "name": "Tokyo Stock Exchange (Updated)",
    "tradingHours": {
        "start": "09:00",
        "end": "15:30"
    }
}
```

##### レスポンス (200 OK)

```json
{
    "exchangeId": "TSE",
    "name": "Tokyo Stock Exchange (Updated)",
    "key": "TSE",
    "timezone": "Asia/Tokyo",
    "tradingHours": {
        "start": "09:00",
        "end": "15:30"
    },
    "updatedAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.2.4 取引所削除

取引所を削除します（stock-admin のみ）。

##### エンドポイント

```
DELETE /api/exchanges/{id}
```

##### 必要な権限

- `stocks:manage-data`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | 取引所ID |

##### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedExchangeId": "TSE"
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": "INVALID_REQUEST",
    "message": "関連するティッカーが存在するため削除できません"
}
```

---

### 3.3 ティッカー管理 API

#### 3.3.1 ティッカー一覧取得

登録されているティッカーを取得します。

##### エンドポイント

```
GET /api/tickers
```

##### 必要な権限

- `stocks:read`

##### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| exchangeId | string | - | - | 取引所IDでフィルタ |
| limit | number | - | 50 | 取得件数（最大100） |
| lastKey | string | - | - | ページネーション用キー |

##### リクエスト例

```http
GET /api/tickers?exchangeId=NASDAQ&limit=10 HTTP/1.1
Host: stock-tracker.nagiyu.com
Cookie: nagiyu-session=...
```

##### レスポンス (200 OK)

```json
{
    "tickers": [
        {
        "tickerId": "NSDQ:NVDA",
        "symbol": "NVDA",
        "name": "NVIDIA Corporation",
        "exchangeId": "NASDAQ"
        },
        {
        "tickerId": "NSDQ:AAPL",
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "exchangeId": "NASDAQ"
        }
    ],
    "pagination": {
        "count": 2,
        "lastKey": "NSDQ:AAPL"
    }
}
```

#### 3.3.2 ティッカー作成

新しいティッカーを登録します（stock-admin のみ）。

##### エンドポイント

```
POST /api/tickers
```

##### 必要な権限

- `stocks:manage-data`

##### リクエストボディ

```json
{
    "symbol": "TSLA",
    "name": "Tesla, Inc.",
    "exchangeId": "NASDAQ"
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| symbol | string | ✅ | ティッカーシンボル |
| name | string | ✅ | 銘柄名 |
| exchangeId | string | ✅ | 取引所ID |

##### レスポンス (201 Created)

```json
{
    "tickerId": "NSDQ:TSLA",
    "symbol": "TSLA",
    "name": "Tesla, Inc.",
    "exchangeId": "NASDAQ",
    "createdAt": "2026-01-13T12:34:56.789Z"
}
```

**Note**: tickerId は `{Exchange.Key}:{Symbol}` の形式で自動生成されます。

#### 3.3.3 ティッカー更新

ティッカー情報を更新します（stock-admin のみ）。

##### エンドポイント

```
PUT /api/tickers/{id}
```

##### 必要な権限

- `stocks:manage-data`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | ティッカーID |

##### リクエストボディ

```json
{
    "name": "Tesla, Inc. (Updated)"
}
```

##### レスポンス (200 OK)

```json
{
    "tickerId": "NSDQ:TSLA",
    "symbol": "TSLA",
    "name": "Tesla, Inc. (Updated)",
    "exchangeId": "NASDAQ",
    "updatedAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.3.4 ティッカー削除

ティッカーを削除します（stock-admin のみ）。

##### エンドポイント

```
DELETE /api/tickers/{id}
```

##### 必要な権限

- `stocks:manage-data`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | ティッカーID |

##### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedTickerId": "NSDQ:TSLA"
}
```

---

### 3.4 保有株式管理 API

#### 3.4.1 保有株式一覧取得

ユーザーの保有株式を取得します。

##### エンドポイント

```
GET /api/holdings
```

##### 必要な権限

- `stocks:read`

##### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| limit | number | - | 50 | 取得件数（最大100） |
| lastKey | string | - | - | ページネーション用キー |

##### レスポンス (200 OK)

```json
{
    "holdings": [
        {
            "holdingId": "holding_abc123",
            "tickerId": "NSDQ:NVDA",
            "symbol": "NVDA",
            "name": "NVIDIA Corporation",
            "quantity": 100,
            "averagePrice": 850.5,
            "currency": "USD",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-10T00:00:00.000Z"
        }
    ],
    "pagination": {
        "count": 1,
        "lastKey": "holding_abc123"
    }
}
```

#### 3.4.2 保有株式登録

保有株式を登録します。

##### エンドポイント

```
POST /api/holdings
```

##### 必要な権限

- `stocks:write-own`

##### リクエストボディ

```json
{
    "tickerId": "NSDQ:NVDA",
    "quantity": 100,
    "averagePrice": 850.5,
    "currency": "USD"
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| tickerId | string | ✅ | ティッカーID |
| quantity | number | ✅ | 保有数量 |
| averagePrice | number | ✅ | 平均取得価格 |
| currency | string | ✅ | 通貨コード（USD, JPY等） |

##### レスポンス (201 Created)

```json
{
    "holdingId": "holding_abc123",
    "tickerId": "NSDQ:NVDA",
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "quantity": 100,
    "averagePrice": 850.5,
    "currency": "USD",
    "createdAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.4.3 保有株式更新

保有株式情報を更新します。

##### エンドポイント

```
PUT /api/holdings/{id}
```

##### 必要な権限

- `stocks:write-own`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | 保有株式ID |

##### リクエストボディ

```json
{
    "quantity": 150,
    "averagePrice": 900.0
}
```

##### レスポンス (200 OK)

```json
{
    "holdingId": "holding_abc123",
    "tickerId": "NSDQ:NVDA",
    "quantity": 150,
    "averagePrice": 900.0,
    "currency": "USD",
    "updatedAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.4.4 保有株式削除

保有株式を削除します。

##### エンドポイント

```
DELETE /api/holdings/{id}
```

##### 必要な権限

- `stocks:write-own`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | 保有株式ID |

##### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedHoldingId": "holding_abc123"
}
```

---

### 3.5 ウォッチリスト管理 API

#### 3.5.1 ウォッチリスト一覧取得

ユーザーのウォッチリストを取得します。

##### エンドポイント

```
GET /api/watchlist
```

##### 必要な権限

- `stocks:read`

##### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| limit | number | - | 50 | 取得件数（最大100） |
| lastKey | string | - | - | ページネーション用キー |

##### レスポンス (200 OK)

```json
{
    "watchlist": [
        {
            "watchlistId": "watch_xyz789",
            "tickerId": "NSDQ:AAPL",
            "symbol": "AAPL",
            "name": "Apple Inc.",
            "createdAt": "2026-01-13T12:34:56.789Z"
        }
    ],
    "pagination": {
        "count": 1,
        "lastKey": "watch_xyz789"
    }
}
```

#### 3.5.2 ウォッチリスト登録

ウォッチリストに銘柄を追加します。

##### エンドポイント

```
POST /api/watchlist
```

##### 必要な権限

- `stocks:write-own`

##### リクエストボディ

```json
{
    "tickerId": "NSDQ:AAPL"
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| tickerId | string | ✅ | ティッカーID |

##### レスポンス (201 Created)

```json
{
    "watchlistId": "watch_xyz789",
    "tickerId": "NSDQ:AAPL",
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "createdAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.5.3 ウォッチリスト削除

ウォッチリストから銘柄を削除します。

##### エンドポイント

```
DELETE /api/watchlist/{id}
```

##### 必要な権限

- `stocks:write-own`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | ウォッチリストID |

##### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedWatchlistId": "watch_xyz789"
}
```

---

### 3.6 アラート管理 API

#### 3.6.1 アラート一覧取得

ユーザーのアラート設定を取得します。

##### エンドポイント

```
GET /api/alerts
```

##### 必要な権限

- `stocks:read`

##### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| limit | number | - | 50 | 取得件数（最大100） |
| lastKey | string | - | - | ページネーション用キー |

##### レスポンス (200 OK)

```json
{
    "alerts": [
        {
            "alertId": "alert_def456",
            "tickerId": "NSDQ:NVDA",
            "symbol": "NVDA",
            "name": "NVIDIA Corporation",
            "mode": "BUY",
            "frequency": "MINUTE_LEVEL",
            "conditions": [
                {
                    "field": "price",
                    "operator": "lte",
                    "value": 800.0
                }
            ],
            "enabled": true,
            "createdAt": "2026-01-13T12:34:56.789Z",
            "updatedAt": "2026-01-13T12:34:56.789Z"
        }
    ],
    "pagination": {
        "count": 1,
        "lastKey": "alert_def456"
    }
}
```

#### 3.6.2 アラート作成

アラートを作成します。

##### エンドポイント

```
POST /api/alerts
```

##### 必要な権限

- `stocks:write-own`

##### リクエストボディ

```json
{
    "tickerId": "NSDQ:NVDA",
    "mode": "BUY",
    "frequency": "MINUTE_LEVEL",
    "conditions": [
        {
            "field": "price",
            "operator": "lte",
            "value": 800.0
        }
    ]
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| tickerId | string | ✅ | ティッカーID |
| mode | string | ✅ | モード（`BUY` or `SELL`） |
| frequency | string | ✅ | 頻度（`MINUTE_LEVEL` or `HOURLY_LEVEL`） |
| conditions | array | ✅ | 条件リスト（Phase 1: 1条件のみ） |
| conditions[].field | string | ✅ | フィールド名（Phase 1: `price` のみ） |
| conditions[].operator | string | ✅ | 演算子（`gte`, `lte`） |
| conditions[].value | number | ✅ | 閾値 |

##### レスポンス (201 Created)

```json
{
    "alertId": "alert_def456",
    "tickerId": "NSDQ:NVDA",
    "symbol": "NVDA",
    "name": "NVIDIA Corporation",
    "mode": "BUY",
    "frequency": "MINUTE_LEVEL",
    "conditions": [
        {
            "field": "price",
            "operator": "lte",
            "value": 800.0
        }
    ],
    "enabled": true,
    "createdAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.6.3 アラート更新

アラート設定を更新します。

##### エンドポイント

```
PUT /api/alerts/{id}
```

##### 必要な権限

- `stocks:write-own`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | アラートID |

##### リクエストボディ

```json
{
    "conditions": [
        {
            "value": 750.0
        }
    ],
    "enabled": false
}
```

##### レスポンス (200 OK)

```json
{
    "alertId": "alert_def456",
    "tickerId": "NSDQ:NVDA",
    "mode": "BUY",
    "frequency": "MINUTE_LEVEL",
    "conditions": [
        {
            "field": "price",
            "operator": "lte",
            "value": 750.0
        }
    ],
    "enabled": false,
    "updatedAt": "2026-01-13T12:34:56.789Z"
}
```

#### 3.6.4 アラート削除

アラートを削除します。

##### エンドポイント

```
DELETE /api/alerts/{id}
```

##### 必要な権限

- `stocks:write-own`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| id | string | アラートID |

##### レスポンス (200 OK)

```json
{
    "success": true,
    "deletedAlertId": "alert_def456"
}
```

---

### 3.7 チャートデータ API

#### 3.7.1 チャートデータ取得

指定ティッカーのチャートデータを取得します。

##### エンドポイント

```
GET /api/chart/{tickerId}
```

##### 必要な権限

- `stocks:read`

##### パスパラメータ

| パラメータ | 型 | 説明 |
|-----------|---|------|
| tickerId | string | ティッカーID（例: `NSDQ:NVDA`） |

##### クエリパラメータ

| パラメータ | 型 | 必須 | デフォルト | 説明 |
|-----------|---|------|-----------|------|
| timeframe | string | - | `60` | タイムフレーム（`1`, `5`, `15`, `30`, `60`, `120`, `240`, `D`, `W`, `M`） |
| from | number | - | - | 開始日時（UNIX timestamp 秒） |
| to | number | - | - | 終了日時（UNIX timestamp 秒） |
| count | number | - | 30 | 取得件数（最大500） |

**Note**: `from`/`to` または `count` のいずれかを指定。両方指定時は `from`/`to` が優先。

##### リクエスト例

```http
GET /api/chart/NSDQ:NVDA?timeframe=60&count=100 HTTP/1.1
Host: stock-tracker.nagiyu.com
Cookie: nagiyu-session=...
```

##### レスポンス (200 OK)

```json
{
    "tickerId": "NSDQ:NVDA",
    "symbol": "NVDA",
    "timeframe": "60",
    "data": [
        {
            "time": 1705132800,
            "open": 850.5,
            "high": 860.0,
            "low": 845.0,
            "close": 855.0,
            "volume": 1234567
        },
        {
            "time": 1705136400,
            "open": 855.0,
            "high": 870.0,
            "low": 850.0,
            "close": 865.0,
            "volume": 2345678
        }
    ]
}
```

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": "INVALID_REQUEST",
    "message": "無効な timeframe です"
}

// 404 Not Found
{
    "error": "NOT_FOUND",
    "message": "ティッカーが見つかりません"
}
```

---

### 3.8 Web Push 通知 API

#### 3.8.1 Web Push 登録

Web Push 通知のサブスクリプションを登録します。

##### エンドポイント

```
POST /api/push/subscribe
```

##### 必要な権限

- `stocks:write-own`

##### リクエストボディ

```json
{
    "subscription": {
        "endpoint": "https://fcm.googleapis.com/fcm/send/...",
        "keys": {
            "p256dh": "BNcRd...",
            "auth": "tBHI..."
        }
    }
}
```

##### リクエストボディスキーマ

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| subscription | object | ✅ | Push Subscription オブジェクト |
| subscription.endpoint | string | ✅ | Push サービスのエンドポイント |
| subscription.keys | object | ✅ | 暗号化キー |
| subscription.keys.p256dh | string | ✅ | 公開鍵 |
| subscription.keys.auth | string | ✅ | 認証シークレット |

##### レスポンス (201 Created)

```json
{
    "success": true,
    "subscriptionId": "sub_ghi123"
}
```

#### 3.8.2 Web Push 解除

Web Push 通知のサブスクリプションを解除します。

##### エンドポイント

```
DELETE /api/push/unsubscribe
```

##### 必要な権限

- `stocks:write-own`

##### リクエストボディ

```json
{
    "endpoint": "https://fcm.googleapis.com/fcm/send/..."
}
```

##### レスポンス (200 OK)

```json
{
    "success": true
}
```

---

## 4. 権限一覧

### 4.1 権限定義

| 権限 | 説明 |
|------|------|
| `stocks:read` | 株価データ・チャート・保有株式・アラートの閲覧 |
| `stocks:write-own` | 自分の保有株式・ウォッチリスト・アラートの作成・更新・削除 |
| `stocks:manage-data` | マスタデータ（取引所・ティッカー）の管理 |

### 4.2 ロールと権限のマッピング

| ロールID | ロール名 | 権限 |
|---------|---------|------|
| `stock-viewer` | Stock 閲覧者 | `stocks:read` |
| `stock-user` | Stock ユーザー | `stocks:read`, `stocks:write-own` |
| `stock-admin` | Stock 管理者 | `stocks:read`, `stocks:write-own`, `stocks:manage-data` |

---

## 5. バージョニング

### 5.1 バージョン管理方針

- **Phase 1**: バージョニングなし（v1として扱う）
- **Phase 2以降**: 必要に応じてURLパスでバージョン指定（`/api/v2/...`）

### 5.2 後方互換性

- 既存フィールドの削除は行わない
- 新規フィールド追加時は省略可能にする
- 破壊的変更時は新バージョンとして提供

---

## 6. その他

### 6.1 ページネーション

リスト系エンドポイントでは以下のクエリパラメータでページネーションをサポートします。

| パラメータ | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| limit | number | 50 | 取得件数（最大100） |
| lastKey | string | - | 前回レスポンスの `pagination.lastKey` |

**レスポンス例**:

```json
{
    "items": [...],
    "pagination": {
        "count": 10,
        "lastKey": "base64encoded..."
    }
}
```

### 7.2 タイムフレーム仕様

チャートデータAPIで使用可能なタイムフレーム値：

| 値 | 説明 | 備考 |
|----|------|------|
| `1` | 1分足 | |
| `3` | 3分足 | |
| `5` | 5分足 | |
| `15` | 15分足 | |
| `30` | 30分足 | |
| `60` | 1時間足 | デフォルト |
| `120` | 2時間足 | |
| `240` | 4時間足 | |
| `D` | 日足 | |
| `W` | 週足 | |
| `M` | 月足 | |

**Note**: TradingView API の仕様に準拠しています。

### 7.3 Phase 1 スコープ

以下の機能はPhase 1（MVP）の範囲です：

**実装する機能**:
- 基本的なCRUD操作（全エンティティ）
- チャート表示: 4つの時間枠（`1`, `5`, `60`, `D`）
- アラート条件: 1条件のみ、演算子は `gte`, `lte` の2つ
- アラート通知: 条件達成時、毎回継続通知（Frequency間隔）
- アラート有効/無効: `enabled` フィールドによる制御
- MINUTE_LEVEL / HOURLY_LEVEL の2段階頻度
- Web Push 通知: 1ユーザー1デバイスのみ
- 取引時間外の通知抑制: 時間帯 + 曜日チェック
- 目標価格の自動算出: Holding の AveragePrice × 1.2（固定）

**Phase 2以降で検討**:
- 追加の時間枠（`3`, `15`, `30`, `120`, `240`, `W`, `M`）
- 複雑な条件（AND/OR組み合わせ、複数条件）
- 完全一致演算子（`eq`）
- 複数デバイス対応（Alert と Subscription の分離）
- 祝日対応
- テクニカル指標ベースのアラート
- ポートフォリオ分析
- CSV インポート/エクスポート

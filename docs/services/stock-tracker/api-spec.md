# Stock Tracker API 仕様書

## 1. API 概要

### 1.1 ベース URL

| 環境 | URL |
|------|-----|
| 開発 | `https://dev-stock-tracker.nagiyu.com` |
| 本番 | `https://stock-tracker.nagiyu.com` |

### 1.2 認証方式

**JWT トークン (Cookie)**:
- **Cookie 名**: `__Secure-next-auth.session-token`
- **形式**: 暗号化された JWT
- **有効期限**: 30日
- **スコープ**: `.nagiyu.com` (全サブドメインで共有)
- **認証基盤**: Auth サービスによる共通認証（NextAuth.js）

### 1.3 共通レスポンス形式

**成功レスポンス**: シンプルな JSON 形式（Phase 1 MVP）

```json
{
    "holdingId": "holding_abc123",
    "tickerId": "NSDQ:NVDA",
    "quantity": 100
}
```

**エラーレスポンス**:

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
| GET | `/api/exchanges/{id}` | 取引所取得 | 必須 | `stocks:read` |
| POST | `/api/exchanges` | 取引所作成 | 必須 | `stocks:manage-data` |
| PUT | `/api/exchanges/{id}` | 取引所更新 | 必須 | `stocks:manage-data` |
| DELETE | `/api/exchanges/{id}` | 取引所削除 | 必須 | `stocks:manage-data` |
| GET | `/api/tickers` | ティッカー一覧 | 必須 | `stocks:read` |
| GET | `/api/tickers/{id}` | ティッカー取得 | 必須 | `stocks:read` |
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
| POST | `/api/push/refresh` | Web Push 更新 | 必須 | `stocks:write-own` |
| GET | `/api/push/vapid-public-key` | VAPID公開鍵取得 | 不要 | - |

---

## 3. データモデル

### 3.1 取引所 (Exchange)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `exchangeId` | string | ○ | 取引所ID |
| `name` | string | ○ | 取引所名（例: NASDAQ） |
| `key` | string | ○ | 取引所識別キー（例: NSDQ） |
| `country` | string | ○ | 国コード（ISO 3166-1 alpha-2） |
| `timezone` | string | ○ | タイムゾーン（IANA形式） |
| `tradingHours` | object | ○ | 取引時間情報 |

### 3.2 ティッカー (Ticker)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `tickerId` | string | ○ | ティッカーID（形式: `{exchangeKey}:{symbol}`） |
| `symbol` | string | ○ | ティッカーシンボル（例: NVDA） |
| `name` | string | ○ | 企業名 |
| `exchangeId` | string | ○ | 取引所ID |
| `currency` | string | ○ | 通貨コード（ISO 4217） |

### 3.3 保有株式 (Holding)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `holdingId` | string | ○ | 保有株式ID |
| `tickerId` | string | ○ | ティッカーID |
| `quantity` | number | ○ | 保有数量 |
| `averagePrice` | number | ○ | 平均取得単価 |
| `userId` | string | ○ | ユーザーID |

### 3.4 ウォッチリスト (Watchlist)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `watchlistId` | string | ○ | ウォッチリストID |
| `tickerId` | string | ○ | ティッカーID |
| `userId` | string | ○ | ユーザーID |
| `addedAt` | string | ○ | 登録日時（ISO 8601） |

### 3.5 アラート (Alert)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `alertId` | string | ○ | アラートID |
| `tickerId` | string | ○ | ティッカーID |
| `userId` | string | ○ | ユーザーID |
| `condition` | object | ○ | 条件設定 |
| `condition.type` | string | ○ | 条件タイプ（`PRICE_ABOVE`, `PRICE_BELOW`） |
| `condition.threshold` | number | ○ | 閾値 |
| `isActive` | boolean | ○ | 有効/無効 |
| `lastTriggeredAt` | string | - | 最終通知日時 |

### 3.6 チャートデータ (ChartData)

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `timestamp` | number | ○ | タイムスタンプ（Unix秒） |
| `open` | number | ○ | 始値 |
| `high` | number | ○ | 高値 |
| `low` | number | ○ | 安値 |
| `close` | number | ○ | 終値 |
| `volume` | number | ○ | 出来高 |

---

## 4. 権限一覧

| 権限スコープ | 説明 | 適用エンドポイント |
|------------|------|------------------|
| `stocks:read` | 株価データ・マスタデータの閲覧 | GET /api/exchanges, /api/tickers, /api/holdings, /api/watchlist, /api/alerts, /api/chart |
| `stocks:write-own` | 自身のデータの作成・更新・削除 | POST/PUT/DELETE /api/holdings, /api/watchlist, /api/alerts, /api/push/* |
| `stocks:manage-data` | マスタデータの管理（取引所・ティッカー） | POST/PUT/DELETE /api/exchanges, /api/tickers |

**注**: 全ユーザーに `stocks:read` と `stocks:write-own` が付与されます。`stocks:manage-data` は管理者のみです。

---

## 5. ページネーション

一覧取得系エンドポイント（exchanges, tickers, holdings, watchlist, alerts）でページネーションをサポートします。

**クエリパラメータ**:
- `page`: ページ番号（デフォルト: 1）
- `limit`: 1ページあたりの件数（デフォルト: 20、最大: 100）

**レスポンス例**:

```json
{
    "data": [...],
    "pagination": {
        "page": 1,
        "limit": 20,
        "total": 45,
        "totalPages": 3
    }
}
```

---

## 6. バージョニング

Phase 1（MVP）では、URLパス `/api/v1` などのバージョン接頭辞は使用しません。将来的な破壊的変更時にバージョニング戦略を導入します。

---

## 7. 仕様の詳細

### 7.1 チャートデータ取得

`GET /api/chart/{tickerId}` は、クエリパラメータで期間とタイムフレームを指定します。

**クエリパラメータ**:
- `timeframe`: タイムフレーム（`1m`, `5m`, `15m`, `1h`, `4h`, `1d`）
- `from`: 開始日時（Unix秒）
- `to`: 終了日時（Unix秒）

### 7.2 Phase 1 スコープ

Phase 1（MVP）では以下の機能に限定します:
- 取引所・ティッカーマスタの基本 CRUD
- 保有株式・ウォッチリストの基本 CRUD
- 価格ベースのシンプルなアラート（`PRICE_ABOVE`, `PRICE_BELOW`）
- リアルタイムチャート表示（TradingView連携）
- Web Push 通知

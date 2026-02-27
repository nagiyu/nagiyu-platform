# データモデル: Stock Tracker 日次サマリー表示

**ブランチ**: `001-stock-daily-summary` | **日付**: 2026-02-27
**対応する調査**: [research.md](./research.md)

---

## 1. エンティティ定義

### 1.1 DailySummary（日次サマリー）

特定ティッカーの特定日における OHLCV（始値・高値・安値・終値・出来高）の日次集計データ。

#### フィールド定義

| フィールド | 型 | 必須 | 説明 | バリデーションルール |
|-----------|-----|------|------|-------------------|
| `TickerID` | `string` | ✓ | ティッカーID（例: `NSDQ:AAPL`） | 有効なティッカーID。`{Exchange.Key}:{Symbol}` 形式 |
| `ExchangeID` | `string` | ✓ | 取引所ID（例: `NASDAQ`） | 有効な取引所IDで既存 Exchange に対応 |
| `Date` | `string` | ✓ | 取引日（`YYYY-MM-DD` 形式, UTC基準） | ISO 8601 日付形式（例: `2024-01-15`） |
| `Open` | `number` | ✓ | 始値 | `> 0`、正の数値 |
| `High` | `number` | ✓ | 高値 | `>= Open`、`>= Low` |
| `Low` | `number` | ✓ | 安値 | `<= High`、`> 0` |
| `Close` | `number` | ✓ | 終値 | `> 0`、正の数値 |
| `CreatedAt` | `number` | ✓ | 作成日時（Unix timestamp ms） | 変更不可 |
| `UpdatedAt` | `number` | ✓ | 更新日時（Unix timestamp ms） | 更新時に自動更新 |

#### TypeScript 型定義（`core/src/types.ts` に追加）

```typescript
/**
 * 日次サマリー (DailySummary)
 *
 * バリデーションルール:
 * - TickerID: 有効なティッカーID（{Exchange.Key}:{Symbol} 形式）、変更不可
 * - ExchangeID: 有効な取引所ID、変更不可
 * - Date: YYYY-MM-DD 形式（UTC基準）、変更不可
 * - Open: > 0
 * - High: > 0
 * - Low: > 0
 * - Close: > 0
 * - CreatedAt: Unix timestamp ms、作成後変更不可
 * - UpdatedAt: Unix timestamp ms、更新時に自動更新
 *
 * データ整合性:
 * - 同一 TickerID + Date の組み合わせは 1 件のみ（上書き更新で冪等性を保証）
 * - ExchangeID は対応する Ticker.ExchangeID と一致すること
 */
export type DailySummary = {
  /** ティッカーID (PK: SUMMARY#{TickerID}) */
  TickerID: string;
  /** 取引所ID */
  ExchangeID: string;
  /** 取引日 (YYYY-MM-DD 形式, UTC基準) */
  Date: string;
  /** 始値 */
  Open: number;
  /** 高値 */
  High: number;
  /** 安値 */
  Low: number;
  /** 終値 */
  Close: number;
  /** 作成日時 (Unix timestamp ms) */
  CreatedAt: number;
  /** 更新日時 (Unix timestamp ms) */
  UpdatedAt: number;
};
```

#### エンティティ型（`core/src/entities/daily-summary.entity.ts`）

```typescript
export interface DailySummaryEntity {
  TickerID: string;
  ExchangeID: string;
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  CreatedAt: number;
  UpdatedAt: number;
}

export type CreateDailySummaryInput = Omit<DailySummaryEntity, 'CreatedAt' | 'UpdatedAt'>;

export interface DailySummaryKey {
  tickerId: string;
  date: string;
}
```

---

## 2. DynamoDB テーブル設計

### 2.1 テーブル: `nagiyu-stock-tracker-main-{env}`（既存テーブルに追加）

#### DailySummary アイテムのキー設計

```
PK:     SUMMARY#{TickerID}             例: SUMMARY#NSDQ:AAPL
SK:     DATE#{Date}                    例: DATE#2024-01-15
Type:   DailySummary
GSI4PK: {ExchangeID}                   例: NASDAQ
GSI4SK: DATE#{Date}#{TickerID}         例: DATE#2024-01-15#NSDQ:AAPL
```

#### 全フィールドのアイテム例

```json
{
  "PK":       "SUMMARY#NSDQ:AAPL",
  "SK":       "DATE#2024-01-15",
  "Type":     "DailySummary",
  "GSI4PK":  "NASDAQ",
  "GSI4SK":  "DATE#2024-01-15#NSDQ:AAPL",
  "TickerID":   "NSDQ:AAPL",
  "ExchangeID": "NASDAQ",
  "Date":       "2024-01-15",
  "Open":     182.15,
  "High":     183.92,
  "Low":      181.44,
  "Close":    183.31,
  "CreatedAt": 1705276800000,
  "UpdatedAt": 1705276800000
}
```

### 2.2 既存 GSI 一覧と新規 GSI

| GSI 名 | PK | SK | 用途 |
|--------|----|----|------|
| UserIndex | `GSI1PK` | `GSI1SK` | ユーザーごとデータ取得（既存） |
| AlertIndex | `GSI2PK` | `GSI2SK` | アラート頻度別取得（既存） |
| ExchangeTickerIndex | `GSI3PK` | `GSI3SK` | 取引所別ティッカー一覧（既存） |
| **ExchangeSummaryIndex** | **`GSI4PK`** | **`GSI4SK`** | **取引所別サマリー取得（新規）** |

### 2.3 アクセスパターン

| アクセスパターン | 操作 | キー |
|---------------|------|------|
| TickerID + Date でサマリーを取得（Upsert 時） | GetItem / PutItem | `PK = SUMMARY#{TickerID}`, `SK = DATE#{Date}` |
| 取引所ごとのサマリー一覧を取得（Web API） | Query (GSI4) | `GSI4PK = {ExchangeID}`, sort by `GSI4SK` desc |
| 取引所の特定日サマリーを取得 | Query (GSI4) | `GSI4PK = {ExchangeID}`, `GSI4SK begins_with DATE#{Date}` |

### 2.4 `DynamoDBItem` 型の更新（`core/src/types.ts`）

既存の `DynamoDBItem` に `'DailySummary'` を Type として追加する:

```typescript
export type DynamoDBItem = {
  PK: string;
  SK: string;
  Type: 'Exchange' | 'Ticker' | 'Holding' | 'Watchlist' | 'Alert' | 'DailySummary'; // 追加
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  GSI3PK?: string;
  GSI3SK?: string;
  GSI4PK?: string;  // 追加: ExchangeSummaryIndex PK
  GSI4SK?: string;  // 追加: ExchangeSummaryIndex SK
};
```

---

## 3. エンティティ関連図

```
Exchange ──── Ticker
  │              │
  │              │ ExchangeID
  │              ↓
  └──────── DailySummary ← (batch による生成)
              TickerID + Date が複合キー
              ExchangeID で取引所に紐づく
```

**関係性**:
- `DailySummary.ExchangeID` → `Exchange.ExchangeID`（多対一）
- `DailySummary.TickerID` → `Ticker.TickerID`（多対一）
- 同一 `TickerID` + `Date` のサマリーは1件のみ（一意制約: PK+SK で担保）

---

## 4. リポジトリインターフェース

```typescript
// core/src/repositories/daily-summary.repository.interface.ts

import type { DailySummaryEntity, CreateDailySummaryInput } from '../entities/daily-summary.entity.js';
import type { PaginatedResult } from '@nagiyu/aws';

export interface DailySummaryRepository {
  /**
   * TickerID と Date でサマリーを取得
   */
  getByTickerAndDate(tickerId: string, date: string): Promise<DailySummaryEntity | null>;

  /**
   * 取引所IDで最新サマリーを取得（GSI4 使用）
   * @param exchangeId - 取引所ID
   * @param date - 対象日（YYYY-MM-DD）。省略時は最新データを取得
   */
  getByExchange(
    exchangeId: string,
    date?: string
  ): Promise<PaginatedResult<DailySummaryEntity>>;

  /**
   * サマリーを保存（既存の場合は上書き: Upsert）
   */
  upsert(input: CreateDailySummaryInput): Promise<DailySummaryEntity>;
}
```

---

## 5. 状態遷移

DailySummary は比較的シンプルな状態遷移を持つ:

```
[未存在]
   │
   │ バッチ実行（取引時間終了後）
   ↓
[保存済み] ←──── バッチ再実行（Upsert 上書き）
```

- **新規作成**: バッチが `getChartData('D', {count:1})` を呼び出し、取得した OHLCV で Upsert
- **上書き更新**: 同一 TickerID + Date のバッチ再実行時に UpdatedAt が更新される
- **削除**: 本機能では定義しない（将来の cleanup バッチで対応）

---

## 6. バリデーションルール（実装時参照）

`core/src/validation/` に追加するバリデーション関数の仕様:

```typescript
// validateDailySummary(summary: DailySummary): ValidationResult

// 必須チェック
- TickerID: 非空文字列、'{Key}:{Symbol}' 形式
- ExchangeID: 非空文字列
- Date: 'YYYY-MM-DD' 形式（正規表現: /^\d{4}-\d{2}-\d{2}$/）
- Open, High, Low, Close: 正の数値（> 0）

// 整合性チェック（SHOULD）
- High >= Open, High >= Low, High >= Close
- Low <= Open, Low <= High, Low <= Close
```

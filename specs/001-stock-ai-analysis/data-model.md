# データモデル: Stock Tracker AI 解析機能

**ブランチ**: `001-stock-ai-analysis` | **日付**: 2026-03-03

---

## 変更エンティティ一覧

| エンティティ | 変更種別 | 説明 |
|-------------|---------|------|
| `DailySummaryEntity` | 既存拡張 | `AiAnalysis?: string` / `AiAnalysisError?: string` フィールドを追加 |
| `CreateDailySummaryInput` | 自動継承 | `DailySummaryEntity` の Omit 型のため自動的に含まれる |
| `DailySummaryMapper` | 既存更新 | `AiAnalysis` / `AiAnalysisError` フィールドの DynamoDB ↔ Entity 変換を追加 |
| `TickerSummaryResponse` (web API) | 既存拡張 | `aiAnalysis?: string` / `aiAnalysisError?: string` フィールドを追加 |
| `TickerSummary` (web UI 型) | 既存拡張 | `aiAnalysis?: string` / `aiAnalysisError?: string` フィールドを追加 |

---

## 1. DailySummaryEntity（拡張）

**ファイル**: `services/stock-tracker/core/src/entities/daily-summary.entity.ts`

```typescript
export interface DailySummaryEntity {
  TickerID: string;
  ExchangeID: string;
  Date: string;          // YYYY-MM-DD 形式
  Open: number;
  High: number;
  Low: number;
  Close: number;
  PatternResults?: PatternResults;    // 既存（任意）
  BuyPatternCount?: number;           // 既存（任意）
  SellPatternCount?: number;          // 既存（任意）
  AiAnalysis?: string;                // ★ 新規追加（任意）: AI 解析テキスト（日本語）
  AiAnalysisError?: string;           // ★ 新規追加（任意）: AI 解析生成失敗時のエラー情報
  CreatedAt: number;     // Unix timestamp ms
  UpdatedAt: number;     // Unix timestamp ms
}

export type CreateDailySummaryInput = Omit<DailySummaryEntity, 'CreatedAt' | 'UpdatedAt'>;
// → AiAnalysis / AiAnalysisError が自動的に含まれる（変更不要）
```

### バリデーションルール

| フィールド | ルール |
|-----------|--------|
| `AiAnalysis` | 任意（`undefined` 可）。型は `string`。文字列の場合は空文字不可（最大 2000 文字）。`AiAnalysisError` と同時に存在しない |
| `AiAnalysisError` | 任意（`undefined` 可）。型は `string`。AI 解析生成失敗時のエラー情報。空文字不可。`AiAnalysis` と同時に存在しない |

### 状態遷移

```
[初回バッチ実行]
  → AiAnalysis = undefined、AiAnalysisError = undefined（フィールド不在 = 未生成のデフォルト状態）
  ※ UpdatedAt タイムスタンプで最終バッチ実行日時を補足検知可能

[AI 解析生成成功]
  → AiAnalysis = "解析テキスト..."、AiAnalysisError = undefined（クリア）

[AI 解析生成失敗]
  → AiAnalysis = undefined（クリア）、AiAnalysisError = "エラー情報..."（ログ記録）

[次回バッチ実行 - 再生成条件]
  → AiAnalysis が undefined の場合のみ再生成を試みる（AiAnalysisError の有無に関わらず）
```

---

## 2. DynamoDB Single Table 設計（変更なし）

**テーブル**: 既存テーブル（環境変数 `DYNAMODB_TABLE_NAME`）

### DailySummary アイテム（変更後）

| 属性名 | 型 | 変更 | 説明 |
|-------|----|------|------|
| `PK` | String | 変更なし | `SUMMARY#{TickerID}` |
| `SK` | String | 変更なし | `DATE#{Date}` |
| `Type` | String | 変更なし | `"DailySummary"` |
| `GSI4PK` | String | 変更なし | `{ExchangeID}` |
| `GSI4SK` | String | 変更なし | `DATE#{Date}#{TickerID}` |
| `TickerID` | String | 変更なし | ティッカーID |
| `ExchangeID` | String | 変更なし | 取引所ID |
| `Date` | String | 変更なし | YYYY-MM-DD |
| `Open` | Number | 変更なし | 始値 |
| `High` | Number | 変更なし | 高値 |
| `Low` | Number | 変更なし | 安値 |
| `Close` | Number | 変更なし | 終値 |
| `PatternResults` | Map | 変更なし | パターン判定結果マップ（任意） |
| `BuyPatternCount` | Number | 変更なし | 買いシグナル合致数（任意） |
| `SellPatternCount` | Number | 変更なし | 売りシグナル合致数（任意） |
| `AiAnalysis` | String | **★ 新規追加** | AI 解析テキスト（日本語、任意）。生成成功時のみ保存 |
| `AiAnalysisError` | String | **★ 新規追加** | AI 解析生成失敗時のエラー情報（任意）。生成失敗時のみ保存 |
| `CreatedAt` | Number | 変更なし | Unix timestamp ms |
| `UpdatedAt` | Number | 変更なし | Unix timestamp ms |

---

## 3. DailySummaryMapper（更新）

**ファイル**: `services/stock-tracker/core/src/mappers/daily-summary.mapper.ts`

### `toItem()` への追加

```typescript
// 既存フィールドの後に追加
...(entity.AiAnalysis !== undefined ? { AiAnalysis: entity.AiAnalysis } : {}),
...(entity.AiAnalysisError !== undefined ? { AiAnalysisError: entity.AiAnalysisError } : {}),
```

### `toEntity()` への追加

```typescript
// 既存フィールドの後に追加
AiAnalysis: item.AiAnalysis !== undefined
  ? validateStringField(item.AiAnalysis, 'AiAnalysis')
  : undefined,
AiAnalysisError: item.AiAnalysisError !== undefined
  ? validateStringField(item.AiAnalysisError, 'AiAnalysisError')
  : undefined,
```

### `toTickerSummaryResponse()` への追加

```typescript
export interface DailySummaryPatternResponse {
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetailResponse[];
  aiAnalysis?: string;       // ★ 新規追加（生成成功時のみ）
  aiAnalysisError?: string;  // ★ 新規追加（生成失敗時のみ）
}

// メソッド内で:
return {
  buyPatternCount: ...,
  sellPatternCount: ...,
  patternDetails: [...],
  aiAnalysis: entity.AiAnalysis,         // ★ 新規追加
  aiAnalysisError: entity.AiAnalysisError,  // ★ 新規追加
};
```

---

## 4. Web 型定義の更新

### TickerSummaryResponse（web API）

**ファイル**: `services/stock-tracker/web/app/api/summaries/route.ts`

```typescript
interface TickerSummaryResponse {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  updatedAt: string;
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetailResponse[];
  aiAnalysis?: string;       // ★ 新規追加（生成成功時のみ）
  aiAnalysisError?: string;  // ★ 新規追加（生成失敗時のみ）
}
```

### TickerSummary（web UI 型）

**ファイル**: `services/stock-tracker/web/types/stock.ts`

```typescript
export interface TickerSummary {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  updatedAt: string;
  buyPatternCount: number;
  sellPatternCount: number;
  patternDetails: PatternDetail[];
  aiAnalysis?: string;       // ★ 新規追加（生成成功時のみ）
  aiAnalysisError?: string;  // ★ 新規追加（生成失敗時のみ）
}
```

---

## 5. バッチ処理の新規モジュール

### openai-client.ts

**ファイル**: `services/stock-tracker/batch/src/lib/openai-client.ts`

```typescript
export interface AiAnalysisInput {
  tickerId: string;
  name: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  buyPatternCount: number;
  sellPatternCount: number;
  patternSummary: string;  // パターン名リスト（日本語）
}

export async function generateAiAnalysis(
  apiKey: string,
  input: AiAnalysisInput
): Promise<string>
```

---

## 6. 既存コードとの互換性

| 既存コード | 影響 | 対応 |
|-----------|------|------|
| `DynamoDBDailySummaryRepository.upsert()` | `AiAnalysis` が `undefined` なら DynamoDB に書き込まれない（`removeUndefinedValues: true`） | **対応不要**（既存の marshallOptions が処理） |
| `PatternAnalyzer.analyze()` | 変更なし | **対応不要** |
| `summary.ts` の `upsert()` 呼び出し | `AiAnalysis` フィールドなしで呼び出す既存コードはそのまま動作 | **対応不要** |
| `/api/summaries` ルート | `aiAnalysis` フィールドが追加されるが、既存クライアントは unknown フィールドを無視 | **対応不要** |

---

## 7. 環境変数の追加

| 環境変数名 | 説明 | 必須 |
|-----------|------|------|
| `OPENAI_API_KEY` | OpenAI API キー（Secrets Manager から CDK デプロイ時に注入） | バッチ側で必須 |
| `AWS_REGION` | 既存（未設定時は `us-east-1`） | 推奨 |

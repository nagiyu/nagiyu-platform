# データモデル: Stock Tracker サマリー日足パターン分析

**ブランチ**: `001-summary-pattern-analysis` | **フェーズ**: Phase 1 設計出力

---

## 1. 型定義（`core/src/types.ts` への追加）

### PatternStatus（判定状態）

```typescript
/**
 * パターン判定状態
 *
 * - MATCHED: パターンが成立
 * - NOT_MATCHED: パターンが不成立
 * - INSUFFICIENT_DATA: データ不足により判定不能（50日未満の日足しか取得できない場合など）
 */
export type PatternStatus = 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';
```

### PatternSignalType（売買区分）

```typescript
/**
 * パターンの売買区分
 */
export type PatternSignalType = 'BUY' | 'SELL';
```

### PatternDefinition（パターン定義）

```typescript
/**
 * パターン定義
 *
 * システム固定値として管理され、ユーザーによる変更は不可（FR-003）
 *
 * バリデーションルール:
 * - patternId: 英小文字・数字・ハイフンのみ（例: "morning-star"）
 * - name: 日本語パターン名（例: "三川明けの明星"）
 * - description: パターンの説明文（ツールチップ表示用）
 * - signalType: 'BUY' または 'SELL'
 */
export type PatternDefinition = {
  /** パターンID（システム内部識別子） */
  patternId: string;
  /** パターン名（日本語） */
  name: string;
  /** パターン説明文（ツールチップ表示用） */
  description: string;
  /** 売買区分 */
  signalType: PatternSignalType;
};
```

### PatternResults（パターン結果マップ）

```typescript
/**
 * ティッカー単位のパターン判定結果マップ
 *
 * キー: PatternDefinition.patternId
 * 値: PatternStatus
 *
 * 例: { "morning-star": "MATCHED", "evening-star": "NOT_MATCHED" }
 */
export type PatternResults = Record<string, PatternStatus>;
```

---

## 2. エンティティ変更（`core/src/entities/daily-summary.entity.ts` の拡張）

### DailySummaryEntity（拡張後）

既存フィールドを維持し、パターン分析結果フィールドを **オプション** で追加する（後方互換性確保）。

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `TickerID` | `string` | ✓ | ティッカーID |
| `ExchangeID` | `string` | ✓ | 取引所ID |
| `Date` | `string` | ✓ | 取引日 (YYYY-MM-DD) |
| `Open` | `number` | ✓ | 始値 |
| `High` | `number` | ✓ | 高値 |
| `Low` | `number` | ✓ | 安値 |
| `Close` | `number` | ✓ | 終値 |
| `PatternResults` | `PatternResults` | - | パターン判定結果マップ |
| `BuyPatternCount` | `number` | - | 買いシグナル合致数（PatternStatus='MATCHED' かつ signalType='BUY' の数） |
| `SellPatternCount` | `number` | - | 売りシグナル合致数（PatternStatus='MATCHED' かつ signalType='SELL' の数） |
| `CreatedAt` | `number` | ✓ | 作成日時 (Unix timestamp ms) |
| `UpdatedAt` | `number` | ✓ | 更新日時 (Unix timestamp ms) |

```typescript
export interface DailySummaryEntity {
  TickerID: string;
  ExchangeID: string;
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  PatternResults?: PatternResults;
  BuyPatternCount?: number;
  SellPatternCount?: number;
  CreatedAt: number;
  UpdatedAt: number;
}
```

**バリデーションルール:**
- `PatternResults` が存在する場合、キーは `patternId` 文字列、値は `PatternStatus` のいずれか。**未知の `patternId` を含むアイテムはマッパーでそのまま保持し、API レスポンス構築時は `PATTERN_REGISTRY` に存在するパターンのみを `patternDetails` に含める（未知キーは無視する）。**
- `BuyPatternCount` / `SellPatternCount` は 0 以上の整数
- 既存アイテム（パターン分析前）は3フィールドが存在しない → UI 側で `?? 0` / `?? []` でデフォルト処理

---

## 3. DynamoDB テーブル設計（シングルテーブル拡張）

### 既存キー構造（変更なし）

```
PK: SUMMARY#{TickerID}
SK: DATE#{date}
Type: DailySummary
GSI4PK: {ExchangeID}
GSI4SK: DATE#{date}#{TickerID}
```

### 追加属性

```
PatternResults: { "morning-star": "MATCHED", "evening-star": "NOT_MATCHED" }
BuyPatternCount: 1
SellPatternCount: 0
```

### DynamoDB アイテム例

```json
{
  "PK": "SUMMARY#NSDQ:AAPL",
  "SK": "DATE#2026-02-28",
  "Type": "DailySummary",
  "GSI4PK": "nasdaq-1",
  "GSI4SK": "DATE#2026-02-28#NSDQ:AAPL",
  "TickerID": "NSDQ:AAPL",
  "ExchangeID": "nasdaq-1",
  "Date": "2026-02-28",
  "Open": 234.50,
  "High": 237.80,
  "Low": 233.10,
  "Close": 236.90,
  "PatternResults": {
    "morning-star": "MATCHED",
    "evening-star": "NOT_MATCHED"
  },
  "BuyPatternCount": 1,
  "SellPatternCount": 0,
  "CreatedAt": 1740700800000,
  "UpdatedAt": 1740700800000
}
```

---

## 4. パターン実装クラス設計

### 抽象基底クラス（`core/src/patterns/candlestick-pattern.ts`）

```typescript
import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';

/**
 * キャンドルスティックパターン 抽象基底クラス
 *
 * すべてのパターン実装はこのクラスを継承する（Issue 要件）
 * - definition: パターン定義（読み取り専用フィールド）
 * - analyze(): パターン判定ロジック（純粋関数）
 */
export abstract class CandlestickPattern {
  /** パターン定義（名称・説明・売買区分） */
  public abstract readonly definition: PatternDefinition;

  /**
   * パターン判定を実行する
   *
   * @param candles - 日足データ配列（新しい順: index 0 が最新）
   * @returns PatternStatus（MATCHED / NOT_MATCHED / INSUFFICIENT_DATA）
   */
  public abstract analyze(candles: ChartDataPoint[]): PatternStatus;
}
```

### 具象クラス一覧

| クラス名 | ファイル | patternId | name | signalType |
|---------|---------|-----------|------|-----------|
| `MorningStar` | `morning-star.ts` | `morning-star` | 三川明けの明星 | `BUY` |
| `EveningStar` | `evening-star.ts` | `evening-star` | 三川宵の明星 | `SELL` |

### パターン判定ロジック（状態遷移）

> **注意**: 50本未満の日足チェック（FR-012）は `batch/src/summary.ts` で `getChartData()` 取得直後に実施する。取得件数が50本未満の場合、batch は `PatternAnalyzer` を呼ばず全パターンを `INSUFFICIENT_DATA` として保存する。各パターンの `analyze()` には50本以上のデータが渡される前提であり、`analyze()` 内の `candles.length < 3` チェックは予期せぬ異常値への安全弁として残す。

#### 三川明けの明星（MorningStar）

```
入力: candles (ChartDataPoint[], 新しい順)

判定フロー:
  candles.length < 3 → INSUFFICIENT_DATA

  c0 = candles[0] (最新)
  c1 = candles[1] (前日)
  c2 = candles[2] (前々日)

  条件1: c2 が陰線 かつ 実体大 (|c2.close - c2.open| > |c2.high - c2.low| * 0.3)
  条件2: c1 が実体小 (|c1.close - c1.open| <= |c1.high - c1.low| * 0.1)
         かつ c1.open < c2.close かつ c1.close < c2.close
         （※ 星が前々日（c2）の大陰線終値より下に位置すること＝ギャップダウンを確認する典型的定義）
  条件3: c0 が陽線 かつ 実体大
         かつ c0.close > (c2.open + c2.close) / 2

  条件1 AND 条件2 AND 条件3 → MATCHED
  それ以外 → NOT_MATCHED
```

#### 三川宵の明星（EveningStar）

```
入力: candles (ChartDataPoint[], 新しい順)

判定フロー:
  candles.length < 3 → INSUFFICIENT_DATA

  c0 = candles[0] (最新)
  c1 = candles[1] (前日)
  c2 = candles[2] (前々日)

  条件1: c2 が陽線 かつ 実体大 (|c2.close - c2.open| > |c2.high - c2.low| * 0.3)
  条件2: c1 が実体小 (|c1.close - c1.open| <= |c1.high - c1.low| * 0.1)
         かつ c1.open > c2.close かつ c1.close > c2.close
         （※ 星が前々日（c2）の大陽線終値より上に位置すること＝ギャップアップを確認する典型的定義）
  条件3: c0 が陰線 かつ 実体大
         かつ c0.close < (c2.open + c2.close) / 2

  条件1 AND 条件2 AND 条件3 → MATCHED
  それ以外 → NOT_MATCHED
```

---

## 5. パターンアナライザ設計（`core/src/patterns/pattern-analyzer.ts`）

```typescript
/**
 * PatternAnalyzer
 *
 * 登録済みパターン全件を一括実行し、DailySummaryEntity 用の結果を返す
 */
export class PatternAnalyzer {
  private readonly patterns: CandlestickPattern[];

  constructor(patterns: CandlestickPattern[]) {
    this.patterns = patterns;
  }

  /**
   * 全パターンを実行し、結果を返す
   *
   * @param candles - 日足データ（新しい順）
   * @returns { patternResults, buyPatternCount, sellPatternCount }
   */
  public analyze(candles: ChartDataPoint[]): {
    patternResults: PatternResults;
    buyPatternCount: number;
    sellPatternCount: number;
  };
}
```

---

## 6. パターンレジストリ（`core/src/patterns/pattern-registry.ts`）

```typescript
/**
 * PATTERN_REGISTRY
 *
 * システム固定パターン定義（FR-003: ユーザー編集不可）
 * 新パターン追加時はここにインスタンスを追加するだけでよい
 */
export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
];
```

---

## 7. フロントエンド型変更（`web/types/stock.ts` への追加）

### PatternDetail（フロントエンド表示用パターン詳細）

```typescript
/**
 * パターン分析詳細（サマリー詳細ダイアログ表示用）
 */
export interface PatternDetail {
  /** パターンID */
  patternId: string;
  /** パターン名（日本語） */
  name: string;
  /** パターン説明文（ツールチップ用） */
  description: string;
  /** 売買区分 */
  signalType: 'BUY' | 'SELL';
  /** 判定状態 */
  status: 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';
}
```

### TickerSummary（拡張後）

```typescript
export interface TickerSummary {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** ISO 8601 UTC形式の更新日時 */
  updatedAt: string;
  /** 買いパターン合致数（デフォルト: 0） */
  buyPatternCount: number;
  /** 売りパターン合致数（デフォルト: 0） */
  sellPatternCount: number;
  /** パターン詳細（詳細ダイアログ表示用。空配列はバッチ未実行を示す） */
  patternDetails: PatternDetail[];
}
```

---

## 8. エラーハンドリング（未知 patternId の扱い）

DynamoDB に保存された `PatternResults` に、現在の `PATTERN_REGISTRY` に存在しない `patternId` キーが含まれる場合（将来パターンが削除・改名された場合など）の処理方針：

| 発生箇所 | 処理内容 |
|---------|---------|
| `DailySummaryMapper.toEntity()` | `PatternResults` をそのまま保持する（マッパーはフィルタリングしない） |
| API レスポンス構築（`toTickerSummaryResponse()`） | `PATTERN_REGISTRY` に存在するパターンのみを `patternDetails` に含める。未知キーは無視する |
| `BuyPatternCount` / `SellPatternCount` 再計算 | DB 保存値をそのまま使用する（バッチ更新時に正しい値が設定されているため） |

この設計により、パターンの追加・削除があっても既存データが破損せず、APIレスポンスは常に現在の `PATTERN_REGISTRY` に基づいた整合性のあるデータを返す。

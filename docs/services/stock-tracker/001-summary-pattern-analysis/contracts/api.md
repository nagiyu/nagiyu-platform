# API コントラクト: Stock Tracker サマリー日足パターン分析

**ブランチ**: `001-summary-pattern-analysis` | **フェーズ**: Phase 1 設計出力

---

## 変更対象エンドポイント

### `GET /api/summaries`

#### 変更概要

`TickerSummaryResponse`（サーバー側）および `TickerSummary`（クライアント型）に以下3フィールドを追加する。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `buyPatternCount` | `number` | 買いシグナル合致数（0以上の整数） |
| `sellPatternCount` | `number` | 売りシグナル合致数（0以上の整数） |
| `patternDetails` | `PatternDetailResponse[]` | パターン詳細一覧（空配列はバッチ未実行を示す） |

#### `PatternDetailResponse` 型

```typescript
interface PatternDetailResponse {
  patternId: string;       // 例: "morning-star"
  name: string;            // 例: "三川明けの明星"
  description: string;     // 説明文（ツールチップ用）
  signalType: 'BUY' | 'SELL';
  status: 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';
}
```

#### 変更後のレスポンス全体スキーマ

```typescript
// GET /api/summaries?date=YYYY-MM-DD (date は省略可)
interface SummariesResponse {
  exchanges: ExchangeSummaryGroupResponse[];
}

interface ExchangeSummaryGroupResponse {
  exchangeId: string;
  exchangeName: string;
  date: string | null;
  summaries: TickerSummaryResponse[];
}

interface TickerSummaryResponse {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  updatedAt: string;           // ISO 8601 UTC（変更なし）
  buyPatternCount: number;     // 【追加】買いシグナル合致数
  sellPatternCount: number;    // 【追加】売りシグナル合致数
  patternDetails: PatternDetailResponse[];  // 【追加】パターン詳細（空配列はバッチ未実行）
}
```

#### レスポンスサンプル

```json
{
  "exchanges": [
    {
      "exchangeId": "nasdaq-1",
      "exchangeName": "NASDAQ",
      "date": "2026-02-28",
      "summaries": [
        {
          "tickerId": "NSDQ:AAPL",
          "symbol": "AAPL",
          "name": "Apple Inc.",
          "open": 234.50,
          "high": 237.80,
          "low": 233.10,
          "close": 236.90,
          "updatedAt": "2026-02-28T15:00:00.000Z",
          "buyPatternCount": 1,
          "sellPatternCount": 0,
          "patternDetails": [
            {
              "patternId": "morning-star",
              "name": "三川明けの明星",
              "description": "3日間の反転パターン。大陰線、小実体（星）、大陽線の組み合わせで、下落トレンドの終わりを示す買いシグナル。",
              "signalType": "BUY",
              "status": "MATCHED"
            },
            {
              "patternId": "evening-star",
              "name": "三川宵の明星",
              "description": "3日間の反転パターン。大陽線、小実体（星）、大陰線の組み合わせで、上昇トレンドの終わりを示す売りシグナル。",
              "signalType": "SELL",
              "status": "NOT_MATCHED"
            }
          ]
        },
        {
          "tickerId": "NSDQ:NVDA",
          "symbol": "NVDA",
          "name": "NVIDIA Corporation",
          "open": 890.00,
          "high": 910.00,
          "low": 880.00,
          "close": 905.00,
          "updatedAt": "2026-02-28T15:00:00.000Z",
          "buyPatternCount": 0,
          "sellPatternCount": 0,
          "patternDetails": [
            {
              "patternId": "morning-star",
              "name": "三川明けの明星",
              "description": "...",
              "signalType": "BUY",
              "status": "INSUFFICIENT_DATA"
            },
            {
              "patternId": "evening-star",
              "name": "三川宵の明星",
              "description": "...",
              "signalType": "SELL",
              "status": "INSUFFICIENT_DATA"
            }
          ]
        }
      ]
    }
  ]
}
```

#### 後方互換性に関する注意

- パターン分析が未実行のティッカー（バッチ更新前のデータ）については、`DailySummaryEntity` に `PatternResults` が存在しない
- この場合、API サーバー側で以下のデフォルト値を返す:
  - `buyPatternCount: 0`
  - `sellPatternCount: 0`
  - `patternDetails: []`（空配列）
- パターン分析が実行済みだがすべて NOT_MATCHED / INSUFFICIENT_DATA の場合:
  - `buyPatternCount: 0`
  - `sellPatternCount: 0`
  - `patternDetails: [...]`（各パターンのステータスを含む配列）

クライアントは `patternDetails.length > 0` で「分析済み」を判断し、空配列の場合はバッチ未実行として扱う。既存の `updatedAt` フィールドでバッチ最終実行日時を確認できる。

---

## 変更なしエンドポイント

以下のエンドポイントは本機能の実装範囲外であり、変更しない。

| エンドポイント | 理由 |
|--------------|------|
| `POST /api/summaries/refresh` | サマリーバッチを Lambda 経由で起動するだけで変更なし |
| `GET /api/chart/[tickerId]` | チャート表示機能は本機能スコープ外 |
| その他全エンドポイント | 本機能と無関係 |

---

## フロントエンドクライアント型（`web/types/stock.ts`）

```typescript
// PatternDetail（新規追加）
export interface PatternDetail {
  patternId: string;
  name: string;
  description: string;
  signalType: 'BUY' | 'SELL';
  status: 'MATCHED' | 'NOT_MATCHED' | 'INSUFFICIENT_DATA';
}

// TickerSummary（拡張）
export interface TickerSummary {
  tickerId: string;
  symbol: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  updatedAt: string;
  buyPatternCount: number;          // 【追加】
  sellPatternCount: number;         // 【追加】
  patternDetails: PatternDetail[];  // 【追加】空配列はバッチ未実行を示す
}
```

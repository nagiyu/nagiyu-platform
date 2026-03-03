# バッチ処理 AI 解析インターフェース契約

**バージョン**: 1.0.0  
**日付**: 2026-03-03  
**説明**: `summary.ts` バッチ Lambda Handler が呼び出す AI 解析サービスのインターフェース

---

## モジュール: `batch/src/lib/openai-client.ts`

### 型定義

```typescript
/**
 * AI 解析生成の入力データ
 */
export interface AiAnalysisInput {
  /** ティッカーID（例: NSDQ:AAPL） */
  tickerId: string;
  /** 銘柄名（例: Apple Inc.） */
  name: string;
  /** 解析対象日（YYYY-MM-DD） */
  date: string;
  /** 始値 */
  open: number;
  /** 高値 */
  high: number;
  /** 安値 */
  low: number;
  /** 終値 */
  close: number;
  /** 買いシグナル合致数 */
  buyPatternCount: number;
  /** 売りシグナル合致数 */
  sellPatternCount: number;
  /** 合致パターン名リスト（日本語、カンマ区切り）。空文字は「なし」 */
  patternSummary: string;
}

/**
 * AI 解析テキストを生成する
 *
 * @param apiKey - OpenAI API キー
 * @param input - 解析対象のサマリーデータ
 * @returns 日本語の解析テキスト
 * @throws {Error} OpenAI API 呼び出し失敗時
 */
export async function generateAiAnalysis(
  apiKey: string,
  input: AiAnalysisInput
): Promise<string>;
```

### ビヘイビア仕様

| 条件 | 動作 |
|------|------|
| 正常 | 日本語の解析テキスト文字列を返す |
| API エラー | `Error` をスロー（呼び出し元でキャッチ） |
| タイムアウト | `Error` をスロー（呼び出し元でキャッチ） |
| Web 検索失敗 | OpenAI が自動フォールバック（検索なしで応答）、正常にテキストを返す |

---

## バッチ HandlerDependencies 拡張

```typescript
interface HandlerDependencies {
  // 既存フィールド
  exchangeRepository: ExchangeRepository;
  tickerRepository: TickerRepository;
  dailySummaryRepository: DailySummaryRepository;
  isTradingHoursFn: typeof isTradingHours;
  getChartDataFn: typeof getChartData;
  nowFn: () => number;

  // 新規追加
  /** AI 解析テキスト生成関数（テスト時にモック可能） */
  generateAiAnalysisFn?: (apiKey: string, input: AiAnalysisInput) => Promise<string>;
}
```

### BatchStatistics 拡張

```typescript
interface BatchStatistics {
  // 既存フィールド
  totalExchanges: number;
  processedExchanges: number;
  skippedTradingExchanges: number;
  totalTickers: number;
  processedTickers: number;
  summariesSaved: number;
  errors: number;

  // 新規追加
  /** AI 解析生成成功件数 */
  aiAnalysisGenerated: number;
  /** AI 解析生成スキップ件数（エラーまたは API キー未取得） */
  aiAnalysisSkipped: number;
}
```

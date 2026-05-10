# Stock Tracer 予測精度の自動採点・可視化基盤 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/stock-tracker/architecture.md に ADR として抽出し、
    tasks/stock-tracer-prediction-evaluation/ ディレクトリごと削除します。

    関連 Issue: #3018
    入口ドキュメント: tasks/stock-tracer-prediction-evaluation/README.md
    入力: tasks/stock-tracer-prediction-evaluation/requirements.md
    次に作成: tasks/stock-tracer-prediction-evaluation/tasks.md
-->

---

## 1. API 仕様

### 1.1 ベース URL・認証

- ベース URL: 既存 stock-tracker web の API Routes（`/api/...`）
- 認証方式: 既存 web 認証（NextAuth ベース）に準拠。認証済みユーザーのみアクセス可

### 1.2 エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | `/api/prediction-evaluation/summary` | 期間指定で集計値（KPI + 推移 + シグナル別 + 取引所別）を返す | 要 |
| GET | `/api/prediction-evaluation/tickers` | 期間指定で銘柄別ヒット率一覧を返す | 要 |

エンドポイントを 2 つに分けるのは、「ダッシュボード上部の即時表示」と「銘柄テーブルの後追い表示」を別々に取得してファーストビューを高速化するため。

### 1.3 エンドポイント詳細

#### GET `/api/prediction-evaluation/summary`

**リクエスト**

```typescript
type Query = {
  period: '7d' | '30d' | '90d' | 'all'; // 必須
};
```

**レスポンス（成功）**

```typescript
type SummaryResponse = {
  period: '7d' | '30d' | '90d' | 'all';
  evaluatedAt: number; // 集計時刻（unix timestamp ms）
  kpi: {
    totalAccuracy: number | null; // 総合精度（%）。判定済み 0 件なら null
    directionalAccuracy: number | null; // 方向精度（%、BULLISH+BEARISH のみ）
    neutralRatio: number | null; // NEUTRAL 比率（%）
    judgedCount: number; // 判定済み件数
    aiFailureCount: number; // 採点対象外（AiAnalysisError あり）件数
  };
  dailyTrend: Array<{
    date: string; // YYYY-MM-DD
    directionalAccuracy: number | null;
    judgedCount: number;
  }>;
  bySignal: Array<{
    signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
    accuracy: number | null;
    count: number;
  }>;
  byExchange: Array<{
    exchangeId: string;
    exchangeName: string;
    accuracy: number | null;
    count: number;
  }>;
};
```

**エラーレスポンス**

| ステータス | エラーコード | 説明 |
|-----------|-------------|------|
| 400 | VALIDATION_ERROR | `period` が不正な値 |
| 401 | UNAUTHORIZED | 未認証 |
| 500 | INTERNAL_ERROR | 集計失敗 |

#### GET `/api/prediction-evaluation/tickers`

**リクエスト**

```typescript
type Query = {
  period: '7d' | '30d' | '90d' | 'all';
  minCount?: number; // デフォルト 5。これ以上の判定件数を持つ銘柄のみ返す
};
```

**レスポンス（成功）**

```typescript
type TickersResponse = {
  period: '7d' | '30d' | '90d' | 'all';
  minCount: number;
  tickers: Array<{
    tickerId: string;
    tickerName: string;
    exchangeId: string;
    accuracy: number; // 方向精度ベース（NEUTRAL 除外）
    count: number;
    bullishHit: number;
    bullishTotal: number;
    bearishHit: number;
    bearishTotal: number;
  }>;
};
```

---

## 2. データモデル

### 2.1 論理モデル

```typescript
// 採点結果エンティティ（新規）
type PredictionOutcomeEntity = {
  TickerID: string;          // 銘柄 ID
  ExchangeID: string;        // 取引所 ID（既存 DailySummary から複製。集計用）
  PredictionDate: string;    // 予測日（YYYY-MM-DD）= 当日終値の日付
  EvaluationDate: string;    // 採点に使った翌営業日（YYYY-MM-DD）
  PredictedSignal: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  BaseClose: number;         // 基準終値（PredictionDate の終値）
  EvaluationClose: number;   // 採点終値（EvaluationDate の終値）
  ActualReturn: number;      // (EvaluationClose - BaseClose) / BaseClose * 100（%）
  Hit: boolean;              // 判定結果
  ThresholdPercent: number;  // 採点に使った閾値（Phase 1 は 0.5）
  JudgedAt: number;          // 採点実行時刻（Unix ms）
  CreatedAt: number;
  UpdatedAt: number;
};
```

`Hit` は派生値だが、集計クエリの効率化のためデノーマライズして保存する。閾値変更時の再評価は `ActualReturn` から再計算する想定。

### 2.2 物理モデル

#### DynamoDB テーブル設計

既存の単一テーブル（`nagiyu-stock-tracker-main-{env}`）に新しいエンティティを追加する。

**主キー設計**

| 属性 | 型 | 説明 |
|-----|----|------|
| `PK` | string | `OUTCOME#{TickerID}` |
| `SK` | string | `DATE#{PredictionDate}` |
| `Type` | string | 固定値 `PredictionOutcome` |

**GSI 設計**

集計クエリのため新規 GSI を 1 つ追加する。

| GSI 名 | PK | SK | 用途 |
|--------|----|----|------|
| GSI5（仮）| `OUTCOME_BY_DATE` | `DATE#{PredictionDate}#{TickerID}` | 期間集計（全銘柄横断） |

> **注意**: 既存テーブルへの GSI 追加は `infra/stock-tracker/lib/dynamodb-stack.ts` の更新が必要。デプロイ時にバックフィル時間が発生する点を `tasks.md` で考慮する。

**アクセスパターン**

| 操作 | 方式 | キー |
|------|------|------|
| 採点結果の保存 | PutItem | PK = `OUTCOME#{TickerID}`、SK = `DATE#{PredictionDate}` |
| 単一予測の採点済み確認 | GetItem | 同上 |
| 期間内全採点結果の集計 | Query GSI5 | GSI5PK = `OUTCOME_BY_DATE`、GSI5SK = `DATE#{from}` 〜 `DATE#{to}` |
| 銘柄ごとの採点履歴 | Query | PK = `OUTCOME#{TickerID}` |
| 未採点予測の抽出 | DailySummary 側を Query → 既存 GSI4 で取引所×日付でスキャンし、対応する Outcome の有無を確認 | — |

**未採点予測抽出の方針**

採点バッチは DynamoDB を以下のように走査する：

1. 全 Exchange を取得し、現在時刻でその取引所の翌営業日が引け済みかを判定
2. 引け済み Exchange ごとに、`DailySummaryEntity` を `GSI4` でクエリ（GSI4PK = ExchangeID、GSI4SK = `DATE#{過去N日}` 〜 `DATE#{当日}`）
3. 各 DailySummary について、対応する PredictionOutcome の存在を `GetItem` で確認
4. 存在せず、`AiAnalysisResult` があり `AiAnalysisError` が無いものを採点対象とする

採点対象が増えても処理は冪等（既存採点をスキップ）であることが重要。

---

## 3. コンポーネント設計

### 3.1 パッケージ責務分担

| パッケージ | 責務 |
|-----------|------|
| `services/stock-tracker/core` | エンティティ・リポジトリインターフェース・採点ロジック（純粋関数） |
| `services/stock-tracker/batch` | 採点バッチ Lambda 本体（既存 `summary.ts` などと並列） |
| `services/stock-tracker/web` | API Routes（集計）・ダッシュボード UI |
| `infra/stock-tracker` | DynamoDB（GSI 追加）・Lambda・EventBridge |

### 3.2 実装モジュール一覧

#### core

| モジュール | パス | 役割 |
|-----------|------|------|
| `PredictionOutcomeEntity` | `core/src/entities/prediction-outcome.entity.ts` | 採点結果エンティティ |
| `PredictionOutcomeMapper` | `core/src/mappers/prediction-outcome.mapper.ts` | Entity ↔ DynamoDB Item 変換 |
| `PredictionOutcomeRepository` (interface) | `core/src/repositories/prediction-outcome.repository.interface.ts` | リポジトリインターフェース |
| `DynamoDBPredictionOutcomeRepository` | `core/src/repositories/dynamodb-prediction-outcome.repository.ts` | DynamoDB 実装 |
| `InMemoryPredictionOutcomeRepository` | `core/src/repositories/in-memory-prediction-outcome.repository.ts` | テスト用 in-memory 実装 |
| `judgePrediction` | `core/src/services/prediction-judger.ts` | 純粋関数：シグナル + リターン → Hit 判定 |
| `aggregatePredictions` | `core/src/services/prediction-aggregator.ts` | 純粋関数：採点結果リスト → 集計値（KPI、シグナル別、銘柄別、取引所別） |

#### batch

| モジュール | パス | 役割 |
|-----------|------|------|
| `evaluationHandler` | `batch/src/evaluation.ts` | 採点バッチエントリポイント（Lambda handler） |
| `findPendingEvaluations` | `batch/src/lib/find-pending-evaluations.ts` | 未採点 & 翌営業日引け済の予測を抽出 |
| `tradingview-client` | 既存（`core/src/services/tradingview-client.ts`） | 終値取得に流用 |

#### web

| モジュール | パス | 役割 |
|-----------|------|------|
| `GET /api/prediction-evaluation/summary` | `web/app/api/prediction-evaluation/summary/route.ts` | 集計 API |
| `GET /api/prediction-evaluation/tickers` | `web/app/api/prediction-evaluation/tickers/route.ts` | 銘柄別 API |
| `PredictionEvaluationPage` | `web/app/prediction-evaluation/page.tsx` | ダッシュボードページ |
| `PeriodSelector` | `web/components/prediction-evaluation/PeriodSelector.tsx` | 期間切替 |
| `KpiCards` | `web/components/prediction-evaluation/KpiCards.tsx` | KPI 4 カード |
| `DailyTrendChart` | `web/components/prediction-evaluation/DailyTrendChart.tsx` | 推移折れ線 |
| `SignalAccuracyChart` | `web/components/prediction-evaluation/SignalAccuracyChart.tsx` | シグナル別棒 |
| `TickerAccuracyTable` | `web/components/prediction-evaluation/TickerAccuracyTable.tsx` | 銘柄別テーブル |
| `ExchangeAccuracyTable` | `web/components/prediction-evaluation/ExchangeAccuracyTable.tsx` | 取引所別 |

#### infra

| モジュール | パス | 役割 |
|-----------|------|------|
| `DynamoDBStack` | `infra/stock-tracker/lib/dynamodb-stack.ts` | GSI5 追加 |
| `LambdaStack` | `infra/stock-tracker/lib/lambda-stack.ts` | 採点バッチ Lambda 定義追加 |
| `EventBridgeStack` | `infra/stock-tracker/lib/eventbridge-stack.ts` | 1 時間毎の cron ルール追加 |
| `IamStack` | `infra/stock-tracker/lib/iam-stack.ts` | 採点 Lambda の IAM 権限追加 |

### 3.3 モジュール間インターフェース

```typescript
// core/src/services/prediction-judger.ts
export type JudgeInput = {
  signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH';
  baseClose: number;
  evaluationClose: number;
  thresholdPercent: number; // Phase 1 は 0.5 を渡す
};
export type JudgeResult = {
  actualReturn: number; // %
  hit: boolean;
};
export function judgePrediction(input: JudgeInput): JudgeResult;

// core/src/services/prediction-aggregator.ts
export type AggregateInput = {
  outcomes: PredictionOutcomeEntity[];
  exchangeNameById: Record<string, string>;
  tickerNameById: Record<string, string>;
};
export type AggregateOutput = {
  kpi: { totalAccuracy: number | null; directionalAccuracy: number | null; neutralRatio: number | null; judgedCount: number };
  bySignal: Array<{ signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH'; accuracy: number | null; count: number }>;
  byExchange: Array<{ exchangeId: string; exchangeName: string; accuracy: number | null; count: number }>;
  byTicker: Array<{ tickerId: string; tickerName: string; exchangeId: string; accuracy: number; count: number; bullishHit: number; bullishTotal: number; bearishHit: number; bearishTotal: number }>;
  dailyTrend: Array<{ date: string; directionalAccuracy: number | null; judgedCount: number }>;
};
export function aggregatePredictions(input: AggregateInput): AggregateOutput;

// core/src/repositories/prediction-outcome.repository.interface.ts
export interface PredictionOutcomeRepository {
  save(entity: CreatePredictionOutcomeInput): Promise<void>;
  findByKey(tickerId: string, predictionDate: string): Promise<PredictionOutcomeEntity | null>;
  findByDateRange(from: string, to: string): Promise<PredictionOutcomeEntity[]>;
  findByTicker(tickerId: string): Promise<PredictionOutcomeEntity[]>;
}
```

### 3.4 判定ロジックの境界値

```text
ActualReturn (%) を r とする。Phase 1 では threshold = 0.5。

PredictedSignal = BULLISH のとき:  Hit = (r >= +threshold)
PredictedSignal = BEARISH のとき:  Hit = (r <= -threshold)
PredictedSignal = NEUTRAL のとき:  Hit = (-threshold < r < +threshold)
```

境界値の扱い：

- BULLISH/BEARISH は **以上 / 以下**（境界値を成功に含める）
- NEUTRAL は **より大きく / より小さく**（境界値は方向側に分類）

これにより `r = +0.5` ちょうどは「BULLISH なら成功 / NEUTRAL なら失敗」となり重複しない。

---

## 4. 実装上の注意点

### 4.1 依存関係・前提条件

- shared libs（`@nagiyu/common → browser → ui → nextjs → aws`）が dist ビルド済みであること（`docs/development/claude-environment.md` 参照）
- `core` パッケージは外部依存最小に保つ（`PATTERN_REGISTRY` のような既存パターン踏襲）
- TradingView API クライアントは既存（`core/src/services/tradingview-client.ts`）を使用、変更しない
- 取引時間判定は既存（`core/src/services/trading-hours-checker.ts`）を流用。翌営業日終値の確定判定にも使う

### 4.2 パフォーマンス考慮事項

- 採点バッチでは未採点予測を抽出する際に、Exchange ごとにバッチ化して Query する（全 Ticker を 1 件ずつ走査しない）
- TradingView API 呼び出しは既存と同じ rate limit 配慮で実装。同一銘柄・同一日の二重呼び出しを避ける
- 集計 API はクエリベースで毎回計算する（Phase 1 ではキャッシュ不要、件数規模では 1 秒以内で十分）。件数が増えてきた場合に Phase 2 以降でキャッシュ層を追加検討
- 銘柄別集計は API 側でデフォルト `minCount = 5` でフィルタする（ペイロードサイズ抑制）

### 4.3 セキュリティ考慮事項

- 全 API Route で既存認証ミドルウェアを通す
- `period` クエリパラメータは enum でバリデーション（任意文字列を受け付けない）
- `minCount` は数値型バリデーション + 上限値（例：1000）で DoS を防ぐ
- 採点結果には機密情報を含まない（公開市場データのみ）

### 4.4 冪等性

- 採点バッチは「既に PredictionOutcome が存在するキー」をスキップする
- TradingView API 失敗時は当該予測のみ失敗扱いとし、他の処理は続行
- 同一 Lambda が並列起動しても二重保存しない（DynamoDB の `attribute_not_exists` 条件を使用）

### 4.5 テスト方針

| レイヤ | 方針 |
|-------|------|
| 純粋関数（`judgePrediction`、`aggregatePredictions`） | 副作用なし。境界値・空入力・全 Hit / 全 Miss など網羅 |
| `DynamoDBPredictionOutcomeRepository` | `@aws-sdk/client-dynamodb-mock` 系で単体テスト |
| 採点バッチハンドラ | リポジトリと TradingView API をモック化、抽出ロジックの分岐網羅 |
| API Route | リポジトリをモック化。認証エラー / バリデーションエラー / 正常系 |
| ダッシュボード UI | コンポーネント単体（Material-UI ベース）+ 主要 E2E（`chromium-mobile` のみ Fast CI） |
| カバレッジ | core 80% 以上、batch / web も既存方針に準拠 |

---

## 5. docs/ への移行メモ

開発完了後、以下を `docs/` に反映してから本ディレクトリを削除する：

- [ ] `docs/services/stock-tracker/requirements.md` に予測採点ユースケース（UC-001/UC-002）を追加
- [ ] `docs/services/stock-tracker/external-design.md` に予測精度ダッシュボード（SCR-001）の画面設計を追加
- [ ] `docs/services/stock-tracker/architecture.md` に以下の ADR を追記
    - PredictionOutcome を独立エンティティとして DailySummary とは別 PK で持つ判断（既存エンティティ汚染を避ける）
    - 採点バッチを既存バッチに相乗りせず独立 Lambda にした判断（責務分離・スケジュール独立性）
    - GSI5 追加によるデノーマライズの判断（集計クエリ効率化）
- [ ] AI 改善ロードマップ（Phase 1〜4）を `docs/services/stock-tracker/` 配下のいずれかに記載

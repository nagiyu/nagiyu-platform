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

> **本章は作業 2 の確定版**。作業 1（UI PoC）の FB を反映済み。

### 1.1 ベース URL・認証

- ベース URL: 既存 stock-tracker web の API Routes（`/api/...`）
- 認証方式: 既存 web 認証（NextAuth ベース）に準拠。**`stocks:read-evaluation` 権限**（新規、Phase 1 では `stock-admin` ロールのみに付与）を持つ認証済みユーザーのみアクセス可
- permission 追加自体は作業 6（精度集計 API）と同タイミングで `libs/common/src/auth/{types,roles}.ts` を更新する

### 1.2 エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | `/api/prediction-evaluation/summary` | 期間指定で集計値（KPI + 日次推移 + シグナル別）を返す | 要 |

`tickers`（銘柄別）/ `exchanges`（取引所別）の独立エンドポイントは Phase 1 では実装しない（`external-design.md` ADR-005 参照）。将来必要になった時点で別 API として追加する。

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
    totalAccuracy: number | null;       // 総合精度（%）。判定済み 0 件なら null
    directionalAccuracy: number | null; // 方向精度（%、BULLISH+BEARISH のみ）
    judgedCount: number;                // 判定済み件数
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
};
```

UI 側の `web/lib/prediction-evaluation/types.ts` と同一の型を維持する（作業 7 でモック → 実 API 差し替え時の互換性確保）。

**エラーレスポンス**

| ステータス | エラーコード | 説明 |
|-----------|-------------|------|
| 400 | VALIDATION_ERROR | `period` が不正な値 |
| 401 | UNAUTHORIZED | 未認証 |
| 403 | FORBIDDEN | `stocks:read-evaluation` 権限なし |
| 500 | INTERNAL_ERROR | 集計失敗 |

### 1.4 将来拡張エンドポイント（Phase 1 では実装しない）

以下は ADR-005 に基づき Phase 1 のスコープ外。データは DB に蓄積されているため、必要になった時点で集計ロジック + エンドポイント追加のみで対応できる。

| メソッド | パス（予定） | 用途 |
|---------|------|------|
| GET | `/api/prediction-evaluation/tickers` | 銘柄別ヒット率一覧（最低件数フィルタ付き） |
| GET | `/api/prediction-evaluation/exchanges` | 取引所別ヒット率一覧 |
| GET | `/api/prediction-evaluation/ai-failures` | AI 解析失敗件数（運用監視。UI ではなく CloudWatch メトリクス化が筋という議論あり） |

---

## 2. データモデル

### 2.1 論理モデル

採点結果は独立エンティティではなく、**既存 `DailySummaryEntity` に Evaluation\* フィールドを追加**して保持する。

```typescript
// 既存 DailySummaryEntity に追加するフィールド（すべて optional）
type DailySummaryEvaluationFields = {
  EvaluationDate?: string;            // 採点に使った翌営業日（YYYY-MM-DD）
  EvaluationClose?: number;           // 採点終値（EvaluationDate の終値）
  ActualReturn?: number;              // (EvaluationClose - Close) / Close * 100（%）
  Hit?: boolean;                      // 判定結果
  EvaluationThresholdPercent?: number; // 採点に使った閾値（Phase 1 は 0.5）
  EvaluatedAt?: number;               // 採点実行時刻（Unix ms）
};
```

#### A 案（DailySummary 統合）を採用した理由

| 観点 | 採用理由 |
|------|---------|
| 紐づけ | `(TickerID, Date)` で完全一致するため、独立エンティティにしても紐づけは自明。であれば 1 レコードに集約する方が読み出しが単純（2 read → 1 read） |
| 既存パターン | `AiAnalysisResult` / `AiAnalysisError` も「DailySummary に後から付与される派生属性」として既に同居しており、Evaluation\* も同じ粒度の "後から埋まる ?" フィールドとして自然 |
| GSI 追加コスト | 既存 GSI4（`ExchangeID` × `DATE#{Date}#{TickerID}`）を集計に流用できるため、新規 GSI 追加とそのバックフィルが不要 |
| 不整合リスク | 1 レコードなので採点結果と予測の不整合は構造的に発生しない |
| Phase 1 着手コスト | 新規 Entity / Mapper / Repository / GSI を作らず、既存 mapper の拡張と Repository へのメソッド追加に留まる |

派生値である `Hit` も集計クエリ効率化のためデノーマライズして保存する。閾値変更による再評価は `ActualReturn` から再計算する想定（生のリターン値を保存しているため再採点で DB スキーマ変更は発生しない）。

`PredictedSignal` は `AiAnalysisResult.investmentJudgment.signal` から導出可能なため重複保存しない。`ExchangeID` / `TickerID` / `Date` / 当日終値（`Close`）も既に DailySummary が保持しているため重複させない。

### 2.2 物理モデル

#### DynamoDB テーブル設計

既存の単一テーブル（`nagiyu-stock-tracker-main-{env}`）に新規エンティティ・新規 GSI は追加しない。`DailySummaryEntity` に optional フィールドを増やすのみ。

**主キー設計**

| 属性 | 説明 |
|-----|------|
| `PK` | `SUMMARY#{TickerID}`（既存のまま） |
| `SK` | `DATE#{Date}`（既存のまま） |
| `Type` | `DailySummary`（既存のまま） |

**GSI 設計**

新規 GSI は追加しない。既存 GSI4（GSI4PK = `ExchangeID`、GSI4SK = `DATE#{Date}#{TickerID}`）を採点バッチ・集計 API の双方で流用する。

> **メリット**: 既存テーブルへの GSI 追加に伴うバックフィル待ちが発生せず、デプロイ即反映できる。

**アクセスパターン**

| 操作 | 方式 | キー / フィルタ |
|------|------|----------------|
| 採点結果の保存 | UpdateItem（条件付き） | PK = `SUMMARY#{TickerID}`、SK = `DATE#{Date}`、`SET EvaluationDate = :ed, EvaluationClose = :ec, ActualReturn = :ar, Hit = :h, EvaluationThresholdPercent = :t, EvaluatedAt = :ts, UpdatedAt = :u`、条件 `attribute_not_exists(EvaluatedAt)` |
| 単一予測の採点済み確認 | GetItem | 同上の PK / SK で `EvaluatedAt` の有無を確認 |
| 期間内全採点結果の集計 | Query GSI4（Exchange ごと） | 全 Exchange を取得 → 各 Exchange について GSI4PK = ExchangeID、GSI4SK BETWEEN `DATE#{from}` AND `DATE#{to}#~` で取得 → メモリ上で `EvaluatedAt` ありの項目に絞って集計 |
| 銘柄ごとの採点履歴 | Query | PK = `SUMMARY#{TickerID}`、SK 範囲指定（既存パターンと同一） |
| 未採点予測の抽出 | Query GSI4 | 同上、各 Exchange について該当期間を Query → メモリで「`AiAnalysisResult` あり & `AiAnalysisError` なし & `EvaluatedAt` なし」を抽出 |

**未採点予測抽出の方針**

採点バッチは DynamoDB を以下のように走査する：

1. 全 Exchange を取得し、現在時刻でその取引所の翌営業日が引け済みかを判定
2. 引け済み Exchange ごとに、`DailySummaryEntity` を GSI4 でクエリ（GSI4PK = ExchangeID、GSI4SK = `DATE#{過去N日}` 〜 `DATE#{当日}`）
3. 取得したアイテムをメモリ上でフィルタ：`AiAnalysisResult` があり、`AiAnalysisError` がなく、`EvaluatedAt` が未設定のものが採点対象
4. 採点完了時に UpdateItem で Evaluation\* を書き込む。条件 `attribute_not_exists(EvaluatedAt)` により並列起動時の二重採点を防止

採点対象が増えても処理は冪等（既存採点を条件式でスキップ）であることが重要。

---

## 3. コンポーネント設計

### 3.1 パッケージ責務分担

| パッケージ | 責務 |
|-----------|------|
| `services/stock-tracker/core` | エンティティ拡張・リポジトリ拡張・採点ロジック（純粋関数） |
| `services/stock-tracker/batch` | 採点バッチ Lambda 本体（既存 `summary.ts` などと並列） |
| `services/stock-tracker/web` | API Routes（集計）・ダッシュボード UI |
| `infra/stock-tracker` | Lambda・EventBridge（DynamoDB は GSI 追加なし） |

### 3.2 実装モジュール一覧

#### core

| モジュール | パス | 役割 |
|-----------|------|------|
| `DailySummaryEntity` 拡張 | `core/src/entities/daily-summary.entity.ts`（既存） | Evaluation\* optional フィールド 6 個を追加（§2.1 参照） |
| `DailySummaryMapper` 拡張 | `core/src/mappers/daily-summary.mapper.ts`（既存） | `toItem` / `toEntity` に Evaluation\* の入出力を追加 |
| `DailySummaryRepository` 拡張 | `core/src/repositories/daily-summary.repository.interface.ts` および DynamoDB 実装（既存） | `markAsEvaluated(key, fields)` メソッドを追加。条件付き UpdateItem で Evaluation\* を書き込む |
| `judgePrediction` | `core/src/services/prediction-judger.ts`（新規） | 純粋関数：シグナル + リターン → Hit 判定 |
| `aggregateEvaluatedSummaries` | `core/src/services/prediction-aggregator.ts`（新規） | 純粋関数：採点済み DailySummary リスト → 集計値（KPI、シグナル別、日次推移）。銘柄別 / 取引所別は Phase 1 のスコープ外（ADR-005） |

#### batch

| モジュール | パス | 役割 |
|-----------|------|------|
| `evaluationHandler` | `batch/src/evaluation.ts` | 採点バッチエントリポイント（Lambda handler） |
| `findPendingEvaluations` | `batch/src/lib/find-pending-evaluations.ts` | 未採点 & 翌営業日引け済の DailySummary を抽出（GSI4 を Exchange ごとに Query） |
| `tradingview-client` | 既存（`core/src/services/tradingview-client.ts`） | 終値取得に流用 |

#### web

| モジュール | パス | 役割 |
|-----------|------|------|
| `GET /api/prediction-evaluation/summary` | `web/app/api/prediction-evaluation/summary/route.ts` | 集計 API（作業 6 で実装） |
| Mock fixture | `web/lib/prediction-evaluation/mock-data.ts` | 作業 1（UI PoC）で利用する `SummaryResponse` 型のハードコード JSON。作業 7 で参照を削除またはテストフィクスチャへ移動 |
| Data hook | `web/lib/prediction-evaluation/use-prediction-evaluation.ts` | UI からデータ取得を抽象化する custom hook。作業 1 ではモック JSON を返し、作業 7 で `fetch()` 実装に差し替える唯一の差し替え点 |
| Summary headline | `web/lib/prediction-evaluation/summary-headline.ts` | 見出し直下の主要指標テキスト組み立て（フォーマッタを独立化、テスト容易性のため） |
| `PredictionEvaluationPage` | `web/app/prediction-evaluation/page.tsx` | ダッシュボードページ（作業 1 で実装） |
| `PeriodSelector` | `web/components/prediction-evaluation/PeriodSelector.tsx` | 期間切替 |
| `DailyTrendChart` | `web/components/prediction-evaluation/DailyTrendChart.tsx` | 日次推移グラフ（折れ線 + 件数棒 + 数値テーブル） |
| `SignalAccuracyChart` | `web/components/prediction-evaluation/SignalAccuracyChart.tsx` | シグナル別棒グラフ + 数値テーブル |

`KpiCards` / `TickerAccuracyTable` / `ExchangeAccuracyTable` は作業 2 で UI から外したため Phase 1 では実装しない（ADR-003 / ADR-005）。

#### infra

| モジュール | パス | 役割 |
|-----------|------|------|
| `LambdaStack` | `infra/stock-tracker/lib/lambda-stack.ts` | 採点バッチ Lambda 定義追加 |
| `EventBridgeStack` | `infra/stock-tracker/lib/eventbridge-stack.ts` | 1 時間毎の cron ルール追加 |
| `IamStack` | `infra/stock-tracker/lib/iam-stack.ts` | 採点 Lambda の IAM 権限追加（既存 DailySummary テーブルへの read/write） |

> **注意**: `DynamoDBStack` の変更は不要（GSI 追加なし）。既存テーブル / 既存 GSI4 のみで完結する。

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
//
// 入力は採点済み DailySummary（Evaluation* がすべて埋まっており、AiAnalysisResult があり
// AiAnalysisError がない）に絞ってから渡す前提。
//
// AggregateOutput は SummaryResponse（§1.3）の `kpi` / `bySignal` / `dailyTrend` と完全一致させる
// （API レイヤーは型変換のみで返却できる形）。銘柄別 / 取引所別 / NEUTRAL 比率 / AI 失敗件数は
// 作業 2（ADR-003〜005）の判断で Phase 1 のスコープ外。
export type EvaluatedDailySummary = DailySummaryEntity & {
  EvaluationDate: string;
  EvaluationClose: number;
  ActualReturn: number;
  Hit: boolean;
  EvaluationThresholdPercent: number;
  EvaluatedAt: number;
  AiAnalysisResult: AiAnalysisResult; // 必須化（PredictedSignal の導出元）
};
export type AggregateInput = {
  evaluated: EvaluatedDailySummary[];
};
export type AggregateOutput = {
  kpi: { totalAccuracy: number | null; directionalAccuracy: number | null; judgedCount: number };
  bySignal: Array<{ signal: 'BULLISH' | 'NEUTRAL' | 'BEARISH'; accuracy: number | null; count: number }>;
  dailyTrend: Array<{ date: string; directionalAccuracy: number | null; judgedCount: number }>;
};
export function aggregateEvaluatedSummaries(input: AggregateInput): AggregateOutput;

// core/src/repositories/daily-summary.repository.interface.ts（既存に追加するメソッド）
export interface DailySummaryRepository {
  // …既存メソッドはそのまま…

  /**
   * 採点結果を既存 DailySummary に書き込む。
   * - 条件: attribute_not_exists(EvaluatedAt)（二重採点防止）
   * - 既に採点済みの場合は ConditionalCheckFailedException を投げる（呼び出し側で skip）
   */
  markAsEvaluated(
    key: DailySummaryKey,
    fields: {
      EvaluationDate: string;
      EvaluationClose: number;
      ActualReturn: number;
      Hit: boolean;
      EvaluationThresholdPercent: number;
      EvaluatedAt: number;
    }
  ): Promise<void>;

  /**
   * 取引所 ID と日付範囲で DailySummary を取得（GSI4 を Query）。
   * 既存 `getByExchange(exchangeId, date?)` は単一日付 / 最新日に特化しているため、
   * 採点バッチと集計 API のために期間範囲対応を新設する。
   *
   * KeyConditionExpression: GSI4PK = :exchangeId AND GSI4SK BETWEEN :from AND :to
   *   :from = `DATE#${fromDate}`
   *   :to   = `DATE#${toDate}#~`  // `~` は ASCII でほぼ最大文字。ticker 部分を含めて当該日まで網羅
   */
  getByExchangeAndDateRange(
    exchangeId: string,
    fromDate: string,
    toDate: string
  ): Promise<DailySummaryEntity[]>;
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

### 4.3 セキュリティ考慮事項

- 全 API Route で既存認証ミドルウェア + **`stocks:read-evaluation`** 権限チェックを通す（`external-design.md` ADR-008）
    - 本 permission は Phase 1 で新設し、`stock-admin` ロールにのみ付与する
    - 実装は作業 6 で `libs/common/src/auth/{types,roles}.ts` + `withAuth` 呼び出しの 3 点更新
- `period` クエリパラメータは enum でバリデーション（任意文字列を受け付けない）
- 採点結果には機密情報を含まない（公開市場データのみ）

### 4.4 冪等性

- 採点バッチは抽出時に `EvaluatedAt` 未設定のものだけを対象とし、書き込み時には `attribute_not_exists(EvaluatedAt)` 条件付き UpdateItem を使う
- 二重採点はストレージレベルで構造的に防止（条件式違反は通常時に発生しないが、並列起動で同時に同じレコードを書きに行ったケースで `ConditionalCheckFailedException` を観測したらスキップ扱い）
- TradingView API 失敗時は当該予測のみ失敗扱いとし、他の処理は続行（DailySummary は更新せず、次回 cron で再試行）

### 4.5 テスト方針

| レイヤ | 方針 |
|-------|------|
| 純粋関数（`judgePrediction`、`aggregateEvaluatedSummaries`） | 副作用なし。境界値・空入力・全 Hit / 全 Miss など網羅 |
| `DailySummaryMapper` | 既存テストに Evaluation\* フィールドの toItem / toEntity ケースを追加（全 6 フィールドの round-trip、optional 不在時、partial 不在時） |
| `DailySummaryRepository.markAsEvaluated` | `@aws-sdk/client-dynamodb-mock` 系で UpdateItem 発行確認、条件式違反のハンドリング |
| 採点バッチハンドラ | リポジトリと TradingView API をモック化、抽出ロジックの分岐網羅 |
| API Route | リポジトリをモック化。認証エラー / バリデーションエラー / 正常系 / `EvaluatedAt` 欠損レコードが集計から除外されること |
| ダッシュボード UI | コンポーネント単体（Material-UI ベース）+ 主要 E2E（`chromium-mobile` のみ Fast CI） |
| カバレッジ | core 80% 以上、batch / web も既存方針に準拠 |

---

## 5. docs/ への移行メモ

この移行は `tasks.md` の **作業 8（docs/ 統合 & tasks/ 配下削除）** で実施する。作業 8 の PR で以下を漏れなく反映してから `tasks/stock-tracer-prediction-evaluation/` ディレクトリを削除する：

- [ ] `docs/services/stock-tracker/requirements.md` に予測採点ユースケース（UC-001/UC-002）を追加
- [ ] `docs/services/stock-tracker/external-design.md` に予測精度ダッシュボード（SCR-001）の画面設計を追加（作業 2 で確定した版）
- [ ] `docs/services/stock-tracker/architecture.md` に以下の ADR を追記
    - 採点結果を独立エンティティ化せず DailySummary に Evaluation\* フィールドとして統合した判断（紐づけキーが完全一致するため分離する利点が薄く、既存 `AiAnalysisResult` 同様「後から付与される派生属性」のパターンに合わせた）
    - 採点バッチを既存バッチに相乗りせず独立 Lambda にした判断（責務分離・スケジュール独立性）
    - 集計用 GSI を新設せず、既存 GSI4（ExchangeID × Date）を流用した判断（GSI 追加バックフィルを避け、Phase 1 の着手コストを最小化）
    - UI 先行 PoC 方式を採用した判断（実物を見るまで指標の取捨選択や見せ方の微調整が判断しきれないため、要件再確定のループを設計に組み込んだ）
    - KPI カード形式を採用せず、見出し直下の主要指標テキスト 1 行に集約した判断（`external-design.md` ADR-003）
    - 銘柄別・取引所別・AI 失敗件数・NEUTRAL 比率を Phase 1 UI から外した判断（`external-design.md` ADR-004 / ADR-005）
    - 専用 permission `stocks:read-evaluation` を新設し `stock-admin` のみに付与した判断（`external-design.md` ADR-008）
- [ ] AI 改善ロードマップ（Phase 1〜4）を `docs/services/stock-tracker/` 配下のいずれかに記載

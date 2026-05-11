# Stock Tracer 予測精度の自動採点・可視化基盤 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/stock-tracer-prediction-evaluation/ ディレクトリごと削除します。

    関連 Issue: #3018
    入口ドキュメント: tasks/stock-tracer-prediction-evaluation/README.md
    参照:
    - tasks/stock-tracer-prediction-evaluation/requirements.md — 受け入れ条件
    - tasks/stock-tracer-prediction-evaluation/external-design.md — UI 設計
    - tasks/stock-tracer-prediction-evaluation/design.md — 技術設計
-->

---

## 全体方針

- 各「作業」は独立した PR として `integration/3018-stock-tracer-prediction-evaluation` ブランチへ Draft PR を出す
- 作業 PR がレビュー・マージされて integration が更新されたら、次の作業ブランチは最新の integration から分岐し直す
- 全作業マージ後、人の確認を経て integration → develop の Draft PR を作成する
- 各作業着手時には `README.md` → `requirements.md` → `design.md` → 本ファイル の順で確認

---

## 作業 0：設計ドキュメント作成（本 PR）

**ブランチ**: `claude/3018-design-docs`

- [x] `tasks/stock-tracer-prediction-evaluation/README.md` 作成
- [x] `tasks/stock-tracer-prediction-evaluation/requirements.md` 作成
- [x] `tasks/stock-tracer-prediction-evaluation/external-design.md` 作成
- [x] `tasks/stock-tracer-prediction-evaluation/design.md` 作成
- [x] `tasks/stock-tracer-prediction-evaluation/tasks.md` 作成（本ファイル）

**完了条件**: 上記 5 ファイルが integration ブランチにマージされ、別セッションで読んでも自己完結することを確認できる。

---

## 作業 1：DailySummaryEntity 拡張（Evaluation\* フィールド追加）

**ブランチ**: `claude/3018-entity`
**依存**: 作業 0
**主な変更箇所**: `services/stock-tracker/core/`

A 案を採用し、独立エンティティではなく既存 `DailySummaryEntity` に Evaluation\* optional フィールドを追加する。新規 mapper / repository / GSI は作成しない。

- [ ] `core/src/entities/daily-summary.entity.ts` を更新
    - 以下 6 つの optional フィールドを追加（`design.md` §2.1 参照）
        - `EvaluationDate?: string`
        - `EvaluationClose?: number`
        - `ActualReturn?: number`
        - `Hit?: boolean`
        - `EvaluationThresholdPercent?: number`
        - `EvaluatedAt?: number`
    - 既存の `CreateDailySummaryInput` 型は `Omit<...>` ベースなので追加対応のみ
- [ ] `core/src/mappers/daily-summary.mapper.ts` を更新
    - `toItem`：Evaluation\* を spread 条件付きで item に含める（既存 `AiAnalysisResult` 等と同パターン）
    - `toEntity`：Evaluation\* を validation 関数で読み出す（不在時 undefined）
- [ ] `core/src/repositories/daily-summary.repository.interface.ts` を更新
    - `markAsEvaluated(key, fields)` メソッド追加（`design.md` §3.3 参照）
    - `getByExchangeAndDateRange(exchangeId, fromDate, toDate)` メソッド追加（既存 `getByExchange` は単一日付 / 最新日のみ対応のため、期間集計用に新設）
- [ ] `core/src/repositories/dynamodb-daily-summary.repository.ts`（既存）を更新
    - `markAsEvaluated` を実装。`UpdateItemCommand` で `SET` 句、条件式 `attribute_not_exists(EvaluatedAt)`
    - `ConditionalCheckFailedException` を独自エラーに変換するか throw 直し（呼び出し側で skip 判定可能にする）
    - `getByExchangeAndDateRange` を実装。GSI4 で `KeyConditionExpression: #gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to`、`:from = "DATE#" + fromDate`、`:to = "DATE#" + toDate + "#~"`（`#~` は最大ソート文字、ticker 横断で当該日付までを含めるため）
- [ ] `core/src/repositories/in-memory-daily-summary.repository.ts`（既存があれば）を更新
    - `markAsEvaluated` / `getByExchangeAndDateRange` を実装。前者は既に `EvaluatedAt` がある場合に同じ条件でエラーを投げる
- [ ] `core/src/index.ts` の export はインタフェース経由なので追加対応最小
- [ ] ユニットテスト
    - mapper：Evaluation\* 全 6 フィールドの round-trip、optional 不在時、partial（一部のみ存在）の場合の挙動を網羅
    - dynamodb repository：`markAsEvaluated` の正常系・条件式違反・既存 update メソッドへの影響なし
    - in-memory repository：`markAsEvaluated` の正常系と二重採点エラー
- [ ] カバレッジ 80% 以上を確認

**完了条件**: PR レビューが通り、`@nagiyu/stock-tracker-core` の既存テストがすべて green かつ追加テストも green、integration にマージ。

---

## 作業 2：判定ロジックと集計ロジック（core）

**ブランチ**: `claude/3018-judge-logic`
**依存**: 作業 1
**主な変更箇所**: `services/stock-tracker/core/`

- [ ] `core/src/services/prediction-judger.ts` 作成
    - `judgePrediction(input: JudgeInput): JudgeResult`
    - 境界値の扱い：BULLISH/BEARISH は **以上 / 以下**、NEUTRAL は **より大きく / より小さく**（`design.md` § 3.4）
    - 純粋関数。副作用なし
- [ ] `core/src/services/prediction-aggregator.ts` 作成
    - `aggregateEvaluatedSummaries(input: AggregateInput): AggregateOutput`
    - 入力は採点済み DailySummary（Evaluation\* 全埋まり、`AiAnalysisResult` あり、`AiAnalysisError` なし）に絞った配列
    - `PredictedSignal` は `AiAnalysisResult.investmentJudgment.signal` から導出
    - KPI / シグナル別 / 取引所別 / 銘柄別 / 日次推移 を一括算出
    - 入力が空のとき `accuracy = null`、`count = 0` を返す
    - 純粋関数
- [ ] `core/src/index.ts` に export 追加
- [ ] ユニットテスト
    - `judgePrediction`：シグナル × 境界値の網羅（境界値ちょうど + 内側 + 外側）
    - `aggregateEvaluatedSummaries`：空入力・全 Hit・全 Miss・複数取引所・複数銘柄・`AiAnalysisError` 混在（呼び出し側で除外する想定だが、防御的にもチェック）
- [ ] カバレッジ 80% 以上

**完了条件**: PR レビューが通り、テストがすべて green、integration にマージ。

---

## 作業 3：採点バッチ Lambda + EventBridge cron

**ブランチ**: `claude/3018-batch`
**依存**: 作業 1、作業 2
**主な変更箇所**:
- `services/stock-tracker/batch/`
- `infra/stock-tracker/lib/`

- [ ] `batch/src/lib/find-pending-evaluations.ts` 作成
    - 入力：`DailySummaryRepository`、`ExchangeRepository`、現在時刻
    - 出力：採点対象 DailySummary のリスト（`{ summary: DailySummaryEntity, exchange: ExchangeEntity, evaluationDate: string }[]`）
    - ロジック：全 Exchange を取得 → 翌営業日引け済み判定（`trading-hours-checker` 流用）→ 既存 GSI4 で対象期間の DailySummary を Query → メモリで「`AiAnalysisResult` あり & `AiAnalysisError` なし & `EvaluatedAt` 未設定」をフィルタ
- [ ] `batch/src/evaluation.ts` 作成（Lambda エントリポイント）
    - `find-pending-evaluations` を呼び出し
    - 各対象について、TradingView API で翌営業日終値を取得
    - `judgePrediction` で判定 → `DailySummaryRepository.markAsEvaluated(key, fields)` で書き込み
    - `ConditionalCheckFailedException`（並列起動による既採点）は info ログを出して continue
    - 個別予測の失敗（TradingView エラー等）も continue、全体停止しない
    - ログ出力（採点件数・失敗件数・既採点スキップ件数）
- [ ] `infra/stock-tracker/lib/lambda-stack.ts` に採点バッチ Lambda 追加（`batchEvaluationFunction`）
- [ ] `infra/stock-tracker/lib/eventbridge-stack.ts` に 1 時間毎の cron ルール追加
- [ ] `infra/stock-tracker/lib/iam-stack.ts` で採点 Lambda の必要権限を付与（既存 DailySummary テーブルへの read/update、Secrets Manager 等）
- [ ] ユニットテスト
    - `find-pending-evaluations`：取引所・引け状況・採点済み（`EvaluatedAt` あり）・AI 失敗のバリエーションで網羅
    - `evaluation` ハンドラ：依存をモック化、TradingView 失敗時の continue、空入力時の no-op、`ConditionalCheckFailedException` 発生時の skip
- [ ] カバレッジ 80% 以上
- [ ] dev 環境デプロイで実際に Lambda が起動することを確認

**完了条件**: dev 環境で採点バッチ Lambda が稼働し、新規予測に対して既存 DailySummary レコードへ Evaluation\* フィールドが書き込まれる。

**注意**:
- DynamoDB GSI 追加はなし（既存 GSI4 を流用）。`infra/stock-tracker/lib/dynamodb-stack.ts` の変更は不要
- TradingView API のクオータに注意（採点対象が多い場合は段階的なリリースを検討）

---

## 作業 4：精度集計 API（web）

**ブランチ**: `claude/3018-api`
**依存**: 作業 1（作業 2 のロジック流用は集計 API でも行う）
**主な変更箇所**: `services/stock-tracker/web/app/api/`

- [ ] `web/app/api/prediction-evaluation/summary/route.ts` 作成
    - GET 実装、認証ミドルウェア通過
    - `period` バリデーション（enum）
    - 全 Exchange を `ExchangeRepository` で取得 → 各 Exchange について `DailySummaryRepository.findByExchangeAndDateRange`（既存 GSI4 ベース）で対象期間の DailySummary を取得 → メモリで `EvaluatedAt` あり & `AiAnalysisError` なし & `AiAnalysisResult` ありに絞り `aggregateEvaluatedSummaries` で集計 → `SummaryResponse` 形式で返却
    - `aiFailureCount` は別途、同じ取得結果から `AiAnalysisError` ありの件数をカウント
- [ ] `web/app/api/prediction-evaluation/tickers/route.ts` 作成
    - GET 実装、認証ミドルウェア通過
    - `period` バリデーション、`minCount` の上限バリデーション（例：1000）
    - 上記と同じ取得・集計ロジックの `byTicker` 部分を `minCount` でフィルタして返却
- [ ] エラーハンドリング：日本語エラーメッセージ定数化（`docs/development/rules.md` 準拠）
- [ ] ユニットテスト
    - 各エンドポイント：認証エラー・バリデーションエラー・正常系・空データ・採点済み 0 件
- [ ] カバレッジ 80% 以上

**注意**:
- `DailySummaryRepository.getByExchangeAndDateRange` は作業 1 のスコープで追加済み前提

**完了条件**: PR レビュー通過、API がローカル / dev 環境で動作確認できる。

---

## 作業 5：ダッシュボード UI（web）

**ブランチ**: `claude/3018-ui`
**依存**: 作業 4
**主な変更箇所**: `services/stock-tracker/web/app/`、`services/stock-tracker/web/components/`

- [ ] `web/app/prediction-evaluation/page.tsx` 作成
    - 既存認証フローでガード
    - 期間ステートを保持し、API 呼び出し
    - ローディング / 空状態 / エラー UI
- [ ] `web/components/prediction-evaluation/` 配下に各コンポーネント作成
    - `PeriodSelector.tsx`
    - `KpiCards.tsx`
    - `DailyTrendChart.tsx`
    - `SignalAccuracyChart.tsx`
    - `TickerAccuracyTable.tsx`
    - `ExchangeAccuracyTable.tsx`
- [ ] 既存ナビゲーションに「予測精度」リンクを追加（既存ヘッダー / サイドバーに合わせる）
- [ ] レスポンシブ対応（Material-UI ブレークポイント）
- [ ] アクセシビリティ：グラフ値はテーブルで補助参照可能に
- [ ] コンポーネントユニットテスト
- [ ] E2E：基本表示と期間切替の Fast CI 用シナリオ（`chromium-mobile`）
- [ ] カバレッジ 80% 以上

**完了条件**: dev 環境でダッシュボードが表示され、すべての要素（KPI / 推移 / シグナル別 / 銘柄別 / 取引所別 / AI 失敗件数）が確認できる。

---

## 全体の完了チェック

- [ ] 作業 0〜5 のすべての PR が integration ブランチにマージ済み
- [ ] dev 環境で採点バッチ Lambda が稼働し、新規予測が翌営業日引け後 1 時間以内に採点される
- [ ] dev 環境のダッシュボードで `requirements.md` の受け入れ条件すべてを満たすことを確認
- [ ] テストカバレッジ 80% 以上（`coverageThreshold` で自動失敗する閾値）
- [ ] Lint・型チェックがすべて通過
- [ ] `design.md` の「docs/ への移行メモ」を処理（`docs/services/stock-tracker/` 配下を更新）
- [ ] 人の確認を取って **integration → develop の Draft PR を作成**
- [ ] 人によるレビュー・Ready 化・マージ完了
- [ ] `tasks/stock-tracer-prediction-evaluation/` ディレクトリを削除（develop マージ後の片付け PR、または最終 PR に含める）

---

## 進捗トラッカー

| 作業 | ブランチ | PR | ステータス | 担当セッション |
|------|---------|----|-----------|---------------|
| 0. 設計ドキュメント | `claude/3018-design-docs` | （本 PR） | 進行中 | — |
| 1. Entity / Repository | `claude/3018-entity` | — | 未着手 | — |
| 2. 判定 / 集計ロジック | `claude/3018-judge-logic` | — | 未着手 | — |
| 3. 採点バッチ + cron | `claude/3018-batch` | — | 未着手 | — |
| 4. 精度集計 API | `claude/3018-api` | — | 未着手 | — |
| 5. ダッシュボード UI | `claude/3018-ui` | — | 未着手 | — |

各作業 PR が出たら本テーブルを更新する。

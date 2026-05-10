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

## 作業 1：PredictionOutcome エンティティ追加（core）

**ブランチ**: `claude/3018-entity`
**依存**: 作業 0
**主な変更箇所**: `services/stock-tracker/core/`

- [ ] `core/src/entities/prediction-outcome.entity.ts` 作成
    - `PredictionOutcomeEntity`、`CreatePredictionOutcomeInput`、`PredictionOutcomeKey` を定義
    - `design.md` § 2.1 に従う
- [ ] `core/src/mappers/prediction-outcome.mapper.ts` 作成
    - `toItem` / `toEntity` / `buildKeys` を実装
    - PK = `OUTCOME#{TickerID}`、SK = `DATE#{PredictionDate}`、`Type = PredictionOutcome`
    - GSI5：GSI5PK = `OUTCOME_BY_DATE`、GSI5SK = `DATE#{PredictionDate}#{TickerID}`
- [ ] `core/src/repositories/prediction-outcome.repository.interface.ts` 作成
- [ ] `core/src/repositories/dynamodb-prediction-outcome.repository.ts` 作成
    - `save` は `attribute_not_exists(PK)` 条件で冪等性を担保
    - `findByDateRange` は GSI5 を Query
- [ ] `core/src/repositories/in-memory-prediction-outcome.repository.ts` 作成（テスト用）
- [ ] `core/src/index.ts` に export 追加
- [ ] ユニットテスト
    - mapper：正常系・必須フィールド欠損・型不一致
    - dynamodb repository：mock client で save / findByKey / findByDateRange / findByTicker
    - in-memory repository：基本動作
- [ ] カバレッジ 80% 以上を確認

**完了条件**: PR レビューが通り、`@nagiyu/stock-tracker-core` のテストがすべて green、integration にマージ。

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
    - `aggregatePredictions(input: AggregateInput): AggregateOutput`
    - KPI / シグナル別 / 取引所別 / 銘柄別 / 日次推移 を一括算出
    - 入力が空のとき `accuracy = null`、`count = 0` を返す
    - 純粋関数
- [ ] `core/src/index.ts` に export 追加
- [ ] ユニットテスト
    - `judgePrediction`：シグナル × 境界値の網羅（境界値ちょうど + 内側 + 外側）
    - `aggregatePredictions`：空入力・全 Hit・全 Miss・複数取引所・複数銘柄
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
    - 入力：`PredictionOutcomeRepository`、`DailySummaryRepository`、`ExchangeRepository`、現在時刻
    - 出力：採点対象の予測リスト（`{ tickerId, predictionDate, baseClose, signal, exchange }[]`）
    - ロジック：全 Exchange を取得 → 翌営業日引け済み判定（`trading-hours-checker` 流用）→ 既存 GSI4 で対象 DailySummary を抽出 → 既存採点をスキップ
- [ ] `batch/src/evaluation.ts` 作成（Lambda エントリポイント）
    - `find-pending-evaluations` を呼び出し
    - 各対象について、TradingView API で翌営業日終値を取得
    - `judgePrediction` で判定 → `PredictionOutcomeEntity` を `save`
    - エラー処理：個別予測の失敗は continue、全体停止しない
    - ログ出力（採点件数・失敗件数）
- [ ] `infra/stock-tracker/lib/dynamodb-stack.ts` を更新し GSI5 追加
- [ ] `infra/stock-tracker/lib/lambda-stack.ts` に採点バッチ Lambda 追加（`batchEvaluationFunction`）
- [ ] `infra/stock-tracker/lib/eventbridge-stack.ts` に 1 時間毎の cron ルール追加
- [ ] `infra/stock-tracker/lib/iam-stack.ts` で採点 Lambda の必要権限を付与（DynamoDB read/write、Secrets Manager 等）
- [ ] ユニットテスト
    - `find-pending-evaluations`：取引所・引け状況・採点済みのバリエーションで網羅
    - `evaluation` ハンドラ：依存をモック化、TradingView 失敗時の continue、空入力時の no-op、二重起動時の冪等性
- [ ] カバレッジ 80% 以上
- [ ] dev 環境デプロイで実際に Lambda が起動することを確認

**完了条件**: dev 環境で採点バッチ Lambda が稼働し、新規予測に対して採点レコードが作成される。GSI5 のバックフィルが完了している。

**注意**:
- GSI 追加は既存 DynamoDB テーブルへの変更で、デプロイ時にバックフィル時間が発生する
- TradingView API のクオータに注意（採点対象が多い場合は段階的なリリースを検討）

---

## 作業 4：精度集計 API（web）

**ブランチ**: `claude/3018-api`
**依存**: 作業 1（作業 2 のロジック流用は集計 API でも行う）
**主な変更箇所**: `services/stock-tracker/web/app/api/`

- [ ] `web/app/api/prediction-evaluation/summary/route.ts` 作成
    - GET 実装、認証ミドルウェア通過
    - `period` バリデーション（enum）
    - `PredictionOutcomeRepository.findByDateRange` で取得 → `aggregatePredictions` で集計 → `SummaryResponse` 形式で返却
- [ ] `web/app/api/prediction-evaluation/tickers/route.ts` 作成
    - GET 実装、認証ミドルウェア通過
    - `period` バリデーション、`minCount` の上限バリデーション（例：1000）
    - 集計結果を銘柄別に絞って返却
- [ ] エラーハンドリング：日本語エラーメッセージ定数化（`docs/development/rules.md` 準拠）
- [ ] ユニットテスト
    - 各エンドポイント：認証エラー・バリデーションエラー・正常系・空データ
- [ ] カバレッジ 80% 以上

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

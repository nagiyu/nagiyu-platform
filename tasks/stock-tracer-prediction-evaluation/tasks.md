# Stock Tracer 予測精度の自動採点・可視化基盤 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後（作業 8）に tasks/stock-tracer-prediction-evaluation/ ディレクトリごと削除します。

    関連 Issue: #3018
    入口ドキュメント: tasks/stock-tracer-prediction-evaluation/README.md
    参照:
    - tasks/stock-tracer-prediction-evaluation/requirements.md — 受け入れ条件
    - tasks/stock-tracer-prediction-evaluation/external-design.md — UI 設計（PoC 前の暫定案）
    - tasks/stock-tracer-prediction-evaluation/design.md — 技術設計
-->

---

## 全体方針

- 各「作業」は独立した PR として `integration/3018-stock-tracer-prediction-evaluation` ブランチへ Draft PR を出す
- 作業 PR がレビュー・マージされて integration が更新されたら、次の作業ブランチは最新の integration から分岐し直す
- 全実装作業 + docs 統合（作業 8）まで integration 上で完了させ、最後に人の確認を経て integration → develop の Draft PR を作成する
- 各作業着手時には `README.md` → `requirements.md` → `design.md` → 本ファイル の順で確認

### UI 先行（PoC）方式の理由

実物の UI を見るまで指標の取捨選択や見せ方の微調整は判断しきれない。先に PoC をモックデータで作って FB を回し、それを反映してから backend に着手することで API スキーマや集計ロジックの後戻りを避ける。

```
作業 0（設計） → 1（UI PoC） → 2（FB 反映で要件再確定） → 3〜7（backend + UI 配線） → 8（docs 統合 & tasks 削除） → integration → develop の PR
```

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

## 作業 1：ダッシュボード UI PoC（モックデータ）

**ブランチ**: `claude/3018-ui-poc`
**依存**: 作業 0
**主な変更箇所**: `services/stock-tracker/web/app/`、`services/stock-tracker/web/components/`、`services/stock-tracker/web/lib/`

UI を先行実装し、dev 環境で実物を確認できる状態にする。API はまだ存在しないため、`design.md` §1.3 の `SummaryResponse` / `TickersResponse` に準拠したハードコード JSON をモックとして使う。**この段階では backend / DB / 集計ロジックに一切触れない**。

- [x] `web/lib/prediction-evaluation/mock-data.ts` 作成
    - `MOCK_SUMMARY_RESPONSE: SummaryResponse`
    - `MOCK_TICKERS_RESPONSE: TickersResponse`
    - 内容バリエーション：複数日（日次推移を見られる程度の長さ）/ 複数銘柄 / 複数取引所 / 高精度・低精度ケース / 空状態（`judgedCount = 0`）/ 部分欠損（`accuracy = null`）を含め、UI の主要な状態を網羅
- [x] `web/lib/prediction-evaluation/use-prediction-evaluation.ts` 作成
    - `usePredictionEvaluationSummary(period)` / `usePredictionEvaluationTickers(period, minCount)` の 2 つの custom hook
    - PoC 段階ではモック JSON を Promise でラップして返す（loading / error 状態の UI も試せるよう setTimeout で小さな遅延を入れる、または error scenario 用のクエリパラメータで切替）
    - 作業 7 でここを fetch に差し替える「唯一の差し替え点」とする
- [x] `web/app/prediction-evaluation/page.tsx` 作成
    - 既存認証フローでガード
    - 期間ステートを保持し、上記 hook を呼ぶ
    - ローディング / 空状態 / エラー UI
- [x] `web/components/prediction-evaluation/` 配下に各コンポーネント作成
    - `PeriodSelector.tsx`
    - `KpiCards.tsx`
    - `DailyTrendChart.tsx`
    - `SignalAccuracyChart.tsx`
    - `TickerAccuracyTable.tsx`
    - `ExchangeAccuracyTable.tsx`
- [x] 既存ナビゲーションに「予測精度」リンクを追加（既存ヘッダー / サイドバーに合わせる）
- [x] レスポンシブ対応（Material-UI ブレークポイント）
- [x] アクセシビリティ：グラフ値はテーブルで補助参照可能に
- [x] コンポーネントユニットテスト（モックデータを fixture として利用）
- [x] E2E：基本表示と期間切替の Fast CI 用シナリオ（`chromium-mobile`）
- [x] カバレッジ 80% 以上

**完了条件**: dev 環境で `/prediction-evaluation`（仮）が表示され、KPI / 推移 / シグナル別 / 銘柄別 / 取引所別 / AI 失敗件数 / 空状態 / エラー の主要状態が確認できる。

**注意**:
- 本作業の UI レイアウトは `external-design.md` の暫定案ベースだが、PoC レビューで変更される前提
- API スキーマ（`design.md` §1.3）も PoC FB で変わる可能性がある。モック JSON は型上のみ整合させ、内容は柔軟に

---

## 作業 2：PoC レビュー FB を反映して要件・設計を再確定

**ブランチ**: `claude/3018-refine-docs`（PR #3057：UI 簡素化） + `claude/3018-finalize-docs`（後続 PR：ドキュメント確定 + デフォルト期間調整）
**依存**: 作業 1
**主な変更箇所**: `tasks/stock-tracer-prediction-evaluation/`、追補で `services/stock-tracker/web/`

作業 1 で dev に出た UI に対する FB をユーザーと対話で収集し、まず UI コードに先行反映（PR #3057）してから、ドキュメントを確定版に更新する 2 段階運用とした。

- [x] dev 環境で PoC を確認した人から FB を収集（本タスクのセッション対話で実施）
- [x] `requirements.md` を確定版に更新
    - 機能一覧の整理（F-008 を「主要指標テキスト表示」に変更、F-011〜F-013 を 2.2.1「将来拡張」に分離）
    - UC-002 の正常フロー / 代替フロー / 例外フローを確定版 UI に合わせて更新
    - §4.3 集計指標を Phase 1 UI に出すものだけに絞る
    - 受け入れ条件を確定版 UI 構成に合わせて更新
- [x] `external-design.md` を確定版に更新
    - 「PoC 前の暫定案」注記を削除し、確定版として明記
    - 画面レイアウト図・UI 要素表・ユーザーインタラクション・表示条件を確定版に
    - ADR-003〜007 を追加（KPI カード廃止 / 単独カード廃止 / 銘柄別・取引所別オミット / 前期比未実装 / 過去データ遡及採点）
- [x] `design.md` を確定版に更新
    - §1.2 エンドポイント一覧から `/tickers` を削除、§1.4 として将来拡張に移動
    - §1.3 `SummaryResponse` から `byExchange` / `KpiSummary.neutralRatio` / `KpiSummary.aiFailureCount` を削除
    - §3.2 実装モジュール一覧の web 配下を Phase 1 実装ファイルに整理、`summary-headline.ts` を追記
    - §3.3 `AggregateOutput` を `kpi` / `bySignal` / `dailyTrend` の 3 軸に絞り、`AggregateInput` から `exchangeNameById` / `tickerNameById` を削除
    - §4.3 から銘柄別 minCount 関連を削除、§4.3 に `stocks:read` 権限チェックを追記
    - §5 docs/ 移行メモに ADR 追記項目を補強
- [x] PoC 実装側の追補：`DEFAULT_PERIOD` を `'7d'` → `'30d'` に変更（external-design.md と整合）+ e2e 期間切替シナリオを更新

**完了条件**: ドキュメントが確定し、人が「これで backend 着手 OK」と判断できる状態になる。

**注意**:
- Evaluation\* フィールドの確定（変更なし。作業 0 時点の 6 フィールドを維持）が再確認できたので、作業 3 以降は手戻りなし
- API スキーマも確定したので、作業 6（API）と作業 7（UI 配線）の互換性は機械的に保てる
- PoC 注記アラート（`Alert severity="info"`）は作業 7（本物 API への切替）が完了するまで残し、その時点で削除する

---

## 作業 3：DailySummaryEntity 拡張（Evaluation\* フィールド追加）

**ブランチ**: `claude/3018-entity`
**依存**: 作業 2
**主な変更箇所**: `services/stock-tracker/core/`

A 案を採用し、独立エンティティではなく既存 `DailySummaryEntity` に Evaluation\* optional フィールドを追加する。新規 mapper / repository / GSI は作成しない。

- [x] `core/src/entities/daily-summary.entity.ts` を更新
    - 以下 6 つの optional フィールドを追加（`design.md` §2.1 参照。作業 2 の FB で増減する可能性あり）
        - `EvaluationDate?: string`
        - `EvaluationClose?: number`
        - `ActualReturn?: number`
        - `Hit?: boolean`
        - `EvaluationThresholdPercent?: number`
        - `EvaluatedAt?: number`
    - 既存の `CreateDailySummaryInput` 型は `Omit<...>` ベースなので追加対応のみ
- [x] `core/src/mappers/daily-summary.mapper.ts` を更新
    - `toItem`：Evaluation\* を spread 条件付きで item に含める（既存 `AiAnalysisResult` 等と同パターン）
    - `toEntity`：Evaluation\* を validation 関数で読み出す（不在時 undefined）
- [x] `core/src/repositories/daily-summary.repository.interface.ts` を更新
    - `markAsEvaluated(key, fields)` メソッド追加（`design.md` §3.3 参照）
    - `getByExchangeAndDateRange(exchangeId, fromDate, toDate)` メソッド追加（既存 `getByExchange` は単一日付 / 最新日のみ対応のため、期間集計用に新設）
    - 採点結果フィールド集合を `DailySummaryEvaluationFields` として型エクスポート（呼び出し側で再利用）
- [x] `core/src/repositories/dynamodb-daily-summary.repository.ts`（既存）を更新
    - `markAsEvaluated` を実装。`UpdateCommand` で `SET` 句、条件式 `attribute_exists(PK) AND attribute_not_exists(EvaluatedAt)`
    - `ConditionalCheckFailedException` を `EntityNotFoundError` / `EntityAlreadyExistsError` に変換（再 GetItem で 404 と既採点を区別、呼び出し側で skip 判定可能）
    - `getByExchangeAndDateRange` を実装。GSI4 で `KeyConditionExpression: #gsi4pk = :exchangeId AND #gsi4sk BETWEEN :from AND :to`、`:from = "DATE#" + fromDate`、`:to = "DATE#" + toDate + "#~"`（`#~` は最大ソート文字、ticker 横断で当該日付までを含めるため）。LastEvaluatedKey ループ対応
- [x] `core/src/repositories/in-memory-daily-summary.repository.ts` を更新
    - `markAsEvaluated` / `getByExchangeAndDateRange` を実装。前者は既に `EvaluatedAt` がある場合に `EntityAlreadyExistsError`、対象不在時に `EntityNotFoundError` を投げる
- [x] `core/src/index.ts` から `DailySummaryEvaluationFields` を追加 export
- [x] ユニットテスト
    - mapper：Evaluation\* 全 6 フィールドの round-trip、optional 不在時、partial（一部のみ存在）、boolean / timestamp 型不正、AI/Pattern との共存を網羅
    - dynamodb repository：`markAsEvaluated` の正常系・条件式違反（既採点 / 未存在の区別）・DB エラー、`getByExchangeAndDateRange` の BETWEEN クエリ・ページング・DB エラー
    - in-memory repository：`markAsEvaluated` の正常系・二重採点エラー・未存在エラー、`getByExchangeAndDateRange` の範囲フィルタ・空配列
- [x] カバレッジ 80% 以上を確認（mapper 87.87% / dynamodb 100% statements / in-memory 100% statements）

**完了条件**: PR レビューが通り、`@nagiyu/stock-tracker-core` の既存テストがすべて green かつ追加テストも green、integration にマージ。

---

## 作業 4：判定ロジックと集計ロジック（core）

**ブランチ**: `claude/3018-judge-logic`
**依存**: 作業 3
**主な変更箇所**: `services/stock-tracker/core/`

- [ ] `core/src/services/prediction-judger.ts` 作成
    - `judgePrediction(input: JudgeInput): JudgeResult`
    - 境界値の扱い：BULLISH/BEARISH は **以上 / 以下**、NEUTRAL は **より大きく / より小さく**（`design.md` § 3.4）
    - 純粋関数。副作用なし
- [ ] `core/src/services/prediction-aggregator.ts` 作成
    - `aggregateEvaluatedSummaries(input: AggregateInput): AggregateOutput`
    - 入力は採点済み DailySummary（Evaluation\* 全埋まり、`AiAnalysisResult` あり、`AiAnalysisError` なし）に絞った配列
    - `PredictedSignal` は `AiAnalysisResult.investmentJudgment.signal` から導出
    - KPI / シグナル別 / 取引所別 / 銘柄別 / 日次推移 を一括算出（作業 2 の FB で項目増減があれば反映）
    - 入力が空のとき `accuracy = null`、`count = 0` を返す
    - 純粋関数
- [ ] `core/src/index.ts` に export 追加
- [ ] ユニットテスト
    - `judgePrediction`：シグナル × 境界値の網羅（境界値ちょうど + 内側 + 外側）
    - `aggregateEvaluatedSummaries`：空入力・全 Hit・全 Miss・複数取引所・複数銘柄・`AiAnalysisError` 混在（呼び出し側で除外する想定だが、防御的にもチェック）
- [ ] カバレッジ 80% 以上

**完了条件**: PR レビューが通り、テストがすべて green、integration にマージ。

---

## 作業 5：採点バッチ Lambda + EventBridge cron

**ブランチ**: `claude/3018-batch`
**依存**: 作業 3、作業 4
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

## 作業 6：精度集計 API（web）+ 専用 permission の追加

**ブランチ**: `claude/3018-api`
**依存**: 作業 3（作業 4 のロジック流用は集計 API でも行う）
**主な変更箇所**: `services/stock-tracker/web/app/api/`、`libs/common/src/auth/`

- [ ] `libs/common/src/auth/types.ts` に新規 permission `stocks:read-evaluation` を追加（`Permission` 型に追記）
- [ ] `libs/common/src/auth/roles.ts` の `stock-admin` ロールの `permissions` 配列に `stocks:read-evaluation` を追加
    - 他ロール（`stock-viewer` / `stock-user`）には付与しない
    - 既存テスト（ロール定義 / permission チェック関連）の追従更新
- [ ] `web/app/api/prediction-evaluation/summary/route.ts` 作成
    - GET 実装、認証ミドルウェア + `stocks:read-evaluation` 権限チェックを通過（`withAuth` の第 2 引数に渡す）
    - `period` バリデーション（enum）
    - 全 Exchange を `ExchangeRepository` で取得 → 各 Exchange について `DailySummaryRepository.getByExchangeAndDateRange`（既存 GSI4 ベース）で対象期間の DailySummary を取得 → メモリで `EvaluatedAt` あり & `AiAnalysisError` なし & `AiAnalysisResult` ありに絞り `aggregateEvaluatedSummaries` で集計 → `SummaryResponse` 形式で返却
- [ ] PoC のガード差し替え（永続化部分）
    - `services/stock-tracker/web/app/prediction-evaluation/page.tsx` の `hasPermission(..., 'stocks:read')` を `stocks:read-evaluation` に差し替え
    - `services/stock-tracker/web/components/ThemeRegistry.tsx` の「予測精度」ナビゲーションリンク表示条件を同様に差し替え
- [ ] エラーハンドリング：日本語エラーメッセージ定数化（`docs/development/rules.md` 準拠）
- [ ] ユニットテスト
    - 認証エラー・権限エラー（`stocks:read-evaluation` を持たない `stock-viewer` / `stock-user` が 403 になること）・バリデーションエラー・正常系・空データ・採点済み 0 件
- [ ] カバレッジ 80% 以上

**注意**:
- `DailySummaryRepository.getByExchangeAndDateRange` は作業 3 のスコープで追加済み前提
- レスポンス形式は作業 1 のモック JSON（および確定版 `lib/prediction-evaluation/types.ts` の `SummaryResponse`）と一致させる（作業 7 の差し替えを機械的にするため）
- `/tickers` / `/exchanges` / `/ai-failures` は Phase 1 のスコープ外（`design.md` §1.4 参照）。本作業 6 では実装しない
- permission 追加判断のラショナルは `external-design.md` ADR-008 を参照

**完了条件**: PR レビュー通過、API がローカル / dev 環境で動作確認できる。`stock-admin` ロールのみ予測精度ダッシュボードと API にアクセスできる。

---

## 作業 7：UI を本物の API に接続

**ブランチ**: `claude/3018-ui-wire`
**依存**: 作業 1、作業 6
**主な変更箇所**: `services/stock-tracker/web/lib/prediction-evaluation/`

- [ ] `use-prediction-evaluation.ts` のモック呼び出しを `fetch('/api/prediction-evaluation/...')` に差し替え
- [ ] `mock-data.ts` はテストフィクスチャとして残すか、テストファイル配下に移動
- [ ] エラーハンドリング：401（未認証）/ 4xx（バリデーション）/ 5xx（サーバー）を UI 側で分岐表示
- [ ] dev 環境で実 API 接続を確認（採点済みデータがまだ無ければ「空状態」UI が出ることを確認）
- [ ] E2E：実 API 想定の最小シナリオ（モック API ハンドラを差し込む形でも可）

**完了条件**: dev 環境でダッシュボードが本物の API 経由でデータを表示する。

---

## 作業 8：docs/ への統合 & tasks/ 配下削除

**ブランチ**: `claude/3018-docs-finalize`
**依存**: 作業 7
**主な変更箇所**:
- `docs/services/stock-tracker/`
- `tasks/stock-tracer-prediction-evaluation/`（削除）

開発時の一時ドキュメントを永続化し、`tasks/` 配下を片付ける。`design.md` §5「docs/ への移行メモ」を実行する作業。

- [ ] `docs/services/stock-tracker/requirements.md` を更新
    - `tasks/.../requirements.md` の確定版から、ユースケース UC-001 / UC-002 を抽出して追加
    - 採点ルール仕様（Phase 1：閾値 0.5%、close-to-close、判定境界値）を追加
- [ ] `docs/services/stock-tracker/external-design.md` を更新
    - SCR-001（予測精度ダッシュボード）の画面設計を追加
    - 確定版の UI レイアウト・要素一覧・状態定義を反映
- [ ] `docs/services/stock-tracker/architecture.md` に ADR を追記
    - 採点結果を独立エンティティ化せず DailySummary に Evaluation\* フィールドとして統合した判断
    - 採点バッチを既存バッチに相乗りせず独立 Lambda にした判断
    - 集計用 GSI を新設せず、既存 GSI4 を流用した判断
    - UI 先行 PoC 方式を採用した判断（要件再確定のループを設計に組み込んだ理由）
- [ ] AI 改善ロードマップ（Phase 1〜4）を `docs/services/stock-tracker/` 配下のいずれかに記載
    - 既存ファイルへの追記か、新規 `ai-improvement-roadmap.md` 等として作成（既存ドキュメント構造に合わせる）
- [ ] `tasks/stock-tracer-prediction-evaluation/` ディレクトリを **削除**
    - `README.md` / `requirements.md` / `external-design.md` / `design.md` / `tasks.md` 全削除
- [ ] 削除と追加が同じ PR に含まれることで、レビュアーがどの内容が docs に移されたかを確認できる構成にする

**完了条件**: `tasks/stock-tracer-prediction-evaluation/` が消え、必要な情報がすべて `docs/services/stock-tracker/` 配下に永続化されている。

**注意**:
- この作業を integration ブランチ上で完了させてから integration → develop の PR を作成する
- develop には完成形（`docs/` 更新済み + `tasks/` なし）のみが入る

---

## 全体の完了チェック

- [ ] 作業 0〜8 のすべての PR が integration ブランチにマージ済み
- [ ] dev 環境で採点バッチ Lambda が稼働し、新規予測が翌営業日引け後 1 時間以内に採点される
- [ ] dev 環境のダッシュボードで `requirements.md`（作業 2 で確定したもの）の受け入れ条件すべてを満たすことを確認
- [ ] テストカバレッジ 80% 以上（`coverageThreshold` で自動失敗する閾値）
- [ ] Lint・型チェックがすべて通過
- [ ] `tasks/stock-tracer-prediction-evaluation/` 配下が削除され、内容が `docs/services/stock-tracker/` に統合されている（作業 8）
- [ ] 人の確認を取って **integration → develop の Draft PR を作成**
- [ ] 人によるレビュー・Ready 化・マージ完了

---

## 進捗トラッカー

| 作業 | ブランチ | PR | ステータス | 担当セッション |
|------|---------|----|-----------|---------------|
| 0. 設計ドキュメント | `claude/3018-design-docs` | #3020 | マージ済 | — |
| 1. UI PoC（モックデータ） | `claude/3018-ui-poc` | #3035 | マージ済 | Issue #3023 |
| 2. PoC FB 反映で要件再確定（UI 簡素化） | `claude/3018-refine-docs` | #3057 | マージ済 | Issue #3024 |
| 2. PoC FB 反映で要件再確定（ドキュメント確定 + 30d デフォルト） | `claude/3018-finalize-docs` | 本 PR | 進行中 | Issue #3024 |
| 3. Entity / Repository 拡張 | `claude/3018-entity` | — | 未着手 | — |
| 4. 判定 / 集計ロジック | `claude/3018-judge-logic` | — | 未着手 | — |
| 5. 採点バッチ + cron | `claude/3018-batch` | — | 未着手 | — |
| 6. 精度集計 API | `claude/3018-api` | — | 未着手 | — |
| 7. UI を本物の API に配線 | `claude/3018-ui-wire` | — | 未着手 | — |
| 8. docs/ 統合 & tasks/ 削除 | `claude/3018-docs-finalize` | — | 未着手 | — |

各作業 PR が出たら本テーブルを更新する。

# サマリー一覧の表示改善

## 概要

StockTracker のサマリー一覧テーブルを見やすくする。現在は OHLC（始値・高値・安値・終値）を表示しているが、
ユーザーが必要としている情報は OHLC ではなく、投資判断・アラート状況に特化した内容である。

## 関連情報

- Issue: #（サマリー一覧の表示改善）
- タスクタイプ: サービスタスク（`services/stock-tracker/web`）

## 調査結果

### 現在のテーブル列

| 列名 | 状況 |
|------|------|
| シンボル | ✅ 表示中 |
| 銘柄名 | ✅ 表示中 |
| 保有 | ✅ 表示中 |
| 始値 | 🔴 不要（Issue では不要） |
| 高値 | 🔴 不要（Issue では不要） |
| 安値 | 🔴 不要（Issue では不要） |
| 終値 | 🔴 不要（Issue では不要） |
| 買いシグナル数 | ✅ 表示中 |
| 売りシグナル数 | ✅ 表示中 |

### Issue で求められている列

| 列名 | データ取得の難易度 | 対応方針 |
|------|----------------|----------|
| シンボル | ✅ 既存 | 変更なし |
| 銘柄名 | ✅ 既存 | 変更なし |
| 保有可否 | ✅ 既存 | 変更なし（または表現改善） |
| 投資判断 | ✅ データ有り（要 UI 追加） | `TickerSummary.aiAnalysisResult?.investmentJudgment?.signal` を表示 |
| 買いシグナル数 | ✅ 既存 | 変更なし |
| 売りシグナル数 | ✅ 既存 | 変更なし |
| 買いアラート数 | 🔶 新規取得が必要 | 後述の方針を参照 |
| 売りアラート数 | 🔶 新規取得が必要 | 後述の方針を参照 |

### 投資判断データの現状

- `TickerSummary` 型の `aiAnalysisResult?.investmentJudgment?.signal` に `'BULLISH' | 'NEUTRAL' | 'BEARISH'` の値が格納される
- `resolveInvestmentSignalLabel()` で「強気」「中立」「弱気」に変換するヘルパーが既に存在
- ただし AI 解析が未生成または失敗の場合は `null` になる
- `resolveAiAnalysisFallbackMessage()` でエラー・未解析状態を判定可能

### アラート数データの現状

- `/api/summaries` レスポンスにアラート情報は**含まれていない**
- アラートは `/api/alerts` エンドポイントで別管理（ユーザー全アラートのページネーション取得）
- `AlertRepository.getByUserId()` でユーザーの全アラートが取得可能
- アラートは `TickerID` を持ち、`Mode: 'Buy' | 'Sell'` で種別が分かる

## 要件

### 機能要件

- FR1: サマリー一覧テーブルの列を Issue の要件に合わせて変更する
    - 表示する列: シンボル・銘柄名・保有可否・投資判断・買いシグナル数・売りシグナル数・買いアラート数・売りアラート数
    - 削除する列: 始値・高値・安値・終値
- FR2: 投資判断は AI 解析結果（BULLISH/NEUTRAL/BEARISH）を日本語（強気/中立/弱気）で表示する
    - AI 解析未生成 / エラーの場合は `-` またはそれに準じた表示にする
- FR3: 買いアラート数・売りアラート数は、そのティッカーに対してユーザーが設定しているアラートの件数を表示する
    - アラートが 0 件の場合は `0` を表示する
    - 無効（Enabled: false）のアラートも件数に含めるかは要検討（下記「未決定事項」参照）

### 非機能要件

- NFR1: テストカバレッジ 80% 以上を維持する
- NFR2: `/api/summaries` のレスポンスタイムが大幅に増加しないこと
    - アラート件数取得のためにアラートリポジトリを呼ぶ場合、1 回の API 呼び出しで完結させる
- NFR3: スマートフォン（モバイル）でも列が見やすい表示にする（横スクロール対応も可）

## 実装のヒント

### 投資判断の表示

- `page.tsx` のテーブルヘッダーに「投資判断」列を追加し、各行に `resolveInvestmentSignalLabel()` の結果を表示
- 未解析状態は `UI_DISPLAY_VALUES.NOT_AVAILABLE` (`'-'`) を表示
- BULLISH/NEUTRAL/BEARISH に対応する色付き Chip（MUI）の使用を検討

### アラート数の取得方法（要選定）

**案 A: `/api/summaries` にアラート件数を含める**
- `SummariesResponse` の `TickerSummary` に `buyAlertCount` / `sellAlertCount` フィールドを追加
- `app/api/summaries/route.ts` で `alertRepository.getByUserId()` を呼び出し、TickerID × Mode で件数を集計
- メリット: フロントエンドの変更が最小、1 回の fetch で完結
- デメリット: サマリー API の責務が増える、アラートが多い場合に処理が重くなる可能性

**案 B: フロントエンドで `/api/alerts` を別途 fetch**
- `page.tsx` で `useEffect` を追加して `/api/alerts` を呼び出し、ティッカー別に件数を集計
- メリット: API の責務が分離、既存の `/api/summaries` に変更不要
- デメリット: 2 回の fetch が必要、表示タイミングのずれが生じる可能性

**推奨**: 案 A（サーバーサイドで一括集計）を優先検討。ただしアラート件数は全ユーザーアラートをページネーションなしで取得できる前提が必要であるため、`alertRepository.getByUserId()` の性能特性を確認する。

### テーブルの列削減

- `page.tsx` の `TableHead`・`TableBody` から始値・高値・安値・終値の `TableCell` を削除
- 削除による E2E テストへの影響を確認する（`summary-display.spec.ts`）

## タスク

### Phase 1: 調査・設計

- [ ] T001: `/api/summaries/route.ts` でアラートリポジトリを呼び出した場合の性能影響を試算する
- [ ] T002: アラート件数の取得方式（案 A または案 B）を決定する
- [ ] T003: 無効アラート（`Enabled: false`）を件数に含めるかを決定する

### Phase 2: バックエンド変更（案 A 採用時）

- [ ] T004: `web/types/stock.ts` の `TickerSummary` に `buyAlertCount` / `sellAlertCount` フィールドを追加
- [ ] T005: `app/api/summaries/route.ts` でアラート件数を集計してレスポンスに含める
- [ ] T006: `tests/unit/app/api/summaries/route.test.ts` のテストを更新

### Phase 3: フロントエンド変更

- [ ] T007: `app/summaries/page.tsx` の OHLC 列（始値・高値・安値・終値）を削除
- [ ] T008: `app/summaries/page.tsx` に「投資判断」列を追加（`resolveInvestmentSignalLabel()` 使用）
- [ ] T009: `app/summaries/page.tsx` に「買いアラート数」「売りアラート数」列を追加

### Phase 4: テスト更新・検証

- [ ] T010: `tests/e2e/summary-display.spec.ts` を新しい列構成に合わせて更新
- [ ] T011: ユニットテスト・E2E テストを実行して全件通過を確認
- [ ] T012: スマートフォン表示でテーブルのレイアウトを確認

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [テスト戦略](../docs/development/testing.md)
- 関連ファイル:
    - `services/stock-tracker/web/app/summaries/page.tsx` — サマリー一覧ページ
    - `services/stock-tracker/web/types/stock.ts` — UI 型定義
    - `services/stock-tracker/web/app/api/summaries/route.ts` — サマリー取得 API
    - `services/stock-tracker/web/app/summaries/ai-analysis.ts` — 投資判断ラベル変換
    - `services/stock-tracker/core/src/repositories/alert.repository.interface.ts` — アラートリポジトリ
    - `services/stock-tracker/web/tests/e2e/summary-display.spec.ts` — E2E テスト

## 備考・未決定事項

- 無効アラート（`Enabled: false`）を件数に含めるか: アラートが無効でも設定されていることを示す観点では含めた方が良いが、「現在有効なアラート数」を表す観点では除外が自然
- アラート件数をリアルタイムで反映するか: サマリー表示のたびに件数を再取得するか、キャッシュ活用するか
- OHLC データは削除するが、詳細ダイアログでは引き続き表示する（変更不要）

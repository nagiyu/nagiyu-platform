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
    - 有効アラートのみある場合は `1`、無効アラートもある場合は `1 (2)`（有効 1、無効 2）の形式で表示する
    - すべて 0 件の場合は `0` を表示する

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

### アラート数の取得方法（決定済み）

**案 A: `/api/summaries` にアラート件数を含める（採用）**
- `SummariesResponse` の `TickerSummary` に `buyAlertCount` / `sellAlertCount` フィールドを追加
    - 各フィールドは `{ enabled: number; disabled: number }` の形式で持つ
- `app/api/summaries/route.ts` で `alertRepository.getByUserId()` を呼び出し、TickerID × Mode で有効・無効それぞれの件数を集計
- サマリー画面を表示するたびにアラート件数が再取得される（リアルタイム反映）

**表示形式（決定済み）**
- 有効アラートのみの場合: `1`
- 無効アラートもある場合: `1 (2)`（有効数 1、無効数 2 を意味する）
- どちらも 0 の場合: `0`

### テーブルの列削減

- `page.tsx` の `TableHead`・`TableBody` から始値・高値・安値・終値の `TableCell` を削除
- 削除による E2E テストへの影響を確認する（`summary-display.spec.ts`）

## タスク

### Phase 1: バックエンド変更

- [ ] T001: `web/types/stock.ts` の `TickerSummary` に `buyAlertCount` / `sellAlertCount` フィールドを追加
    - 型: `{ enabled: number; disabled: number }`
- [ ] T002: `app/api/summaries/route.ts` で `alertRepository.getByUserId()` を呼び出し、TickerID × Mode で有効・無効件数を集計してレスポンスに含める
- [ ] T003: `tests/unit/app/api/summaries/route.test.ts` のテストを更新（アラート件数が含まれることを検証）

### Phase 2: フロントエンド変更

- [ ] T004: `app/summaries/page.tsx` の OHLC 列（始値・高値・安値・終値）を削除
- [ ] T005: `app/summaries/page.tsx` に「投資判断」列を追加（`resolveInvestmentSignalLabel()` 使用）
- [ ] T006: `app/summaries/page.tsx` に「買いアラート数」「売りアラート数」列を追加
    - 表示形式: 有効数のみの場合 `1`、無効数もある場合 `1 (2)`（有効 1、無効 2）、すべて 0 の場合 `0`

### Phase 3: テスト更新・検証

- [ ] T007: `tests/e2e/summary-display.spec.ts` を新しい列構成に合わせて更新
- [ ] T008: ユニットテスト・E2E テストを実行して全件通過を確認
- [ ] T009: スマートフォン表示でテーブルのレイアウトを確認

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

## 備考

- OHLC データは一覧から削除するが、詳細ダイアログでは引き続き表示する（変更不要）
- アラート件数はサマリー画面を開くたびに再取得される（リアルタイム反映）

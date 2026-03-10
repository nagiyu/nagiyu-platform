# 出来高（Volume）の追加 - Stock Tracker

## 概要

Stock Tracker にて、TradingView API から取得している当日の株価データに出来高（Volume）を追加する。
サマリー詳細画面での表示と AI 分析リクエストへの連携を目的とする。

## 関連情報

- Issue: #（出来高の追加）
- タスクタイプ: サービスタスク（stock-tracker）
- 対象コンポーネント: core / batch / web

## 要件

### 機能要件

- FR1: 日次サマリーに当日分の出来高（Volume）を保持できるようにする
- FR2: バッチ処理（`batch/src/summary.ts`）にて、TradingView から取得した日足データの出来高を抽出・保存する
- FR3: サマリー詳細画面にて出来高を表示する
- FR4: AI 分析リクエストに当日分の始値・終値・高値・低値と合わせて出来高を送付する

### 非機能要件

- NFR1: 既存のアラート評価やパターン認識の動作に影響を与えない
- NFR2: `Volume` が未取得・null の場合でも既存機能が壊れないよう後方互換性を維持する（オプショナル追加）
- NFR3: テストカバレッジ 80% 以上を維持する

## 実装のヒント

### 現状の把握

- `core/src/types.ts` の `ChartDataPoint` にはすでに `volume` フィールドが存在する
- `core/src/types.ts` の `DailySummary` 型にはまだ `Volume` が存在しない
- `core/src/entities/daily-summary.entity.ts` の `DailySummaryEntity` にも `Volume` が存在しない
- `batch/src/lib/openai-client.ts` の `AiAnalysisInput` と `HistoricalPriceData` にも `volume` が存在しない
- AI 分析プロンプトでは「過去データ（`historicalData`）」と「当日データ（OHLC）」が別途入力されている

### 実装方針

1. **コアデータ型への追加（`core`）**
    - `DailySummary` 型に `Volume?: number` を追加（オプショナル）
    - `DailySummaryEntity` に `Volume?: number` を追加
    - `CreateDailySummaryInput` など入力型にも `volume?: number` を追加
    - `DailySummaryMapper` にて `Volume` のシリアライズ/デシリアライズを対応させる
    - `InMemoryDailySummaryRepository` のテストデータ・アサーションを更新

2. **バッチ処理への追加（`batch`）**
    - `summary.ts` にて日足チャートデータの最新レコードから `volume` を抽出し、upsert 入力に含める
    - `AiAnalysisInput` に `volume?: number` を追加
    - `createPrompt` 関数内の当日情報セクションに出来高を追記する
    - `HistoricalPriceData` への追加は今回のスコープ外（当日分のみの連携）

3. **Web フロントエンドへの追加（`web`）**
    - `web/types/stock.ts` の `TickerSummary` に `volume?: number` を追加
    - `/api/summaries` のレスポンスマッピングで `Volume` を含める
    - サマリー詳細画面（`web/app/summaries/page.tsx`）にて出来高を表示するUIを追加

### 注意点

- DynamoDB テーブルはスキーマレスであるため、`Volume` 属性を追加するだけで対応可能（マイグレーション不要）
- 既存レコードに `Volume` がない場合も `undefined` として扱い、表示側で「-」等のフォールバックを設ける
- バッチは日足（タイムフレーム `'D'`）データを利用しているため、最新エントリの `volume` を当日出来高として扱う

## タスク

### Phase 1: コアライブラリの型・エンティティ更新

- [ ] T001: `core/src/types.ts` の `DailySummary` 型に `Volume?: number` を追加
- [ ] T002: `core/src/entities/daily-summary.entity.ts` に `Volume?: number` を追加
- [ ] T003: `core/src/repositories/daily-summary.repository.interface.ts` の `CreateDailySummaryInput` に `volume?: number` を追加
- [ ] T004: `core/src/mappers/daily-summary.mapper.ts` の変換ロジックで `Volume` を対応
- [ ] T005: In-Memory リポジトリ実装（`in-memory-daily-summary.repository.ts`）の `upsert` で `Volume` を保持
- [ ] T006: 関連するユニットテストを更新・追加

### Phase 2: バッチ処理の更新

- [ ] T007: `batch/src/lib/openai-client.ts` の `AiAnalysisInput` に `volume?: number` を追加
- [ ] T008: `createPrompt` 関数の当日データセクション（始値・終値・高値・低値のセクション）に出来高を追加
- [ ] T009: `batch/src/summary.ts` にて最新日足データから `volume` を抽出し `upsert` 入力へ連携
- [ ] T010: 関連するユニットテストを更新・追加

### Phase 3: Web フロントエンドの更新

- [ ] T011: `web/types/stock.ts` の `TickerSummary` に `volume?: number` を追加
- [ ] T012: `web/app/api/summaries/route.ts` のレスポンスマッピングで `Volume` を含める
- [ ] T013: サマリー詳細画面（`web/app/summaries/page.tsx`）に出来高表示UI を追加（値なしの場合は「-」表示）
- [ ] T014: 関連するユニットテスト・E2E テストを更新・追加

## 参考ドキュメント

- `docs/services/stock-tracker/requirements.md` - 機能要件定義
- `docs/services/stock-tracker/architecture.md` - システムアーキテクチャ
- `docs/services/stock-tracker/api-spec.md` - API 仕様
- `docs/development/rules.md` - コーディング規約

## 備考・未決定事項

- 過去データ（`HistoricalPriceData`）への `volume` 追加は今回スコープ外。AI 分析精度向上のため、後続タスクとして検討する
- 出来高のフォーマット（数値の桁区切り表示等）は UI 実装時に既存フォーマット規約に合わせる
- TradingView API の `ChartDataPoint.volume` が `0` を返すケース（市場休業日等）の扱いは要確認

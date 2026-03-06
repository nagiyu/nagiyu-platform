# AI に渡すデータを拡張する

## 概要

サマリー機能の AI 解析において、現在は当日の OHLC とパターン分析結果のみを渡しているが、
より精度の高い解析を実現するために以下の 2 種類のデータを追加で連携できるようにする。

- **過去データ（50日分）**: DynamoDB に保存済みの日次サマリーを活用し、価格推移のコンテキストを提供する
- **チャートのスクリーンショット**: ローソク足チャートの画像を生成し、AI の視覚的解析を可能にする

## 関連情報

- Issue: #（AI に渡すデータを拡張する）
- タスクタイプ: サービスタスク（stock-tracker/batch、stock-tracker/core）

## 現状

### AI に渡している情報

`batch/src/lib/openai-client.ts` の `AiAnalysisInput` インターフェースと `createPrompt` 関数が定義しており、
現在以下の情報のみをプロンプトに含めている。

- ティッカーID / 銘柄名 / 日付
- 当日の始値・高値・安値・終値（OHLC）
- 買い/売りシグナル合致数
- 合致パターン名（カンマ区切り）

### データ取得の仕組み

- バッチ（`summary.ts`）が TradingView から 100 本の日足データを取得し DynamoDB へ保存している
- DynamoDB のキー設計は `PK: SUMMARY#{TickerID}`, `SK: DATE#{Date}` のため、ティッカー単位で日付範囲クエリが可能

## 要件

### 機能要件

- **FR1**: AI 解析時に、対象日を含む過去 50 日分の OHLC データをプロンプトに追加する
    - 各日付の Date / Open / High / Low / Close を含める
    - DynamoDB に存在する分のみ使用し、不足している日付はスキップする
    - 件数が 50 件に満たない場合は取得できた分のみで解析を進める
- **FR2**: AI 解析時に、ローソク足チャートの画像（Base64 PNG）を OpenAI の vision 入力として渡す
    - 対象日を含む過去 50 日分の日足チャートを画像化する
    - ECharts の Node.js サーバーサイドレンダリング機能を使用して Lambda 内で生成する
- **FR3**: プロンプト・モデル設定を過去データと画像入力に対応した形式に更新する
    - 過去データをテーブル形式または JSON 形式でプロンプトに埋め込む
    - 画像は OpenAI messages API の image_url または base64 形式で送信する
    - 使用モデルをビジョン対応モデルに変更する（現在 `gpt-5-mini` → 変更後は vision 対応モデルを検討）

### 非機能要件

- **NFR1**: Lambda のメモリ・タイムアウト設定を画像生成処理に合わせて見直す（現在の 120 秒タイムアウトは据え置き、必要に応じてメモリを増加）
- **NFR2**: チャート画像生成が失敗した場合でも、画像なしで AI 解析を継続する（graceful degradation）
- **NFR3**: 過去データ取得が失敗した場合（DynamoDB エラー等）も graceful degradation し、当日データのみで解析する
- **NFR4**: テストカバレッジ 80% 以上を維持する
- **NFR5**: TypeScript strict mode を維持する

## 実装方針

### フェーズ 1: 過去データの取得

#### リポジトリインターフェースの拡張

`DailySummaryRepository` に新メソッドを追加する。

概念的な役割:

```
getRecentByTicker(tickerId, endDate, count):
  - PK: SUMMARY#{tickerId} でクエリ
  - SK: DATE#0000-00-00 ～ DATE#{endDate} の範囲を ScanIndexForward=false で降順取得
  - Limit: count 件
  - 返却: DailySummaryEntity[] (新しい日付順)
```

影響ファイル:
- `services/stock-tracker/core/src/repositories/daily-summary.repository.interface.ts`
- `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts`
- `services/stock-tracker/core/src/repositories/in-memory-daily-summary.repository.ts`

#### AiAnalysisInput への過去データ追加

`AiAnalysisInput` インターフェースに過去 OHLC データのフィールドを追加する。

概念的な型拡張:

```
historicalData: Array<{
  date: string
  open: number
  high: number
  low: number
  close: number
}>
```

影響ファイル:
- `services/stock-tracker/batch/src/lib/openai-client.ts`

#### summary.ts での過去データ取得

`processExchange` の AI 解析呼び出し前に、
`getRecentByTicker` を使用して過去 50 件の日次サマリーを取得し、
`AiAnalysisInput` に含める。

影響ファイル:
- `services/stock-tracker/batch/src/summary.ts`

### フェーズ 2: チャート画像生成

#### ECharts サーバーサイドレンダリング

Lambda 環境（Node.js）で ECharts を使ってチャート画像を生成する。

必要なパッケージ（要脆弱性確認）:
- `echarts` （既に batch の依存関係の有無を確認する）
- `@napi-rs/canvas` または `canvas`（Node.js Canvas API）

生成フロー:
```
1. 過去 50 日分の OHLC データを ECharts オプション形式に変換
2. ECharts の SSR API でチャートを SVG または PNG に変換
3. Base64 エンコードして AiAnalysisInput に含める
```

注意点:
- Lambda のデプロイパッケージサイズへの影響を確認する
- native addon（canvas 等）は Lambda のランタイムアーキテクチャに合わせたビルドが必要

代替案（canvas が困難な場合）:
- SVG 形式での出力（ECharts は canvas 不要で SVG を出力可能）
- OpenAI に SVG テキストをテキストとして渡す方式（画像ではなく構造化データとして）

影響ファイル:
- `services/stock-tracker/batch/src/lib/chart-renderer.ts`（新規）
- `services/stock-tracker/batch/package.json`（依存関係追加）

#### AiAnalysisInput への画像追加

```
chartImageBase64?: string  // 省略可能（生成失敗時は渡さない）
```

影響ファイル:
- `services/stock-tracker/batch/src/lib/openai-client.ts`

#### OpenAI API 呼び出し形式の変更

現在: `client.responses.create` でテキストプロンプトのみ
変更後: vision 対応の messages 形式

```
messages: [
  {
    role: 'user',
    content: [
      { type: 'text', text: createPrompt(input) },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }  // 画像がある場合
    ]
  }
]
```

影響ファイル:
- `services/stock-tracker/batch/src/lib/openai-client.ts`

### フェーズ 3: プロンプトの改善

過去 50 日分のデータをプロンプトに追加する。

概念的なプロンプト追加内容:

```
【過去50日間の価格推移】
日付, 始値, 高値, 安値, 終値
2025-01-15, 880, 890, 875, 885
...
```

影響ファイル:
- `services/stock-tracker/batch/src/lib/openai-client.ts`

## タスク

### フェーズ 1: 過去データ取得

- [ ] T001: `DailySummaryRepository` インターフェースに `getRecentByTicker` メソッドを追加する
    - 影響ファイル: `core/src/repositories/daily-summary.repository.interface.ts`
- [ ] T002: `DynamoDBDailySummaryRepository` に `getRecentByTicker` を実装する
    - DynamoDB Query（PK 固定、SK 範囲・降順・Limit）
    - 影響ファイル: `core/src/repositories/dynamodb-daily-summary.repository.ts`
- [ ] T003: `InMemoryDailySummaryRepository` に `getRecentByTicker` を実装する
    - テスト用のインメモリ実装
    - 影響ファイル: `core/src/repositories/in-memory-daily-summary.repository.ts`
- [ ] T004: `AiAnalysisInput` に `historicalData` フィールドを追加する
    - 影響ファイル: `batch/src/lib/openai-client.ts`
- [ ] T005: `createPrompt` を過去データ対応に更新する
    - 影響ファイル: `batch/src/lib/openai-client.ts`
- [ ] T006: `summary.ts` の AI 解析呼び出し前に `getRecentByTicker` を使用して過去 50 件を取得する
    - `HandlerDependencies` に `getRecentByTickerFn` を追加（テスト可能な形で注入）
    - 取得失敗時は空配列で継続（graceful degradation）
    - 影響ファイル: `batch/src/summary.ts`
- [ ] T007: コアリポジトリのテストを追加・更新する
    - 影響ファイル: `core/tests/unit/repositories/dynamodb-daily-summary.repository.test.ts`
- [ ] T008: バッチのテストを追加・更新する
    - 過去データ取得シナリオを追加
    - 取得失敗時の graceful degradation シナリオを追加
    - 影響ファイル: `batch/tests/unit/summary.test.ts`

### フェーズ 2: チャート画像生成

- [ ] T009: 使用する canvas ライブラリの選定とセキュリティ確認（`gh-advisory-database` で確認）
- [ ] T010: `chart-renderer.ts` を新規作成する（ECharts + canvas によるチャート画像生成）
    - OHLC データを ECharts ローソク足オプションに変換
    - 画像生成に失敗した場合は `undefined` を返す（エラーをスローしない）
    - 影響ファイル: `batch/src/lib/chart-renderer.ts`（新規）
- [ ] T011: `AiAnalysisInput` に `chartImageBase64?: string` を追加する
    - 影響ファイル: `batch/src/lib/openai-client.ts`
- [ ] T012: OpenAI 呼び出しを vision 対応の messages 形式に変更する
    - 画像がある場合はマルチモーダル入力（テキスト + 画像）
    - 画像がない場合は従来のテキスト入力にフォールバック
    - 使用モデルを vision 対応モデルに変更する
    - 影響ファイル: `batch/src/lib/openai-client.ts`
- [ ] T013: `summary.ts` でチャート画像生成を呼び出す
    - AI 解析前に `getChartDataFn` で取得した 50 件のデータを使用して画像生成
    - 影響ファイル: `batch/src/summary.ts`
- [ ] T014: `chart-renderer.ts` のユニットテストを追加する
    - 影響ファイル: `batch/tests/unit/lib/chart-renderer.test.ts`（新規）
- [ ] T015: Lambda のデプロイ設定を必要に応じて更新する（メモリ・タイムアウト）
    - 影響ファイル: `infra/stock-tracker/` 配下の CDK コード（確認・必要時のみ変更）

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- テスト戦略: `docs/development/testing.md`
- アーキテクチャ方針: `docs/development/architecture.md`
- Stock Tracker サービス: `docs/services/stock-tracker/`

## 影響範囲

| ファイル | 変更種別 |
|--------|---------|
| `services/stock-tracker/core/src/repositories/daily-summary.repository.interface.ts` | 変更 |
| `services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts` | 変更 |
| `services/stock-tracker/core/src/repositories/in-memory-daily-summary.repository.ts` | 変更 |
| `services/stock-tracker/batch/src/lib/openai-client.ts` | 変更 |
| `services/stock-tracker/batch/src/lib/chart-renderer.ts` | 新規作成 |
| `services/stock-tracker/batch/src/summary.ts` | 変更 |
| `services/stock-tracker/batch/package.json` | 変更（依存追加） |
| `services/stock-tracker/core/tests/unit/repositories/dynamodb-daily-summary.repository.test.ts` | 変更 |
| `services/stock-tracker/batch/tests/unit/summary.test.ts` | 変更 |
| `services/stock-tracker/batch/tests/unit/lib/chart-renderer.test.ts` | 新規作成 |

## 備考・未決定事項

- **モデルの選定**: `gpt-5-mini` が vision 対応かどうかを確認する。未対応であれば `gpt-4o` や `gpt-4o-mini` への変更を検討する
- **Lambda canvas 対応**: `@napi-rs/canvas` は Linux x86_64 向けのネイティブバイナリを含む。Lambda のデプロイパッケージサイズ制限（250MB）に注意する。サイズが問題になる場合は ECharts の SVG 出力をテキストとして AI に渡す方式を代替として採用する
- **過去データの取得タイミング**: 静的解析（チャートデータ取得）と AI 解析の順序は既存の処理フローを維持する。過去データは AI 解析の直前に取得する
- **コスト**: 画像付きの AI リクエストは通常よりコストが高くなる可能性がある。ティッカー数によってはコスト増加が顕著になることを事前に確認する

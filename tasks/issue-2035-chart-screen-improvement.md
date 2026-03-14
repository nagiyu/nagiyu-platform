# チャート画面改善

## 概要

Stock Tracker のチャート画面（トップ画面）に、選択中の取引所・ティッカーに対応した **サマリー**・**保有株式**・**アラート** の情報を表示する。

現状、これらの情報はそれぞれ別ページ（`/summaries`、`/holdings`、`/alerts`）に分散しており、チャート画面には表示されていない。API・データ構造・個別ページの実装はすでに存在するため、チャート画面への統合が主な作業となる。

## 関連情報

- Issue: #2035
- タスクタイプ: サービスタスク（stock-tracker / web）
- ラベル: stock-tracker
- マイルストーン: v7.0.0

## 調査結果

### 現状のチャート画面

**場所:** `services/stock-tracker/web/src/components/HomePageClient.tsx`

現在の画面要素:
- 取引所セレクタ（`/api/exchanges` から取得）
- ティッカーセレクタ（取引所選択後に `/api/tickers?exchangeId={id}` から取得）
- 時間軸セレクタ（1分足 / 5分足 / 1時間足 / 日足）
- 本数セレクタ（10 / 30 / 50 / 100本）
- ローソク足チャート（`StockChart` コンポーネント）

`StockChart` は `holdingPrice`（保有平均価格ライン）と `alertLines`（アラートしきい値ライン）をすでにサポートしているが、現状はデータを渡していない。

### 既存 API（参考）

| API | エンドポイント | 備考 |
|-----|--------------|------|
| サマリー | `GET /api/summaries` | 全ティッカー分を返す |
| 保有株式 | `GET /api/holdings` | 全保有分を返す |
| アラート | `GET /api/alerts` | 全アラート分を返す |

いずれも全件返却のため、チャート画面での利用には効率が悪い（クライアント負担・無駄な通信）。**ティッカーID を受け取り単件・絞り込み結果を返す新 API を追加する方針とする**（後述）。

### 既存の型定義

- `TickerSummary` — サマリー情報（OHLCV、パターン数、アラート数、保有情報を含む）
- `HoldingResponse` — 保有株式情報（数量、平均取得価格、通貨）
- `AlertResponse` — アラート情報（モード、条件、有効/無効）
- `AlertLine` — チャートオーバーレイ用ラインデータ

## 要件

### 機能要件

- **FR1**: 取引所とティッカーが選択された状態のとき、該当ティッカーの最新サマリーをチャート画面に表示する
    - 表示項目: 終値（close）、始値（open）、高値（high）、安値（low）、出来高（volume）、最終更新日時
    - 買いパターン数・売りパターン数も表示する
    - AIアナリシス結果がある場合は表示する
- **FR2**: 取引所とティッカーが選択された状態のとき、ユーザーの保有株式情報をチャート画面に表示する
    - 表示項目: 保有数量、平均取得価格、通貨
    - 保有が存在しない場合は「保有なし」などの状態を表示する
    - 保有平均価格ラインをチャートにオーバーレイ表示する（`StockChart` の `holdingPrice` prop を活用）
- **FR3**: 取引所とティッカーが選択された状態のとき、該当ティッカーのアラート一覧をチャート画面に表示する
    - 表示項目: アラートごとの詳細情報（モード、条件、有効/無効、種別）を一覧表示する
    - アラート件数が多く画面が煩雑になる場合はモーダルで詳細を表示する構成にしてもよい
    - アラートのしきい値ラインをチャートにオーバーレイ表示する（`StockChart` の `alertLines` prop を活用）
- **FR4**: 取引所またはティッカーが未選択の場合、FR1〜FR3 の情報表示エリアは表示しない（または非活性状態にする）

### 非機能要件

- **NFR1**: テストカバレッジ 80% 以上を維持する（ビジネスロジックを重点的にテスト）
- **NFR2**: TypeScript strict mode を維持する
- **NFR3**: スマホファースト（Material-UI のグリッドシステムを活用したレスポンシブ対応）
- **NFR4**: データ取得中はローディング表示を行い、エラー時はエラーメッセージを表示する
- **NFR5**: エラーメッセージは日本語で `ERROR_MESSAGES` 定数として定義する

## 実装のヒント

### データ取得の方針

- 既存の全件取得 API（`/api/summaries`、`/api/holdings`、`/api/alerts`）をチャート画面で直接利用するのは非効率のため、**ティッカーIDを受け取り該当データを返す API を新規追加する**
- 追加する API（案）:
    - `GET /api/summaries/[tickerId]` — 指定ティッカーの最新サマリーを返す
    - `GET /api/holdings/[tickerId]` — 指定ティッカーの保有株式を返す（未保有なら 404 または空レスポンス）
    - `GET /api/alerts?tickerId={tickerId}` — 指定ティッカーのアラート一覧を返す
- ティッカー選択時（`ticker` state 変化時）に `useEffect` でこれらの API を並行取得する
- `HomePageClient` でデータ取得を行い、表示コンポーネントに props として渡す

### コンポーネント設計

- サマリー表示、保有株式表示、アラート表示はそれぞれ独立した表示専用コンポーネントに分離する
- ビジネスロジック（フィルタ処理・アラートライン計算など）は `lib/` 配下に切り出す
- `StockChart` コンポーネント自体は変更しない（既存の `holdingPrice` と `alertLines` を活用）

### アラートライン計算

- `services/stock-tracker/web/src/lib/chart-overlay-lines.ts` にアラートライン計算ロジックが既存のため活用する

## タスク

- [x] T001: 調査・実装計画の確認
    - `HomePageClient.tsx`、`StockChart.tsx`、`/api/summaries`、`/api/holdings`、`/api/alerts` の最新実装を確認する
    - 既存の型定義（`TickerSummary`、`HoldingResponse`、`AlertResponse`、`AlertLine`）を把握する
- [x] T002: ティッカーID指定 API の追加
    - `GET /api/summaries/[tickerId]` — 指定ティッカーの最新サマリーを返すルートを新規作成
    - `GET /api/holdings/[tickerId]` — 指定ティッカーの保有株式を返すルートを新規作成
    - `GET /api/alerts` に `tickerId` クエリパラメータによる絞り込みを追加（または `GET /api/alerts/[tickerId]` を新規作成）
    - 各ルートのユニットテストを追加
- [x] T003: サマリー表示コンポーネントの作成
    - `services/stock-tracker/web/src/components/TickerSummaryCard.tsx` を新規作成
    - props: `summary: TickerSummary | null`, `loading: boolean`, `error: string`
    - 取引所・ティッカー未選択時は非表示
- [x] T004: 保有株式表示コンポーネントの作成
    - `services/stock-tracker/web/src/components/HoldingCard.tsx` を新規作成
    - props: `holding: HoldingResponse | null`, `loading: boolean`, `error: string`
    - 保有なしの場合はその旨を表示
- [x] T005: アラート一覧表示コンポーネントの作成
    - `services/stock-tracker/web/src/components/TickerAlertListCard.tsx` を新規作成
    - props: `alerts: AlertResponse[]`, `loading: boolean`, `error: string`
    - アラートごとの詳細情報（モード、条件、有効/無効）を一覧表示する
    - アラート件数が多い場合はモーダルで詳細表示する構成にしてもよい
- [x] T006: `HomePageClient` へのデータ取得ロジック追加
    - ティッカー選択時に T002 で追加した API を並行取得する
    - `holdingPrice` と `alertLines` を `StockChart` へ渡す
- [x] T007: チャート画面レイアウトの更新
    - `HomePageClient.tsx` に T003〜T005 のコンポーネントを組み込む
    - 取引所・ティッカーが選択済みの場合のみ表示する
    - Material-UI のグリッドを使用してレスポンシブ対応
- [x] T008: ユニットテストの追加・更新
    - T003〜T005 の各コンポーネントのユニットテストを `tests/unit/` 配下に追加
    - T006 のデータ取得ロジックのユニットテストを追加
    - カバレッジ 80% 以上を維持
- [x] T009: 動作確認
    - 取引所・ティッカー選択時にサマリー・保有株式・アラートが表示されること
    - 取引所・ティッカー未選択時に表示されないこと
    - チャートに保有価格ライン・アラートラインがオーバーレイ表示されること
    - ローディング・エラー状態の表示が正しいこと
    - スマホ表示で崩れないこと

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [アーキテクチャ方針](../docs/development/architecture.md)
- [テスト戦略](../docs/development/testing.md)
- [共通ライブラリ設計](../docs/development/shared-libraries.md)

## 備考・未決定事項

- サマリー・保有株式・アラートの表示順序・レイアウト（横並び / 縦並び）は実装時に判断する
- アラート詳細の表示形式（インライン一覧 or モーダル）は実装時に画面の煩雑さを見ながら判断する
- 保有株式・アラートの作成・編集・削除は本 Issue の対象外とする（既存の各ページへのリンク追加は許容）

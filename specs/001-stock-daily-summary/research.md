# 調査結果: Stock Tracker 日次サマリー表示

**ブランチ**: `001-stock-daily-summary` | **日付**: 2026-02-27
**対応する計画**: [plan.md](./plan.md)

---

## 1. DailySummary の DynamoDB キー設計

### 決定事項
- **PK**: `SUMMARY#{TickerID}`（例: `SUMMARY#NSDQ:AAPL`）
- **SK**: `DATE#{Date}`（例: `DATE#2024-01-15`）
- **Type**: `DailySummary`
- **GSI4PK**: `{ExchangeID}`（例: `NASDAQ`）
- **GSI4SK**: `DATE#{Date}#{TickerID}`（例: `DATE#2024-01-15#NSDQ:AAPL`）

### 根拠
- **冪等性（FR-005）**: PK+SK = `SUMMARY#{TickerID}` + `DATE#{Date}` により、同一ティッカー・同一日付への `PutItem` は自然に上書き（Upsert）になる
- **取引所ごとの一覧取得（FR-007）**: GSI4 (ExchangeSummaryIndex) で `GSI4PK = {ExchangeID}` を条件に Query を実行すれば取引所別サマリーが効率的に取得できる
- **日付ソート**: GSI4SK に `DATE#` プレフィックスを付けることで、日付降順ソートが可能（最新サマリーを先頭に）
- **既存パターンとの一貫性**: GSI3 (ExchangeTickerIndex) が `GSI3PK = {ExchangeID}`、`GSI3SK = TICKER#{TickerID}` というパターンを使用しており、同様の命名規則を採用

### 検討した代替案と却下理由
| 代替案 | 却下理由 |
|--------|---------|
| PK: `EXCHANGE#{ExchangeID}`, SK: `TICKER#{TickerID}#DATE#{Date}` | 1ティッカーの履歴取得に Scan が必要になる |
| GSI なし、Scan + フィルタ | 大量データ時のコスト・レイテンシが増大する。取引所単位のまとまったアクセスパターンに GSI が適切 |
| GSI3 の再利用 | GSI3 はティッカー用途に特化しており、サマリーと混在させると型安全性が損なわれる |

---

## 2. TradingView `getChartData` の日次サマリー取得方法

### 決定事項
- `getChartData(tickerId, 'D', { count: 1, session: 'extended' })` で当日または直近の日次 OHLCV を取得する
- 返却される `ChartDataPoint[0]` の `{ open, high, low, close, time }` をそのまま DailySummary に格納する
- `DailySummary.Date` は `ChartDataPoint.time`（ミリ秒）から UTC 日付（`YYYY-MM-DD`）に変換して設定する

### 根拠
- `getChartData` は既存の `tradingview-client.ts` に実装済み。追加実装不要
- タイムフレーム `'D'` は `SUPPORTED_TIMEFRAMES` に含まれており、既存バリデーションを通過する
- `count: 1` で最新の1日足のみ取得することでレスポンスを最小化できる
- `session: 'extended'` を使用することで時間外取引データを含む OHLCV を取得できる。`tradingview-client.ts` のデフォルトも `'extended'` であり、取引所の終了時刻も時間外取引の終了タイミングで設定されているため、整合性が保たれる
- `ChartDataPoint.time` はミリ秒 Unix タイムスタンプであり、`new Date(time).toISOString().split('T')[0]` で `YYYY-MM-DD` 変換が可能

### 検討した代替案と却下理由
| 代替案 | 却下理由 |
|--------|---------|
| `count: 2` で前日データも取得 | サマリー生成時は当日データのみで十分。ストレージ節約と処理シンプル化のため不要 |
| `session: 'regular'` | 取引所の終了時刻が時間外取引の終了タイミングで設定されているため、`regular` では期待通りのデータが取得できない |
| TradingView 以外の API | 既存インフラが TradingView に依存しており、新規 API 統合のコストが高い |

---

## 3. 取引時間終了の検出方法（バッチ処理）

### 決定事項
- `!isTradingHours(exchange, now)` で取引時間外かどうかを判定する
- 上記の条件を満たした取引所に対してサマリー生成を実行する
- サマリー保存は **Upsert（上書き）** であるため、同日に複数回実行されても問題ない（FR-005, SC-004）

### 根拠
- `isTradingHours` は既存の `trading-hours-checker.ts` に実装済み。タイムゾーン変換（date-fns-tz）・曜日チェックを含む
- バッチは1時間間隔で実行されるため、取引終了後の最初の実行（最大1時間以内）でサマリーが生成される（SC-001 充足）
- Upsert による冪等性により、複数回実行されても最新データで上書きされる。データ重複は発生しない

### 検討した代替案と却下理由
| 代替案 | 却下理由 |
|--------|---------|
| 取引終了時刻の1時間前後だけ処理する | 判定ロジックが複雑になる。Upsert で冪等性が保証されているため不要 |
| 当日のサマリーが既に存在する場合はスキップ | 再実行による最新データへの更新が阻害される。FR-005 は「重複保存しない（上書き更新）」であり、Upsert がより適切 |
| EventBridge のスケジュールを取引所ごとの終了時刻に合わせる | 取引所を追加するたびに CDK 変更が必要になり、運用コストが増大 |

---

## 4. 新規バッチの命名と構成

### 決定事項
- ファイル名: `services/stock-tracker/batch/src/summary.ts`
- Lambda ハンドラーのエクスポート名: `handler`（既存バッチと同様）
- EventBridge スケジュール: `rate(1 hour)`（既存 hourly.ts と同じ間隔、別ルール）
- EventBridge ルール名: `stock-tracker-batch-summary-{environment}`

### 根拠
- FR-001 で既存 hourly.ts（アラート用）とは完全に独立した別バッチとすることが MUST
- 既存バッチ（minute.ts, hourly.ts, daily.ts）のパターンに準じることでコードの一貫性を確保
- Lambda スタック・EventBridge スタックはすでに3バッチを管理しており、4つ目を追加する拡張パターンは既存設計に合致

### 検討した代替案と却下理由
| 代替案 | 却下理由 |
|--------|---------|
| `hourly-summary.ts` という名前 | `hourly` は既存アラートバッチを連想させるため混乱を招く |
| 既存 `hourly.ts` に統合 | FR-001 に明示的に違反（MUST NOT） |
| `daily.ts` の既存バッチに追加 | daily.ts は日次0時UTCに実行されるクリーンアップ用途。取引時間終了後の1時間間隔実行とは目的・タイミングが異なる |

---

## 5. Web API・ページ設計

### 決定事項
- **API エンドポイント**: `GET /api/summaries`
- **クエリパラメータ**: `?date={YYYY-MM-DD}`（省略時は各取引所の最新保存済みサマリーを返す。当日分が未生成でも直近データを返し、空表示を避ける）
- **レスポンス**: 取引所ごとのサマリーリスト（既存 `/api/exchanges` と類似の形式）
- **ページパス**: `/summaries`
- **認証**: 既存パターン（`withAuth(getSession, 'stocks:read', ...)`）を使用

### 根拠
- 既存 API（`/api/exchanges`、`/api/tickers`）と一貫した命名・レスポンス形式
- `?date=` パラメータにより過去サマリーの閲覧も将来的に可能（今回は実装オプション）
- `withAuth` による認証は既存すべての API で使用されており、一貫性を維持できる
- サマリーは「取引所ごとのグループ化表示（FR-007）」であり、フロントエンドでグループ化するかバックエンドで整形するかは実装時判断。今回はバックエンドで整形済みのレスポンスを返す

### 検討した代替案と却下理由
| 代替案 | 却下理由 |
|--------|---------|
| `/api/exchanges/{id}/summaries` | 取引所ごとに複数リクエストが必要になりパフォーマンスが悪化 |
| `/api/daily-summaries` | 既存の `tickers`、`exchanges` 等の命名が複数形単語であるため `summaries` が一貫性がある |
| GraphQL | 既存 API が REST であり、新規技術導入は憲法の「最小限のルール」原則に反する |

---

## 6. InMemory リポジトリのテスト戦略

### 決定事項
- `InMemoryDailySummaryRepository` を `core` に実装し、web の E2E テスト・unit テストで使用する
- 既存の `InMemorySingleTableStore`（`@nagiyu/aws`）を共有ストアとして利用する
- 既存の `repository-factory.ts` に `createDailySummaryRepository()` 関数を追加する

### 根拠
- 既存のすべてのリポジトリ（Alert, Holding, Ticker, Exchange, Watchlist）が同一パターンを使用
- `InMemorySingleTableStore` はテーブルレベルの分離を提供し、E2E テスト間の状態共有リスクを排除
- `USE_IN_MEMORY_REPOSITORY=true` 環境変数による切り替えは既存 `.env.test` で設定済み

---

## 7. DailySummary の日付フォーマットとタイムゾーン

### 決定事項
- `DailySummary.Date` は **UTC 基準の `YYYY-MM-DD` 文字列** で格納する
- ただし、Date の値は `ChartDataPoint.time`（TradingView が返す日次バーの開始タイムスタンプ）から導出し、現在時刻ベースの日付計算は行わない

### 根拠
- TradingView の日次バーは取引所のローカルタイムゾーンで区切られているが、`ChartDataPoint.time` はタイムスタンプとして返される
- サーバー現在時刻から日付を算出すると、タイムゾーンの境界をまたいだ場合に誤った日付になる可能性がある
- TradingView API が返す日次バーのタイムスタンプを日付のソースとすることで、取引所固有の日付境界に依存した誤りを防ぐ

---

## 8. エラーハンドリング方針（バッチ）

### 決定事項
- ティッカーレベルのエラー: ログ記録してスキップ、次のティッカーへ継続（FR-010, SC-003）
- 取引所レベルのエラー: ログ記録してスキップ、次の取引所へ継続
- TradingView API エラー: ログ記録してスキップ（spec のエッジケースに準拠）
- 全体エラー（DynamoDB 接続失敗等）: エラーログ記録後に 500 レスポンスで終了

### 根拠
- 既存 `hourly.ts`・`minute.ts` のエラーハンドリングパターンと一致
- SC-003: 「一部のティッカーでエラーが発生しても、エラー率100%でない限り他のティッカーのサマリーを保存し続ける」を実現
- `withRetry` ユーティリティは既存 batch/src/lib/retry.ts に実装済みであり活用可能

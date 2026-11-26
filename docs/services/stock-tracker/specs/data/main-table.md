---
sources:
  - infra/stock-tracker/lib/dynamodb-stack.ts
  - services/stock-tracker/core/src/mappers/alert.mapper.ts
  - services/stock-tracker/core/src/mappers/holding.mapper.ts
  - services/stock-tracker/core/src/mappers/exchange.mapper.ts
  - services/stock-tracker/core/src/mappers/ticker.mapper.ts
  - services/stock-tracker/core/src/mappers/daily-summary.mapper.ts
  - services/stock-tracker/core/src/mappers/exchange-summary-index.ts
  - services/stock-tracker/core/src/mappers/forecast.mapper.ts
  - services/stock-tracker/core/src/mappers/market-forecast.mapper.ts
  - services/stock-tracker/core/src/mappers/model-snapshot.mapper.ts
  - services/stock-tracker/core/src/mappers/performance-daily.mapper.ts
  - services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-forecast.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-model-snapshot.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-performance-daily.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-exchange.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-ticker.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-holding.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-daily-summary.repository.ts
  - services/stock-tracker/core/src/repositories/dynamodb-market-forecast.repository.ts
  - services/stock-tracker/core/src/repositories/query-exchange-index.ts
  - services/stock-tracker/batch/src/temporary-alert-expiry.ts
  - infra/dev-sync/lib/manifest.ts
sources_hash: 64ac18d424a4d5621979df3793b60109fc5701074f6db644dde7afb40d1e0738
---

# Stock Tracker のテーブル

Stock Tracker が持つ、1 つの DynamoDB のテーブル。アラート、保有株式、取引所、ティッカー、日次サマリー、確度とその採点・重み・成績の集計を、同じテーブルに種類ごとのキーで保存する。Web とバッチが読み書きする。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-stock-tracker-main-{env}` (`{env}` は `dev` か `prod`)。スタックは `NagiyuStockTrackerDynamoDB{Env}` |
| 課金 | オンデマンド |
| バックアップ | ポイントインタイムリカバリを有効にする (保持 35 日) |
| 有効期限 (TTL) | 属性 `TTL` (エポック秒) を使う。付くのは、失効した一時通知のアラートだけ (下の「項目」) |
| 暗号化 | AWS 管理のキー |
| 削除したとき | prod は残す (`RETAIN`)。dev はスタックと一緒に消す (`DESTROY`) |

`Type` 属性に、項目の種類 (`Alert`、`Holding`、`Exchange`、`Ticker`、`DailySummary`、`Forecast`、`MarketForecast`、`ModelSnapshot`、`PerformanceDaily`) が入る。取引所とティッカーの全件取得は、`Type` で絞るテーブル全体の `Scan` で行う。ほかの取得は、キーとインデックスで行う。

## キー設計

### 項目ごとのキー

| 項目の種類 | PK | SK | インデックスのキー |
|---|---|---|---|
| Alert (アラート) | `USER#{userId}` | `ALERT#{alertId}` | UserIndex: `{userId}` / `Alert#{alertId}`。AlertIndex: `ALERT#{frequency}` / `{userId}#{alertId}` |
| Holding (保有株式) | `USER#{userId}` | `HOLDING#{tickerId}` | UserIndex: `{userId}` / `Holding#{tickerId}` |
| Exchange (取引所) | `EXCHANGE#{exchangeId}` | `METADATA` | ExchangeTickerIndex: `EXCHANGES` / `EXCHANGE#{exchangeId}` |
| Ticker (ティッカー) | `TICKER#{tickerId}` | `METADATA` | ExchangeTickerIndex: `{exchangeId}` / `TICKER#{tickerId}` |
| DailySummary (日次サマリー) | `SUMMARY#{tickerId}` | `DATE#{date}` | ExchangeSummaryIndex: `{exchangeId}` / `DATE#{date}#{tickerId}` |
| Forecast (銘柄 × 日の確度) | `FORECAST#{tickerId}` | `DATE#{date}` | ExchangeSummaryIndex: `FORECAST#{exchangeId}` / `DATE#{date}#{tickerId}` |
| MarketForecast (市場 × 日の確度) | `MARKETFORECAST#{market}` | `DATE#{date}` | なし |
| ModelSnapshot (重みのスナップショット) | `MODEL#{question}#{market}` | `DATE#{date}` | なし |
| PerformanceDaily (予測日ごとの成績の集計) | `PERF#{question}#{market}` | `DATE#{date}` | なし |

- `{date}` は `YYYY-MM-DD`、`{frequency}` は `MINUTE_LEVEL` か `HOURLY_LEVEL`、`{market}` は `JP` か `US`、`{question}` は `DIR`、`VOL`、`MKT` ([確度](../term/forecast.md)、[問い](../term/question.md))
- ユーザーごとの項目 (Alert と Holding) は、同じ PK (`USER#{userId}`) に並ぶ。SK の接頭辞 (`ALERT#`、`HOLDING#`) で区別する
- インデックスのキーの属性名は、`GSI1PK`/`GSI1SK` から `GSI4PK`/`GSI4SK`

### インデックス

4 つとも、項目のすべての属性を射影する。

| インデックス | キー | 使い道 |
|---|---|---|
| `UserIndex` (GSI1) | `GSI1PK` / `GSI1SK` | ユーザーのアラート一覧 (SK が `Alert#` で始まるもの。TTL の付いたものを除く) と、ユーザーの保有株式一覧 (SK が `Holding#` で始まるもの) |
| `AlertIndex` (GSI2) | `GSI2PK` / `GSI2SK` | バッチが、頻度ごとに全ユーザーのアラートを読む。購読の点検と、一時アラートの失効の候補の取得にも使う |
| `ExchangeTickerIndex` (GSI3) | `GSI3PK` / `GSI3SK` | 取引所ごとのティッカー一覧。取引所の一覧にも使う (`GSI3PK` が `EXCHANGES` の項目) |
| `ExchangeSummaryIndex` (GSI4) | `GSI4PK` / `GSI4SK` | 取引所ごとの日次サマリーと確度を、日付の範囲や最新日で読む |

- 取引所の項目は、ティッカーと同じ `ExchangeTickerIndex` に、パーティションの値を固定の `EXCHANGES` にして載る。ティッカー側のパーティションは取引所 ID なので、値が衝突しない前提で成り立つ
- 日次サマリーと Forecast は、同じ `ExchangeSummaryIndex` を共有する。Forecast のパーティションの値だけに `FORECAST#` を付けて、取引所単位の取得に Forecast が混ざらないようにする。ソートキーの形式は同じで、日付の昇順、同日内はティッカー ID の昇順に並ぶ
- ソートキーの範囲の上限は、`DATE#{date}#~` のように、末尾に `~` (0x7E) を付けて作る。その日のすべての項目を範囲に含めるため。`~` より大きいコードポイントを含むティッカー ID は、範囲から漏れる。今のティッカー ID の形式 (`NSDQ:AAPL`) では起きない
- MarketForecast、ModelSnapshot、PerformanceDaily はインデックスを持たない。パーティションが市場 (と問い) で決まるので、PK の指定と SK の範囲で読める。ModelSnapshot の直前の版は、SK の降順で 1 件だけ読む
- 取引所の一覧の読み方は 2 通りある。`getAll` は `Type` で絞る `Scan` で、インデックスのキーの有無によらず全件を返す。`getAllIndexed` は `ExchangeTickerIndex` の Query で、キーを持たない取引所を返さない。Query が 0 件のときだけ `Scan` に切り替える。取引所の項目は、更新のたびにインデックスのキーを付け直す。一覧の表示のように、欠けてよい読み取りだけが `getAllIndexed` を使う

## 項目

作成日時と更新日時 (`CreatedAt`、`UpdatedAt`) は、Unix ミリ秒の数値。どの項目の種類にもある (ModelSnapshot と PerformanceDaily は `CreatedAt` だけ)。

### Alert

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `AlertID`、`UserID`、`TickerID`、`ExchangeID` | 文字列 | 作成後に変えられない |
| `Mode` | 文字列 | `Buy` か `Sell` |
| `Frequency` | 文字列 | `MINUTE_LEVEL` か `HOURLY_LEVEL`。`GSI2PK` の元 |
| `Enabled` | 真偽値 | 有効か |
| `ConditionList` | リスト | 条件。1 件以上 |
| `LogicalOperator` | 文字列 | `AND` か `OR`。ないこともある |
| `CustomMessage` | 文字列 | 通知の文面。空でないときだけ保存する |
| `Subscription` | マップ | Web Push の購読 (`endpoint`、`keys.p256dh`、`keys.auth`)。購読はアラートに埋め込んで持つ |
| `Temporary` | 真偽値 | [一時通知](../term/temporary-alert.md)のときだけ `true` で保存する |
| `TemporaryExpireDate` | 文字列 | 一時通知の期限。一時通知のときだけ |
| `TTL` | 数値 | 期限が過ぎた一時通知と、ユーザーが手動で無効化した一時通知に、[一時アラート失効バッチ](../batch/temporary-alert-expiry.md)が、無効化と同時に付ける。バッチが処理した時刻の 7 日後のエポック秒 |

- `TTL` の付いたアラートは、ユーザーのアラート一覧に出ない。DynamoDB の TTL による物理削除は、期限から最大 48 時間遅れうるため。ユーザーが手動で無効化しただけのアラート (`TTL` なし) は一覧に残る
- 購読の保存属性は `Subscription`。小文字始まりの `subscription` と、平坦な `SubscriptionEndpoint`、`SubscriptionKeysP256dh`、`SubscriptionKeysAuth` の属性は、コードが読むだけで書かない。これらで残っている項目も読める

### Holding

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `UserID`、`TickerID`、`ExchangeID` | 文字列 | 作成後に変えられない |
| `Quantity` | 数値 | 保有数量 |
| `AveragePrice` | 数値 | 平均取得価格 |
| `Currency` | 文字列 | 通貨 |

### Exchange

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `ExchangeID` | 文字列 | 作成後に変えられない |
| `Name` | 文字列 | 取引所名 |
| `Key` | 文字列 | TradingView 用のキー。ティッカー ID の生成に使う。作成後に変えられない |
| `Timezone` | 文字列 | IANA 形式のタイムゾーン |
| `Start`、`End` | 文字列 | 取引時間 (`HH:MM`)。時間外取引を含む |
| `PriceSource` | 文字列 | `tradingview` か `finnhub` ([価格の取得元](../term/price-source.md))。属性がないか、ほかの値のときは `tradingview` として読む |
| `Market` | 文字列 | `JP` か `US`。省略できる。属性がないか、ほかの値のときは未設定として読み、未設定の取引所は確度の算出の対象外 |

### Ticker

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `TickerID`、`ExchangeID` | 文字列 | 作成後に変えられない ([ティッカー ID](../term/ticker-id.md)) |
| `Symbol` | 文字列 | シンボル |
| `Name` | 文字列 | 銘柄名 |

### DailySummary

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `TickerID`、`ExchangeID`、`Date` | 文字列 | 作成後に変えられない |
| `Open`、`High`、`Low`、`Close` | 数値 | 日足 |
| `Volume` | 数値 | 出来高。ないこともある |
| `PatternResults`、`BuyPatternCount`、`SellPatternCount` | マップ、数値 | 足から決まるパターンの判定。ないこともある |

DailySummary は、その日の足と、足から決まる判定だけを持つ ([日次サマリー](../term/daily-summary.md))。

### Forecast

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `TickerID`、`ExchangeID`、`Market`、`Date` | 文字列 | `Market` は取引所の市場 |
| `AxisValues` | マップ | 軸 ID をキー、軸の値 (数値か点灯の真偽値) を値にする ([判断軸](../term/axis.md)) |
| `Normal` | マップ | 算出に使った平常 (`range`、`volume`) |
| `Probabilities` | マップ | 問い (`DIR`、`VOL`) ごとの確度。確率、基準値、中立帯、傾き、寄与、件数不足の軸を持つ |
| `ModelVersion` | 文字列 | 算出ロジックの版 |
| `Source` | 文字列 | `REPLAY` (リプレイで作った) か `LIVE` (稼働後に作った) |
| `BackfilledAxes` | マップ | 後から値を追記した軸と、追記した日 |
| `Outcome` | マップ | 翌営業日の答え合わせ。翌営業日の足が届いてから追記する |

### MarketForecast

Forecast の市場版。`Market`、`Date`、`AxisValues`、`Probabilities` (問いは `MKT` だけ)、`ModelVersion`、`Source`、`BackfilledAxes`、`Outcome` を持つ。`AxisValues` は市場レベルの軸の値で、数値だけを持つ。

### ModelSnapshot

その日の算出に使った重みなど。

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `Question`、`Market`、`Date` | 文字列 | キーの元 |
| `ModelVersion` | 文字列 | 算出ロジックの版 |
| `Alpha` | 数値 | 正則化の強さ |
| `Weights` | マップ | 軸 ID ごとの重み |
| `Standardization` | マップ | 数値の軸の平均と標準偏差 |
| `Baseline` | 数値 | 基準値 |
| `NeutralBand`、`BandHistory` | マップ、リスト | 中立帯と、確率帯ごとの実績 |
| `AxisStats` | マップ | 軸ごとの成績 |
| `TrainingSize`、`DistinctTrainingDates` | 数値 | 学習に使った行数と、異なる日付の数 |

### PerformanceDaily

| 属性 | 型 | 意味・制約 |
|---|---|---|
| `Question`、`Market`、`Date` | 文字列 | `Date` は予測日 |
| `EvaluatedCount`、`HitCount` | 数値 | 採点した件数と、的中した件数 |
| `AxisStats` | マップ | 軸ごとの件数と的中数 |
| `ProbabilityBands` | リスト | 確率帯ごとの件数、的中数、確率の合計 |

### コードが使っていない属性

テーブルにあるが、コードが読まない、または書かないもの。

| 属性 | 状態 |
|---|---|
| Forecast と MarketForecast の `ModelVersion`、`Source` | バッチが書くが、読んで使うコードはない |
| Forecast と MarketForecast の `BackfilledAxes` | コードは読み書きできる形で持つが、今のバッチは書かない |
| Alert の小文字の `subscription`、平坦な `SubscriptionEndpoint` など | 読むだけで、書かない |
| `Type` | 取引所とティッカーの全件取得の `Scan` だけが使う。ほかの種類では、書くだけで読まない |

## 理由

### アラートの一括取得は、読めないアイテムをスキップする

アラートを一括で取得する経路 (ユーザーの一覧、頻度ごとの一覧) は、項目をエンティティに変換するときに失敗した項目を、警告ログを出してスキップし、読めた項目だけを返す。1 件の壊れた項目が、全件の処理を止めて、ほかのユーザーの通知まで止めるのを避けるため。ログには識別情報 (PK、SK) とエラーの理由だけを出し、購読の endpoint などの個人情報は出さない。

- 変換で出たエラーは、種類を判定せずに、すべてその項目の不正として扱う。エラーの種類を `instanceof` や名前で判定すると、モジュールの解決経路が違う実行環境で判定が食い違い、不正な項目をスキップできずに、バッチ全体が失敗したことがある
- 変換は、取得済みの項目に対する同期的な検証なので、そこから出るエラーは個別の項目の不正に限られる。取得そのものの失敗 (DynamoDB の SDK のエラー) は変換の外で起きるので、スキップせずに伝える。障害は見逃さない
- 購読の点検 (日次バッチ) の取得だけは、スキップしない。壊れた項目を見つけるのが目的で、スキップすると、最も見つけたい項目が件数から消えるため。読めなかった項目は、識別情報と理由を付けて返す。通知を送る側の取得は、スキップのまま変えない

### 確度は、日次サマリーと別の項目に、書き換えずに持つ

確度は、画面に出した値が当たったかを後から検証するための記録なので、当時の値を書き換えずに残す。重みは日々変わり、軸の定義も後から変わりうるため、あとから計算し直しても、当時の値は再現できない。

- DailySummary は、パターンの再判定などで、項目が丸ごと書き直されうる。性質の違う 2 つを同じ項目に置くと、予測を書き換えない保証が難しい。確度は、銘柄 × 日の Forecast と、市場 × 日の MarketForecast という別の項目に置く
- 確度が失敗しても、日次サマリーの保存と表示には影響しない
- 予測時点の値 (軸の値、確率、基準値、中立帯、寄与) は、条件付きの書き込みで一度だけ作る。同じキーがすでにあれば書かず、先に書いた値が残る。再実行しても、先の値は変わらない。ModelSnapshot も同じで、更新と削除の経路を持たない
- 答え合わせ (`Outcome`) は、予測とは別の属性として、あとから追記する。`Outcome` がまだないときだけ書く条件付きの更新で、二重に追記しない
- 軸の値は、軸 ID をキーにしたマップで持つ。軸を足しても、データの移行は要らない。値がない軸は、表示と集計から外れる
- 答え合わせの実績は、DailySummary の足から算出する。答え合わせの期間、閾値、平常の定義を変えた集計を、あとから行える
- PerformanceDaily は、予測日ごとの採点件数の集計で、成績画面の期間集計に使う。同じ日を再計算したときは、無条件に置き換える (冪等な再計算)
- サマリー一覧は、同じ取引所・日付で、DailySummary と Forecast を別々に取得して、結合する

## dev のデータ

| 項目 | dev での作られ方 |
|---|---|
| Exchange、Ticker | 同期バッチ (dev-sync) が、prod のテーブルから毎日写す。PK が `EXCHANGE#` で始まる項目と、`TICKER#` で始まる項目が対象で、prod で消えたものは dev からも消える ([同期の実行環境](../../../dev-sync/specs/resource/batch-runtime.md)のジョブ) |
| DailySummary | dev のサマリーバッチが作る。prod からは写さない |
| Forecast、MarketForecast、ModelSnapshot、PerformanceDaily | dev の確度算出バッチが作る。prod からは写さない |
| Alert、Holding | 写さない。dev で動作確認のために自分で作る |

- どのデータを写し、どれを dev で作り直すかの規則は [dev 環境のデータ](../../../../platform/rules/dev-data.md)にある
- DailySummary と確度を写さないのは、日次サマリーの生成に高コストな処理が残っていないため。dev でも生成して差し支えない
- 確度は乱数を使わず、同じ入力から同じ結果が出る。prod との差は入力のデータの差だけになる
- dev のテーブルにすでにあるサマリーの履歴に、dev のバッチが作るサマリーが続くので、確度の初期値の算出にも、そのまま使える

---
sources:
  - infra/stock-tracker/lib/lambda-stack.ts
  - infra/stock-tracker/lib/eventbridge-stack.ts
  - infra/stock-tracker/lib/policies/batch-runtime-policy.ts
  - infra/stock-tracker/bin/stock-tracker.ts
  - services/stock-tracker/batch/src/summary.ts
  - services/stock-tracker/batch/src/minute.ts
  - services/stock-tracker/batch/src/forecast.ts
sources_hash: 608b4853a0553b224f28723f0f1a3c92d2b58f6bd13cddcb9805eadf6960fa96
---

# バッチの実行環境

アラートの判定、日次サマリーの生成、確度の算出などを動かす 6 つの Lambda 関数と、その実行ロール、関数を起動する EventBridge のルール。関数はすべて同じ ECR のイメージから、起動するハンドラーだけを変えて作る。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-stock-tracker-batch-minute-{env}` | Lambda 関数 (ECR イメージ) | [分次バッチ](../batch/minute.md) |
| `nagiyu-stock-tracker-batch-hourly-{env}` | Lambda 関数 (ECR イメージ) | [時次バッチ](../batch/hourly.md) |
| `nagiyu-stock-tracker-batch-summary-{env}` | Lambda 関数 (ECR イメージ) | [サマリーバッチ](../batch/summary.md) |
| `nagiyu-stock-tracker-batch-daily-{env}` | Lambda 関数 (ECR イメージ) | [日次バッチ](../batch/daily.md) |
| `nagiyu-stock-tracker-batch-forecast-{env}` | Lambda 関数 (ECR イメージ) | [確度算出バッチ](../batch/forecast.md) |
| `nagiyu-stock-tracker-batch-temporary-alert-expiry-{env}` | Lambda 関数 (ECR イメージ) | [一時アラート失効バッチ](../batch/temporary-alert-expiry.md) |
| `nagiyu-stock-tracker-batch-execution-role-{env}` | IAM ロール | 6 関数が共有する実行ロール |
| `stock-tracker-batch-runtime-{env}` | IAM マネージドポリシー | 実行ロールの権限 (下の「権限」) |
| `stock-tracker-batch-{種類}-{env}` | EventBridge のルール | 関数ごとに 1 つ。下の「EventBridge のルール」 |
| `/aws/lambda/{関数名}` | CloudWatch Logs のロググループ | 各関数のログ |

`{env}` は `dev` か `prod`、`{種類}` は `minute`、`hourly`、`summary`、`daily`、`forecast`、`temporary-alert-expiry`。関数のスタックは `NagiyuStockTrackerLambda{Env}`、ルールのスタックは `NagiyuStockTrackerEventBridge{Env}`。名前と、関数の既定値は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。イメージの置き場の ECR は[デプロイ先](../deploy.md)の「スタック」にある。

## 設定値

| 関数 | メモリ | タイムアウト | 予約済み同時実行数 | 起動するハンドラー (`services/stock-tracker/batch/dist/src/` 以下) |
|---|---|---|---|---|
| minute | 1024 MB | 50 秒 | 1 | `minute.handler` |
| hourly | 512 MB | 5 分 | 設定しない | `hourly.handler` |
| summary | 512 MB | 5 分 | 設定しない | `summary.handler` |
| daily | 512 MB | 10 分 | 設定しない | `daily.handler` |
| forecast | 1024 MB | 15 分 | 1 | `forecast.handler` |
| temporary-alert-expiry | 512 MB | 5 分 | 設定しない | `temporary-alert-expiry.handler` |

- 表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま。タグの `Service` は `stock-tracker`
- ロググループは、どの関数も新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)
- 6 関数とも、共通部品の既定どおり、エラー履歴への書き込みが有効で、`ERROR_EVENTS_TABLE_NAME` と `dynamodb:PutItem` ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md)) が付く
- 再試行 (非同期呼び出しの再試行回数) と DLQ は、コードが指定しない。AWS の既定に従う。EventBridge のルールのターゲットにも、再試行や DLQ の設定はない
- forecast のタイムアウトは、手動で起動する初期値算出 (リプレイ) が Lambda の上限の 15 分に収まる前提で、上限いっぱいにしている
- forecast の同時実行数を 1 に抑えるのは、通常モードが 1 回の実行で処理する日数に上限を持ち、並列にしても意味がないことと、リプレイを同時に複数走らせると同じ市場・日付の書き込みが重複するだけのため

## EventBridge のルール

| ルール (`stock-tracker-batch-{種類}-{env}`) | 起動する関数 | スケジュール |
|---|---|---|
| minute | minute | `rate(1 minute)` |
| hourly | hourly | `rate(1 hour)` |
| summary | summary | `rate(1 hour)` |
| temporary-alert-expiry | temporary-alert-expiry | `rate(1 hour)` |
| forecast | forecast | `rate(1 hour)` |
| daily | daily | 毎日 UTC 0:00 (`cron(0 0 * * ? *)`) |

- ルールは、dev と prod のどちらでも、6 つすべてを作る。環境によってルールを止める仕組みも、特定のバッチだけを止める仕組みもない。dev でも、minute から forecast まで、prod と同じ間隔で動く
- 各ルールのターゲットは、対応する関数 1 つだけ。入力は渡さない
- 起動の失敗や関数のエラーは、[アラーム](./alarms.md)が検知する

## summary から forecast を起動する

summary は、日次サマリーを 1 件以上保存した回の終わりに、forecast を非同期で起動する (`InvocationType: Event`)。理由は[確度算出バッチ](../batch/forecast.md)にある。

| 項目 | 内容 |
|---|---|
| 起動先の関数名 | 環境変数 `STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME` (`nagiyu-stock-tracker-batch-forecast-{env}`) |
| 権限 | 実行ロールの `InvokeForecastBatchFunction` (下の「権限」) |
| 起動に失敗したとき | 警告ログを出すだけで、summary の成否には影響しない |

## 環境変数

| 名前 | 関数 | 意味 | 値の出どころ |
|---|---|---|---|
| `NODE_ENV` | 全部 | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `DYNAMODB_TABLE_NAME` | 全部 | [メインのテーブル](../data/main-table.md)の名前 | `nagiyu-stock-tracker-main-{env}` |
| `BATCH_TYPE` | 全部 | バッチの種類。`MINUTE`、`HOURLY`、`SUMMARY`、`DAILY`、`FORECAST`、`TEMPORARY_ALERT_EXPIRY` | 固定値。コードは読まない |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | minute、hourly | Web Push の鍵 | CDK の context `vapidPublicKey`、`vapidPrivateKey`。なければ仮の値 `PLACEHOLDER` |
| `FINNHUB_API_KEY` | minute、hourly | Finnhub の API キー | CDK の context `finnhubApiKey`。なければ仮の値 `PLACEHOLDER` |
| `MINUTE_BATCH_CONCURRENCY` | minute | 銘柄の価格取得の並列数 | `3` |
| `MINUTE_BATCH_TIME_BUDGET_MS` | minute | 新しい銘柄の処理を始めてよい時間の上限 | `30000` |
| `MINUTE_BATCH_FIRST_ATTEMPT_TIMEOUT_MS` | minute | 価格取得の 1 回目のタイムアウト | `4000` |
| `MINUTE_BATCH_RETRY_TIMEOUT_MS` | minute | 価格取得の再試行のタイムアウト | `8000` |
| `MINUTE_BATCH_RETRY_DELAY_MS` | minute | 再試行までの待ち | `500` |
| `STOCK_TRACKER_FORECAST_BATCH_FUNCTION_NAME` | summary | 確度算出バッチの関数名 | `nagiyu-stock-tracker-batch-forecast-{env}` |
| `STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE` | forecast | 通常モードで、この日付より前のサマリーにだけ過去データの除外を適用する境界日 (`YYYY-MM-DD`) | CDK の context `forecastLegacyExclusionBefore`。指定がなければ環境変数ごと付けない |

- VAPID 鍵と Finnhub の API キーの値の出どころと、変えたときの反映は[シークレット](./secrets.md)にある。実行中に Secrets Manager は読まない
- デプロイのワークフローは `forecastLegacyExclusionBefore` を渡さないので、通常のデプロイでは `STOCK_TRACKER_LEGACY_EXCLUSION_BEFORE` は付かない
- `MINUTE_BATCH_*` の時間は、時間の上限 30 秒に、処理中の銘柄の完了を待つ最悪の時間 (4 秒 + 0.5 秒 + 8 秒 = 12.5 秒) を足しても、関数のタイムアウト 50 秒に収まるように決めてある。値の使われ方は[分次バッチ](../batch/minute.md)にある

## 権限

6 関数は、1 つの実行ロールを共有する。実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray、エラー履歴への書き込み) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。マネージドポリシー `stock-tracker-batch-runtime-{env}` が足すのは次の 2 つ。

| Sid | 対象 | 許可する操作 |
|---|---|---|
| `DynamoDBTableAccess` | [メインのテーブル](../data/main-table.md)とそのインデックス | `Query`、`Scan`、`GetItem`、`UpdateItem`、`PutItem` |
| `InvokeForecastBatchFunction` | 確度算出バッチの関数 `nagiyu-stock-tracker-batch-forecast-{env}` | `lambda:InvokeFunction` |

- `DeleteItem` は持たない。物理削除は DynamoDB の TTL に任せる ([メインのテーブル](../data/main-table.md))
- forecast の関数は、このポリシーより後に同じスタックで作られる。関数の参照ではなく、固定名から組み立てた ARN を使う
- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る

## 理由

- バッチを処理の目的ごとに別の関数・別のルールに分ける。一方の処理が失敗しても他方に影響しない障害分離になり、関数ごとにメモリとタイムアウトを決められるため。関数が増えるが、責務の明確さと保守のしやすさを優先する
- 日次サマリーの生成と確度の算出のルールは dev でも止めない。dev で作る理由は[メインのテーブル](../data/main-table.md)の「dev のデータ」にある。代わりに、株価の取得が dev のぶんだけ増える (1 日あたり銘柄数程度)

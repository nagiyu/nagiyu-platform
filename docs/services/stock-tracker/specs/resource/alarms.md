---
sources:
  - infra/stock-tracker/lib/sns-stack.ts
  - infra/stock-tracker/lib/cloudwatch-alarms-stack.ts
  - infra/stock-tracker/bin/stock-tracker.ts
sources_hash: 45cb61a37b3469de175dd2ed8cacf22b391c84239f64a994cd27e63233e96c84
---

# アラーム

Lambda 関数と DynamoDB テーブルを監視する CloudWatch アラーム 17 個と、その通知先の SNS トピック。アラームが鳴ると、サービス自身のトピックと、Admin のアラームのトピックの両方へ通知する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-stock-tracker-alarms-{env}` | SNS トピック | このサービスのアラームの通知先 |
| `stock-tracker-{対象}-{指標}-{env}` | CloudWatch アラーム | 下の「アラーム」の 17 個 |

`{env}` は `dev` か `prod`。トピックのスタックは `NagiyuStockTrackerSNS{Env}`、アラームのスタックは `NagiyuStockTrackerAlarms{Env}` ([デプロイ先](../deploy.md))。タグは `Application` が `nagiyu`、`Service` が `stock-tracker`、`Environment` が環境名。

## 設定値

### アラーム

どのアラームも、期間は 5 分、評価は 1 回、データがないときは異常としない (`NOT_BREACHING`)。

| アラーム (`stock-tracker-` に続く名前) | 対象 | メトリクス | 統計 | 条件 |
|---|---|---|---|---|
| `web-error-rate-{env}` | Web の関数 | `Errors` | 平均 | 0.05 を超える (5%) |
| `web-duration-{env}` | Web の関数 | `Duration` | 平均 | 20000 ミリ秒を超える |
| `web-throttle-{env}` | Web の関数 | `Throttles` | 合計 | 1 以上 |
| `batch-minute-error-rate-{env}` | minute | `Errors` | 平均 | 0.1 を超える (10%) |
| `batch-minute-duration-{env}` | minute | `Duration` | 平均 | 40000 ミリ秒を超える |
| `batch-minute-throttle-{env}` | minute | `Throttles` | 合計 | 1 以上 |
| `batch-hourly-error-rate-{env}` | hourly | `Errors` | 平均 | 0.1 を超える |
| `batch-hourly-duration-{env}` | hourly | `Duration` | 平均 | 240000 ミリ秒 (4 分) を超える |
| `batch-hourly-throttle-{env}` | hourly | `Throttles` | 合計 | 1 以上 |
| `batch-summary-error-rate-{env}` | summary | `Errors` | 平均 | 0.1 を超える |
| `batch-daily-error-rate-{env}` | daily | `Errors` | 平均 | 0.1 を超える |
| `batch-daily-duration-{env}` | daily | `Duration` | 平均 | 480000 ミリ秒 (8 分) を超える |
| `batch-daily-throttle-{env}` | daily | `Throttles` | 合計 | 1 以上 |
| `batch-temporary-alert-expiry-error-rate-{env}` | temporary-alert-expiry | `Errors` | 平均 | 0.1 を超える |
| `batch-forecast-error-rate-{env}` | forecast | `Errors` | 平均 | 0.1 を超える |
| `dynamodb-read-throttle-{env}` | [メインのテーブル](../data/main-table.md) | `SystemErrors` (`GetItem`、`Query`、`Scan`) | 合計 | 1 以上 |
| `dynamodb-write-throttle-{env}` | [メインのテーブル](../data/main-table.md) | `SystemErrors` (`PutItem`、`UpdateItem`、`DeleteItem`) | 合計 | 1 以上 |

- `Errors` の平均は、呼び出しあたりの失敗の割合になる
- 実行時間のしきい値は、関数のタイムアウトに近づいたことを知らせる値で、minute (タイムアウト 50 秒) は 40 秒、hourly (5 分) は 4 分、daily (10 分) は 8 分
- summary、temporary-alert-expiry、forecast には、エラーのアラームだけがある。forecast は、リプレイ (手動の初期値算出) を流したときに所要時間が大きく変わるため、実行時間とスロットリングのアラームを置かない
- DynamoDB のアラームは、スロットリングの名前だが、メトリクスはテーブルのシステムエラー (`SystemErrors`) を数える

### 通知先

| 通知先 | 内容 |
|---|---|
| `nagiyu-stock-tracker-alarms-{env}` | このサービスのトピック。表示名は `Stock Tracker Alarms ({env})`。CDK は購読を作らない |
| Admin のアラームのトピック | 17 個すべてが、アラームの発生 (`ALARM` への遷移) をここにも送る。トピックの名前と ARN は `infra/common` の `getAdminAlarmTopicArn` で決まる。購読と、エラー履歴への取り込みは [アラームのトピック](../../../admin/specs/resource/alarm-topic.md)にある |

- アラームのアクションは、`ALARM` への遷移だけに付ける。`OK` への復帰と、データ不足の通知は付けない
- DLQ は持たない。バッチの関数にも付けていない ([バッチの実行環境](./batch-runtime.md))

## 理由

- 通知を Admin のトピックにも送るのは、各サービスのアラームを Admin のエラー履歴に集めるため ([アラームのトピック](../../../admin/specs/resource/alarm-topic.md))

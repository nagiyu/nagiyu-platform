---
sources:
  - infra/admin/lib/sns-stack.ts
  - infra/admin/lib/self-monitoring-topic.ts
  - infra/admin/lib/self-monitoring-alarms-stack.ts
  - infra/admin/lib/lambda-stack.ts
sources_hash: 1246067ab38ce292974f2c6def56450e752118385db0a6936f52bbbbf1de60c5
---

# 自己監視

通知の仕組み自身 (alarm-ingest、stream-handler、DLQ、エラー履歴のテーブル) の障害を知らせる、専用の SNS トピックと CloudWatch アラーム。通知は Admin の `/api/notify/sns` を HTTPS で呼び、Push を出す。履歴には残さない。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-admin-self-monitoring-{env}` | SNS トピック | 自己監視のアラームの通知先 |
| HTTPS の購読 | SNS の購読 | トピックの通知を `{Admin の URL}/api/notify/sns` へ送る |
| `admin-alarm-ingest-errors-{env}` | CloudWatch アラーム | alarm-ingest の例外 |
| `admin-stream-handler-errors-{env}` | CloudWatch アラーム | stream-handler の例外 |
| `admin-stream-handler-dlq-visible-{env}` | CloudWatch アラーム | stream-handler の DLQ への滞留 |
| `admin-error-events-system-errors-{env}` | CloudWatch アラーム | エラー履歴のテーブルの `SystemErrors` |
| `admin-error-events-throttled-{env}` | CloudWatch アラーム | エラー履歴のテーブルの `ThrottledRequests` |

`{env}` は `dev` か `prod`。トピックと購読のスタック (データと通知の基盤) と、アラームのスタック (バッチ系の自己監視) は[デプロイ先](../deploy.md)の「スタック」にある。タグは `Application` が `nagiyu`、`Service` が `admin`、`Environment` が環境名。アラームは、さらに `Component` が `self-monitoring`。

## 設定値

### トピック

| 項目 | 値 |
|---|---|
| 表示名 | `Admin Self-Monitoring ({env})` |
| 購読 | HTTPS。宛先は Admin の URL ([デプロイ先](../deploy.md)のホスト名) の `/api/notify/sns` |
| Export | `nagiyu-admin-self-monitoring-topic-arn-{env}` (トピックの ARN) |

- 購読の確認 (`SubscriptionConfirmation`) は、`/api/notify/sns` が自動で応じる。受け付けの挙動は [SNS 通知の受け付け API](../api/notify-sns.md)にある
- [Web](./web-runtime.md)の環境変数 `SNS_ALLOWED_TOPIC_ARN` が、このトピックの ARN を指す。`/api/notify/sns` は、このトピックからのメッセージだけを受け付ける

### アラーム

5 つとも、次の設定を共有する。

| 項目 | 値 |
|---|---|
| 比較 | しきい値以上 (`GREATER_THAN_OR_EQUAL_TO_THRESHOLD`) |
| しきい値 | 1 |
| 評価期間 | 1 |
| 欠損データの扱い | 正常として扱う (`NOT_BREACHING`) |
| アクション | アラームになったとき、自己監視のトピックへ発行する |

| アラーム | メトリクス | 統計 | 期間 |
|---|---|---|---|
| `admin-alarm-ingest-errors-{env}` | alarm-ingest の Lambda の `Errors` | 合計 | 5 分 |
| `admin-stream-handler-errors-{env}` | stream-handler の Lambda の `Errors` | 合計 | 5 分 |
| `admin-stream-handler-dlq-visible-{env}` | DLQ の `ApproximateNumberOfMessagesVisible` | 最大 | 5 分 |
| `admin-error-events-system-errors-{env}` | `AWS/DynamoDB` の `SystemErrors` (テーブル `nagiyu-error-events-{env}`) | 合計 | 5 分 |
| `admin-error-events-throttled-{env}` | `AWS/DynamoDB` の `ThrottledRequests` (テーブル `nagiyu-error-events-{env}`) | 合計 | 5 分 |

- DLQ の滞留のアラームは、DynamoDB Streams からの呼び出しの失敗では鳴らない。stream-handler の Streams の失敗を知らせるのは、`admin-stream-handler-errors-{env}` である ([バッチの実行環境](./batch-runtime.md)の「DLQ」)
- 対象の Lambda と DLQ は[バッチの実行環境](./batch-runtime.md)、テーブルは[エラーイベントのテーブル](../../../../platform/specs/data/error-events.md)
- アクションは、アラームになったときだけ。正常に戻ったときと、データ不足のときは通知しない

## 理由

- 本流 ([アラームのトピック](./alarm-topic.md)) とは別のトピックにする。同じトピックに HTTPS の購読も載せると、本流のアラームでも `/api/notify/sns` から Push が出て、stream-handler からの Push と二重になる
- 通知の仕組み自身 (alarm-ingest、stream-handler、DLQ、エラー履歴のテーブル) が壊れていても Push が届くよう、障害の範囲を分ける。自己監視の通知はこれらを通らず、トピックから Web の `/api/notify/sns` へ直接届く
- 自己監視は履歴に残さず、Push だけを出す。履歴への書き込みを通すと、壊れているものに通知を頼ることになる
- 欠損データを正常として扱うのは、呼び出しや変更がない間はメトリクスにデータ点が出ず、データ不足を異常とすると、平常時にアラームが鳴るため

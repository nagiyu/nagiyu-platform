---
sources:
  - infra/admin/lib/batch-lambda-stack.ts
  - infra/common/src/utils/arn.ts
sources_hash: a21da2b829cc7ea28f15f912100c24336e701096a4a58d83c5e5861e67ed3bee
---

# バッチの実行環境

アラームの取り込み (alarm-ingest) と、Push の送信 (stream-handler) を動かす 2 つの Lambda 関数と、その実行ロール、stream-handler の DLQ。関数はどちらも同じ ECR のイメージから、起動するハンドラーだけを変えて作る。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-admin-alarm-ingest-{env}` | Lambda 関数 (ECR イメージ) | [alarm-ingest](../batch/alarm-ingest.md)。アラームのトピックの通知を、エラー履歴へ書く |
| `nagiyu-admin-stream-handler-{env}` | Lambda 関数 (ECR イメージ) | [stream-handler](../batch/stream-handler.md)。エラー履歴の追加を契機に、Push を送る |
| `nagiyu-admin-stream-handler-dlq-{env}` | SQS キュー | stream-handler の DLQ |
| 実行ロール 2 つ (名前は CDK が決める) | IAM ロール | 各関数の実行ロール |
| `/aws/lambda/nagiyu-admin-alarm-ingest-{env}`、`/aws/lambda/nagiyu-admin-stream-handler-{env}` | CloudWatch Logs のロググループ | 各関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuAdminBatchLambda{Env}`。名前と、関数の既定値は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。イメージの置き場の ECR は[デプロイ先](../deploy.md)の「スタック」にある。

## 設定値

| 項目 | alarm-ingest | stream-handler |
|---|---|---|
| メモリ | 256 MB | 256 MB |
| タイムアウト | 30 秒 | 30 秒 |
| 起動するハンドラー | `services/admin/batch/dist/src/alarm-ingest.handler` | `services/admin/batch/dist/src/stream-handler.handler` |
| エラー履歴への書き込み | 既定のまま (有効) | 無効 (`enableErrorEvents: false`) |
| DLQ | なし | `nagiyu-admin-stream-handler-dlq-{env}` |

- メモリは既定 (512 MB) から 256 MB に下げている。タイムアウトと、表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま
- タグの `Service` は、どちらも `admin-batch`
- ロググループは、どちらも新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)
- 2 つのロールは、AWS 管理ポリシー `AWSLambdaBasicExecutionRole` を持つ

### イベントソース

| 関数 | イベントソース | 設定 |
|---|---|---|
| alarm-ingest | SNS ([アラームのトピック](./alarm-topic.md)) | トピックの購読として関数を登録する。トピックは名前から ARN を組み立てて参照する (`getAdminAlarmTopicArn`) |
| stream-handler | DynamoDB Streams ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md)) | 下の表 |

stream-handler の DynamoDB Streams の設定。

| 項目 | 値 |
|---|---|
| 読み始める位置 | `LATEST` (関数を作った時点より後に追加された変更から) |
| バッチの最大件数 | 100 |
| バッチの最大待ち時間 | 5 秒 |
| 再試行の回数 | 2 |
| 失敗したバッチの分割 | する (`bisectBatchOnError`) |
| 再試行を使い切ったレコードの送り先 (`onFailure`) | なし |

- 再試行を使い切ったレコードは、どこにも送られずに捨てられる。DLQ はこの送り先ではない (下の「理由」)
- Streams のストリームの ARN は、エラーイベントのテーブルのスタックの Export `nagiyu-error-events-table-stream-arn-{env}` から取る

### DLQ

| 項目 | 値 |
|---|---|
| 名前 | `nagiyu-admin-stream-handler-dlq-{env}` |
| メッセージの保持期間 | 14 日 |

DLQ にメッセージが残ると、[自己監視のアラーム](./self-monitoring.md)が通知する。

## 環境変数

| 名前 | 関数 | 意味 | 値の出どころ |
|---|---|---|---|
| `NODE_ENV` | 両方 | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `ERROR_EVENTS_TABLE_NAME` | alarm-ingest | エラー履歴の書き込み先 | `nagiyu-error-events-{env}`。共通部品が設定する |
| `DYNAMODB_TABLE_NAME` | stream-handler | [Admin のテーブル](../data/main-table.md)の名前 (Push の購読の読み取り先) | `nagiyu-admin-main-{env}` |
| `VAPID_PUBLIC_KEY` | stream-handler | Web Push の公開鍵 | CDK の context `vapidPublicKey`。なければ仮の値 `PLACEHOLDER` |
| `VAPID_PRIVATE_KEY` | stream-handler | Web Push の秘密鍵 | CDK の context `vapidPrivateKey`。なければ仮の値 `PLACEHOLDER` |
| `APP_URL` | stream-handler | Push の通知が開く先の Admin の URL | 環境ごとの Admin の URL ([デプロイ先](../deploy.md)のホスト名) |

- VAPID 鍵の値の出どころと、変えたときの反映は[シークレット](./secrets.md)にある。実行中に Secrets Manager は読まない
- stream-handler は、エラー履歴へ書かないので `ERROR_EVENTS_TABLE_NAME` を持たない

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray など) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。

| ロール | 対象 | 許可する操作 |
|---|---|---|
| alarm-ingest | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (共通部品の既定。エラー履歴への書き込み) |
| stream-handler | エラーイベントのテーブルのストリーム | `DescribeStream`、`GetRecords`、`GetShardIterator`、`ListStreams` |
| stream-handler | [Admin のテーブル](../data/main-table.md)とそのインデックス | `Query`、`Scan`、`DeleteItem` |
| stream-handler | DLQ | メッセージの送信 |

- stream-handler は Admin のテーブルを読むだけでなく、無効と判定された購読を消すために `DeleteItem` を持つ。書き込み (`PutItem`) は持たない。購読を作るのは Web ([Web の実行環境](./web-runtime.md))
- alarm-ingest は Admin のテーブルに触らない

## 理由

- 再試行を使い切ったレコードは残らず、あとから再処理できない。stream-handler の失敗は、`Errors` の[自己監視のアラーム](./self-monitoring.md)で検知する
- DLQ は関数自体の `deadLetterQueue` として設定していて、DynamoDB Streams のイベントソースの失敗の送り先ではない。Lambda の DLQ は非同期の呼び出し (SNS や直接の非同期呼び出し) の失敗にだけ使われる。Streams からの呼び出しは同期のため、Streams の再試行を使い切っても DLQ にメッセージは入らない
- stream-handler がエラー履歴の書き込みを持たないのは、この関数が履歴を書かないため。持たせると、使わない権限と環境変数が増える

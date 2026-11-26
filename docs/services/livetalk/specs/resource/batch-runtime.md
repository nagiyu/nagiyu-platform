---
sources:
  - infra/livetalk/lib/batch-stack.ts
  - infra/livetalk/bin/livetalk.ts
  - infra/livetalk/lib/batch-ecr-stack.ts
sources_hash: ca59657b36d2894461d3c6a16a21cea2d8795e695e5aa2017df9df90b14a7d45
---

# バッチの実行環境

定期バッチを動かす 4 つの Lambda 関数と、その起動のスケジュール (EventBridge のルール)、失敗の送り先 (DLQ)、実行ロール。関数は 4 つとも同じ ECR のイメージから、起動するハンドラーだけを変えて作る。スタックは `NagiyuLiveTalkBatch{Env}`。

## リソース

| バッチ | 関数 | EventBridge のルール | DLQ | 実行ロール |
|---|---|---|---|---|
| [活動時間学習](../batch/learn-user-activity.md) | `nagiyu-livetalk-batch-learn-user-activity-{env}` | `livetalk-batch-learn-activity-{env}` | `nagiyu-livetalk-learn-activity-dlq-{env}` | `nagiyu-livetalk-learn-activity-role-{env}` |
| [通知](../batch/notify.md) | `nagiyu-livetalk-batch-notify-{env}` | `livetalk-batch-notify-{env}` | `nagiyu-livetalk-notify-dlq-{env}` | `nagiyu-livetalk-notify-role-{env}` |
| [集約](../batch/consolidate-conversations.md) | `nagiyu-livetalk-batch-consolidate-{env}` | `livetalk-batch-consolidate-{env}` | `nagiyu-livetalk-consolidate-dlq-{env}` | `nagiyu-livetalk-consolidate-role-{env}` |
| [取得 (acquire)](../batch/acquire.md) | `nagiyu-livetalk-batch-acquire-{env}` | `livetalk-batch-acquire-{env}` | `nagiyu-livetalk-acquire-dlq-{env}` | `nagiyu-livetalk-acquire-role-{env}` |

`{env}` は `dev` か `prod`、`{Env}` は `Dev` か `Prod`。ロググループは `/aws/lambda/{関数名}`。イメージの置き場の ECR (`nagiyu-livetalk-batch-ecr-{env}`) は[デプロイ先](../deploy.md)の「スタック」にある。名前と、関数の既定値は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 512 MB (共通部品の既定のまま) |
| タイムアウト | 15 分 (Lambda の上限) |
| 起動するハンドラー | `services/livetalk/batch/dist/src/handlers/{learn-user-activity,notify,consolidate-conversations,acquire}.handler` |
| ロググループ | 4 つとも新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」) |
| DLQ のメッセージの保持期間 | 7 日 |

- 表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、エラー履歴への書き込み) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま
- タグは、関数が `Service` を `livetalk` とし、スタックが `Component` を `livetalk-batch` とする
- 関数の中の処理の骨格 (開始のログ、失敗の報告と投げ直し) は[定期実行 Lambda の骨格](../../../../platform/specs/lib/aws/scheduled-handler.md)にある

### スケジュール

EventBridge のルールの時刻は UTC。

| バッチ | スケジュール | 日本時間 | ターゲットの最大のイベントの年齢 |
|---|---|---|---|
| 活動時間学習 | `cron(0 18 ? * SAT *)` | 毎週日曜 03:00 | 2 時間 |
| 通知 | `cron(30 * * * ? *)` | 毎時 30 分 | 1 時間 |
| 集約 | `cron(15 * * * ? *)` | 毎時 15 分 | 1 時間 |
| 取得 | `cron(45 * * * ? *)` | 毎時 45 分 | 1 時間 |

- 毎時のバッチは、時刻をずらして同時に動かさない (15 分・30 分・45 分)

### 失敗したときの再試行と DLQ

EventBridge のルールのターゲットと、Lambda の関数のどちらにも DLQ (同じキュー) を付ける。

| 層 | 設定 | 働く場面 |
|---|---|---|
| EventBridge のターゲット | 再試行 1 回 (`retryAttempts`)、最大のイベントの年齢 (上の表)、DLQ | EventBridge が関数を呼び出せなかったとき。使い切ると DLQ に入る |
| Lambda の関数 | `deadLetterQueue` だけを付ける。再試行の回数と最大のイベントの年齢は指定しない | 関数が例外で終わったとき。EventBridge は関数を非同期に呼ぶので、Lambda の非同期の呼び出しの既定が働く (再試行 2 回、最大のイベントの年齢 6 時間) |

- 関数が例外で終わると、最初の 1 回と再試行 2 回を合わせて最大 3 回実行され、使い切ると DLQ に入る
- どのバッチが例外で終わるかは、各バッチの「失敗したとき」にある。集約と取得は、失敗した利用者が 1 人でもいると最後に例外で終わる ([集約](../batch/consolidate-conversations.md)、[取得](../batch/acquire.md))。例外で終わるとき、Admin にエラーとして届く ([エラー通知の経路](../../../admin/specs/flow/error-notification.md))
- 再試行の挙動は AWS の仕様による (https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html、https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html)
- DLQ の滞留を知らせるアラームは、一部のバッチにだけある ([監視](./monitoring.md))

## 環境変数

| 名前 | 意味 | 関数 | 値の出どころ |
|---|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 4 つ | 環境名 (`dev` / `prod`) |
| `LIVETALK_ENV` | [メトリクス](./monitoring.md)の `Environment` ディメンションの値 | 4 つ | 環境名 |
| `DYNAMODB_TABLE_NAME` | [テーブル](../data/main-table.md)の名前 | 4 つ | `nagiyu-livetalk-dynamodb-{env}` |
| `TZ` | プロセスのタイムゾーン | 4 つ | `Asia/Tokyo` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | 4 つ | `nagiyu-error-events-{env}`。共通部品が設定する |
| `OPENAI_API_KEY` | OpenAI の API キー | 通知・集約・取得 | [シークレット](./secrets.md)。デプロイ時に Secrets Manager から取り出して渡す |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | Web Push の署名キー | 通知 | [シークレット](./secrets.md)。デプロイ時に取り出して渡す |

- 活動時間学習は、OpenAI の API キーも VAPID キーも持たない
- 実行中の Lambda は Secrets Manager を読まない。値を変えたときの反映は[シークレット](./secrets.md)にある
- 時刻と日付の判定は、コードが日本時間を明示して求める。`TZ` には頼らない

## 権限

| ロール | 対象 | 許可する操作 |
|---|---|---|
| 4 つとも | AWS 管理ポリシー `AWSLambdaBasicExecutionRole` | ログの出力に必要な操作 |
| 4 つとも | [テーブル](../data/main-table.md)とそのインデックス | 読み書き (`grantReadWriteData`) |
| 4 つとも | 自分のバッチの DLQ | メッセージの送信 |
| 4 つとも | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (共通部品の既定) |

- ロールは、バッチごとに別々に作る。同じ権限だが、DLQ は自分のキューにだけ送れる
- どのロールも Secrets Manager を読まない。OpenAI API キーと VAPID キーは、デプロイのときに環境変数として渡す
- テーブルのインデックスを読む権限は、テーブルを `fromTableAttributes` に `globalIndexes` を付けて取り込むことで付く。`fromTableArn` で取り込むと付かず、インデックスの Query が `AccessDenied` になる

## 理由

- バッチは 4 つの独立した Lambda にする。障害の切り分けと、権限を最小にするため、DLQ と実行ロールも別々に持つ。1 つのバッチが失敗しても、ほかのバッチの DLQ や権限に影響しない
- 時刻と日付の判定を `TZ` に頼らない。判定はコードが日本時間を明示して求める。実行環境のタイムゾーンに依存しないためである。`TZ=Asia/Tokyo` は 4 つの関数と Web に入れているが、判定の正しさはこの設定に頼らない

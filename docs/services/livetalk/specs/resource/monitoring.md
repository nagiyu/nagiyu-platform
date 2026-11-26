---
sources:
  - infra/livetalk/lib/alarms-stack.ts
  - services/livetalk/core/src/observability/metrics.ts
  - services/livetalk/core/src/observability/emf.ts
  - infra/livetalk/lib/ecs-service-stack.ts
  - infra/livetalk/lib/batch-stack.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
  - services/livetalk/core/src/usecases/consolidate.usecase.ts
---

# 監視

LiveTalk のインフラの障害を知らせる CloudWatch のアラーム 9 本と、アプリが出す計測のメトリクス (EMF)。アラームの送り先は Admin の本流のトピックで、通知は Admin の基盤が出す。メトリクスは、アプリのログを CloudWatch が自動でメトリクスにして作る。

## アラーム

スタックは `NagiyuLiveTalkAlarms{Env}` (`{Env}` は `Dev` か `Prod`)。アラームは、状態が `ALARM` になったときに、[アラームのトピック](../../../admin/specs/resource/alarm-topic.md) `nagiyu-admin-alarms-{env}` へ発行する。トピックから先の通知は[エラー通知の経路](../../../admin/specs/flow/error-notification.md)にある。

| アラーム (`{env}` は `dev` か `prod`) | 対象 | メトリクス | 統計 |
|---|---|---|---|
| `livetalk-batch-learn-activity-errors-{env}` | 活動時間学習の関数 | Lambda `Errors` | 合計 |
| `livetalk-batch-notify-errors-{env}` | 通知の関数 | Lambda `Errors` | 合計 |
| `livetalk-batch-consolidate-errors-{env}` | 集約の関数 | Lambda `Errors` | 合計 |
| `livetalk-batch-acquire-errors-{env}` | 取得の関数 | Lambda `Errors` | 合計 |
| `livetalk-batch-learn-activity-dlq-{env}` | 活動時間学習の DLQ | SQS `ApproximateNumberOfMessagesVisible` | 最大 |
| `livetalk-batch-notify-dlq-{env}` | 通知の DLQ | SQS `ApproximateNumberOfMessagesVisible` | 最大 |
| `livetalk-alb-5xx-{env}` | ALB | `HTTPCode_ELB_5XX_Count` | 合計 |
| `livetalk-alb-unhealthy-host-{env}` | ターゲットグループ | `UnHealthyHostCount` | 最大 |
| `livetalk-dynamodb-throttled-{env}` | [テーブル](../data/main-table.md) | `ThrottledRequests` | 合計 |

- 関数・DLQ・ALB・ターゲットグループ・テーブルは、[バッチの実行環境](./batch-runtime.md)と [Web の実行環境](./web-runtime.md)のリソースのとおり
- DLQ の滞留のアラームは、活動時間学習と通知の 2 本だけで、集約と取得の DLQ にはない

| 項目 | 値 |
|---|---|
| 評価の期間 | 5 分 |
| 評価の回数 | 1 回 |
| しきい値 | 1 以上 (`GREATER_THAN_OR_EQUAL_TO_THRESHOLD`) |
| データがないとき | 正常として扱う (`NOT_BREACHING`) |

- ALB とターゲットグループの識別子 (CloudWatch のディメンションの値) は、SSM の ALB の ARN とターゲットグループの ARN から組み立てる ([Web の実行環境](./web-runtime.md)の「SSM のパラメータ」)。そのため、アラームのスタックは ALB のスタックの後にデプロイされる
- 各アラームのタグは `Application` が `nagiyu`、`Service` が `livetalk`、`Component` が `monitoring`、`Environment` が環境名

## メトリクス (EMF)

アプリが標準出力に CloudWatch の EMF の形式の JSON を出すと、CloudWatch が自動でメトリクスにする。追加の権限もインフラも要らない。

| 名前空間 | 出すもの | 出す場所 |
|---|---|---|
| `LiveTalk/Chat` | チャット 1 回ごと | Web (チャットの処理) |
| `LiveTalk/Batch` | 集約のバッチの組 (利用者 × キャラクター) ごと | 集約のバッチ |

ディメンションは、どちらの名前空間も `Environment` と `CharacterId`。`Environment` の値は、環境変数 `LIVETALK_ENV` で、なければ `NODE_ENV`、それもなければ `unknown`。

| 名前空間 | メトリクス | 単位 | 意味 |
|---|---|---|---|
| `LiveTalk/Chat` | `PromptTotalTokens` | Count | プロンプトのトークン数 (概算) |
| `LiveTalk/Chat` | `LLMTimeToFirstToken` | Milliseconds | LLM の最初のトークンまでの時間 |
| `LiveTalk/Chat` | `ChatTotalLatency` | Milliseconds | チャット 1 回の全体の時間 |
| `LiveTalk/Chat` | `RetrieveLatency` | Milliseconds | 話題の想起の時間 |
| `LiveTalk/Chat` | `LLMTotalLatency` | Milliseconds | LLM の応答の合計の時間 |
| `LiveTalk/Chat` | `TTSTotalLatency` | Milliseconds | 音声合成の合計の時間 |
| `LiveTalk/Batch` | `CompressedMessageCount` | Count | その回に集約したメッセージの数 |
| `LiveTalk/Batch` | `BatchLatency` | Milliseconds | その組の集約の時間 |

- `PromptTotalTokens` と `CompressedMessageCount` は、いつも出る。ほかは、計測できたときだけ出る
- 同じ計測は、構造化ログ (`[chat-observability]`、`[batch-observability]`) にも出る。ログには、利用者 ID とキャラクター ID、トークン数・時間・件数・DynamoDB の消費 RCU だけが入る
- DynamoDB の消費 RCU は、ログにだけ出て、EMF のメトリクスにはならない

## 理由

- 障害の通知は、LiveTalk で配信を作らず、Admin の共通の基盤に乗せる。通知先は Admin の本流のトピックで、そこから、エラー履歴への書き込み、Web Push の経路に流れる。通知が二重になったり、独自の配信ができたりしない。Admin 自身の障害の監視に使う自己監視のトピックは、用途が違うので使わない
- アラームのしきい値は、保守的に低く、1 件で鳴るようにする。誤検知よりも、見逃しを嫌う
- DLQ の滞留を知らせるのは、DLQ のメッセージの保持が 7 日で、バッチが落ち続けても、証拠が 7 日で消えるのを避けるため
- アプリの計測は、画面を作らず、CloudWatch で観測する
- 計測は best-effort にする。計測のコードを try/catch で囲み、例外が出てもチャットの応答を止めない
- 計測に、会話の本文 (個人情報になりうる) を入れない。入れるのは、トークン数・時間・件数だけにする
- EMF は、`console.log` でトップレベルに `_aws` キーを持つ JSON を直接出す。ログから CloudWatch がメトリクスを作るので、ECS・Lambda のどちらでも、追加の権限やインフラを変えずに済む
- メトリクスの環境の識別に、`NODE_ENV` ではなく `LIVETALK_ENV` を使う。`next start` が `NODE_ENV` を `production` に上書きするため、dev と prod を区別できない
- `LLMTotalLatency` と `TTSTotalLatency` は、必ずセットで出す。音声合成が LLM の応答の時間の裏に隠れているか、はみ出しているかを、この 2 つの大小で判定するため

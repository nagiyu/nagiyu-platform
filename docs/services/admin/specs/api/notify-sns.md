---
sources:
  - services/admin/web/src/app/api/notify/sns/route.ts
  - services/admin/core/src/notify/sns-validator.ts
  - services/admin/core/src/notify/web-push-sender.ts
  - infra/admin/lib/lambda-stack.ts
  - infra/admin/lib/self-monitoring-topic.ts
sources_hash: ce7e37d89289a71be1f09989b64811c2060cfe8336cd431c254b3448627062ac
---

# SNS 受信 API

エラー通知の仕組み自身の障害を知らせる、自己監視の SNS トピックからのメッセージを受け、[購読](../term/push-subscription.md)すべてに Web Push を送る。履歴には残さない。経路の全体は[エラー通知の経路](../flow/error-notification.md)にある。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| POST | `/api/notify/sns` | なし。ログインは要らず、SNS の署名と送信元のトピックで受け付けるかを決める |

## 入力と出力

- 入力は SNS が HTTPS で送るメッセージ (JSON のオブジェクト。読み方は[リクエストボディの読み取り](../../../../platform/specs/lib/nextjs/request-body.md))。`Type` は `SubscriptionConfirmation`、`Notification`、`UnsubscribeConfirmation` のいずれか
- 受け付ける順に判定する
    1. 本文が JSON のオブジェクトであること
    2. SNS の署名が正しいこと
    3. 送信元のトピック (`TopicArn`) が、環境変数 `SNS_ALLOWED_TOPIC_ARN` と同じであること。値は同じ環境の自己監視のトピック (`nagiyu-admin-self-monitoring-{env}`) の ARN ([自己監視](../resource/self-monitoring.md))。環境変数が空でも拒否する
- `SubscriptionConfirmation` は、`SubscribeURL` が AWS SNS の確認用 URL のときだけ取得して 200 `{ success: true }` を返す。確認用 URL の条件は、`https`、ホストが `sns.{リージョン}.amazonaws.com`、ポート・ユーザー情報なし。取得ではリダイレクトを許さない。取得したレスポンスのステータスは見ない
- `UnsubscribeConfirmation` は、何もせず 200 `{ success: true }` を返す
- `Notification` は、保存されている購読すべてに Web Push を送り、200 で `{ success: true, sent, invalid, failed }` を返す。件数の意味は[購読](../term/push-subscription.md)にある
    - CloudWatch Alarm のメッセージ (`AlarmName`・`NewStateValue`・`NewStateReason` がそろう) なら、題名が `{AlarmName} ({NewStateValue})`、本文が `NewStateReason`
    - それ以外は、題名が SNS の `Subject` (空なら「CloudWatch Alarm 通知」)、本文が `Message` (空なら「アラーム通知を受信しました」)
    - 通知をタップすると、`/dashboard` が開く

## エラー

| 条件 | 状態 | `error` |
|---|---|---|
| 本文が JSON のオブジェクトでない | 400 | `INVALID_REQUEST` |
| `SubscribeURL` が AWS SNS の確認用 URL でない | 400 | `INVALID_REQUEST` |
| 署名の検証に失敗、または `Type` がない | 401 | `UNAUTHORIZED` |
| `SNS_ALLOWED_TOPIC_ARN` がない、またはトピックが違う | 403 | `FORBIDDEN` |
| 確認用 URL の取得の失敗、購読の読み込みや送信の準備の失敗 (テーブル名・VAPID 鍵の不足など) | 500 | `INTERNAL_ERROR` |

- 形は[API のエラー応答](../term/api-error.md)。ただしこの API の 500 は、履歴へ報告しない (理由は下の「理由」)
- 送信先の購読が無効だった分は、送信の中で購読を削除する。購読の削除に失敗しても、応答は成功のまま。例外で送れなかった分も、応答は成功のままで、`failed` に数える

## つながり

```mermaid
flowchart TD
    CW[自己監視アラーム] --> T[SNS<br/>nagiyu-admin-self-monitoring-env]
    T -->|HTTPS| A[SNS 受信 API]
    A --> D[(購読<br/>Admin のテーブル)]
    A --> P[Web Push<br/>購読すべて]
```

## 理由

- このエンドポイントは、自己監視の経路専用である。エラー履歴を介する本流とは別に、履歴の仕組み (error-events テーブル・stream-handler) 自身が止まっても通知が届くようにするため。自己監視のトピックを本流と分ける理由は[自己監視](../resource/self-monitoring.md)にある
- 自己監視のトピックからのメッセージだけを受け付ける。SNS の署名は、どの AWS アカウントのトピックから送られても正規のものになるので、署名の検証だけでは送信元を限定できない。そのため、受け付けるトピックを `SNS_ALLOWED_TOPIC_ARN` で固定し、副作用 (確認用 URL の取得、Push の送信) の前に照合する
- 別のトピックに、このエンドポイントを購読させても、購読確認の時点で拒否されるので、購読は成立しない。受け口を増やすなら、許可するトピックの設定も変える必要がある
- 履歴へ報告しない。自己監視の経路を、監視対象 (エラー履歴の仕組み) に依存させないため。SNS の再送で、同じ報告が重複もする

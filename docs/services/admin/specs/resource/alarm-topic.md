---
sources:
  - infra/admin/lib/sns-stack.ts
  - infra/common/src/utils/arn.ts
  - infra/admin/lib/batch-lambda-stack.ts
sources_hash: 3661e9ee53872590095e51bf3706b0d247ed1d9ebc4ab6cc365a349192e5417d
---

# アラームのトピック

各サービスの CloudWatch Alarm と EventBridge のルールが、エラーの通知を集める SNS トピック。購読するのは alarm-ingest の Lambda だけで、通知はここからエラー履歴へ書かれる。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-admin-alarms-{env}` | SNS トピック | 各サービスのアラームと EventBridge の送り先 (本流) |

`{env}` は `dev` か `prod`。スタックは[デプロイ先](../deploy.md)の「スタック」の「データと通知の基盤」。タグは `Application` が `nagiyu`、`Service` が `admin`、`Environment` が環境名。

名前と ARN は、`infra/common` の `getAdminAlarmTopicName` と `getAdminAlarmTopicArn` が決める。各サービスがアラームのアクションや EventBridge のターゲットにするときは、`getAdminAlarmTopicArn` で ARN を得る。名前を直接書くと、名前を変えたときに、書いた側だけが古いまま残る。

## 設定値

| 項目 | 値 |
|---|---|
| 表示名 | `Admin Alarms ({env})` |
| 購読 | alarm-ingest の Lambda だけ ([バッチの実行環境](./batch-runtime.md)、[alarm-ingest](../batch/alarm-ingest.md)) |
| HTTPS の購読 | 持たない |

### リソースポリシー

| Sid | 許可する主体 | 操作 | 条件 |
|---|---|---|---|
| `AllowSameAccountPublish` | すべて (`AnyPrincipal`) | `sns:Publish` | 発行元 (`aws:SourceOwner`) がこのトピックと同じアカウント |
| `AllowEventBridgePublish` | `events.amazonaws.com` | `sns:Publish` | 発行元のアカウント (`aws:SourceAccount`) がこのトピックと同じアカウント |

- 同じアカウントの CloudWatch Alarm は、`AllowSameAccountPublish` で発行できる
- EventBridge のルールのターゲットにするときは、送る側のサービスと Admin が同じアカウント・同じリージョンにあり、このトピックのポリシーが先にデプロイされていること (理由は下の「理由」)

## 理由

- 同じアカウントからの発行を明示的に許すのは、リソースポリシーを 1 つでも付けると、SNS の既定のポリシー (所有アカウントに発行を許す) が置き換わるため。EventBridge の許可だけを足すと、各サービスの CloudWatch Alarm からの発行が拒否され、通知が止まる。拒否されても送る側は失敗に気づかず、取り込みが静かに止まる。このトピックにポリシーを足すときも、同じアカウントからの発行を残す
- HTTPS の購読を持たないのは、本流のアラームを `/api/notify/sns` から Push に流すと、stream-handler からの Push と二重になるため。Push は、エラー履歴への書き込みを契機に stream-handler が 1 度だけ出す。自己監視は別のトピックにする ([自己監視](./self-monitoring.md))
- EventBridge のターゲットにする条件に、ポリシーが先のデプロイを含めるのは、送る側が別の CDK アプリで、依存関係でデプロイの順を保証できないため。トピックのポリシーが先にないと、ルールからの発行が拒否される

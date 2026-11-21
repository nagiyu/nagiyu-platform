---
sources:
  - infra/admin/bin/admin.ts
  - infra/admin/lib/cloudfront-stack.ts
  - infra/admin/lib/batch-lambda-stack.ts
  - infra/admin/lib/self-monitoring-alarms-stack.ts
  - .github/workflows/admin-deploy.yml
sources_hash: a3ee41a70c9340686a422633b387120674bee37119aefa8aa72ade11611a57d1
---

# Admin のデプロイ先

Admin は、Web アプリ (Lambda の Function URL を CloudFront で配信) と、アラームの取り込みと通知を行う 2 つのバッチ Lambda (alarm-ingest、stream-handler) を AWS に載せる。dev と prod の両方にデプロイする。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `admin.dev.nagiyu.com` |
| prod | `admin.nagiyu.com` |

DNS レコードは、dev は CloudFront の基底スタックが、prod は shared の CNAME が作る。詳しくは [DNS レコードの作り方](../../../platform/specs/deploy.md#dns-レコードの作り方) を参照。

## スタック

`infra/admin/bin/admin.ts` が、次の順に作る。環境は CDK の context `env` (既定は `dev`) で決まり、`{Env}` は `Dev` または `Prod`。

| 順 | スタック | 役割 | 含む主なリソース |
|---|---|---|---|
| 1 | `NagiyuAdminECR{Env}` | Web アプリのイメージの置き場 | ECR リポジトリ |
| 2 | `NagiyuAdminLambda{Env}` | Web アプリの実行 | Lambda 関数 (コンテナイメージ)、Function URL、実行ロール |
| 3 | `NagiyuAdminInfra{Env}` | Admin のデータと通知の基盤 | SNS トピック 2 つ (アラーム用、自己監視用)、DynamoDB のメインテーブル、VAPID の Secrets Manager シークレット |
| 4 | `NagiyuAdminBatchECR{Env}` | バッチ Lambda のイメージの置き場 | ECR リポジトリ |
| 5 | `NagiyuAdminBatchLambda{Env}` | アラームの取り込みと通知 | alarm-ingest Lambda (アラーム用の SNS トピックを購読する)、stream-handler Lambda (共通のエラーイベントテーブルの DynamoDB Streams を読む)、stream-handler の SQS デッドレターキュー |
| 6 | `NagiyuAdminSelfMonitoring{Env}` | バッチ系の自己監視 | CloudWatch アラーム 5 つ (alarm-ingest のエラー、stream-handler のエラー、デッドレターキューの滞留、エラーイベントテーブルのシステムエラーとスロットリング) |
| 7 | `NagiyuAdminCloudFront{Env}` | Web アプリの配信 | CloudFront ディストリビューション (Lambda の Function URL がオリジン)、セキュリティヘッダーと noindex、dev の ALIAS |

- CloudFront のスタックは `us-east-1` に固定する (CloudFront の制約)。ほかのスタックのリージョンは、環境変数 `CDK_DEFAULT_REGION` で、未設定なら `us-east-1`。
- CloudFront の価格クラスは、prod が `PriceClass_All`、dev が `PriceClass_100`。
- 共通のエラーイベントテーブルは shared が作る (stream-handler が購読する)。

## デプロイの流れ

`.github/workflows/admin-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (`services/admin/**`、`libs/**`、`configs/**`、`infra/admin/**`、`infra/common/**`、`package.json`、`package-lock.json`、このワークフローとヘルスチェック・ECR push のアクションが変わったとき)。手動実行 (dev か prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure<br/>ECR 2 つ + Infra] --> B[build<br/>Web のイメージ]
    A --> C[build-batch<br/>バッチのイメージ]
    B --> D[deploy<br/>全スタック + ヘルスチェック]
    C --> D
    D --> E[cloudfront-invalidation]
    E --> F[summary]
```

| ジョブ | 内容 |
|---|---|
| `infrastructure` | CDK の Bootstrap の後、`NagiyuAdminECR{Env}`、`NagiyuAdminBatchECR{Env}`、`NagiyuAdminInfra{Env}` の順にデプロイする |
| `build` | Web アプリをビルドし、イメージを ECR に push する |
| `build-batch` | バッチのイメージを ECR に push する (`infrastructure` の後、`build` と並行) |
| `deploy` | Secrets Manager から認証用のシークレット (`nagiyu-auth-nextauth-secret-{env}`) と VAPID のキーを取り、CDK で全スタックをデプロイする (`--all`)。そのあと Lambda の Function URL に `/api/health` を GET し、200 を確認する |
| `cloudfront-invalidation` | CloudFront のキャッシュを全パス (`/*`) 削除し、完了を待つ。ディストリビューションの ID が取れなければ、削除を飛ばす |
| `summary` | 各ジョブの結果を要約に出す (`always`) |

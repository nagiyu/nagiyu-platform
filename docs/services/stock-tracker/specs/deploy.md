---
sources:
  - infra/stock-tracker/bin/stock-tracker.ts
  - infra/stock-tracker/lib/cloudfront-stack.ts
  - infra/stock-tracker/lib/lambda-stack.ts
  - infra/stock-tracker/lib/eventbridge-stack.ts
  - .github/workflows/stock-tracker-deploy.yml
sources_hash: 0750e77a2a57f905b48d5441a1c6c610ed664a9914e0191fb1ba321dce6d961d
---

# Stock Tracker のデプロイ先

Stock Tracker は、Web アプリ (Lambda の Function URL を CloudFront で配信) と、EventBridge のルールで定期的に起動する 6 つのバッチ Lambda を AWS に載せる。dev と prod の両方にデプロイする。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `stock-tracker.dev.nagiyu.com` |
| prod | `stock-tracker.nagiyu.com` |

DNS レコードは、dev は CloudFront の基底スタックが、prod は shared の CNAME が作る。詳しくは [DNS レコードの作り方](../../../platform/specs/deploy.md#dns-レコードの作り方) を参照。

## スタック

`infra/stock-tracker/bin/stock-tracker.ts` が、次の順に作る。環境は CDK の context `env` (既定は `dev`) で決まり、`{Env}` は `Dev` または `Prod`。

| 順 | スタック | 役割 | 含む主なリソース |
|---|---|---|---|
| 1 | `NagiyuStockTrackerSecrets{Env}` | シークレット | Secrets Manager のシークレット (VAPID、Finnhub の API キー) |
| 2 | `NagiyuStockTrackerWebECR{Env}` | Web アプリのイメージの置き場 | ECR リポジトリ |
| 3 | `NagiyuStockTrackerBatchECR{Env}` | バッチのイメージの置き場 | ECR リポジトリ |
| 4 | `NagiyuStockTrackerDynamoDB{Env}` | データの保存 | DynamoDB のメインテーブル (シングルテーブル) |
| 5 | `NagiyuStockTrackerSNS{Env}` | アラームの通知先 | SNS トピック |
| 6 | `NagiyuStockTrackerLambda{Env}` | Web アプリとバッチの実行 | Web の Lambda 関数 (Function URL つき)、バッチの Lambda 関数 6 つ (minute、hourly、daily、summary、temporary-alert-expiry、forecast)、実行ロール。Web ECR・Batch ECR・Secrets・DynamoDB のスタックに依存する |
| 7 | `NagiyuStockTrackerCloudFront{Env}` | Web アプリの配信 | CloudFront ディストリビューション (Lambda の Function URL がオリジン)、noindex、dev の ALIAS。Lambda のスタックに依存する |
| 8 | `NagiyuStockTrackerEventBridge{Env}` | バッチの起動 | EventBridge のルール 6 つ (バッチの Lambda 関数ごとに 1 つ)。Lambda のスタックに依存する |
| 9 | `NagiyuStockTrackerAlarms{Env}` | 監視 | CloudWatch アラーム 17 個 (Web の Lambda、バッチの Lambda、DynamoDB のスロットリングなど)、通知先は SNS のトピック。Lambda・DynamoDB・SNS のスタックに依存する |

CloudFront のスタックは `us-east-1` に固定する (CloudFront の制約)。ほかのスタックのリージョンは、環境変数 `CDK_DEFAULT_REGION` で、未設定なら `us-east-1`。

## デプロイの流れ

`.github/workflows/stock-tracker-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (`services/stock-tracker/**`、`infra/stock-tracker/**`、`infra/common/**`、`libs/**`、`configs/**`、`package.json`、`package-lock.json`、このワークフローとヘルスチェック・ECR push のアクションが変わったとき)。手動実行 (dev か prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure-ecr<br/>ECR 2 つ + Secrets] --> B[build-web<br/>Web のイメージ]
    A --> C[build-batch<br/>バッチのイメージ]
    B --> D[infrastructure-app<br/>残りの全スタック]
    C --> D
    D --> E[verify<br/>ヘルスチェック]
```

| ジョブ | 内容 |
|---|---|
| `infrastructure-ecr` | `NagiyuStockTrackerWebECR{Env}`、`NagiyuStockTrackerBatchECR{Env}`、`NagiyuStockTrackerSecrets{Env}` をデプロイする |
| `build-web` | Web アプリをビルドし、イメージを ECR に push する |
| `build-batch` | バッチのイメージを ECR に push する (`infrastructure-ecr` の後、`build-web` と並行) |
| `infrastructure-app` | Secrets Manager から認証用のシークレット (`nagiyu-auth-nextauth-secret-{env}`)、VAPID のキー、Finnhub の API キーを取り、2 つの ECR のスタックを除く全スタックをデプロイする (`--all --exclude`) |
| `verify` | Lambda の Function URL に `/api/health` を GET し、200 を確認する |

CloudFront のキャッシュ削除は行わない。

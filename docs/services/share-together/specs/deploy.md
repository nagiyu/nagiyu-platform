---
sources:
  - infra/share-together/bin/share-together.ts
  - infra/share-together/lib/cloudfront-stack.ts
  - .github/workflows/share-together-deploy.yml
sources_hash: b7a4f31bcc8236e0e03941a9c1521bff9ba86a89ba4a74608ef5eb84343c5950
---

# share-together のデプロイ先

share-together は、Web アプリ (Lambda の Function URL を CloudFront で配信) を AWS に載せる。dev と prod の両方にデプロイする。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `share-together.dev.nagiyu.com` |
| prod | `share-together.nagiyu.com` |

DNS レコードは、dev は CloudFront の基底スタックが、prod は shared の CNAME が作る。詳しくは [DNS レコードの作り方](../../../platform/specs/deploy.md#dns-レコードの作り方) を参照。

## スタック

`infra/share-together/bin/share-together.ts` が、次の順に作る。環境は CDK の context `env` (既定は `dev`) で決まり、`{Env}` は `Dev` または `Prod`。

| 順 | スタック | 役割 | 含むリソース |
|---|---|---|---|
| 1 | `NagiyuShareTogetherDynamoDB{Env}` | データの保存 | DynamoDB テーブル |
| 2 | `NagiyuShareTogetherECR{Env}` | イメージの置き場 | ECR リポジトリ |
| 3 | `NagiyuShareTogetherLambda{Env}` | Web アプリの実行 | Lambda (Function URL つき) |
| 4 | `NagiyuShareTogetherCloudFront{Env}` | Web アプリの配信 | CloudFront、Route53 の ALIAS (dev のみ) |

CloudFront のスタックは `us-east-1` に固定する (CloudFront の制約)。ほかのスタックのリージョンは、環境変数 `CDK_DEFAULT_REGION` で、未設定なら `us-east-1`。

## デプロイの流れ

`.github/workflows/share-together-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (`services/share-together/**`、`infra/share-together/**`、`infra/common/**`、`infra/tsconfig.json`、`libs/**`、`configs/**`、`package.json`、`package-lock.json`、`.node-version`、このワークフローと、使う composite action・それが呼ぶスクリプトが変わったとき)。手動実行 (dev か prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure-ecr<br/>ECR + DynamoDB] --> B[build<br/>イメージ]
    B --> C[infrastructure-app<br/>全スタック + ヘルスチェック]
```

| ジョブ | 内容 |
|---|---|
| `infrastructure-ecr` | `NagiyuShareTogetherECR{Env}` と `NagiyuShareTogetherDynamoDB{Env}` をデプロイする |
| `build` | Web アプリをビルドし、イメージを ECR に push する |
| `infrastructure-app` | Secrets Manager の値を取り出し、全スタックをデプロイする (`--all`)。ワークフローは `--exclude` で ECR のスタックを除くつもりで渡しているが、CDK CLI は `--exclude` を受け付けず無視するため、ECR のスタックも含めた全スタックが対象になる。そのあと、CloudFront のスタックの出力からディストリビューションのドメイン名を取り出し、そのドメインでヘルスチェックを行う ([ヘルスチェック](../../../platform/specs/deploy.md#ヘルスチェック)) |

ヘルスチェックは別のジョブにせず、`infrastructure-app` の中で行う。CloudFront のキャッシュ削除は行わない。

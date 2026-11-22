---
sources:
  - infra/auth/bin/auth.ts
  - infra/auth/lib/cloudfront-stack.ts
  - .github/workflows/auth-deploy.yml
sources_hash: 7870484ebf711f3f6431f093e0f3cc88fd7ad24ca9c1267fd87dbfabeef77614
---

# Auth のデプロイ先

Auth は、全サービスの認証を担う Web アプリ (Lambda の Function URL を CloudFront で配信) を AWS に載せる。dev と prod の両方にデプロイする。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `auth.dev.nagiyu.com` |
| prod | `auth.nagiyu.com` |

DNS レコードは、dev は CloudFront の基底スタックが、prod は shared の CNAME が作る。詳しくは [DNS レコードの作り方](../../../platform/specs/deploy.md#dns-レコードの作り方) を参照。

## スタック

`infra/auth/bin/auth.ts` が、次の順に作る。環境は CDK の context `env` (既定は `dev`) で決まり、`{Env}` は `Dev` または `Prod`。

| 順 | スタック | 役割 | 含むリソース |
|---|---|---|---|
| 1 | `NagiyuAuthDynamoDB{Env}` | ユーザー情報の保存 | DynamoDB テーブル |
| 2 | `NagiyuAuthSecrets{Env}` | 認証のシークレット | Secrets Manager のシークレット |
| 3 | `NagiyuAuthStripeSecrets{Env}` | 決済のシークレット | Secrets Manager のシークレット |
| 4 | `NagiyuAuthECR{Env}` | イメージの置き場 | ECR リポジトリ |
| 5 | `NagiyuAuthLambda{Env}` | Web アプリの実行 | Lambda (Function URL つき) |
| 6 | `NagiyuAuthCloudFront{Env}` | Web アプリの配信 | CloudFront、Route53 の ALIAS (dev のみ) |

- CloudFront のスタックは `us-east-1` に固定する (CloudFront の制約)。ほかのスタックのリージョンは、環境変数 `CDK_DEFAULT_REGION` で、未設定なら `us-east-1`。

## デプロイの流れ

`.github/workflows/auth-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (`services/auth/**`、`libs/**`、`configs/**`、`infra/auth/**`、`infra/common/**`、`package.json`、`package-lock.json`、このワークフローとヘルスチェック・ECR push のアクションが変わったとき)。手動実行 (dev か prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure<br/>DynamoDB・Secrets・ECR] --> B[build<br/>イメージ]
    B --> C[deploy<br/>全スタック + ヘルスチェック]
    C --> D[cloudfront-invalidation]
    D --> E[summary]
```

| ジョブ | 内容 |
|---|---|
| `infrastructure` | CDK の Bootstrap の後、`NagiyuAuthDynamoDB{Env}`、`NagiyuAuthSecrets{Env}`、`NagiyuAuthStripeSecrets{Env}`、`NagiyuAuthECR{Env}` をデプロイする |
| `build` | Web アプリをビルドし、イメージを ECR に push する |
| `deploy` | Secrets Manager の値を取り出し、CDK で全スタックをデプロイする (`--all`)。そのあと、CloudFront のスタックの出力からディストリビューションのドメイン名を取り出し、そのドメインでヘルスチェックを行う ([ヘルスチェック](../../../platform/specs/deploy.md#ヘルスチェック)) |
| `cloudfront-invalidation` | CloudFront のキャッシュを全パス (`/*`) 削除し、完了を待つ。ディストリビューションの ID が取れなければ、削除を飛ばす |
| `summary` | 各ジョブの結果を要約に出す (`always`) |

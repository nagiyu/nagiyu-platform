---
sources:
  - infra/codec-converter/bin/codec-converter.ts
  - infra/codec-converter/lib/codec-converter-stack.ts
  - .github/workflows/codec-converter-deploy.yml
sources_hash: 73b92f39cef592758fd4ecbb9cebde5d490cd8149f721d5a5a089dc85e3f8d2a
---

# Codec Converter のデプロイ先

Codec Converter の Web は Lambda (コンテナイメージ) の Function URL を CloudFront の背後に置いて公開する。変換の実行は AWS Batch が行う。アプリ本体のリソースは 1 つのスタックにまとまっている。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `codec-converter.dev.nagiyu.com` |
| prod | `codec-converter.nagiyu.com` |

ホスト名は、共通のホスト名の組み立て関数ではなく、SSM のドメイン名 (`ACM_DOMAIN_NAME`) の値の前に `codec-converter.` を付けて作る (`infra/codec-converter/lib/codec-converter-stack.ts`)。SSM の値はアカウントごとに違い、dev アカウントでは `dev.nagiyu.com`、prod アカウントでは `nagiyu.com` が入る。そのため dev と prod で分岐せず同じ式で足りる。

DNS レコードは、dev だけ `NagiyuCodecConverterDev` が自分のスタックで ALIAS を作る。prod は shared の CNAME 一覧に入っており、このスタックでは作らない。共通のしくみは [デプロイ先 (platform)](../../../platform/specs/deploy.md) を参照する。

## スタック

`infra/codec-converter/bin/codec-converter.ts` が、次の順に作る。環境は CDK の context `env` (既定は `dev`) で決まり、`{Env}` は `Dev` / `Prod` である。

| 順 | スタック | 役割 | 含むリソース |
|---|---|---|---|
| 1 | `NagiyuCodecConverterECR{Env}` | Web のイメージの置き場 | ECR リポジトリ |
| 2 | `NagiyuCodecConverterBatchECR{Env}` | 変換ワーカーのイメージの置き場 | ECR リポジトリ |
| 3 | `NagiyuCodecConverter{Env}` | アプリ本体 | S3 バケット、DynamoDB テーブル、Lambda (Function URL つき)、AWS Batch、CloudFront、Route53 の ALIAS (dev のみ) |

## デプロイの流れ

`.github/workflows/codec-converter-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (サービス・infra・libs・configs・共有 action などのパスが変わったとき)。手動実行 (dev / prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[prepare-infrastructure<br/>CDK bootstrap / ECR 2 スタック] --> B[build-web<br/>Web のイメージを push]
    A --> C[build-batch<br/>ワーカーのイメージを push]
    B --> D[deploy<br/>アプリ本体のスタック]
    C --> D
    D --> E[CloudFront のヘルスチェック]
```

| ジョブ | 内容 |
|---|---|
| `prepare-infrastructure` | CDK の bootstrap を実行し、ECR の 2 スタックをデプロイする |
| `build-web` | Web のイメージをビルドして ECR に push する |
| `build-batch` | ワーカーのイメージをビルドして ECR に push する (`build-web` と並行) |
| `deploy` | アプリ本体のスタックをデプロイし、スタックの出力から CloudFront のドメイン名 (`CloudFrontDomainName`) を取り出し、そのドメインでヘルスチェックを行う ([ヘルスチェック](../../../platform/specs/deploy.md#ヘルスチェック)) |

## 理由

ECR のスタックを本体と分けるのは、本体より先にデプロイしてイメージを push できる状態にするためである。

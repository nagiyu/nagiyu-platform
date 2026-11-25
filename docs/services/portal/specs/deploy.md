---
sources:
  - infra/bin/nagiyu-platform.ts
  - infra/root/cloudfront-lambda-stack.ts
  - infra/root/cloudfront-stack.ts
  - .github/workflows/root-deploy.yml
sources_hash: 7dc5f489134f4bae6755ad971a498508c4b1beffcbe04f66fa230e55e6129b7a
---

# Portal のデプロイ先

Portal はルートドメイン (apex) で公開する。実行の形が環境で違い、dev は Lambda の Function URL を CloudFront の背後に置き、prod は ECS (Fargate) を ALB と CloudFront の背後に置く。インフラの定義は `infra/root/` にあり、CDK の app は `infra/bin/nagiyu-platform.ts` である。スタックはすべて `us-east-1` に作られる。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `dev.nagiyu.com` |
| prod | `nagiyu.com` |

ホスト名は、サブドメインを付ける共通の組み立て関数を使わず、`infra/root/cloudfront-lambda-stack.ts` (dev) と `infra/root/cloudfront-stack.ts` (prod) が環境で書き分けている。どちらもサブドメインのない apex である。

DNS レコードは、dev は `NagiyuRootCloudFrontDev` がゾーンの頂点に ALIAS を作る。prod は shared が apex の ALIAS を直書きしており、`NagiyuRootCloudFrontProd` はレコードを作らない。共通のしくみは [デプロイ先 (platform)](../../../platform/specs/deploy.md) を参照する。

## スタック

環境は環境変数 `ENVIRONMENT` (既定は `dev`) で決まり、`{Env}` は `Dev` / `Prod` である。`infra/bin/nagiyu-platform.ts` は、ECR のスタックを両環境で作り、それ以外は環境で分岐する。

| 環境 | 順 | スタック | 役割 | 含むリソース |
|---|---|---|---|---|
| 共通 | 1 | `NagiyuPortalEcr{Env}` | イメージの置き場 | ECR リポジトリ |
| dev | 2 | `NagiyuPortalLambdaDev` | アプリの実行 | Lambda (Function URL つき) |
| dev | 3 | `NagiyuRootCloudFrontDev` | 公開の入口と DNS | CloudFront、Route53 の ALIAS |
| prod | 2 | `NagiyuRootClusterProd` | 実行基盤 | ECS クラスター |
| prod | 3 | `NagiyuRootAlbProd` | アプリの入口 | ALB |
| prod | 4 | `NagiyuRootServiceProd` | アプリの実行 | ECS サービス (Fargate) |
| prod | 5 | `NagiyuRootCloudFrontProd` | 公開の入口 | CloudFront |

dev の CloudFront スタックは、共通の CloudFront の基底スタックの上に作る。prod の CloudFront スタックは基底スタックを使わず、ALB の DNS 名と証明書を SSM から読んで直接組み立てる。

## デプロイの流れ

`.github/workflows/root-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (Portal・`infra/root/`・`infra/bin/`・libs・configs・共有 action などのパスが変わったとき)。手動実行 (dev / prod を選ぶ) |
| デプロイ先の環境 | [dev と prod の切り替え](../../../platform/specs/deploy.md#dev-と-prod-の切り替え) の規則 |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure-ecr<br/>ECR スタック] --> B[build<br/>イメージを push]
    B --> C{環境}
    C -->|dev| D[Lambda と CloudFront をデプロイ]
    C -->|prod| E[Cluster / Alb / Service / CloudFront をデプロイ]
    E --> F[ECS サービスの安定待ち]
    D --> G[verify<br/>CloudFront のヘルスチェック]
    F --> G
```

| ジョブ | 内容 |
|---|---|
| `infrastructure-ecr` | ECR のスタックをデプロイする |
| `build` | イメージをビルドして ECR に push する |
| `infrastructure-app` | dev は Lambda と CloudFront のスタックをデプロイする。prod は Cluster・ALB・Service・CloudFront のスタックをデプロイし、ECS サービスが安定するまで待つ |
| `verify` | CloudFront のスタックの出力からディストリビューションのドメイン名を取り出し、ヘルスチェックを行う ([ヘルスチェック](../../../platform/specs/deploy.md#ヘルスチェック))。環境の独自ドメインではなく CloudFront のドメインを叩く |

## 理由

- dev と prod で実行基盤を分けている。prod は ECS の常時稼働のコンテナで動かし、コールドスタートを避ける。広告 (AdSense) の審査担当者を含めて、訪問者がいつでも速く応答するページを見られるようにするためである。dev はアクセスが少ないので、Lambda で動かし、常時稼働のコストを持たない。

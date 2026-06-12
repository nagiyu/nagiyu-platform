---
title: 'GitHub Actions でモノレポの差分デプロイを実装する'
description: 'モノレポ構成で GitHub Actions を使い、変更があったサービスだけをデプロイするワークフローの実装方法を解説。paths フィルタ・dorny/paths-filter・依存ライブラリ変更時の波及・並列実行までカバーします。'
slug: 'github-actions-monorepo-deploy'
publishedAt: '2026-04-02'
updatedAt: '2026-06-06'
author: 'なぎゆー'
tags: ['GitHub Actions', 'CI/CD', 'monorepo']
categories: ['dev-stack']
featured: true
---

## はじめに

モノレポでは「すべての PR で全サービスをデプロイする」運用は無駄が多すぎます。実装が変わったサービスだけビルド・デプロイすることで、CI 時間と AWS コストを大きく削減できます。本記事では nagiyu-platform で運用している差分デプロイ方法を整理します。

## 基本：paths フィルタ

GitHub Actions のトリガーには `paths` フィルタがあります。

```yaml
name: Deploy Portal

on:
  push:
    branches: [develop, master]
    paths:
      - 'services/portal/**'
      - 'libs/common/**'
      - 'libs/ui/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "Deploy portal"
```

`services/portal/**` か共有ライブラリ（`libs/common`, `libs/ui`）が変更されたときだけ起動します。サービスごとにこのワークフローを 1 つずつ用意すれば、それぞれが独立に判定されます。

## サービスごとに 1 ファイルが基本

```
.github/workflows/
├── portal-deploy.yml
├── tools-deploy.yml
├── stock-tracker-deploy.yml
├── codec-converter-deploy.yml
└── shared-deploy.yml
```

「サービスを増やしたらワークフローを 1 つ足す」というシンプルな対応関係に保つと、後からの追跡が楽です。

## 依存ライブラリ変更の波及

`libs/common` を変更すると、それを使うすべてのサービスをデプロイし直す必要があります。**各サービスのワークフローの `paths` に共有ライブラリのパスを書く** のがシンプルな解決策です。

```yaml
paths:
  - 'services/portal/**'
  - 'libs/common/**'
  - 'libs/ui/**'
```

`libs/common` を変更した PR では、portal だけでなく他のサービスのワークフローも起動します。これは「無駄に動いているように見える」かもしれませんが、**依存先で本当に壊れていないかを CI で確認できる安全装置** として機能します。

## より細かい差分判定: dorny/paths-filter

`paths` フィルタはワークフローの起動レベルでしか効かないので、「ワークフロー内で更にジョブを枝分かれさせたい」場合は `dorny/paths-filter` を使います。

```yaml
jobs:
  detect-changes:
    runs-on: ubuntu-latest
    outputs:
      portal: ${{ steps.filter.outputs.portal }}
      tools: ${{ steps.filter.outputs.tools }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            portal:
              - 'services/portal/**'
              - 'libs/**'
            tools:
              - 'services/tools/**'
              - 'libs/**'

  deploy-portal:
    needs: detect-changes
    if: needs.detect-changes.outputs.portal == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy portal"

  deploy-tools:
    needs: detect-changes
    if: needs.detect-changes.outputs.tools == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploy tools"
```

1 つのワークフローで複数サービスを判定し、必要なものだけ並列起動するパターン。「全サービスの状態を 1 画面で見たい」運用に向いています。

## キャッシュで高速化

サービス共通の `node_modules` を毎回入れ直すのは時間の無駄なので、キャッシュします。

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm'
    cache-dependency-path: package-lock.json

- name: Install dependencies
  run: npm ci
```

`actions/setup-node@v4` の `cache: 'npm'` は `package-lock.json` のハッシュをキーにしてキャッシュを引きます。**モノレポではルートの 1 つの lock を指定する**ことで、全サービスで同じキャッシュが使えます。

## 環境別の振り分け

`develop` ブランチで dev に、`master` ブランチで prod にデプロイ、というパターンは setup-environment アクションを内製化すると CI がきれいになります。

```yaml
- name: Setup environment
  id: env
  run: |
    if [[ "$GITHUB_REF" == "refs/heads/master" ]]; then
      echo "environment=prod" >> $GITHUB_OUTPUT
    else
      echo "environment=dev" >> $GITHUB_OUTPUT
    fi

- name: Deploy
  env:
    ENV: ${{ steps.env.outputs.environment }}
  run: ./deploy.sh
```

複数サービスで同じロジックが要るので、`.github/actions/setup-environment/action.yml` のように Composite Action 化して再利用するとさらに整理できます。

## OIDC で AWS 認証（推奨構成 / 移行検討中）

長期 IAM キーを GitHub Secrets に貼るのではなく、OIDC で短期 AssumeRole するのが推奨されている手法です。なお nagiyu-platform 自体は現時点で `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を Secrets に置く長期キー運用のままであり、OIDC は移行候補として検証段階にあります。将来移行する想定で、参考として構成を紹介します。

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
      aws-region: ap-northeast-1
```

IAM ロール側で「特定リポジトリ・特定ブランチからのみ AssumeRole 可能」と制限できるので、Secret 漏洩リスクが大幅に下がります。

## 並列ジョブ間の調整

ECS の同一サービスに 2 つのデプロイが同時に走ると競合します。`concurrency` で重複起動を抑制します。

```yaml
concurrency:
  group: deploy-portal-${{ github.ref }}
  cancel-in-progress: false
```

`cancel-in-progress: false` にすると、走行中のデプロイは完走させて、新しい push は待機します。`true` にすると古いデプロイは即時キャンセルされて新しいほうが優先されます。本番デプロイは `false`、CI 検証だけのジョブは `true` という使い分けが定番です。

## 実装ノート

記事の例では `portal-deploy.yml` のような名前を出しましたが、nagiyu-platform で Portal を実際にデプロイしているのは `root-deploy.yml`（Root Domain）です。トリガーの `paths` には `services/portal/**` だけでなく `libs/**`・`infra/root/**`・`infra/common/**`・ルートの `package.json` / `package-lock.json`、さらに `.github/workflows/root-deploy.yml` 自身まで含めています。私はワークフロー定義の変更でも再デプロイが走るようにしておくのを好んでいて、こうすると「CI を直したのに反映されない」という事故を防げます。

共通処理は composite action に切り出しました。`setup-node`（Node 24 + npm キャッシュ + `npm ci`）、`build-web-app`（shared workspaces をカンマ区切りで先にビルドしてからアプリをビルド）、`build-docker-image`（後述のロック付き docker build）です。同じ手順を各サービスのワークフローへコピペせずに済むので、自分のように複数サービスを抱えていると保守がかなり楽になりました。ECR リポジトリの URI も固定では書かず、`aws cloudformation describe-stacks` の Outputs（`RepositoryUri`）から動的に取得しています。

## ハマったポイント

`paths` フィルタ周りの一般的な落とし穴に加えて、自分が nagiyu-platform で実際に対処したポイントを残します。

- **`paths-ignore` との混同**: `paths` が指定された変更があるとき発火。`paths-ignore` はそれ以外で発火。両方併用すると挙動が混乱する。
- **PR と push の切り替え**: PR では `pull_request.paths`、merge 後のデプロイは `push.paths` で発火する。両方書く必要がある。
- **Public ECR のレート制限**: Lambda Web Adapter など `public.ecr.aws` から pull するイメージがあると `toomanyrequests` に当たることがある。私は `docker-build-with-retry.sh` を挟み、`toomanyrequests` を検知したら最大 5 回・60 秒待ちでリトライするようにしています。
- **同時 docker build の競合**: GitHub Actions のランナーはワークフロー横断で並列に走るため、複数の build が同時にリソースを食い合います。nagiyu-platform では S3 をセマフォにした自前ロック（バケット `nagiyu-docker-build-lock`、同時実行上限 3）で全体の同時ビルド数を絞り、`build-docker-image` の前後で acquire / release（release は `if: always()`）しています。
- **`dorny/paths-filter` の基準 SHA**: 基準を指定しないと PR のベース差分しか見ない。直接 push では `base: HEAD~1` のような指定が要ることがある。

## 現在の運用

Portal の `root-deploy.yml` は `infrastructure-ecr → build → infrastructure-app → verify` の 4 ジョブ構成で、環境分岐は `setup-environment` composite action が握っています。`master` への push なら prod、それ以外（`develop` / `integration/**`）は dev、`workflow_dispatch` の入力でも上書き可能で、`Dev` / `Prod` のスタックサフィックスを出力します。デプロイ実体は dev では同じイメージで Lambda を `update-function-code` 更新、prod では ECS を force new deployment して `services-stable` を待つ、という分岐です。最後に `verify` ジョブが CloudFront ドメイン宛に `/api/health` を叩いて疎通を確認します。

正直に書いておくと、AWS 認証は記事で勧めた OIDC ではなく、私はまだ `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を Secrets に置く長期キー運用のままです。push するイメージタグも SHA は付けず `:latest` 1 本に割り切っています。動いてはいますが、OIDC 化とタグ戦略の見直しは、自分のなかで明確な改善の宿題として残しています。

## まとめ

GitHub Actions の `paths` フィルタを基本に、必要なら `dorny/paths-filter` で細かく分岐する、という二段構えで差分デプロイは綺麗に書けます。共有ライブラリの波及を `paths` に明示することで、依存先の動作確認も自動化できます。CI 時間とコストの両方を削減しつつ、安全性も保てる構成です。

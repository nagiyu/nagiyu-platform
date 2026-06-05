---
title: 'GitHub Actions でモノレポの差分デプロイを実装する'
description: 'モノレポ構成で GitHub Actions を使い、変更があったサービスだけをデプロイするワークフローの実装方法を解説。paths フィルタ・dorny/paths-filter・依存ライブラリ変更時の波及・並列実行までカバーします。'
slug: 'github-actions-monorepo-deploy'
publishedAt: '2026-04-02'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['GitHub Actions', 'CI/CD', 'monorepo']
categories: ['dev-stack']
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
    node-version: '20'
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

## OIDC で AWS 認証

長期 IAM キーを GitHub Secrets に貼るのではなく、OIDC で短期 AssumeRole するのが推奨です。

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

## ハマりどころ

- **`paths-ignore` との混同**: `paths` が指定された変更があるとき発火。`paths-ignore` はそれ以外で発火。両方併用すると挙動が混乱する。
- **PR と push の切り替え**: PR では `pull_request.paths`、merge 後の本番デプロイは `push.paths` で発火する。両方書く必要がある。
- **マージコミットでの差分判定**: `dorny/paths-filter` は基準の SHA を指定しないと PR のベース差分しか見ない。masterへの直接 push では `base: HEAD~1` のような指定が必要なことがある。
- **`paths` を絞りすぎて release 時に動かない**: GitHub Releases で発火するワークフローには `paths` は効かない。`workflow_dispatch` や `release` イベント側で別途制御。

## まとめ

GitHub Actions の `paths` フィルタを基本に、必要なら `dorny/paths-filter` で細かく分岐する、という二段構えで差分デプロイは綺麗に書けます。共有ライブラリの波及を `paths` に明示することで、依存先の動作確認も自動化できます。CI 時間とコストの両方を削減しつつ、安全性も保てる構成です。

---
title: 'Lambda コールドスタート対策：Provisioned Concurrency と SnapStart の使い分け'
description: 'AWS Lambda のコールドスタートを抑える 2 大手法、Provisioned Concurrency と SnapStart の仕組み・コスト・対応ランタイムを比較。実運用で「どちらをどう使うか」を判断するための整理。'
slug: 'lambda-cold-start'
publishedAt: '2026-04-03'
updatedAt: '2026-05-31'
author: 'なぎゆー'
tags: ['AWS', 'Lambda', 'パフォーマンス']
categories: ['aws']
---

## はじめに

Lambda のコールドスタートは、低頻度 API・予測不能なスパイク・SLA 厳しい用途で大きな問題になります。AWS は **Provisioned Concurrency** と **SnapStart** という 2 つの主要対策を提供しており、それぞれ得意領域が違います。本記事では実運用での使い分けを整理します。

## コールドスタートの解剖

Lambda 起動時の時間は次の合計です。

```
[1] コンテナ初期化（ベース）   100ms 前後
[2] ランタイム起動（Node.js）  100〜300ms
[3] init コード実行            アプリ依存（10ms〜数秒）
[4] ハンドラ実行               アプリのロジック
```

[1] と [2] は AWS 側、[3] はコードベースの初期化処理（DB 接続・SDK インスタンス化など）です。**[3] が長いほどコールドスタートが目立ちます**。

## 対策 1: Provisioned Concurrency

指定数の Lambda 実行環境を **常時温めて待機**させます。事前に [3] までを完了させた状態で待つので、コールドスタートが実質 0 になります。

```hcl
resource "aws_lambda_provisioned_concurrency_config" "api" {
  function_name                     = aws_lambda_function.api.function_name
  qualifier                         = aws_lambda_alias.live.name
  provisioned_concurrent_executions = 5
}
```

特徴:

- **対応ランタイム**: 全ランタイム
- **待機時間に対する課金**が発生（GB 秒単位）。リクエストが少なくても費用は固定
- **Auto Scaling と連携**可能（`aws_appautoscaling_target`）。ピーク時間帯だけ多く確保

向いている用途:

- 1 日中安定したトラフィックがある API
- Cognito の認証 Lambda のような「リクエスト即応」が要る処理

## 対策 2: SnapStart

Lambda 実行環境のスナップショットを取って、リクエスト時にそのスナップショットから起動します。**待機コストなし**で、コールドスタートを大幅に短縮できます。

```hcl
resource "aws_lambda_function" "api" {
  function_name = "nagiyu-api"
  runtime       = "java21"  # Java / Python / .NET 対応
  snap_start {
    apply_on = "PublishedVersions"
  }
}
```

特徴:

- **対応ランタイム**: Java 11 以降、Python 3.12 以降、.NET 8 以降（**Node.js は未対応**、2026 年時点）
- **追加コストなし**（スナップショットのストレージ料金のみ）
- 初期化済みの状態を復元するため、init 処理に依存する初期値（ランダム値・タイムスタンプなど）が固定される副作用に注意

向いている用途:

- Java の大規模 init を持つアプリ（Spring Boot 系）
- Python のヘビーな依存（Pandas、scikit-learn）

## どっちを選ぶか

```
リクエスト頻度が高く安定している
  → Provisioned Concurrency

呼び出しが断続的・スパイクが大きい
  → SnapStart（対応ランタイムなら）

Node.js を使っている
  → Provisioned Concurrency 一択（SnapStart 未対応）

両方使う
  → 高優先度関数だけ Provisioned、それ以外は SnapStart
```

nagiyu-platform は Node.js 中心なので、現状は Provisioned Concurrency か、そもそも ECS Fargate に切り替えるかの二択です。

## コールドスタートを最小化するコード上の工夫

両手法を導入する前に、コード側でできる対策が多くあります。

### 1. import を遅らせる

```typescript
// 悪い: 巨大な SDK をハンドラ外で全部 import
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

// 良い: ハンドラ内で必要なものだけ動的 import
export async function handler(event: Event) {
  if (event.type === 's3') {
    const { S3Client } = await import('@aws-sdk/client-s3');
    // ...
  }
}
```

すべての分岐で同じ依存を使うわけではない場合、動的 import で初期化を遅らせると [3] が短縮します。

### 2. SDK バージョン v3 + minimal package

AWS SDK v3 はサービスごとに分割されています。`aws-sdk` v2 ではなく `@aws-sdk/client-s3` を使うことで、bundle サイズが大きく減ります。

### 3. Webpack / esbuild で tree-shake

`bundle: 'esbuild'` を Serverless Framework / SAM で指定すると、未使用 export が削られて起動が速くなります。

### 4. グローバル変数で再利用

```typescript
let cachedClient: S3Client | undefined;

function getClient(): S3Client {
  if (!cachedClient) {
    cachedClient = new S3Client({ region: 'ap-northeast-1' });
  }
  return cachedClient;
}
```

ハンドラ呼び出しが連続する間は同一プロセスが再利用されるので、初期化済みのインスタンスを使い回せます。

## モニタリング

CloudWatch Logs Insights で初期化時間を計測:

```sql
fields @timestamp, @initDuration, @duration
| filter @type = 'REPORT'
| stats avg(@initDuration), max(@initDuration), pct(@initDuration, 95) by bin(5m)
```

`@initDuration` がコールドスタート時のみ記録されます。p95 が 500ms を超えるなら対策の検討対象、1s を超えるなら緊急、という目安です。

## 実装ノート

nagiyu-platform の Portal は、この記事でいう「Node.js × コールドスタート」に正面から向き合う必要があったサービスです。`infra/root/portal-lambda-stack.ts` を見ると、dev 環境の Portal は Lambda（`memorySize: 1024`、`timeout: 30` 秒、Function URL 有効）として動いています。

ここで私が下した判断は、本文の早見表どおりです。Portal は Node.js で書かれているため SnapStart は使えず、選択肢は「Provisioned Concurrency を入れる」か「そもそも ECS Fargate に逃がす」かの二択になります。自分は **dev は素の Lambda のまま、prod は ECS Fargate に切り替える**という形で割り切りました。dev は自分のテストアクセスが中心でコールドスタートが多少出ても困らない一方、prod はユーザーが触る常時稼働なので、コールドスタートという問題自体を Fargate で消してしまうほうが素直だと考えたためです。

`memorySize` を 1024 にしているのも理由があって、Lambda はメモリ割当に比例して CPU も増えるため、init 処理（`[3]`）を速くするには控えめなメモリより少し盛ったほうが結果的にコールドスタートが縮みます。dev では 1024 で十分という感触です。

## ハマったポイント

- **Provisioned Concurrency が「スピルオーバー」する**: 設定数を超えるリクエストは通常の起動になり、コールドスタートが発生する。Auto Scaling で上限を超えないよう調整。
- **SnapStart のスナップショット時間**: 初回スナップショット取得時は 5〜10 秒かかる。デプロイのリードタイムが伸びる。
- **DB 接続プール**: Lambda 実行環境ごとに別プロセスのため、接続プールは小さく（1〜3）。RDS Proxy を間に挟むのが定番。
- **VPC Lambda の ENI 確保**: VPC 内 Lambda は ENI を共有プールから確保するので、初回起動が遅い。VPC 外で動かせるなら外す。
- **Provisioned Concurrency の課金見落とし**: リクエストがゼロでも待機料金が発生し続ける。トラフィックが激減した API に設定しっぱなしにしない。

この「課金見落とし」が怖くて、私は dev の Portal Lambda には Provisioned Concurrency を入れていません。dev で待機料金を払い続けるのは本末転倒なので、コールドスタートは許容する、という割り切りです。コスト最適化のための Lambda なのに Provisioned で固定費を生んでしまっては意味がない、という感覚は実運用してみて強くなりました。

## 現在の運用

まとめると、nagiyu-platform の Portal では **コールドスタート対策として個別の手法（Provisioned Concurrency / SnapStart）を採用していません**。代わりに「環境で基盤を分ける」ことで対処しています ── dev は素の Node.js Lambda（Function URL）、prod は ECS Fargate。これは本文の「Node.js を使っている → Provisioned 一択。あるいはそもそも ECS Fargate に切り替えるか」という選択肢のうち、自分は後者を本番採用した実例です。

もし将来 prod を Lambda に戻したくなったら、その時点で Provisioned Concurrency を Auto Scaling と組み合わせて入れる、というのが今描いている次の打ち手です。

## まとめ

Provisioned Concurrency と SnapStart は補完関係にあり、ランタイムとアクセスパターンで使い分けが決まります。Node.js なら Provisioned 一択、Java / Python なら SnapStart が第一候補。コード側の最適化（動的 import、SDK 分割、グローバルキャッシュ）も併用すれば、追加コストなしでも体感速度を改善できます。

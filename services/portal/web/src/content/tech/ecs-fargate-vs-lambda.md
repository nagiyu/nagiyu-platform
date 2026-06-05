---
title: 'ECS Fargate と Lambda の使い分け基準を実運用で整理する'
description: 'AWS の ECS Fargate と Lambda、どちらでサービスを動かすべきか迷う場面の判断基準を整理。コールドスタート・常時稼働コスト・実行時間・依存ライブラリサイズなど、実運用で効いてくる観点ごとに比較します。'
slug: 'ecs-fargate-vs-lambda'
publishedAt: '2026-04-25'
updatedAt: '2026-05-31'
author: 'なぎゆー'
tags: ['AWS', 'ECS', 'Lambda', 'アーキテクチャ']
categories: ['aws']
---

## はじめに

nagiyu-platform では、サービスごとに ECS Fargate と Lambda を使い分けています。「コンテナでアプリを動かしたい」というとき AWS には複数の選択肢がありますが、本記事では実装・運用していて効いてくる判断軸を整理します。

## 結論からの早見表

| 観点             | ECS Fargate            | Lambda                       |
| ---------------- | ---------------------- | ---------------------------- |
| 課金単位         | タスク稼働時間（秒）   | リクエスト時間（ミリ秒）     |
| コールドスタート | なし                   | あり（〜数秒）               |
| 最大実行時間     | 無制限                 | 15 分                        |
| 同時実行制御     | タスク数で固定         | 自動スケール（上限まで）     |
| デプロイ単位     | コンテナイメージ       | zip / コンテナイメージ       |
| 最小コスト/月    | 数千円〜（常時稼働分） | 0 円〜（リクエストなし時）   |
| 向いている用途   | 常時アクセスがある Web | スパイク・バッチ・低頻度 API |

## 観点 1: コールドスタート許容度

Lambda は呼び出されてからコンテナを起動するため、初回や久々の呼び出しで **数百 ms〜数秒のコールドスタート**が発生します。Provisioned Concurrency や SnapStart で軽減できますが、それぞれ追加コストと制約があります。

ユーザーが「ページ表示開始までに 2 秒待つ」を許容できないサービス（ポータルのトップページ、ログイン直後のダッシュボード）は ECS Fargate のほうが安定します。逆に管理画面の API や、cron で動くバッチであればコールドスタートは許容できます。

## 観点 2: アクセス頻度と稼働コスト

AWS Fargate は **最小タスクが常時稼働しているコスト**が発生します。`0.25 vCPU + 0.5 GB` の最小構成でも東京リージョンで月 $10 程度。一方 Lambda は 0 リクエストなら 0 円です。

ざっくりとした損益分岐点:

- 1 日に数十リクエスト程度 → Lambda が圧倒的に安い
- 1 日に数千〜数万リクエスト → 拮抗
- 数十万リクエスト以上 → ECS Fargate のほうが安くなることが多い（タスクは固定で水平スケールも段階的）

nagiyu の Tools サービスはアクセスが軽いので Lambda、ポータル本体は常時アクセスがあるので Fargate、と棲み分けています。

## 観点 3: 実行時間の上限

Lambda は **最大 15 分**で強制終了します。動画変換・大容量ファイルの加工・大量データの集計など、15 分を超える可能性がある処理は **Fargate タスクや AWS Batch** で動かす必要があります。

nagiyu-platform の Quick Clip / Codec Converter は処理時間が読みにくいので、Lambda ではなく AWS Batch（Fargate ベース）でジョブを実行しています。

## 観点 4: パッケージサイズと依存

Lambda の zip デプロイは `250 MB`（解凍後）の上限があります。FFmpeg・Chromium・Pandoc などのバイナリを含めると簡単に超えてしまうので、その場合は Lambda コンテナイメージ（10 GB まで）か Fargate を選びます。

```dockerfile
# Lambda コンテナでも FFmpeg を入れる例
FROM public.ecr.aws/lambda/nodejs:20
RUN dnf install -y ffmpeg
COPY index.mjs ./
CMD ["index.handler"]
```

ただし Lambda コンテナはコールドスタートが zip より長くなる傾向があります。「コンテナで動かすなら Fargate のほうが素直では？」という判断にもつながります。

## 観点 5: 状態とキャッシュ

Lambda は呼び出しごとに新しい実行環境が立ち上がる前提で、メモリ上のキャッシュが効きにくい構造です（同一コンテナの再利用はあるが保証されない）。

Fargate は同一タスクが動き続けるので、`Map` や `LRU` を使ったプロセス内キャッシュが安定して効きます。DB アクセスを減らしたい・外部 API のレスポンスを長期キャッシュしたい場合に有利です。

```typescript
// Fargate なら素直にプロセス内キャッシュが効く
const cache = new Map<string, User>();

export async function getUser(id: string): Promise<User> {
  const cached = cache.get(id);
  if (cached) return cached;
  const user = await db.users.findUnique({ where: { id } });
  cache.set(id, user);
  return user;
}
```

Lambda で同じことをすると、コンテナが切り替わったタイミングでキャッシュが破棄されます。ElastiCache や DynamoDB Cache を別途用意する選択肢もありますが、コストと複雑度が増します。

## 観点 6: ローカル開発との一致

Fargate は Docker そのものなので、`docker run` でローカル実行した挙動が本番と揃います。一方 Lambda は AWS Lambda Runtime API という独自のエントリポイントがあり、SAM Local や AWS Lambda Web Adapter を使わないとローカル再現がやや手間です。

Next.js のような既存フレームワーク資産を素直に活かしたい場合は Fargate が選びやすく、シンプルなハンドラ単位で済むなら Lambda で十分です。

## 実装ノート

この使い分けは抽象論ではなく、私が nagiyu-platform の Portal そのもので採っている構成です。面白いのは、**同じ Portal を環境ごとに別基盤に載せている**点です。

- **dev**: `PortalLambdaStack`（`infra/root/portal-lambda-stack.ts`）で Lambda として起動。`memorySize: 1024`、`timeout: 30` 秒、Function URL を有効化して CloudFront のオリジンにしています。dev はアクセスがほぼ自分のテストだけなので、0 リクエスト時に課金されない Lambda が圧倒的に向いています。
- **prod**: `EcsServiceStack` で ECS Fargate として常時稼働。コールドスタートを避けたいのと、Next.js（standalone）の挙動を Docker のまま揃えたいのが理由です。

「同じアプリでも、呼び出し頻度が違えば最適な基盤は変わる」というのを、自分は 1 つのサービスの dev / prod で体験している格好です。本文の早見表でいう **最小コスト**と**コールドスタート**の 2 軸が、そのまま dev = Lambda / prod = Fargate の判断理由になっています。

## ハマったポイント

- **Lambda 同時実行数の上限**: アカウント全体で初期 1,000、超過するとスロットリング。重要 API には Reserved Concurrency を確保する。
- **Fargate の VPC 内 IP 枯渇**: タスクが起動するたびに ENI（IP）を消費する。サブネットの CIDR を狭く設計しすぎると Auto Scaling 時に枯渇する。
- **NAT Gateway 経由の通信コスト**: Fargate を Private Subnet に置くと、外部 API 呼び出しが NAT Gateway 経由でデータ転送料金がかかる。VPC Endpoint で逃がせるサービス（S3・DynamoDB など）は逃がす。

NAT Gateway のコストは私も気になったので、nagiyu-platform の prod Fargate タスクは Private ではなく **Public Subnet に置いて `assignPublicIp: true`** にしています。セキュリティ的には Private + NAT が教科書ですが、個人プラットフォームの固定費としては NAT Gateway が地味に重く、自分は「ALB を前段に置く前提で Public 配置」を選びました。ここは万人向けの推奨ではなく、コストとのトレードオフで割り切った判断です。

## 現在の運用

prod 側の ECS クラスタ（`nagiyu-root-cluster-prod`）は、`FARGATE` と `FARGATE_SPOT` の両方をキャパシティプロバイダとして関連付け、Container Insights を有効にしています。今は `desiredCount: 1`・`cpu: 256 / memory: 512` の最小構成で回していて、Spot への寄せやタスク数増加は「コストとアクセスを見ながら後から」という運用です。

逆に dev の Lambda は Provisioned Concurrency を入れていません。dev でコールドスタートが多少出ても困らないので、素の Function URL のまま使っています。「コールドスタートを許容できる環境では Lambda、許容できない本番では Fargate」を、自分は同一サービスの中で実践している、というのが今の運用です。

## まとめ

ECS Fargate と Lambda は「コンテナ vs サーバーレス」という対立よりも、**呼び出し頻度・実行時間・コールドスタート許容度の 3 軸で素直に決まる**ことが多いです。サービスを設計するときはまずこの 3 軸を見積もり、それでも判断が割れる場合に「ローカル開発との一致」「既存資産の活かしやすさ」で決めると、運用後の後悔が減ります。

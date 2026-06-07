---
title: 'AWS インフラ運用ノート'
description: 'nagiyu-platform を支える AWS インフラの全体像をまとめたハブページです。CDK による IaC、dev=Lambda / prod=ECS の使い分け、CloudFront・DynamoDB・EventBridge・S3・ECR・AWS Batch の採用判断を、実装ベースで横断的に紹介します。'
slug: 'aws'
---

## このカテゴリで扱うこと

nagiyu-platform の各サービスは、ほぼすべての本番インフラを AWS 上に構築しています。配信は CloudFront、永続化は DynamoDB、定期実行は EventBridge、重い処理は AWS Batch、コンテナは ECS / ECR、関数実行は Lambda——といった構成要素を、すべて AWS CDK（TypeScript）でコード化しています。

このハブでは、それら個別技術の「なぜその選択をしたか」を運用視点でまとめます。各記事は特定テーマの深堀りですが、ここを起点に読むことで「Portal というツール群を実際に動かしている AWS 構成の全体像」が掴めるようにしています。

## nagiyu-platform での採用状況

私が AWS を使うときの基本方針は「環境ごとに過剰なコストを払わない」ことです。dev 環境はリクエストの少ない時間帯が多いため Lambda（`portal-lambda-stack.ts` / `cloudfront-lambda-stack.ts`）で従量課金に寄せ、常時トラフィックのある prod 環境は ECS Fargate（`ecs-cluster-stack.ts` / `ecs-service-stack.ts`）に切り替える、という二段構えを `infra/root` で組んでいます。同じアプリを環境変数とスタック分割だけで両系統に流せるようにしているのが工夫した点です。

データ層は全サービスで DynamoDB のシングルテーブル設計に統一し、`libs/aws` の抽象リポジトリ層（`abstract-repository.ts` / `repository-factory.ts`）で共通化しています。Stock Tracker のように GSI を複数張って User / Alert / Ticker / Summary を 1 テーブルで捌くケースもあれば、Quick Clip のように S3 への署名付き URL でアップロード/ダウンロードを完結させるケースもあります。定期バッチは EventBridge Rules（Scheduler API ではなく `aws-events`）で組み、Stock Tracker では `rate()` と `cron()` を使い分けた 6 つのルールを運用しています。

## 振り返って

自分でゼロから CDK を書いて気づいたのは、「マネージドサービスの選定よりも、環境差分（dev/prod）をどう吸収するかの設計のほうが運用を左右する」ということでした。Lambda の 15 分制限に詰まって AWS Batch / ECS へ逃がす、ECR は `maxImageCount: 10` でイメージを溜め込まない、IAM は CDK で Role を機能単位に分けて最小権限に寄せる——こうした地味な判断の積み重ねが、いまの nagiyu-platform の安定運用を支えています。下の関連記事は、その一つひとつを実装コード付きで掘り下げたものです。

## 参考リンク

- [AWS CDK 公式ドキュメント](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [Amazon DynamoDB 開発者ガイド](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html)

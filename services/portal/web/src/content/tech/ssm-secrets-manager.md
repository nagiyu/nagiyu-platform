---
title: 'SSM Parameter Store と Secrets Manager の使い分け：クロススタック参照と機密管理の実装'
description: 'AWS の SSM Parameter Store と Secrets Manager を、モノレポ × マルチサービス構成の実装に即して使い分ける指針を整理。Parameter Store はスタック間のリソース参照（CfnOutput / ImportValue の代替）、Secrets Manager は API キーや鍵ペアの機密管理という役割分担を、CDK のコードとともに解説します。'
slug: 'ssm-secrets-manager'
publishedAt: '2026-05-25'
updatedAt: '2026-05-25'
author: 'なぎゆー'
tags: ['AWS', 'SSM', 'Secrets Manager', 'CDK']
categories: ['aws']
---

## はじめに

AWS で「値をコードの外に出す」手段として、SSM Parameter Store と Secrets Manager はよく並べて語られます。どちらも「キーと値を保管して実行時に取り出す」点は共通していますが、本プラットフォームでは両者を**明確に役割分担**して使っています。

- **SSM Parameter Store** … スタックが生成した**非機密のリソース識別子**を、別のスタックへ受け渡す
- **Secrets Manager** … API キーや鍵ペアといった、**外部由来の機密値**を実行ロールへ安全に渡す

「機密かどうか」で選んでいる、と言ってもいいのですが、本質は **「スタックが生成する識別子か／外部から持ち込む秘密か」** という区別です。本記事では、この使い分けが実装でどう現れているかを CDK のコードとともに整理します。

## 結論：何をどちらに入れているか

| 保管対象                                                                 | 保管先          | 性質                             |
| ------------------------------------------------------------------------ | --------------- | -------------------------------- |
| VPC ID・サブネット ID・ALB ARN・ECS クラスタ名・ECR URI・Distribution ID | Parameter Store | スタックが生成するリソース識別子 |
| OpenAI API キー・VAPID キーペア・dev 用 IAM 認証情報                     | Secrets Manager | 外部から持ち込む機密値           |

Parameter Store には機密でない識別子しか入れていないため、SecureString も使っていません。逆に Secrets Manager には、コードにも CloudFormation テンプレートにも残したくない値だけを入れています。

## Parameter Store：スタック間参照を疎結合にする

### なぜ ImportValue ではなく SSM なのか

モノレポでマルチサービスを CDK 管理していると、「VPC スタックが作った VPC ID を、各サービスの ALB スタックから参照したい」という**クロススタック参照**が頻発します。

素朴な手段は CloudFormation の Export と `Fn.importValue` です。実際、初期は次のように Export 名を定数化して使っていました。

```typescript
import * as cdk from 'aws-cdk-lib';
import { EXPORTS } from '../shared/libs/utils/exports';

// CloudFormation の Export を参照
const vpcId = cdk.Fn.importValue(EXPORTS.VPC_ID('dev')); // → 'nagiyu-dev-vpc-id'
```

ただし `Fn.importValue` には厄介な性質があります。**Export された値が他スタックから参照されている間、その Export を変更・削除できません**。VPC スタックを更新したいだけなのに、参照しているスタックが依存ロックになって `cdk deploy` が止まる、という事態が起きます。スタック同士が硬く結合してしまうのです。

そこで本プラットフォームでは、共通リソースのクロススタック参照を **SSM Parameter Store 経由**に切り替えています。アーキテクチャ方針としても「共通 Cluster と共通 VPC は SSM Parameter Store 経由で参照する。**スタック間の直接依存は持たない**」と定めています。SSM 経由なら、生成側と消費側はパラメータ名という文字列でしか繋がらず、デプロイ順序や更新の自由度が大きく上がります。

### パラメータ名は定数で一元管理する

参照キーが文字列になる以上、typo が一番怖いところです。そこでパラメータ名は定数オブジェクトに集約しています。

```typescript
export const SSM_PARAMETERS = {
  VPC_ID: (env: Environment) => `/nagiyu/shared/${env}/vpc/id`,
  PUBLIC_SUBNET_IDS: (env: Environment) => `/nagiyu/shared/${env}/vpc/public-subnet-ids`,
  ALB_ARN: (env: Environment) => `/nagiyu/root/${env}/alb/arn`,
  ECS_CLUSTER_NAME: (env: Environment) => `/nagiyu/root/${env}/ecs/cluster-name`,
  // ...
} as const;
```

命名は `/nagiyu/{scope}/{env}/{resource}` の階層構造に統一しています。scope（`shared` / `root` / 各サービス）と env（`dev` / `prod`）が必ず入るので、パラメータを一覧したときに「どのスタックが・どの環境向けに」出力したものかが一目で分かります。

### 生成側：StringParameter で書き出す

リソースを作ったスタックが、その識別子を SSM に書き出します。

```typescript
import * as ssm from 'aws-cdk-lib/aws-ssm';

new ssm.StringParameter(this, 'ClusterNameParam', {
  parameterName: SSM_PARAMETERS.ECS_CLUSTER_NAME(environment),
  stringValue: cluster.clusterName,
});
```

### 消費側：valueForStringParameter で読み込む

参照する側は `valueForStringParameter` で同じキーを読みます。

```typescript
const vpcId = ssm.StringParameter.valueForStringParameter(this, SSM_PARAMETERS.VPC_ID(environment));

const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', { vpcId });
```

これだけで、VPC スタックと ALB スタックの間に CloudFormation 上の依存関係を作らずに、値を受け渡せます。`SSM_PARAMETERS` という同じ定数を両側で使うので、書き出すキーと読むキーがズレることもありません。

## Secrets Manager：機密値を実行ロールへ渡す

一方、API キーや鍵ペアのように「コードにもテンプレートにも残したくない値」は Secrets Manager に入れます。Parameter Store のリソース識別子とは性質がまったく違い、こちらは**外部から持ち込む秘密**です。

### PLACEHOLDER で作り、実値は手動で入れる

ポイントは、**CDK では値を持たせない**ことです。初回は `PLACEHOLDER` でシークレットの「箱」だけを作り、実際の値は AWS Console から後で上書きします。

```typescript
import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

// 初回は PLACEHOLDER で作成し、実値は Console から上書きする
this.openAiApiKeySecret = new secretsmanager.Secret(this, 'OpenAiApiKeySecret', {
  secretName: `nagiyu-stock-tracker-openai-api-key-${environment}`,
  description: 'OpenAI API key for stock analysis batch processing',
  secretObjectValue: {
    apiKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
  },
});
```

VAPID キーペアも同じ作りです。

```typescript
this.vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
  secretName: `nagiyu-stock-tracker-vapid-${environment}`,
  description: 'VAPID key pair for Web Push notifications',
  secretObjectValue: {
    publicKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
    privateKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
  },
});
```

### generateSecretString を使わない理由

Secrets Manager には `generateSecretString` でランダム値を自動生成する機能があります。便利な機能ですが、ここでは使っていません。**保管したい値が「自分で決められる秘密」ではないから**です。

- VAPID キーは `web-push generate-vapid-keys` で生成したペアを貼り付ける
- OpenAI API キーは OpenAI 側で払い出された文字列をそのまま入れる

どちらも「ランダムに生成してよい値」ではなく、外部で確定した値を持ち込むだけなので、箱だけ CDK で用意して中身は手で入れる、という運用が一番素直です。

### ローテーションは使っていない

Secrets Manager の目玉機能である自動ローテーションも、現状は使っていません。ローテーションが効くのは RDS の認証情報のように「AWS 側で更新できる秘密」ですが、本プラットフォームのデータストアは DynamoDB が中心で、ローテーション対象になる DB クレデンシャルが存在しないためです。「Secrets Manager を使う ＝ ローテーションする」ではない、という点は実装方針として割り切っています。

### アクセスは実行ロールに ARN 限定で付与する

シークレットの読み取りは、まず IAM で「どのロールがどのシークレットを読めるか」を絞ります。バッチ Lambda の実行ロールには、対象シークレットの ARN だけを指定して `GetSecretValue` を付与します。

```typescript
new iam.PolicyStatement({
  sid: 'SecretsManagerVapidAccess',
  effect: iam.Effect.ALLOW,
  actions: ['secretsmanager:GetSecretValue'],
  resources: [props.vapidSecret.secretArn], // ワイルドカードではなく ARN 限定
});
```

このポリシーは ManagedPolicy として定義し、**バッチ Lambda の実行ロールと、ローカル開発用 IAM ユーザーの両方にアタッチ**しています。開発者が手元で動かすときも本番 Lambda とまったく同じ権限になるため、「ローカルでは動いたのに本番で権限不足」というデプロイ後の事故を防げます。

## 設計上のポイント

**SSM 採用の主目的は「疎結合」**

Parameter Store を「安い設定置き場」として捉えると本質を外します。少なくともこのプラットフォームでの主目的は、クロススタック参照から CloudFormation の依存ロックを外し、スタックを独立して更新・削除できるようにすることです。

**Parameter Store に機密は置かない**

SSM に入れているのは VPC ID や ARN といった非機密の識別子だけなので、SecureString も使っていません。機密は Secrets Manager 側に寄せる、と役割をはっきり分けることで、「どこに何があるか」が迷子になりません。

**機密はコードに焼き込まず、箱だけ作る**

Secrets Manager 側は `PLACEHOLDER` で箱を作り、実値は Console から入れる運用です。CDK のコードにもテンプレートにも秘密が残らないので、リポジトリや CloudFormation のドリフト履歴から漏れる心配がありません。

## まとめ

SSM Parameter Store と Secrets Manager は競合ではなく、保管する値の性質で役割分担しています。**スタックが生成する非機密の識別子は Parameter Store でスタック間に疎結合に渡し、外部から持ち込む機密値は Secrets Manager に箱だけ作って実値は手で入れる**——この線引きが、本プラットフォームでの基本方針です。

「Parameter Store ＝ 安い設定置き場」「Secrets Manager ＝ 自動生成とローテーション」という一般的なイメージとは少し違う使い方ですが、依存ロックの回避と機密の非焼き込みという、運用で本当に効く観点から選ぶと、自然とこの形に落ち着きます。

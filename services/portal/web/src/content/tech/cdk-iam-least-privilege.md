---
title: 'AWS CDK で IAM 最小権限を設計する：Grant メソッドと PolicyStatement の使い分け'
description: 'AWS CDK でコンストラクト間の権限を付与する方法を解説。Grant メソッド・addToRolePolicy・PolicyStatement の使い分け、ARN のハードコードを避けるテクニック、ユニットテストによる権限検証まで実運用ベースで整理します。'
slug: 'cdk-iam-least-privilege'
publishedAt: '2026-05-21'
author: 'なぎゆー'
tags: ['AWS', 'CDK', 'IAM', 'セキュリティ']
---

## はじめに

AWS CDK でインフラを書くとき、IAM の設定を後回しにして `*` で固めてしまう、という経験は誰にでもあるはずです。`*` の権限は「とりあえず動く」状態は作れますが、本番運用では意図しないリソースへのアクセスを許してしまうリスクになります。

CDK は IAM 最小権限を実現しやすい仕組みを複数持っています。本記事では **Grant メソッド・`addToRolePolicy`・`PolicyStatement` 直書き** という 3 つの手段を使い分けながら、必要な権限だけを付与するパターンを整理します。

## CDK が提供する 3 つの権限付与手段

CDK で権限を付与するときは、大きく 3 つのアプローチがあります。

| アプローチ | 書き場所 | 向いているケース |
| --- | --- | --- |
| Grant メソッド | リソース側（`bucket.grantRead(role)` 等） | 標準的な権限（読み書き・呼び出し等） |
| `addToRolePolicy` | ロール側 | 細かい条件を付けたいとき |
| `PolicyStatement` 直接構築 | ロール / ポリシー | Grant がない操作・クロスアカウント等 |

原則として **Grant メソッドを最初に探し、なければ `addToRolePolicy`、それでも難しければ `PolicyStatement`** という優先順位で書くと、`*` を書く機会を大幅に減らせます。

## Grant メソッドの実例

CDK の多くの L2 コンストラクトには `grantXxx` 形式のメソッドが用意されています。

### S3 バケット

```typescript
const bucket = new s3.Bucket(this, 'DataBucket');
const lambdaFn = new lambda.Function(this, 'Processor', { ... });

// Lambda に読み取り権限だけ付与
bucket.grantRead(lambdaFn);

// 書き込みも必要な場合
bucket.grantReadWrite(lambdaFn);

// アップロードのみ（PutObject だけ）
bucket.grantPut(lambdaFn);
```

`grantRead` は `s3:GetObject` / `s3:ListBucket` などを自動で解決し、`Resource` も `bucket.bucketArn` と `bucket.bucketArn + "/*"` を適切に設定してくれます。自分で ARN を書く必要がありません。

### DynamoDB テーブル

```typescript
const table = new dynamodb.Table(this, 'UserTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
});

const apiLambda = new lambda.Function(this, 'ApiHandler', { ... });

// 読み取りのみ（GetItem・Query・Scan・BatchGetItem）
table.grantReadData(apiLambda);

// 書き込みのみ（PutItem・UpdateItem・DeleteItem・BatchWriteItem）
table.grantWriteData(apiLambda);

// 読み書き両方
table.grantReadWriteData(apiLambda);
```

`grantReadData` は GSI を含む全インデックスに対して適切な権限を設定します。`arn:aws:dynamodb:*:*:table/*/index/*` といった ARN のバリエーションを自分で書く必要がなくなります。

### Lambda 関数の呼び出し

```typescript
const processorFn = new lambda.Function(this, 'Processor', { ... });
const triggerFn = new lambda.Function(this, 'Trigger', { ... });

// triggerFn が processorFn を呼び出せる権限
processorFn.grantInvoke(triggerFn);
```

`grantInvoke` は `lambda:InvokeFunction` を `processorFn.functionArn` に限定して付与します。

### SQS キュー

```typescript
const queue = new sqs.Queue(this, 'JobQueue');
const workerFn = new lambda.Function(this, 'Worker', { ... });

// メッセージの送信権限
queue.grantSendMessages(workerFn);

// メッセージの受信・削除権限
queue.grantConsumeMessages(workerFn);
```

## addToRolePolicy で PolicyStatement を書くケース

Grant メソッドで表現できない権限（条件付き権限・特定 API だけの制限など）は `addToRolePolicy` を使います。

### IAM 条件でバケットのプレフィクスを絞る

```typescript
const workerFn = new lambda.Function(this, 'Worker', { ... });

workerFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:GetObject'],
  resources: [`${bucket.bucketArn}/uploads/*`],   // uploads/ 以下のみ
}));
```

`grantRead` はバケット全体を対象にしますが、`addToRolePolicy` を使えばプレフィクス単位で絞れます。

### 条件（Condition）を付ける

```typescript
workerFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['s3:PutObject'],
  resources: [`${bucket.bucketArn}/output/*`],
  conditions: {
    StringEquals: {
      's3:x-amz-server-side-encryption': 'aws:kms',
    },
  },
}));
```

「KMS 暗号化なしのアップロードは拒否する」のような制約を Condition で表現できます。PutObject で平文ファイルをアップされるのを防ぐ場合などに使います。

### SecretManager から特定シークレットだけ読む

```typescript
const secret = new secretsmanager.Secret(this, 'DbPassword');

apiLambda.addToRolePolicy(new iam.PolicyStatement({
  actions: ['secretsmanager:GetSecretValue'],
  resources: [secret.secretArn],   // このシークレット 1 つのみ
}));

// または Secret コンストラクトの Grant を使う（こちらが推奨）
secret.grantRead(apiLambda);
```

`secretsmanager:GetSecretValue` には L2 の `secret.grantRead()` もあるので、そちらを先に確認してください。

## Resource ARN を * にしないテクニック

ARN を `*` で書きたくなる状況のほとんどは、**コンストラクトのプロパティ**を参照することで解決できます。

### コンストラクトが持つ ARN プロパティを使う

```typescript
// Bad: ARN をハードコード / * で代用
new iam.PolicyStatement({
  actions: ['sqs:SendMessage'],
  resources: ['arn:aws:sqs:ap-northeast-1:123456789012:job-queue'],
});

// Good: コンストラクトのプロパティを参照
new iam.PolicyStatement({
  actions: ['sqs:SendMessage'],
  resources: [queue.queueArn],
});
```

デプロイ環境（dev / prod）でアカウント ID やリージョンが変わっても、コンストラクト参照なら自動追従します。

### Arn.format で動的 ARN を組み立てる

既存リソース（CDK 管理外）を参照するときは `Arn.format` を使います。

```typescript
import { Arn, ArnFormat, Stack } from 'aws-cdk-lib';

const stack = Stack.of(this);

const tableArn = Arn.format({
  service: 'dynamodb',
  resource: 'table',
  resourceName: 'LegacyUserTable',
  arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
}, stack);

workerFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:GetItem'],
  resources: [tableArn],
}));
```

`Stack.of(this)` からアカウント ID・リージョンを引けるため、ハードコードを避けられます。

### GSI の ARN も忘れない

DynamoDB の GSI に対してクエリするには、テーブル ARN だけでなく GSI の ARN も `resources` に含める必要があります。

```typescript
workerFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['dynamodb:Query'],
  resources: [
    table.tableArn,
    `${table.tableArn}/index/*`,   // 全 GSI を対象
  ],
}));
```

`table.grantReadData()` はこの GSI ARN も自動処理します。手書き時の忘れがちポイントです。

## ユニットテストで権限を検証する

CDK には `assertions` パッケージが用意されており、生成される CloudFormation テンプレートの IAM ポリシーをユニットテストでアサートできます。

```typescript
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyStack } from '../lib/my-stack';

describe('IAM 権限テスト', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();
    const stack = new MyStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  it('Lambda は S3 の GetObject 権限のみを持つ', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 's3:GetObject',
            Effect: 'Allow',
            Resource: { 'Fn::Join': ['', [{ 'Fn::GetAtt': ['DataBucket', 'Arn'] }, '/*']] },
          },
        ],
      },
    });
  });

  it('Lambda ロールに s3:* が含まれない', () => {
    const policies = template.findResources('AWS::IAM::Policy');

    Object.values(policies).forEach((policy) => {
      const statements = policy.Properties.PolicyDocument.Statement as Array<{
        Action: string | string[];
        Effect: string;
      }>;

      statements.forEach((stmt) => {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        expect(actions).not.toContain('s3:*');
      });
    });
  });
});
```

`template.hasResourceProperties` は CloudFormation リソースのプロパティをアサートします。「意図した権限が付いているか」だけでなく「意図しない広い権限が入り込んでいないか」も検証できます。

### Snapshot テストで差分を検出する

権限が意図せず増えたことを検知するには Snapshot テストも有効です。

```typescript
it('IAM ポリシーのスナップショット', () => {
  const policies = template.findResources('AWS::IAM::Policy');
  expect(policies).toMatchSnapshot();
});
```

初回実行でスナップショットを保存し、以降は差分があった場合にテストが失敗します。PR で IAM が変わったことをレビュー時に気づけます。

## ハマりどころ

### PassRole は明示的に付ける

ECS タスクや Lambda を CDK で定義すると、サービスがロールを引き受けるための `iam:PassRole` が必要なケースがあります。Grant メソッドは PassRole を付けないので注意が必要です。

```typescript
executorFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ['iam:PassRole'],
  resources: [taskRole.roleArn],
}));
```

### 循環参照に注意

コンストラクト A がコンストラクト B のロールに権限を付与し、同時に B が A のロールにも付与するような場合、CDK が循環依存を検出してエラーになることがあります。権限付与の向きを一方向に統一するか、`iam.Grant.addToPrincipalOrResource` を使って回避します。

### `cdk diff` で IAM 変更を必ず確認する

`cdk diff` は IAM の変更を `[~] AWS::IAM::Policy` として出力します。デプロイ前にこの出力を確認して、意図しない権限追加・削除がないかチェックする習慣をつけましょう。

```
[~] AWS::IAM::Policy WorkerFunctionPolicy
  └─ [~] Properties
       └─ [~] PolicyDocument
            └─ [~] Statement
                 └─ @@ -1,6 +1,13 @@
                     + {
                     +   "Action": "s3:DeleteObject",
                     +   "Effect": "Allow",
                     +   "Resource": "arn:aws:s3:::data-bucket/*"
                     + }
```

この差分が予期しないものなら、コードに戻って修正します。

### Managed Policy の安易な利用を避ける

```typescript
// 避ける: AdministratorAccess や AmazonS3FullAccess のような広い Managed Policy
role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'));

// 推奨: 必要な操作だけ個別に付与
bucket.grantRead(role);
```

AWS 提供の Managed Policy は便利ですが、サービス全体への権限を与えてしまうものが多く、最小権限に反します。L2 コンストラクトの Grant メソッドに慣れると、Managed Policy を使う場面が自然と減ります。

## まとめ

AWS CDK での IAM 設計をまとめます。

1. **Grant メソッドを最初に探す**: L2 コンストラクトの `grantRead` / `grantInvoke` などは ARN・アクション両方を適切に設定してくれる
2. **Grant で足りないときは `addToRolePolicy`**: 条件・プレフィクス絞りなど細かい要件はここで書く
3. **ARN はコンストラクトプロパティか `Arn.format` で組み立てる**: `*` のハードコードを排除する
4. **ユニットテストで権限を固定化する**: `assertions` と Snapshot テストを組み合わせて、権限の意図しない変化を PR で検出する
5. **`cdk diff` を習慣にする**: IAM 変更の差分はデプロイ前に必ず目視確認する

`*` で固めると「動く状態」は早く作れますが、運用が続くほどリスクが積み上がります。CDK が提供するツールを活用すれば、最小権限を保ちながら開発速度を落とさない設計ができます。

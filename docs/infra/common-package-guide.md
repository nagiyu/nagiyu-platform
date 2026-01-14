# @nagiyu/infra-common 使用ガイド

## 目次

- [概要](#概要)
- [各スタックの詳細](#各スタックの詳細)
    - [EcrStackBase](#ecrstackbase)
    - [LambdaStackBase](#lambdastackbase)
    - [CloudFrontStackBase](#cloudfrontstackbase)
- [カスタマイズ方法](#カスタマイズ方法)
- [ベストプラクティス](#ベストプラクティス)
- [トラブルシューティング](#トラブルシューティング)
- [サンプルコード](#サンプルコード)

---

## 概要

`@nagiyu/infra-common` は、Nagiyu Platform の AWS インフラストラクチャを構築するための共通ライブラリです。ECR、Lambda、CloudFront の3つの基本スタックを提供し、統一された命名規則とセキュリティ設定を自動適用します。

### 設計思想

- **オプショナル優先**: ほとんどのパラメータはオプショナルで、デフォルト値が自動適用される
- **一貫性**: 全サービスで統一された命名規則 (`nagiyu-{service}-{type}-{env}`)
- **セキュリティ**: セキュリティヘッダーがデフォルトで有効化
- **拡張性**: `additionalPolicyStatements`、`additionalBehaviors` などで柔軟に拡張可能

---

## 各スタックの詳細

### EcrStackBase

ECR リポジトリを作成するベーススタック。

#### 必須パラメータ

| パラメータ名 | 型 | 説明 |
|------------|-----|------|
| serviceName | string | サービス名 (例: tools, auth, admin) |
| environment | 'dev' \| 'prod' | デプロイ環境 |

#### オプションパラメータ (ecrConfig)

| パラメータ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| repositoryName | string | `nagiyu-{service}-ecr-{env}` | リポジトリ名 |
| imageScanOnPush | boolean | true | プッシュ時のイメージスキャン |
| maxImageCount | number | 10 | 保持するイメージ数 |
| imageTagMutability | 'MUTABLE' \| 'IMMUTABLE' | 'MUTABLE' | タグの可変性 |
| removalPolicy | RemovalPolicy | 環境に応じて自動設定 | スタック削除時の動作 |
| logicalId | string | - | CloudFormation 論理ID (移行時のみ使用) |

#### 生成されるリソース

- **ECR Repository**: コンテナイメージを保存するリポジトリ
- **Lifecycle Policy**: 古いイメージを自動削除するポリシー
- **CloudFormation Outputs**:
    - `RepositoryName`: リポジトリ名
    - `RepositoryUri`: リポジトリURI
    - `RepositoryArn`: リポジトリARN

#### 使用例

```typescript
import { EcrStackBase } from '@nagiyu/infra-common';

// 基本的な使用方法（デフォルト値を使用）
const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// カスタマイズ例
const customEcrStack = new EcrStackBase(app, 'AuthEcrStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrConfig: {
    maxImageCount: 20,           // イメージ保持数を増やす
    imageTagMutability: 'IMMUTABLE', // イミュータブルタグを使用
  },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});
```

---

### LambdaStackBase

Lambda 関数を作成するベーススタック。ECR イメージからデプロイします。

#### 必須パラメータ

| パラメータ名 | 型 | 説明 |
|------------|-----|------|
| serviceName | string | サービス名 |
| environment | 'dev' \| 'prod' | デプロイ環境 |
| ecrRepositoryName | string | ECR リポジトリ名 |

#### オプションパラメータ (lambdaConfig)

| パラメータ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| functionName | string | `nagiyu-{service}-lambda-{env}` | Lambda 関数名 |
| memorySize | number | 512 | メモリサイズ (MB) |
| timeout | number | 30 | タイムアウト (秒) |
| architecture | 'X86_64' \| 'ARM_64' | 'X86_64' | アーキテクチャ |
| runtime | string | 'nodejs20.x' | ランタイム |
| environment | Record&lt;string, string&gt; | {} | 環境変数 |
| reservedConcurrentExecutions | number | - | 予約済み同時実行数 |
| executionRoleName | string | 自動生成 | 実行ロール名 |
| logicalId | string | - | CloudFormation 論理ID |

#### その他のパラメータ

| パラメータ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| enableFunctionUrl | boolean | true | Function URL の有効化 |
| additionalPolicyStatements | PolicyStatement[] | [] | 追加の IAM ポリシー |

#### 生成されるリソース

- **Lambda Function**: ECR イメージからデプロイされる Lambda 関数
- **IAM Role**: Lambda 実行ロール (基本的なログ権限付き)
- **Function URL**: Lambda の公開 URL (オプション)
- **CloudWatch Log Group**: `/aws/lambda/{functionName}`
- **CloudFormation Outputs**:
    - `FunctionName`: 関数名
    - `FunctionArn`: 関数ARN
    - `FunctionUrl`: Function URL (有効時のみ)

#### 使用例

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';
import { LambdaStackBase } from '@nagiyu/infra-common';

// 基本的な使用方法
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// カスタマイズ例（DynamoDB アクセス権限付き）
const authLambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: 'nagiyu-auth-ecr-prod',
  lambdaConfig: {
    memorySize: 1024,
    timeout: 60,
    architecture: 'ARM_64',
    environment: {
      NODE_ENV: 'production',
      DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
    },
  },
  additionalPolicyStatements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
    }),
  ],
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});
```

---

### CloudFrontStackBase

CloudFront ディストリビューションを作成するベーススタック。Lambda Function URL をオリジンとして使用します。

#### 必須パラメータ

| パラメータ名 | 型 | 説明 |
|------------|-----|------|
| serviceName | string | サービス名 |
| environment | 'dev' \| 'prod' | デプロイ環境 |
| functionUrl | string | Lambda Function URL |

#### オプションパラメータ (cloudfrontConfig)

| パラメータ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| domainName | string | 自動生成 | カスタムドメイン名 |
| enableSecurityHeaders | boolean | true | セキュリティヘッダーの有効化 |
| minimumTlsVersion | '1.2' \| '1.3' | '1.2' | 最小 TLS バージョン |
| enableHttp2 | boolean | true | HTTP/2 の有効化 |
| enableHttp3 | boolean | true | HTTP/3 の有効化 |
| priceClass | string | 'PriceClass_100' | 価格クラス |
| additionalBehaviors | BehaviorOptions[] | [] | 追加のビヘイビア |
| logicalId | string | - | CloudFormation 論理ID |

#### その他のパラメータ

| パラメータ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| certificateArn | string | 共有証明書を自動参照 | ACM 証明書 ARN |
| cachePolicy | CachePolicy | CACHING_DISABLED | キャッシュポリシー |

#### 生成されるリソース

- **CloudFront Distribution**: グローバル CDN
- **Response Headers Policy**: セキュリティヘッダー (オプション)
- **CloudFormation Outputs**:
    - `DistributionId`: ディストリビューション ID
    - `DistributionDomainName`: CloudFront ドメイン名
    - `CustomDomainName`: カスタムドメイン名

#### ドメイン名の自動生成ルール

- **prod環境**: `{service}.nagiyu.com` (例: `tools.nagiyu.com`)
- **dev環境**: `dev-{service}.nagiyu.com` (例: `dev-tools.nagiyu.com`)

#### 使用例

```typescript
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { CloudFrontStackBase } from '@nagiyu/infra-common';

// 基本的な使用方法
const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 固定
  },
});

// カスタマイズ例（キャッシュ有効化）
const customCloudfrontStack = new CloudFrontStackBase(app, 'AuthCloudFrontStack', {
  serviceName: 'auth',
  environment: 'prod',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true,
    minimumTlsVersion: '1.3',
    priceClass: 'PriceClass_All',
  },
  cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
});
```

---

## カスタマイズ方法

### 1. デフォルト値のオーバーライド

各スタックのデフォルト値は、対応する `config` パラメータで上書きできます。

```typescript
// Lambda のメモリサイズとタイムアウトをカスタマイズ
const lambdaStack = new LambdaStackBase(app, 'CustomLambdaStack', {
  serviceName: 'custom',
  environment: 'dev',
  ecrRepositoryName: 'nagiyu-custom-ecr-dev',
  lambdaConfig: {
    memorySize: 2048, // デフォルト 512MB → 2048MB に変更
    timeout: 120,     // デフォルト 30秒 → 120秒 に変更
  },
});
```

### 2. 環境変数の追加

Lambda 関数に環境変数を設定できます。

```typescript
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: 'nagiyu-tools-ecr-dev',
  lambdaConfig: {
    environment: {
      NODE_ENV: 'development',
      APP_VERSION: process.env.APP_VERSION || 'unknown',
      LOG_LEVEL: 'debug',
    },
  },
});
```

### 3. IAM ポリシーの追加

Lambda 関数に追加の IAM ポリシーをアタッチできます。

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: 'nagiyu-auth-ecr-prod',
  additionalPolicyStatements: [
    // DynamoDB アクセス権限
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-*'],
    }),
    // Secrets Manager アクセス権限
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['arn:aws:secretsmanager:*:*:secret:nagiyu/auth/*'],
    }),
  ],
});
```

### 4. CloudFormation 論理ID の指定

既存の CloudFormation スタックから移行する際、論理ID を指定して互換性を保つことができます。

```typescript
const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrConfig: {
    repositoryName: 'tools-app-dev', // 既存のリポジトリ名を維持
    logicalId: 'ToolsRepository',    // 既存の論理ID を維持
  },
});
```

---

## ベストプラクティス

### 1. スタック間の依存関係を明示する

Lambda スタックは ECR スタックに依存するため、`ecrRepositoryName` を明示的に渡します。

```typescript
// ✅ 推奨: repository.repositoryName を使用
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
});

// ❌ 非推奨: ハードコードされた名前
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: 'nagiyu-tools-ecr-dev',
});
```

### 2. 環境ごとにスタックを分離する

dev と prod で別々のスタックを作成し、相互に影響しないようにします。

```typescript
// dev 環境
const devEcrStack = new EcrStackBase(app, 'ToolsEcrStackDev', {
  serviceName: 'tools',
  environment: 'dev',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-1' },
});

// prod 環境
const prodEcrStack = new EcrStackBase(app, 'ToolsEcrStackProd', {
  serviceName: 'tools',
  environment: 'prod',
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'ap-northeast-1' },
});
```

### 3. リージョンを正しく設定する

- **ECR, Lambda**: `ap-northeast-1` (東京リージョン)
- **CloudFront**: `us-east-1` (グローバルサービス、証明書も us-east-1 に配置)

```typescript
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1', // Lambda は ap-northeast-1
  },
});

const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1
  },
});
```

### 4. セキュリティヘッダーを有効化する

CloudFront のセキュリティヘッダーはデフォルトで有効ですが、明示的に設定することを推奨します。

```typescript
const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true, // 明示的に有効化
  },
});
```

### 5. 命名規則を統一する

`@nagiyu/infra-common` が提供する命名規則ユーティリティを使用して、一貫性を保ちます。

```typescript
import { getEcrRepositoryName, getLambdaFunctionName } from '@nagiyu/infra-common';

// ✅ 推奨: 命名規則ユーティリティを使用
const repositoryName = getEcrRepositoryName('tools', 'dev');
const functionName = getLambdaFunctionName('tools', 'dev');

// ❌ 非推奨: 手動で名前を構築
const repositoryName = `nagiyu-tools-ecr-dev`;
const functionName = `nagiyu-tools-lambda-dev`;
```

---

## トラブルシューティング

### 問題1: ECR リポジトリが見つからない

**症状**: Lambda スタックのデプロイ時に「ECR repository not found」エラーが発生する

**原因**: ECR スタックがまだデプロイされていない、またはリポジトリ名が間違っている

**解決策**:

1. ECR スタックを先にデプロイする
    ```bash
    cdk deploy ToolsEcrStackDev
    ```

2. リポジトリ名が正しいか確認する
    ```typescript
    console.log(ecrStack.repository.repositoryName);
    ```

---

### 問題2: CloudFront ディストリビューションのデプロイが遅い

**症状**: CloudFront のデプロイに15-20分かかる

**原因**: CloudFront はグローバルサービスのため、全エッジロケーションへの配信に時間がかかる

**解決策**:

- これは正常な動作です。CloudFront のデプロイには時間がかかることを考慮してください
- `priceClass` を `PriceClass_100` (北米とヨーロッパのみ) に設定すると若干速くなる場合があります

---

### 問題3: Lambda 関数のメモリ不足

**症状**: Lambda 関数が実行時にメモリ不足でエラーになる

**原因**: デフォルトのメモリサイズ (512MB) が不足している

**解決策**:

メモリサイズを増やします。

```typescript
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    memorySize: 1024, // 512MB → 1024MB に増加
  },
});
```

---

### 問題4: CloudFormation スタック更新時のエラー

**症状**: `cdk deploy` 実行時に「Resource already exists」エラーが発生する

**原因**: 既存の CloudFormation スタックと論理ID が重複している

**解決策**:

既存スタックから移行する場合、`logicalId` を指定します。

```typescript
const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrConfig: {
    logicalId: 'ToolsRepository', // 既存の論理ID を指定
  },
});
```

---

### 問題5: Function URL が有効化されない

**症状**: Lambda の Function URL が作成されない

**原因**: `enableFunctionUrl` が `false` に設定されている

**解決策**:

`enableFunctionUrl` を明示的に `true` に設定します (デフォルトは `true` ですが、明示的に設定されている場合は上書きされます)。

```typescript
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  enableFunctionUrl: true, // 明示的に有効化
});
```

---

## サンプルコード

### サンプル1: 基本的なサービススタック

最小限の設定で ECR + Lambda + CloudFront を構築する例。

```typescript
import * as cdk from 'aws-cdk-lib';
import { EcrStackBase, LambdaStackBase, CloudFrontStackBase } from '@nagiyu/infra-common';

const app = new cdk.App();

// 環境変数から環境とアカウント情報を取得
const environment = process.env.ENVIRONMENT || 'dev';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-1',
};

// 1. ECR スタック
const ecrStack = new EcrStackBase(app, `ToolsEcrStack${environment}`, {
  serviceName: 'tools',
  environment: environment as 'dev' | 'prod',
  env,
});

// 2. Lambda スタック
const lambdaStack = new LambdaStackBase(app, `ToolsLambdaStack${environment}`, {
  serviceName: 'tools',
  environment: environment as 'dev' | 'prod',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  env,
});

// 3. CloudFront スタック
const cloudfrontStack = new CloudFrontStackBase(app, `ToolsCloudFrontStack${environment}`, {
  serviceName: 'tools',
  environment: environment as 'dev' | 'prod',
  functionUrl: lambdaStack.functionUrl!.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1
  },
});

app.synth();
```

---

### サンプル2: カスタマイズされたサービススタック

DynamoDB アクセス権限、カスタムメモリサイズ、セキュリティヘッダーを設定した例。

```typescript
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EcrStackBase, LambdaStackBase, CloudFrontStackBase } from '@nagiyu/infra-common';

const app = new cdk.App();

const environment = 'prod';
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'ap-northeast-1',
};

// 1. ECR スタック（イメージ保持数を増やす）
const ecrStack = new EcrStackBase(app, 'AuthEcrStackProd', {
  serviceName: 'auth',
  environment: 'prod',
  ecrConfig: {
    maxImageCount: 20, // 保持数を10→20に
    imageTagMutability: 'IMMUTABLE',
  },
  env,
});

// 2. Lambda スタック（メモリサイズ増加、DynamoDB アクセス権限付き）
const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStackProd', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    memorySize: 1024,
    timeout: 60,
    architecture: 'ARM_64', // ARM64 を使用
    environment: {
      NODE_ENV: 'production',
      DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
      LOG_LEVEL: 'info',
    },
  },
  additionalPolicyStatements: [
    // DynamoDB アクセス権限
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [
        'arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod',
        'arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod/index/*',
      ],
    }),
    // Secrets Manager アクセス権限
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['arn:aws:secretsmanager:*:*:secret:nagiyu/auth/*'],
    }),
  ],
  env,
});

// 3. CloudFront スタック（TLS 1.3、全エッジロケーション）
const cloudfrontStack = new CloudFrontStackBase(app, 'AuthCloudFrontStackProd', {
  serviceName: 'auth',
  environment: 'prod',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true,
    minimumTlsVersion: '1.3', // TLS 1.3 を使用
    priceClass: 'PriceClass_All', // 全エッジロケーション
  },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
});

app.synth();
```

---

## 関連ドキュメント

- [README](./../infra/common/README.md) - パッケージ概要
- [マイグレーションガイド](./migration-guide.md) - 既存サービスの移行手順
- [API リファレンス](./api-reference.md) - 型定義と関数の詳細
- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想

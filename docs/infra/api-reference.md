# @nagiyu/infra-common API リファレンス

## 目次

- [型定義](#型定義)
    - [Environment](#environment)
    - [ServiceConfig](#serviceconfig)
    - [EcrConfig](#ecrconfig)
    - [LambdaConfig](#lambdaconfig)
    - [CloudFrontConfig](#cloudfrontconfig)
- [スタッククラス](#スタッククラス)
    - [EcrStackBase](#ecrstackbase)
    - [LambdaStackBase](#lambdastackbase)
    - [CloudFrontStackBase](#cloudfrontstackbase)
- [命名規則関数](#命名規則関数)
- [デフォルト値](#デフォルト値)
- [セキュリティヘッダー](#セキュリティヘッダー)

---

## 型定義

### Environment

デプロイ環境を表す型。

```typescript
type Environment = 'dev' | 'prod';
```

**使用例:**

```typescript
const environment: Environment = 'dev';
```

---

### ServiceConfig

サービス全体の設定を表す型。

```typescript
interface ServiceConfig {
  serviceName: string;
  environment: Environment;
  ecr?: EcrConfig;
  lambda?: LambdaConfig;
  cloudfront?: CloudFrontConfig;
}
```

**プロパティ:**

| プロパティ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| serviceName | string | ✓ | サービス名（例: tools, auth, admin） |
| environment | Environment | ✓ | デプロイ環境 |
| ecr | EcrConfig | - | ECR リポジトリ設定 |
| lambda | LambdaConfig | - | Lambda 関数設定 |
| cloudfront | CloudFrontConfig | - | CloudFront ディストリビューション設定 |

---

### EcrConfig

ECR リポジトリの設定を表す型。

```typescript
interface EcrConfig {
  repositoryName?: string;
  logicalId?: string;
  imageScanOnPush?: boolean;
  maxImageCount?: number;
  imageTagMutability?: 'MUTABLE' | 'IMMUTABLE';
  removalPolicy?: 'DESTROY' | 'RETAIN';
}
```

**プロパティ:**

| プロパティ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| repositoryName | string | `nagiyu-{service}-ecr-{env}` | リポジトリ名 |
| logicalId | string | `'Repository'` | CloudFormation 論理ID |
| imageScanOnPush | boolean | `true` | プッシュ時のイメージスキャン |
| maxImageCount | number | `10` | 保持するイメージ数 |
| imageTagMutability | 'MUTABLE' \| 'IMMUTABLE' | `'MUTABLE'` | イメージタグの可変性 |
| removalPolicy | 'DESTROY' \| 'RETAIN' | 環境に応じて自動設定 | スタック削除時の動作 |

**使用例:**

```typescript
const ecrConfig: EcrConfig = {
  maxImageCount: 20,
  imageTagMutability: 'IMMUTABLE',
};
```

---

### LambdaConfig

Lambda 関数の設定を表す型。

```typescript
interface LambdaConfig {
  functionName?: string;
  logicalId?: string;
  executionRoleName?: string;
  memorySize?: number;
  timeout?: number;
  architecture?: 'X86_64' | 'ARM_64';
  runtime?: string;
  environment?: Record<string, string>;
  reservedConcurrentExecutions?: number;
}
```

**プロパティ:**

| プロパティ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| functionName | string | `nagiyu-{service}-lambda-{env}` | Lambda 関数名 |
| logicalId | string | `'Function'` | CloudFormation 論理ID |
| executionRoleName | string | CloudFormation が自動生成 | 実行ロール名 |
| memorySize | number | `512` | メモリサイズ (MB) |
| timeout | number | `30` | タイムアウト (秒) |
| architecture | 'X86_64' \| 'ARM_64' | `'X86_64'` | アーキテクチャ |
| runtime | string | `'nodejs20.x'` | ランタイム |
| environment | Record&lt;string, string&gt; | `{}` | 環境変数 |
| reservedConcurrentExecutions | number | - | 予約済み同時実行数 |

**使用例:**

```typescript
const lambdaConfig: LambdaConfig = {
  memorySize: 1024,
  timeout: 60,
  architecture: 'ARM_64',
  environment: {
    NODE_ENV: 'production',
    DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
  },
};
```

---

### CloudFrontConfig

CloudFront ディストリビューションの設定を表す型。

```typescript
interface CloudFrontConfig {
  domainName?: string;
  logicalId?: string;
  enableSecurityHeaders?: boolean;
  minimumTlsVersion?: '1.2' | '1.3';
  enableHttp2?: boolean;
  enableHttp3?: boolean;
  priceClass?: string;
  additionalBehaviors?: Record<string, unknown>;
}
```

**プロパティ:**

| プロパティ名 | 型 | デフォルト値 | 説明 |
|------------|-----|------------|------|
| domainName | string | 環境に応じて自動生成 | ドメイン名 |
| logicalId | string | `'Distribution'` | CloudFormation 論理ID |
| enableSecurityHeaders | boolean | `true` | セキュリティヘッダーの有効化 |
| minimumTlsVersion | '1.2' \| '1.3' | `'1.2'` | 最小 TLS バージョン |
| enableHttp2 | boolean | `true` | HTTP/2 の有効化 |
| enableHttp3 | boolean | `true` | HTTP/3 の有効化 |
| priceClass | string | `'PriceClass_100'` | 価格クラス |
| additionalBehaviors | Record&lt;string, unknown&gt; | - | 追加のビヘイビア |

**使用例:**

```typescript
const cloudfrontConfig: CloudFrontConfig = {
  enableSecurityHeaders: true,
  minimumTlsVersion: '1.3',
  priceClass: 'PriceClass_All',
};
```

---

## スタッククラス

### EcrStackBase

ECR リポジトリを作成するベーススタック。

#### コンストラクタ

```typescript
constructor(scope: Construct, id: string, props: EcrStackBaseProps)
```

#### Props

```typescript
interface EcrStackBaseProps extends cdk.StackProps {
  serviceName: string;
  environment: Environment;
  ecrConfig?: EcrConfig;
}
```

| プロパティ名 | 型 | 必須 | 説明 |
|------------|-----|------|------|
| serviceName | string | ✓ | サービス名 |
| environment | Environment | ✓ | デプロイ環境 |
| ecrConfig | EcrConfig | - | ECR 設定 |

#### 公開プロパティ

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| repository | ecr.Repository | 作成された ECR リポジトリ |

#### CloudFormation Outputs

| Output 名 | 説明 |
|-----------|------|
| RepositoryName | リポジトリ名 |
| RepositoryUri | リポジトリURI |
| RepositoryArn | リポジトリARN |

#### 使用例

```typescript
const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// リポジトリ名を取得
console.log(ecrStack.repository.repositoryName);
```

---

### LambdaStackBase

Lambda 関数を作成するベーススタック。

#### コンストラクタ

```typescript
constructor(scope: Construct, id: string, props: LambdaStackBaseProps)
```

#### Props

```typescript
interface LambdaStackBaseProps extends cdk.StackProps {
  serviceName: string;
  environment: Environment;
  ecrRepositoryName: string;
  lambdaConfig?: LambdaConfig;
  enableFunctionUrl?: boolean;
  additionalPolicyStatements?: iam.PolicyStatement[];
}
```

| プロパティ名 | 型 | 必須 | デフォルト値 | 説明 |
|------------|-----|------|------------|------|
| serviceName | string | ✓ | - | サービス名 |
| environment | Environment | ✓ | - | デプロイ環境 |
| ecrRepositoryName | string | ✓ | - | ECR リポジトリ名 |
| lambdaConfig | LambdaConfig | - | - | Lambda 設定 |
| enableFunctionUrl | boolean | - | `true` | Function URL の有効化 |
| additionalPolicyStatements | PolicyStatement[] | - | `[]` | 追加の IAM ポリシー |

#### 公開プロパティ

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| lambdaFunction | lambda.Function | 作成された Lambda 関数 |
| functionUrl | lambda.FunctionUrl \| undefined | Lambda Function URL (有効時のみ) |
| executionRole | iam.Role | Lambda 実行ロール |

#### CloudFormation Outputs

| Output 名 | 説明 |
|-----------|------|
| FunctionName | Lambda 関数名 |
| FunctionArn | Lambda 関数 ARN |
| FunctionUrl | Function URL (有効時のみ) |

#### 使用例

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    memorySize: 1024,
    timeout: 60,
    environment: {
      NODE_ENV: 'development',
    },
  },
  additionalPolicyStatements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem'],
      resources: ['arn:aws:dynamodb:*:*:table/my-table'],
    }),
  ],
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// Function URL を取得
console.log(lambdaStack.functionUrl?.url);
```

---

### CloudFrontStackBase

CloudFront ディストリビューションを作成するベーススタック。

#### コンストラクタ

```typescript
constructor(scope: Construct, id: string, props: CloudFrontStackBaseProps)
```

#### Props

```typescript
interface CloudFrontStackBaseProps extends cdk.StackProps {
  serviceName: string;
  environment: Environment;
  functionUrl: string;
  cloudfrontConfig?: CloudFrontConfig;
  certificateArn?: string;
  cachePolicy?: cloudfront.ICachePolicy;
}
```

| プロパティ名 | 型 | 必須 | デフォルト値 | 説明 |
|------------|-----|------|------------|------|
| serviceName | string | ✓ | - | サービス名 |
| environment | Environment | ✓ | - | デプロイ環境 |
| functionUrl | string | ✓ | - | Lambda Function URL |
| cloudfrontConfig | CloudFrontConfig | - | - | CloudFront 設定 |
| certificateArn | string | - | 共有証明書を自動参照 | ACM 証明書 ARN |
| cachePolicy | ICachePolicy | - | `CACHING_DISABLED` | キャッシュポリシー |

#### 公開プロパティ

| プロパティ名 | 型 | 説明 |
|------------|-----|------|
| distribution | cloudfront.Distribution | 作成された CloudFront ディストリビューション |
| responseHeadersPolicy | cloudfront.ResponseHeadersPolicy \| undefined | セキュリティヘッダーポリシー (有効時のみ) |

#### CloudFormation Outputs

| Output 名 | 説明 |
|-----------|------|
| DistributionId | ディストリビューション ID |
| DistributionDomainName | CloudFront ドメイン名 |
| CustomDomainName | カスタムドメイン名 |

#### 使用例

```typescript
const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true,
    minimumTlsVersion: '1.3',
  },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 固定
  },
});

// ドメイン名を取得
console.log(cloudfrontStack.distribution.distributionDomainName);
```

---

## 命名規則関数

### getResourceName

汎用的なリソース名を生成します。

```typescript
function getResourceName(
  serviceName: string,
  resourceType: ResourceType,
  environment: Environment
): string
```

**パラメータ:**

| パラメータ名 | 型 | 説明 |
|------------|-----|------|
| serviceName | string | サービス名 |
| resourceType | ResourceType | リソース種別 |
| environment | Environment | デプロイ環境 |

**戻り値:** `nagiyu-{service}-{type}-{env}` 形式のリソース名

**使用例:**

```typescript
import { getResourceName } from '@nagiyu/infra-common';

const name = getResourceName('tools', 'ecr', 'dev');
// => 'nagiyu-tools-ecr-dev'
```

---

### getEcrRepositoryName

ECR リポジトリ名を生成します。

```typescript
function getEcrRepositoryName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getEcrRepositoryName } from '@nagiyu/infra-common';

const name = getEcrRepositoryName('tools', 'dev');
// => 'nagiyu-tools-ecr-dev'
```

---

### getLambdaFunctionName

Lambda 関数名を生成します。

```typescript
function getLambdaFunctionName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getLambdaFunctionName } from '@nagiyu/infra-common';

const name = getLambdaFunctionName('auth', 'prod');
// => 'nagiyu-auth-lambda-prod'
```

---

### getCloudFrontDomainName

CloudFront ドメイン名を生成します。

```typescript
function getCloudFrontDomainName(
  serviceName: string,
  environment: Environment
): string
```

**ドメイン生成ルール:**

- **prod環境**: `{service}.nagiyu.com`
- **dev環境**: `dev-{service}.nagiyu.com`

**使用例:**

```typescript
import { getCloudFrontDomainName } from '@nagiyu/infra-common';

const prodDomain = getCloudFrontDomainName('tools', 'prod');
// => 'tools.nagiyu.com'

const devDomain = getCloudFrontDomainName('auth', 'dev');
// => 'dev-auth.nagiyu.com'
```

---

### getS3BucketName

S3 バケット名を生成します。

```typescript
function getS3BucketName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getS3BucketName } from '@nagiyu/infra-common';

const name = getS3BucketName('tools', 'dev');
// => 'nagiyu-tools-s3-dev'
```

---

### getDynamoDBTableName

DynamoDB テーブル名を生成します。

```typescript
function getDynamoDBTableName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getDynamoDBTableName } from '@nagiyu/infra-common';

const name = getDynamoDBTableName('auth', 'prod');
// => 'nagiyu-auth-dynamodb-prod'
```

---

### getIamRoleName

IAM ロール名を生成します。

```typescript
function getIamRoleName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getIamRoleName } from '@nagiyu/infra-common';

const name = getIamRoleName('tools', 'dev');
// => 'nagiyu-tools-iam-role-dev'
```

---

### getLogGroupName

CloudWatch Logs ロググループ名を生成します。

```typescript
function getLogGroupName(
  serviceName: string,
  environment: Environment
): string
```

**使用例:**

```typescript
import { getLogGroupName } from '@nagiyu/infra-common';

const name = getLogGroupName('tools', 'dev');
// => '/aws/lambda/nagiyu-tools-lambda-dev'
```

---

## デフォルト値

### DEFAULT_LAMBDA_CONFIG

Lambda のデフォルト設定。

```typescript
const DEFAULT_LAMBDA_CONFIG = {
  memorySize: 512,
  timeout: 30,
  architecture: 'X86_64',
  runtime: 'nodejs20.x',
}
```

**使用例:**

```typescript
import { DEFAULT_LAMBDA_CONFIG, mergeConfig } from '@nagiyu/infra-common';

const config = mergeConfig(
  { memorySize: 1024 }, // ユーザー設定
  DEFAULT_LAMBDA_CONFIG  // デフォルト設定
);
// => { memorySize: 1024, timeout: 30, architecture: 'X86_64', runtime: 'nodejs20.x' }
```

---

### DEFAULT_ECR_CONFIG

ECR のデフォルト設定。

```typescript
const DEFAULT_ECR_CONFIG = {
  imageScanOnPush: true,
  maxImageCount: 10,
  imageTagMutability: 'MUTABLE',
}
```

---

### DEFAULT_CLOUDFRONT_CONFIG

CloudFront のデフォルト設定。

```typescript
const DEFAULT_CLOUDFRONT_CONFIG = {
  enableSecurityHeaders: true,
  minimumTlsVersion: '1.2',
  enableHttp2: true,
  enableHttp3: true,
  priceClass: 'PriceClass_100',
}
```

---

### mergeConfig

ユーザー設定とデフォルト設定をマージします。

```typescript
function mergeConfig<T>(
  config: Partial<T> | undefined,
  defaults: T
): T
```

**使用例:**

```typescript
import { DEFAULT_LAMBDA_CONFIG, mergeConfig } from '@nagiyu/infra-common';

const config = mergeConfig(
  { memorySize: 1024, timeout: 60 },
  DEFAULT_LAMBDA_CONFIG
);
// => { memorySize: 1024, timeout: 60, architecture: 'X86_64', runtime: 'nodejs20.x' }
```

---

## セキュリティヘッダー

### HSTS_HEADER

Strict-Transport-Security ヘッダー設定。

```typescript
const HSTS_HEADER = {
  accessControlMaxAge: 63072000, // 2年間
  includeSubdomains: true,
  preload: true,
  override: true,
}
```

---

### CONTENT_TYPE_OPTIONS_HEADER

X-Content-Type-Options ヘッダー設定。

```typescript
const CONTENT_TYPE_OPTIONS_HEADER = {
  override: true,
}
```

---

### FRAME_OPTIONS_HEADER

X-Frame-Options ヘッダー設定。

```typescript
const FRAME_OPTIONS_HEADER = {
  frameOption: 'DENY',
  override: true,
}
```

---

### XSS_PROTECTION_HEADER

X-XSS-Protection ヘッダー設定。

```typescript
const XSS_PROTECTION_HEADER = {
  protection: true,
  modeBlock: true,
  override: true,
}
```

---

### REFERRER_POLICY_HEADER

Referrer-Policy ヘッダー設定。

```typescript
const REFERRER_POLICY_HEADER = {
  referrerPolicy: 'strict-origin-when-cross-origin',
  override: true,
}
```

---

### PERMISSIONS_POLICY_HEADER

Permissions-Policy ヘッダー設定。

```typescript
const PERMISSIONS_POLICY_HEADER = {
  camera: 'none',
  microphone: 'none',
  geolocation: 'none',
  payment: 'none',
}
```

---

### SECURITY_HEADERS

すべてのセキュリティヘッダーをまとめたオブジェクト。

```typescript
const SECURITY_HEADERS = {
  strictTransportSecurity: HSTS_HEADER,
  contentTypeOptions: CONTENT_TYPE_OPTIONS_HEADER,
  frameOptions: FRAME_OPTIONS_HEADER,
  xssProtection: XSS_PROTECTION_HEADER,
  referrerPolicy: REFERRER_POLICY_HEADER,
}
```

**使用例:**

```typescript
import { SECURITY_HEADERS } from '@nagiyu/infra-common';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
  securityHeadersBehavior: SECURITY_HEADERS,
});
```

---

## 関連ドキュメント

- [README](../infra/common/README.md) - パッケージ概要
- [使用ガイド](./common-package-guide.md) - 基本的な使用方法
- [マイグレーションガイド](./migration-guide.md) - 既存サービスの移行手順
- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想

# CDK 共通ユーティリティ

このドキュメントは、CloudFormation から CDK への移行を支援する共通ユーティリティについて説明します。

## 概要

`infra/shared/libs/utils` ディレクトリには、CDK スタック開発を支援するユーティリティファイルが含まれています。

## ファイル一覧

### exports.ts

CloudFormation の Export 名を一元管理するための定数定義ファイルです。

**配置**: `infra/shared/libs/utils/exports.ts`

**目的**:
- typo を防ぐ
- IDE の補完機能を活用
- Export 名の変更時に一箇所の修正で済む

**使用例**:

```typescript
import * as cdk from 'aws-cdk-lib';
import { EXPORTS } from './shared/libs/utils/exports';

// 環境依存の Export を参照
const vpcId = cdk.Fn.importValue(EXPORTS.VPC_ID('dev'));
// → 'nagiyu-dev-vpc-id'

const subnetIds = cdk.Fn.importValue(EXPORTS.PUBLIC_SUBNET_IDS('prod'));
// → 'nagiyu-prod-public-subnet-ids'

// 固定の Export を参照
const certArn = cdk.Fn.importValue(EXPORTS.ACM_CERTIFICATE_ARN);
// → 'nagiyu-shared-acm-certificate-arn'
```

**定義済み Export 名**:

- **VPC 関連** (環境依存):
    - `VPC_ID(env)` - VPC ID
    - `PUBLIC_SUBNET_IDS(env)` - パブリックサブネット ID リスト
    - `IGW_ID(env)` - インターネットゲートウェイ ID
    - `VPC_CIDR(env)` - VPC CIDR ブロック

- **ACM 関連** (共有):
    - `ACM_CERTIFICATE_ARN` - ACM 証明書 ARN
    - `ACM_DOMAIN_NAME` - ドメイン名
    - `ACM_WILDCARD_DOMAIN` - ワイルドカードドメイン

- **IAM Policies** (共有):
    - `DEPLOY_POLICY_CORE_ARN` - コアデプロイポリシー ARN
    - `DEPLOY_POLICY_APPLICATION_ARN` - アプリケーションデプロイポリシー ARN
    - `DEPLOY_POLICY_CONTAINER_ARN` - コンテナデプロイポリシー ARN
    - `DEPLOY_POLICY_INTEGRATION_ARN` - インテグレーションデプロイポリシー ARN

- **IAM Users** (共有):
    - `GITHUB_ACTIONS_USER_ARN` - GitHub Actions ユーザー ARN
    - `GITHUB_ACTIONS_USER_NAME` - GitHub Actions ユーザー名
    - `LOCAL_DEV_USER_ARN` - ローカル開発ユーザー ARN
    - `LOCAL_DEV_USER_NAME` - ローカル開発ユーザー名

### env-config.ts

環境別の設定を管理するための型定義と関数です。

**配置**: `infra/shared/libs/utils/env-config.ts`

**使用例**:

```typescript
import { getEnvConfig } from './shared/libs/utils/env-config';

const devConfig = getEnvConfig('dev');
console.log(devConfig);
// {
//   environment: 'dev',
//   vpcCidr: '10.0.0.0/24',
//   maxAzs: 1
// }

const prodConfig = getEnvConfig('prod');
console.log(prodConfig);
// {
//   environment: 'prod',
//   vpcCidr: '10.1.0.0/24',
//   maxAzs: 2
// }
```

**型定義**:

- `Environment`: `'dev' | 'prod'` - 環境の型
- `EnvConfig`: 環境設定のインターフェース
    - `environment`: 環境名
    - `vpcCidr`: VPC CIDR ブロック
    - `maxAzs`: 最大 AZ 数

## CDK スタックでの使用例

### 既存 VPC の参照

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { EXPORTS } from '../shared/libs/utils/exports';

export class MyStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const environment = process.env.ENVIRONMENT || 'dev';

        // CloudFormation の Export から VPC を参照
        const vpcId = cdk.Fn.importValue(EXPORTS.VPC_ID(environment));

        // 既存 VPC を Lookup
        const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
            vpcId: vpcId,
        });

        // この VPC を使って新しいリソースを作成
        // ...
    }
}
```

### ACM 証明書の参照

```typescript
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { EXPORTS } from '../shared/libs/utils/exports';

export class MyStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // CloudFormation の Export から証明書を参照
        const certArn = cdk.Fn.importValue(EXPORTS.ACM_CERTIFICATE_ARN);

        const certificate = acm.Certificate.fromCertificateArn(
            this,
            'Certificate',
            certArn
        );

        // CloudFront や ALB で使用
        // ...
    }
}
```

### 環境設定の使用

```typescript
import * as cdk from 'aws-cdk-lib';
import { getEnvConfig } from '../shared/libs/utils/env-config';

export class MyStack extends cdk.Stack {
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const environment = process.env.ENVIRONMENT || 'dev';
        const config = getEnvConfig(environment as 'dev' | 'prod');

        console.log(`Deploying to ${config.environment}`);
        console.log(`VPC CIDR: ${config.vpcCidr}`);
        console.log(`Max AZs: ${config.maxAzs}`);

        // 環境に応じたリソース作成
        // ...
    }
}
```

## メンテナンス

### Export 名の追加

新しい CloudFormation Export を追加する場合:

1. `infra/shared/libs/utils/exports.ts` に定数を追加
2. コメントで説明を記載
3. 環境依存の場合は関数形式 `(env: string) => string` を使用
4. 固定の場合は文字列定数を使用
5. `as const` を忘れずに付ける

### 環境設定の変更

`infra/shared/libs/utils/env-config.ts` で環境ごとの設定を変更できます:

```typescript
export function getEnvConfig(env: Environment): EnvConfig {
    return {
        environment: env,
        vpcCidr: env === 'prod' ? '10.1.0.0/24' : '10.0.0.0/24',
        maxAzs: env === 'prod' ? 2 : 1,
        // 新しい設定を追加
    };
}
```

## 関連ドキュメント

- [CDK 移行ガイド](../cdk-migration.md) - CloudFormation から CDK への移行戦略
- [インフラアーキテクチャ](../architecture.md) - インフラ全体の設計
- [VPC](./vpc.md) - VPC の詳細
- [IAM](./iam.md) - IAM の詳細

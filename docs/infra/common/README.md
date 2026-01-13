# @nagiyu/infra-common

Nagiyu Platform の共通インフラストラクチャライブラリ

## 概要

`@nagiyu/infra-common` は、Nagiyu Platform の全サービスで共通利用できる AWS CDK のベーススタック実装を提供します。このライブラリを使用することで、以下の利点が得られます：

- **コードの重複排除**: 50-75%のコード削減
- **一貫性の確保**: リソース命名規則の統一、セキュリティ設定の標準化
- **メンテナンス性の向上**: 設定変更が1箇所で完結
- **型安全性**: TypeScript strict mode による型チェック

### 主な機能

- **ベーススタッククラス**: ECR、Lambda、CloudFront の共通スタック実装
- **型定義**: サービス設定、リソース設定の TypeScript 型定義
- **命名規則**: AWS リソース名の統一的な生成ユーティリティ
- **デフォルト値**: Lambda、ECR、CloudFront の推奨設定値
- **セキュリティヘッダー**: 標準化されたセキュリティヘッダー定義

## インストール

このパッケージは npm workspaces によってモノレポ内で管理されています。

```bash
# パッケージのビルド
npm run build --workspace @nagiyu/infra-common

# テストの実行
npm run test --workspace @nagiyu/infra-common
```

## 使用方法

### 1. ベーススタッククラス

#### EcrStackBase

ECR リポジトリの共通実装を提供します。

**主な機能:**

- リポジトリ作成（命名規則に従って自動生成）
- イメージスキャン設定（デフォルト有効）
- ライフサイクルポリシー（イメージ保持数管理）
- 環境に応じた削除ポリシー（prod: RETAIN / dev: DESTROY）
- タグ管理
- CloudFormation Outputs

**基本的な使用例:**

```typescript
import { EcrStackBase } from '@nagiyu/infra-common';

const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
});

// リポジトリ名: nagiyu-tools-ecr-dev
// イメージスキャン: 有効
// イメージ保持数: 10
// 削除ポリシー: DESTROY (dev環境)
```

**カスタマイズ例:**

```typescript
const ecrStack = new EcrStackBase(app, 'AuthEcrStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrConfig: {
    maxImageCount: 20, // イメージ保持数を20に変更
    imageScanOnPush: true, // スキャンを明示的に有効化
    imageTagMutability: 'IMMUTABLE', // イミュータブルタグを使用
  },
});
```

#### LambdaStackBase

Lambda 関数の共通実装を提供します。

**主な機能:**

- Lambda 関数作成（ECR イメージからのデプロイ）
- 実行ロール自動作成（基本的なログ権限付き）
- 環境変数設定
- Function URL 作成（オプション、デフォルト有効）
- 追加の IAM ポリシー設定
- タグ管理
- CloudFormation Outputs

**基本的な使用例:**

```typescript
import { LambdaStackBase } from '@nagiyu/infra-common';

const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: 'nagiyu-tools-ecr-dev',
});

// 関数名: nagiyu-tools-lambda-dev
// メモリ: 512MB
// タイムアウト: 30秒
// アーキテクチャ: X86_64
// Function URL: 有効
```

**カスタマイズ例:**

```typescript
import * as iam from 'aws-cdk-lib/aws-iam';

const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: 'nagiyu-auth-ecr-prod',
  lambdaConfig: {
    memorySize: 1024, // メモリサイズを1024MBに
    timeout: 60, // タイムアウトを60秒に
    architecture: 'ARM_64', // ARM64アーキテクチャを使用
    environment: {
      NODE_ENV: 'production',
      DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
    },
  },
  additionalPolicyStatements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
    }),
  ],
});
```

#### CloudFrontStackBase

CloudFront ディストリビューションの共通実装を提供します。

**主な機能:**

- CloudFront ディストリビューション作成
- Lambda Function URL オリジン設定
- セキュリティヘッダーポリシー作成（デフォルト有効）
- ACM 証明書の参照
- カスタムドメイン設定
- TLS 1.2 以上の強制
- HTTP/2 および HTTP/3 サポート
- タグ管理
- CloudFormation Outputs

**基本的な使用例:**

```typescript
import { CloudFrontStackBase } from '@nagiyu/infra-common';

const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
});

// ドメイン名: dev-tools.nagiyu.com
// セキュリティヘッダー: 有効
// TLS: 1.2以上
// HTTP: HTTP/2 + HTTP/3
// キャッシュ: 無効（API向け設定）
```

**カスタマイズ例:**

```typescript
const cloudfrontStack = new CloudFrontStackBase(app, 'AuthCloudFrontStack', {
  serviceName: 'auth',
  environment: 'prod',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true,
    minimumTlsVersion: '1.3', // TLS 1.3を使用
    priceClass: 'PriceClass_All', // 全エッジロケーションを使用
  },
  certificateArn: 'arn:aws:acm:us-east-1:...', // カスタム証明書
  cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, // キャッシュ有効化
});
```

#### 完全な統合例

```typescript
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { EcrStackBase, LambdaStackBase, CloudFrontStackBase } from '@nagiyu/infra-common';

const app = new cdk.App();

// 1. ECR スタック
const ecrStack = new EcrStackBase(app, 'ToolsEcrStack', {
  serviceName: 'tools',
  environment: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// 2. Lambda スタック
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    memorySize: 1024,
    environment: {
      NODE_ENV: 'development',
      APP_VERSION: process.env.APP_VERSION || 'unknown',
    },
  },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'ap-northeast-1',
  },
});

// 3. CloudFront スタック
const cloudfrontStack = new CloudFrontStackBase(app, 'ToolsCloudFrontStack', {
  serviceName: 'tools',
  environment: 'dev',
  functionUrl: lambdaStack.functionUrl!.url,
  cloudfrontConfig: {
    enableSecurityHeaders: true,
  },
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1
  },
});

app.synth();
```

### 2. 型定義

```typescript
import type {
  Environment,
  ServiceConfig,
  EcrConfig,
  LambdaConfig,
  CloudFrontConfig,
} from '@nagiyu/infra-common';

// サービス設定の例
const config: ServiceConfig = {
  serviceName: 'tools',
  environment: 'dev',
  lambda: {
    memorySize: 1024,
    timeout: 60,
  },
  cloudfront: {
    enableSecurityHeaders: true,
  },
};
```

### 3. 命名規則ユーティリティ

AWS リソース名を統一的な命名規則 (`nagiyu-{service}-{type}-{env}`) で生成します。

```typescript
import {
  getEcrRepositoryName,
  getLambdaFunctionName,
  getCloudFrontDomainName,
  getS3BucketName,
  getDynamoDBTableName,
  getIamRoleName,
  getLogGroupName,
} from '@nagiyu/infra-common';

// ECR リポジトリ名: nagiyu-tools-ecr-dev
const ecrName = getEcrRepositoryName('tools', 'dev');

// Lambda 関数名: nagiyu-auth-lambda-prod
const lambdaName = getLambdaFunctionName('auth', 'prod');

// CloudFront ドメイン名
// prod: tools.nagiyu.com
// dev: dev-tools.nagiyu.com
const domain = getCloudFrontDomainName('tools', 'prod');

// S3 バケット名: nagiyu-tools-s3-dev
const bucketName = getS3BucketName('tools', 'dev');

// DynamoDB テーブル名: nagiyu-auth-dynamodb-prod
const tableName = getDynamoDBTableName('auth', 'prod');

// IAM ロール名: nagiyu-tools-iam-role-dev
const roleName = getIamRoleName('tools', 'dev');

// CloudWatch Logs ロググループ名: /aws/lambda/nagiyu-tools-lambda-dev
const logGroupName = getLogGroupName('tools', 'dev');
```

### 4. デフォルト設定

推奨されるデフォルト設定値を使用できます。

```typescript
import {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_ECR_CONFIG,
  DEFAULT_CLOUDFRONT_CONFIG,
  mergeConfig,
} from '@nagiyu/infra-common';

// Lambda のデフォルト設定
// {
//   memorySize: 512,
//   timeout: 30,
//   architecture: 'X86_64',
//   runtime: 'nodejs20.x',
// }
console.log(DEFAULT_LAMBDA_CONFIG);

// ユーザー設定とデフォルト設定をマージ
const lambdaConfig = mergeConfig(
  {
    memorySize: 1024, // 上書き
    timeout: 60, // 上書き
    // architecture と runtime はデフォルト値を使用
  },
  DEFAULT_LAMBDA_CONFIG
);
```

### 5. セキュリティヘッダー

標準化されたセキュリティヘッダー設定を使用できます。

```typescript
import {
  SECURITY_HEADERS,
  HSTS_HEADER,
  CONTENT_TYPE_OPTIONS_HEADER,
  FRAME_OPTIONS_HEADER,
  XSS_PROTECTION_HEADER,
  REFERRER_POLICY_HEADER,
} from '@nagiyu/infra-common';

// CloudFront ResponseHeadersPolicy で使用
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
  securityHeadersBehavior: {
    strictTransportSecurity: {
      accessControlMaxAge: cdk.Duration.seconds(HSTS_HEADER.accessControlMaxAge),
      includeSubdomains: HSTS_HEADER.includeSubdomains,
      preload: HSTS_HEADER.preload,
      override: HSTS_HEADER.override,
    },
    contentTypeOptions: {
      override: CONTENT_TYPE_OPTIONS_HEADER.override,
    },
    frameOptions: {
      frameOption: cloudfront.HeadersFrameOption.DENY,
      override: FRAME_OPTIONS_HEADER.override,
    },
    xssProtection: {
      protection: XSS_PROTECTION_HEADER.protection,
      modeBlock: XSS_PROTECTION_HEADER.modeBlock,
      override: XSS_PROTECTION_HEADER.override,
    },
    referrerPolicy: {
      referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: REFERRER_POLICY_HEADER.override,
    },
  },
});
```

## デフォルト値一覧

### Lambda

| 設定項目     | デフォルト値 | 説明              |
| ------------ | ------------ | ----------------- |
| memorySize   | 512          | メモリサイズ (MB) |
| timeout      | 30           | タイムアウト (秒) |
| architecture | X86_64       | アーキテクチャ    |
| runtime      | nodejs20.x   | ランタイム        |

### ECR

| 設定項目           | デフォルト値 | 説明                         |
| ------------------ | ------------ | ---------------------------- |
| imageScanOnPush    | true         | プッシュ時のイメージスキャン |
| maxImageCount      | 10           | 保持するイメージの最大数     |
| imageTagMutability | MUTABLE      | イメージタグの可変性         |

### CloudFront

| 設定項目              | デフォルト値   | 説明                         |
| --------------------- | -------------- | ---------------------------- |
| enableSecurityHeaders | true           | セキュリティヘッダーの有効化 |
| minimumTlsVersion     | 1.2            | 最小 TLS バージョン          |
| enableHttp2           | true           | HTTP/2 の有効化              |
| enableHttp3           | true           | HTTP/3 の有効化              |
| priceClass            | PriceClass_100 | 価格クラス                   |

## セキュリティヘッダー一覧

### Strict-Transport-Security (HSTS)

| 設定項目            | 値       | 説明                            |
| ------------------- | -------- | ------------------------------- |
| accessControlMaxAge | 63072000 | max-age (2年間)                 |
| includeSubdomains   | true     | サブドメインにも適用            |
| preload             | true     | HSTS プリロードリストに登録可能 |

### X-Content-Type-Options

- MIME タイプスニッフィングを防止

### X-Frame-Options

- フレーム内での表示を拒否 (DENY)

### X-XSS-Protection

- XSS フィルタを有効化
- XSS 検出時はページをブロック

### Referrer-Policy

- `strict-origin-when-cross-origin`
- 同一オリジン: 完全なリファラーを送信
- クロスオリジン: オリジンのみを送信

## 開発

### ビルド

```bash
npm run build --workspace @nagiyu/infra-common
```

### テスト

```bash
# テスト実行
npm run test --workspace @nagiyu/infra-common

# カバレッジ付きテスト
npm run test:coverage --workspace @nagiyu/infra-common

# ウォッチモード
npm run test:watch --workspace @nagiyu/infra-common
```

### コード品質

```bash
# ESLint
npm run lint --workspace @nagiyu/infra-common

# Prettier チェック
npm run format:check --workspace @nagiyu/infra-common

# Prettier 自動フォーマット
npm run format --workspace @nagiyu/infra-common
```

## ライセンス

このプロジェクトは MIT ライセンスおよび Apache License 2.0 のデュアルライセンスです。

## 関連ドキュメント

- [インフラストラクチャドキュメント](../README.md)
- [開発ガイドライン](../../development/README.md)

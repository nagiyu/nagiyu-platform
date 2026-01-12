# @nagiyu/infra-common

Nagiyu Platform の共通インフラストラクチャライブラリ

## 概要

`@nagiyu/infra-common` は、Nagiyu Platform の全サービスで共通利用できる AWS CDK のベーススタック実装を提供します。このライブラリを使用することで、以下の利点が得られます：

- **コードの重複排除**: 50-75%のコード削減
- **一貫性の確保**: リソース命名規則の統一、セキュリティ設定の標準化
- **メンテナンス性の向上**: 設定変更が1箇所で完結
- **型安全性**: TypeScript strict mode による型チェック

## インストール

```bash
npm install @nagiyu/infra-common
```

## 提供機能

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
  enableFunctionUrl: true,
  functionUrlCorsConfig: {
    allowedOrigins: ['https://auth.nagiyu.com'],
    allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.POST],
  },
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

### 2. 命名規則ユーティリティ

統一されたリソース命名規則を提供します。

```typescript
import {
  getEcrRepositoryName,
  getLambdaFunctionName,
  getCloudFrontDomainName,
} from '@nagiyu/infra-common';

// ECR: nagiyu-tools-ecr-dev
const ecrName = getEcrRepositoryName('tools', 'dev');

// Lambda: nagiyu-auth-lambda-prod
const lambdaName = getLambdaFunctionName('auth', 'prod');

// CloudFront: tools.nagiyu.com (prod)
const domain = getCloudFrontDomainName('tools', 'prod');

// CloudFront: dev-tools.nagiyu.com (dev)
const devDomain = getCloudFrontDomainName('tools', 'dev');
```

### 3. デフォルト設定

すべてのスタックで使用されるデフォルト設定を提供します。

```typescript
import {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_ECR_CONFIG,
  DEFAULT_CLOUDFRONT_CONFIG,
} from '@nagiyu/infra-common';

// Lambda デフォルト設定
// - memorySize: 512 MB
// - timeout: 30秒
// - architecture: X86_64
// - runtime: nodejs20.x

// ECR デフォルト設定
// - imageScanOnPush: true
// - maxImageCount: 10
// - imageTagMutability: MUTABLE

// CloudFront デフォルト設定
// - enableSecurityHeaders: true
// - minimumTlsVersion: 1.2
// - enableHttp2: true
// - enableHttp3: true
// - priceClass: PriceClass_100
```

### 4. セキュリティヘッダー

CloudFront で使用するセキュリティヘッダーの設定を提供します。

```typescript
import {
  SECURITY_HEADERS,
  HSTS_HEADER,
  CONTENT_TYPE_OPTIONS_HEADER,
  FRAME_OPTIONS_HEADER,
  XSS_PROTECTION_HEADER,
  REFERRER_POLICY_HEADER,
} from '@nagiyu/infra-common';

// 全セキュリティヘッダー
// - Strict-Transport-Security (HSTS: 2年間、preload対応)
// - X-Content-Type-Options (nosniff)
// - X-Frame-Options (DENY)
// - X-XSS-Protection (1; mode=block)
// - Referrer-Policy (strict-origin-when-cross-origin)
```

## 型定義

### Environment

```typescript
type Environment = 'dev' | 'prod';
```

### EcrConfig

```typescript
interface EcrConfig {
  repositoryName?: string; // カスタムリポジトリ名
  imageScanOnPush?: boolean; // イメージスキャン (デフォルト: true)
  maxImageCount?: number; // 保持イメージ数 (デフォルト: 10)
  imageTagMutability?: 'MUTABLE' | 'IMMUTABLE'; // タグ可変性 (デフォルト: MUTABLE)
  removalPolicy?: 'DESTROY' | 'RETAIN'; // 削除ポリシー (環境に基づいて自動設定)
}
```

### LambdaConfig

```typescript
interface LambdaConfig {
  functionName?: string; // カスタム関数名
  memorySize?: number; // メモリサイズ (デフォルト: 512)
  timeout?: number; // タイムアウト (デフォルト: 30)
  architecture?: 'X86_64' | 'ARM_64'; // アーキテクチャ (デフォルト: X86_64)
  runtime?: string; // ランタイム (デフォルト: nodejs20.x)
  environment?: Record<string, string>; // 環境変数
  reservedConcurrentExecutions?: number; // 予約済み同時実行数
}
```

### CloudFrontConfig

```typescript
interface CloudFrontConfig {
  domainName?: string; // カスタムドメイン名
  enableSecurityHeaders?: boolean; // セキュリティヘッダー (デフォルト: true)
  minimumTlsVersion?: '1.2' | '1.3'; // 最小TLSバージョン (デフォルト: 1.2)
  enableHttp2?: boolean; // HTTP/2 (デフォルト: true)
  enableHttp3?: boolean; // HTTP/3 (デフォルト: true)
  priceClass?: string; // 価格クラス (デフォルト: PriceClass_100)
  additionalBehaviors?: Record<string, unknown>; // 追加の動作設定
}
```

## 完全な使用例

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

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test
```

### リント

```bash
npm run lint
```

### フォーマット

```bash
npm run format
```

## ライセンス

このプロジェクトは MIT ライセンスと Apache License 2.0 のデュアルライセンスです。

## 関連リンク

- [AWS CDK ドキュメント](https://docs.aws.amazon.com/cdk/)
- [Nagiyu Platform リポジトリ](https://github.com/nagiyu/nagiyu-platform)

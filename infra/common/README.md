# @nagiyu/infra-common

Nagiyu Platform の共通インフラストラクチャユーティリティパッケージ

## 概要

`@nagiyu/infra-common` は、AWS CDK を使用したインフラストラクチャコードの共通化とベストプラクティスの標準化を目的としたパッケージです。

### 主な機能

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

### 型定義

```typescript
import type {
  Environment,
  ServiceConfig,
  EcrConfig,
  LambdaConfig,
  CloudFrontConfig,
} from "@nagiyu/infra-common";

// サービス設定の例
const config: ServiceConfig = {
  serviceName: "tools",
  environment: "dev",
  lambda: {
    memorySize: 1024,
    timeout: 60,
  },
  cloudfront: {
    enableSecurityHeaders: true,
  },
};
```

### 命名規則ユーティリティ

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
} from "@nagiyu/infra-common";

// ECR リポジトリ名: nagiyu-tools-ecr-dev
const ecrName = getEcrRepositoryName("tools", "dev");

// Lambda 関数名: nagiyu-auth-lambda-prod
const lambdaName = getLambdaFunctionName("auth", "prod");

// CloudFront ドメイン名
// prod: tools.nagiyu.com
// dev: dev-tools.nagiyu.com
const domain = getCloudFrontDomainName("tools", "prod");

// S3 バケット名: nagiyu-tools-s3-dev
const bucketName = getS3BucketName("tools", "dev");

// DynamoDB テーブル名: nagiyu-auth-dynamodb-prod
const tableName = getDynamoDBTableName("auth", "prod");

// IAM ロール名: nagiyu-tools-iam-role-dev
const roleName = getIamRoleName("tools", "dev");

// CloudWatch Logs ロググループ名: /aws/lambda/nagiyu-tools-lambda-dev
const logGroupName = getLogGroupName("tools", "dev");
```

### デフォルト設定

推奨されるデフォルト設定値を使用できます。

```typescript
import {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_ECR_CONFIG,
  DEFAULT_CLOUDFRONT_CONFIG,
  mergeConfig,
} from "@nagiyu/infra-common";

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
  DEFAULT_LAMBDA_CONFIG,
);
```

### セキュリティヘッダー

標準化されたセキュリティヘッダー設定を使用できます。

```typescript
import {
  SECURITY_HEADERS,
  HSTS_HEADER,
  CONTENT_TYPE_OPTIONS_HEADER,
  FRAME_OPTIONS_HEADER,
  XSS_PROTECTION_HEADER,
  REFERRER_POLICY_HEADER,
} from "@nagiyu/infra-common";

// CloudFront ResponseHeadersPolicy で使用
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
  this,
  "SecurityHeadersPolicy",
  {
    securityHeadersBehavior: {
      strictTransportSecurity: {
        accessControlMaxAge: cdk.Duration.seconds(
          HSTS_HEADER.accessControlMaxAge,
        ),
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
        referrerPolicy:
          cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        override: REFERRER_POLICY_HEADER.override,
      },
    },
  },
);
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

- [Phase 1: 基盤構築](../../tasks/infra-common-package/overview.md)
- [インフラストラクチャドキュメント](../../docs/infra/)
- [開発ガイドライン](../../docs/development/)

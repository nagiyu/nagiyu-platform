# Auth Service Infrastructure

Auth サービスの AWS インフラストラクチャを AWS CDK (TypeScript) で管理します。

## 📦 スタック構成

### 1. Auth Stack (`Auth-{env}`)
基盤となるスタック。以下の子スタックを作成します：
- DynamoDB Stack: ユーザーテーブル
- Secrets Stack: Google OAuth, NextAuth シークレット
- ECR Stack: コンテナレジストリ

### 2. Lambda Stack (`Auth-Lambda-{env}`)
Next.js アプリケーションを実行する Lambda 関数と関数 URL を作成します。

**リソース**:
- Lambda 関数 (`nagiyu-auth-{env}`)
  - Runtime: FROM_IMAGE (ECR コンテナ)
  - Architecture: ARM64
  - Memory: 512 MB
  - Timeout: 30秒
- Lambda 実行ロール
  - DynamoDB アクセス権限 (nagiyu-auth-users-{env})
  - Secrets Manager アクセス権限
- Lambda 関数 URL
  - AuthType: NONE (CloudFront が認証処理)
  - CORS: 有効

### 3. CloudFront Stack (`Auth-CloudFront-{env}`)
Lambda 関数 URL をオリジンとする CloudFront ディストリビューションを作成します。

**リソース**:
- CloudFront Distribution
  - Custom Domain: `{env}.auth.nagiyu.com` (prod: `auth.nagiyu.com`)
  - Origin: Lambda 関数 URL
  - Cache Policy: CACHING_DISABLED (認証サービスのため)
  - Origin Request Policy: ALL_VIEWER
- Response Headers Policy
  - Strict-Transport-Security
  - X-Content-Type-Options
  - X-Frame-Options
  - X-XSS-Protection
  - Referrer-Policy

## 🚀 デプロイ手順

### 前提条件

1. AWS CLI が設定済みであること
2. CDK Bootstrap が完了していること
3. 共有インフラ (ACM 証明書) がデプロイ済みであること

### 環境変数

| 変数名 | 説明 |
|--------|------|
| `CDK_DEFAULT_ACCOUNT` | AWS アカウント ID |
| `CDK_DEFAULT_REGION` | AWS リージョン (デフォルト: us-east-1) |

### デプロイコマンド

#### 開発環境 (dev)

```bash
# 1. 依存関係のインストール
npm install

# 2. ビルド
npm run build

# 3. 全スタックをデプロイ
npm run deploy:dev

# または個別にデプロイ
npx cdk deploy Auth-dev --context env=dev
npx cdk deploy Auth-Lambda-dev --context env=dev
npx cdk deploy Auth-CloudFront-dev --context env=dev
```

#### 本番環境 (prod)

```bash
# 全スタックをデプロイ
npm run deploy:prod

# または個別にデプロイ
npx cdk deploy Auth-prod --context env=prod
npx cdk deploy Auth-Lambda-prod --context env=prod
npx cdk deploy Auth-CloudFront-prod --context env=prod
```

### 注意事項

#### 初回 Lambda デプロイ

Lambda 関数は ECR からコンテナイメージをプルします。**初回デプロイ時は ECR にイメージが存在しないため、Lambda デプロイは失敗します。** これは想定内の動作です。

```bash
# 1. 基盤スタックをデプロイ (DynamoDB, Secrets, ECR)
npx cdk deploy Auth-dev --context env=dev

# 2. CI/CD でアプリケーションをビルドし、ECR にプッシュ
# (GitHub Actions などで実行)

# 3. Lambda と CloudFront をデプロイ
npx cdk deploy Auth-Lambda-dev Auth-CloudFront-dev --context env=dev
```

#### CloudFront のデプロイ時間

CloudFront ディストリビューションのデプロイには **15〜20分** かかります。

## 🔍 スタック情報の確認

### スタック一覧

```bash
npx cdk list --context env=dev
```

出力例:
```
Auth-dev
Auth-DynamoDB-dev
Auth-Secrets-dev
Auth-ECR-dev
Auth-Lambda-dev
Auth-CloudFront-dev
```

### CloudFormation テンプレートの確認

```bash
# Lambda スタックのテンプレート
npx cdk synth Auth-Lambda-dev --context env=dev

# CloudFront スタックのテンプレート
npx cdk synth Auth-CloudFront-dev --context env=dev
```

### スタックの差分確認

```bash
npm run diff:dev
# または
npx cdk diff Auth-Lambda-dev --context env=dev
```

## 📤 Outputs

### Lambda Stack

| Output名 | 説明 |
|---------|------|
| `FunctionName` | Lambda 関数名 |
| `FunctionArn` | Lambda 関数 ARN |
| `FunctionUrl` | Lambda 関数 URL |
| `RoleArn` | Lambda 実行ロール ARN |

### CloudFront Stack

| Output名 | 説明 |
|---------|------|
| `DistributionId` | CloudFront Distribution ID |
| `DistributionDomainName` | CloudFront ドメイン名 (xxxxx.cloudfront.net) |
| `CustomDomainName` | カスタムドメイン名 (auth.nagiyu.com) |

## 🔗 依存関係

### Lambda Stack の依存関係

- ECR Stack: コンテナイメージの取得
- DynamoDB Stack: テーブル名の参照
- Secrets Stack: シークレット名の参照

### CloudFront Stack の依存関係

- Lambda Stack: Lambda 関数 URL の参照
- 共有インフラ (ACM): SSL/TLS 証明書の参照 (`nagiyu-shared-acm-certificate-arn`)

## 🧹 スタックの削除

```bash
# 逆順で削除
npx cdk destroy Auth-CloudFront-dev --context env=dev
npx cdk destroy Auth-Lambda-dev --context env=dev
npx cdk destroy Auth-dev --context env=dev
```

**注意**: 本番環境 (prod) のスタックには `RemovalPolicy.RETAIN` が設定されており、一部リソース (DynamoDB, ECR) は削除されません。

## 🛠️ 開発

### TypeScript のビルド

```bash
npm run build
```

### ファイル変更の監視

```bash
npm run watch
```

### CDK のバージョン確認

```bash
npx cdk --version
```

## 📚 関連ドキュメント

- [Auth サービス アーキテクチャ](../../docs/services/auth/architecture.md)
- [共有インフラ ACM 証明書](../shared/acm/README.md)
- [デプロイ手順](../../docs/infra/deploy.md)

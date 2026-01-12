# 共通インフラストラクチャ

本ドキュメントは、すべてのアプリケーションで共有される基盤インフラリソースについて説明します。

---

## 概要

共通インフラは `infra/shared/` ディレクトリで管理され、以下のような特性を持ちます。

- すべてのアプリケーションから参照・利用される
- 一度デプロイすれば、基本的に変更頻度は低い
- 変更時は全アプリケーションへの影響を考慮する必要がある

---

## リソース一覧

### IAM (Identity and Access Management)

認証・認可に関するリソース。

- [IAM 詳細ドキュメント](./iam.md)

**配置場所:** `infra/shared/iam/`

**主なリソース:**
- デプロイポリシー (`policies/deploy-policy.yaml`)
- GitHub Actions ユーザー (`users/github-actions-user.yaml`)
- ローカル開発ユーザー (`users/local-dev-user.yaml`)

**用途:**
- CI/CD パイプラインでのデプロイ権限
- ローカル環境からの手動デプロイ権限

### VPC (Virtual Private Cloud)

ネットワーク基盤。

- [VPC 詳細ドキュメント](./vpc.md)
- [VPC CDK 使用ガイド](./shared-cdk-usage.md)

**配置場所:** `infra/shared/vpc/` (CloudFormation)、`infra/shared/` (CDK)

**主なリソース:**
- VPC (dev/prod 環境ごと)
- パブリックサブネット
- Internet Gateway
- Route Table

**用途:**
- ECS/Batch 用のネットワーク提供
- インターネットへのアクセス制御

**注意:** VPC は CDK に移行中です。詳細は [VPC CDK 使用ガイド](./shared-cdk-usage.md) を参照してください。

### ACM (AWS Certificate Manager)

SSL/TLS 証明書管理。

- [ACM 詳細ドキュメント](./acm.md)

**配置場所:** `infra/shared/lib/acm-stack.ts` (CDK)

**主なリソース:**
- ワイルドカード証明書 (`*.example.com` と `example.com`)

**用途:**
- CloudFront でのカスタムドメイン HTTPS 配信
- dev/prod 環境共通で使用

**注意:** ACM は CDK に移行済みです。詳細は [ACM 詳細ドキュメント](./acm.md) を参照してください。

### CloudFront

Web アプリケーション配信 (CDN)。

- [CloudFront 詳細ドキュメント](./cloudfront.md)

**配置場所:** アプリケーションごとに `infra/app-X/cloudfront/` (将来)

**主なリソース:**
- Distribution (環境ごと: dev/prod)
- オリジン設定 (S3, API Gateway, ALB, Lambda)

**用途:**
- カスタムドメインでの Web アプリ配信
- 静的コンテンツと API の統合配信
- 外部 DNS サービスとの連携

---

## デプロイ順序

共通インフラは以下の順序でデプロイしてください。

1. **IAM リソース**
    - デプロイポリシー (4つ: core, container, application, integration)
    - IAM ユーザー (GitHub Actions, ローカル開発)

2. **VPC リソース**
    - VPC およびサブネット
    - Internet Gateway

3. **ACM リソース**
    - SSL/TLS 証明書
    - DNS 検証レコードの設定（外部 DNS サービスで手動）

4. **その他の共通リソース（将来）**
    - CloudWatch Logs グループ
    - Parameter Store / Secrets Manager
    - ECR リポジトリ (共通)

---

## スタック命名規則

共通インフラのスタック名は以下の形式を使用します（CDK標準命名）。

```
NagiyuShared{ResourceType}
```

**例:**
- `NagiyuSharedIamCore` - IAM Core Policy
- `NagiyuSharedIamApplication` - IAM Application Policy
- `NagiyuSharedIamContainer` - IAM Container Policy
- `NagiyuSharedIamIntegration` - IAM Integration Policy
- `NagiyuSharedIamUsers` - IAM Users (GitHub Actions, Local Dev)
- `NagiyuSharedAcm` - ACM Certificate
- `NagiyuSharedVpcDev` - Dev VPC
- `NagiyuSharedVpcProd` - Prod VPC

**注意:** 2026年1月の再構築により、すべてのスタック名がCDK標準命名規則に統一されました。

---

## Export 値の管理

共通インフラからは、アプリケーション固有リソースで参照するための Export 値を提供します。

### IAM リソースからの Export

| Export 名 | 説明 | 提供元スタック |
|----------|------|-------------|
| `nagiyu-deploy-policy-core-arn` | デプロイポリシー (Core) の ARN | `nagiyu-shared-deploy-policy-core` |
| `nagiyu-deploy-policy-container-arn` | デプロイポリシー (Container) の ARN | `nagiyu-shared-deploy-policy-container` |
| `nagiyu-deploy-policy-application-arn` | デプロイポリシー (Application) の ARN | `nagiyu-shared-deploy-policy-application` |
| `nagiyu-deploy-policy-integration-arn` | デプロイポリシー (Integration) の ARN | `nagiyu-shared-deploy-policy-integration` |

### VPC リソースからの Export

| Export 名 | 説明 | 提供元スタック |
|----------|------|-------------|
| `nagiyu-{env}-vpc-id` | VPC ID | `nagiyu-{env}-vpc` |
| `nagiyu-{env}-public-subnet-ids` | パブリックサブネット ID リスト (カンマ区切り) | `nagiyu-{env}-vpc` |
| `nagiyu-{env}-igw-id` | Internet Gateway ID | `nagiyu-{env}-vpc` |

**例 (dev 環境):**
- `nagiyu-dev-vpc-id`
- `nagiyu-dev-public-subnet-ids`
- `nagiyu-dev-igw-id`

### ACM リソースからの Export

| Export 名 | 説明 | 提供元スタック |
|----------|------|-------------|
| `nagiyu-shared-acm-certificate-arn` | SSL/TLS 証明書の ARN | `SharedAcm` (CDK) |
| `nagiyu-shared-acm-domain-name` | プライマリドメイン名 | `SharedAcm` (CDK) |
| `nagiyu-shared-acm-wildcard-domain` | ワイルドカードドメイン名 | `SharedAcm` (CDK) |

### 将来提供予定の Export (例)

| Export 名 | 説明 |
|----------|------|
| `nagiyu-{env}-log-group-arn` | CloudWatch Logs グループ ARN |
| `nagiyu-{env}-parameter-store-kms-key-id` | Parameter Store 暗号化用 KMS キー ID |

---

## 注意事項

### 削除時の影響

共通インフラを削除すると、すべてのアプリケーションに影響を与えます。削除する際は以下を確認してください。

1. 依存しているアプリケーションリソースがないか
2. Export 値を参照しているスタックがないか

Export 値を参照しているスタックが存在する場合、削除は失敗します。

### 変更時の影響範囲

共通インフラの変更（特に VPC やセキュリティグループなど）は、すべてのアプリケーションに影響を与える可能性があります。変更前に以下を確認してください。

1. 変更によって既存のアプリケーションが影響を受けないか
2. ダウンタイムが発生しないか
3. ロールバック手順が確立されているか

---

## 共有リソースの利用方法

アプリケーション固有リソースから共有インフラリソースを参照する方法を説明します。

### VPC の利用

VPC を必要とするサービス（ECS、AWS Batch など）は、以下の Export 値を参照します。

```typescript
const vpcId = cdk.Fn.importValue(`nagiyu-${env}-vpc-id`);
const subnetIds = cdk.Fn.importValue(`nagiyu-${env}-public-subnet-ids`).split(',');
```

**利用例:**
- ECS Fargate タスク配置
- AWS Batch コンピュート環境
- ALB (Application Load Balancer) 配置

### ACM 証明書の利用

CloudFront でカスタムドメインを使用する場合は、ACM 証明書を参照します。

```typescript
const certificateArn = cdk.Fn.importValue(EXPORTS.ACM_CERTIFICATE_ARN);
```

**利用例:**
- CloudFront Distribution の HTTPS 配信
- カスタムドメイン設定

### IAM ポリシーの利用

デプロイ用の IAM ポリシーは、以下の4つに分割されています。各アプリケーションは必要なポリシーのみを参照してください。

| ポリシー名 | Export 名 | 用途 |
|----------|----------|------|
| Core | `nagiyu-deploy-policy-core-arn` | CloudFormation、IAM、ネットワーク、Logs |
| Application | `nagiyu-deploy-policy-application-arn` | Lambda、S3、DynamoDB、API Gateway、CloudFront、ACM |
| Container | `nagiyu-deploy-policy-container-arn` | ECR、ECS、AWS Batch |
| Integration | `nagiyu-deploy-policy-integration-arn` | KMS、Secrets Manager、SSM、SNS、SQS、EventBridge |

```typescript
const corePolicy = iam.ManagedPolicy.fromManagedPolicyArn(
  this,
  'CorePolicy',
  cdk.Fn.importValue('nagiyu-deploy-policy-core-arn')
);
```

**ポリシー選択の指針:**
- **VPC不要のサーバーレスサービス**: Core + Application + Container + Integration
- **VPC使用のコンテナサービス**: すべてのポリシーが必要
- **バッチ処理サービス**: すべてのポリシーが必要

### リソース依存関係図

共有リソースとアプリケーションリソースの関係は、以下の図を参照してください。

![共有リソース依存関係図](../../images/infra/shared-resources-dependencies.drawio.svg)

---

## 関連ドキュメント

- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [初回セットアップ](../setup.md) - 共通インフラの初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [IAM 詳細](./iam.md) - IAM リソースの設計と運用
- [VPC 詳細](./vpc.md) - VPC リソースの設計と運用
- [ACM 詳細](./acm.md) - SSL/TLS 証明書の管理
- [CloudFront 詳細](./cloudfront.md) - CloudFront の設計と運用
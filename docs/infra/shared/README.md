# Shared Infrastructure (CDK)

nagiyu プラットフォーム全体で共有されるインフラストラクチャリソースを管理します。

## 構成

### VPC Stack
- **VPC**: ネットワーク基盤
- **パブリックサブネット**: dev=1個、prod=2個
- **インターネットゲートウェイ**: 外部通信用

### ACM Stack
- **SSL/TLS 証明書**: ワイルドカード証明書 (`*.{domain}`)
- **DNS 検証**: Route53 による自動検証

### IAM Policies Stack
- **Core Policy**: CloudFormation, IAM, VPC 関連
- **Application Policy**: Lambda, S3, DynamoDB 関連
- **Container Policy**: ECR, ECS 関連
- **Integration Policy**: 統合テスト用

### IAM Users Stack
- **GitHub Actions User**: CI/CD 用
- **Local Dev User**: ローカル開発用

## Export されるリソース

各スタックは CloudFormation Export を使用して、他のサービスから参照可能なリソースを公開しています。

Export 名は `infra/shared/libs/utils/exports.ts` で一元管理されています。

## デプロイ

### 前提条件
- Node.js 22 以上
- AWS CLI 設定済み
- CDK Bootstrap 実行済み

### 開発環境
```bash
cd infra/shared
npm ci
npm run build
npx cdk deploy --all --context env=dev
```

### 本番環境
```bash
npx cdk deploy --all --context env=prod
```

### 個別スタックのデプロイ
```bash
# VPC のみ
npx cdk deploy SharedVpc-dev --context env=dev

# ACM のみ
npx cdk deploy SharedAcm

# IAM のみ
npx cdk deploy SharedIamPolicies SharedIamUsers
```

## 差分確認

デプロイ前に差分を確認することを推奨します:

```bash
npx cdk diff --all --context env=dev
```

## GitHub Actions

`develop` または `main` ブランチへのプッシュで自動デプロイされます。

- **develop** → dev 環境
- **main** → prod 環境

ワークフロー: `.github/workflows/shared-deploy.yml`

## トラブルシューティング

### Export が参照できない

他のサービスから Export を参照できない場合:

```bash
# Export が正しく作成されているか確認
aws cloudformation list-exports --query "Exports[?starts_with(Name, 'nagiyu')].{Name:Name,Value:Value}" --output table
```

### スタック削除時のエラー

Export が他のスタックから参照されている場合、削除できません。
参照している全てのスタックを先に削除してください。

---

## 詳細ドキュメント

各リソースの詳細な設計と運用については、以下のドキュメントを参照してください:

- [IAM 詳細ドキュメント](./iam.md)
- [VPC 詳細ドキュメント](./vpc.md)
- [ACM 詳細ドキュメント](./acm.md)
- [CloudFront 詳細ドキュメント](./cloudfront.md)
- [CDK ユーティリティ](./cdk-utils.md)
- [共有リソースの使用方法](./shared-cdk-usage.md)

---

## 旧デプロイ順序 (参考)

以前の CloudFormation ベースのデプロイ順序:

1. **IAM リソース**
    - デプロイポリシー (4つ: core, container, application, integration)
    - IAM ユーザー (GitHub Actions, ローカル開発)

2. **VPC リソース**
    - VPC およびサブネット
    - Internet Gateway

3. **ACM リソース**
    - SSL/TLS 証明書
    - DNS 検証レコードの設定（外部 DNS サービスで手動）

---

## スタック命名規則 (参考)

以前の CloudFormation スタック名とCDK移行後のスタック名の対応:

| CloudFormation | CDK |
|---------------|-----|
| `nagiyu-shared-deploy-policy-core` | `SharedIamPolicies` (統合) |
| `nagiyu-shared-deploy-policy-application` | `SharedIamPolicies` (統合) |
| `nagiyu-shared-deploy-policy-container` | `SharedIamPolicies` (統合) |
| `nagiyu-shared-deploy-policy-integration` | `SharedIamPolicies` (統合) |
| `nagiyu-shared-github-actions-user` | `SharedIamUsers` (統合) |
| `nagiyu-shared-local-dev-user` | `SharedIamUsers` (統合) |
| `nagiyu-{env}-vpc` | `SharedVpc-{env}` |
| (なし) | `SharedAcm` |

---

## Export 値の管理 (参考)

共通インフラからは、アプリケーション固有リソースで参照するための Export 値を提供します。
Export 名は `infra/shared/libs/utils/exports.ts` で一元管理されています。

### IAM リソースからの Export

| Export 名 | 説明 |
|----------|------|
| `nagiyu-deploy-policy-core-arn` | デプロイポリシー (Core) の ARN |
| `nagiyu-deploy-policy-container-arn` | デプロイポリシー (Container) の ARN |
| `nagiyu-deploy-policy-application-arn` | デプロイポリシー (Application) の ARN |
| `nagiyu-deploy-policy-integration-arn` | デプロイポリシー (Integration) の ARN |

### VPC リソースからの Export

| Export 名 | 説明 |
|----------|------|
| `nagiyu-{env}-vpc-id` | VPC ID |
| `nagiyu-{env}-public-subnet-ids` | パブリックサブネット ID リスト (カンマ区切り) |
| `nagiyu-{env}-igw-id` | Internet Gateway ID |

### ACM リソースからの Export

| Export 名 | 説明 |
|----------|------|
| `nagiyu-shared-acm-certificate-arn` | SSL/TLS 証明書の ARN |
| `nagiyu-shared-acm-domain-name` | プライマリドメイン名 |
| `nagiyu-shared-acm-wildcard-domain` | ワイルドカードドメイン名 |

---

## 共有リソースの利用方法 (参考)

アプリケーション固有リソースから共有インフラリソースを参照する方法の例:

### VPC の利用

```typescript
const vpcId = cdk.Fn.importValue(`nagiyu-${env}-vpc-id`);
const subnetIds = cdk.Fn.importValue(`nagiyu-${env}-public-subnet-ids`).split(',');
```

### ACM 証明書の利用

```typescript
const certificateArn = cdk.Fn.importValue(EXPORTS.ACM_CERTIFICATE_ARN);
```

### IAM ポリシーの利用

```typescript
const corePolicy = iam.ManagedPolicy.fromManagedPolicyArn(
  this,
  'CorePolicy',
  cdk.Fn.importValue('nagiyu-deploy-policy-core-arn')
);
```

---

## 関連ドキュメント

- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [初回セットアップ](../setup.md) - 共通インフラの初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [IAM 詳細](./iam.md) - IAM リソースの設計と運用
- [VPC 詳細](./vpc.md) - VPC リソースの設計と運用
- [ACM 詳細](./acm.md) - SSL/TLS 証明書の管理
- [CloudFront 詳細](./cloudfront.md) - CloudFront の設計と運用
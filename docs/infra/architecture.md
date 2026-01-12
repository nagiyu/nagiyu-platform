# インフラストラクチャアーキテクチャ

本ドキュメントでは、nagiyu-platform のインフラストラクチャ全体の設計思想と構成を説明します。

---

## 設計思想

### モノレポ × AWS マルチサービス構成

本プロジェクトは以下の特性を持ちます。

- **モノレポ管理**: 複数のアプリケーションを単一リポジトリで管理
- **共通基盤の活用**: VPC、IAM などの共通リソースを全サービスで共有
- **個別デプロイの柔軟性**: 各アプリケーションは独立してデプロイ可能

### インフラストラクチャ・アズ・コード (IaC)

- **CloudFormation と CDK の併用**: 既存リソースは CloudFormation、新規リソースは CDK で管理
- **段階的移行**: CloudFormation から CDK への段階的な移行を実施
- **バージョン管理**: インフラ定義を Git で管理し、変更履歴を追跡
- **再現性**: 環境の再構築が容易で、開発・本番環境の一貫性を保証

### Web アプリケーション配信戦略

本プラットフォームでは、以下の構成で Web アプリケーションを配信します。

- **外部ドメイン管理**: ドメインは外部レンタルサーバーで取得・管理
- **外部 DNS サービス**: Route 53 は使用せず、外部 DNS サービスでドメイン解決
- **CloudFront**: カスタムドメインを設定し、AWS リソースを全世界に配信
- **SSL/TLS**: ACM (AWS Certificate Manager) でワイルドカード証明書を管理

#### 配信フロー

```
ユーザー
  ↓ (HTTPS: https://example.com)
外部 DNS サービス
  ↓ (CNAME: example.com → d123456.cloudfront.net)
CloudFront Distribution
  ↓ (オリジン)
AWS リソース
  ├── S3 (静的コンテンツ)
  ├── API Gateway (REST API)
  ├── ALB → ECS (Web アプリ)
  └── Lambda Function URL (サーバーレス関数)
```

---

## ディレクトリ構造

```
infra/
├── bin/                 # CDK App エントリーポイント
│   └── nagiyu-platform.ts
├── lib/                 # CDK Constructs とスタック (将来)
├── shared/              # 全サービスで共有するリソース (CDK)
│   ├── bin/
│   │   └── shared.ts
│   ├── lib/
│   │   ├── vpc-stack.ts
│   │   ├── acm-stack.ts
│   │   ├── iam/
│   │   │   ├── iam-policies-stack.ts
│   │   │   └── iam-users-stack.ts
│   │   └── utils/
│   │       └── exports.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
│
├── tools/              # Tools サービスのインフラ (CDK)
│   ├── bin/
│   │   └── tools.ts
│   ├── lib/
│   │   ├── ecr-stack.ts
│   │   ├── lambda-stack.ts
│   │   └── cloudfront-stack.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── cdk.json
│
├── root/               # ルートドメインリソース (CDK)
├── auth/               # Auth サービスのインフラ (CDK)
├── admin/              # Admin サービスのインフラ (CDK)
├── codec-converter/    # Codec Converter サービスのインフラ (CDK)
├── cdk.json            # CDK 設定 (ルート)
├── tsconfig.json       # TypeScript 設定 (ルート)
└── package.json        # 依存関係 (ルート)
```

**注:** 2026年1月の CDK 移行により、全リソースが CDK (TypeScript) で管理されています。詳細は [CDK 移行ガイド](./cdk-migration.md) を参照。

---

## リソース構成

### 共通インフラ (shared/)

すべてのアプリケーションで共有される基盤リソース。

#### IAM (Identity and Access Management)

- **デプロイポリシー** (CDK: `lib/iam/iam-policies-stack.ts`)
    - CloudFormation、ECR、Lambda など各種 AWS サービスへのデプロイ権限を定義
    - GitHub Actions および ローカル開発者が共通で使用
    - 4つのポリシーに分割: Core, Application, Container, Integration

- **GitHub Actions ユーザー** (CDK: `lib/iam/iam-users-stack.ts`)
    - CI/CD パイプラインで使用する IAM ユーザー
    - デプロイポリシーをアタッチ

- **ローカル開発ユーザー** (CDK: `lib/iam/iam-users-stack.ts`)
    - 開発者がローカル環境から手動デプロイする際に使用
    - デプロイポリシーをアタッチ

#### VPC (Virtual Private Cloud)

- 環境ごとに独立した VPC (dev/prod)
- パブリックサブネット構成
- Internet Gateway
- ECS/Batch 用のネットワーク提供

詳細は [VPC 詳細ドキュメント](./shared/vpc.md) を参照。

#### ACM (AWS Certificate Manager)

- **ワイルドカード証明書**: `*.example.com` と `example.com` をカバー
- **DNS 検証**: 外部 DNS サービスで CNAME レコードを手動設定
- **共通証明書**: dev/prod 環境で同じ証明書を使用
- **リージョン**: us-east-1 (CloudFront 用)

詳細は [ACM 詳細ドキュメント](./shared/acm.md) を参照。

### アプリケーション固有インフラ

#### ルートドメイン (root/)

ルートドメイン (example.com) で公開される Web アプリケーション。CDK で構築。

- **ECS Cluster**: Fargate でコンテナオーケストレーション
- **Application Load Balancer**: ECS タスクへの負荷分散
- **CloudFront Distribution**: グローバル CDN
- **ECR Repository**: コンテナイメージ管理
- **Security Groups**: ネットワークセキュリティ
- **IAM Roles**: ECS タスク実行権限

詳細は [ルートドメインアーキテクチャ](./root/architecture.md) を参照。

#### その他のアプリケーション (将来実装予定)

各アプリケーション専用のリソース。

- **Lambda 関数**: サーバーレスアプリケーションロジック
- **DynamoDB テーブル**: NoSQL データベース
- **API Gateway**: REST API / HTTP API エンドポイント
- **S3 バケット**: 静的コンテンツ (HTML, CSS, JS, 画像)
- **CloudFront ディストリビューション**: カスタムドメインでの配信
  - オリジン: S3, API Gateway, ALB, Lambda Function URL
  - ACM 証明書を使用した HTTPS 配信
  - 外部 DNS サービスから CNAME で参照

---

## デプロイフロー

### 1. IAM リソースのデプロイ（初回のみ）

```
infra/shared/lib/iam/iam-policies-stack.ts (CDK)
    ↓
infra/shared/lib/iam/iam-users-stack.ts (CDK)
```

依存関係: IAM Policies → IAM Users

### 2. 共通インフラのデプロイ（初回のみ）

```
infra/shared/lib/vpc-stack.ts     # VPC (環境ごと: dev/prod)
infra/shared/lib/acm-stack.ts     # ACM 証明書 (共通)
```

- VPC は環境ごとにデプロイ (dev/prod)
- ACM 証明書は共通（ワイルドカードで dev/prod をカバー）

### 3. アプリケーション固有リソースのデプロイ

```
infra/app-A/ (将来)
```

各アプリケーションは独立してデプロイ可能。

---

## スタック命名規則

CDK スタック名は以下の規則に従います（2026年1月再構築により統一）。

### 共有リソース（CDK標準命名）

```
NagiyuShared{ResourceType}[{Env}]
```

**例:**
- `NagiyuSharedIamCore` - 共有IAM Coreポリシー
- `NagiyuSharedIamApplication` - 共有IAM Applicationポリシー
- `NagiyuSharedIamContainer` - 共有IAM Containerポリシー
- `NagiyuSharedIamIntegration` - 共有IAM Integrationポリシー
- `NagiyuSharedIamUsers` - 共有IAMユーザー (GitHub Actions, Local Dev)
- `NagiyuSharedAcm` - ACM証明書 (環境共通)
- `NagiyuSharedVpcDev` - dev環境VPC
- `NagiyuSharedVpcProd` - prod環境VPC

### アプリケーションリソース

```
Nagiyu{Service}{ResourceType}{Env}
```

**例:**
- `NagiyuAuthInfraDev` - Auth の基盤リソース (dev環境)
- `NagiyuAuthLambdaDev` - Auth の Lambda (dev環境)
- `NagiyuAuthCloudFrontDev` - Auth の CloudFront (dev環境)
- `NagiyuAdminInfraProd` - Admin の基盤リソース (prod環境)
- `NagiyuCodecConverterDev` - Codec Converter (dev環境、統合スタック)
- `NagiyuToolsEcrProd` - Tools の ECR (prod環境)

---

## セキュリティ設計

### 最小権限の原則

- IAM ポリシーは必要最小限の権限のみを付与
- リソースごとに適切な権限を定義

### 認証情報の管理

- IAM ユーザーのアクセスキーは手動発行（CloudFormation では自動生成しない）
- GitHub Actions には GitHub Secrets で管理
- ローカル開発者は `~/.aws/credentials` で管理

### タグ戦略

すべてのリソースに以下のタグを付与:

- `Application: nagiyu` - プロジェクト識別
- `Purpose: <用途>` - リソースの目的

---

## 関連ドキュメント

- [初回セットアップ](./setup.md) - インフラの初期構築手順
- [デプロイ手順](./deploy.md) - 日常的なデプロイ操作
- [CDK 移行ガイド](./cdk-migration.md) - CloudFormation から CDK への移行戦略
- [共有インフラ](./shared/README.md) - 共有リソースの概要とサービスパターン
- [IAM 詳細](./shared/iam.md) - IAM リソースの詳細設計
- [VPC 詳細](./shared/vpc.md) - VPC リソースの詳細設計
- [ACM 詳細](./shared/acm.md) - SSL/TLS 証明書の管理
- [CloudFront 詳細](./shared/cloudfront.md) - CloudFront の設計と運用
- [ルートドメインアーキテクチャ](./root/architecture.md) - ルートドメインの詳細設計

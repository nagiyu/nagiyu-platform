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
├── shared/              # 全サービスで共有するリソース (CloudFormation)
│   ├── iam/            # IAM ユーザー、ポリシー
│   │   ├── policies/
│   │   │   ├── deploy-policy-core.yaml
│   │   │   ├── deploy-policy-container.yaml
│   │   │   ├── deploy-policy-application.yaml
│   │   │   └── deploy-policy-integration.yaml
│   │   └── users/
│   │       ├── github-actions-user.yaml
│   │       └── local-dev-user.yaml
│   ├── vpc/            # VPC 関連
│   └── acm/            # ACM 証明書
│       └── certificate.yaml
│
├── root/               # ルートドメインリソース (CDK)
│   └── (将来の CDK スタック実装)
├── cdk.json            # CDK 設定
├── tsconfig.json       # TypeScript 設定
└── package.json        # 依存関係
```

**注:** 既存リソース (shared/) は CloudFormation で管理し、新規リソース (root/) は CDK で構築します。詳細は [CDK 移行ガイド](./cdk-migration.md) を参照。

---

## リソース構成

### 共通インフラ (shared/)

すべてのアプリケーションで共有される基盤リソース。

#### IAM (Identity and Access Management)

- **デプロイポリシー** (`deploy-policy.yaml`)
    - CloudFormation、ECR、Lambda など各種 AWS サービスへのデプロイ権限を定義
    - GitHub Actions および ローカル開発者が共通で使用

- **GitHub Actions ユーザー** (`github-actions-user.yaml`)
    - CI/CD パイプラインで使用する IAM ユーザー
    - デプロイポリシーをアタッチ

- **ローカル開発ユーザー** (`local-dev-user.yaml`)
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

- **Lambda 関数**: サーバーレスアプリケーションロジック
- **DynamoDB テーブル**: NoSQL データベース
- **API Gateway**: REST API / HTTP API エンドポイント
- **S3 バケット**: 静的コンテンツ (HTML, CSS, JS, 画像)

---

## デプロイフロー

### 1. IAM リソースのデプロイ（初回のみ）

```
infra/shared/iam/policies/deploy-policy.yaml
    ↓
infra/shared/iam/users/github-actions-user.yaml
infra/shared/iam/users/local-dev-user.yaml
```

依存関係: `deploy-policy` → `github-actions-user`, `local-dev-user`

### 2. 共通インフラのデプロイ（初回のみ）

```
infra/shared/vpc/      # VPC (環境ごと: dev/prod)
infra/shared/acm/      # ACM 証明書 (共通)
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

CloudFormation スタック名は以下の規則に従います。

```
nagiyu-{category}-{resource}
```

**例:**
- `nagiyu-shared-deploy-policy-core` - 共通デプロイポリシー (Core)
- `nagiyu-shared-deploy-policy-container` - 共通デプロイポリシー (Container)
- `nagiyu-shared-deploy-policy-application` - 共通デプロイポリシー (Application)
- `nagiyu-shared-deploy-policy-integration` - 共通デプロイポリシー (Integration)
- `nagiyu-shared-github-actions-user` - GitHub Actions ユーザー
- `nagiyu-shared-local-dev-user` - ローカル開発ユーザー
- `nagiyu-shared-acm-certificate` - ACM 証明書
- `nagiyu-dev-vpc` - dev 環境 VPC
- `nagiyu-prod-vpc` - prod 環境 VPC
- `nagiyu-dev-cloudfront-app-A` - app-A の CloudFront (dev 環境、将来)
- `nagiyu-prod-cloudfront-app-A` - app-A の CloudFront (prod 環境、将来)
- `nagiyu-app-A-lambda` - app-A の Lambda リソース（将来）

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
- [IAM 詳細](./shared/iam.md) - IAM リソースの詳細設計
- [VPC 詳細](./shared/vpc.md) - VPC リソースの詳細設計
- [ACM 詳細](./shared/acm.md) - SSL/TLS 証明書の管理
- [CloudFront 詳細](./shared/cloudfront.md) - CloudFront の設計と運用
- [ルートドメインアーキテクチャ](./root/architecture.md) - ルートドメインの詳細設計

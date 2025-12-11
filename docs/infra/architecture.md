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

- **CloudFormation**: すべての AWS リソースを YAML テンプレートで定義
- **バージョン管理**: インフラ定義を Git で管理し、変更履歴を追跡
- **再現性**: 環境の再構築が容易で、開発・本番環境の一貫性を保証

---

## ディレクトリ構造

```
infra/
├── shared/              # 全サービスで共有するリソース
│   ├── iam/            # IAM ユーザー、ポリシー
│   │   ├── policies/
│   │   │   └── deploy-policy.yaml
│   │   └── users/
│   │       ├── github-actions-user.yaml
│   │       └── local-dev-user.yaml
│   └── vpc/            # VPC 関連（将来）
│
└── app-A/              # アプリケーション固有のリソース（将来）
    ├── lambda/         # Lambda 関数
    ├── dynamodb/       # DynamoDB テーブル
    └── api-gateway/    # API Gateway
```

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

#### VPC（将来実装予定）

- 各アプリケーションが共有する VPC
- パブリック/プライベートサブネット構成
- NAT Gateway、Internet Gateway

### アプリケーション固有インフラ (app-X/)

各アプリケーション専用のリソース（将来実装予定）。

- Lambda 関数
- DynamoDB テーブル
- API Gateway
- S3 バケット
- CloudFront ディストリビューション

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
infra/shared/vpc/ (将来)
```

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
- `nagiyu-shared-deploy-policy` - 共通デプロイポリシー
- `nagiyu-shared-github-actions-user` - GitHub Actions ユーザー
- `nagiyu-shared-local-dev-user` - ローカル開発ユーザー
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
- [IAM 詳細](./shared/iam.md) - IAM リソースの詳細設計

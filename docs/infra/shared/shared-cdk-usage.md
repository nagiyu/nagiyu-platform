# Shared Infrastructure (CDK) - 使用ガイド

このドキュメントは、nagiyu プラットフォームの共有インフラストラクチャ（`infra/shared/`）を AWS CDK で管理するための使用ガイドです。

## 概要

### 管理リソース

- **VPC**: dev/prod 環境の VPC とネットワークリソース
- **IAM**: (将来) 共有 IAM ポリシーとユーザー
- **ACM**: (将来) SSL/TLS 証明書

## プロジェクト構造

```
infra/shared/
├── bin/
│   └── shared.ts              # CDK アプリケーションのエントリーポイント
├── lib/
│   └── vpc-stack.ts           # VPC スタック定義
├── libs/
│   └── utils/
│       ├── exports.ts         # Export 名の定数定義
│       └── env-config.ts      # 環境設定
├── cdk.json                   # CDK 設定ファイル
├── tsconfig.json              # TypeScript 設定
└── package.json               # NPM スクリプト定義
```

**注**: 依存関係はモノレポのルートで管理されています。

## セットアップ

### 依存関係のインストール

モノレポのルートで依存関係をインストールします:

```bash
# モノレポルートから
npm install
```

### ビルド

```bash
npm run build
```

## デプロイ

### 1. CloudFormation テンプレートの生成（Synth）

```bash
# dev 環境
npm run synth -- --context env=dev

# prod 環境
npm run synth -- --context env=prod
```

### 2. 差分確認

```bash
# dev 環境
npm run diff -- nagiyu-shared-vpc-dev --context env=dev

# prod 環境
npm run diff -- nagiyu-shared-vpc-prod --context env=prod
```

### 3. デプロイ

```bash
# dev 環境
npm run deploy -- nagiyu-shared-vpc-dev --context env=dev

# prod 環境
npm run deploy -- nagiyu-shared-vpc-prod --context env=prod
```

### 4. 承認なしデプロイ（CI/CD 用）

```bash
npm run deploy -- nagiyu-shared-vpc-dev --context env=dev --require-approval never
```

## スタック一覧

### nagiyu-shared-vpc-{env}

VPC とネットワークリソースを管理します。

**リソース**:
- VPC
- Internet Gateway
- Public Subnets (dev: 1個、prod: 2個)
- Route Tables

**Exports**:
- `nagiyu-{env}-vpc-id`: VPC ID
- `nagiyu-{env}-public-subnet-ids`: Public Subnet ID リスト（カンマ区切り）
- `nagiyu-{env}-igw-id`: Internet Gateway ID
- `nagiyu-{env}-vpc-cidr`: VPC CIDR ブロック

## 開発

### TypeScript のビルド

```bash
npm run build
```

### Watch モード（自動ビルド）

```bash
npm run watch
```

## CDK コマンド

### スタック一覧

```bash
npm run cdk -- list --context env=dev
```

### 特定のスタックを Synth

```bash
npm run cdk -- synth nagiyu-shared-vpc-dev --context env=dev
```

### CloudFormation テンプレートの確認

```bash
npm run cdk -- synth nagiyu-shared-vpc-dev --context env=dev --path-metadata false --version-reporting false
```

## トラブルシューティング

### ビルドエラー

```bash
# 依存関係を再インストール
rm -rf node_modules package-lock.json
npm install

# TypeScript をクリーンビルド
npm run build
```

### CDK Synth エラー

```bash
# 環境変数を確認
echo $CDK_DEFAULT_ACCOUNT
echo $CDK_DEFAULT_REGION

# コンテキストを明示的に指定
npm run cdk -- synth --context env=dev --verbose
```

### デプロイエラー

```bash
# AWS 認証情報を確認
aws sts get-caller-identity

# CloudFormation スタックの状態を確認
aws cloudformation describe-stacks --stack-name nagiyu-shared-vpc-dev --region us-east-1
```

## 関連ドキュメント

- [CDK 移行ガイド](../../docs/infra/cdk-migration.md)
- [VPC 設計](../../docs/infra/shared/vpc.md)
- [インフラアーキテクチャ](../../docs/infra/architecture.md)

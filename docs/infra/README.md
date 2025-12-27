# インフラストラクチャドキュメント

本ディレクトリは nagiyu-platform のインフラストラクチャ関連ドキュメントを格納します。
AWS CloudFormation と AWS CDK を用いて、共通基盤と各アプリケーション固有のリソースを管理します。

---

## ドキュメント一覧

### 概要・設計

- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想と構成
- [CDK 移行ガイド](./cdk-migration.md) - CloudFormation から CDK への移行戦略

### 運用手順

- [初回セットアップ](./setup.md) - 初めてインフラを構築する際の手順
- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作

### リソース別ドキュメント

- [共通インフラ](./shared/README.md) - VPC、IAM、ACM など全サービスで共有するリソース
    - [IAM](./shared/iam.md) - IAM ユーザー、ポリシーの設計と運用
    - [VPC](./shared/vpc.md) - VPC、ネットワーク設計と運用
    - [ACM](./shared/acm.md) - SSL/TLS 証明書の管理
    - [CloudFront](./shared/cloudfront.md) - CloudFront の設計と運用

- [ルートドメインインフラ](./root/architecture.md) - ルートドメイン (example.com) のアーキテクチャと設計

---

## インフラディレクトリ構造

```
infra/
├── bin/              # CDK App エントリーポイント
│   └── nagiyu-platform.ts
├── lib/              # CDK Constructs とスタック (将来)
├── shared/           # 全サービスで共有するリソース (CloudFormation)
│   ├── iam/         # IAM ユーザー、ポリシー
│   ├── vpc/         # VPC 関連
│   └── acm/         # ACM 証明書
├── root/             # ルートドメインリソース (CDK)
├── app-A/            # アプリケーション固有のリソース (将来)
│   ├── lambda/      # Lambda 関数
│   ├── dynamodb/    # DynamoDB テーブル
│   ├── api-gateway/ # API Gateway
│   └── cloudfront/  # CloudFront ディストリビューション
├── cdk.json          # CDK 設定
├── tsconfig.json     # TypeScript 設定
└── package.json      # 依存関係
```

**注:** 現時点で作成済みのリソース (shared/) は CloudFormation で管理し、新規リソース (root/) は CDK で構築します。将来的には全リソースを CDK に移行する予定です。

---

## 関連ドキュメント

- [ブランチ戦略](../branching.md) - デプロイフローと関連するブランチ戦略

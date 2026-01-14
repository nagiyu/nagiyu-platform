# インフラストラクチャドキュメント

本ディレクトリは nagiyu-platform のインフラストラクチャ関連ドキュメントを格納します。
AWS CDK (TypeScript) を用いて、共通基盤と各アプリケーション固有のリソースを管理します。

---

## ドキュメント一覧

### 概要・設計

- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想と構成

### 運用手順

- [初回セットアップ](./setup.md) - 初めてインフラを構築する際の手順
- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作

### リソース別ドキュメント

- [共通インフラパッケージ](./common/README.md) - `@nagiyu/infra-common` パッケージ
    - [使用ガイド](./common-package-guide.md) - 詳細な使用方法とサンプルコード
    - [マイグレーションガイド](./migration-guide.md) - 既存サービスの移行手順
    - [API リファレンス](./api-reference.md) - 型定義と関数の詳細

- [共通インフラ](./shared/README.md) - VPC、IAM、ACM など全サービスで共有するリソース
    - [IAM](./shared/iam.md) - IAM ユーザー、ポリシーの設計と運用
    - [VPC](./shared/vpc.md) - VPC、ネットワーク設計と運用
    - [ACM](./shared/acm.md) - SSL/TLS 証明書の管理
    - [CloudFront](./shared/cloudfront.md) - CloudFront の設計と運用

- [ツールサービス](./tools/README.md) - Tools サービスのインフラストラクチャ
- [ルートドメインインフラ](./root/architecture.md) - ルートドメイン (example.com) のアーキテクチャと設計

---

## インフラディレクトリ構造

```
infra/
├── shared/           # 全サービスで共有するリソース (CDK)
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
│   ├── cdk.json
│   └── README.md
├── tools/            # Tools サービスのインフラ (CDK)
│   ├── bin/
│   │   └── tools.ts
│   ├── lib/
│   │   ├── ecr-stack.ts
│   │   ├── lambda-stack.ts
│   │   └── cloudfront-stack.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── cdk.json
│   └── README.md
├── root/             # ルートドメインリソース (CDK)
├── auth/             # Auth サービスのインフラ (CDK)
├── admin/            # Admin サービスのインフラ (CDK)
├── codec-converter/  # Codec Converter サービスのインフラ (CDK)
└── README.md         # 本ドキュメント
```

**注:** 2026年1月の CDK 移行により、全リソースが CDK (TypeScript) で管理されています。

---

## 関連ドキュメント

- [ブランチ戦略](../branching.md) - デプロイフローと関連するブランチ戦略

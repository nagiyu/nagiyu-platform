# インフラストラクチャドキュメント

本ディレクトリは nagiyu-platform のインフラストラクチャ関連ドキュメントを格納します。
AWS CloudFormation を用いて、共通基盤と各アプリケーション固有のリソースを管理します。

---

## ドキュメント一覧

### 概要・設計

- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想と構成

### 運用手順

- [初回セットアップ](./setup.md) - 初めてインフラを構築する際の手順
- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作

### リソース別ドキュメント

- [共通インフラ](./shared/README.md) - VPC、IAM、ACM など全サービスで共有するリソース
    - [IAM](./shared/iam.md) - IAM ユーザー、ポリシーの設計と運用
    - [VPC](./shared/vpc.md) - VPC、ネットワーク設計と運用
    - [ACM](./shared/acm.md) - SSL/TLS 証明書の管理
    - [CloudFront](./shared/cloudfront.md) - CloudFront の設計と運用

### サービス別インフラ

- [Codec Converter](./codec-converter/README.md) - 動画コーデック変換サービスのインフラ (AWS CDK)

---

## インフラディレクトリ構造

```
infra/
├── shared/           # 全サービスで共有するリソース
│   ├── iam/         # IAM ユーザー、ポリシー
│   ├── vpc/         # VPC 関連
│   └── acm/         # ACM 証明書
│
├── codec-converter/ # Codec Converter サービス (AWS CDK)
│
└── app-A/           # アプリケーション固有のリソース（将来）
    ├── lambda/      # Lambda 関数
    ├── dynamodb/    # DynamoDB テーブル
    ├── api-gateway/ # API Gateway
    └── cloudfront/  # CloudFront ディストリビューション
```

**注**: `infra/` ディレクトリ配下の各サービスは CloudFormation または AWS CDK で定義されます。
ドキュメントは `docs/infra/` に配置します。

---

## 関連ドキュメント

- [ブランチ戦略](../branching.md) - デプロイフローと関連するブランチ戦略

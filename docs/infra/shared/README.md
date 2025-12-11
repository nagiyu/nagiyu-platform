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

**配置場所:** `infra/shared/vpc/`

**主なリソース:**
- VPC (dev/prod 環境ごと)
- パブリックサブネット
- Internet Gateway
- Route Table

**用途:**
- ECS/Batch 用のネットワーク提供
- インターネットへのアクセス制御

---

## デプロイ順序

共通インフラは以下の順序でデプロイしてください。

1. **IAM リソース**
    - デプロイポリシー
    - IAM ユーザー (GitHub Actions, ローカル開発)

2. **VPC リソース**
    - VPC およびサブネット
    - Internet Gateway

3. **その他の共通リソース（将来）**
    - CloudWatch Logs グループ
    - Parameter Store / Secrets Manager
    - ECR リポジトリ (共通)

---

## スタック命名規則

共通インフラのスタック名は以下の形式を使用します。

```
nagiyu-shared-{resource-type}
```

**例:**
- `nagiyu-shared-deploy-policy`
- `nagiyu-shared-github-actions-user`

**注意:** VPC スタックは環境ごとに分かれるため、以下の命名規則を使用します。

```
nagiyu-{env}-vpc
```

**例:**
- `nagiyu-dev-vpc`
- `nagiyu-prod-vpc`

---

## Export 値の管理

共通インフラからは、アプリケーション固有リソースで参照するための Export 値を提供します。

### IAM リソースからの Export

| Export 名 | 説明 | 提供元スタック |
|----------|------|-------------|
| `nagiyu-deploy-policy-arn` | デプロイポリシーの ARN | `nagiyu-shared-deploy-policy` |

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

## 関連ドキュメント

- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [初回セットアップ](../setup.md) - 共通インフラの初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [IAM 詳細](./iam.md) - IAM リソースの設計と運用
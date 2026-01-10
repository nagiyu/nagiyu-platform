# IAM CDK 移行完了

このディレクトリの IAM リソース（ポリシーとユーザー）は AWS CDK に移行されました。

## 移行状況

✅ **移行完了** (2026年1月)

- IAM マネージドポリシー（4つ）: CDK 管理
- IAM ユーザー（2つ）: CDK 管理

## CDK スタック

### SharedIamPolicies

4つのマネージドポリシーを管理:
- `nagiyu-deploy-policy-core`
- `nagiyu-deploy-policy-application`
- `nagiyu-deploy-policy-container`
- `nagiyu-deploy-policy-integration`

### SharedIamUsers

2つの IAM ユーザーを管理:
- `nagiyu-github-actions`
- `nagiyu-local-dev`

## デプロイ方法

### 前提条件

```bash
# monorepo ルートから
npm ci
```

### ビルドとデプロイ

```bash
cd infra/shared

# ビルド
npm run build

# ポリシーのデプロイ
npx cdk deploy SharedIamPolicies

# ユーザーのデプロイ
npx cdk deploy SharedIamUsers
```

## ディレクトリ構造

```
iam/
├── policies/
│   ├── backup/                      # CloudFormation YAML のバックアップ
│   ├── deploy-policy-core.yaml      # 旧 CloudFormation (参考用)
│   ├── deploy-policy-container.yaml
│   ├── deploy-policy-application.yaml
│   └── deploy-policy-integration.yaml
└── users/
    ├── backup/                      # CloudFormation YAML のバックアップ
    ├── github-actions-user.yaml     # 旧 CloudFormation (参考用)
    └── local-dev-user.yaml
```

## CDK コード

実際の IAM リソース定義は以下にあります:

- `infra/shared/lib/iam/iam-policies-stack.ts`
- `infra/shared/lib/iam/iam-users-stack.ts`

## 詳細ドキュメント

詳細な情報は以下を参照してください:

- [IAM ドキュメント](../../../docs/infra/shared/iam.md)
- [CDK 移行ガイド](../../../docs/infra/cdk-migration.md)

## 注意事項

### アクセスキーについて

⚠️ **重要**: アクセスキーは CDK で管理しません

- 既存のアクセスキーはそのまま使用可能
- GitHub Actions Secrets の更新は不要
- ローカル開発環境の更新も不要

### Export 名について

Export 名は既存の CloudFormation と完全に一致しています:

- `nagiyu-deploy-policy-core-arn`
- `nagiyu-deploy-policy-application-arn`
- `nagiyu-deploy-policy-container-arn`
- `nagiyu-deploy-policy-integration-arn`
- `nagiyu-shared-github-actions-user-NagiyuGitHubActionsUserArn`
- `nagiyu-shared-github-actions-user-NagiyuGitHubActionsUserName`
- `nagiyu-shared-local-dev-user-NagiyuLocalDevUserArn`
- `nagiyu-shared-local-dev-user-NagiyuLocalDevUserName`

他のスタックからの参照に影響はありません。

## バックアップ

CloudFormation YAML ファイルは `backup/` ディレクトリに保存されています。
万が一ロールバックが必要な場合に使用できます。

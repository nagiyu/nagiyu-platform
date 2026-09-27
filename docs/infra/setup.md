# インフラ初回セットアップ

本ドキュメントは、nagiyu-platform のインフラを初めて構築する際の手順を説明します。

---

## 前提条件

- AWS アカウントが作成済みであり、[AWS アカウント構成とアクセス管理](./aws-accounts.md) の Organizations・IAM Identity Center が構築済みであること
- AWS CLI がインストールされていること
- IAM Identity Center の `AdministratorAccess` 許可セットでログインできること

---

## セットアップ手順

### 1. AWS CLI の設定

IAM Identity Center（SSO）のプロファイルを設定する。長期アクセスキーは使わない。

```bash
aws configure sso
```

- SSO start URL: アクセスポータルの URL
- SSO region / CLI default client Region: `us-east-1`
- アカウントと許可セット: 対象アカウントの `AdministratorAccess`

設定後、`aws sso login` でログインし、`AWS_PROFILE` に作成したプロファイルを指定して以降のコマンドを実行する。

**Note:** CloudFront の証明書管理のため、リージョンは `us-east-1` を使用します。

### 2. IAM デプロイポリシーの作成

まず、デプロイに必要な権限を定義した4つのポリシーを作成します。

```bash
cd infra/shared/iam/policies

# Core Policy
aws cloudformation create-stack \
  --stack-name nagiyu-shared-deploy-policy-core \
  --template-body file://deploy-policy-core.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Container Policy
aws cloudformation create-stack \
  --stack-name nagiyu-shared-deploy-policy-container \
  --template-body file://deploy-policy-container.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Application Policy
aws cloudformation create-stack \
  --stack-name nagiyu-shared-deploy-policy-application \
  --template-body file://deploy-policy-application.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Integration Policy
aws cloudformation create-stack \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --template-body file://deploy-policy-integration.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

スタックの作成完了を確認:

```bash
aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-deploy-policy-core \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-deploy-policy-container \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-deploy-policy-application \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --region us-east-1
```

### 3. GitHub Actions OIDC ロールの作成

GitHub Actions から AWS への認証は、IAM ユーザーの長期アクセスキーではなく
GitHub OIDC + AssumeRole を使う。共有インフラの CDK で OIDC プロバイダと、
実行文脈（dev / prod / pull_request）ごとに信頼条件を分けた 3 つのロールを作成する。

手順・設計判断の詳細は [IAM 詳細](./shared/iam.md) の「GitHub Actions OIDC ロール」を参照。

### 4. GitHub 側への変数登録

ロールのデプロイ後、GitHub リポジトリの Settings → Secrets and variables → Actions で
以下を **Variables**（Secrets ではない）として登録する。ロール ARN は機密情報ではないため。

- Environment `dev` / `prod` のそれぞれに `AWS_ROLE_ARN`（対応するロールの ARN）
- リポジトリ変数 `AWS_PR_ROLE_ARN`（pull_request 用ロールの ARN）

あわせて、prod Environment の Deployment branches を `master` のみに制限する
（本番ロールを任意のブランチから引き受けられないようにするため）。

---

## 動作確認

### スタック一覧の表示

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE \
  --query "StackSummaries[?starts_with(StackName, 'nagiyu-')].[StackName,StackStatus]" \
  --output table \
  --region us-east-1
```

以下のスタックが表示されることを確認:
- `nagiyu-shared-deploy-policy-core`
- `nagiyu-shared-deploy-policy-container`
- `nagiyu-shared-deploy-policy-application`
- `nagiyu-shared-deploy-policy-integration`

### GitHub Actions OIDC ロールの確認

```bash
aws iam list-roles \
  --query "Roles[?starts_with(RoleName, 'nagiyu-github-actions-')].[RoleName]" \
  --output table
```

以下のロールが表示されることを確認:
- `nagiyu-github-actions-dev`
- `nagiyu-github-actions-prod`
- `nagiyu-github-actions-pr`

### IAM ユーザーの確認

```bash
aws iam list-users \
  --query "Users[?starts_with(UserName, 'nagiyu-')].[UserName]" \
  --output table
```

以下のユーザーが表示されることを確認:
- `nagiyu-claude-readonly`
- `nagiyu-github-actions`（OIDC 移行の切り戻し用。撤去後は表示されない）

---

## 次のステップ

初回セットアップが完了したら、以下のドキュメントを参照してください。

- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作
- [IAM 詳細](./shared/iam.md) - IAM リソースの詳細と運用方法
- [AWS アカウント構成とアクセス管理](./aws-accounts.md) - Organizations・IAM Identity Center

---

## トラブルシューティング

### スタック作成が失敗する

エラーメッセージを確認:

```bash
aws cloudformation describe-stack-events \
  --stack-name <スタック名> \
  --query "StackEvents[?ResourceStatus=='CREATE_FAILED'].[LogicalResourceId,ResourceStatusReason]" \
  --output table \
  --region us-east-1
```

### IAM 権限エラー

- AWS CLI で使用しているプロファイルが `AdministratorAccess` 許可セットか確認（`aws sts get-caller-identity`）
- `--capabilities CAPABILITY_NAMED_IAM` オプションを指定しているか確認

### スタックの削除

作成に失敗した場合、以下のコマンドでスタックを削除できます。

```bash
aws cloudformation delete-stack --stack-name <スタック名> --region us-east-1
```

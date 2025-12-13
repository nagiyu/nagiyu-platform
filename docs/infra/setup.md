# インフラ初回セットアップ

本ドキュメントは、nagiyu-platform のインフラを初めて構築する際の手順を説明します。

---

## 前提条件

- AWS アカウントが作成済みであること
- AWS CLI がインストールされていること
- AWS 管理者権限を持つ IAM ユーザーまたはルートユーザーでログインできること

---

## セットアップ手順

### 1. AWS CLI の設定

管理者権限を持つ IAM ユーザーの認証情報を設定します。

```bash
aws configure
```

以下の情報を入力:
- AWS Access Key ID
- AWS Secret Access Key
- Default region name: `us-east-1` (バージニア北部リージョン)
- Default output format: `json`

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

### 3. GitHub Actions 用 IAM ユーザーの作成

CI/CD で使用する IAM ユーザーを作成します。

```bash
cd ../users

aws cloudformation create-stack \
  --stack-name nagiyu-shared-github-actions-user \
  --template-body file://github-actions-user.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

スタックの作成完了を確認:

```bash
aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-github-actions-user \
  --region us-east-1
```

### 4. GitHub Actions ユーザーのアクセスキー発行

セキュリティのため、アクセスキーは手動で発行します。

1. AWS マネジメントコンソールにログイン
2. IAM → ユーザー → `nagiyu-github-actions` を選択
3. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」
4. アクセスキー ID とシークレットアクセスキーをメモ

### 5. GitHub Secrets への登録

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を登録:

- `AWS_ACCESS_KEY_ID`: 上記で発行したアクセスキー ID
- `AWS_SECRET_ACCESS_KEY`: 上記で発行したシークレットアクセスキー
- `AWS_REGION`: `us-east-1`

### 6. ローカル開発用 IAM ユーザーの作成（任意）

ローカル環境から手動デプロイする場合に使用します。

```bash
aws cloudformation create-stack \
  --stack-name nagiyu-shared-local-dev-user \
  --template-body file://local-dev-user.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

スタックの作成完了を確認:

```bash
aws cloudformation wait stack-create-complete \
  --stack-name nagiyu-shared-local-dev-user \
  --region us-east-1
```

### 7. ローカル開発ユーザーのアクセスキー発行（任意）

1. AWS マネジメントコンソールにログイン
2. IAM → ユーザー → `nagiyu-local-dev` を選択
3. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」
4. アクセスキー ID とシークレットアクセスキーをメモ

### 8. ローカル環境への認証情報設定（任意）

```bash
aws configure --profile nagiyu-local-dev
```

以下の情報を入力:
- AWS Access Key ID: 上記で発行したアクセスキー ID
- AWS Secret Access Key: 上記で発行したシークレットアクセスキー
- Default region name: `us-east-1`
- Default output format: `json`

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
- `nagiyu-shared-github-actions-user`
- `nagiyu-shared-local-dev-user` (作成した場合)

### IAM ユーザーの確認

```bash
aws iam list-users \
  --query "Users[?starts_with(UserName, 'nagiyu-')].[UserName]" \
  --output table
```

以下のユーザーが表示されることを確認:
- `nagiyu-github-actions`
- `nagiyu-local-dev` (作成した場合)

---

## 次のステップ

初回セットアップが完了したら、以下のドキュメントを参照してください。

- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作
- [IAM 詳細](./shared/iam.md) - IAM リソースの詳細と運用方法

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

- AWS CLI で使用している IAM ユーザーが管理者権限を持っているか確認
- `--capabilities CAPABILITY_NAMED_IAM` オプションを指定しているか確認

### スタックの削除

作成に失敗した場合、以下のコマンドでスタックを削除できます。

```bash
aws cloudformation delete-stack --stack-name <スタック名> --region us-east-1
```

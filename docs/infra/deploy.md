# デプロイ手順

本ドキュメントは、nagiyu-platform のインフラを更新・デプロイする際の手順を説明します。

---

## 前提条件

- [初回セットアップ](./setup.md) が完了していること
- AWS CLI が設定済みであること
- デプロイ権限を持つ IAM ユーザーの認証情報が設定されていること

---

## デプロイ方法

### ローカル環境からのデプロイ

#### 1. AWS プロファイルの切り替え（必要な場合）

ローカル開発ユーザーを使用する場合:

```bash
export AWS_PROFILE=nagiyu-local-dev
```

#### 2. スタックのデプロイ

`aws cloudformation deploy` コマンドを使用します。このコマンドは自動的にスタックの作成または更新を行います。

```bash
aws cloudformation deploy \
  --template-file <テンプレートファイル> \
  --stack-name <スタック名> \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

---

## デプロイ例

### IAM ポリシーのデプロイ

```bash
cd infra/shared/iam/policies

# Core Policy
aws cloudformation deploy \
  --template-file deploy-policy-core.yaml \
  --stack-name nagiyu-shared-deploy-policy-core \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Container Policy
aws cloudformation deploy \
  --template-file deploy-policy-container.yaml \
  --stack-name nagiyu-shared-deploy-policy-container \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Application Policy
aws cloudformation deploy \
  --template-file deploy-policy-application.yaml \
  --stack-name nagiyu-shared-deploy-policy-application \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Integration Policy
aws cloudformation deploy \
  --template-file deploy-policy-integration.yaml \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### IAM ユーザーのデプロイ

GitHub Actions ユーザー:

```bash
cd infra/shared/iam/users

aws cloudformation deploy \
  --template-file github-actions-user.yaml \
  --stack-name nagiyu-shared-github-actions-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

ローカル開発ユーザー:

```bash
aws cloudformation deploy \
  --template-file local-dev-user.yaml \
  --stack-name nagiyu-shared-local-dev-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### 新しいアプリケーションリソースのデプロイ（将来）

```bash
cd infra/app-A

aws cloudformation deploy \
  --template-file resources.yaml \
  --stack-name nagiyu-app-A-resources \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

---

## CDK を使用したデプロイ

CDK (AWS Cloud Development Kit) を使用して、TypeScript でインフラストラクチャを定義・デプロイします。
詳細な移行戦略とガイドラインは [CDK 移行ガイド](./cdk-migration.md) を参照してください。

### CDK の初回セットアップ

CDK を使用する場合、まず依存関係をインストールします。

```bash
# モノレポ全体の依存関係をインストール（infra を含む）
npm ci
```

### CDK スタックの確認

利用可能なスタックを確認:

```bash
npm run synth --workspace=@nagiyu/infra
```

### CDK スタックのデプロイ

#### ローカル環境からのデプロイ

```bash
# すべてのスタックをデプロイ
npm run deploy --workspace=@nagiyu/infra -- --all

# 差分を確認
npm run diff --workspace=@nagiyu/infra

# 特定のスタックをデプロイ
npm run deploy --workspace=@nagiyu/infra -- <スタック名>
```

#### 承認なしデプロイ（CI/CD用）

```bash
npm run deploy --workspace=@nagiyu/infra -- --all --require-approval never
```

### GitHub Actions による CDK デプロイ

ルートドメイン用の CDK スタックは `.github/workflows/root-deploy.yml` で自動デプロイされます。

**ワークフローの特徴:**
- モノレポルートから全コマンドを実行
- `npm run build --workspace=@nagiyu/infra`, `npm run synth --workspace=@nagiyu/infra`, `npm run deploy --workspace=@nagiyu/infra` を使用
- 依存関係は `npm ci` で monorepo 全体をインストール（infra を含む）

**注記**: `infra/root/**` ディレクトリは今後のイシューで作成されます。現時点ではワークフローが正常に動作し、CDK Synth が成功することを確認します。

- **トリガー条件**: master ブランチへの push で、以下のパスが変更された場合
  - `infra/bin/**`
  - `infra/shared/vpc/**`
  - `infra/root/**` (将来作成予定)
  - `infra/package.json`
  - `infra/cdk.json`
  - `infra/tsconfig.json`

- **デプロイフロー**:
  1. CDK Synth で構文検証と CloudFormation テンプレート生成
  2. CDK Deploy ですべてのスタックをデプロイ

ワークフローは手動でも実行可能:

```
GitHub Actions → root-deploy.yml → Run workflow
```

---

## GitHub Actions による CDK 自動デプロイ

### Shared インフラストラクチャ

**ワークフロー**: `.github/workflows/shared-deploy.yml`

Shared インフラ (VPC, ACM, IAM) を CDK で自動デプロイします。

#### トリガー条件
- **自動実行**: `develop` または `main` ブランチへのプッシュで、以下のパスが変更された場合
  - `infra/shared/**`
  - `.github/workflows/shared-deploy.yml`
- **手動実行**: GitHub Actions から環境 (dev/prod) を選択して実行可能

#### デプロイフロー
1. Node.js 22 セットアップと依存関係インストール
2. AWS 認証情報設定
3. 環境判定 (develop → dev, main → prod)
4. CDK Bootstrap (初回のみ)
5. CDK Synth (CloudFormation テンプレート生成)
6. CDK Deploy (全スタックを一括デプロイ)

#### 手動実行方法

```bash
# GitHub CLI を使用
gh workflow run shared-deploy.yml -f environment=dev

# または GitHub Web UI から
# Actions → Deploy Shared Infrastructure → Run workflow
```

### Tools サービス

**ワークフロー**: `.github/workflows/tools-deploy.yml`

Tools サービスのインフラとアプリケーションを CDK + Docker でデプロイします。

#### トリガー条件
- **自動実行**: `develop`、`integration/**`、または `master` ブランチへのプッシュで、以下のパスが変更された場合
  - `services/tools/**`
  - `infra/tools/**`
  - `package.json`
  - `package-lock.json`
  - `.github/workflows/tools-deploy.yml`
- **手動実行**: GitHub Actions から実行可能

#### デプロイフロー
1. **Infrastructure ジョブ**: CDK で ECR、Lambda、CloudFront を一括デプロイ
2. **Build ジョブ**: Docker イメージをビルドして ECR にプッシュ
3. **Deploy ジョブ**: Lambda 関数のイメージを更新してヘルスチェック実行

#### 手動実行方法

```bash
# GitHub CLI を使用
gh workflow run tools-deploy.yml

# または GitHub Web UI から
# Actions → Tools App - Build and Deploy → Run workflow
```

---

## GitHub Actions による自動デプロイ (レガシー)

### ワークフロー設定例

`.github/workflows/deploy-infra.yml`:

```yaml
name: Deploy Infrastructure

on:
  push:
    branches:
      - develop
      - integration/**
    paths:
      - 'infra/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy CloudFormation stack
        run: |
          aws cloudformation deploy \
            --template-file infra/<パス>/template.yaml \
            --stack-name <スタック名> \
            --capabilities CAPABILITY_NAMED_IAM \
            --region us-east-1
```

---

## デプロイ確認

### スタックの状態確認

```bash
aws cloudformation describe-stacks \
  --stack-name <スタック名> \
  --query "Stacks[0].StackStatus" \
  --region us-east-1
```

### スタックイベントの確認

```bash
aws cloudformation describe-stack-events \
  --stack-name <スタック名> \
  --max-items 20 \
  --region us-east-1
```

### スタック出力値の確認

```bash
aws cloudformation describe-stacks \
  --stack-name <スタック名> \
  --query "Stacks[0].Outputs" \
  --region us-east-1
```

---

## スタックの削除

**注意:** 削除は慎重に行ってください。リソースが完全に削除されます。

```bash
aws cloudformation delete-stack \
  --stack-name <スタック名> \
  --region us-east-1
```

削除完了を待機:

```bash
aws cloudformation wait stack-delete-complete \
  --stack-name <スタック名> \
  --region us-east-1
```

---

## デプロイ順序

インフラリソースには依存関係があるため、以下の順序でデプロイしてください。

### 1. 共通 IAM リソース

```
1. nagiyu-shared-deploy-policy-core
2. nagiyu-shared-deploy-policy-container
3. nagiyu-shared-deploy-policy-application
4. nagiyu-shared-deploy-policy-integration
5. nagiyu-shared-github-actions-user
6. nagiyu-shared-local-dev-user
```

**依存関係:** 4つのdeploy-policy → github-actions-user, local-dev-user

### 2. 共通インフラ（将来）

```
1. nagiyu-shared-vpc
2. nagiyu-shared-security-groups
```

### 3. アプリケーション固有リソース（将来）

```
1. nagiyu-app-A-resources
2. nagiyu-app-B-resources
```

---

## トラブルシューティング

### デプロイが失敗する

エラー内容を確認:

```bash
aws cloudformation describe-stack-events \
  --stack-name <スタック名> \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED')].[LogicalResourceId,ResourceStatus,ResourceStatusReason]" \
  --output table \
  --region us-east-1
```

### 変更セットでの事前確認

本番環境など、慎重にデプロイしたい場合は変更セットを使用:

```bash
# 変更セットの作成
aws cloudformation deploy \
  --template-file <テンプレートファイル> \
  --stack-name <スタック名> \
  --capabilities CAPABILITY_NAMED_IAM \
  --no-execute-changeset \
  --region us-east-1

# 変更セット一覧の確認
aws cloudformation list-change-sets \
  --stack-name <スタック名> \
  --region us-east-1

# 変更内容の詳細確認
aws cloudformation describe-change-set \
  --stack-name <スタック名> \
  --change-set-name <変更セット名> \
  --region us-east-1

# 変更セットの実行
aws cloudformation execute-change-set \
  --stack-name <スタック名> \
  --change-set-name <変更セット名> \
  --region us-east-1
```

### スタックが UPDATE_ROLLBACK_COMPLETE 状態になった場合

問題を修正してから再度デプロイ:

```bash
aws cloudformation deploy \
  --template-file <修正済みテンプレート> \
  --stack-name <スタック名> \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

それでも解決しない場合は、スタックを削除して再作成:

```bash
aws cloudformation delete-stack --stack-name <スタック名> --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name <スタック名> --region us-east-1
aws cloudformation deploy --template-file <テンプレート> --stack-name <スタック名> --capabilities CAPABILITY_NAMED_IAM --region us-east-1
```

### CDK デプロイのトラブルシューティング

#### GitHub Actions ワークフローが失敗する

**原因:**
- IAM 権限が不足している
- AWS_ACCOUNT_ID シークレットが未設定
- CDK Bootstrap が未実行

**対処法:**

```bash
# IAM 権限の確認
aws iam list-attached-user-policies --user-name nagiyu-github-actions

# 必要なシークレットの確認
# GitHub Settings → Secrets → Actions で以下を確認:
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY
# - AWS_ACCOUNT_ID

# CDK Bootstrap の手動実行
cd infra/shared
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

#### CDK Deploy がスタック名を見つけられない

**エラー例:**
```
Error: Could not find ECR repository URI from CDK stack Tools-Ecr-dev
```

**原因:**
- CDK スタックがまだデプロイされていない
- 環境名が一致していない (dev/prod)

**対処法:**

```bash
# スタック一覧を確認
aws cloudformation list-stacks \
  --query "StackSummaries[?StackStatus!='DELETE_COMPLETE'].StackName" \
  --output table

# 手動で CDK スタックをデプロイ
cd infra/tools
npx cdk deploy --all --context env=dev --require-approval never
```

#### Lambda 関数の更新が失敗する

**エラー例:**
```
Error: ResourceConflictException: The operation cannot be performed at this time
```

**原因:**
- Lambda 関数が前回の更新処理中
- イメージの取得に時間がかかっている

**対処法:**

```bash
# Lambda 関数の状態を確認
aws lambda get-function \
  --function-name tools-app-dev \
  --query 'Configuration.State' \
  --output text

# Active になるまで待機してから再試行
```

#### Docker イメージのプッシュが失敗する

**エラー例:**
```
Error: denied: User is not authorized to perform: ecr:InitiateLayerUpload
```

**原因:**
- ECR への push 権限が不足
- ECR リポジトリが存在しない

**対処法:**

```bash
# ECR リポジトリの存在確認
aws ecr describe-repositories \
  --repository-names tools-app-dev \
  --region us-east-1

# リポジトリが存在しない場合は CDK で作成
cd infra/tools
npx cdk deploy Tools-Ecr-dev --context env=dev
```

---

## 関連ドキュメント

- [初回セットアップ](./setup.md) - インフラの初期構築
- [アーキテクチャ](./architecture.md) - インフラ全体の設計
- [IAM 詳細](./shared/iam.md) - IAM リソースの運用方法

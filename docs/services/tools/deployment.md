# Toolsアプリ デプロイ・運用マニュアル

本ドキュメントは、Tools アプリのデプロイと運用に関する手順を説明します。

---

## 1. インフラ構築

### 1.1 CloudFormationスタック作成手順

Tools アプリのインフラは以下の CloudFormation スタックで構成されます:

1. **ECR リポジトリ** (`infra/tools/ecr.yaml`)
2. **Lambda 関数** (`infra/tools/lambda.yaml`)
3. **CloudFront ディストリビューション** (`infra/tools/cloudfront.yaml`)

### 1.2 初回セットアップ

**リージョン戦略:**
- **ECR・Lambda**: `ap-northeast-1` (東京) - 日本ユーザー向けに低レイテンシ
- **CloudFront**: グローバルサービス (CloudFormation スタックは `us-east-1` に配置)
- **ACM 証明書**: `us-east-1` 必須 (CloudFront 用証明書の要件)

#### ECR リポジトリの作成

```bash
# 開発環境
aws cloudformation deploy \
  --template-file infra/tools/ecr.yaml \
  --stack-name nagiyu-tools-ecr-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1

# 本番環境
aws cloudformation deploy \
  --template-file infra/tools/ecr.yaml \
  --stack-name nagiyu-tools-ecr-prod \
  --parameter-overrides Environment=prod \
  --region ap-northeast-1
```

#### Lambda 関数の作成

```bash
# 開発環境
aws cloudformation deploy \
  --template-file infra/tools/lambda.yaml \
  --stack-name nagiyu-tools-lambda-dev \
  --parameter-overrides Environment=dev ImageUri=<ECR_IMAGE_URI> \
  --region ap-northeast-1

# 本番環境
aws cloudformation deploy \
  --template-file infra/tools/lambda.yaml \
  --stack-name nagiyu-tools-lambda-prod \
  --parameter-overrides Environment=prod ImageUri=<ECR_IMAGE_URI> \
  --region ap-northeast-1
```

#### CloudFront ディストリビューションの作成

**前提条件**: ACM 証明書が `us-east-1` リージョンに作成済みであること ([共通インフラ - ACM](../../infra/shared/acm.md) 参照)

```bash
# 開発環境
aws cloudformation deploy \
  --template-file infra/tools/cloudfront.yaml \
  --stack-name nagiyu-tools-cloudfront-dev \
  --parameter-overrides \
    Environment=dev \
    LambdaStackName=nagiyu-tools-lambda-dev \
    CertificateArn=<ACM_CERTIFICATE_ARN> \
    DomainName=dev-tools.example.com \
  --region us-east-1

# 本番環境
aws cloudformation deploy \
  --template-file infra/tools/cloudfront.yaml \
  --stack-name nagiyu-tools-cloudfront-prod \
  --parameter-overrides \
    Environment=prod \
    LambdaStackName=nagiyu-tools-lambda-prod \
    CertificateArn=<ACM_CERTIFICATE_ARN> \
    DomainName=tools.example.com \
  --region us-east-1
```

**注意**: CloudFront は `us-east-1` リージョンでスタックをデプロイします。Lambda は `ap-northeast-1` にありますが、CloudFront はグローバルサービスとして任意のリージョンのオリジンに接続できます。

### 1.3 環境ごとの設定

- **開発環境**: `develop`, `integration/**` ブランチからデプロイ
- **本番環境**: `master` ブランチからデプロイ

---

## 2. デプロイ手順

### 2.1 手動デプロイ

#### Docker イメージのビルドとプッシュ

```bash
# ECR ログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージのビルド
cd services/tools
docker build -t tools-app:latest .

# タグ付け
docker tag tools-app:latest <ECR_REGISTRY>/tools-app-dev:latest

# プッシュ
docker push <ECR_REGISTRY>/tools-app-dev:latest
```

#### Lambda 関数の更新

```bash
aws lambda update-function-code \
  --function-name tools-app-dev \
  --image-uri <ECR_REGISTRY>/tools-app-dev:latest \
  --region ap-northeast-1
```

### 2.2 GitHub Actionsによる自動デプロイ

#### 前提条件

GitHub Actions で自動デプロイを行うには、OIDC を使用した AWS 認証の設定が必要です。

#### OIDC 設定手順

**注意**: IAM はグローバルサービスですが、リージョンとして `us-east-1` を指定することが一般的です。

1. **AWS IAM で OIDC プロバイダーを作成**

   - AWS マネジメントコンソール → IAM → ID プロバイダー
   - プロバイダーの URL: `https://token.actions.githubusercontent.com`
   - 対象者: `sts.amazonaws.com`
   - リージョン: IAM はグローバルサービス (コンソールは us-east-1 を使用)

2. **デプロイ用 IAM ロールを作成**

   Trust Policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:nagiyu/nagiyu-platform:*"
           }
         }
       }
     ]
   }
   ```

3. **ロールに権限を付与**

   ECR (ap-northeast-1) と Lambda (ap-northeast-1) へのアクセス権限:
   
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ecr:GetAuthorizationToken",
           "ecr:BatchCheckLayerAvailability",
           "ecr:GetDownloadUrlForLayer",
           "ecr:BatchGetImage",
           "ecr:PutImage",
           "ecr:InitiateLayerUpload",
           "ecr:UploadLayerPart",
           "ecr:CompleteLayerUpload"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "lambda:UpdateFunctionCode",
           "lambda:GetFunctionConfiguration",
           "lambda:GetFunctionUrlConfig"
         ],
         "Resource": [
           "arn:aws:lambda:ap-northeast-1:<AWS_ACCOUNT_ID>:function:tools-app-dev",
           "arn:aws:lambda:ap-northeast-1:<AWS_ACCOUNT_ID>:function:tools-app-prod"
         ]
       }
     ]
   }
   ```

4. **GitHub Secrets の設定**

   GitHub リポジトリの Settings → Secrets and variables → Actions で以下を追加:
   
   - Name: `AWS_DEPLOY_ROLE_ARN`
   - Value: `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-deploy-role`

#### ワークフロー詳細

ワークフローファイル: `.github/workflows/tools-deploy.yml`

**トリガー条件:**
- `develop` ブランチ → 開発環境へデプロイ
- `integration/**` ブランチ → 開発環境へデプロイ
- `master` ブランチ → 本番環境へデプロイ

**実行内容:**
1. Docker イメージをビルドして ECR にプッシュ
2. Lambda 関数を新しいイメージで更新
3. ヘルスチェックで動作確認

### 2.3 デプロイ後の確認

#### Lambda 関数の確認

```bash
# 関数の状態確認
aws lambda get-function \
  --function-name tools-app-dev \
  --region ap-northeast-1

# Function URL の取得
aws lambda get-function-url-config \
  --function-name tools-app-dev \
  --region ap-northeast-1
```

#### ヘルスチェック

```bash
curl https://<FUNCTION_URL>/api/health
```

---

## 3. CI/CD

### 3.1 ワークフロー設定

GitHub Actions ワークフロー (`.github/workflows/tools-deploy.yml`) により、以下のプロセスが自動化されています:

1. **Build Job**
   - Docker イメージのビルド
   - ECR へのプッシュ
   - イメージ URI の出力

2. **Deploy Job**
   - Lambda 関数コードの更新
   - 更新完了の待機
   - ヘルスチェックによる検証

### 3.2 ブランチごとのデプロイ戦略

| ブランチ | 環境 | 自動デプロイ |
|---------|------|------------|
| `develop` | 開発 | ✅ |
| `integration/**` | 開発 | ✅ |
| `master` | 本番 | ✅ |

### 3.3 デプロイ承認フロー

現在は自動デプロイのみですが、将来的に本番環境への承認フローを追加する場合:

```yaml
deploy:
  environment:
    name: production
    url: https://tools.example.com
```

---

## 4. 監視・アラート

### 4.1 CloudWatch設定

(将来実装予定)

### 4.2 アラート設定

(将来実装予定)

### 4.3 ログ監視

Lambda のログは CloudWatch Logs に自動的に保存されます。

```bash
# ログの確認
aws logs tail /aws/lambda/tools-app-dev --follow
```

### 4.4 メトリクス監視

(将来実装予定)

---

## 5. 運用

### 5.1 日常運用タスク

(将来実装予定)

### 5.2 バックアップ・リストア

(将来実装予定)

### 5.3 スケーリング対応

Lambda は自動スケーリングされます。必要に応じて以下を調整:
- メモリサイズ
- タイムアウト
- 予約済み同時実行数

### 5.4 コスト管理

(将来実装予定)

---

## 6. 保守

### 6.1 定期メンテナンス

(将来実装予定)

### 6.2 セキュリティアップデート

依存パッケージの定期的な更新を実施してください。

### 6.3 変更管理プロセス

(将来実装予定)

---

## 7. 障害対応

### 7.1 インシデント対応フロー

(将来実装予定)

### 7.2 ロールバック手順

#### GitHub Actions からのロールバック

1. 前のコミットに戻す
2. 再度プッシュして自動デプロイを実行

#### 手動ロールバック

```bash
# 前のイメージタグを指定
aws lambda update-function-code \
  --function-name tools-app-dev \
  --image-uri <ECR_REGISTRY>/tools-app-dev:<PREVIOUS_TAG> \
  --region ap-northeast-1
```

### 7.3 よくある障害と対処法

#### デプロイが失敗する

**症状:** GitHub Actions のワークフローが失敗する

**原因と対処:**
- ECR ログインエラー → IAM ロールの権限を確認
- Lambda 更新エラー → Lambda 関数が存在するか確認
- ヘルスチェック失敗 → `/api/health` エンドポイントの実装を確認

#### Lambda が起動しない

**症状:** Function URL にアクセスできない

**原因と対処:**
- Docker イメージのビルドエラー → ローカルでイメージをビルドしてテスト
- 環境変数の設定ミス → Lambda の環境変数を確認
- メモリ不足 → Lambda のメモリサイズを増やす

### 7.4 エスカレーションフロー

(将来実装予定)

---

## 参考資料

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)
- [基本設計書](./basic-design.md) - Tools アプリのアーキテクチャと技術スタック


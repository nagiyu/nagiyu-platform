# Tools Service CDK Infrastructure

このディレクトリには、Tools サービスの AWS インフラストラクチャを定義した CDK コードが含まれています。

## 構成

### スタック構成

- **Tools-Ecr-{env}**: ECR リポジトリ
- **Tools-Lambda-{env}**: Lambda 関数と実行ロール
- **Tools-CloudFront-{env}**: CloudFront ディストリビューション

### リソース

#### ECR Repository

- リポジトリ名: `tools-app-{env}`
- イメージスキャン: 有効
- ライフサイクルポリシー: 最新10イメージを保持

#### Lambda Function

- 関数名: `tools-app-{env}`
- ランタイム: FROM_IMAGE (ECR)
- メモリ: 1024MB
- タイムアウト: 30秒
- Function URL: 有効 (認証なし)

#### CloudFront Distribution

- オリジン: Lambda Function URL
- カスタムドメイン: `{env}-tools.nagiyu.com` (prod: `tools.nagiyu.com`)
- セキュリティヘッダー: HSTS, X-Content-Type-Options, X-Frame-Options など
- キャッシュポリシー: 無効 (動的コンテンツのため)

## 前提条件

### 共有リソース

以下の共有リソースが事前にデプロイされている必要があります:

- ACM 証明書 (us-east-1): `nagiyu-shared-acm-certificate-arn` export

### ECR イメージ

Lambda デプロイ前に、ECR リポジトリにコンテナイメージがプッシュされている必要があります。

## コマンド

### ビルド

```bash
npm run build
```

### CDK Synth (テンプレート生成)

```bash
# dev 環境
npm run synth -- --context env=dev

# prod 環境
npm run synth -- --context env=prod
```

### 差分確認

```bash
# dev 環境
npm run diff:dev

# prod 環境
npm run diff:prod

# 特定のスタック
npx cdk diff Tools-Ecr-dev --context env=dev
```

### デプロイ

```bash
# dev 環境 (全スタック)
npm run deploy:dev

# prod 環境 (全スタック)
npm run deploy:prod

# 特定のスタックのみ
npx cdk deploy Tools-Ecr-dev --context env=dev
npx cdk deploy Tools-Lambda-dev --context env=dev
npx cdk deploy Tools-CloudFront-dev --context env=dev
```

### 削除

```bash
# dev 環境 (逆順)
npx cdk destroy Tools-CloudFront-dev --context env=dev
npx cdk destroy Tools-Lambda-dev --context env=dev
npx cdk destroy Tools-Ecr-dev --context env=dev
```

## デプロイ手順

### 初回デプロイ

1. **ECR スタックのデプロイ**

   ```bash
   npx cdk deploy Tools-Ecr-dev --context env=dev
   ```

2. **コンテナイメージのビルドとプッシュ**

   ```bash
   cd ../../services/tools
   # ECR ログイン
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

   # イメージビルド
   docker build -t tools-app-dev .
   docker tag tools-app-dev:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest

   # プッシュ
   docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/tools-app-dev:latest
   ```

3. **Lambda スタックのデプロイ**

   ```bash
   npx cdk deploy Tools-Lambda-dev --context env=dev
   ```

4. **CloudFront スタックのデプロイ**
   ```bash
   npx cdk deploy Tools-CloudFront-dev --context env=dev
   ```

### 更新デプロイ

```bash
# 全スタックを一括デプロイ
npm run deploy:dev
```

## ロールバック手順

### CDK スタックの削除

```bash
# 逆順で削除
npx cdk destroy Tools-CloudFront-dev --context env=dev
npx cdk destroy Tools-Lambda-dev --context env=dev
npx cdk destroy Tools-Ecr-dev --context env=dev
```

### CloudFormation への戻し

元の CloudFormation テンプレートを再デプロイ:

```bash
cd ../tools

# ECR
aws cloudformation deploy \
  --template-file ecr.yaml \
  --stack-name nagiyu-tools-ecr \
  --parameter-overrides Environment=dev

# Lambda
aws cloudformation deploy \
  --template-file lambda.yaml \
  --stack-name nagiyu-tools-lambda \
  --parameter-overrides Environment=dev ImageUri=<ecr-uri>:latest

# CloudFront
aws cloudformation deploy \
  --template-file cloudfront.yaml \
  --stack-name nagiyu-tools-cloudfront \
  --parameter-overrides Environment=dev LambdaStackName=nagiyu-tools-lambda \
    CertificateArn=<cert-arn> DomainName=dev-tools.nagiyu.com
```

## 検証基準

- ✅ `cdk diff` でリソースの削除がない
- ✅ dev 環境でのデプロイ成功
- ✅ Lambda Function URL が正常動作
- ✅ CloudFront が正常配信
- ✅ ECR にイメージをプッシュできる
- ✅ prod 環境でのデプロイ成功

## トラブルシューティング

### ビルドエラー

```bash
# 依存関係の再インストール
npm install

# TypeScript の再ビルド
npm run build
```

### デプロイエラー

```bash
# AWS 認証情報の確認
aws sts get-caller-identity

# スタックの状態確認
aws cloudformation describe-stacks --stack-name Tools-Ecr-dev --region us-east-1
```

### ECR イメージが見つからない

Lambda デプロイ前に ECR にイメージがプッシュされていることを確認:

```bash
aws ecr describe-images \
  --repository-name tools-app-dev \
  --region us-east-1
```

## 参考資料

- [CDK 移行ガイド](../../docs/infra/cdk-migration.md)
- [Tools サービスドキュメント](../../docs/services/tools/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)

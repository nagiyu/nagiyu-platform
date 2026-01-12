# Tools Infrastructure (CDK)

内部ツール用のインフラストラクチャを管理します。

## 構成

- **ECR Repository**: Docker イメージ管理
- **Lambda Function**: ツールアプリケーション実行
- **CloudFront Distribution**: CDN 配信

## デプロイ

### 開発環境
```bash
cd infra/tools
npm ci
npm run build
npx cdk deploy --all --context env=dev
```

### 本番環境
```bash
npx cdk deploy --all --context env=prod
```

## GitHub Actions

ワークフロー: `.github/workflows/tools-deploy.yml`

---

## 詳細構成 (参考)

### スタック構成

- **Tools-Ecr-{env}**: ECR リポジトリ
- **Tools-Lambda-{env}**: Lambda 関数と実行ロール
- **Tools-CloudFront-{env}**: CloudFront ディストリビューション

### リソース詳細

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

### 前提条件

#### 共有リソース

以下の共有リソースが事前にデプロイされている必要があります:

- ACM 証明書 (us-east-1): `nagiyu-shared-acm-certificate-arn` export

#### ECR イメージ

Lambda デプロイ前に、ECR リポジトリにコンテナイメージがプッシュされている必要があります。

### コマンド

すべてのコマンドは `infra/tools/` ディレクトリで実行します。

#### ビルド

```bash
npm run build
```

#### CDK Synth (テンプレート生成)

```bash
# dev 環境
npm run synth -- --context env=dev

# prod 環境
npm run synth -- --context env=prod
```

#### 差分確認

```bash
# dev 環境
npm run diff:dev

# prod 環境
npm run diff:prod

# 特定のスタック
npx cdk diff Tools-Ecr-dev --context env=dev
```

#### デプロイ

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

#### 削除

```bash
# dev 環境 (逆順)
npx cdk destroy Tools-CloudFront-dev --context env=dev
npx cdk destroy Tools-Lambda-dev --context env=dev
npx cdk destroy Tools-Ecr-dev --context env=dev
```

### 初回デプロイ手順

1. **ECR スタックのデプロイ**

    ```bash
    cd infra/tools
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
    cd ../../infra/tools
    npx cdk deploy Tools-Lambda-dev --context env=dev
    ```

4. **CloudFront スタックのデプロイ**

    ```bash
    npx cdk deploy Tools-CloudFront-dev --context env=dev
    ```

### トラブルシューティング

#### ビルドエラー

```bash
cd infra/tools
# 依存関係の再インストール
npm install

# TypeScript の再ビルド
npm run build
```

#### デプロイエラー

```bash
# AWS 認証情報の確認
aws sts get-caller-identity

# スタックの状態確認
aws cloudformation describe-stacks --stack-name Tools-Ecr-dev --region us-east-1
```

#### ECR イメージが見つからない

Lambda デプロイ前に ECR にイメージがプッシュされていることを確認:

```bash
aws ecr describe-images \
  --repository-name tools-app-dev \
  --region us-east-1
```

---

## 関連ドキュメント

- [CDK 移行ガイド](../cdk-migration.md)
- [Tools サービスドキュメント](../../services/tools/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)

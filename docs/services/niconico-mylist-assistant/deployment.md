# niconico-mylist-assistant デプロイ・運用

## 1. 環境構成

| 環境        | URL                                                | デプロイ元ブランチ          |
| ----------- | -------------------------------------------------- | --------------------------- |
| dev (開発)  | `https://dev-niconico-mylist-assistant.nagiyu.com` | `develop`, `integration/**` |
| prod (本番) | `https://niconico-mylist-assistant.nagiyu.com`     | `master`                    |

## 2. 主要リソース

- **Lambda**: Next.js アプリケーション実行（VPC 外）
- **AWS Batch (Fargate)**: マイリスト登録バッチ処理（共有 VPC）
- **DynamoDB**: 動画基本情報・ユーザー設定・ジョブステータス
- **ECR**: Lambda / Batch 用コンテナイメージ
- **CloudFront**: CDN・HTTPS 終端
- **CloudWatch Logs**: アプリケーションログ
- **Secrets Manager**: 暗号化キー、テスト用アカウント情報

## 3. 前提条件

以下の共有インフラがデプロイ済みであること:

- VPC: `nagiyu-{env}-vpc`
- ACM 証明書（CloudFront 用）

## 4. 初回セットアップ

### 4.1 Secrets Manager の設定

**暗号化キー** (`niconico-mylist-assistant/shared-secret-key-{env}`) は SecretsStack により CDK デプロイ時に自動生成されます。

**テスト用ニコニコアカウント**（CI 統合テスト用）のみ、以下のコマンドで手動作成:

```bash
aws secretsmanager create-secret \
    --name niconico-mylist-assistant/test-account \
    --secret-string '{"email":"test@example.com","password":"your-password"}' \
    --region us-east-1
```

**VAPID キー**（Web Push 通知用）は以下のコマンドで生成・設定:

```bash
# VAPID キーペアを生成（web-push CLI を使用）
npx web-push generate-vapid-keys

# Secrets Manager に保存
aws secretsmanager create-secret \
    --name niconico-mylist-assistant/vapid-keys-{env} \
    --secret-string '{"publicKey":"...","privateKey":"..."}' \
    --region us-east-1
```

### 4.2 デプロイ手順

#### 4.2.1 ECR リポジトリ作成

```bash
cd infra/niconico-mylist-assistant
npx cdk deploy NiconicoMylistAssistant-ECR-{env}
```

#### 4.2.2 Docker イメージビルド・プッシュ

```bash
# Web イメージ
cd services/niconico-mylist-assistant/web
docker build -t niconico-mylist-assistant-web-{env} .
docker tag niconico-mylist-assistant-web-{env} {account}.dkr.ecr.us-east-1.amazonaws.com/niconico-mylist-assistant-web-{env}:latest
docker push {account}.dkr.ecr.us-east-1.amazonaws.com/niconico-mylist-assistant-web-{env}:latest

# Batch イメージ
cd services/niconico-mylist-assistant/batch
docker build -t niconico-mylist-assistant-batch-{env} .
docker tag niconico-mylist-assistant-batch-{env} {account}.dkr.ecr.us-east-1.amazonaws.com/niconico-mylist-assistant-batch-{env}:latest
docker push {account}.dkr.ecr.us-east-1.amazonaws.com/niconico-mylist-assistant-batch-{env}:latest
```

#### 4.2.3 インフラデプロイ

```bash
cd infra/niconico-mylist-assistant
npx cdk deploy --all
```

## 5. CI/CD

GitHub Actions によりPRマージ時に自動デプロイが実行されます。

- develop ブランチへのマージ: dev 環境に自動デプロイ
- master ブランチへのマージ: prod 環境に自動デプロイ

## 6. 運用

### 6.1 ログ確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/niconico-mylist-assistant-web-{env} --follow

# Batch ログ
aws logs tail /aws/batch/niconico-mylist-assistant-{env} --follow
```

### 6.2 バッチジョブの手動投入（検証用）

```bash
aws batch submit-job \
    --job-name test-job \
    --job-queue niconico-mylist-assistant-queue-{env} \
    --job-definition niconico-mylist-assistant-batch-job-{env}
```

### 6.3 監視

- CloudWatch Logs でエラーログを監視
- Batch ジョブのステータス（SUCCEEDED / FAILED）を確認

## 7. 重要な注意事項

### 7.1 Docker ビルドの注意点

**DOCKER_BUILDKIT=0 を使用すること**

Lambda で使用する Docker イメージは、v2 single-arch format が必要です。BuildKit はデフォルトで multi-arch format を使用するため、DOCKER_BUILDKIT=0 を設定して classic builder を使用してください。

```bash
DOCKER_BUILDKIT=0 docker build -t image-name .
```

### 7.2 Secrets Manager の管理

- 暗号化キーは CDK により自動生成されるため、手動で作成しない
- テスト用アカウント情報は手動で作成・更新
- VAPID キーは環境ごとに異なるキーを使用

### 7.3 Batch リソースの最小構成

- vCPU: 0.25
- メモリ: 512 MB
- 最大100個の動画登録に十分なリソース

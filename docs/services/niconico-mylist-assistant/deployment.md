# niconico-mylist-assistant デプロイ・運用

この文書は、デプロイと運用の手順を書く。サービスが今どう動くかは[仕様カード](../../specs/README.md)にあり、バッチの動きは[マイリスト登録バッチ](../../specs/niconico-mylist-assistant/batch/mylist-register.md)を参照する。

## 1. 環境構成

| 環境        | URL                                                | デプロイ元ブランチ          |
| ----------- | -------------------------------------------------- | --------------------------- |
| dev (開発)  | `https://niconico-mylist-assistant.dev.nagiyu.com` | `develop`, `integration/**` |
| prod (本番) | `https://niconico-mylist-assistant.nagiyu.com`     | `master`                    |

## 2. 主要リソース

- **Lambda**: Next.js アプリケーション実行（VPC 外）
- **AWS Batch (Fargate)**: マイリスト登録バッチ処理（共有 VPC）
- **DynamoDB**: 動画基本情報・ユーザー設定・ジョブステータス
- **ECR**: Lambda / Batch 用コンテナイメージ
- **CloudFront**: CDN・HTTPS 終端
- **CloudWatch Logs**: アプリケーションログ
- **Secrets Manager**: 暗号化キー、VAPID キー

## 3. 前提条件

以下の共有インフラがデプロイ済みであること:

- VPC: `nagiyu-{env}-vpc`
- ACM 証明書（CloudFront 用）

## 4. 初回セットアップ

### 4.1 Secrets Manager の設定

**暗号化キー** (`nagiyu-niconico-mylist-assistant-shared-secret-key-{env}`) は SecretsStack により CDK デプロイ時に自動生成されます。

**VAPID キー**（Web Push 通知用）は `nagiyu-niconico-mylist-assistant-vapid-{env}` として SecretsStack が仮の値 (`PLACEHOLDER`) で作成するため、実際のキーで上書きします:

```bash
# VAPID キーペアを生成（web-push CLI を使用）
npx web-push generate-vapid-keys

# Secrets Manager の値を上書き
aws secretsmanager put-secret-value \
    --secret-id nagiyu-niconico-mylist-assistant-vapid-{env} \
    --secret-string '{"publicKey":"...","privateKey":"..."}' \
    --region us-east-1
```

### 4.2 デプロイ手順

#### 4.2.1 ECR リポジトリ作成

CDK はどのスタックを deploy するときもアプリ全体を合成し、環境変数 `IMAGE_TAG` を読む。`IMAGE_TAG` が無いと合成が失敗するので、ECR だけの deploy にも値を渡す。値は次節で決めるタグと同じものにする。

```bash
export IMAGE_TAG=$(git rev-parse HEAD)

cd infra/niconico-mylist-assistant
IMAGE_TAG=${IMAGE_TAG} npx cdk deploy NagiyuNiconicoMylistAssistantWebECR{Env} NagiyuNiconicoMylistAssistantBatchECR{Env} --context env={env}
```

#### 4.2.2 Docker イメージビルド・プッシュ

イメージのタグは 1 つだけ決め、Web 用と Batch 用の両方に同じタグを付ける。CI ではコミットの sha を使う。動くタグ (`latest`) は使わない。同じタグのままでは CloudFormation がイメージの入れ替わりに気づかず、Lambda もジョブ定義も更新されないためである。

ビルドはモノレポルートから行い、CI と同じく BuildKit を切る (`DOCKER_BUILDKIT=0`)。

```bash
# 4.2.1 と同じタグ
export IMAGE_TAG=$(git rev-parse HEAD)

aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin {account}.dkr.ecr.us-east-1.amazonaws.com

# ECR リポジトリの URI は ECR スタックの出力から取得する
WEB_REPO_URI=$(aws cloudformation describe-stacks \
    --stack-name NagiyuNiconicoMylistAssistantWebECR{Env} \
    --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
    --output text --region us-east-1)
BATCH_REPO_URI=$(aws cloudformation describe-stacks \
    --stack-name NagiyuNiconicoMylistAssistantBatchECR{Env} \
    --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
    --output text --region us-east-1)

# Web イメージ
DOCKER_BUILDKIT=0 docker build -t ${WEB_REPO_URI}:${IMAGE_TAG} -f services/niconico-mylist-assistant/web/Dockerfile .
docker push ${WEB_REPO_URI}:${IMAGE_TAG}

# Batch イメージ
DOCKER_BUILDKIT=0 docker build -t ${BATCH_REPO_URI}:${IMAGE_TAG} -f services/niconico-mylist-assistant/batch/Dockerfile .
docker push ${BATCH_REPO_URI}:${IMAGE_TAG}
```

#### 4.2.3 インフラデプロイ

CDK は `IMAGE_TAG` のタグを Lambda とジョブ定義に書き込むので、4.2.2 と同じ値を渡す。イメージの切り替えはこの deploy が行う。

```bash
cd infra/niconico-mylist-assistant
IMAGE_TAG=${IMAGE_TAG} npx cdk deploy --all --context env={env}
```

## 5. CI/CD

GitHub Actions によりPRマージ時に自動デプロイが実行されます。

- develop ブランチへのマージ: dev 環境に自動デプロイ
- master ブランチへのマージ: prod 環境に自動デプロイ

## 6. 運用

### 6.1 ログ確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/nagiyu-niconico-mylist-assistant-web-{env} --follow

# Batch ログ
aws logs tail /aws/batch/nagiyu-niconico-mylist-assistant-{env} --follow
```

### 6.2 バッチジョブの手動投入（検証用）

```bash
aws batch submit-job \
    --job-name test-job \
    --job-queue nagiyu-niconico-mylist-assistant-{env} \
    --job-definition nagiyu-niconico-mylist-assistant-{env}
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
- VAPID キーは環境ごとに異なるキーを使用

### 7.3 Batch リソース

- vCPU: 1.0
- メモリ: 2048 MB
- ヘッドレス Chromium を動かし、最大100個の動画登録を行うためのリソース。値を下げる場合は、ブラウザが起動して登録を完走することを確かめる

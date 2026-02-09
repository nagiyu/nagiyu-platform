# Niconico Mylist Assistant インフラストラクチャ

## 概要

Niconico Mylist Assistant サービスのAWSインフラストラクチャを管理するCDKプロジェクトです。

## アーキテクチャ

### マルチリージョン構成

このサービスは、セキュリティとユーザー体験の最適化のため、複数のAWSリージョンを使用しています:

#### us-east-1 (バージニア北部)
- **Lambda (Web)**: Next.jsアプリケーション
- **CloudFront**: グローバルCDN配信
- **DynamoDB**: データストレージ
- **Secrets Manager**: 暗号化キー管理
- **S3**: スクリーンショット保存
- **Web ECR**: WebアプリケーションのDockerイメージ

#### ap-northeast-1 (東京)
- **Batch**: マイリスト登録処理
- **Batch ECR**: Batchワーカーイメージ
- **VPC**: Batch用ネットワーク

### リージョン分離の理由

**バッチ処理を日本リージョンに配置する理由:**
- ニコニコ動画は海外IPからのログイン時に二段階認証コードを要求します
- 日本リージョン(ap-northeast-1)からアクセスすることで、この制約を回避できます
- これにより、自動化されたバッチ処理が中断なく実行可能になります

## リソース構成

### スタック一覧

1. **DynamoDB Stack** (us-east-1)
   - ユーザー設定、バッチジョブ、動画情報を保存

2. **Secrets Stack** (us-east-1)
   - 暗号化キーを管理

3. **S3 Stack** (us-east-1)
   - スクリーンショット画像を保存

4. **Web ECR Stack** (us-east-1)
   - Webアプリケーションのコンテナイメージ

5. **Batch ECR Stack** (ap-northeast-1)
   - Batchワーカーのコンテナイメージ

6. **Batch Stack** (ap-northeast-1)
   - AWS Batch環境（Compute Environment, Job Queue, Job Definition）
   - Fargate使用

7. **Lambda Stack** (us-east-1)
   - Next.js Web Lambda
   - Batch起動権限を持つ

8. **IAM Stack** (us-east-1)
   - 開発用IAMユーザー（dev環境のみ）

9. **CloudFront Stack** (us-east-1)
   - カスタムドメインでのグローバル配信

### クロスリージョン参照

Lambda Stack (us-east-1) は Batch Stack (ap-northeast-1) のリソースを参照します:
- BatchJobQueueArn
- BatchJobDefinitionArn

CDKでは `crossRegionReferences: true` を設定してこれを実現しています。

## デプロイ

### 前提条件

1. **共有VPCの準備**
   
   ap-northeast-1リージョンにVPCが必要です。以下のドキュメントを参照してVPCをデプロイしてください:
   - [マルチリージョンVPC展開](../../docs/infra/shared/multi-region-vpc.md)

2. **Bootstrap**
   
   両方のリージョンでCDK Bootstrapが必要です:
   ```bash
   # us-east-1
   npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- bootstrap aws://ACCOUNT_ID/us-east-1
   
   # ap-northeast-1
   npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- bootstrap aws://ACCOUNT_ID/ap-northeast-1
   ```

3. **NextAuth Secret**
   
   Authサービスから NextAuth Secret を取得しておく必要があります。

### デプロイコマンド

#### インフラストラクチャのデプロイ

```bash
cd /path/to/nagiyu-platform

# dev環境
npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- deploy \
  --all \
  --context env=dev \
  --context nextAuthSecret="YOUR_SECRET" \
  --require-approval never

# prod環境
npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- deploy \
  --all \
  --context env=prod \
  --context nextAuthSecret="YOUR_SECRET" \
  --require-approval never
```

#### 個別スタックのデプロイ

```bash
# DynamoDB, Secrets, S3, ECR のみ
npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- deploy \
  NagiyuNiconicoMylistAssistantDynamoDBDev \
  NagiyuNiconicoMylistAssistantSecretsDev \
  NagiyuNiconicoMylistAssistantS3Dev \
  NagiyuNiconicoMylistAssistantWebECRDev \
  NagiyuNiconicoMylistAssistantBatchECRDev \
  --context env=dev \
  --require-approval never

# Batch のみ
npm run cdk --workspace=@nagiyu/infra-niconico-mylist-assistant -- deploy \
  NagiyuNiconicoMylistAssistantBatchDev \
  --context env=dev \
  --require-approval never
```

### GitHub Actions

`.github/workflows/niconico-mylist-assistant-deploy.yml` により自動デプロイされます:

- **develop** → dev環境
- **master** → prod環境

ワークフローは自動的に:
1. 両リージョンでBootstrapを実行
2. インフラスタックをデプロイ
3. Dockerイメージをビルド・プッシュ
4. アプリケーションスタックをデプロイ

## 環境変数

### Lambda (Web)

| 変数名 | 説明 | 値の例 |
|--------|------|--------|
| DYNAMODB_TABLE_NAME | DynamoDBテーブル名 | niconico-mylist-assistant-dev |
| AWS_REGION_FOR_SDK | SDKで使用するリージョン | us-east-1 |
| BATCH_JOB_QUEUE | BatchジョブキューARN | arn:aws:batch:ap-northeast-1:... |
| BATCH_JOB_DEFINITION | Batchジョブ定義ARN | arn:aws:batch:ap-northeast-1:... |
| ENCRYPTION_SECRET_NAME | 暗号化シークレット名 | niconico-mylist-assistant/shared-secret-key-dev |
| NEXTAUTH_SECRET | NextAuth認証用シークレット | (Authサービスから取得) |
| NEXTAUTH_URL | 認証コールバックURL | https://dev-niconico-mylist-assistant.nagiyu.com |
| AUTH_URL | 認証サービスURL | https://dev-auth.nagiyu.com |

### Batch (Worker)

| 変数名 | 説明 | 値の例 |
|--------|------|--------|
| DYNAMODB_TABLE_NAME | DynamoDBテーブル名 | niconico-mylist-assistant-dev |
| AWS_REGION | Batchが動作するリージョン | ap-northeast-1 |
| ENCRYPTION_SECRET_NAME | 暗号化シークレット名 | niconico-mylist-assistant/shared-secret-key-dev |
| SCREENSHOT_BUCKET_NAME | スクリーンショット保存先 | nagiyu-niconico-mylist-assistant-screenshots-dev |
| AWS_BATCH_JOB_ID | BatchジョブID | (自動設定) |

## トラブルシューティング

### VPC Lookup エラー

**エラー:**
```
ValidationError: Cannot retrieve value from context provider vpc-provider
```

**原因:** ap-northeast-1 リージョンにVPCが存在しない

**解決方法:** [マルチリージョンVPC展開](../../docs/infra/shared/multi-region-vpc.md) を参照してVPCをデプロイ

### クロスリージョン参照エラー

**エラー:**
```
Export ... cannot be deleted as it is in use by ...
```

**原因:** CloudFormation Exportが他のスタックから参照されている

**解決方法:** 
1. 参照元スタック(Lambda)を先に更新
2. その後、参照先スタック(Batch)を更新

### ECR認証エラー (ap-northeast-1)

**エラー:**
```
denied: Your authorization token has expired
```

**原因:** ap-northeast-1 リージョンのECRにログインしていない

**解決方法:**
```bash
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com
```

## 関連ドキュメント

- [アーキテクチャ概要](../../docs/infra/architecture.md)
- [共有インフラ](../../docs/infra/shared/README.md)
- [マルチリージョンVPC展開](../../docs/infra/shared/multi-region-vpc.md)
- [デプロイ手順](../../docs/infra/deploy.md)

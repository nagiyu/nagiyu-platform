# Codec Converter - インフラストラクチャ

本ドキュメントは、Codec Converter サービスのインフラストラクチャ構成とデプロイ手順を説明します。

---

## 概要

Codec Converter のインフラは以下のコンポーネントで構成されます:

| コンポーネント | CloudFormation スタック | 説明 |
|-------------|----------------------|------|
| **ECR** | `codec-converter-ecr-{env}` | コンテナイメージレジストリ (Next.js, FFmpeg) |
| **IAM** | `codec-converter-iam-{env}` | サービス固有の IAM ロール・ポリシー |
| **S3** | `codec-converter-s3-{env}` | 動画ファイルストレージ |
| **DynamoDB** | `codec-converter-dynamodb-{env}` | ジョブ管理データベース |
| **Batch** | `codec-converter-batch-{env}` | 動画変換処理 |
| **Lambda** | `codec-converter-lambda-{env}` | Next.js アプリケーション (SSR + API) |
| **CloudFront** | `codec-converter-cloudfront-{env}` | CDN、カスタムドメイン |

---

## ディレクトリ構造

```
infra/codec-converter/
├── ecr/
│   └── repositories.yaml         # ECR リポジトリ (Next.js, FFmpeg)
├── iam/
│   ├── lambda-role.yaml          # Lambda 実行ロール
│   ├── batch-job-role.yaml       # Batch ジョブ実行ロール
│   └── batch-execution-role.yaml # Batch タスク実行ロール
├── s3/
│   └── storage-bucket.yaml       # S3 バケット
├── dynamodb/
│   └── jobs-table.yaml           # DynamoDB テーブル
├── batch/
│   ├── compute-environment.yaml  # Batch Compute Environment
│   ├── job-queue.yaml            # Batch Job Queue
│   ├── job-definition.yaml       # Batch Job Definition
│   └── log-group.yaml            # CloudWatch Logs ロググループ
├── lambda/
│   └── nextjs-function.yaml      # Lambda 関数
└── cloudfront/
    └── distribution.yaml         # CloudFront Distribution
```

---

## スタック依存関係

```
ecr (2つのリポジトリ、最初に作成)
  ↓
iam (3つのロール)
  ↓
s3, dynamodb (並列可能)
  ↓
batch (3つのリソース、順次作成)
  ↓
lambda
  ↓
cloudfront (最後に作成)
```

**デプロイ順序**:
1. ECR リポジトリを作成 (Next.js, FFmpeg)
2. Lambda/Batch 用コンテナイメージをビルド・プッシュ
3. IAM ロールを作成 (Lambda, Batch Job, Batch Execution)
4. S3、DynamoDB を作成
5. Batch リソースを作成 (Compute Environment → Job Queue → Job Definition)
6. Lambda 関数を作成
7. CloudFront Distribution を作成

### スタック間の値の受け渡し

CloudFormation の Export/Import 機能を使用して、スタック間でリソース情報を受け渡します。

**Export する値** (各スタックの `Outputs` セクション):

| スタック | Export 名 | 値 | 使用先 |
|---------|----------|---|--------|
| IAM (Lambda) | `codec-converter-lambda-role-arn-{env}` | Lambda 実行ロール ARN | Lambda |
| IAM (Batch Job) | `codec-converter-batch-job-role-arn-{env}` | Batch ジョブロール ARN | Batch Job Definition |
| IAM (Batch Execution) | `codec-converter-batch-execution-role-arn-{env}` | Batch 実行ロール ARN | Batch Job Definition |
| S3 | `codec-converter-s3-bucket-name-{env}` | S3 バケット名 | Lambda, Batch Job Definition |
| DynamoDB | `codec-converter-dynamodb-table-name-{env}` | DynamoDB テーブル名 | Lambda, Batch Job Definition |
| Batch (Compute) | `codec-converter-batch-compute-env-arn-{env}` | Compute Environment ARN | Batch Job Queue |
| Batch (Queue) | `codec-converter-batch-queue-arn-{env}` | Job Queue ARN | Lambda |
| Batch (Definition) | `codec-converter-batch-job-definition-arn-{env}` | Job Definition ARN | Lambda |
| Lambda | `codec-converter-lambda-function-url-{env}` | Lambda Function URL | CloudFront |

**Import する方法**:

依存スタックのテンプレートで `Fn::ImportValue` を使用:

```yaml
# Lambda スタックの例
Environment:
  Variables:
    S3_BUCKET: !ImportValue codec-converter-s3-bucket-name-dev
    DYNAMODB_TABLE: !ImportValue codec-converter-dynamodb-table-name-dev
    BATCH_JOB_QUEUE: !ImportValue codec-converter-batch-queue-arn-dev
    BATCH_JOB_DEFINITION: !ImportValue codec-converter-batch-job-definition-arn-dev
```

**注意事項**:
- Export 名は AWS アカウント・リージョン内で一意である必要がある
- Export している値を削除するには、先に Import している全スタックを削除する必要がある

---

## 環境変数

各スタックで使用する環境変数:

| 環境変数 | 説明 | 例 |
|---------|------|---|
| `ENV` | 環境名 | `dev`, `prod` |
| `AWS_REGION` | AWS リージョン | `ap-northeast-1` |
| `DOMAIN_NAME` | カスタムドメイン | `codec-converter.example.com` |
| `ACM_CERTIFICATE_ARN` | ACM 証明書 ARN | `arn:aws:acm:us-east-1:...` |

---

## リソース詳細

### 1. ECR リポジトリ

**スタック名**:
- `codec-converter-ecr-{env}`

**リソース**:
- `repositories.yaml`: Next.js と FFmpeg 用の ECR リポジトリ（両方を1つのテンプレートで管理）

**設定**:
- リポジトリ名:
    - `codec-converter-nextjs-{env}`
    - `codec-converter-ffmpeg-{env}`
- イメージスキャン: 有効
- タグイミュータビリティ: 無効
- ライフサイクルポリシー: 最新10イメージのみ保持

### 2. IAM ロール

**スタック名**:
- `codec-converter-iam-lambda-{env}`
- `codec-converter-iam-batch-job-{env}`
- `codec-converter-iam-batch-execution-{env}`

**リソース**:
- `lambda-role.yaml`: Lambda 実行ロール
    - S3 読み書き権限
    - DynamoDB 読み書き権限
    - Batch ジョブ投入権限
    - CloudWatch Logs 書き込み権限
- `batch-job-role.yaml`: Batch ジョブ実行ロール
    - S3 読み書き権限
    - DynamoDB 読み書き権限
    - CloudWatch Logs 書き込み権限
- `batch-execution-role.yaml`: Batch タスク実行ロール
    - ECR イメージ取得権限

### 3. S3 バケット

**スタック名**: `codec-converter-s3-{env}`

**リソース**:
- `storage-bucket.yaml`: 動画ファイルストレージ

**設定**:
- バケット名: `codec-converter-{env}-{account-id}`
- 暗号化: SSE-S3
- バージョニング: 無効
- パブリックアクセス: ブロック
- CORS: ブラウザからのアップロードを許可（環境ごとに AllowedOrigins を設定）
    - dev: `http://localhost:3000`, `https://dev-codec-converter.example.com`
    - prod: `https://codec-converter.example.com`
- ライフサイクルポリシー: 24時間後に自動削除

### 4. DynamoDB テーブル

**スタック名**: `codec-converter-dynamodb-{env}`

**リソース**:
- `jobs-table.yaml`: ジョブ管理テーブル

**設定**:
- テーブル名: `codec-converter-jobs-{env}`
- 主キー: `jobId` (String)
- TTL: `expiresAt` 属性（ジョブ作成時に `createdAt + 86400` を設定）
- 課金モード: オンデマンド
- 暗号化: AWS マネージド

### 5. AWS Batch

**スタック名**:
- `codec-converter-batch-log-{env}`
- `codec-converter-batch-compute-{env}`
- `codec-converter-batch-queue-{env}`
- `codec-converter-batch-job-{env}`

**リソース**:
- `log-group.yaml`: CloudWatch Logs ロググループ
    - ロググループ名: `/aws/batch/codec-converter-{env}`
    - 保持期間: 7日間
- `compute-environment.yaml`: Fargate コンピューティング環境
    - タイプ: Fargate
    - 最大 vCPU: 6 (3ジョブ × 2 vCPU)
- `job-queue.yaml`: ジョブキュー
    - 優先度: 1
- `job-definition.yaml`: ジョブ定義
    - プラットフォーム: Fargate
    - vCPU: 2
    - メモリ: 4096 MB
    - タイムアウト: 7200秒 (2時間)
    - コンテナイメージ: ECR の FFmpeg イメージ

**環境変数（静的、Job Definition に設定）**:
- `S3_BUCKET`: S3 バケット名
- `DYNAMODB_TABLE`: DynamoDB テーブル名
- `AWS_REGION`: AWS リージョン

**環境変数（動的、SubmitJob API で渡す）**:
- `JOB_ID`: ジョブ ID（UUID）
- `OUTPUT_CODEC`: 出力コーデック（h264, vp9, av1）

### 6. Lambda 関数

**スタック名**: `codec-converter-lambda-{env}`

**リソース**:
- `nextjs-function.yaml`: Next.js アプリケーション

**設定**:
- 関数名: `codec-converter-nextjs-{env}`
- パッケージタイプ: イメージ
- メモリ: 512 MB
- タイムアウト: 30秒
- Function URL: 有効 (認証なし)
- 環境変数:
    - `S3_BUCKET`: S3 バケット名
    - `DYNAMODB_TABLE`: DynamoDB テーブル名
    - `BATCH_JOB_QUEUE`: Batch ジョブキュー名
    - `BATCH_JOB_DEFINITION`: Batch ジョブ定義名
    - `AWS_REGION`: AWS リージョン

### 7. CloudFront Distribution

**スタック名**: `codec-converter-cloudfront-{env}`

**リソース**:
- `distribution.yaml`: CloudFront ディストリビューション

**設定**:
- オリジン: Lambda Function URL
- カスタムドメイン: `codec-converter.{env}.example.com`
- SSL/TLS 証明書: ACM (共通インフラ)
- 圧縮: 有効
- HTTP → HTTPS リダイレクト: 有効

**キャッシュ動作**:
- `/_next/static/*` (Next.js 静的アセット):
    - キャッシュポリシー: Managed-CachingOptimized (長期キャッシュ、1年)
    - 説明: ビルドごとにハッシュが変わるため、長期キャッシュでも更新に問題なし
    - クエリ文字列: すべて転送
- その他 (`/*`):
    - キャッシュポリシー: CachingDisabled (キャッシュなし)
    - 説明: SSR ページと API エンドポイント、リアルタイム性を優先
    - オリジンリクエストポリシー: AllViewerExceptHostHeader

---

## デプロイ手順

### 前提条件

- AWS CLI インストール済み
- Docker インストール済み
- 共通インフラ (VPC, ACM) がデプロイ済み
- 適切な IAM 権限を持つ AWS プロファイル設定済み

### 1. 初回デプロイ

#### 1-1. ECR リポジトリ作成

```bash
cd infra/codec-converter/ecr
aws cloudformation deploy \
  --template-file repositories.yaml \
  --stack-name codec-converter-ecr-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```
```

#### 1-2. コンテナイメージビルド & プッシュ

**Next.js イメージ**:

```bash
cd apps/codec-converter

# ECR ログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com

# ビルド
docker build -t codec-converter-nextjs:latest .

# タグ付け
docker tag codec-converter-nextjs:latest \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-nextjs-dev:latest

# プッシュ
docker push {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-nextjs-dev:latest
```

**FFmpeg イメージ**:

```bash
cd apps/codec-converter/batch

# ビルド
docker build -t codec-converter-ffmpeg:latest .

# タグ付け
docker tag codec-converter-ffmpeg:latest \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest

# プッシュ
docker push {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest
```

#### 1-3. IAM ロール作成

**Lambda 実行ロール**:

```bash
cd infra/codec-converter/iam
aws cloudformation deploy \
  --template-file lambda-role.yaml \
  --stack-name codec-converter-iam-lambda-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1
```

**Batch ジョブ実行ロール**:

```bash
aws cloudformation deploy \
  --template-file batch-job-role.yaml \
  --stack-name codec-converter-iam-batch-job-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1
```

**Batch タスク実行ロール**:

```bash
aws cloudformation deploy \
  --template-file batch-execution-role.yaml \
  --stack-name codec-converter-iam-batch-execution-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1
```

#### 1-4. S3 バケット作成

```bash
cd infra/codec-converter/s3
aws cloudformation deploy \
  --template-file storage-bucket.yaml \
  --stack-name codec-converter-s3-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

#### 1-5. DynamoDB テーブル作成

```bash
cd infra/codec-converter/dynamodb
aws cloudformation deploy \
  --template-file jobs-table.yaml \
  --stack-name codec-converter-dynamodb-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

#### 1-6. Batch リソース作成

**CloudWatch Logs ロググループ**:

```bash
cd infra/codec-converter/batch
aws cloudformation deploy \
  --template-file log-group.yaml \
  --stack-name codec-converter-batch-log-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

**Compute Environment**:

```bash
aws cloudformation deploy \
  --template-file compute-environment.yaml \
  --stack-name codec-converter-batch-compute-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

**Job Queue**:

```bash
aws cloudformation deploy \
  --template-file job-queue.yaml \
  --stack-name codec-converter-batch-queue-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

**Job Definition**:

```bash
aws cloudformation deploy \
  --template-file job-definition.yaml \
  --stack-name codec-converter-batch-job-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

**注意**: Job Definition には静的な環境変数（`S3_BUCKET`, `DYNAMODB_TABLE`, `AWS_REGION`）のみを設定します。動的な環境変数（`JOB_ID`, `OUTPUT_CODEC`）は、Lambda が `SubmitJob` API を呼び出す際に `containerOverrides.environment` で渡します。

#### 1-7. Lambda 関数作成

```bash
cd infra/codec-converter/lambda
aws cloudformation deploy \
  --template-file nextjs-function.yaml \
  --stack-name codec-converter-lambda-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

#### 1-8. CloudFront Distribution 作成

```bash
cd infra/codec-converter/cloudfront
aws cloudformation deploy \
  --template-file distribution.yaml \
  --stack-name codec-converter-cloudfront-dev \
  --parameter-overrides \
    Environment=dev \
    DomainName=codec-converter.dev.example.com \
    AcmCertificateArn=arn:aws:acm:us-east-1:... \
  --region us-east-1
```

### 2. アプリケーション更新

アプリケーションコードを更新した場合:

```bash
# 1. イメージビルド & プッシュ (上記と同じ)
# 2. Lambda 関数更新
aws lambda update-function-code \
  --function-name codec-converter-nextjs-dev \
  --image-uri {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-nextjs-dev:latest \
  --region ap-northeast-1
```

### 3. インフラ更新

CloudFormation テンプレートを変更した場合:

```bash
# 該当スタックを再デプロイ
cd infra/codec-converter/{component}
aws cloudformation deploy \
  --template-file {specific-file}.yaml \
  --stack-name codec-converter-{component}-{resource}-dev \
  --parameter-overrides Environment=dev \
  --region ap-northeast-1
```

---

## モニタリング

### CloudWatch Logs

- **Lambda**: `/aws/lambda/codec-converter-nextjs-{env}`
- **Batch**: `/aws/batch/job`

### CloudWatch メトリクス

- **Lambda**:
    - Invocations
    - Errors
    - Duration
    - Throttles
- **Batch**:
    - JobsSubmitted
    - JobsRunning
    - JobsSucceeded
    - JobsFailed

---

## トラブルシューティング

### Lambda がタイムアウトする

- Lambda のタイムアウト設定を確認 (デフォルト: 30秒)
- CloudWatch Logs でエラー内容を確認

### Batch ジョブが失敗する

- CloudWatch Logs でコンテナログを確認
- S3 アクセス権限を確認
- FFmpeg コマンドが正しいか確認

### アップロード/ダウンロードができない

- Presigned URL の有効期限を確認
- S3 CORS 設定を確認
- ブラウザの開発者ツールでエラー内容を確認

---

## コスト試算

**月間想定**: 100 ジョブ/月、平均動画サイズ 250MB、平均変換時間 10分

| サービス | 使用量 | 月額コスト (USD) |
|---------|-------|----------------|
| Lambda | 100 リクエスト × 5秒 | $0.00 (無料枠内) |
| S3 | 25GB ストレージ (24時間保持) | $0.58 |
| DynamoDB | 100 読み込み + 200 書き込み | $0.00 (無料枠内) |
| Batch (Fargate) | 100 ジョブ × 10分 × 2 vCPU × 4GB | $8.00 |
| CloudFront | 100 リクエスト + 25GB 転送 | $2.50 |
| **合計** | | **約 $11/月** |

**注意**: 実際のコストは使用量により変動します。

---

## セキュリティ

### IAM ロール

- 最小権限の原則に従う
- サービス固有のロールを使用
- クロスアカウントアクセスは不可

### S3 バケット

- パブリックアクセスをブロック
- Presigned URL のみでアクセス
- CORS は必要最小限のオリジンのみ許可

### Lambda 関数

- VPC 内に配置 (Phase 2 で検討)
- 環境変数で機密情報を管理
- Function URL は認証なし (匿名アクセス)

---

## 関連ドキュメント

- [要件定義](../requirements.md)
- [アーキテクチャ](../architecture.md)
- [API 仕様](../api-spec.md)
- [共通インフラ](../../../infra/README.md)
# Codec Converter Worker

AWS Batch で実行される動画変換ワーカー。FFmpeg を使用して動画ファイルのコーデック変換を行います。

## 概要

このワーカーは AWS Batch 上で実行され、以下の処理を行います：

1. DynamoDB のジョブステータスを `PROCESSING` に更新
2. S3 から入力ファイル（MP4）をダウンロード
3. FFmpeg で指定されたコーデックに変換
4. 変換後のファイルを S3 にアップロード
5. DynamoDB のジョブステータスを `COMPLETED` または `FAILED` に更新

## 技術スタック

- **ベースイメージ**: Node.js 22 (Debian Bullseye)
- **プログラミング言語**: TypeScript
- **動画処理**: FFmpeg 
- **AWS SDK**: @aws-sdk/client-s3, @aws-sdk/client-dynamodb

## サポートコーデック

| コーデック | 出力フォーマット | 設定 |
|----------|--------------|------|
| H.264 | MP4 | `-preset medium -crf 23` (ビデオ), `-c:a aac -b:a 128k` (音声) |
| VP9 | WebM | `-crf 30 -b:v 0` (ビデオ), `-c:a libopus -b:a 128k` (音声) |
| AV1 | WebM | `-crf 30 -b:v 0 -cpu-used 4` (ビデオ), `-c:a libopus -b:a 128k` (音声) |

## 環境変数

ワーカーは以下の環境変数を必要とします：

### 静的環境変数（Job Definition に設定）

- `S3_BUCKET`: S3 バケット名
- `DYNAMODB_TABLE`: DynamoDB テーブル名
- `AWS_REGION`: AWS リージョン（例: `ap-northeast-1`）

### 動的環境変数（SubmitJob API で渡される）

- `JOB_ID`: ジョブ ID（UUID）
- `OUTPUT_CODEC`: 出力コーデック（`h264`, `vp9`, `av1`）

### オプション環境変数

- `WORK_DIR`: 作業ディレクトリ（デフォルト: `/tmp/worker`）

## ディレクトリ構造

```
codec-converter-worker/
├── Dockerfile           # コンテナイメージ定義
├── package.json         # Node.js 依存関係
├── tsconfig.json        # TypeScript 設定
├── entrypoint.sh        # エントリポイントスクリプト
├── src/
│   └── index.ts        # ワーカーメイン処理
└── README.md           # このファイル
```

## ビルド方法

### ローカルビルド

```bash
cd services/codec-converter-worker
docker build -t codec-converter-worker:latest .
```

### ECR へのプッシュ

```bash
# ECR ログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージをタグ付け
docker tag codec-converter-worker:latest \
  {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest

# プッシュ
docker push {account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest
```

## ローカルテスト

環境変数を設定してローカルでテストできます：

```bash
# 環境変数を設定
export JOB_ID="test-job-123"
export OUTPUT_CODEC="h264"
export S3_BUCKET="your-bucket-name"
export DYNAMODB_TABLE="your-table-name"
export AWS_REGION="ap-northeast-1"

# Docker コンテナを起動
docker run --rm \
  -e JOB_ID \
  -e OUTPUT_CODEC \
  -e S3_BUCKET \
  -e DYNAMODB_TABLE \
  -e AWS_REGION \
  -e AWS_ACCESS_KEY_ID \
  -e AWS_SECRET_ACCESS_KEY \
  codec-converter-worker:latest
```

## AWS Batch 設定

### Job Definition の環境変数設定例

```json
{
  "containerProperties": {
    "image": "{account-id}.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest",
    "vcpus": 2,
    "memory": 4096,
    "jobRoleArn": "arn:aws:iam::{account-id}:role/codec-converter-batch-job-role",
    "executionRoleArn": "arn:aws:iam::{account-id}:role/codec-converter-batch-execution-role",
    "environment": [
      {
        "name": "S3_BUCKET",
        "value": "codec-converter-dev"
      },
      {
        "name": "DYNAMODB_TABLE",
        "value": "codec-converter-jobs-dev"
      },
      {
        "name": "AWS_REGION",
        "value": "ap-northeast-1"
      }
    ]
  },
  "timeout": {
    "attemptDurationSeconds": 7200
  }
}
```

### SubmitJob API での動的環境変数の渡し方

```typescript
import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

const batchClient = new BatchClient({ region: 'ap-northeast-1' });

await batchClient.send(
  new SubmitJobCommand({
    jobName: `codec-conversion-${jobId}`,
    jobQueue: 'codec-converter-queue-dev',
    jobDefinition: 'codec-converter-job-dev',
    containerOverrides: {
      environment: [
        { name: 'JOB_ID', value: jobId },
        { name: 'OUTPUT_CODEC', value: 'vp9' },
      ],
    },
  })
);
```

## セキュリティ

- **非ルートユーザー**: コンテナは `worker` ユーザー（UID 1001）で実行されます
- **最小権限**: IAM ロールは必要最小限の権限のみを付与
- **依存関係**: 本番環境では `npm ci --only=production` で必要な依存のみインストール

## トラブルシューティング

### FFmpeg エラー

CloudWatch Logs でエラーログを確認してください：

```bash
aws logs tail /aws/batch/job --follow
```

### S3 アクセスエラー

IAM ロールに S3 バケットへのアクセス権限があるか確認してください。

### DynamoDB エラー

IAM ロールに DynamoDB テーブルへの読み書き権限があるか確認してください。

## 関連ドキュメント

- [アーキテクチャ](../../docs/apps/codec-converter/architecture.md)
- [インフラ概要](../../docs/apps/codec-converter/infra/README.md)
- [API 仕様](../../docs/apps/codec-converter/api-spec.md)

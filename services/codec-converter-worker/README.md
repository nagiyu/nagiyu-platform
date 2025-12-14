# Codec Converter Worker

AWS Batch ワーカーコンテナ — FFmpeg を使用した動画コーデック変換

## 概要

このワーカーは AWS Batch 上で動作し、S3 にアップロードされた動画ファイルを FFmpeg を使用して指定されたコーデックに変換します。

## 機能

- **サポートされるコーデック**:
  - H.264 (MP4) - `libx264`
  - VP9 (WebM) - `libvpx-vp9`
  - AV1 (WebM) - `libaom-av1`

- **処理フロー**:
  1. DynamoDB のジョブステータスを `PROCESSING` に更新
  2. S3 から入力ファイルをダウンロード
  3. FFmpeg でコーデック変換を実行
  4. S3 へ出力ファイルをアップロード
  5. DynamoDB のジョブステータスを `COMPLETED` に更新
  6. エラー時は `FAILED` に更新し、エラーメッセージを記録

## 技術スタック

- **ベースイメージ**: `jrottenberg/ffmpeg:6.1-alpine`
- **ランタイム**: Python 3 (AWS SDK)
- **FFmpeg バージョン**: 6.1
- **OS**: Alpine Linux (軽量)

## ビルド

```bash
# ローカルビルド
docker build -t codec-converter-worker:local .

# タグ付け (ECR へのプッシュ用)
docker tag codec-converter-worker:local <AWS_ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/codec-converter-worker:latest
```

## 環境変数

### 必須環境変数

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `JOB_ID` | ジョブ ID (UUID) | `550e8400-e29b-41d4-a716-446655440000` |
| `OUTPUT_CODEC` | 出力コーデック | `h264`, `vp9`, `av1` |
| `S3_BUCKET` | S3 バケット名 | `codec-converter-dev` |
| `DYNAMODB_TABLE` | DynamoDB テーブル名 | `codec-converter-jobs-dev` |
| `AWS_REGION` | AWS リージョン | `ap-northeast-1` |

### AWS 認証情報

AWS Batch の Task Role によって自動的に提供されます。ローカルテスト時は AWS CLI の認証情報を使用します。

## ローカルテスト

```bash
# ローカルで実行（テスト用）
docker run --rm \
  -e JOB_ID=test-job-123 \
  -e OUTPUT_CODEC=h264 \
  -e S3_BUCKET=your-test-bucket \
  -e DYNAMODB_TABLE=codec-converter-jobs-dev \
  -e AWS_REGION=ap-northeast-1 \
  -e AWS_ACCESS_KEY_ID=your-access-key \
  -e AWS_SECRET_ACCESS_KEY=your-secret-key \
  codec-converter-worker:local
```

**注意**: ローカルテストには有効な AWS 認証情報と、事前に S3 にアップロードされた入力ファイルが必要です。

## FFmpeg エンコーディング設定

### H.264 (MP4)

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  -y output.mp4
```

- **プリセット**: `medium` (バランスの取れた品質と速度)
- **CRF**: 23 (視覚的に透明な品質)
- **音声**: AAC 128kbps

### VP9 (WebM)

```bash
ffmpeg -i input.mp4 \
  -c:v libvpx-vp9 -crf 30 -b:v 0 \
  -c:a libopus -b:a 128k \
  -y output.webm
```

- **CRF**: 30 (H.264 の CRF 23 と同等の品質)
- **ビットレート**: 0 (品質ベースモード)
- **音声**: Opus 128kbps

### AV1 (WebM)

```bash
ffmpeg -i input.mp4 \
  -c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 \
  -c:a libopus -b:a 128k \
  -y output.webm
```

- **CRF**: 30 (品質設定)
- **cpu-used**: 4 (中程度の速度設定、0=最遅/最高品質, 8=最速/最低品質)
- **音声**: Opus 128kbps

## S3 ファイル構造

```
s3://codec-converter-{env}/
├── uploads/
│   └── {jobId}/
│       └── input.mp4
└── outputs/
    └── {jobId}/
        └── output.{mp4|webm}
```

## セキュリティ

- **非 root ユーザー**: コンテナは `worker` ユーザー (UID: 1001) として実行
- **最小権限**: Python の仮想環境を使用し、必要な依存関係のみインストール
- **Alpine Linux**: 軽量で脆弱性が少ない OS ベース

## AWS Batch 設定

### Job Definition (例)

```json
{
  "jobDefinitionName": "codec-converter-worker",
  "type": "container",
  "platformCapabilities": ["FARGATE"],
  "containerProperties": {
    "image": "<ECR_URI>:latest",
    "resourceRequirements": [
      {"type": "VCPU", "value": "2"},
      {"type": "MEMORY", "value": "4096"}
    ],
    "executionRoleArn": "arn:aws:iam::...:role/BatchExecutionRole",
    "jobRoleArn": "arn:aws:iam::...:role/BatchJobRole",
    "environment": [
      {"name": "S3_BUCKET", "value": "codec-converter-prod"},
      {"name": "DYNAMODB_TABLE", "value": "codec-converter-jobs-prod"},
      {"name": "AWS_REGION", "value": "ap-northeast-1"}
    ]
  },
  "timeout": {
    "attemptDurationSeconds": 7200
  }
}
```

### 必要な IAM ポリシー (Job Role)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::codec-converter-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:UpdateItem",
        "dynamodb:GetItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/codec-converter-jobs-*"
    }
  ]
}
```

## トラブルシューティング

### ログの確認

AWS Batch ジョブのログは CloudWatch Logs に自動的に送信されます:

```
/aws/batch/job
```

### よくある問題

1. **S3 ダウンロード失敗**
   - IAM ロールに S3 の読み取り権限があるか確認
   - S3 バケット名とキーが正しいか確認

2. **FFmpeg エラー**
   - 入力ファイルが破損していないか確認
   - サポートされていないコーデックでないか確認

3. **DynamoDB 更新失敗**
   - IAM ロールに DynamoDB の書き込み権限があるか確認
   - テーブル名が正しいか確認

## 依存関係

- Python パッケージ:
  - `boto3==1.35.76` - AWS SDK for Python
  - `botocore==1.35.76` - AWS SDK コア

## パフォーマンス

- **リソース要件**: 
  - vCPU: 2 (推奨)
  - メモリ: 4GB (推奨)
  - タイムアウト: 2時間 (7200秒)

- **処理時間の目安** (500MB の動画):
  - H.264: 10-20分
  - VP9: 20-40分
  - AV1: 40-80分

**注意**: 実際の処理時間は動画の長さ、解像度、ビットレートに大きく依存します。

## 開発

### ローカル開発環境

```bash
# Dev Container を使用する場合
code --folder-uri vscode-remote://dev-container+...
```

### コードの変更後

```bash
# 再ビルド
docker build -t codec-converter-worker:local .

# テスト実行
docker run --rm codec-converter-worker:local
```

## 関連ドキュメント

- [アーキテクチャドキュメント](../../docs/apps/codec-converter/architecture.md)
- [API 仕様](../../docs/apps/codec-converter/api-spec.md)
- [Spec 002: Codec Converter](../../specs/002-add-codec-converter/)

## ライセンス

このプロジェクトは Apache License 2.0 または MIT License のデュアルライセンスです。

# @nagiyu/codec-converter-common

共通ライブラリ for codec-converter サービス

## 概要

このライブラリは、codec-converter サービスで使用される共通機能を提供します。

### 提供機能

- **S3Helper**: S3 操作のヘルパークラス
  - アップロード用 Presigned URL の生成
  - ダウンロード用 Presigned URL の生成
  
- **DynamoDBHelper**: DynamoDB 操作のヘルパークラス
  - ジョブの作成・取得・更新・削除
  - ジョブステータスの更新

## インストール

このライブラリは、monorepo のワークスペースとして管理されています。

```bash
npm install
```

## ビルド

```bash
npm run build
```

## 使用例

### S3Helper

```typescript
import { S3Helper } from '@nagiyu/codec-converter-common';

const s3 = new S3Helper('my-bucket', 'us-east-1');

// アップロード用 Presigned URL を生成
const uploadUrl = await s3.getUploadPresignedUrl('uploads/job-id/input.mp4');

// ダウンロード用 Presigned URL を生成
const downloadUrl = await s3.getDownloadPresignedUrl('outputs/job-id/output.mp4');
```

### DynamoDBHelper

```typescript
import { DynamoDBHelper, JobStatus, Job } from '@nagiyu/codec-converter-common';

const db = new DynamoDBHelper('codec-converter-jobs-dev', 'us-east-1');

// ジョブを作成
const job: Job = {
  jobId: 'uuid-v4',
  status: JobStatus.PENDING,
  inputFile: 'uploads/uuid-v4/input.mp4',
  outputCodec: 'h264',
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + 86400, // 24時間後
  fileName: 'video.mp4',
  fileSize: 1024000,
};

await db.putJob(job);

// ジョブを取得
const retrievedJob = await db.getJob('uuid-v4');

// ジョブステータスを更新
await db.updateJobStatus('uuid-v4', JobStatus.PROCESSING);

// エラーを記録してステータスを更新
await db.updateJobStatus('uuid-v4', JobStatus.FAILED, 'FFmpeg error');
```

## 開発

### フォーマット

```bash
npm run format
```

### Lint

```bash
npm run lint
```

## 依存関係

- `@aws-sdk/client-s3`: S3 クライアント
- `@aws-sdk/client-dynamodb`: DynamoDB クライアント
- `@aws-sdk/lib-dynamodb`: DynamoDB ドキュメントクライアント
- `@aws-sdk/s3-request-presigner`: S3 Presigned URL 生成

## ライセンス

Private

# @nagiyu-platform/codec-converter-common

Codec Converter サービスの共有パッケージ。Next.js Lambda と Batch Worker で共通して使用する TypeScript 型定義、定数、バリデーション関数を提供します。

## 機能

### TypeScript 型定義

- `Job`: ジョブ情報の型定義
- `JobStatus`: ジョブステータス (`PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`)
- `CodecType`: コーデックタイプ (`h264` | `vp9` | `av1`)

### 定数

- `MAX_FILE_SIZE`: ファイルサイズ上限 (500MB)
- `CONVERSION_TIMEOUT_SECONDS`: 変換処理タイムアウト (7200秒 = 2時間)
- `JOB_EXPIRATION_SECONDS`: ジョブの有効期限 (86400秒 = 24時間)
- `ALLOWED_MIME_TYPES`: 許可されるMIMEタイプ
- `ALLOWED_FILE_EXTENSIONS`: 許可されるファイル拡張子
- `CODEC_FILE_EXTENSIONS`: コーデックごとの出力ファイル拡張子

### バリデーション関数

- `validateFileSize(fileSize: number)`: ファイルサイズのバリデーション
- `validateMimeType(mimeType: string)`: MIMEタイプのバリデーション
- `validateFileExtension(fileName: string)`: ファイル拡張子のバリデーション
- `validateFile(fileName, fileSize, mimeType)`: ファイルの総合バリデーション

## 使用例

```typescript
import {
  Job,
  JobStatus,
  CodecType,
  MAX_FILE_SIZE,
  validateFile,
} from '@nagiyu-platform/codec-converter-common';

// 型定義の使用
const job: Job = {
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  status: 'PENDING',
  inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
  outputCodec: 'h264',
  fileName: 'sample.mp4',
  fileSize: 52428800,
  createdAt: Date.now() / 1000,
  updatedAt: Date.now() / 1000,
  expiresAt: Date.now() / 1000 + 86400,
};

// バリデーションの使用
const result = validateFile('video.mp4', 100 * 1024 * 1024, 'video/mp4');
if (!result.isValid) {
  console.error(result.errorMessage);
}

// 定数の使用
console.log(`最大ファイルサイズ: ${MAX_FILE_SIZE} bytes`);
```

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test
```

### カバレッジ

```bash
npm run test:coverage
```

### リント

```bash
npm run lint
```

### フォーマット

```bash
npm run format
```

## ライセンス

このパッケージは nagiyu-platform モノレポの一部です。

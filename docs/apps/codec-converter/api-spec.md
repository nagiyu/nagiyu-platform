# Codec Converter - API 仕様書

本ドキュメントは、Codec Converter サービスの API 仕様を説明します。

---

## 概要

**ベース URL**: `https://codec-converter.example.com/api`

**認証**: なし (匿名アクセス)

**Content-Type**: `application/json`

---

## エンドポイント一覧

| エンドポイント | メソッド | 説明 |
|-------------|---------|------|
| `/jobs` | POST | 新規ジョブ作成、Presigned URL 生成 |
| `/jobs/:jobId` | GET | ジョブステータス取得 |
| `/jobs/:jobId/submit` | POST | Batch ジョブ投入 |
| `/jobs/:jobId/download` | GET | ダウンロード用 Presigned URL 生成 |

---

## エンドポイント詳細

### 1. 新規ジョブ作成

新規ジョブを作成し、アップロード用の Presigned URL を生成します。

**エンドポイント**: `POST /api/jobs`

**リクエスト**:

```json
{
  "outputCodec": "h264|vp9|av1",
  "fileName": "sample.mp4"
}
```

**リクエストパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|----------|---|------|------|
| `outputCodec` | string | ✓ | 出力コーデック (`h264`, `vp9`, `av1`) |
| `fileName` | string | ✓ | アップロードするファイル名 (例: `sample.mp4`) |

**レスポンス** (200 OK):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://s3.amazonaws.com/codec-converter-dev/uploads/...",
  "expiresIn": 3600
}
```

**レスポンスフィールド**:

| フィールド | 型 | 説明 |
|----------|---|------|
| `jobId` | string | ジョブ ID (UUID v4) |
| `uploadUrl` | string | S3 アップロード用 Presigned URL |
| `expiresIn` | number | Presigned URL の有効期限 (秒) |

**エラーレスポンス**:

| ステータスコード | 説明 | レスポンス例 |
|---------------|------|-------------|
| 400 Bad Request | パラメータ不正 | `{"error": "Invalid codec"}` |
| 500 Internal Server Error | サーバーエラー | `{"error": "Internal server error"}` |

**サンプルリクエスト**:

```bash
curl -X POST https://codec-converter.example.com/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "outputCodec": "vp9",
    "fileName": "sample.mp4"
  }'
```

---

### 2. ジョブステータス取得

ジョブのステータスと詳細情報を取得します。

**エンドポイント**: `GET /api/jobs/:jobId`

**パスパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|----------|---|------|------|
| `jobId` | string | ✓ | ジョブ ID (UUID) |

**レスポンス** (200 OK):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING|PROCESSING|COMPLETED|FAILED",
  "inputFile": "uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4",
  "outputFile": "outputs/550e8400-e29b-41d4-a716-446655440000/output.webm",
  "outputCodec": "vp9",
  "createdAt": 1702468800,
  "updatedAt": 1702469100,
  "expiresAt": 1702555200,
  "errorMessage": null
}
```

**レスポンスフィールド**:

| フィールド | 型 | 説明 |
|----------|---|------|
| `jobId` | string | ジョブ ID |
| `status` | string | ジョブステータス (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) |
| `inputFile` | string | 入力ファイルの S3 キー |
| `outputFile` | string | 出力ファイルの S3 キー (完了時のみ) |
| `outputCodec` | string | 出力コーデック |
| `createdAt` | number | 作成日時 (Unix タイムスタンプ) |
| `updatedAt` | number | 更新日時 (Unix タイムスタンプ) |
| `expiresAt` | number | 期限日時 (Unix タイムスタンプ、24時間後) |
| `errorMessage` | string \| null | エラーメッセージ (失敗時のみ) |

**ステータス詳細**:

| ステータス | 説明 |
|----------|------|
| `PENDING` | ジョブが作成され、処理待ち |
| `PROCESSING` | 変換処理中 |
| `COMPLETED` | 変換完了、ダウンロード可能 |
| `FAILED` | 変換失敗 |

**エラーレスポンス**:

| ステータスコード | 説明 | レスポンス例 |
|---------------|------|-------------|
| 404 Not Found | ジョブが見つからない | `{"error": "Job not found"}` |
| 500 Internal Server Error | サーバーエラー | `{"error": "Internal server error"}` |

**サンプルリクエスト**:

```bash
curl -X GET https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

---

### 3. Batch ジョブ投入

アップロード完了後、AWS Batch ジョブを投入して変換処理を開始します。

**エンドポイント**: `POST /api/jobs/:jobId/submit`

**パスパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|----------|---|------|------|
| `jobId` | string | ✓ | ジョブ ID (UUID) |

**リクエスト**:

```json
{}
```

**レスポンス** (200 OK):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "batchJobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**レスポンスフィールド**:

| フィールド | 型 | 説明 |
|----------|---|------|
| `jobId` | string | ジョブ ID |
| `status` | string | ジョブステータス (投入後は `PENDING`) |
| `batchJobId` | string | AWS Batch ジョブ ID |

**エラーレスポンス**:

| ステータスコード | 説明 | レスポンス例 |
|---------------|------|-------------|
| 404 Not Found | ジョブが見つからない | `{"error": "Job not found"}` |
| 409 Conflict | ジョブが既に投入済み | `{"error": "Job already submitted"}` |
| 500 Internal Server Error | サーバーエラー | `{"error": "Internal server error"}` |

**サンプルリクエスト**:

```bash
curl -X POST https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/submit \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

### 4. ダウンロード用 Presigned URL 生成

変換完了後、ダウンロード用の Presigned URL を生成します。

**エンドポイント**: `GET /api/jobs/:jobId/download`

**パスパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|----------|---|------|------|
| `jobId` | string | ✓ | ジョブ ID (UUID) |

**レスポンス** (200 OK):

```json
{
  "downloadUrl": "https://s3.amazonaws.com/codec-converter-dev/outputs/...",
  "expiresIn": 86400,
  "fileName": "output.webm"
}
```

**レスポンスフィールド**:

| フィールド | 型 | 説明 |
|----------|---|------|
| `downloadUrl` | string | S3 ダウンロード用 Presigned URL |
| `expiresIn` | number | Presigned URL の有効期限 (秒、24時間) |
| `fileName` | string | 出力ファイル名 |

**エラーレスポンス**:

| ステータスコード | 説明 | レスポンス例 |
|---------------|------|-------------|
| 404 Not Found | ジョブが見つからない | `{"error": "Job not found"}` |
| 409 Conflict | ジョブが未完了 | `{"error": "Job not completed"}` |
| 500 Internal Server Error | サーバーエラー | `{"error": "Internal server error"}` |

**サンプルリクエスト**:

```bash
curl -X GET https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/download
```

---

## データモデル

### Job オブジェクト

```typescript
interface Job {
  jobId: string;                    // UUID v4
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  inputFile: string;                // S3 キー (例: "uploads/{jobId}/input.mp4")
  outputFile?: string;              // S3 キー (例: "outputs/{jobId}/output.webm")
  outputCodec: 'h264' | 'vp9' | 'av1';
  createdAt: number;                // Unix タイムスタンプ
  updatedAt: number;                // Unix タイムスタンプ
  expiresAt: number;                // Unix タイムスタンプ (24時間後)
  errorMessage?: string;            // エラーメッセージ (失敗時)
}
```

---

## エラーハンドリング

### エラーレスポンス形式

すべてのエラーレスポンスは以下の形式で返されます:

```json
{
  "error": "Error message"
}
```

### 一般的なエラーコード

| ステータスコード | 説明 |
|---------------|------|
| 400 Bad Request | リクエストパラメータが不正 |
| 404 Not Found | リソースが見つからない |
| 409 Conflict | リソースの状態が不正 (例: 既に投入済み) |
| 500 Internal Server Error | サーバー内部エラー |

---

## レート制限

現在、レート制限は設定されていません (Phase 1)。

Phase 2 以降で以下の制限を検討:
- IP あたり: 100 リクエスト/分
- ジョブ作成: 10 ジョブ/時間

---

## バリデーション

### 入力ファイル

- **ファイル形式**: `.mp4` のみ
- **ファイルサイズ**: 最大 500MB
- **コーデック**: MP4 でサポートされているすべてのコーデック (H.264, H.265, など)

### 出力コーデック

| コーデック | 出力形式 | 説明 |
|----------|---------|------|
| `h264` | MP4 | H.264 (AVC) |
| `vp9` | WebM | VP9 |
| `av1` | WebM | AV1 |

---

## 使用例

### フルフロー

#### 1. ジョブ作成

```bash
curl -X POST https://codec-converter.example.com/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "outputCodec": "vp9",
    "fileName": "sample.mp4"
  }'
```

レスポンス:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "uploadUrl": "https://s3.amazonaws.com/...",
  "expiresIn": 3600
}
```

#### 2. S3 へアップロード

```bash
curl -X PUT "https://s3.amazonaws.com/..." \
  --upload-file sample.mp4 \
  -H "Content-Type: video/mp4"
```

#### 3. Batch ジョブ投入

```bash
curl -X POST https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/submit \
  -H "Content-Type: application/json" \
  -d '{}'
```

レスポンス:

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "batchJobId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

#### 4. ステータスポーリング

```bash
curl -X GET https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

レスポンス (処理中):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PROCESSING",
  ...
}
```

レスポンス (完了):

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "COMPLETED",
  ...
}
```

#### 5. ダウンロード URL 取得

```bash
curl -X GET https://codec-converter.example.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/download
```

レスポンス:

```json
{
  "downloadUrl": "https://s3.amazonaws.com/...",
  "expiresIn": 86400,
  "fileName": "output.webm"
}
```

#### 6. ファイルダウンロード

```bash
curl -O "https://s3.amazonaws.com/..."
```

---

## CORS 設定

S3 バケットには以下の CORS 設定が必要です:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["https://codec-converter.example.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

---

## セキュリティ

### Presigned URL

- **アップロード用**: 1時間有効
- **ダウンロード用**: 24時間有効
- **アクセス制御**: URL を知っている者のみアクセス可能

### ジョブ ID

- **生成**: UUID v4 (推測困難)
- **保存**: ローカルストレージ (サーバー側では管理しない)

---

## 関連ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ](./architecture.md)
- [UI 設計](./ui-design.md)
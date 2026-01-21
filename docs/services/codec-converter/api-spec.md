# Codec Converter API 仕様書

---

## 1. API 概要

### 1.1 ベース URL

| 環境 | URL                                      |
| ---- | ---------------------------------------- |
| 開発 | `https://dev-codec-converter.nagiyu.com` |
| 本番 | `https://codec-converter.nagiyu.com`     |

### 1.2 認証方式

**認証なし（匿名アクセス）**

Codec Converter は認証機能を提供していません。すべてのエンドポイントは匿名でアクセス可能です。

- ジョブIDを知っている人のみアクセス可能（UUID v4により推測困難）
- アカウント登録不要
- ログイン不要

### 1.3 共通レスポンス形式

#### 成功レスポンス

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "fileName": "sample.mp4",
    ...
}
```

#### エラーレスポンス

```json
{
    "error": "ERROR_CODE",
    "message": "エラーメッセージ"
}
```

### 1.4 HTTP ステータスコード

| コード | 意味                  | 用途                 |
| ------ | --------------------- | -------------------- |
| 200    | OK                    | 成功                 |
| 201    | Created               | リソース作成成功     |
| 400    | Bad Request           | リクエストが不正     |
| 404    | Not Found             | リソースが存在しない |
| 409    | Conflict              | 状態が不正           |
| 500    | Internal Server Error | サーバーエラー       |

### 1.5 エラーコード一覧

| コード                | HTTP ステータス | 説明                             |
| --------------------- | --------------- | -------------------------------- |
| `INVALID_FILE_SIZE`   | 400             | ファイルサイズが不正             |
| `INVALID_MIME_TYPE`   | 400             | MIMEタイプが不正                 |
| `INVALID_EXTENSION`   | 400             | ファイル拡張子が不正             |
| `JOB_NOT_FOUND`       | 404             | 指定されたジョブが見つからない   |
| `INVALID_STATUS`      | 409             | ジョブの状態が不正               |
| `INTERNAL_ERROR`      | 500             | 内部エラー                       |

---

## 2. エンドポイント一覧

| メソッド | パス                        | 説明                                               | 認証 |
| -------- | --------------------------- | -------------------------------------------------- | ---- |
| POST     | `/api/jobs`                 | 新規ジョブ作成、アップロード用Presigned URL取得    | 不要 |
| POST     | `/api/jobs/{jobId}/submit`  | Batchジョブ投入                                    | 不要 |
| GET      | `/api/jobs/{jobId}`         | ジョブステータス取得、COMPLETED時はダウンロードURL含む | 不要 |

---

## 3. エンドポイント詳細

### 3.1 ジョブ管理 API

#### 3.1.1 新規ジョブ作成

新しい変換ジョブを作成し、アップロード用の Presigned URL を取得します。

##### エンドポイント

```
POST /api/jobs
```

##### 必要な権限

なし（公開エンドポイント）

##### リクエストボディ

```json
{
    "fileName": "sample.mp4",
    "fileSize": 52428800,
    "contentType": "video/mp4",
    "outputCodec": "h264"
}
```

##### リクエストボディスキーマ

| フィールド  | 型     | 必須 | 説明                                           |
| ----------- | ------ | ---- | ---------------------------------------------- |
| fileName    | string | ✅   | ファイル名（拡張子含む）                       |
| fileSize    | number | ✅   | ファイルサイズ（バイト）、最大 524,288,000（500MB） |
| contentType | string | ✅   | `video/mp4` のみ許可                           |
| outputCodec | string | ✅   | `h264` / `vp9` / `av1` のいずれか              |

##### リクエスト例

```http
POST /api/jobs HTTP/1.1
Host: codec-converter.nagiyu.com
Content-Type: application/json

{
    "fileName": "sample.mp4",
    "fileSize": 52428800,
    "contentType": "video/mp4",
    "outputCodec": "h264"
}
```

```bash
curl -X POST https://codec-converter.nagiyu.com/api/jobs \
    -H "Content-Type: application/json" \
    -d '{
        "fileName": "sample.mp4",
        "fileSize": 52428800,
        "contentType": "video/mp4",
        "outputCodec": "h264"
    }'
```

##### レスポンス (201 Created)

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "uploadUrl": "https://codec-converter-storage.s3.us-east-1.amazonaws.com/uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4?X-Amz-Algorithm=...",
    "expiresIn": 3600
}
```

##### レスポンスフィールド

| フィールド | 型     | 説明                                 |
| ---------- | ------ | ------------------------------------ |
| jobId      | string | ジョブID（UUID v4）                  |
| uploadUrl  | string | S3 Presigned URL（有効期限1時間）    |
| expiresIn  | number | Presigned URL の有効期限（秒）       |

##### エラーレスポンス

```json
// 400 Bad Request
{
    "error": "INVALID_FILE_SIZE",
    "message": "ファイルサイズは500MB以下である必要があります"
}

// 400 Bad Request
{
    "error": "INVALID_MIME_TYPE",
    "message": "MP4ファイルのみアップロード可能です"
}
```

---

#### 3.1.2 変換ジョブ投入

アップロード完了後、変換ジョブを実行開始します。

##### エンドポイント

```
POST /api/jobs/{jobId}/submit
```

##### 必要な権限

なし（公開エンドポイント）

##### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| jobId      | string | ジョブID（UUID v4）  |

##### リクエスト例

```http
POST /api/jobs/550e8400-e29b-41d4-a716-446655440000/submit HTTP/1.1
Host: codec-converter.nagiyu.com
```

```bash
curl -X POST https://codec-converter.nagiyu.com/api/jobs/550e8400-e29b-41d4-a716-446655440000/submit
```

##### レスポンス (200 OK)

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PROCESSING"
}
```

##### エラーレスポンス

```json
// 404 Not Found
{
    "error": "JOB_NOT_FOUND",
    "message": "指定されたジョブが見つかりません"
}

// 409 Conflict
{
    "error": "INVALID_STATUS",
    "message": "ジョブは既に実行中または完了しています"
}
```

---

#### 3.1.3 ジョブステータス取得

ジョブの現在のステータスを取得します。ステータスが `COMPLETED` の場合、レスポンスに `downloadUrl` を含めます。

##### エンドポイント

```
GET /api/jobs/{jobId}
```

##### 必要な権限

なし（公開エンドポイント）

##### パスパラメータ

| パラメータ | 型     | 説明                 |
| ---------- | ------ | -------------------- |
| jobId      | string | ジョブID（UUID v4）  |

##### リクエスト例

```http
GET /api/jobs/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Host: codec-converter.nagiyu.com
```

```bash
curl https://codec-converter.nagiyu.com/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

##### レスポンス (200 OK - PROCESSING時)

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "PROCESSING",
    "fileName": "sample.mp4",
    "fileSize": 52428800,
    "outputCodec": "h264",
    "createdAt": 1704067200,
    "updatedAt": 1704067800
}
```

##### レスポンス (200 OK - COMPLETED時)

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "fileName": "sample.mp4",
    "fileSize": 52428800,
    "outputCodec": "h264",
    "createdAt": 1704067200,
    "updatedAt": 1704067800,
    "downloadUrl": "https://codec-converter-storage.s3.us-east-1.amazonaws.com/outputs/550e8400-e29b-41d4-a716-446655440000/output.mp4?X-Amz-Algorithm=..."
}
```

##### レスポンスフィールド

| フィールド   | 型     | 説明                                                     |
| ------------ | ------ | -------------------------------------------------------- |
| jobId        | string | ジョブID                                                 |
| status       | string | `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`        |
| fileName     | string | 元のファイル名                                           |
| fileSize     | number | ファイルサイズ（バイト）                                 |
| outputCodec  | string | 出力コーデック                                           |
| createdAt    | number | 作成日時（Unix timestamp 秒）                            |
| updatedAt    | number | 更新日時（Unix timestamp 秒）                            |
| downloadUrl  | string | ダウンロード用 Presigned URL（`COMPLETED` 時のみ、有効期限24時間） |
| errorMessage | string | エラーメッセージ（`FAILED` 時のみ）                      |

##### エラーレスポンス

```json
// 404 Not Found
{
    "error": "JOB_NOT_FOUND",
    "message": "指定されたジョブが見つかりません"
}
```

---

## 4. データモデル

### 4.1 Job

変換ジョブを表すデータモデル。

#### スキーマ

```typescript
interface Job {
    jobId: string;              // UUID v4
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    inputFile: string;          // S3キー: uploads/{jobId}/input.mp4
    outputFile?: string;        // S3キー: outputs/{jobId}/output.{ext}
    outputCodec: "h264" | "vp9" | "av1";
    fileName: string;           // 元ファイル名
    fileSize: number;           // バイト
    createdAt: number;          // Unix timestamp (秒)
    updatedAt: number;          // Unix timestamp (秒)
    expiresAt: number;          // Unix timestamp (秒), TTL用
    errorMessage?: string;      // FAILED時のエラー内容
}
```

#### 例

```json
{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "COMPLETED",
    "inputFile": "uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4",
    "outputFile": "outputs/550e8400-e29b-41d4-a716-446655440000/output.mp4",
    "outputCodec": "h264",
    "fileName": "sample.mp4",
    "fileSize": 52428800,
    "createdAt": 1704067200,
    "updatedAt": 1704067800,
    "expiresAt": 1704153600
}
```

---

## 5. セキュリティ

### 5.1 CORS 設定

```json
{
    "AllowedOrigins": ["https://codec-converter.nagiyu.com", "https://dev-codec-converter.nagiyu.com"],
    "AllowedMethods": ["GET", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
}
```

### 5.2 セキュリティヘッダー

CloudFrontで以下のヘッダーを設定:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';
Referrer-Policy: strict-origin-when-cross-origin
```

### 5.3 その他のセキュリティ対策

- **入力検証**: ファイルサイズ、MIMEタイプ、拡張子をクライアント側とサーバー側の両方で検証
- **Presigned URL**: S3へのアクセスはPresigned URLのみで制御、有効期限を設定
- **ジョブIDの推測困難性**: UUID v4を使用してジョブIDを生成、推測攻撃を防止
- **データ暗号化**: 
  - 転送時: HTTPS（TLS 1.2以上）
  - 保存時: S3 SSE-S3、DynamoDB デフォルト暗号化

---

## 6. その他

### 6.1 データライフサイクル

- **ジョブ情報**: DynamoDB TTLにより24時間後に自動削除
- **S3オブジェクト**: Lifecycle Policyにより24時間後に自動削除

### 6.2 制約事項

- **ファイルサイズ上限**: 500MB
- **対応入力形式**: MP4のみ
- **対応出力コーデック**: H.264、VP9、AV1
- **変換タイムアウト**: 2時間
- **同時処理数**: 3ジョブまで
- **ファイル保持期間**: 24時間

### 6.3 バージョニング

**Phase 1**: バージョニングなし (v1 として扱う)

将来的にAPIに破壊的変更が必要な場合は、URLパスでバージョン指定を検討します（`/api/v2/{endpoint}`）。

---

## 関連ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [デプロイ・運用](./deployment.md)
- [テスト仕様](./testing.md)

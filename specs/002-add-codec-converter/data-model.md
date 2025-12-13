# data-model.md — Codec Converter

このドキュメントは Phase 1 用のデータモデル（エンティティ、フィールド、バリデーション、状態遷移）を定義します。

## エンティティ: Job

- 名称: `Job`
- 保持先: DynamoDB テーブル `codec-converter-jobs-{env}`

### フィールド
- `jobId` (String, PK, UUID v4) — 例: `550e8400-e29b-41d4-a716-446655440000`
- `status` (String) — 列挙: `PENDING` | `PROCESSING` | `COMPLETED` | `FAILED`
- `inputFile` (String) — S3 プレフィックス例: `uploads/{jobId}/input.mp4`
- `outputFile` (String, optional) — S3 プレフィックス例: `outputs/{jobId}/output.{mp4|webm}`
- `outputCodec` (String) — 列挙: `h264` | `vp9` | `av1`
- `createdAt` (Number, epoch seconds)
- `updatedAt` (Number, epoch seconds)
- `expiresAt` (Number, epoch seconds) — TTL 用（`createdAt + 86400`）
- `fileName` (String) — 元ファイル名
- `fileSize` (Number) — バイト
- `errorMessage` (String, optional)

### インデックス
- 主キー: `jobId`
- 今回のスコープでは他索引不要（必要なら `createdAt` 等で GSI を検討）

### バリデーションルール
- `jobId`: UUID v4 フォーマット
- `status`: 上記列挙のいずれか
- `inputFile` / `outputFile`: S3 プレフィックス形式（文字列チェック）
- `fileSize` <= 500MB

## エンティティ: File (S3 オブジェクト)

S3 上のオブジェクトは以下のプレフィックスで管理:
- `uploads/{jobId}/input.mp4`
- `outputs/{jobId}/output.{mp4|webm}`

メタデータ:
- Content-Type
- Content-Length
- カスタムメタ: `x-amz-meta-job-id`, `x-amz-meta-original-filename`

Lifecycle:
- S3 ライフサイクルポリシーで作成から24時間後に自動削除

## 状態遷移

- 初期: 新規ジョブ作成時に `PENDING`
- `PENDING` -> `PROCESSING`: Batch コンテナ起動直後に、ワーカーが DynamoDB を更新
- `PROCESSING` -> `COMPLETED`: 出力ファイルを S3 にアップロード後に更新
- `PROCESSING` -> `FAILED`: FFmpeg エラー、S3 エラー、タイムアウト等で更新

## 参照整合性と GC

- DynamoDB の `expiresAt` を利用し、24時間後に TTL でレコード削除
- S3 は Lifecycle ルールにより 24 時間後に削除

## 監査 / ログ

- Job の更新（status の変更）は CloudWatch Logs でトレース可能にする（Lambda / Batch のログ出力）

---

このデータモデルを基に API 契約（OpenAPI）を作成します。
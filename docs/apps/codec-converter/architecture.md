# Codec Converter - アーキテクチャ

本ドキュメントは、Codec Converter サービスの基本設計を説明します。

---

## システム全体構成

![システム全体構成](../../images/apps/codec-converter/architecture-overview.drawio.svg)

### 主要コンポーネント

| コンポーネント | 役割 | 技術スタック |
|-------------|------|------------|
| **CloudFront** | CDN、カスタムドメイン、SSL/TLS 終端 | AWS CloudFront |
| **Lambda** | Next.js SSR、API エンドポイント | Lambda (コンテナイメージ) + Lambda Web Adapter (Function URL) |
| **S3** | 動画ファイルストレージ (入力/出力) | Amazon S3 (SSE-S3 暗号化、Lifecycle Policy) |
| **DynamoDB** | ジョブ管理データベース | Amazon DynamoDB (TTL 有効) |
| **AWS Batch** | 動画変換処理 | AWS Batch (Fargate) |
| **ECR** | コンテナイメージレジストリ | Amazon ECR (Next.js + FFmpeg イメージ) |

---

## コンポーネント構成

### フロントエンド

**技術**: Next.js (SSR)

**デプロイ方法**:
- Docker コンテナイメージとして ECR にプッシュ
- Lambda Web Adapter を含む
- Lambda Function URL で公開

**主な機能**:
- 動画アップロード UI
- コーデック選択 UI
- ジョブステータス表示
- 変換済み動画ダウンロード UI
- ローカルストレージでジョブ ID 管理

**ルーティング**:
- `/`: トップページ (アップロードフォーム)
- `/jobs/:jobId`: ジョブ詳細ページ
- `/api/*`: API エンドポイント (Next.js API Routes)

### バックエンド API

**技術**: Next.js API Routes (Lambda 上で実行)

**主なエンドポイント**:

| エンドポイント | メソッド | 説明 |
|-------------|---------|------|
| `POST /api/jobs` | POST | 新規ジョブ作成、Presigned URL 生成 |
| `GET /api/jobs/:jobId` | GET | ジョブステータス取得 |
| `GET /api/jobs/:jobId/download` | GET | ダウンロード用 Presigned URL 生成 |
| `POST /api/jobs/:jobId/submit` | POST | Batch ジョブ投入 |

**使用する AWS SDK**:
- `@aws-sdk/client-s3`: S3 Presigned URL 生成
- `@aws-sdk/client-dynamodb`: DynamoDB 操作
- `@aws-sdk/client-batch`: Batch ジョブ投入

### 変換処理

**技術**: AWS Batch (Fargate) + FFmpeg

**Compute Environment**:
- タイプ: Fargate
- 同時実行数: 3ジョブ (Phase 1)
- スケーリング: 手動設定

**Job Queue**:
- FIFO (先入れ先出し)

**Job Definition**:
- コンテナイメージ: ECR に格納した FFmpeg イメージ
- タイムアウト: 2時間 (7200秒)
- リソース: vCPU 2, メモリ 4GB (調整可能)

**処理内容**:
1. S3 から入力ファイル取得
2. FFmpeg でコーデック変換
3. S3 へ出力ファイルアップロード
4. DynamoDB のステータス更新

**FFmpeg コマンド例**:
```bash
# VP9 (WebM)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -c:a libopus output.webm

# H.264 (MP4)
ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4

# AV1 (WebM)
ffmpeg -i input.mp4 -c:v libaom-av1 -c:a libopus output.webm
```

### ストレージ

**S3 バケット構成**:

```
codec-converter-{env}/
├── uploads/
│   └── {jobId}/
│       └── input.mp4
└── outputs/
    └── {jobId}/
        └── output.{webm|mp4}
```

**設定**:
- **暗号化**: SSE-S3 (サーバー側暗号化)
- **Lifecycle Policy**: 24時間後に自動削除
- **バージョニング**: 無効
- **アクセス制御**: 非公開 (Presigned URL のみ)

### データベース

**DynamoDB テーブル**: `codec-converter-jobs-{env}`

**主キー**: `jobId` (String, UUID)

**属性**:

```json
{
  "jobId": "uuid",
  "status": "PENDING|PROCESSING|COMPLETED|FAILED",
  "inputFile": "uploads/{jobId}/input.mp4",
  "outputFile": "outputs/{jobId}/output.webm",
  "outputCodec": "h264|vp9|av1",
  "createdAt": 1234567890,
  "updatedAt": 1234567890,
  "expiresAt": 1234567890,
  "errorMessage": "..."
}
```

**設定**:
- **TTL**: `expiresAt` 属性で24時間後に自動削除
- **読み込みキャパシティ**: オンデマンド
- **書き込みキャパシティ**: オンデマンド

### 配信

**CloudFront Distribution**:
- **オリジン**: Lambda Function URL
- **カスタムドメイン**: `codec-converter.example.com` (例)
- **SSL/TLS**: ACM 証明書 (共通インフラで管理)
- **キャッシュ**: 動的コンテンツのためキャッシュ無効化
- **圧縮**: 有効 (Gzip, Brotli)

---

## データフロー

### 1. アップロードフロー

![アップロードフロー](../../images/apps/codec-converter/upload-flow.drawio.svg)

**ステップ**:

1. ユーザーがアップロードリクエスト
2. フロントエンド → Lambda API へ Presigned URL リクエスト
3. Lambda が DynamoDB にジョブレコード作成 (status: PENDING)
4. Lambda が S3 Presigned URL を生成
5. Presigned URL をフロントエンドに返却
6. ユーザーがブラウザから S3 へ直接アップロード (500MB まで)
7. アップロード完了通知
8. Lambda が AWS Batch ジョブを投入

**重要なポイント**:
- ユーザーは S3 へ直接アップロード (Lambda のペイロードサイズ制限を回避)
- ジョブ ID は UUID で生成、ローカルストレージに保存
- Presigned URL の有効期限は1時間 (調整可能)

### 2. 変換処理フロー

![変換処理フロー](../../images/apps/codec-converter/conversion-flow.drawio.svg)

**ステップ**:

1. AWS Batch が ECR から FFmpeg コンテナイメージ取得
2. コンテナ起動、DynamoDB のステータスを PROCESSING に更新
3. S3 から入力ファイル (`uploads/{jobId}/input.mp4`) をダウンロード
4. FFmpeg でコーデック変換実行
5. 変換結果を S3 (`outputs/{jobId}/output.webm`) へアップロード
6. DynamoDB のステータスを COMPLETED に更新
7. エラー時は status を FAILED に更新、errorMessage を保存

**タイムアウト設定**:
- ジョブタイムアウト: 2時間 (7200秒)
- 500MB の動画でも余裕を持って処理可能

**エラーハンドリング**:
- FFmpeg エラー → status: FAILED
- S3 アクセスエラー → status: FAILED
- タイムアウト → status: FAILED

### 3. ダウンロードフロー

![ダウンロードフロー](../../images/apps/codec-converter/download-flow.drawio.svg)

**ステップ**:

1. ユーザーがページを表示 (ローカルストレージからジョブ ID 取得)
2. フロントエンドが定期的にステータスをポーリング (例: 5秒ごと)
3. Lambda API が DynamoDB からジョブ情報取得
4. status が COMPLETED ならダウンロードボタン表示
5. ユーザーがダウンロードボタンクリック
6. Lambda が S3 Presigned URL を生成
7. ユーザーがブラウザから S3 へ直接ダウンロード

**重要なポイント**:
- ポーリング方式でステータス確認 (WebSocket は Phase 2)
- Presigned URL の有効期限は24時間
- ファイルは24時間後に自動削除 (S3 Lifecycle Policy)

---

## 技術選定理由

### Next.js + Lambda Web Adapter

**選定理由**:
- SSR で SEO 対応可能 (将来的に必要になる可能性)
- API Routes で Lambda 関数を統合管理
- コンテナイメージで依存関係管理が容易
- Lambda Web Adapter で簡単に Lambda にデプロイ可能

**代替案**:
- Static Export + API Gateway: SSR が不要なら選択肢
- ECS/Fargate: 常時起動のため Phase 1 ではコスト高

### AWS Batch (Fargate)

**選定理由**:
- 長時間処理 (最大2時間) に対応
- キュー管理が組み込み
- Fargate でサーバー管理不要
- 同時実行数の制御が容易

**代替案**:
- Lambda: 15分制限があり、長時間動画に対応できない
- ECS: Batch より複雑、キュー管理を自前で実装

### DynamoDB

**選定理由**:
- サーバーレス、自動スケール
- TTL で24時間後に自動削除
- オンデマンド課金で小規模運用に最適

**代替案**:
- RDS: オーバースペック、コスト高
- ElastiCache: TTL は可能だが、永続化が必要

### S3 Presigned URL

**選定理由**:
- Lambda のペイロードサイズ制限 (6MB) を回避
- ユーザーから S3 へ直接アップロード/ダウンロード
- 帯域コストを Lambda から S3 へ移行

**代替案**:
- Lambda 経由: 500MB のファイルには対応不可

---

## セキュリティ設計

### データ暗号化

**転送時の暗号化**:
- すべて HTTPS で通信 (CloudFront, Lambda Function URL, S3)

**保存時の暗号化**:
- S3: SSE-S3 (サーバー側暗号化)
- DynamoDB: デフォルトで暗号化有効

### アクセス制御

**S3 バケット**:
- 非公開設定
- Presigned URL のみでアクセス可能
- CORS 設定でブラウザからのアップロードを許可

**DynamoDB**:
- IAM ロールで Lambda および Batch からのみアクセス可能

**ジョブ ID**:
- UUID v4 で推測困難
- ローカルストレージに保存 (サーバー側では管理しない)

### セキュリティヘッダー

CloudFront で以下のヘッダーを設定:
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Content-Security-Policy`

---

## 運用設計

### ファイルの自動削除

**S3 Lifecycle Policy**:
- 24時間後に自動削除
- タグやプレフィックスで制御

**DynamoDB TTL**:
- `expiresAt` 属性で24時間後に自動削除

### ログ管理

**CloudWatch Logs**:
- Lambda: 自動的に CloudWatch Logs に出力
- Batch: コンテナの標準出力を CloudWatch Logs に送信

**ログ保持期間**: 7日間 (調整可能)

### モニタリング

**CloudWatch メトリクス**:
- Lambda: 実行時間、エラー率、同時実行数
- Batch: ジョブ数、失敗率、実行時間
- DynamoDB: 読み込み/書き込みユニット消費量

**アラーム設定** (Phase 2):
- Batch ジョブ失敗率が高い場合
- Lambda エラー率が高い場合

### コスト管理

**主なコスト要素**:
- Lambda: リクエスト数 + 実行時間
- Batch (Fargate): 実行時間
- S3: ストレージ + データ転送
- DynamoDB: 読み込み/書き込みリクエスト

**コスト削減策**:
- S3 Lifecycle Policy で24時間後に削除
- DynamoDB オンデマンドで小規模運用
- Lambda Web Adapter でアイドル時は課金なし

---

## 関連ドキュメント

- [要件定義](./requirements.md)
- [インフラ概要](./infra/README.md)

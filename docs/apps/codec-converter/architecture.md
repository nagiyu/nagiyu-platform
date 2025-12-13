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

**環境変数（静的、Job Definition に設定）**:
- `S3_BUCKET`: S3 バケット名
- `DYNAMODB_TABLE`: DynamoDB テーブル名
- `AWS_REGION`: AWS リージョン

**環境変数（動的、SubmitJob API で渡す）**:
- `JOB_ID`: ジョブ ID（UUID）
- `OUTPUT_CODEC`: 出力コーデック（h264, vp9, av1）

**パラメータの渡し方**:
- Lambda が `POST /api/jobs/:jobId/submit` を受け取る
- DynamoDB からジョブ情報（jobId, outputCodec）を取得
- AWS Batch の `SubmitJob` API を呼び出し
- `containerOverrides.environment` で動的な環境変数を渡す

```json
{
  "containerOverrides": {
    "environment": [
      {"name": "JOB_ID", "value": "550e8400-e29b-41d4-a716-446655440000"},
      {"name": "OUTPUT_CODEC", "value": "vp9"}
    ]
  }
}
```

**処理内容**:
1. 環境変数から `JOB_ID`, `OUTPUT_CODEC`, `S3_BUCKET`, `DYNAMODB_TABLE` を取得
2. **DynamoDB のステータスを PROCESSING に更新**
3. S3 から入力ファイル取得（`s3://{S3_BUCKET}/uploads/{JOB_ID}/input.mp4`）
4. FFmpeg でコーデック変換
5. S3 へ出力ファイルアップロード（`s3://{S3_BUCKET}/outputs/{JOB_ID}/output.{ext}`）
6. **DynamoDB のステータスを COMPLETED に更新**
7. エラー時は **status を FAILED に更新**、errorMessage を保存

**FFmpeg コマンド詳細**:

```bash
# H.264 (MP4)
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k output.mp4

# VP9 (WebM)
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k output.webm

# AV1 (WebM)
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 -c:a libopus -b:a 128k output.webm
```

**エンコード設定の詳細**:

| コーデック | ビデオオプション | 音声オプション | 説明 |
|----------|--------------|--------------|------|
| H.264 | `-preset medium -crf 23` | `-c:a aac -b:a 128k` | バランスの取れた品質と速度 |
| VP9 | `-crf 30 -b:v 0` | `-c:a libopus -b:a 128k` | 品質ベース（CRF）モード |
| AV1 | `-crf 30 -b:v 0 -cpu-used 4` | `-c:a libopus -b:a 128k` | 中程度の速度設定 |

**品質設定の方針**:
- **H.264**: CRF 23（デフォルト、視覚的に透明な品質）
- **VP9**: CRF 30（H.264のCRF 23と同等の品質）
- **AV1**: CRF 30 + cpu-used 4（品質と速度のバランス）
- **音声**: すべて128kbps（標準的な品質）

**注意**: 実際の運用で品質や速度に問題がある場合は、これらの値を調整する

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
- **Lifecycle Policy**: オブジェクト作成日時から24時間後に自動削除
    - すべてのオブジェクト（uploads/, outputs/）に適用
    - 管理がシンプルで、確実に一時ファイルを削除できる
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
7. アップロード完了検知 (HTTP 200 OK レスポンス)
8. フロントエンドが `POST /api/jobs/:jobId/submit` を呼び出し
9. Lambda が AWS Batch ジョブを投入

**アップロード完了の検知**:
- フロントエンドが S3 Presigned URL へ PUT リクエスト
- HTTP レスポンスステータス 200 OK で完了を判定
- 完了後、`POST /api/jobs/:jobId/submit` を呼び出し

**アップロード失敗時の処理**:
- S3 からエラーレスポンス（4xx, 5xx）を受信
- ユーザーにエラーメッセージを表示、再試行を促す
- ジョブレコードは status: PENDING のまま DynamoDB に残る
- 24時間後に TTL で自動削除される

**重要なポイント**:
- ユーザーは S3 へ直接アップロード (Lambda のペイロードサイズ制限を回避)
- ジョブ ID は UUID で生成、ローカルストレージに保存
- Presigned URL の有効期限は1時間 (調整可能)

### 2. 変換処理フロー

![変換処理フロー](../../images/apps/codec-converter/conversion-flow.drawio.svg)

**ステップ**:

1. AWS Batch が ECR から FFmpeg コンテナイメージ取得
2. コンテナ起動
3. **DynamoDB のステータスを PROCESSING に更新**（コンテナ内スクリプトの最初で実行）
4. S3 から入力ファイル (`uploads/{jobId}/input.mp4`) をダウンロード
5. FFmpeg でコーデック変換実行
6. 変換結果を S3 (`outputs/{jobId}/output.webm`) へアップロード
7. DynamoDB のステータスを COMPLETED に更新
8. エラー時は status を FAILED に更新、errorMessage を保存

**DynamoDB ステータス更新のタイミング**:
- **PENDING → PROCESSING**: Batch コンテナ起動直後（スクリプトの最初）
    - ユーザーは「処理が始まった」ことをすぐに確認できる
- **PROCESSING → COMPLETED**: 変換完了、S3 アップロード後
- **PROCESSING → FAILED**: エラー発生時（FFmpeg エラー、S3 エラー、タイムアウト）

**タイムアウト設定**:
- ジョブタイムアウト: 2時間 (7200秒)
- 500MB の動画でも余裕を持って処理可能

**エラーハンドリング**:
- FFmpeg エラー → status: FAILED, errorMessage に詳細を保存
- S3 アクセスエラー → status: FAILED, errorMessage に詳細を保存
- タイムアウト → status: FAILED, errorMessage に詳細を保存

### エラーハンドリング詳細

#### 1. アップロード失敗（S3 への PUT 失敗）
- **処理**: ユーザーにエラーメッセージ表示、再試行を促す
- **DB**: status: PENDING のまま（TTL で 24時間後に自動削除）

#### 2. Batch ジョブ投入失敗（`POST /api/jobs/:jobId/submit` 失敗）
- **処理**: エラーメッセージと「再試行」ボタンを表示
- **アクション**: 再度 `POST /api/jobs/:jobId/submit` を呼び出し
- **DB**: status: PENDING のまま
- **特殊ケース**: 409 Conflict（既に投入済み）の場合は、ジョブ詳細ページへ遷移

#### 3. Batch ジョブ実行失敗（FFmpeg エラーなど）
- **処理**: ジョブ詳細ページでエラーメッセージ表示
- **DB**: status: FAILED, errorMessage に詳細を保存
- **アクション**: トップページへ戻って最初からやり直し

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
  - 環境ごとに AllowedOrigins を設定（dev: localhost + dev環境ドメイン、prod: 本番ドメイン）

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
- `expiresAt` の値: ジョブ作成時（`POST /api/jobs`）に `createdAt + 86400` (24時間後) を設定
- TTL による削除は遅延する可能性があるが、永続化防止の目的では問題なし

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

# Codec Converter Worker

AWS Batch ワーカー用の Docker イメージ。FFmpeg を使用して動画のコーデック変換を実行します。

## 概要

このワーカーは AWS Batch 上で実行され、以下の処理を行います：

1. DynamoDB のジョブステータスを `PROCESSING` に更新
2. S3 から入力動画ファイルをダウンロード
3. FFmpeg でコーデック変換を実行
4. 変換後のファイルを S3 にアップロード
5. DynamoDB のジョブステータスを `COMPLETED` に更新（エラー時は `FAILED`）

## サポートされているコーデック

- **H.264** (libx264) → MP4 出力
- **VP9** (libvpx-vp9) → WebM 出力
- **AV1** (libaom-av1) → WebM 出力

## ベースイメージ

- **FFmpeg**: `jrottenberg/ffmpeg:6.1-alpine`
  - 理由: 
    - Well-maintained な FFmpeg イメージ（Docker Hub で公式推奨）
    - H.264 (libx264), VP9 (libvpx-vp9), AV1 (libaom-av1) のコーデックをサポート
    - Alpine ベースでサイズが小さい（約 150MB、セキュリティリスク軽減）
    - 定期的にアップデートされている
    - 本番環境で広く使用されている実績

### アーキテクチャの選択理由

**単一ベースイメージ方式を採用**:
- FFmpeg イメージに直接 Python/AWS CLI を追加する方式
- Multi-stage build でコピーする方式は、依存ライブラリの問題で複雑化するため採用せず
- 最終イメージサイズ: 約 200-300MB（FFmpeg + AWS CLI）

**代替案として検討したもの**:
1. **Multi-stage build (Node.js + FFmpeg コピー)**
   - 却下理由: FFmpeg の共有ライブラリ依存関係が複雑で、コピーだけでは動作しない
2. **AWS SDK for Go + 静的ビルド**
   - 将来的な最適化候補だが、Phase 1 では AWS CLI で十分
3. **Debian ベース FFmpeg**
   - より大きなイメージサイズ（500MB+）になるため、Alpine を優先

## セキュリティ対策

1. **非 root ユーザー**: `worker` ユーザー（UID: 1001）で実行
2. **最小限のパッケージ**: Alpine Linux ベースで必要最小限のパッケージのみインストール
3. **Multi-stage build**: FFmpeg のみを runtime イメージにコピー
4. **SSL/TLS サポート**: ca-certificates をインストールして AWS API との安全な通信を確保

## 環境変数

### 静的環境変数（Job Definition に設定）

- `S3_BUCKET`: S3 バケット名
- `DYNAMODB_TABLE`: DynamoDB テーブル名（例: `codec-converter-jobs-dev`）
- `AWS_REGION`: AWS リージョン（例: `ap-northeast-1`）

### 動的環境変数（Container Overrides で渡す）

- `JOB_ID`: ジョブ ID（UUID）
- `OUTPUT_CODEC`: 出力コーデック（`h264`, `vp9`, `av1`）

## イメージのビルド

**注意**: サンドボックス環境では Alpine パッケージリポジトリへのアクセス制限により、ビルドが完了しない場合があります。実際の環境（CI/CD や開発環境）でビルドしてください。

詳細は [BUILD.md](./BUILD.md) を参照してください。

```bash
cd services/codec-converter-worker
docker build -t codec-converter-worker:latest .
```

## ローカルテスト

```bash
# AWS 認証情報を渡してコンテナを実行
docker run --rm \
  -e AWS_ACCESS_KEY_ID=xxx \
  -e AWS_SECRET_ACCESS_KEY=xxx \
  -e AWS_REGION=ap-northeast-1 \
  -e S3_BUCKET=your-bucket-name \
  -e DYNAMODB_TABLE=codec-converter-jobs-dev \
  -e JOB_ID=test-job-id \
  -e OUTPUT_CODEC=h264 \
  codec-converter-worker:latest
```

## ECR へのプッシュ

```bash
# ECR にログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージをタグ付け
docker tag codec-converter-worker:latest \
  <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-worker:latest

# プッシュ
docker push <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-worker:latest
```

## FFmpeg エンコード設定

### H.264 (MP4)
```bash
ffmpeg -i input.mp4 -c:v libx264 -preset medium -crf 23 -c:a aac -b:a 128k output.mp4
```
- **preset**: `medium` - エンコード速度と品質のバランス
- **crf**: `23` - 視覚的に透明な品質（デフォルト）
- **音声**: AAC 128kbps

### VP9 (WebM)
```bash
ffmpeg -i input.mp4 -c:v libvpx-vp9 -crf 30 -b:v 0 -c:a libopus -b:a 128k output.webm
```
- **crf**: `30` - H.264 の CRF 23 と同等の品質
- **b:v**: `0` - CRF モード（品質ベース）
- **音声**: Opus 128kbps

### AV1 (WebM)
```bash
ffmpeg -i input.mp4 -c:v libaom-av1 -crf 30 -b:v 0 -cpu-used 4 -c:a libopus -b:a 128k output.webm
```
- **crf**: `30` - 高品質
- **cpu-used**: `4` - エンコード速度と品質のバランス（0=遅い/高品質、8=速い/低品質）
- **音声**: Opus 128kbps

## ファイルパス

### 入力ファイル（S3）
```
s3://{S3_BUCKET}/uploads/{JOB_ID}/input.mp4
```

### 出力ファイル（S3）
```
s3://{S3_BUCKET}/outputs/{JOB_ID}/output.{mp4|webm}
```

## エラーハンドリング

エラーが発生した場合、以下の処理を実行します：

1. DynamoDB のステータスを `FAILED` に更新
2. `errorMessage` フィールドにエラー内容を記録
3. 終了コード 1 で終了

## タイムアウト

- AWS Batch Job Definition で **2時間（7200秒）** のタイムアウトを設定
- タイムアウト時は自動的に `FAILED` 状態となる

## リソース要件

- **vCPU**: 2
- **メモリ**: 4GB
- **ストレージ**: 10GB（一時ファイル用）

## ログ

- 標準出力・標準エラー出力は CloudWatch Logs に送信
- FFmpeg のログは `/tmp/ffmpeg.log` に保存（デバッグ用）

## 関連ドキュメント

- [アーキテクチャ](/docs/apps/codec-converter/architecture.md)
- [仕様](/specs/002-add-codec-converter/spec.md)
- [タスク一覧](/specs/002-add-codec-converter/tasks.md)

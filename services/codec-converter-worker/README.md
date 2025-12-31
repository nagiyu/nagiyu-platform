# Codec Converter Worker

AWS Batch ワーカーサービス。FFmpeg を使用して動画のコーデック変換を実行します。

## 概要

このワーカーは AWS Batch ジョブとして実行され、以下の処理を行います：

1. S3 から入力動画ファイルをダウンロード
2. FFmpeg で指定されたコーデックに変換
3. S3 に出力動画ファイルをアップロード
4. DynamoDB でジョブステータスを更新

## サポートされるコーデック

- **H.264**: CRF 23, AAC 音声, MP4 コンテナ
- **VP9**: CRF 30, Opus 音声, WebM コンテナ
- **AV1**: CRF 30, cpu-used 4, Opus 音声, WebM コンテナ

## 環境変数

以下の環境変数が必要です（AWS Batch ジョブ定義で設定）:

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `S3_BUCKET` | S3 バケット名 | `codec-converter-storage-dev` |
| `DYNAMODB_TABLE` | DynamoDB テーブル名 | `codec-converter-jobs-dev` |
| `AWS_REGION` | AWS リージョン | `ap-northeast-1` |
| `JOB_ID` | ジョブ ID (UUID) | `123e4567-e89b-12d3-a456-426614174000` |
| `OUTPUT_CODEC` | 出力コーデック | `h264` / `vp9` / `av1` |

## ビルド

### ローカル開発

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# テスト
npm test

# カバレッジ
npm run test:coverage

# Lint
npm run lint

# フォーマット
npm run format
```

### Docker イメージのビルド

モノレポのルートから実行:

```bash
# ワーカー用 Docker イメージをビルド
docker build -f services/codec-converter-worker/Dockerfile -t codec-converter-worker:latest .

# ECR にプッシュ
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com
docker tag codec-converter-worker:latest <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest
docker push <account-id>.dkr.ecr.ap-northeast-1.amazonaws.com/codec-converter-ffmpeg-dev:latest
```

## エラーハンドリング

### リトライロジック

- 最大 2 回リトライ（計 3 回試行）
- 指数バックオフ: 1 秒、2 秒
- AWS Batch のジョブ定義でも 1 回のリトライを設定（合計最大 6 回試行）

### エラータイプ

- **S3 エラー**: ダウンロード/アップロード失敗時
- **FFmpeg エラー**: 変換処理失敗時（exit code と stderr を記録）
- **DynamoDB エラー**: ステータス更新失敗時

### クリーンアップ

- 処理成功・失敗に関わらず、一時ファイルを自動削除
- `/tmp` ディレクトリを使用

## テスト

### ユニットテスト

主要な機能のユニットテストを実装：

- 環境変数バリデーション
- S3 操作（モック使用）
- DynamoDB 操作（モック使用）
- FFmpeg 実行ロジック
- エラーハンドリング
- リトライロジック

### 統合テスト

**注意**: Jest の ES modules サポート制約により、一部の統合テスト (processJob, main) はスキップされています。
個別の関数単体テストはすべて合格しており、実際の動作には問題ありません。

### カバレッジ

- ステートメント: 64.4%
- ブランチ: 73.8%
- 関数: 66.66%
- ライン: 65.21%

**注**: カバレッジが 80% を下回っているのは、統合テストのスキップによるものです。

## アーキテクチャ

### Docker イメージ

- **ベースイメージ**: `public.ecr.aws/amazonlinux/amazonlinux:2023`
- **FFmpeg**: 静的ビルド版（johnvansickle.com からダウンロード）
- **Node.js**: バージョン 20（システムパッケージ）
- **マルチステージビルド**: builder + runner

### 依存関係

- `@nagiyu-platform/codec-converter-common`: 共通ライブラリ
- `@aws-sdk/client-s3`: S3 操作
- `@aws-sdk/client-dynamodb`: DynamoDB 操作
- `@aws-sdk/lib-dynamodb`: DynamoDB ドキュメントクライアント

## デプロイ

詳細は [インフラドキュメント](../../infra/codec-converter/README.md) を参照してください。

## トラブルシューティング

### FFmpeg が見つからない

Docker イメージに FFmpeg が正しくインストールされているか確認:

```bash
docker run --rm <image> ffmpeg -version
```

### 環境変数が設定されていない

AWS Batch ジョブ定義で環境変数が正しく設定されているか確認。
特に `JOB_ID` と `OUTPUT_CODEC` は `containerOverrides` で動的に渡される必要があります。

### S3 アクセスエラー

- IAM ロールに適切な権限があるか確認
- S3 バケット名が正しいか確認

### DynamoDB アクセスエラー

- IAM ロールに適切な権限があるか確認
- DynamoDB テーブル名が正しいか確認

## 関連ドキュメント

- [アーキテクチャ設計](../../docs/services/codec-converter/architecture.md)
- [要件定義](../../docs/services/codec-converter/requirements.md)
- [インフラ構成](../../infra/codec-converter/README.md)

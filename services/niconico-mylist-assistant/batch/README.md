# Niconico Mylist Assistant - Batch Service

AWS Batch で実行されるニコニコ動画マイリスト自動登録バッチジョブ。

## 概要

Playwright を使用してニコニコ動画にログインし、指定された動画をマイリストに自動登録するバッチ処理を実行します。

## 主な機能

- ニコニコ動画への自動ログイン
- 既存マイリストの削除
- 新規マイリストの作成
- 複数動画の一括登録
- **エラー時のスクリーンショット自動取得・S3 アップロード**

## 環境変数

### 必須

- `USER_ID`: ユーザーID
- `NICONICO_EMAIL`: ニコニコ動画のメールアドレス
- `ENCRYPTED_PASSWORD`: 暗号化されたパスワード (JSON 文字列)
- `VIDEO_IDS`: 登録する動画 ID の配列 (JSON 文字列)
- `DYNAMODB_TABLE_NAME`: DynamoDB テーブル名
- `ENCRYPTION_SECRET_NAME`: 暗号化キーの Secrets Manager シークレット名
- `AWS_REGION`: AWS リージョン

### オプション

- `MYLIST_NAME`: マイリスト名（デフォルト: タイムスタンプベースの名前）
- `SCREENSHOT_BUCKET_NAME`: スクリーンショット保存用 S3 バケット名
  - 設定されている場合、エラー時のスクリーンショットが S3 にアップロードされる
  - 設定されていない場合、ローカル (`/tmp`) のみに保存

## スクリーンショット機能

### 概要

バッチ処理中にエラーが発生した場合、自動的にスクリーンショットを取得します。

### 保存先

1. **ローカル保存**: `/tmp` ディレクトリに常に保存（既存動作維持）
2. **S3 アップロード**: `SCREENSHOT_BUCKET_NAME` 環境変数が設定されている場合のみ S3 にアップロード

### S3 保存パス

```
s3://<SCREENSHOT_BUCKET_NAME>/screenshots/<TIMESTAMP>-<FILENAME>.png
```

例: `s3://my-bucket/screenshots/2024-01-01T12-00-00-000Z-error-screenshot.png`

### S3 バケットの設定

インフラストラクチャ (CDK) で自動的に作成されます:

- バケット名: `nagiyu-niconico-mylist-assistant-screenshots-{env}`
- 暗号化: SSE-S3
- ライフサイクル: 7日後に自動削除
- パブリックアクセス: ブロック

### エラー処理

- スクリーンショット取得失敗やS3アップロード失敗は致命的エラーではありません
- 失敗してもバッチ処理は継続されます
- エラーログは CloudWatch Logs に出力されます

### S3 URL の確認

S3 にアップロードが成功すると、コンソールに以下のように出力されます:

```
スクリーンショットを S3 にアップロード: https://<bucket>.s3.<region>.amazonaws.com/screenshots/<timestamp>-<filename>.png
```

## ビルド

```bash
npm run build
```

## テスト

### ユニットテスト

```bash
npm test
```

### 統合テスト (Playwright)

```bash
npm run test:integration
```

## デプロイ

Docker イメージとして ECR にプッシュされ、AWS Batch ジョブ定義で使用されます。

詳細は `Dockerfile` を参照してください。

## 関連ドキュメント

- インフラストラクチャ: `infra/niconico-mylist-assistant/`
- コアライブラリ: `services/niconico-mylist-assistant/core/`

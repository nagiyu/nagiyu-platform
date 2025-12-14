# Codec Converter CI ワークフロー

このドキュメントでは、Codec Converter サービスの継続的インテグレーション（CI）ワークフローについて説明します。

## ワークフロー概要

### ci.yml

CI ワークフローは `services/codec-converter/.github/workflows/ci.yml` に定義されています。

**トリガー**:
- `develop`, `integration/**`, `master`, `002-add-codec-converter` ブランチへのプッシュ
- `develop`, `master` ブランチへのプルリクエスト
- `services/codec-converter/` 配下のファイルが変更された場合のみ実行

**ジョブ構成**:

1. **lint-and-format**: コード品質チェック
   - ESLint によるコード検証
   - Prettier によるコードフォーマットチェック

2. **build**: Next.js アプリケーションのビルド
   - 本番用ビルドの作成
   - ビルド成果物のアップロード（7日間保持）

3. **test**: テストの実行
   - ユニットテスト、統合テストの実行
   - ※現在はテストスクリプト未設定のため、エラーが発生してもジョブは継続

4. **container-build** (コメントアウト中):
   - Dockerfile が用意された際に有効化
   - AWS ECR へのコンテナイメージのビルドとプッシュ
   - master ブランチは `latest` タグ、develop ブランチは `dev-{SHA}` タグを付与

## 必要な GitHub Secrets

コンテナビルドを有効化する場合、以下のシークレットが必要です:

- `AWS_ACCESS_KEY_ID`: AWS アクセスキー ID
- `AWS_SECRET_ACCESS_KEY`: AWS シークレットアクセスキー
- `AWS_REGION`: AWS リージョン（デフォルト: us-east-1）
- `AWS_ACCOUNT_ID`: AWS アカウント ID（ECR レポジトリの指定に使用）

## ローカルでの検証

CI 実行前にローカルで各ステップを検証できます:

```bash
# 依存関係のインストール
npm ci

# Lint チェック
npm run lint

# フォーマットチェック
npm run format:check

# ビルド
npm run build

# テスト（設定後）
npm test
```

## 注意事項

- Node.js のバージョンは 20 を使用
- `npm ci` を使用して確実な依存関係のインストールを行う
- キャッシュ機能を有効化してビルド時間を短縮

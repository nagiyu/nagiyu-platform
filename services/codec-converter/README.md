# Codec Converter

動画ファイルのコーデック変換サービス

## 構成

このサービスは以下の3つのパッケージで構成されています：

### core/

ビジネスロジックを含むコアパッケージ

- **責務**: 型定義、定数、バリデーションロジック
- **テスト**: ユニットテスト (カバレッジ 80%以上必須)
- **依存**: フレームワーク非依存

#### ディレクトリ構造

```
core/
├── src/
│   ├── index.ts         # エクスポート定義
│   ├── types.ts         # 型定義
│   ├── constants.ts     # 定数定義
│   └── validation.ts    # バリデーションロジック
├── tests/
│   └── unit/           # ユニットテスト
├── package.json
├── tsconfig.json
└── jest.config.ts
```

#### ビルドとテスト

```bash
cd services/codec-converter/core
npm run build        # TypeScriptビルド
npm test             # ユニットテスト実行
npm run test:coverage # カバレッジ付きテスト
```

### web/

Next.js ベースのWebアプリケーション

- **責務**: ユーザーインターフェース、APIエンドポイント
- **テスト**: E2Eテスト
- **依存**: core パッケージ、Next.js、React、AWS SDK

#### ディレクトリ構造

```
web/
├── src/
│   ├── app/
│   │   ├── api/        # APIルート
│   │   ├── layout.tsx  # ルートレイアウト
│   │   └── page.tsx    # ホームページ
│   └── types/          # 型定義
├── e2e/                # E2Eテスト
├── public/             # 静的ファイル
├── package.json
├── tsconfig.json
├── next.config.ts
└── Dockerfile
```

#### 開発とビルド

```bash
cd services/codec-converter/web
npm run dev          # 開発サーバー起動
npm run build        # プロダクションビルド
npm run test:e2e     # E2Eテスト実行
```

### batch/

AWS Batchで実行されるワーカー

- **責務**: 動画変換処理 (FFmpeg)
- **テスト**: 統合テスト
- **依存**: core パッケージ、AWS SDK、FFmpeg

#### ディレクトリ構造

```
batch/
├── src/
│   └── index.ts        # エントリーポイント
├── tests/
│   └── integration/    # 統合テスト
├── package.json
├── tsconfig.json
├── jest.config.ts
└── Dockerfile
```

#### ビルドとテスト

```bash
cd services/codec-converter/batch
npm run build        # TypeScriptビルド
npm test             # 統合テスト実行
```

## 依存関係

```
web/ ──depends on──> core/
batch/ ──depends on──> core/
```

## セットアップ

ルートディレクトリで依存関係をインストール：

```bash
npm install
```

これにより全パッケージの依存関係が自動的に解決されます。

## 全体ビルド

```bash
# ルートディレクトリから
npm run build
```

各パッケージが順番にビルドされます：
1. core
2. web
3. batch

## デプロイ

各パッケージは独立してデプロイ可能です：

- **web**: CloudFront + Lambda@Edge
- **batch**: AWS Batch (Fargate)

## 環境変数

### web パッケージ

- `AWS_REGION`: AWSリージョン
- `DYNAMODB_TABLE_NAME`: DynamoDBテーブル名
- `S3_BUCKET_NAME`: S3バケット名
- `BATCH_JOB_DEFINITION`: Batchジョブ定義ARN
- `BATCH_JOB_QUEUE`: Batchジョブキュー名

### batch パッケージ

- `AWS_REGION`: AWSリージョン
- `DYNAMODB_TABLE_NAME`: DynamoDBテーブル名
- `S3_BUCKET_NAME`: S3バケット名
- `JOB_ID`: 処理対象のジョブID
- `OUTPUT_CODEC`: 出力コーデック (h264/vp9/av1)

## ライセンス

MIT & Apache-2.0

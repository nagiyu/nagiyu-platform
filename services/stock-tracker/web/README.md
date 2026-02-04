# Stock Tracker Web

Stock Tracker の Web アプリケーション（Next.js）です。UI、API Routes、リポジトリファクトリーを含みます。

## 概要

このパッケージは、Stock Tracker サービスのフロントエンドとバックエンド API を提供します。

- **フレームワーク**: Next.js 15 (App Router)
- **UI ライブラリ**: Material-UI v7
- **言語**: TypeScript
- **デプロイ**: AWS Lambda (Web Adapter)

## ディレクトリ構成

```
web/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes
│   └── (pages)/           # ページコンポーネント
├── components/            # UI コンポーネント
├── lib/                   # ライブラリ・ユーティリティ
│   ├── repository-factory.ts  # リポジトリファクトリー
│   ├── dynamodb.ts        # DynamoDB クライアント
│   └── ...
├── tests/                 # テストコード
│   └── e2e/              # E2E テスト（Playwright）
├── .env.test             # テスト環境用環境変数
├── playwright.config.ts  # Playwright 設定
└── next.config.js        # Next.js 設定
```

## セットアップ

### 前提条件

- Node.js 20.x
- npm 10.x
- モノレポのルートで `npm install` を実行済み

### 依存関係のインストール

モノレポのルートで実行:

```bash
npm install
```

### 環境変数の設定

開発環境用の `.env.local` を作成:

```bash
# Node Environment
NODE_ENV=development

# Application Configuration
APP_VERSION=0.0.0

# AWS Configuration
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=nagiyu-stock-tracker-main-dev

# NextAuth Configuration
AUTH_SECRET=your-secret-key-here

# Authentication skip for local development (optional)
SKIP_AUTH_CHECK=true
TEST_USER_EMAIL=test-admin@example.com
TEST_USER_ROLES=stock-admin

# Web Push (VAPID)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
```

## 開発

### 開発サーバーの起動

```bash
npm run dev --workspace=stock-tracker-web
```

ブラウザで http://localhost:3000 を開きます。

### ビルド

```bash
npm run build --workspace=stock-tracker-web
```

### 本番モードで実行

```bash
npm run start --workspace=stock-tracker-web
```

## リポジトリファクトリー

### 概要

Stock Tracker では、Repository Factory パターンを採用し、環境変数に基づいてリポジトリの実装を切り替えます。

**設計の目的**:
- **テスト容易性**: E2E テストでは DynamoDB への接続を回避し、インメモリリポジトリを使用
- **依存性の注入**: API エンドポイントはリポジトリインターフェースに依存し、具体的な実装に依存しない
- **保守性**: リポジトリの実装を変更してもエンドポイントのコードを変更する必要がない

### 使用方法

API Routes でリポジトリファクトリーを使用する例:

```typescript
// app/api/alerts/route.ts
import { createAlertRepository } from '../../../lib/repository-factory';

export async function GET(request: Request) {
  // リポジトリファクトリーからインスタンスを取得
  const alertRepo = createAlertRepository();
  
  // ビジネスロジックを実行
  const alerts = await alertRepo.getByUserId(userId);
  
  return Response.json(alerts);
}
```

### 環境変数による切り替え

環境変数 `USE_IN_MEMORY_REPOSITORY` により、リポジトリの実装が切り替わります:

| 環境変数の値 | 使用される実装 | 用途 |
|------------|--------------|------|
| `true` | InMemory リポジトリ | E2E テスト、ローカル開発 |
| 未設定または `false` | DynamoDB リポジトリ | 本番環境、dev 環境 |

**例**: `.env.test` に以下を設定すると、E2E テスト時にインメモリリポジトリが使用されます。

```bash
USE_IN_MEMORY_REPOSITORY=true
```

### 提供されるファクトリー関数

`lib/repository-factory.ts` は以下のファクトリー関数を提供します:

```typescript
// Alert リポジトリ
createAlertRepository(): IAlertRepository

// Holding リポジトリ
createHoldingRepository(): IHoldingRepository

// Ticker リポジトリ
createTickerRepository(): ITickerRepository

// Exchange リポジトリ
createExchangeRepository(): IExchangeRepository

// Watchlist リポジトリ
createWatchlistRepository(): IWatchlistRepository

// メモリストアのクリーンアップ（テスト用）
clearMemoryStore(): void
```

### インメモリリポジトリの仕組み

- すべてのインメモリリポジトリは、単一の `InMemorySingleTableStore` インスタンスを共有します
- シングルトンパターンにより、リポジトリインスタンスを再利用してパフォーマンスを最適化
- テスト終了時は `clearMemoryStore()` を呼び出してメモリをクリーンアップ

## テスト

### E2E テスト

**環境設定**:

E2E テストでは、インメモリリポジトリを使用します。`.env.test` ファイルに以下の環境変数を設定済みです:

```bash
# Repository type for E2E tests
USE_IN_MEMORY_REPOSITORY=true
```

**テスト実行**:

```bash
# 全デバイスでテスト実行
npm run test:e2e --workspace=stock-tracker-web

# 特定デバイスのみ（chromium-mobile）
npm run test:e2e --workspace=stock-tracker-web -- --project=chromium-mobile

# UI モード（開発時）
npm run test:e2e:ui --workspace=stock-tracker-web

# デバッグモード
npm run test:e2e --workspace=stock-tracker-web -- --debug
```

**インメモリリポジトリのメリット**:
- **高速化**: DynamoDB へのネットワーク接続が不要なため、テスト実行時間が短縮
- **安定性**: ネットワーク接続やクラウドサービスの状態に依存しないため、テストの安定性が向上
- **並列実行**: DynamoDB のスロットリングを気にせず、並列実行が可能
- **データクリーンアップ**: テスト終了時にメモリをクリアするだけでデータクリーンアップが完了

**テストデバイス**:
- `chromium-desktop`: デスクトップ Chrome (1920x1080)
- `chromium-mobile`: モバイル Chrome (Pixel 5 相当)
- `webkit-mobile`: モバイル Safari (iPhone 相当)

### ユニットテスト

ユニットテストは `core` パッケージで実行されます。詳細は `services/stock-tracker/core/README.md` を参照してください。

## Lint とフォーマット

### Lint の実行

```bash
npm run lint --workspace=stock-tracker-web
```

### フォーマットの実行

```bash
npm run format --workspace=stock-tracker-web
```

## デプロイ

### CI/CD による自動デプロイ

GitHub Actions により自動デプロイされます。詳細は [デプロイ・運用マニュアル](../../../docs/services/stock-tracker/deployment.md) を参照してください。

**デプロイフロー**:
1. Docker イメージのビルド
2. ECR へのプッシュ
3. Lambda 関数の更新

### 手動デプロイ（緊急時のみ）

```bash
# Docker イメージのビルド
docker build -t stock-tracker-web -f services/stock-tracker/web/Dockerfile .

# ECR ログイン
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# イメージのタグ付けとプッシュ
docker tag stock-tracker-web:latest <ecr-uri>:latest
docker push <ecr-uri>:latest

# Lambda 関数の更新
aws lambda update-function-code \
  --function-name stock-tracker-web-{env} \
  --image-uri <ecr-uri>:latest
```

## トラブルシューティング

### DynamoDB 接続エラー

**症状**: API エンドポイントで DynamoDB 接続エラーが発生する

**原因**: AWS 認証情報または環境変数の設定が不正

**解決方法**:
1. `.env.local` に `DYNAMODB_TABLE_NAME` が設定されているか確認
2. AWS 認証情報が正しく設定されているか確認（`aws configure` または環境変数）
3. または、ローカル開発時は `USE_IN_MEMORY_REPOSITORY=true` を設定してインメモリリポジトリを使用

### E2E テスト失敗

**症状**: E2E テストが失敗する

**解決方法**:
1. `.env.test` に `USE_IN_MEMORY_REPOSITORY=true` が設定されているか確認
2. Playwright のブラウザがインストールされているか確認: `npx playwright install`
3. テストを UI モードで実行して原因を特定: `npm run test:e2e:ui --workspace=stock-tracker-web`

### ビルドエラー

**症状**: `npm run build` でエラーが発生する

**解決方法**:
1. 依存関係を再インストール: `npm install`
2. TypeScript の型エラーを確認: `npm run type-check --workspace=stock-tracker-web`
3. 共通ライブラリをビルド: `npm run build --workspace=@nagiyu/stock-tracker-core`

## 参考ドキュメント

- [アーキテクチャ設計書](../../../docs/services/stock-tracker/architecture.md)
- [API 仕様書](../../../docs/services/stock-tracker/api-spec.md)
- [テスト仕様書](../../../docs/services/stock-tracker/testing.md)
- [デプロイ・運用マニュアル](../../../docs/services/stock-tracker/deployment.md)
- [要件定義書](../../../docs/services/stock-tracker/requirements.md)

## ライセンス

このプロジェクトは MIT License と Apache License 2.0 のデュアルライセンスです。

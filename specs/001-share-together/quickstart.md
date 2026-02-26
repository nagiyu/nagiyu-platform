# 開発者クイックスタート: みんなでシェアリスト (Share Together)

**ブランチ**: `copilot/define-requirements-again` | **日付**: 2025-06-12
**対応する計画**: [plan.md](./plan.md)

---

## 概要

このドキュメントは Share Together サービスの開発環境セットアップと日常的な開発ワークフローを説明する。

---

## 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Node.js | 22.x 以上 | ランタイム |
| npm | 10.x 以上 | パッケージマネージャー |
| AWS CLI | v2 | AWS リソース操作 |
| AWS CDK | v2 | インフラのデプロイ |
| Docker | 最新安定版 | コンテナビルド |

### AWS 認証

開発環境での AWS アクセスには IAM スタックで作成された開発用ユーザーの認証情報を使用する。

```bash
aws configure --profile share-together-dev
# AWS Access Key ID: <dev IAM ユーザーのキー>
# AWS Secret Access Key: <dev IAM ユーザーのシークレット>
# Default region name: ap-northeast-1
```

---

## リポジトリ構成の確認

```bash
# リポジトリのルートに移動
cd /path/to/nagiyu-platform

# Share Together 関連ディレクトリ
ls services/share-together/   # core/ + web/
ls infra/share-together/      # CDK スタック
ls specs/001-share-together/  # 設計ドキュメント
```

---

## 初回セットアップ

### 1. 依存関係のインストール

```bash
# リポジトリルートから全パッケージの依存関係をインストール
npm install
```

### 2. 環境変数の設定

#### `services/share-together/web/.env.local` の作成

```bash
cp services/share-together/web/.env.example services/share-together/web/.env.local
```

`.env.local` の内容:

```env
# Auth サービスの URL（dev 環境）
NEXT_PUBLIC_AUTH_URL=https://dev-auth.nagiyu.com

# NextAuth の設定
AUTH_SECRET=<Auth サービスと共有する JWT シークレット>

# AWS 設定（ローカル開発用）
AWS_REGION=ap-northeast-1
AWS_ACCESS_KEY_ID=<dev IAM ユーザーのキー>
AWS_SECRET_ACCESS_KEY=<dev IAM ユーザーのシークレット>

# DynamoDB テーブル名（dev 環境）
DYNAMODB_TABLE_NAME=nagiyu-share-together-main-dev
```

**注意**: `AUTH_SECRET` は Auth サービスと同一の値を設定すること（JWT の署名検証に使用）。

---

## 開発サーバーの起動

```bash
# core パッケージのビルド（初回・変更時）
npm run build --workspace @nagiyu/share-together-core

# web の開発サーバー起動
npm run dev --workspace @nagiyu/share-together-web
# → http://localhost:3000 でアクセス可能
```

### ローカル認証の注意事項

ローカル開発環境では Auth サービスへのリダイレクトが発生する。
ローカルで認証をバイパスする場合は、他サービス（stock-tracker 等）の開発環境セットアップガイドを参照すること。

---

## コードの品質チェック

```bash
# Lint チェック
npm run lint --workspace @nagiyu/share-together-core
npm run lint --workspace @nagiyu/share-together-web

# フォーマットチェック
npm run format:check --workspace @nagiyu/share-together-core
npm run format:check --workspace @nagiyu/share-together-web

# フォーマット自動修正
npm run format --workspace @nagiyu/share-together-core
npm run format --workspace @nagiyu/share-together-web
```

---

## テストの実行

### ユニットテスト

```bash
# core のユニットテスト
npm run test --workspace @nagiyu/share-together-core

# web のユニットテスト
npm run test --workspace @nagiyu/share-together-web

# カバレッジレポート付き
npm run test:coverage --workspace @nagiyu/share-together-core
```

カバレッジ目標: `core` のビジネスロジック（`src/libs/`）で **80% 以上**。

### E2E テスト

```bash
# web の E2E テスト（chromium-mobile のみ: fast CI 相当）
npm run test:e2e --workspace @nagiyu/share-together-web -- --project=chromium-mobile

# 全デバイスで E2E テスト（full CI 相当）
npm run test:e2e --workspace @nagiyu/share-together-web

# UI モードで実行（デバッグ用）
npm run test:e2e:ui --workspace @nagiyu/share-together-web
```

E2E テストのデバイス構成:
- `chromium-desktop`: デスクトップブラウザ
- `chromium-mobile`: Pixel 5（モバイル、**優先デバイス**）
- `webkit-mobile`: iPhone（モバイル）

---

## インフラのデプロイ

### CDK のセットアップ

```bash
cd infra/share-together
npm install
npx cdk bootstrap  # 初回のみ
```

### dev 環境へのデプロイ

```bash
cd infra/share-together

# DynamoDB のデプロイ
npx cdk deploy NagiyuShareTogetherDynamoDBDev -c env=dev

# ECR のデプロイ
npx cdk deploy NagiyuShareTogetherECRDev -c env=dev

# Lambda のデプロイ（コンテナイメージが ECR に push 済みであること）
npx cdk deploy NagiyuShareTogetherLambdaDev -c env=dev \
  -c nextAuthSecret=<シークレット>

# IAM のデプロイ（dev 環境のみ）
npx cdk deploy NagiyuShareTogetherIAMDev -c env=dev

# CloudFront のデプロイ
npx cdk deploy NagiyuShareTogetherCloudFrontDev -c env=dev
```

### コンテナイメージのビルドと ECR への push

```bash
# web のコンテナビルド
cd services/share-together/web
docker build -t share-together-web .

# ECR へのタグ付けと push
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.ap-northeast-1.amazonaws.com/nagiyu-share-together-web-dev"

aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin "${ECR_URI}"

docker tag share-together-web:latest "${ECR_URI}:latest"
docker push "${ECR_URI}:latest"
```

---

## サービスのアクセス URL

| 環境 | URL |
|------|-----|
| ローカル開発 | http://localhost:3000 |
| dev 環境 | https://dev-share-together.nagiyu.com |
| prod 環境 | https://share-together.nagiyu.com |

---

## ブランチ戦略とPR フロー

```
feature/ShareTogether/{description}
    │
    ▼ PR（fast CI: lint + unit + E2E mobile）
integration/ShareTogether
    │
    ▼ PR（full CI: lint + unit + coverage + E2E 全デバイス）
develop
    │
    ▼ PR（自動デプロイ → 本番）
master
```

### ブランチ命名規則

| 種別 | 形式 | 例 |
|------|------|----|
| 作業ブランチ | `feature/ShareTogether/{description}` | `feature/ShareTogether/add-todo-api` |
| 統合ブランチ | `integration/ShareTogether` | - |

---

## 設計ドキュメント

| ドキュメント | 内容 |
|------------|------|
| [spec.md](./spec.md) | 機能仕様書（ユーザーストーリー・要件） |
| [plan.md](./plan.md) | 実装計画（技術コンテキスト・プロジェクト構成） |
| [research.md](./research.md) | 技術調査レポート（設計判断の根拠） |
| [data-model.md](./data-model.md) | DynamoDB データモデル（エンティティ・アクセスパターン） |
| [contracts/api.md](./contracts/api.md) | REST API コントラクト（エンドポイント仕様） |

---

## よくある質問

### Q: DynamoDB のローカルエミュレーターは使えますか？

本プラットフォームでは DynamoDB Local ではなく、dev 環境の実 DynamoDB を使用する。
IAM スタック（dev 環境）で作成された開発用ユーザーの認証情報を使って直接アクセスする。

### Q: 認証なしでローカル開発するには？

他サービス（stock-tracker 等）の実装パターンを参考にして、`NODE_ENV=development` 時の認証バイパス設定を web サービスに実装する。
詳細は実装フェーズのタスクで指定される。

### Q: グループ削除時のカスケード削除はどのように実装しますか？

`core/src/libs/group.ts` にカスケード削除のビジネスロジックを実装し、DynamoDB の `BatchWriteItem` を使って関連アイテムをまとめて削除する。
アイテム数が 25 件（BatchWriteItem の上限）を超える場合は複数バッチに分割する。
詳細は [research.md](./research.md) の「7. グループ削除時のカスケード削除」を参照。

### Q: PWA のプッシュ通知はどこに実装しますか？

MVP v1 ではプッシュ通知は実装しない。`public/sw.js` にコメントアウト形式でシェルコードを残す。
将来バージョンで実装する際は `batch` パッケージと `infra/share-together/lib/sns-stack.ts`・`eventbridge-stack.ts` を追加する。

### Q: `AUTH_SECRET` はどこで確認できますか？

Auth サービスのシークレット管理（AWS Secrets Manager）から取得する。詳細は Auth サービスの管理者に確認すること。

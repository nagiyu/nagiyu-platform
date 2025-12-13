# quickstart.md — ローカル開発と最短実行手順

以下は Phase 1 をローカルで試すための最短手順の案です。実環境での動作は AWS 設定が必要です。

## 前提
- Node.js（実装時点での最新 LTS または推奨される最新安定版）
- Docker
- AWS CLI（実環境へアクセスする場合）

## 1) リポジトリの依存をインストール

```bash
# リポジトリルート
cd /workspaces/nagiyu-platform/apps/codec-converter
npm install
```

## 2) ローカルで Next.js を起動（API ルートの動作確認）

```bash
# 開発サーバー (Next.js)
npm run dev
# ブラウザで http://localhost:3000 を開く
```

注: 実際の S3 / DynamoDB / Batch への接続が必要な API を動かすには AWS 資格情報が必要です。ローカル検証は `localstack` を導入するか、本番と同一の AWS 環境を用意して行ってください。

## 3) Worker コンテナをビルド（Batch 用）

```bash
# services/codec-converter-worker に移動
cd /workspaces/nagiyu-platform/services/codec-converter-worker
docker build -t codec-converter-worker:local .
```

## 4) GitHub Actions での流れ（概略）
- PR: lint/test を実行（Jest, ESLint）
- main/develop: コンテナビルド → ECR push → CDK deploy（手動承認を追加推奨）

## 5) 重要: AWS リソースの設定
- S3 バケット（uploads/ と outputs/ プレフィックス）
- DynamoDB テーブル（TTL 設定）
- AWS Batch (Fargate) の Compute Environment, Job Queue, Job Definition
- ECR リポジトリ（worker と Next.js コンテナ）

## 6) テスト実行

```bash
# Next.js アプリのユニットテスト
npm test

# E2E (Playwright) は別途環境設定後に実行
npx playwright test
```

---

次のステップ: `data-model.md` と `contracts/openapi.yaml` を参照して、実装に必要な API ハンドラと DynamoDB スキーマを実装します。
# Codec Converter インフラストラクチャ

Codec Converter サービスの AWS CDK プロジェクト

## 概要

この CDK プロジェクトは以下の AWS リソースをプロビジョニングします：

- **S3 バケット**: 入力/出力動画ファイルのストレージ
  - バケット名: `nagiyu-codec-converter-storage-{env}`
  - SSE-S3 暗号化有効
  - 24時間ライフサイクルポリシー（自動削除）
  - CORS 設定（ブラウザアップロード対応）
  - プライベートアクセス（Presigned URL のみ）

- **DynamoDB テーブル**: ジョブ管理
  - テーブル名: `nagiyu-codec-converter-jobs-{env}`
  - パーティションキー: `jobId` (String)
  - TTL 有効（`expiresAt` 属性）
  - オンデマンド課金モード

## 前提条件

- AWS CLI が適切な認証情報で設定されていること
- Node.js >= 22.0.0
- npm >= 10.0.0

## 使用方法

### 依存関係のインストール

```bash
npm install
```

### プロジェクトのビルド

```bash
npm run build
```

### CloudFormation テンプレートの合成

```bash
npx cdk synth
```

### dev 環境へのデプロイ

```bash
npx cdk deploy --context env=dev
```

### prod 環境へのデプロイ

```bash
npx cdk deploy --context env=prod
```

### カスタム CORS オリジンを指定してデプロイ

```bash
npx cdk deploy --context env=dev --context allowedOrigin=https://your-custom-domain.com
```

### スタックの削除

```bash
npx cdk destroy --context env=dev
```

## 設定

スタックは以下のコンテキストパラメータを受け付けます：

- `env`: 環境名（デフォルト: `dev`）
  - リソース命名に使用: `nagiyu-codec-converter-{resource}-{env}`
- `allowedOrigin`: CORS 許可オリジン（デフォルト: `https://codec-converter.nagiyu.com`）
  - S3 へのクロスオリジンリクエストを許可するオリジンを設定

## 便利なコマンド

* `npm run build`   TypeScript から JavaScript へコンパイル
* `npm run watch`   変更を監視してコンパイル
* `npm run test`    Jest 単体テストを実行
* `npx cdk deploy`  デフォルトの AWS アカウント/リージョンにスタックをデプロイ
* `npx cdk diff`    デプロイ済みスタックと現在の状態を比較
* `npx cdk synth`   合成された CloudFormation テンプレートを出力

## アーキテクチャ

システム全体のアーキテクチャに関する詳細は [アーキテクチャドキュメント](../../services/codec-converter/architecture.md) を参照してください。

## CDK プロジェクトの場所

CDK TypeScript コードは `/infra/codec-converter/` に配置されています。

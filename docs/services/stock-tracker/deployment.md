# Stock Tracker デプロイ・運用マニュアル

本ドキュメントは、Stock Tracker のデプロイと運用に関する概要を説明します。

## 1. 環境構成

### 1.1 環境一覧

| 環境        | 用途                     | デプロイ元ブランチ          | URL                                       |
| ----------- | ------------------------ | --------------------------- | ----------------------------------------- |
| dev (開発)  | 開発・テスト環境         | `develop`, `integration/**` | `https://dev-stock-tracker.nagiyu.com`    |
| prod (本番) | 本番環境（実運用）       | `master`                    | `https://stock-tracker.nagiyu.com`        |

### 1.2 リソース構成

**主要リソース**:

- **Lambda (Web)**: Next.js アプリケーション実行
- **Lambda (Batch)**: 定期実行バッチ処理（3関数: minute/hourly/daily）
- **DynamoDB**: Single Table Design
- **CloudFront**: CDN 配信
- **ECR**: Docker イメージ格納（Web/Batch の2リポジトリ）
- **EventBridge Scheduler**: バッチ処理のトリガー
- **Secrets Manager**: VAPID キー、NextAuth Secret
- **CloudWatch**: ログ保存、監視アラーム
- **SNS**: アラーム通知先

**インフラ定義**: `infra/stock-tracker/lib/`

---

## 2. デプロイ

### 2.1 自動デプロイ（推奨）

GitHub Actions によるデプロイが基本です。

**ワークフロー**:
- `.github/workflows/stock-tracker-deploy.yml`

**トリガー**:
- `develop`, `integration/**` → dev 環境へ自動デプロイ
- `master` → prod 環境へ自動デプロイ

**デプロイフロー**:
1. 共通ライブラリのビルド
2. Docker イメージのビルド（Web/Batch）
3. ECR へのプッシュ
4. CDK デプロイ

### 2.2 初回セットアップ

初回デプロイ時のみ、以下の手順が必要です:

1. **Secrets スタックデプロイ**: VAPID キー用の Secrets Manager リソース作成
2. **VAPID キー生成**: 実際の VAPID キーを生成して Secrets Manager に設定
3. **ECR リポジトリ作成**: コンテナイメージ格納用リポジトリの作成
4. **初回 Docker イメージプッシュ**: GitHub Actions で自動実行

詳細な手順は CDK プロジェクト（`infra/stock-tracker/`）の README を参照してください。

### 2.3 手動デプロイ（緊急時のみ）

CI/CD が利用できない緊急時のみ、手動デプロイを実施します。

**Web Lambda の更新**:
```bash
# Docker イメージのビルドとプッシュ
docker build -t stock-tracker-web -f services/stock-tracker/web/Dockerfile .
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker tag stock-tracker-web:latest <ecr-uri>:latest
docker push <ecr-uri>:latest

# Lambda 関数の更新
aws lambda update-function-code \
  --function-name stock-tracker-web-{env} \
  --image-uri <ecr-uri>:latest
```

**Batch Lambda の更新**: 同様の手順で Batch 用イメージをビルド・プッシュ

---

## 3. 運用

### 3.1 監視

**CloudWatch Logs**:
- ログ保持期間: 30日
- Log Group: `/aws/lambda/stock-tracker-{component}-{env}`

**CloudWatch Alarms**:
- Lambda エラー率: 5%以上で警告（品質低下の早期検知）
- Lambda 実行時間: タイムアウト値の80%以上で警告（処理遅延の検知）
- DynamoDB スロットリング: 発生時に警告（キャパシティ不足の検知）
- 通知先: SNS Topic（メール通知）

**監視方針**: 異常を早期検知し、ユーザー影響が出る前に対処できるよう閾値を設定

### 3.2 トラブルシューティング

**ログ確認**:
```bash
aws logs tail /aws/lambda/stock-tracker-web-{env} --follow
```

**メトリクス確認**:
- AWS コンソール → CloudWatch → Metrics
- Lambda 関数別、エラー率、実行時間、同時実行数を確認

**一般的な問題**:
- **Lambda タイムアウト**: メモリ・タイムアウト設定を確認（CDK コード）
- **DynamoDB スロットリング**: 読み取り/書き込みキャパシティを確認
- **Web Push 失敗**: VAPID キー設定、サブスクリプション有効期限を確認

### 3.3 ロールバック

**推奨方法**:
1. `git revert` で問題のコミットを取り消し
2. develop/master にマージ
3. GitHub Actions で自動デプロイ

**緊急時の手動ロールバック**:
```bash
# Lambda 関数の以前のイメージに戻す
aws lambda update-function-code \
  --function-name stock-tracker-web-{env} \
  --image-uri <previous-ecr-uri>
```

### 3.4 バージョン管理

Semantic Versioning に準拠し、`package.json` の `version` フィールドで管理します。

---

## 4. 環境変数

主要な環境変数は CDK デプロイ時に自動設定されます。

**Web Lambda**:
- `DYNAMODB_TABLE_NAME`: DynamoDB テーブル名
- `NEXTAUTH_SECRET`: 認証シークレット（Secrets Manager から取得）
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Web Push 用 VAPID キー（Secrets Manager から取得）
- `TRADINGVIEW_*`: TradingView API 設定

**Batch Lambda**:
- `DYNAMODB_TABLE_NAME`: DynamoDB テーブル名
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`: Web Push 用 VAPID キー（Secrets Manager から自動注入）
- `BATCH_LEVEL`: バッチレベル（MINUTE_LEVEL / HOURLY_LEVEL / DAILY_LEVEL）
- `TRADINGVIEW_*`: TradingView API 設定

**テスト環境専用の環境変数**:
- `USE_IN_MEMORY_REPOSITORY`: インメモリリポジトリの使用フラグ（E2E テスト時に `true` を設定）
    - `true`: インメモリリポジトリを使用（DynamoDB への接続なし）
    - 未設定または `false`: DynamoDB リポジトリを使用（デフォルト）
    - 用途: E2E テスト実行時に DynamoDB への接続を回避し、テストの高速化と安定性向上を実現
    - 設定場所: `services/stock-tracker/web/.env.test`

**環境変数管理の方針**: 
- 機密情報は Secrets Manager で管理し、デプロイ時に自動注入することでセキュリティを確保
- テスト環境固有の設定は `.env.test` で管理し、本番環境の設定とは分離

---

## 5. 参考リンク

- [アーキテクチャ設計書](./architecture.md)
- [API 仕様書](./api-spec.md)
- CDK プロジェクト: `infra/stock-tracker/`
- GitHub Actions ワークフロー: `.github/workflows/stock-tracker-*.yml`

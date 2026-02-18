# Admin サービス デプロイ・運用マニュアル

本ドキュメントは、Admin サービスのデプロイと運用に関する手順を説明します。

---

## 1. 環境構成

### 1.1 環境一覧

| 環境        | 用途                     | デプロイ元ブランチ          | URL                          |
| ----------- | ------------------------ | --------------------------- | ---------------------------- |
| dev (開発)  | 開発・動作確認           | `develop`, `integration/**` | `https://admin-dev.nagiyu.com` |
| prod (本番) | 本番環境                 | `master`                    | `https://admin.nagiyu.com`   |

### 1.2 リソース構成

**主要リソース**:

- **AWS Lambda**: Next.js アプリケーションの実行環境（コンテナイメージ）
- **Amazon CloudFront**: グローバル配信、エッジキャッシング
- **Amazon ECR**: Docker イメージ保存
- **AWS CDK**: インフラストラクチャコード（TypeScript）

**インフラ定義の場所**:

- CDK スタック: `infra/admin/lib/`

### 1.3 環境ごとのリソース名

| リソース           | dev 環境                          | prod 環境                          |
| ------------------ | --------------------------------- | ---------------------------------- |
| Lambda 関数        | `admin-dev`                       | `admin-prod`                       |
| ECR リポジトリ     | `admin-dev`                       | `admin-prod`                       |
| CloudFront         | `admin-dev.nagiyu.com`            | `admin.nagiyu.com`                 |
| CloudWatch Logs    | `/aws/lambda/admin-dev`           | `/aws/lambda/admin-prod`           |

---

## 2. 前提条件

### 2.1 共有インフラ

以下がデプロイ済みであることを確認してください:

- [ ] **VPC**: `nagiyu-{env}-vpc` - [共有インフラ: VPC](../../infra/shared/vpc.md) 参照
- [ ] **ACM 証明書** (CloudFront 用): [共有インフラ: ACM](../../infra/shared/acm.md) 参照
- [ ] **Route 53 ホストゾーン**: `nagiyu.com` のドメイン管理

### 2.2 必要なツール

- Node.js（バージョンは `package.json` に記載）
- AWS CLI
- Docker
- AWS CDK CLI

### 2.3 認証情報

#### GitHub Actions Secrets

以下が GitHub リポジトリの Secrets に設定されていることを確認:

| Name                    | 説明                                   |
| ----------------------- | -------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー ID          |
| `AWS_SECRET_ACCESS_KEY` | IAM ユーザーのシークレットアクセスキー |
| `AWS_REGION`            | デプロイ先リージョン (`us-east-1`)     |

---

## 3. 初回セットアップ

### 3.1 手順概要

1. **ECR リポジトリ作成**: コンテナイメージ格納用リポジトリの作成
2. **Docker イメージビルド**: アプリケーションのコンテナイメージを作成
3. **インフラデプロイ**: Lambda, CloudFront などのリソースをデプロイ
4. **動作確認**: ヘルスチェック・機能確認

### 3.2 ECR リポジトリの作成

```bash
# 開発環境
npm run deploy -w @nagiyu/admin-infra -- --context env=dev --context deploymentPhase=ecr-only

# 本番環境
npm run deploy -w @nagiyu/admin-infra -- --context env=prod --context deploymentPhase=ecr-only
```

### 3.3 Docker イメージのビルドとプッシュ

```bash
# 1. ECR にログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド
docker build -t admin:latest -f services/admin/web/Dockerfile .

# 3. タグ付け
docker tag admin:latest <ECR_REGISTRY>/admin-dev:latest

# 4. プッシュ
docker push <ECR_REGISTRY>/admin-dev:latest
```

### 3.4 アプリケーションリソースのデプロイ

```bash
# 開発環境
npm run deploy -w @nagiyu/admin-infra -- --context env=dev --context deploymentPhase=full

# 本番環境
npm run deploy -w @nagiyu/admin-infra -- --context env=prod --context deploymentPhase=full
```

### 3.5 動作確認

```bash
# Lambda 関数の確認
aws lambda get-function \
    --function-name admin-dev \
    --region us-east-1

# ヘルスチェック
curl https://admin-dev.nagiyu.com/api/health
```

**期待される応答**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-13T03:00:00.000Z"
}
```

---

## 4. CI/CD パイプライン

### 4.1 ワークフロー概要

Admin サービスでは、以下の GitHub Actions ワークフローを使用します:

#### 1. 高速検証ワークフロー (`.github/workflows/admin-verify-fast.yml`)

**目的**: integration/\*\* ブランチへのプルリクエスト時に素早いフィードバックを提供

**トリガー条件**:

```yaml
on:
  pull_request:
    branches:
      - integration/**
    paths:
      - 'services/admin/**'
      - 'libs/**'
      - 'infra/admin/**'
```

**ジョブ構成**:

1. **build**: Next.js アプリケーションのビルド検証
2. **docker-build**: Docker イメージのビルド検証
3. **test**: 単体テストの実行
4. **e2e-test**: E2Eテストの実行（chromium-mobile のみ）
5. **lint**: ESLint チェック
6. **format-check**: Prettier フォーマットチェック

#### 2. 完全検証ワークフロー (`.github/workflows/admin-verify-full.yml`)

**目的**: develop ブランチへのプルリクエスト時に完全な品質検証を実施

**トリガー条件**:

```yaml
on:
  pull_request:
    branches:
      - develop
    paths:
      - 'services/admin/**'
      - 'libs/**'
      - 'infra/admin/**'
```

**ジョブ構成**:

1. **build**: Next.js アプリケーションのビルド検証
2. **docker-build**: Docker イメージのビルド検証
3. **test**: 単体テストの実行
4. **coverage**: テストカバレッジチェック（80%以上必須）
5. **e2e-test**: E2Eテストの実行（全デバイス: chromium-desktop, chromium-mobile, webkit-mobile）
6. **lint**: ESLint チェック
7. **format-check**: Prettier フォーマットチェック

#### 3. デプロイワークフロー (`.github/workflows/admin-deploy.yml`)

**目的**: develop, integration/\*\*, master ブランチへのプッシュ時に自動デプロイ

**トリガー条件**:

```yaml
on:
  push:
    branches:
      - develop
      - integration/**
      - master
    paths:
      - 'services/admin/**'
      - 'infra/admin/**'
```

**ジョブ構成**:

1. **infrastructure**: ECR リポジトリの CDK スタックデプロイ
2. **build**: Docker イメージのビルドと ECR へのプッシュ
3. **deploy**: Lambda と CloudFront の CDK デプロイ
4. **verify**: デプロイ後のヘルスチェック

### 4.2 ブランチ戦略とデプロイフロー

プラットフォーム共通のブランチ戦略とCI/CD戦略については、[ブランチ戦略](../../branching.md) を参照してください。

**概要**:
- `feature/**` → `integration/**` → `develop` → `master` の順にマージ
- `integration/**` および `develop` へのプッシュで開発環境へ自動デプロイ
- `master` へのプッシュで本番環境へ自動デプロイ
- PR検証は2段階（Fast CI / Full CI）

### 4.3 GitHub Secrets の設定

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を確認:

| Name                    | 説明                                   | 設定済み                   |
| ----------------------- | -------------------------------------- | -------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー ID          | ✓ (共通インフラで設定済み) |
| `AWS_SECRET_ACCESS_KEY` | IAM ユーザーのシークレットアクセスキー | ✓ (共通インフラで設定済み) |
| `AWS_REGION`            | デプロイ先リージョン                   | ✓ (共通インフラで設定済み) |

### 4.4 ワークフロー実行例

#### プルリクエスト作成時

```bash
# feature ブランチから integration/** へのプルリクエスト作成
git checkout -b feature/new-feature
git push origin feature/new-feature

# GitHub でプルリクエストを integration/feature-test ブランチに作成
# → admin-verify-fast.yml が自動実行される
#   ✓ ビルド検証
#   ✓ 単体テスト実行
#   ✓ E2Eテスト実行（chromium-mobile のみ）
#   ✓ リントチェック
# → すべて成功でマージ可能

# integration/** ブランチから develop へのプルリクエスト作成
# → admin-verify-full.yml が自動実行される
#   ✓ ビルド検証
#   ✓ Docker ビルド検証
#   ✓ 単体テスト実行
#   ✓ カバレッジチェック（80%以上）
#   ✓ E2Eテスト実行（全デバイス）
#   ✓ リントチェック
#   ✓ フォーマットチェック
# → すべて成功でマージ可能
```

#### マージ後のデプロイ

```bash
# プルリクエストをマージ
# → develop ブランチに push される
# → admin-deploy.yml が自動実行される
#   1. ECR の CDK スタックデプロイ
#   2. Docker イメージビルド & プッシュ
#   3. Lambda の CDK デプロイ
#   4. CloudFront の CDK デプロイ
#   5. ヘルスチェック
# → 開発環境へデプロイ完了
```

---

## 5. 手動デプロイ

### 5.1 Docker イメージの手動デプロイ

```bash
# 1. ECR ログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド
docker build -t admin:latest -f services/admin/web/Dockerfile .

# 3. タグ付け & プッシュ
docker tag admin:latest <ECR_REGISTRY>/admin-dev:latest
docker push <ECR_REGISTRY>/admin-dev:latest
```

### 5.2 Lambda 関数の手動更新

```bash
aws lambda update-function-code \
    --function-name admin-dev \
    --image-uri <ECR_REGISTRY>/admin-dev:latest \
    --region us-east-1
```

---

## 6. 環境変数管理

### 6.1 環境変数一覧

| 環境変数                | 説明                                          | 例                             | 必須 |
| ----------------------- | --------------------------------------------- | ------------------------------ | ---- |
| `NEXT_PUBLIC_AUTH_URL`  | Auth サービスの URL                           | `https://auth-dev.nagiyu.com`  | ✅   |
| `JWT_SECRET_KEY`        | JWT 検証用の秘密鍵                            | `<secret-key>`                 | ✅   |
| `NODE_ENV`              | 実行環境                                      | `production`                   | ✅   |
| `SKIP_AUTH_CHECK`       | 認証チェックをスキップ（テスト環境のみ）      | `true`                         | ❌   |

### 6.2 環境変数の設定方法

**CDK での設定**:

環境変数は CDK スタックで自動的に設定されます:

```typescript
// lib/admin-stack.ts
environment: {
  NEXT_PUBLIC_AUTH_URL: `https://auth-${env}.nagiyu.com`,
  JWT_SECRET_KEY: secretKey.secretValue.unsafeUnwrap(),
  NODE_ENV: 'production',
}
```

**手動設定（緊急時）**:

```bash
aws lambda update-function-configuration \
    --function-name admin-dev \
    --environment Variables="{NEXT_PUBLIC_AUTH_URL=https://auth-dev.nagiyu.com}" \
    --region us-east-1
```

---

## 7. ログ管理・監視

### 7.1 ログの確認

**Lambda ログ**:

- ロググループ: `/aws/lambda/admin-{env}`
- 保持期間: 7日

**ログの確認方法**:

```bash
# ログのリアルタイム確認
aws logs tail /aws/lambda/admin-dev --follow

# 特定期間のログ検索
aws logs filter-log-events \
    --log-group-name /aws/lambda/admin-dev \
    --start-time $(date -d '1 hour ago' +%s)000 \
    --filter-pattern "ERROR"
```

### 7.2 メトリクスとアラート

**Lambda メトリクス**:

- 実行時間 (Duration)
- エラー率 (Errors)
- 同時実行数 (ConcurrentExecutions)
- スロットル (Throttles)

### 7.3 推奨アラート設定

| アラート項目         | 閾値   | アクション                     |
| -------------------- | ------ | ------------------------------ |
| Lambda エラー率      | > 5%   | SNS 通知                       |
| Lambda 実行時間      | > 10秒 | SNS 通知                       |
| Lambda スロットル    | > 0    | 同時実行数の上限を確認         |

---

## 8. 運用手順

### 8.1 バージョン管理

#### 8.1.1 バージョン番号のルール

本プロジェクトは [Semantic Versioning](https://semver.org/) に準拠します:

- **メジャー (X.0.0)**: 破壊的変更
- **マイナー (0.X.0)**: 新機能追加（後方互換性あり）
- **パッチ (0.0.X)**: バグ修正

#### 8.1.2 バージョン管理の Single Source of Truth

**`services/admin/web/package.json` の `version` フィールドがすべてのバージョン情報の唯一の真実の情報源です。**

#### 8.1.3 バージョン更新手順

```bash
# パッチバージョンアップ（例: 0.1.0 → 0.1.1）
npm version patch -w @nagiyu/admin

# マイナーバージョンアップ（例: 0.1.0 → 0.2.0）
npm version minor -w @nagiyu/admin

# メジャーバージョンアップ（例: 0.1.0 → 1.0.0）
npm version major -w @nagiyu/admin
```

**注**: `npm version` コマンドは自動的に Git タグとコミットを作成します。

### 8.2 スケーリング対応

Lambda は自動スケーリングされます。必要に応じて以下を調整:

- メモリサイズ: 1024 MB（Phase 1）
- タイムアウト: 30秒
- 予約済み同時実行数: 未設定（必要に応じて設定）

### 8.3 セキュリティアップデート

依存パッケージの定期的な更新を実施してください。

```bash
# セキュリティ脆弱性のチェック
npm audit

# 脆弱性の自動修正
npm audit fix

# 破壊的変更を含む修正
npm audit fix --force
```

---

## 9. 障害対応

### 9.1 ロールバック手順

#### GitHub Actions からのロールバック

1. 前のコミットに戻す
2. 再度プッシュして自動デプロイを実行

```bash
git revert HEAD
git push origin develop
```

#### 手動ロールバック

```bash
# 前のイメージタグを確認
aws ecr describe-images --repository-name admin-dev --region us-east-1

# 前のイメージタグを指定してロールバック
aws lambda update-function-code \
    --function-name admin-dev \
    --image-uri <ECR_REGISTRY>/admin-dev:<PREVIOUS_TAG> \
    --region us-east-1
```

### 9.2 よくある障害と対処法

#### デプロイが失敗する

**症状**: GitHub Actions のワークフローが失敗する

**原因と対処**:

- ECR ログインエラー → IAM ロールの権限を確認
- Lambda 更新エラー → Lambda 関数が存在するか確認
- ヘルスチェック失敗 → エンドポイントの実装を確認

#### Lambda が起動しない

**症状**: Function URL にアクセスできない

**原因と対処**:

- Docker イメージのビルドエラー → ローカルでイメージをビルドしてテスト
- 環境変数の設定ミス → Lambda の環境変数を確認
- メモリ不足 → Lambda のメモリサイズを増やす

#### PR検証ワークフローが失敗する

**症状**: プルリクエストのチェックが失敗する

**デバッグ方法**:

```bash
# ローカルで PR検証と同じステップを実行

# 1. ビルド検証
npm run build -w @nagiyu/admin

# 2. Docker ビルド検証
docker build -t admin-pr-test -f services/admin/web/Dockerfile .

# 3. E2Eテスト実行
npm run test:e2e -w @nagiyu/admin
```

---

## 参考資料

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)
- [プラットフォームブランチ戦略](../../branching.md)
- [プラットフォーム開発ガイドライン](../../development/rules.md)
- [共有インフラドキュメント](../../infra/README.md)

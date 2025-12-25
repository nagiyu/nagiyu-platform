# Toolsアプリ デプロイ・運用マニュアル

本ドキュメントは、Tools アプリのデプロイと運用に関する手順を説明します。

---

## 1. インフラ構築

### 1.1 CloudFormationスタック作成手順

Tools アプリのインフラは以下の CloudFormation スタックで構成されます:

1. **ECR リポジトリ** (`infra/tools/ecr.yaml`)
2. **Lambda 関数** (`infra/tools/lambda.yaml`)
3. **CloudFront ディストリビューション** (`infra/tools/cloudfront.yaml`)

### 1.2 初回セットアップ

**リージョン戦略:**
- **すべてのリソース**: `us-east-1` (バージニア北部)
    - CloudFront 用 ACM 証明書との統一
    - シンプルなリソース管理
    - クロスリージョン設定の複雑さを回避

#### ECR リポジトリの作成

```bash
# 開発環境
aws cloudformation deploy \
    --template-file infra/tools/ecr.yaml \
    --stack-name nagiyu-tools-ecr-dev \
    --parameter-overrides Environment=dev \
    --region us-east-1

# 本番環境
aws cloudformation deploy \
    --template-file infra/tools/ecr.yaml \
    --stack-name nagiyu-tools-ecr-prod \
    --parameter-overrides Environment=prod \
    --region us-east-1
```

#### Lambda 関数の作成

```bash
# 開発環境
aws cloudformation deploy \
    --template-file infra/tools/lambda.yaml \
    --stack-name nagiyu-tools-lambda-dev \
    --parameter-overrides Environment=dev ImageUri=<ECR_IMAGE_URI> \
    --region us-east-1

# 本番環境
aws cloudformation deploy \
    --template-file infra/tools/lambda.yaml \
    --stack-name nagiyu-tools-lambda-prod \
    --parameter-overrides Environment=prod ImageUri=<ECR_IMAGE_URI> \
    --region us-east-1
```

#### CloudFront ディストリビューションの作成

**前提条件**: ACM 証明書が `us-east-1` リージョンに作成済みであること ([共通インフラ - ACM](../../infra/shared/acm.md) 参照)

```bash
# 開発環境
aws cloudformation deploy \
    --template-file infra/tools/cloudfront.yaml \
    --stack-name nagiyu-tools-cloudfront-dev \
    --parameter-overrides \
        Environment=dev \
        LambdaStackName=nagiyu-tools-lambda-dev \
        CertificateArn=<ACM_CERTIFICATE_ARN> \
        DomainName=dev-tools.example.com \
    --region us-east-1

# 本番環境
aws cloudformation deploy \
    --template-file infra/tools/cloudfront.yaml \
    --stack-name nagiyu-tools-cloudfront-prod \
    --parameter-overrides \
        Environment=prod \
        LambdaStackName=nagiyu-tools-lambda-prod \
        CertificateArn=<ACM_CERTIFICATE_ARN> \
        DomainName=tools.example.com \
    --region us-east-1
```

**注意**: すべてのリソースを `us-east-1` に配置することで、CloudFormation のクロスリージョンエクスポート/インポートの問題を回避し、管理を簡素化します。

### 1.3 環境ごとの設定

- **開発環境**: `develop`, `integration/**` ブランチからデプロイ
- **本番環境**: `master` ブランチからデプロイ

---

## 2. デプロイ手順

### 2.1 手動デプロイ

#### Docker イメージのビルドとプッシュ

```bash
# ECR ログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# イメージのビルド（モノレポルートから実行）
docker build -t tools-app:latest -f services/tools/Dockerfile .

# タグ付け
docker tag tools-app:latest <ECR_REGISTRY>/tools-app-dev:latest

# プッシュ
docker push <ECR_REGISTRY>/tools-app-dev:latest
```

#### Lambda 関数の更新

```bash
aws lambda update-function-code \
    --function-name tools-app-dev \
    --image-uri <ECR_REGISTRY>/tools-app-dev:latest \
    --region us-east-1
```

### 2.2 GitHub Actionsによる自動デプロイ

#### 前提条件

GitHub Actions で自動デプロイを行うには、既存の IAM ユーザー (`nagiyu-github-actions`) の認証情報が必要です。

IAM ユーザーは `infra/shared/iam/users/github-actions-user.yaml` で定義されており、以下のポリシーがアタッチされています:
- `nagiyu-deploy-policy-core`
- `nagiyu-deploy-policy-container` (ECR 権限を含む)
- `nagiyu-deploy-policy-application` (Lambda 権限を含む)
- `nagiyu-deploy-policy-integration`

#### GitHub Secrets の設定

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を確認:

| Name | 説明 | 設定済み |
|------|------|---------|
| `AWS_ACCESS_KEY_ID` | IAM ユーザーのアクセスキー ID | ✓ (共通インフラで設定済み) |
| `AWS_SECRET_ACCESS_KEY` | IAM ユーザーのシークレットアクセスキー | ✓ (共通インフラで設定済み) |
| `AWS_REGION` | デプロイ先リージョン (`us-east-1`) | ✓ (共通インフラで設定済み) |

**注意**: これらのシークレットは既存の共通インフラワークフロー (ACM, VPC など) と共有されます。

#### ワークフロー詳細

ワークフローファイル: `.github/workflows/tools-deploy.yml`

**完全自動化:**
- インフラ (ECR, Lambda, CloudFront) の CloudFormation スタックもワークフロー内で自動デプロイ
- 手動でのインフラセットアップは不要
- CloudFormation テンプレートがリポジトリに含まれているため、変更があれば自動で反映
- ACM 証明書とドメイン名は既存の共通インフラから自動取得

**トリガー条件:**
- `develop` ブランチ → 開発環境へデプロイ
- `integration/**` ブランチ → 開発環境へデプロイ
- `master` ブランチ → 本番環境へデプロイ

**実行内容:**
1. **インフラデプロイ**: ECR リポジトリの CloudFormation スタックをデプロイ (`--no-fail-on-empty-changeset` で変更がなければスキップ)
2. **ビルド**: ECR リポジトリ URI を取得し、Docker イメージをビルドして ECR にプッシュ
3. **Lambda デプロイ**: Lambda 関数の CloudFormation スタックを新しいイメージでデプロイ
4. **更新**: Lambda 関数コードを明示的に更新 (CloudFormation だけでは更新されない場合の保険)
5. **検証**: Function URL を取得してヘルスチェック実行
6. **CloudFront デプロイ**: CloudFront ディストリビューションの CloudFormation スタックをデプロイ
    - ACM 証明書 ARN を共有インフラスタックのエクスポートから自動取得
    - ドメイン名を共有インフラスタックのエクスポートから自動取得し、環境に応じたサブドメインを構成 (prod: `tools.example.com`, dev: `dev-tools.example.com`)

**CloudFormation との統合:**
- インフラとアプリケーションを一つのワークフローで完全自動デプロイ
- CloudFormation テンプレート (`infra/tools/*.yaml`) が単一の真実の情報源
- `--no-fail-on-empty-changeset` により、変更がない場合はスタック操作をスキップ
- インフラの変更 (リポジトリ名、関数名など) があってもワークフローの修正は不要
- ACM 証明書とドメイン名は CloudFormation エクスポートから動的に取得 (共有インフラとの連携)

### 2.3 デプロイ後の確認

#### Lambda 関数の確認

```bash
# 関数の状態確認
aws lambda get-function \
    --function-name tools-app-dev \
    --region us-east-1

# Function URL の取得
aws lambda get-function-url-config \
    --function-name tools-app-dev \
    --region us-east-1
```

#### ヘルスチェック

```bash
curl https://<FUNCTION_URL>/api/health
```

#### PWA 確認

デプロイ後、以下のPWA機能を確認:

1. **manifest.json の確認**
    ```bash
    curl https://<DOMAIN>/manifest.json
    ```

2. **Service Worker の確認**
    - ブラウザの開発者ツール → Application → Service Workers
    - Service Worker が登録されていることを確認

3. **インストール可能性の確認**
    - Chrome: アドレスバーにインストールアイコンが表示される
    - モバイル: 「ホーム画面に追加」が表示される

4. **Lighthouse PWAスコア**
    ```bash
    # Chrome DevTools で Lighthouse を実行
    # PWA カテゴリのスコアが 90 以上であることを確認
    ```

5. **オフライン動作確認**
    - ブラウザの開発者ツール → Network → Offline モードに切り替え
    - 基本的なページが表示されることを確認

---

## 3. CI/CD

### 3.1 ワークフロー概要

Tools アプリでは、2つの GitHub Actions ワークフローを使用します:

#### 1. プルリクエスト検証ワークフロー (`.github/workflows/tools-pr.yml`)

**目的**: develop および integration/** ブランチへのプルリクエスト時に品質を検証

**トリガー条件**:
```yaml
on:
  pull_request:
    branches:
        - develop
        - integration/**
    paths:
        - 'services/tools/**'
        - 'infra/tools/**'
        - '.github/workflows/tools-pr.yml'
```

**ジョブ構成**:

1. **nextjs-build**: Next.js アプリケーションのビルド検証
    - 依存関係のインストール (`npm ci`)
    - プロダクションビルドの実行 (`npm run build`)
    - TypeScript 型チェックとビルドエラーの検出

2. **docker-build**: Lambda 用 Docker イメージのビルド検証
    - Dockerfile を使用したイメージビルド
    - ビルドエラーの早期検出
    - ECR へのプッシュは行わない (検証のみ)

3. **test**: 単体テストの実行
    - Jest テストスイートの実行 (`npm test`)
    - すべてのテストの合格を確認

**マージ条件**:
- すべてのジョブが成功すること
- GitHub のブランチプロテクションルールで必須チェックとして設定推奨

#### 2. デプロイワークフロー (`.github/workflows/tools-deploy.yml`)

**目的**: develop, integration/**, master ブランチへのプッシュ時に自動デプロイ

**トリガー条件**:
```yaml
on:
  push:
    branches:
        - develop
        - integration/**
        - master
    paths:
        - 'services/tools/**'
        - 'infra/tools/**'
        - '.github/workflows/tools-deploy.yml'
```

**ジョブ構成**:

1. **infrastructure**: ECR リポジトリの CloudFormation スタックデプロイ
2. **build**: Docker イメージのビルドと ECR へのプッシュ
3. **deploy**: Lambda と CloudFront のデプロイ

### 3.2 ブランチごとのデプロイ戦略

| ブランチ | 環境 | PR検証 | 自動デプロイ |
|---------|------|--------|------------|
| `develop` | 開発 | ✅ | ✅ |
| `integration/**` | 開発 | ✅ | ✅ |
| `master` | 本番 | - | ✅ |

**注**: master ブランチへは直接プッシュせず、develop からのマージのみを想定しているため、PR検証は不要です。

### 3.3 ワークフロー実行例

#### プルリクエスト作成時

```bash
# feature ブランチから develop へのプルリクエスト作成
git checkout -b feature/new-tool
git push origin feature/new-tool

# GitHub でプルリクエスト作成
# → tools-pr.yml が自動実行される
#   ✓ Next.js ビルド検証
#   ✓ Docker ビルド検証
#   ✓ 単体テスト実行
# → すべて成功でマージ可能
```

#### マージ後のデプロイ

```bash
# プルリクエストをマージ
# → develop ブランチに push される
# → tools-deploy.yml が自動実行される
#   1. ECR スタックデプロイ
#   2. Docker イメージビルド & プッシュ
#   3. Lambda デプロイ
#   4. CloudFront デプロイ
# → 開発環境へデプロイ完了
```

### 3.4 デプロイ承認フロー

現在は自動デプロイのみですが、将来的に本番環境への承認フローを追加する場合:

```yaml
deploy:
    environment:
        name: production
        url: https://tools.example.com
```

---

## 4. 監視・ログ

### 4.1 ログ監視

Lambda のログは CloudWatch Logs に自動的に保存されます。

```bash
# ログの確認
aws logs tail /aws/lambda/tools-app-dev --follow
```

---

## 5. 運用

### 5.1 バージョン管理

#### 5.1.1 バージョン番号のルール

本プロジェクトは [Semantic Versioning](https://semver.org/) に準拠します:

- **メジャー (X.0.0)**: 破壊的変更
- **マイナー (0.X.0)**: 新機能追加（後方互換性あり）
- **パッチ (0.0.X)**: バグ修正

#### 5.1.2 バージョン管理の Single Source of Truth

**`services/tools/package.json` の `version` フィールドがすべてのバージョン情報の唯一の真実の情報源です。**

他の場所（CloudFormation パラメータ、環境変数、ドキュメント等）にバージョン番号を直接記載しないでください。

#### 5.1.3 バージョン更新手順

新しいバージョンをリリースする際の手順:

```bash
# package.json のバージョンを更新（npm version コマンド推奨）
cd services/tools

# パッチバージョンアップ（例: 1.0.0 → 1.0.1）
npm version patch

# マイナーバージョンアップ（例: 1.0.0 → 1.1.0）
npm version minor

# メジャーバージョンアップ（例: 1.0.0 → 2.0.0）
npm version major

# コミット & プッシュ
git add .
git commit -m "chore: bump version to X.Y.Z"
git push origin <branch-name>
```

**`npm version` コマンドの動作:**
- `package.json` の `version` フィールドを自動更新
- Git タグを自動作成（`vX.Y.Z` 形式）
- 自動的に git commit を作成

#### 5.1.4 デプロイ時のバージョン設定

GitHub Actions が自動的に以下を実行します:

1. **`package.json` からバージョンを読み取り**
    ```yaml
    - name: Get version from package.json
        run: |
        VERSION=$(node -p "require('./package.json').version")
        echo "app-version=$VERSION" >> "$GITHUB_OUTPUT"
    ```

2. **CloudFormation パラメータとして渡す**
    ```yaml
    aws cloudformation deploy \
        --parameter-overrides AppVersion="$VERSION" \
        ...
    ```

3. **Lambda 環境変数 `APP_VERSION` に設定**
    - CloudFormation が自動的に Lambda の環境変数として設定
    - アプリケーションは `process.env.APP_VERSION` から取得

#### 5.1.5 バージョン表示

デプロイされたアプリケーションのバージョンは以下で確認可能:

- **Footer**: すべてのページ下部に `vX.Y.Z` として表示
- **Health API**: `https://tools.example.com/api/health` のレスポンス

```json
{
    "status": "ok",
    "timestamp": "2025-12-18T12:34:56.789Z",
    "version": "1.0.0"
}
```

### 5.2 スケーリング対応

Lambda は自動スケーリングされます。必要に応じて以下を調整:
- メモリサイズ
- タイムアウト
- 予約済み同時実行数

### 5.3 セキュリティアップデート

依存パッケージの定期的な更新を実施してください。

---

## 6. 障害対応

### 6.1 ロールバック手順

#### GitHub Actions からのロールバック

1. 前のコミットに戻す
2. 再度プッシュして自動デプロイを実行

#### 手動ロールバック

```bash
# 前のイメージタグを指定
aws lambda update-function-code \
    --function-name tools-app-dev \
    --image-uri <ECR_REGISTRY>/tools-app-dev:<PREVIOUS_TAG> \
    --region us-east-1
```

### 7.3 よくある障害と対処法

#### デプロイが失敗する

**症状:** GitHub Actions のワークフローが失敗する

**原因と対処:**
- ECR ログインエラー → IAM ロールの権限を確認
- Lambda 更新エラー → Lambda 関数が存在するか確認
- ヘルスチェック失敗 → `/api/health` エンドポイントの実装を確認

#### Lambda が起動しない

**症状:** Function URL にアクセスできない

**原因と対処:**
- Docker イメージのビルドエラー → ローカルでイメージをビルドしてテスト
- 環境変数の設定ミス → Lambda の環境変数を確認
- メモリ不足 → Lambda のメモリサイズを増やす

#### PR検証ワークフローが失敗する

**症状:** プルリクエストのチェックが失敗する

**原因と対処:**

1. **Next.js ビルドエラー**
    - TypeScript の型エラー → `npm run build` をローカルで実行して確認
    - 依存関係の問題 → `package.json` と `package-lock.json` の整合性を確認

2. **Docker ビルドエラー**
    - Dockerfile の構文エラー → ローカルで `docker build` を実行して確認
    - ベースイメージの問題 → イメージのバージョンや可用性を確認

3. **単体テストの失敗**
    - テストコードのバグ → `npm test` をローカルで実行して修正
    - 新機能のテスト不足 → 追加した機能に対するテストを実装

**デバッグ方法:**
```bash
# ローカルで PR検証と同じステップを実行
cd services/tools

# 1. Next.js ビルド検証
npm ci
npm run build

# 2. Docker ビルド検証
docker build -t tools-pr-test .

# 3. テスト実行
npm test
```

---

## 参考資料

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)


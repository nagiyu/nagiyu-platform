# {service-name} デプロイ・運用マニュアル

<!-- 記入ガイド: サービス名を記述してください（例: Tools アプリ、Codec Converter） -->

本ドキュメントは、{service-name} のデプロイと運用に関する手順を説明します。

---

## 1. 環境構成

<!-- 記入ガイド: サービスの環境構成を記述してください -->
<!-- 記入例: 開発環境・本番環境の構成、リージョン戦略、インフラリソース構成 -->

### 1.1 環境一覧

<!-- 記入ガイド: 環境の定義とそれぞれの目的を記述してください -->

| 環境        | 用途   | デプロイ元ブランチ          | URL                                 |
| ----------- | ------ | --------------------------- | ----------------------------------- |
| dev (開発)  | {用途} | `develop`, `integration/**` | `https://dev-{service}.example.com` |
| prod (本番) | {用途} | `master`                    | `https://{service}.example.com`     |

### 1.2 リソース構成

<!-- 記入ガイド: 使用する AWS リソースや主要なインフラコンポーネントを記述してください -->
<!-- 記入例: Lambda, ECR, S3, DynamoDB, CloudFront, VPC, Batch など -->

**主要リソース**:

- {リソース1}: {用途}
- {リソース2}: {用途}
- {リソース3}: {用途}

**インフラ定義の場所**:

- CloudFormation テンプレート: `infra/{service-name}/*.yaml`
- CDK スタック: `infra/{service-name}/lib/`

### 1.3 環境ごとのリソース名

<!-- 記入ガイド: 環境ごとのリソース名の命名規則を表形式で記述してください -->

| リソース    | dev 環境                   | prod 環境                   |
| ----------- | -------------------------- | --------------------------- |
| {リソース1} | `{service}-{resource}-dev` | `{service}-{resource}-prod` |
| {リソース2} | `{service}-{resource}-dev` | `{service}-{resource}-prod` |

---

## 2. 前提条件

<!-- 記入ガイド: デプロイ前に必要な前提条件を記述してください -->

### 2.1 共有インフラ

<!-- 記入ガイド: デプロイ前に必要な共有インフラを記述してください -->
<!-- 記入例: VPC, ACM 証明書, IAM ロール、ドメイン設定など -->

以下がデプロイ済みであることを確認してください:

- [ ] **VPC**: `nagiyu-{env}-vpc` - [共有インフラ: VPC](../../infra/shared/vpc.md) 参照
- [ ] **ACM 証明書** (CloudFront 用): [共有インフラ: ACM](../../infra/shared/acm.md) 参照
- [ ] **その他の共有リソース**: {追加の共有リソース}

### 2.2 必要なツール

<!-- 記入ガイド: デプロイに必要なツールとバージョンを記述してください -->

- Node.js {version}+
- AWS CLI
- Docker
- {その他のツール}

### 2.3 認証情報

<!-- 記入ガイド: デプロイに必要な認証情報を記述してください -->
<!-- 記入例: GitHub Actions Secrets, AWS認証情報、API キーなど -->

---

## 3. 初回セットアップ

<!-- 記入ガイド: サービスの初回デプロイ手順を記述してください -->

### 3.1 手順概要

<!-- 記入ガイド: セットアップの全体的な流れを記述してください -->

1. **ECR リポジトリ作成**: コンテナイメージ格納用リポジトリの作成
2. **Docker イメージビルド**: アプリケーションのコンテナイメージを作成
3. **インフラデプロイ**: Lambda, CloudFront などのリソースをデプロイ
4. **動作確認**: ヘルスチェック・機能確認

### 3.2 ECR リポジトリの作成

<!-- 記入ガイド: ECR リポジトリの作成手順を記述してください -->
<!-- 記入例: CloudFormation または CDK を使った作成コマンド -->

```bash
# 開発環境
aws cloudformation deploy \
    --template-file infra/{service-name}/ecr.yaml \
    --stack-name {service}-ecr-dev \
    --parameter-overrides Environment=dev \
    --region us-east-1

# 本番環境
aws cloudformation deploy \
    --template-file infra/{service-name}/ecr.yaml \
    --stack-name {service}-ecr-prod \
    --parameter-overrides Environment=prod \
    --region us-east-1
```

### 3.3 Docker イメージのビルドとプッシュ

<!-- 記入ガイド: Docker イメージのビルド・プッシュ手順を記述してください -->

```bash
# 1. ECR にログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド
docker build -t {service}:latest -f services/{service}/Dockerfile .

# 3. タグ付け
docker tag {service}:latest <ECR_REGISTRY>/{service}-dev:latest

# 4. プッシュ
docker push <ECR_REGISTRY>/{service}-dev:latest
```

### 3.4 アプリケーションリソースのデプロイ

<!-- 記入ガイド: Lambda, CloudFront などのアプリケーションリソースをデプロイする手順を記述してください -->

```bash
# 開発環境
aws cloudformation deploy \
    --template-file infra/{service-name}/lambda.yaml \
    --stack-name {service}-lambda-dev \
    --parameter-overrides Environment=dev ImageUri=<ECR_IMAGE_URI> \
    --region us-east-1

aws cloudformation deploy \
    --template-file infra/{service-name}/cloudfront.yaml \
    --stack-name {service}-cloudfront-dev \
    --parameter-overrides \
        Environment=dev \
        LambdaStackName={service}-lambda-dev \
        CertificateArn=<ACM_CERTIFICATE_ARN> \
        DomainName=dev-{service}.example.com \
    --region us-east-1
```

### 3.5 動作確認

<!-- 記入ガイド: デプロイ後の動作確認手順を記述してください -->

```bash
# Lambda 関数の確認
aws lambda get-function \
    --function-name {service}-dev \
    --region us-east-1

# ヘルスチェック
curl https://<FUNCTION_URL>/api/health
```

---

## 4. CI/CD パイプライン

<!-- 記入ガイド: GitHub Actions などの CI/CD パイプラインの詳細を記述してください -->

### 4.1 ワークフロー概要

<!-- 記入ガイド: プロジェクトで使用する GitHub Actions ワークフローを記述してください -->
<!-- 記入例: 高速検証ワークフロー (Fast CI)、完全検証ワークフロー (Full CI)、デプロイワークフロー -->

{service-name} では、以下の GitHub Actions ワークフローを使用します:

#### 1. 高速検証ワークフロー (`.github/workflows/{service}-verify-fast.yml`)

**目的**: integration/\*\* ブランチへのプルリクエスト時に素早いフィードバックを提供

**トリガー条件**:

```yaml
on:
  pull_request:
    branches:
      - integration/**
    paths:
      - 'services/{service}/**'
      - 'libs/**'
      - 'infra/{service}/**'
```

**ジョブ構成**:

1. **build**: アプリケーションのビルド検証
2. **docker-build**: Docker イメージのビルド検証
3. **test**: 単体テストの実行
4. **e2e-test**: E2Eテストの実行（chromium-mobile のみ）
5. **lint**: リントチェック
6. **format-check**: フォーマットチェック

#### 2. 完全検証ワークフロー (`.github/workflows/{service}-verify-full.yml`)

**目的**: develop ブランチへのプルリクエスト時に完全な品質検証を実施

**トリガー条件**:

```yaml
on:
  pull_request:
    branches:
      - develop
    paths:
      - 'services/{service}/**'
      - 'libs/**'
      - 'infra/{service}/**'
```

**ジョブ構成**:

1. **build**: アプリケーションのビルド検証
2. **docker-build**: Docker イメージのビルド検証
3. **test**: 単体テストの実行
4. **coverage**: テストカバレッジチェック（80%以上必須）
5. **e2e-test**: E2Eテストの実行（全デバイス）
6. **lint**: リントチェック
7. **format-check**: フォーマットチェック

#### 3. デプロイワークフロー (`.github/workflows/{service}-deploy.yml`)

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
      - 'services/{service}/**'
      - 'infra/{service}/**'
```

**ジョブ構成**:

1. **infrastructure**: ECR リポジトリの CloudFormation スタックデプロイ
2. **build**: Docker イメージのビルドと ECR へのプッシュ
3. **deploy**: Lambda と CloudFront のデプロイ
4. **verify**: デプロイ後のヘルスチェック

### 4.2 ブランチ戦略とデプロイフロー

<!-- 記入ガイド: ブランチごとのデプロイ戦略を表形式で記述してください -->
<!-- 参照: docs/branching.md のブランチ戦略に従ってください -->

```
feature/**  →  integration/**  →  develop  →  master
           (Fast CI)      (Full CI)   (本番)
```

| ブランチ         | 環境 | PR検証     | 自動デプロイ |
| ---------------- | ---- | ---------- | ------------ |
| `develop`        | 開発 | ✅ Full CI | ✅           |
| `integration/**` | 開発 | ✅ Fast CI | ✅           |
| `master`         | 本番 | -          | ✅           |

### 4.3 GitHub Secrets の設定

<!-- 記入ガイド: GitHub Actions に必要な Secret を記述してください -->
<!-- 記入例: AWS認証情報、API キー、トークンなど -->

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を確認:

| Name                    | 説明                                   | 設定済み                   |
| ----------------------- | -------------------------------------- | -------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー ID          | ✓ (共通インフラで設定済み) |
| `AWS_SECRET_ACCESS_KEY` | IAM ユーザーのシークレットアクセスキー | ✓ (共通インフラで設定済み) |
| `AWS_REGION`            | デプロイ先リージョン                   | ✓ (共通インフラで設定済み) |

### 4.4 ワークフロー実行例

<!-- 記入ガイド: 典型的な開発フローでのワークフロー実行例を記述してください -->

#### プルリクエスト作成時

```bash
# feature ブランチから integration/** へのプルリクエスト作成
git checkout -b feature/new-feature
git push origin feature/new-feature

# GitHub でプルリクエストを integration/feature-test ブランチに作成
# → {service}-verify-fast.yml が自動実行される
#   ✓ ビルド検証
#   ✓ 単体テスト実行
#   ✓ E2Eテスト実行（chromium-mobile のみ）
#   ✓ リントチェック
# → すべて成功でマージ可能
```

#### マージ後のデプロイ

```bash
# プルリクエストをマージ
# → develop ブランチに push される
# → {service}-deploy.yml が自動実行される
#   1. ECR スタックデプロイ
#   2. Docker イメージビルド & プッシュ
#   3. Lambda デプロイ
#   4. CloudFront デプロイ
#   5. ヘルスチェック
# → 開発環境へデプロイ完了
```

---

## 5. 手動デプロイ

<!-- 記入ガイド: CI/CD を使わない手動デプロイ手順を記述してください -->
<!-- 記入例: 緊急時のデプロイ、ローカルからのデプロイ -->

### 5.1 Docker イメージの手動デプロイ

<!-- 記入ガイド: Docker イメージを手動でビルド・プッシュする手順を記述してください -->

```bash
# 1. ECR ログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド
docker build -t {service}:latest -f services/{service}/Dockerfile .

# 3. タグ付け & プッシュ
docker tag {service}:latest <ECR_REGISTRY>/{service}-dev:latest
docker push <ECR_REGISTRY>/{service}-dev:latest
```

### 5.2 Lambda 関数の手動更新

<!-- 記入ガイド: Lambda 関数を手動で更新する手順を記述してください -->

```bash
aws lambda update-function-code \
    --function-name {service}-dev \
    --image-uri <ECR_REGISTRY>/{service}-dev:latest \
    --region us-east-1
```

---

## 6. 環境変数管理

<!-- 記入ガイド: アプリケーションで使用する環境変数を記述してください -->

### 6.1 環境変数一覧

<!-- 記入ガイド: Lambda や Batch などで設定される環境変数を表形式で記述してください -->

| 環境変数      | 説明   | 例     | 必須 |
| ------------- | ------ | ------ | ---- |
| `{ENV_VAR_1}` | {説明} | `{例}` | ✅   |
| `{ENV_VAR_2}` | {説明} | `{例}` | ✅   |
| `{ENV_VAR_3}` | {説明} | `{例}` | ❌   |

### 6.2 環境変数の設定方法

<!-- 記入ガイド: 環境変数の設定方法を記述してください -->
<!-- 記入例: CloudFormation パラメータ、Lambda コンソール、Systems Manager Parameter Store など -->

**CloudFormation での設定**:

環境変数は CloudFormation テンプレートで自動的に設定されます:

```yaml
Environment:
  Variables:
    { ENV_VAR_1 }: !Ref { Resource }
    { ENV_VAR_2 }: !Sub '${StackName}'
```

**手動設定（緊急時）**:

```bash
aws lambda update-function-configuration \
    --function-name {service}-dev \
    --environment Variables="{ENV_VAR_1}={value}" \
    --region us-east-1
```

---

## 7. ログ管理・監視

<!-- 記入ガイド: ログとモニタリングの詳細を記述してください -->

### 7.1 ログの確認

<!-- 記入ガイド: CloudWatch Logs やその他のログ管理サービスの利用方法を記述してください -->

**Lambda ログ**:

- ロググループ: `/aws/lambda/{service}-{env}`
- 保持期間: 7日

**ログの確認方法**:

```bash
# ログのリアルタイム確認
aws logs tail /aws/lambda/{service}-dev --follow

# 特定期間のログ検索
aws logs filter-log-events \
    --log-group-name /aws/lambda/{service}-dev \
    --start-time $(date -d '1 hour ago' +%s)000 \
    --filter-pattern "ERROR"
```

### 7.2 メトリクスとアラート

<!-- 記入ガイド: CloudWatch メトリクスやアラート設定を記述してください -->

**Lambda メトリクス**:

- 実行時間 (Duration)
- エラー率 (Errors)
- 同時実行数 (ConcurrentExecutions)
- スロットル (Throttles)

**その他のメトリクス**:

<!-- 記入ガイド: S3, DynamoDB, API Gateway など、サービスで使用する他のリソースのメトリクスを記述してください -->

### 7.3 推奨アラート設定

<!-- 記入ガイド: 設定すべきアラートを記述してください -->
<!-- 記入例: エラー率、レイテンシ、可用性に関するアラート -->

| アラート項目         | 閾値        | アクション   |
| -------------------- | ----------- | ------------ |
| Lambda エラー率      | > 5%        | {アクション} |
| Lambda 実行時間      | > {閾値} ms | {アクション} |
| {その他のメトリクス} | {閾値}      | {アクション} |

---

## 8. 運用手順

<!-- 記入ガイド: 日常的な運用手順を記述してください -->

### 8.1 バージョン管理

<!-- 記入ガイド: バージョン番号のルールと更新手順を記述してください -->

#### 8.1.1 バージョン番号のルール

本プロジェクトは [Semantic Versioning](https://semver.org/) に準拠します:

- **メジャー (X.0.0)**: 破壊的変更
- **マイナー (0.X.0)**: 新機能追加（後方互換性あり）
- **パッチ (0.0.X)**: バグ修正

#### 8.1.2 バージョン管理の Single Source of Truth

**`services/{service}/package.json` の `version` フィールドがすべてのバージョン情報の唯一の真実の情報源です。**

#### 8.1.3 バージョン更新手順

```bash
cd services/{service}

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

### 8.2 スケーリング対応

<!-- 記入ガイド: スケーリングに関する設定や対応方法を記述してください -->

Lambda は自動スケーリングされます。必要に応じて以下を調整:

- メモリサイズ: {現在の設定値}
- タイムアウト: {現在の設定値}
- 予約済み同時実行数: {設定値}

### 8.3 セキュリティアップデート

<!-- 記入ガイド: 依存パッケージのセキュリティアップデート手順を記述してください -->

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

<!-- 記入ガイド: 障害時の対応手順を記述してください -->

### 9.1 ロールバック手順

<!-- 記入ガイド: デプロイに問題がある場合のロールバック手順を記述してください -->

#### GitHub Actions からのロールバック

1. 前のコミットに戻す
2. 再度プッシュして自動デプロイを実行

```bash
git revert HEAD
git push origin <branch-name>
```

#### 手動ロールバック

```bash
# 前のイメージタグを確認
aws ecr describe-images --repository-name {service}-dev --region us-east-1

# 前のイメージタグを指定してロールバック
aws lambda update-function-code \
    --function-name {service}-dev \
    --image-uri <ECR_REGISTRY>/{service}-dev:<PREVIOUS_TAG> \
    --region us-east-1
```

### 9.2 よくある障害と対処法

<!-- 記入ガイド: 想定される障害シナリオと対処法を記述してください -->

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
cd services/{service}

# 1. ビルド検証
npm ci
npm run build

# 2. Docker ビルド検証
docker build -t {service}-pr-test .

# 3. テスト実行
npm test
```

### 9.3 エスカレーションフロー

<!-- [任意] -->
<!-- 記入ガイド: 障害レベルに応じたエスカレーションフローを記述してください -->

---

## 10. 削除手順

<!-- [任意] -->
<!-- 記入ガイド: サービスを完全に削除する手順を記述してください -->

### 10.1 リソースの削除

**注意**: S3 バケットや DynamoDB テーブルなどは削除するとデータも失われます。

```bash
# スタックの削除
aws cloudformation delete-stack --stack-name {service}-cloudfront-{env}
aws cloudformation delete-stack --stack-name {service}-lambda-{env}
aws cloudformation delete-stack --stack-name {service}-ecr-{env}
```

---

## 参考資料

<!-- 記入ガイド: 参考になる外部ドキュメントやリンクを記述してください -->

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)
- [プラットフォームブランチ戦略](../../branching.md)
- [プラットフォーム開発ガイドライン](../../development/rules.md)
- [共有インフラドキュメント](../../infra/README.md)

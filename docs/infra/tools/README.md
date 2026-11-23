# Tools Infrastructure (CDK)

Tools サービスの AWS インフラストラクチャの CDK 実装に関するドキュメントです。

## 構成

- **ECR Repository**: Docker イメージ管理
- **Lambda Function**: ツールアプリケーション実行
- **CloudFront Distribution**: CDN 配信

## デプロイ

以下の CDK コマンドはすべて、`IMAGE_TAG` に push 済みのイメージのタグを渡して実行します (前提条件を参照)。

### 開発環境
```bash
cd infra/tools
npm ci
npm run build
npx cdk deploy --all --context env=dev
```

### 本番環境
```bash
npx cdk deploy --all --context env=prod
```

## GitHub Actions

ワークフロー: `.github/workflows/tools-deploy.yml`

---

## 詳細構成 (参考)

### スタック構成

- **Tools-Ecr-{env}**: ECR リポジトリ
- **Tools-Lambda-{env}**: Lambda 関数と実行ロール
- **Tools-CloudFront-{env}**: CloudFront ディストリビューション

### リソース詳細

#### ECR Repository

- リポジトリ名: `tools-app-{env}`
- イメージスキャン: 有効
- ライフサイクルポリシー: 最新10イメージを保持

#### Lambda Function

- 関数名: `tools-app-{env}`
- ランタイム: FROM_IMAGE (ECR)
- メモリ: 1024MB
- タイムアウト: 30秒
- Function URL: 有効 (認証は AWS_IAM。CloudFront 経由のみ)

#### CloudFront Distribution

- オリジン: Lambda Function URL (OAC で署名して呼ぶ。POST / PUT の本文は Lambda@Edge が SHA256 を付ける)
- カスタムドメイン: `{env}-tools.nagiyu.com` (prod: `tools.nagiyu.com`)
- セキュリティヘッダー: HSTS, X-Content-Type-Options, X-Frame-Options など
- キャッシュポリシー: 無効 (動的コンテンツのため)

### 前提条件

#### 共有リソース

以下の共有リソースが事前にデプロイされている必要があります:

- ACM 証明書 (us-east-1): `nagiyu-shared-acm-certificate-arn` export

#### ECR イメージ

Lambda デプロイ前に、ECR リポジトリにコンテナイメージがプッシュされている必要があります。

CDK は環境変数 `IMAGE_TAG` のタグで Lambda のイメージを指します。synth / diff / deploy / destroy のどれも、`IMAGE_TAG` が無いと合成が失敗するので、push 済みのタグ (CI ではコミットの sha) を渡してください。

### コマンド

すべてのコマンドは `infra/tools/` ディレクトリで実行します。

#### ビルド

```bash
npm run build
```

#### CDK Synth (テンプレート生成)

```bash
# dev 環境
npm run synth -- --context env=dev

# prod 環境
npm run synth -- --context env=prod
```

#### 差分確認

```bash
# dev 環境
npm run diff:dev

# prod 環境
npm run diff:prod

# 特定のスタック
npx cdk diff NagiyuToolsEcrDev --context env=dev
```

#### デプロイ

```bash
# dev 環境 (全スタック)
npm run deploy:dev

# prod 環境 (全スタック)
npm run deploy:prod

# 特定のスタックのみ
npx cdk deploy NagiyuToolsEcrDev --context env=dev
npx cdk deploy Tools-Lambda-dev --context env=dev
npx cdk deploy Tools-CloudFront-dev --context env=dev
```

#### 削除

```bash
# dev 環境 (逆順)
npx cdk destroy Tools-CloudFront-dev --context env=dev
npx cdk destroy Tools-Lambda-dev --context env=dev
npx cdk destroy NagiyuToolsEcrDev --context env=dev
```

### 初回デプロイ手順

1. **ECR スタックのデプロイ**

    CDK はどのスタックを deploy するときもアプリ全体を合成し、環境変数 `IMAGE_TAG` を読む。`IMAGE_TAG` が無いと合成が失敗するので、ECR だけの deploy にも値を渡す。値は次の手順で決めるタグと同じものにする。

    ```bash
    export IMAGE_TAG=$(git rev-parse HEAD)

    cd infra/tools
    IMAGE_TAG=${IMAGE_TAG} npx cdk deploy NagiyuToolsEcrDev --context env=dev
    ```

2. **コンテナイメージのビルドとプッシュ**

    イメージのタグは 1 つだけ決め、そのタグで build と push を行う。CI ではコミットの sha を使う。動くタグ (`latest`) は使わない。同じタグのままでは CloudFormation がイメージの入れ替わりに気づかず、Lambda が更新されないためである。

    ```bash
    # ECR ログイン
    aws ecr get-login-password --region us-east-1 | \
      docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

    # ECR リポジトリの URI を ECR スタックの出力から取得
    REPOSITORY_URI=$(aws cloudformation describe-stacks \
      --stack-name NagiyuToolsEcrDev \
      --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" \
      --output text --region us-east-1)

    # イメージビルドとプッシュ (モノレポルートから。CI と同じく BuildKit を切る)
    cd ../..
    DOCKER_BUILDKIT=0 docker build -t ${REPOSITORY_URI}:${IMAGE_TAG} -f services/tools/Dockerfile .
    docker push ${REPOSITORY_URI}:${IMAGE_TAG}
    ```

3. **Lambda スタックのデプロイ**

    CDK は `IMAGE_TAG` のタグを Lambda に書き込むので、手順 2 と同じ値を渡す。イメージの切り替えはこの deploy が行う。

    ```bash
    cd infra/tools
    IMAGE_TAG=${IMAGE_TAG} npx cdk deploy Tools-Lambda-dev --context env=dev
    ```

4. **CloudFront スタックのデプロイ**

    ```bash
    npx cdk deploy Tools-CloudFront-dev --context env=dev
    ```

### トラブルシューティング

#### ビルドエラー

```bash
cd infra/tools
# 依存関係の再インストール
npm install

# TypeScript の再ビルド
npm run build
```

#### デプロイエラー

```bash
# AWS 認証情報の確認
aws sts get-caller-identity

# スタックの状態確認
aws cloudformation describe-stacks --stack-name NagiyuToolsEcrDev --region us-east-1
```

#### ECR イメージが見つからない

Lambda デプロイ前に ECR にイメージがプッシュされていることを確認:

```bash
aws ecr describe-images \
  --repository-name tools-app-dev \
  --region us-east-1
```

---

## 関連ドキュメント

- [Tools サービスドキュメント](../../services/tools/)
- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)

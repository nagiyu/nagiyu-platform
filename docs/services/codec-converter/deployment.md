# Codec Converter デプロイ・運用マニュアル

本ドキュメントは、Codec Converter のデプロイと運用に関する手順を説明します。

---

## 1. インフラ構築

### 1.1 CDK スタック構成

Codec Converter のインフラは CDK で定義されており、以下の構成になっています:

**ディレクトリ構造**:

```
infra/codec-converter/
├── lib/
│   ├── codec-converter-stack.ts    # メインスタック
│   ├── ecr-stacks.ts               # ECR スタック (Web 用と Batch 用)
│   ├── policies/
│   │   └── app-runtime-policy.ts   # Lambda 実行ロールが使用する実行権限
│   └── roles/
│       ├── lambda-execution-role.ts # Lambda 実行ロール
│       └── batch-job-role.ts       # Batch Job 実行ロール
├── bin/
│   └── codec-converter.ts          # エントリーポイント
└── test/
    └── codec-converter.test.ts     # テスト
```

**主要リソース**:

- S3 バケット: 入出力ファイルのストレージ
- DynamoDB テーブル: ジョブ管理
- Lambda 関数: Next.js アプリケーション（Lambda Web Adapter 使用）
- AWS Batch: FFmpeg による動画変換処理
- CloudFront: CDN・カスタムドメイン
- ECR: Lambda・Batch Worker のコンテナイメージ

### 1.2 前提条件

以下がデプロイ済みであることを確認してください:

1. **共有インフラ**:
   - VPC (`nagiyu-{env}-vpc`) - `docs/infra/shared/vpc.md` 参照
   - ACM 証明書 - `docs/infra/shared/acm.md` 参照

2. **ツール**:
   - Node.js 18+
   - AWS CLI
   - Docker

### 1.3 デプロイ手順

#### ステップ 1: ECR リポジトリの作成

ECR は本体とは別の 2 つのスタック (Web 用と Batch 用) にある。本体の Lambda とジョブ定義はイメージを参照するので、先にリポジトリを作ってイメージを push する。

```bash
# dev 環境 (prod は env=prod、スタック名の末尾を Prod にする)
npm run cdk --workspace=@nagiyu/infra-codec-converter -- deploy \
    NagiyuCodecConverterECRDev NagiyuCodecConverterBatchECRDev \
    --context env=dev
```

#### ステップ 2: Docker イメージのビルド・プッシュ

イメージのタグは 1 つだけ決め、Lambda 用と Batch 用の両方に同じタグを付ける。CI ではコミットの sha を使う。動くタグ (`latest`) は使わない。同じタグのままでは CloudFormation がイメージの入れ替わりに気づかず、Lambda もジョブ定義も更新されないためである。

```bash
export IMAGE_TAG=$(git rev-parse HEAD)
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com"

aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin ${ECR_REGISTRY}
```

ビルドは CI と同じく BuildKit を切って行う (`DOCKER_BUILDKIT=0`)。BuildKit が付ける attestation つきのイメージを、Lambda が受け付けないことがあるためである。

##### Lambda イメージ (Next.js)

```bash
export LAMBDA_REPO_URI="${ECR_REGISTRY}/nagiyu-codec-converter-ecr-dev"

DOCKER_BUILDKIT=0 docker build -t ${LAMBDA_REPO_URI}:${IMAGE_TAG} -f services/codec-converter/web/Dockerfile .
docker push ${LAMBDA_REPO_URI}:${IMAGE_TAG}
```

##### Batch Worker イメージ (FFmpeg)

```bash
export WORKER_REPO_URI="${ECR_REGISTRY}/nagiyu-codec-converter-batch-ecr-dev"

DOCKER_BUILDKIT=0 docker build -t ${WORKER_REPO_URI}:${IMAGE_TAG} -f services/codec-converter/batch/Dockerfile .
docker push ${WORKER_REPO_URI}:${IMAGE_TAG}
```

#### ステップ 3: 本体のデプロイ

Lambda、Batch、CloudFront などをデプロイする。CDK は環境変数 `IMAGE_TAG` のタグを Lambda とジョブ定義に書き込むので、ステップ 2 と同じ値を渡す。

```bash
# dev 環境 (prod は env=prod、スタック名を NagiyuCodecConverterProd にする)
IMAGE_TAG=${IMAGE_TAG} npm run deploy --workspace=@nagiyu/infra-codec-converter -- \
    NagiyuCodecConverterDev --context env=dev
```

---

## 2. 開発環境セットアップ

ローカルから dev 環境の AWS リソースへアクセスする場合は、IAM Identity Center（SSO）の一時認証情報を使う。詳細は [architecture.md の開発環境セットアップ](./architecture.md#開発環境セットアップ) を参照してください。

---

## 3. 更新デプロイ

### 3.1 アプリケーションコードの更新

Lambda (Next.js) または Worker (FFmpeg) のコードを変更した場合は、新しいタグでイメージを push し (ステップ 2)、同じタグを渡して本体をデプロイする (ステップ 3)。

### 3.2 インフラ設定の変更

CDK スタック (IAM ロール、環境変数など) だけを変更した場合は、ステップ 3 だけでよい。`IMAGE_TAG` には、いま動いているイメージのタグ (ECR に実在するもの) を渡す。イメージも作り直すなら、ステップ 2 から通す。

---

## 4. 環境管理

### 4.1 環境ごとのリソース名

| リソース            | dev 環境                             | prod 環境                             |
| ------------------- | ------------------------------------ | ------------------------------------- |
| S3 バケット         | `nagiyu-codec-converter-storage-dev` | `nagiyu-codec-converter-storage-prod` |
| DynamoDB テーブル   | `nagiyu-codec-converter-jobs-dev`    | `nagiyu-codec-converter-jobs-prod`    |
| Lambda 関数         | `codec-converter-dev`                | `codec-converter-prod`                |
| Batch Job Queue     | `codec-converter-dev`                | `codec-converter-prod`                |
| CloudFront ドメイン | `codec-converter.dev.nagiyu.com`     | `codec-converter.nagiyu.com`          |

### 4.2 環境変数

Lambda と Batch Worker には以下の環境変数が自動設定されます:

| 環境変数                      | 説明                                                          | 例                                   |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `DYNAMODB_TABLE_NAME`         | DynamoDB テーブル名                                           | `nagiyu-codec-converter-jobs-dev`    |
| `S3_BUCKET`                   | S3 バケット名                                                 | `nagiyu-codec-converter-storage-dev` |
| `BATCH_JOB_QUEUE`             | Batch Job Queue 名                                            | `codec-converter-dev`                |
| `BATCH_JOB_DEFINITION_PREFIX` | Batch Job Definition 名のプレフィックス（動的リソース配分用） | `codec-converter-dev`                |
| `AWS_REGION`                  | AWS リージョン                                                | `us-east-1`                          |

**注**: アプリケーションは `BATCH_JOB_DEFINITION_PREFIX` にサイズ（`-small`, `-medium`, `-large`, `-xlarge`）を付加してジョブ定義名を構築します。

---

## 5. モニタリング

### 5.1 CloudWatch Logs

**Lambda ログ**:

- ロググループ: `/aws/lambda/nagiyu-codec-converter-{env}`
- 保持期間: 30日

**Batch Worker ログ**:

- ロググループ: `/aws/batch/job`
- 保持期間: 7日

### 5.2 CloudWatch メトリクス

**Lambda**:

- 実行時間
- エラー率
- 同時実行数

**Batch**:

- ジョブ数（成功/失敗）
- 実行時間

**DynamoDB**:

- 読み込み/書き込みリクエスト数

**S3**:

- リクエスト数
- データ転送量

---

## 6. トラブルシューティング

### 6.1 VPC が見つからない

```
Error: No VPCs found matching filters
```

**原因**: 共有 VPC がデプロイされていない

**解決方法**:

```bash
# VPC をデプロイ
cd infra/shared/vpc
# デプロイ手順は docs/infra/shared/vpc.md を参照
```

### 6.2 ACM 証明書が見つからない

```
Error: Cannot retrieve value from context provider
```

**原因**: ACM 証明書がデプロイされていない、または Export が存在しない

**解決方法**:

```bash
# ACM 証明書をデプロイ
cd infra/shared/acm
# デプロイ手順は docs/infra/shared/acm.md を参照

# Export 名を確認
aws cloudformation list-exports --query "Exports[?Name=='nagiyu-shared-acm-certificate-arn']"
```

### 6.3 Docker イメージがプッシュできない

```
Error: no basic auth credentials
```

**原因**: ECR にログインしていない

**解決方法**:

```bash
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com
```

### 6.4 Lambda が起動しない

**確認事項**:

1. ECR イメージが存在するか確認
   ```bash
   aws ecr describe-images --repository-name nagiyu-codec-converter-ecr-dev --region us-east-1
   ```
2. Lambda の環境変数が正しく設定されているか確認
3. Lambda 実行ロールに必要な権限があるか確認

---

## 7. ロールバック

### 7.1 Lambda のロールバック

以前のイメージのタグを渡して、本体をデプロイし直す。

```bash
# 1. 以前のイメージのタグを確認
aws ecr describe-images --repository-name nagiyu-codec-converter-ecr-dev --region us-east-1

# 2. そのタグを指定してデプロイ
IMAGE_TAG=<previous-tag> npm run deploy --workspace=@nagiyu/infra-codec-converter -- \
    NagiyuCodecConverterDev --context env=dev
```

Batch 用のリポジトリにも同じタグのイメージが残っている必要がある。リポジトリは直近 10 イメージだけを残す。

### 7.2 インフラのロールバック

CDK スタック全体を戻す場合は、Git で以前のコミットに戻し、そのコミットのタグを渡して再デプロイする。

```bash
git checkout <previous-commit>
IMAGE_TAG=$(git rev-parse HEAD) npm run deploy --workspace=@nagiyu/infra-codec-converter -- \
    NagiyuCodecConverterDev --context env=dev
```

---

## 8. 削除手順

### 8.1 リソースの削除

**注意**: S3 バケットと DynamoDB テーブルは `removalPolicy: DESTROY` が設定されているため、スタック削除時にデータも削除されます。

```bash
# dev 環境の本体を削除
npm run cdk --workspace=@nagiyu/infra-codec-converter -- destroy NagiyuCodecConverterDev --context env=dev

# ECR リポジトリも削除する場合
npm run cdk --workspace=@nagiyu/infra-codec-converter -- destroy \
    NagiyuCodecConverterECRDev NagiyuCodecConverterBatchECRDev --context env=dev
```

---

## 9. CI/CD

### 9.1 GitHub Actions ワークフロー

詳細は [architecture.md の CI/CD セクション](./architecture.md#cicd-パイプライン) を参照してください。

**ワークフロー**:

- `codec-converter-verify.yml`: PR 時の検証 (integration 向けは Fast、develop 向けは Full)
- `codec-converter-deploy.yml`: マージ後の自動デプロイ

---

## 関連ドキュメント

- [アーキテクチャ設計](./architecture.md)
- [要件定義](./requirements.md)
- [仕様カード](../../specs/README.md)
- [テスト仕様](./testing.md)
- [共有 VPC](../../platform/specs/resource/vpc.md)
- [ドメインと証明書](../../platform/specs/resource/dns-certificate.md)

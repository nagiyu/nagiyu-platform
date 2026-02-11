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
│   ├── policies/
│   │   └── app-runtime-policy.ts   # Lambda と開発者で共有する実行権限
│   ├── roles/
│   │   ├── lambda-execution-role.ts # Lambda 実行ロール
│   │   └── batch-job-role.ts       # Batch Job 実行ロール
│   └── users/
│       └── dev-user.ts             # 開発用 IAM ユーザー
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

初回のみ、ECR リポジトリを作成します。

```bash
# dev 環境
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=ecr-only

# prod 環境
npm run deploy -w codec-converter -- --context env=prod --context deploymentPhase=ecr-only
```

#### ステップ 2: Docker イメージのビルド・プッシュ

##### Lambda イメージ (Next.js)

```bash
# 1. リポジトリ URI を取得
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export LAMBDA_REPO_URI="${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/codec-converter-dev"

# 2. ECR にログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# 3. ビルド
cd services/codec-converter
docker build -t codec-converter:latest .

# 4. タグ付け・プッシュ
docker tag codec-converter:latest ${LAMBDA_REPO_URI}:latest
docker push ${LAMBDA_REPO_URI}:latest
```

##### Batch Worker イメージ (FFmpeg)

```bash
# 1. リポジトリ URI を取得
export WORKER_REPO_URI="${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/codec-converter-ffmpeg-dev"

# 2. ビルド
cd workers/codec-converter-ffmpeg
docker build -t codec-converter-ffmpeg:latest .

# 3. タグ付け・プッシュ
docker tag codec-converter-ffmpeg:latest ${WORKER_REPO_URI}:latest
docker push ${WORKER_REPO_URI}:latest
```

#### ステップ 3: フルデプロイ

すべてのリソース（Lambda, Batch, CloudFront など）をデプロイします。

```bash
# dev 環境
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full

# prod 環境
npm run deploy -w codec-converter -- --context env=prod --context deploymentPhase=full
```

**デプロイ時の注意事項**:

- **複数のジョブ定義**: 動的リソース配分機能により、4つのジョブ定義（small, medium, large, xlarge）が作成されます
- **maxvCPUs 変更**: Compute Environment の maxvCPUs が 16 vCPU に設定されます（従来は 6 vCPU）
- **リソース増加**: より多くのジョブを同時実行できますが、コストも増加する可能性があります

**デプロイ後の確認**:

```bash
# 1. ジョブ定義の確認
aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-small \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-medium \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-large \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-xlarge \
  --status ACTIVE

# 2. Compute Environment の maxvCPUs 確認
aws batch describe-compute-environments \
  --compute-environments codec-converter-dev \
  --query 'computeEnvironments[0].computeResources.maxvCpus'

# 期待値: 16
```

---

## 2. 開発環境セットアップ

### 2.1 開発用 IAM ユーザーの設定

詳細は [architecture.md の開発環境セットアップ](./architecture.md#ローカル開発用-iam-ユーザーのセットアップ) を参照してください。

**概要**:

1. CDK デプロイにより `codec-converter-dev-{env}` ユーザーが作成される
2. AWS コンソールでアクセスキーを手動発行
3. `aws configure --profile codec-converter-dev` で設定
4. `export AWS_PROFILE=codec-converter-dev` で使用

---

## 3. 更新デプロイ

### 3.1 アプリケーションコードの更新

Lambda (Next.js) またはWorker (FFmpeg) のコードを変更した場合:

```bash
# 1. Docker イメージをビルド・プッシュ（ステップ 2 と同じ）

# 2. Lambda 関数を更新
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full
```

### 3.2 インフラ設定の変更

CDK スタック（IAM ロール、環境変数など）を変更した場合:

```bash
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full
```

---

## 4. 環境管理

### 4.1 環境ごとのリソース名

| リソース            | dev 環境                             | prod 環境                             |
| ------------------- | ------------------------------------ | ------------------------------------- |
| S3 バケット         | `nagiyu-codec-converter-storage-dev` | `nagiyu-codec-converter-storage-prod` |
| DynamoDB テーブル   | `nagiyu-codec-converter-jobs-dev`    | `nagiyu-codec-converter-jobs-prod`    |
| Lambda 関数         | `codec-converter-dev`                | `codec-converter-prod`                |
| Batch Job Queue     | `codec-converter-dev`                | `codec-converter-prod`                |
| CloudFront ドメイン | `dev-codec-converter.nagiyu.com`     | `codec-converter.nagiyu.com`          |
| 開発用 IAM User     | `codec-converter-dev-dev`            | `codec-converter-dev-prod`            |

### 4.2 環境変数

Lambda と Batch Worker には以下の環境変数が自動設定されます:

**Lambda (Next.js) 環境変数**:

| 環境変数                      | 説明                                                          | 例                                   |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------ |
| `DYNAMODB_TABLE`              | DynamoDB テーブル名                                           | `nagiyu-codec-converter-jobs-dev`    |
| `S3_BUCKET`                   | S3 バケット名                                                 | `nagiyu-codec-converter-storage-dev` |
| `BATCH_JOB_QUEUE`             | Batch Job Queue 名                                            | `codec-converter-dev`                |
| `BATCH_JOB_DEFINITION_PREFIX` | Batch Job Definition 名のプレフィックス（動的リソース配分用） | `codec-converter-dev`                |
| `AWS_REGION`                  | AWS リージョン                                                | `us-east-1`                          |

**Batch Worker 環境変数**:

ジョブ投入時に Lambda が設定する環境変数:

| 環境変数              | 説明                                                   | 例                                |
| --------------------- | ------------------------------------------------------ | --------------------------------- |
| `JOB_ID`              | ジョブ ID                                              | `01234567-89ab-cdef-0123-456789abcdef` |
| `OUTPUT_CODEC`        | 出力コーデック                                         | `h264` / `vp9` / `av1`            |
| `DYNAMODB_TABLE`      | DynamoDB テーブル名                                    | `nagiyu-codec-converter-jobs-dev` |
| `S3_BUCKET`           | S3 バケット名                                          | `nagiyu-codec-converter-storage-dev` |
| `AWS_REGION`          | AWS リージョン                                         | `us-east-1`                       |
| `JOB_DEFINITION_NAME` | ジョブ定義名（リソース識別用、CDK により自動設定）     | `codec-converter-dev-xlarge`      |

**注**: 
- `BATCH_JOB_DEFINITION_PREFIX` は動的リソース配分機能で導入されました。アプリケーションは、このプレフィックスにサイズ（`-small`, `-medium`, `-large`, `-xlarge`）を付加して完全なジョブ定義名を構築します。
- `JOB_DEFINITION_NAME` は Batch Worker がログに出力するために使用され、CDK のジョブ定義で自動設定されます。

---

## 5. モニタリング

### 5.1 CloudWatch Logs

**Lambda ログ**:

- ロググループ: `/aws/lambda/codec-converter-{env}`
- 保持期間: 7日

**Batch Worker ログ**:

- ロググループ: `/aws/batch/job`
- 保持期間: 7日

**動的リソース配分の確認**:

Batch Worker ログから各ジョブが使用しているリソースを確認できます:

```bash
# CloudWatch Logs Insights でリソース情報を抽出
aws logs start-query \
  --log-group-name /aws/batch/job \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, jobId, jobDefinitionName, resources.cpu, resources.memory | filter @message like /Batch Worker started/'
```

ログ出力例:

```json
{
  "message": "Batch Worker started",
  "jobId": "01234567-89ab-cdef-0123-456789abcdef",
  "outputCodec": "av1",
  "jobDefinitionName": "codec-converter-dev-xlarge",
  "resources": {
    "cpu": 4,
    "memory": 16384
  }
}
```

Lambda ログから、どのジョブ定義が選択されたかを確認できます:

```bash
# Lambda ログでジョブ投入を確認
aws logs start-query \
  --log-group-name /aws/lambda/codec-converter-dev \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /Submitting job/ | sort @timestamp desc'
```

ログ出力例:

```
Submitting job 01234567-89ab-cdef-0123-456789abcdef with definition codec-converter-dev-xlarge (fileSize: 450000000, codec: av1)
```

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
   aws ecr describe-images --repository-name codec-converter-dev --region us-east-1
   ```
2. Lambda の環境変数が正しく設定されているか確認
3. Lambda 実行ロールに必要な権限があるか確認

### 6.5 ジョブ定義が見つからない

```
Error: Job definition 'codec-converter-dev-xlarge' does not exist
```

**原因**: 動的リソース配分機能のジョブ定義が作成されていない

**解決方法**:

1. **ジョブ定義の存在確認**:

```bash
# すべてのジョブ定義を確認
aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-small \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-medium \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-large \
  --status ACTIVE

aws batch describe-job-definitions \
  --job-definition-name codec-converter-dev-xlarge \
  --status ACTIVE
```

2. **ジョブ定義が存在しない場合は再デプロイ**:

```bash
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full
```

3. **Lambda の環境変数確認**:

```bash
aws lambda get-function-configuration \
  --function-name codec-converter-dev \
  --query 'Environment.Variables.BATCH_JOB_DEFINITION_PREFIX'

# 期待値: codec-converter-dev
```

**フォールバック機能**: アプリケーションは指定されたジョブ定義が存在しない場合、自動的に `medium` にフォールバックします。Lambda ログで以下のようなメッセージを確認してください:

```
Failed to submit job with definition codec-converter-dev-xlarge, falling back to medium: ...
```

### 6.6 Batch ジョブがキューに滞留する

**原因**: Compute Environment の maxvCPUs を超えるジョブが投入された

**確認方法**:

```bash
# 実行中のジョブを確認
aws batch list-jobs \
  --job-queue codec-converter-dev \
  --job-status RUNNING \
  --query 'jobSummaryList[*].[jobId,jobDefinition]'

# キューに待機中のジョブを確認
aws batch list-jobs \
  --job-queue codec-converter-dev \
  --job-status RUNNABLE \
  --query 'jobSummaryList[*].[jobId,jobDefinition]'
```

**解決方法**:

1. **使用中の vCPU を計算**: 実行中のジョブの vCPU 合計を確認
2. **maxvCPUs を増やす**: 必要に応じて CDK で maxvCPUs を調整して再デプロイ

```typescript
// infra/codec-converter/lib/codec-converter-stack.ts
maxvCpus: 32, // 16 から 32 に増加
```

3. **ジョブの完了を待つ**: 実行中のジョブが完了すれば、キューのジョブが自動的に開始されます

---

## 7. ロールバック

### 7.1 Lambda のロールバック

以前のイメージタグに戻す:

```bash
# 1. 以前のイメージタグを確認
aws ecr describe-images --repository-name codec-converter-dev --region us-east-1

# 2. CDK で特定のイメージタグを指定してデプロイ
npm run deploy -w codec-converter -- --context env=dev --context imageTag=<previous-tag> --context deploymentPhase=full
```

### 7.2 インフラのロールバック

CDK スタック全体をロールバックする場合は、Git で以前のコミットに戻してから再デプロイ:

```bash
git checkout <previous-commit>
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full
```

### 7.3 動的リソース配分機能のロールバック

動的リソース配分機能を無効化し、単一のジョブ定義に戻す場合:

**注意**: この変更は破壊的な変更です。進行中のジョブがある場合は完了を待ってから実行してください。

1. **CDK コードを以前のバージョンに戻す**:

```bash
# 動的リソース配分導入前のコミットに戻す
git checkout <commit-before-dynamic-resources>
```

2. **再デプロイ**:

```bash
npm run deploy -w codec-converter -- --context env=dev --context deploymentPhase=full
```

3. **環境変数の更新確認**:

Lambda の環境変数が `BATCH_JOB_DEFINITION` に戻っていることを確認:

```bash
aws lambda get-function-configuration \
  --function-name codec-converter-dev \
  --query 'Environment.Variables.BATCH_JOB_DEFINITION'
```

4. **不要なジョブ定義の削除** (オプション):

```bash
# 使用されていない古いジョブ定義を削除
aws batch deregister-job-definition \
  --job-definition codec-converter-dev-small:1

aws batch deregister-job-definition \
  --job-definition codec-converter-dev-large:1

aws batch deregister-job-definition \
  --job-definition codec-converter-dev-xlarge:1
```

---

## 8. 削除手順

### 8.1 リソースの削除

**注意**: S3 バケットと DynamoDB テーブルは `removalPolicy: DESTROY` が設定されているため、スタック削除時にデータも削除されます。

```bash
# dev 環境を削除
npm run cdk -w codec-converter -- destroy --context env=dev --context deploymentPhase=full

# ECR リポジトリも削除する場合
npm run cdk -w codec-converter -- destroy --context env=dev --context deploymentPhase=ecr-only
```

---

## 9. CI/CD

### 9.1 GitHub Actions ワークフロー

詳細は [architecture.md の CI/CD セクション](./architecture.md#cicd-パイプライン) を参照してください。

**ワークフロー**:

- `codec-converter-verify-fast.yml`: PR 時の高速検証
- `codec-converter-verify-full.yml`: 本番マージ前の完全検証
- `codec-converter-deploy.yml`: マージ後の自動デプロイ

---

## 関連ドキュメント

- [アーキテクチャ設計](./architecture.md)
- [要件定義](./requirements.md)
- [API仕様](./api-spec.md)
- [テスト仕様](./testing.md)
- [共有インフラ: VPC](../../infra/shared/vpc.md)
- [共有インフラ: ACM](../../infra/shared/acm.md)

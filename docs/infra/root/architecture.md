# ルートドメインアーキテクチャ

本ドキュメントでは、ルートドメイン (example.com) で公開される Web アプリケーションのインフラストラクチャアーキテクチャを説明します。

---

## 概要

nagiyu-platform のルートドメイン (example.com) では、ECS on Fargate で動作する Web アプリケーションを公開します。このアーキテクチャは AWS CDK を使用して構築され、高可用性、スケーラビリティ、セキュリティを実現します。

### 設計目標

- **高可用性**: マルチ AZ 構成による冗長化
- **スケーラビリティ**: ECS Auto Scaling によるトラフィック対応
- **セキュリティ**: HTTPS 通信、セキュリティグループによるアクセス制御
- **コスト最適化**: Fargate Spot の活用、適切なリソースサイジング
- **運用性**: CloudWatch によるモニタリング、ログ集約

---

## アーキテクチャ図

### 全体構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Internet                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ HTTPS (443)
                             │
                    ┌────────▼────────┐
                    │  External DNS   │
                    │   (CNAME: example.com → CloudFront)
                    └────────┬────────┘
                             │
                             │
                    ┌────────▼────────┐
                    │   CloudFront    │
                    │  Distribution   │
                    │  (ACM証明書)    │
                    └────────┬────────┘
                             │
                             │ HTTPS
                             │
              ┌──────────────▼──────────────┐
              │  Application Load Balancer  │
              │        (Public)             │
              │   Security Group: ALB-SG    │
              └──────────────┬──────────────┘
                             │
                             │ HTTP (80)
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         │          ┌────────▼────────┐          │
         │          │   Target Group  │          │
         │          │   (ECS Tasks)   │          │
         │          └────────┬────────┘          │
         │                   │                   │
    ┌────▼─────┐    ┌────────▼────────┐    ┌────▼─────┐
    │ us-east-1a│    │  us-east-1b     │    │  Scaling │
    ├──────────┤    ├─────────────────┤    ├──────────┤
    │ ECS Task │    │   ECS Task      │    │  Target  │
    │ (Fargate)│    │   (Fargate)     │    │  Tracking│
    │ Container│    │   Container     │    │  2-10    │
    └──────────┘    └─────────────────┘    │  Tasks   │
         │                   │              └──────────┘
         │                   │
    ┌────▼────────────────────▼─────┐
    │      Amazon ECR                │
    │  (コンテナイメージ)              │
    └────────────────────────────────┘

    ┌────────────────────────────────┐
    │    CloudWatch Logs             │
    │  (アプリケーションログ)          │
    └────────────────────────────────┘

    ┌────────────────────────────────┐
    │    CloudWatch Metrics          │
    │  (CPU, Memory, Request Count)  │
    └────────────────────────────────┘
```

### ネットワーク構成

```
┌─────────────────────────────────────────────────────────────┐
│                      VPC (既存)                              │
│                  nagiyu-{env}-vpc                           │
│                                                             │
│  ┌──────────────────────────┬──────────────────────────┐   │
│  │  Public Subnet 1a        │  Public Subnet 1b        │   │
│  │  10.x.0.0/25             │  10.x.128.0/25           │   │
│  │  us-east-1a              │  us-east-1b              │   │
│  │                          │                          │   │
│  │  ┌──────────────┐        │  ┌──────────────┐        │   │
│  │  │     ALB      │        │  │     ALB      │        │   │
│  │  │  (Primary)   │        │  │  (Standby)   │        │   │
│  │  └──────┬───────┘        │  └──────┬───────┘        │   │
│  │         │                │         │                │   │
│  │  ┌──────▼───────┐        │  ┌──────▼───────┐        │   │
│  │  │  ECS Task    │        │  │  ECS Task    │        │   │
│  │  │  (Fargate)   │        │  │  (Fargate)   │        │   │
│  │  │  ENI + SG    │        │  │  ENI + SG    │        │   │
│  │  └──────────────┘        │  └──────────────┘        │   │
│  └──────────────────────────┴──────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          Internet Gateway                            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 各コンポーネントの責務

### 1. CloudFront Distribution

**責務:**
- グローバルコンテンツ配信ネットワーク (CDN)
- SSL/TLS 終端 (HTTPS)
- カスタムドメイン (example.com) のルーティング
- DDoS 保護 (AWS Shield Standard)

**設定:**
- **カスタムドメイン**: `example.com`
- **SSL 証明書**: ACM 証明書 (Export: `nagiyu-shared-acm-certificate-arn`)
- **オリジン**: Application Load Balancer
- **キャッシュポリシー**: `CachingDisabled` (動的コンテンツのため)
- **Origin Protocol Policy**: HTTPS Only

**セキュリティ:**
- Viewer Protocol Policy: `Redirect HTTP to HTTPS`
- Security Headers の追加 (CloudFront Functions)

### 2. Application Load Balancer (ALB)

**責務:**
- ECS タスクへの負荷分散
- ヘルスチェック
- ターゲットの自動登録/解除

**設定:**
- **スキーマ**: Internet-facing
- **サブネット**: Public Subnet 1a, 1b (マルチ AZ)
- **セキュリティグループ**: ALB-SG
  - インバウンド: CloudFront からの HTTPS (443) のみ
  - アウトバウンド: ECS タスクへの HTTP (80)
- **ターゲットグループ**: IP ターゲットタイプ (Fargate 用)
- **ヘルスチェック**: `/health` エンドポイント

**高可用性:**
- マルチ AZ 配置 (us-east-1a, us-east-1b)
- クロスゾーン負荷分散: 有効

### 3. ECS Cluster

**責務:**
- コンテナオーケストレーション
- タスクのスケジューリング
- サービスの管理

**設定:**
- **起動タイプ**: Fargate
- **コンテナインサイト**: 有効 (CloudWatch モニタリング)

### 4. ECS Service

**責務:**
- 指定された数のタスクを維持
- ローリングアップデート
- Auto Scaling

**設定:**
- **希望タスク数**: 2 (初期)
- **最小タスク数**: 2
- **最大タスク数**: 10
- **デプロイ設定**:
  - デプロイタイプ: Rolling Update
  - 最小ヘルシー率: 100%
  - 最大率: 200%
- **ネットワーク**: Public Subnet, Security Group: ECS-Task-SG
- **ロードバランサー**: ALB ターゲットグループに自動登録

**Auto Scaling:**
- **スケーリングポリシー**: Target Tracking
- **メトリクス**: ALBRequestCountPerTarget
- **ターゲット値**: 1000 リクエスト/タスク
- **スケールアウト**: CPU 70% 超過時
- **スケールイン**: CPU 30% 未満時

### 5. ECS Task Definition

**責務:**
- コンテナ設定の定義
- リソース割り当て
- 環境変数の管理

**設定:**
- **Fargate プラットフォームバージョン**: LATEST
- **CPU**: 256 (.25 vCPU)
- **メモリ**: 512 MB
- **コンテナイメージ**: ECR リポジトリ
- **ポート**: 3000 (Next.js アプリ)
- **ログ**: CloudWatch Logs

**コンテナ設定:**
- **イメージ**: `{account}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-root-webapp:{tag}`
- **エントリーポイント**: `["node", "server.js"]`
- **ヘルスチェック**: `/health` エンドポイント (CMD-SHELL: curl)

**環境変数:**
- `NODE_ENV`: production
- `PORT`: 3000
- その他アプリケーション固有の変数

### 6. Security Groups

#### ALB Security Group

**インバウンド:**
- HTTPS (443) from CloudFront IP Ranges
- HTTP (80) from CloudFront IP Ranges (リダイレクト用)

**アウトバウンド:**
- HTTP (80) to ECS Task Security Group

#### ECS Task Security Group

**インバウンド:**
- HTTP (80) from ALB Security Group (ターゲットグループのヘルスチェック用)
- Port 3000 from ALB Security Group (アプリケーションポート)

**アウトバウンド:**
- HTTPS (443) to 0.0.0.0/0 (ECR, Secrets Manager, etc.)

### 7. IAM Roles

#### ECS Task Execution Role

**責務:**
- ECR からイメージを Pull
- CloudWatch Logs にログを送信
- Secrets Manager からシークレットを取得

**ポリシー:**
- `AmazonECSTaskExecutionRolePolicy` (AWS マネージド)
- カスタムポリシー:
  - ECR: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`
  - Secrets Manager: `secretsmanager:GetSecretValue`

#### ECS Task Role

**責務:**
- アプリケーションが AWS サービスにアクセスするための権限

**ポリシー:**
- カスタムポリシー (アプリケーションの要件に応じて)

### 8. CloudWatch Logs

**責務:**
- アプリケーションログの集約
- ログの保存と検索

**設定:**
- **ロググループ**: `/ecs/nagiyu-root-webapp-{env}`
- **保持期間**: 7 日 (dev), 30 日 (prod)
- **ログストリーム**: タスク ID ごと

### 9. CloudWatch Metrics & Alarms

**責務:**
- リソース使用率の監視
- 異常検知とアラート

**メトリクス:**
- ECS Service: CPU 使用率, メモリ使用率, タスク数
- ALB: リクエスト数, レスポンスタイム, 4xx/5xx エラー率
- ECS Task: CPU, メモリ, ネットワーク

**アラーム例:**
- CPU 使用率が 80% を超える
- 5xx エラー率が 5% を超える
- ヘルシータスク数が 0 になる

---

## スタック構成

nagiyu-platform のルートドメインインフラは、以下の CDK スタックで構成されます。

### スタック一覧

| スタック名 | 説明 | 依存関係 |
|----------|------|---------|
| `nagiyu-root-ecr-{env}` | ECR リポジトリ | なし |
| `nagiyu-root-webapp-{env}` | ECS, ALB, CloudFront | VPC (CloudFormation), ACM (CloudFormation), ECR |

### スタックの責務

#### 1. ECR Stack (`nagiyu-root-ecr-{env}`)

**リソース:**
- ECR リポジトリ: `nagiyu-root-webapp`
- ライフサイクルポリシー: 最新 10 イメージのみ保持

**出力:**
- ECR リポジトリ URI

#### 2. Root WebApp Stack (`nagiyu-root-webapp-{env}`)

**リソース:**
- ECS Cluster
- ECS Service
- ECS Task Definition
- Application Load Balancer
- ALB Target Group
- CloudFront Distribution
- Security Groups (ALB, ECS Task)
- IAM Roles (Task Execution, Task Role)
- CloudWatch Log Group

**入力 (Import):**
- VPC ID: `nagiyu-{env}-vpc-id` (CloudFormation Export)
- Subnet IDs: `nagiyu-{env}-public-subnet-ids` (CloudFormation Export)
- ACM Certificate ARN: `nagiyu-shared-acm-certificate-arn` (CloudFormation Export)
- ECR Repository URI: (ECR Stack Output)

**出力 (Export):**
- CloudFront Domain Name: `nagiyu-root-webapp-{env}-cloudfront-domain`
- ALB DNS Name: `nagiyu-root-webapp-{env}-alb-dns`
- ECS Cluster Name: `nagiyu-root-webapp-{env}-cluster-name`
- ECS Service Name: `nagiyu-root-webapp-{env}-service-name`

---

## デプロイフロー

### 前提条件

1. **共通リソースが存在する**:
   - VPC (CDK): `nagiyu-shared-vpc-{env}`
   - ACM 証明書 (CDK): `SharedAcm`
   - IAM ユーザー (CloudFormation): `nagiyu-shared-github-actions-user`

2. **ECR リポジトリが存在する**:
   - `nagiyu-root-ecr-{env}` スタックがデプロイ済み

3. **コンテナイメージがプッシュされている**:
   - ECR リポジトリに Web アプリケーションのイメージが存在

### デプロイ手順

#### 1. ECR リポジトリのデプロイ (初回のみ)

```bash
# ECR スタックをデプロイ
npm run deploy --workspace=@nagiyu/infra -- nagiyu-root-ecr-dev
```

#### 2. コンテナイメージのビルドとプッシュ

```bash
# ECR ログイン
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin {account}.dkr.ecr.us-east-1.amazonaws.com

# イメージビルド
cd services/root-webapp
docker build -t nagiyu-root-webapp:latest .

# イメージタグ付け
docker tag nagiyu-root-webapp:latest \
  {account}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-root-webapp:latest

# イメージプッシュ
docker push {account}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-root-webapp:latest
```

#### 3. インフラスタックのデプロイ

```bash
# CDK で差分確認
npm run diff --workspace=@nagiyu/infra -- nagiyu-root-webapp-dev

# デプロイ
npm run deploy --workspace=@nagiyu/infra -- nagiyu-root-webapp-dev
```

#### 4. DNS レコードの設定

CloudFront Distribution が作成されたら、外部 DNS サービスで CNAME レコードを設定します。

```
# CloudFront ドメイン名を取得
aws cloudformation describe-stacks \
  --stack-name nagiyu-root-webapp-dev \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDomain'].OutputValue" \
  --output text
```

外部 DNS サービスの管理画面で設定:

| タイプ | 名前 | 値 |
|-------|------|-----|
| CNAME | `example.com` | `d123456.cloudfront.net` |

#### 5. 動作確認

```bash
# CloudFront 経由でアクセス
curl -I https://example.com

# ヘルスチェック
curl https://example.com/health
```

### GitHub Actions による自動デプロイ

`.github/workflows/root-deploy.yml` が以下のフローで自動デプロイします。

**トリガー:**
- master ブランチへの push
- `infra/bin/**`, `infra/root/**` 等の変更

**デプロイステップ:**

1. **CDK Synth**: CloudFormation テンプレート生成と検証
2. **CDK Deploy**: 全スタックをデプロイ (`--all --require-approval never`)

**注意事項:**
- コンテナイメージは別途ビルド・プッシュが必要 (今後のイシューで自動化予定)
- DNS レコードは手動設定が必要 (初回のみ)

---

## スケーリング戦略

### ECS Auto Scaling

**スケーリングポリシー:**

| メトリクス | ターゲット値 | スケールアウト条件 | スケールイン条件 |
|----------|------------|----------------|----------------|
| CPU 使用率 | 70% | CPU > 70% が 3 分間継続 | CPU < 30% が 10 分間継続 |
| ALB リクエスト数/タスク | 1000 | リクエスト数 > 1000/タスク | リクエスト数 < 500/タスク |

**タスク数の範囲:**
- **最小**: 2 タスク (高可用性のため)
- **希望**: 2 タスク (初期値)
- **最大**: 10 タスク (コスト上限)

**スケールアウト/イン速度:**
- **スケールアウト**: 即座に (1-2 分)
- **スケールイン**: 慎重に (10 分のクールダウン)

### Fargate Spot の活用 (オプション)

コスト削減のため、一部のタスクを Fargate Spot で実行可能です。

**設定例:**
- 70% On-Demand (安定性優先)
- 30% Spot (コスト削減)

**注意事項:**
- Spot タスクは中断される可能性がある
- 最小タスク数は On-Demand で確保

---

## セキュリティ設計

### ネットワークセキュリティ

1. **CloudFront → ALB**:
   - CloudFront の IP Ranges のみ許可
   - AWS Managed Prefix List を使用

2. **ALB → ECS Task**:
   - ALB Security Group からのみ許可
   - ポート 80, 3000 のみ

3. **ECS Task → Internet**:
   - HTTPS (443) のみ許可
   - ECR, Secrets Manager, CloudWatch へのアクセス

### IAM セキュリティ

- **最小権限の原則**: 必要最小限の権限のみを付与
- **Task Execution Role**: ECR, Logs, Secrets Manager のみ
- **Task Role**: アプリケーションの要件に応じて最小限の権限

### データセキュリティ

- **通信の暗号化**: すべての通信を HTTPS で暗号化
- **ログの保護**: CloudWatch Logs を暗号化 (KMS)
- **シークレット管理**: Secrets Manager で管理

### 脆弱性対策

- **コンテナイメージスキャン**: ECR で自動スキャン
- **パッチ適用**: 定期的なベースイメージ更新
- **WAF**: CloudFront に WAF を設定 (オプション)

---

## モニタリングとアラート

### CloudWatch Metrics

**ECS Service:**
- `CPUUtilization`: CPU 使用率
- `MemoryUtilization`: メモリ使用率
- `RunningTaskCount`: 実行中のタスク数

**ALB:**
- `RequestCount`: リクエスト数
- `TargetResponseTime`: レスポンスタイム
- `HTTPCode_Target_4XX_Count`: 4xx エラー数
- `HTTPCode_Target_5XX_Count`: 5xx エラー数
- `HealthyHostCount`: ヘルシーターゲット数

**CloudFront:**
- `Requests`: リクエスト数
- `BytesDownloaded`: ダウンロードバイト数
- `4xxErrorRate`: 4xx エラー率
- `5xxErrorRate`: 5xx エラー率

### CloudWatch Alarms

**Critical (即座に対応が必要):**
- ヘルシータスク数が 0
- 5xx エラー率が 10% 超過
- CPU 使用率が 90% 超過 (5 分間)

**Warning (監視が必要):**
- CPU 使用率が 80% 超過 (10 分間)
- メモリ使用率が 80% 超過
- 4xx エラー率が 20% 超過

### ログ

**アプリケーションログ:**
- CloudWatch Logs: `/ecs/nagiyu-root-webapp-{env}`
- 構造化ログ (JSON) を推奨
- ログレベル: ERROR, WARN, INFO, DEBUG

**アクセスログ:**
- ALB アクセスログ: S3 バケットに保存 (オプション)
- CloudFront ログ: S3 バケットに保存 (オプション)

---

## コスト見積もり

### dev 環境 (月額)

| リソース | 仕様 | 月額コスト (USD) |
|---------|------|----------------|
| ECS Fargate | 2 タスク × 0.25 vCPU × 0.5 GB | ~$15 |
| ALB | 1 ALB + データ処理 | ~$20 |
| CloudFront | データ転送 (1 TB) | ~$85 |
| CloudWatch Logs | 5 GB/月 | ~$2.50 |
| ECR | 10 GB ストレージ | ~$1 |
| **合計** | | **~$123.50** |

### prod 環境 (月額)

| リソース | 仕様 | 月額コスト (USD) |
|---------|------|----------------|
| ECS Fargate | 4 タスク × 0.25 vCPU × 0.5 GB | ~$30 |
| ALB | 1 ALB + データ処理 | ~$30 |
| CloudFront | データ転送 (10 TB) | ~$850 |
| CloudWatch Logs | 50 GB/月 | ~$25 |
| ECR | 10 GB ストレージ | ~$1 |
| **合計** | | **~$936** |

**注意事項:**
- データ転送量は想定値
- Auto Scaling によりタスク数が変動
- 無料利用枠を考慮していない

---

## 運用

### デプロイ

**新しいイメージのデプロイ:**

```bash
# 1. 新しいイメージをビルド・プッシュ
docker build -t nagiyu-root-webapp:v1.2.3 .
docker tag nagiyu-root-webapp:v1.2.3 \
  {account}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-root-webapp:v1.2.3
docker push {account}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-root-webapp:v1.2.3

# 2. ECS Service を更新 (タスク定義を更新)
aws ecs update-service \
  --cluster nagiyu-root-webapp-dev-cluster \
  --service nagiyu-root-webapp-dev-service \
  --force-new-deployment
```

**ロールバック:**

```bash
# 前のタスク定義に戻す
aws ecs update-service \
  --cluster nagiyu-root-webapp-dev-cluster \
  --service nagiyu-root-webapp-dev-service \
  --task-definition nagiyu-root-webapp-dev:123
```

### スケーリング

**手動スケーリング:**

```bash
# 希望タスク数を変更
aws ecs update-service \
  --cluster nagiyu-root-webapp-dev-cluster \
  --service nagiyu-root-webapp-dev-service \
  --desired-count 5
```

### ログ確認

```bash
# 最新のログストリームを確認
aws logs tail /ecs/nagiyu-root-webapp-dev --follow

# 特定のタスクのログ
aws logs get-log-events \
  --log-group-name /ecs/nagiyu-root-webapp-dev \
  --log-stream-name ecs/nagiyu-root-webapp/{task-id}
```

### トラブルシューティング

**タスクが起動しない:**

```bash
# タスクの状態を確認
aws ecs describe-tasks \
  --cluster nagiyu-root-webapp-dev-cluster \
  --tasks {task-arn}

# イベントログを確認
aws ecs describe-services \
  --cluster nagiyu-root-webapp-dev-cluster \
  --services nagiyu-root-webapp-dev-service
```

**ヘルスチェックが失敗する:**

```bash
# ターゲットグループのヘルス状態を確認
aws elbv2 describe-target-health \
  --target-group-arn {target-group-arn}

# ALB のログを確認 (S3 に保存されている場合)
aws s3 ls s3://nagiyu-alb-logs-{env}/
```

---

## 将来の拡張

### 1. Blue/Green デプロイ

現在のローリングアップデートから Blue/Green デプロイに移行することで、より安全なデプロイが可能になります。

**実装:**
- CodeDeploy を使用
- 新バージョンを別のターゲットグループにデプロイ
- トラフィックを段階的に切り替え

### 2. Fargate Spot の活用

コスト削減のため、一部のタスクを Fargate Spot で実行します。

**実装:**
- Capacity Provider Strategy を設定
- On-Demand と Spot の比率を調整

### 3. WAF の導入

セキュリティ強化のため、CloudFront に WAF を設定します。

**実装:**
- AWS WAF v2 を使用
- SQL Injection, XSS 対策
- レート制限

### 4. カナリアデプロイ

新バージョンを少数のユーザーにのみ公開し、問題がないことを確認してから全体にロールアウトします。

**実装:**
- CloudFront Functions または Lambda@Edge
- トラフィックの一部を新バージョンにルーティング

### 5. マルチリージョン展開

グローバルなユーザーに対応するため、複数リージョンにデプロイします。

**実装:**
- CloudFront の Origin Failover
- Route 53 Geolocation Routing

---

## 参考資料

### AWS ドキュメント

- [Amazon ECS on AWS Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
- [Amazon CloudFront](https://docs.aws.amazon.com/cloudfront/)
- [AWS CDK for ECS](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_ecs-readme.html)

### ベストプラクティス

- [ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/intro.html)
- [Fargate Best Practices](https://aws.github.io/aws-eks-best-practices/security/docs/hosts/#use-amazon-fargate-for-isolated-workloads)
- [ALB Best Practices](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancer-best-practices.html)

---

## 関連ドキュメント

- [CDK 移行ガイド](../cdk-migration.md) - CloudFormation から CDK への移行戦略
- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [VPC 詳細](../shared/vpc.md) - VPC リソースの詳細設計
- [ACM 詳細](../shared/acm.md) - SSL/TLS 証明書の管理

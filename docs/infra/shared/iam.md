# IAM (Identity and Access Management)

本ドキュメントは、nagiyu-platform の IAM リソースの設計と運用について説明します。

---

## 概要

IAM リソースは以下の方針で管理されます。

- **最小権限の原則**: 必要最小限の権限のみを付与
- **ポリシーとユーザーの分離**: 再利用可能なポリシーを定義し、複数のユーザーで共有
- **認証情報の安全管理**: アクセスキーは手動発行し、CloudFormation で自動生成しない

---

## ディレクトリ構造

```
infra/shared/iam/
├── policies/
│   ├── deploy-policy-core.yaml        # コア権限（CloudFormation, IAM, Network）
│   ├── deploy-policy-container.yaml   # コンテナ権限（ECR, ECS, Batch）
│   ├── deploy-policy-application.yaml # アプリ権限（Lambda, API Gateway, S3, DynamoDB, CloudFront）
│   └── deploy-policy-integration.yaml # 統合権限（KMS, Secrets, SSM, SNS, SQS, EventBridge, Auto Scaling）
└── users/
    ├── github-actions-user.yaml       # GitHub Actions 用 IAM ユーザー
    └── local-dev-user.yaml            # ローカル開発用 IAM ユーザー
```

---

## リソース詳細

### 1. デプロイポリシー（4つに分割）

IAM マネージドポリシーのサイズ制限（6144文字）により、デプロイポリシーを4つに分割しています。

#### 1.1. Core Policy (`deploy-policy-core.yaml`)

**スタック名:** `nagiyu-shared-deploy-policy-core`

**概要:**
デプロイの中核となる権限を定義。必須のポリシー。

**主な権限:**
- **CloudFormation**: スタックの作成、更新、削除、ChangeSet 管理
- **IAM**: ロール・ポリシー管理、PassRole、Service-linked role 作成
- **Network (VPC/EC2)**: VPC、Subnet、Internet Gateway、NAT Gateway、Route Table、Security Group、Network Interface の管理
- **CloudWatch Logs**: Log Group/Stream の作成、管理

**Export 値:**
- `nagiyu-deploy-policy-core-arn`: ポリシーの ARN

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-core.yaml \
  --stack-name nagiyu-shared-deploy-policy-core \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

#### 1.2. Container Policy (`deploy-policy-container.yaml`)

**スタック名:** `nagiyu-shared-deploy-policy-container`

**概要:**
コンテナ関連サービスの権限を定義。

**主な権限:**
- **ECR**: リポジトリ管理、イメージのプッシュ/プル、ライフサイクルポリシー
- **ECS**: クラスター、タスク定義、サービス、タスクの管理
- **Batch**: Compute Environment、Job Queue、Job Definition の管理

**Export 値:**
- `nagiyu-deploy-policy-container-arn`: ポリシーの ARN

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-container.yaml \
  --stack-name nagiyu-shared-deploy-policy-container \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

#### 1.3. Application Policy (`deploy-policy-application.yaml`)

**スタック名:** `nagiyu-shared-deploy-policy-application`

**概要:**
アプリケーション層のサービス権限を定義。

**主な権限:**
- **Lambda**: 関数管理、バージョニング、エイリアス、Function URL
- **S3**: バケット管理、オブジェクト操作、暗号化、ライフサイクル
- **DynamoDB**: テーブル管理、TTL、継続的バックアップ
- **API Gateway**: HTTP API/WebSocket API の管理
- **CloudFront**: ディストリビューション管理、キャッシュ無効化

**Export 値:**
- `nagiyu-deploy-policy-application-arn`: ポリシーの ARN

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-application.yaml \
  --stack-name nagiyu-shared-deploy-policy-application \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

#### 1.4. Integration Policy (`deploy-policy-integration.yaml`)

**スタック名:** `nagiyu-shared-deploy-policy-integration`

**概要:**
システム統合・セキュリティ関連サービスの権限を定義。

**主な権限:**
- **KMS**: キー管理、暗号化/復号化操作
- **Secrets Manager**: シークレット管理、ローテーション
- **Systems Manager (Parameter Store)**: パラメータ管理
- **SNS**: トピック管理、サブスクリプション
- **SQS**: キュー管理、メッセージ操作
- **EventBridge**: Event Bus、ルール、ターゲット管理
- **Application Auto Scaling**: スケーリングターゲット、ポリシー管理

**Export 値:**
- `nagiyu-deploy-policy-integration-arn`: ポリシーの ARN

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-integration.yaml \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### 2. GitHub Actions ユーザー (`users/github-actions-user.yaml`)

**スタック名:** `nagiyu-shared-github-actions-user`

**概要:**
CI/CD パイプライン（GitHub Actions）で使用する IAM ユーザー。

**ユーザー名:** `nagiyu-github-actions`

**アタッチされるポリシー:**
- `nagiyu-deploy-policy-core` (ImportValue で参照)
- `nagiyu-deploy-policy-container` (ImportValue で参照)
- `nagiyu-deploy-policy-application` (ImportValue で参照)
- `nagiyu-deploy-policy-integration` (ImportValue で参照)

**タグ:**
- `Application: nagiyu`
- `Purpose: GitHub Actions CI/CD`

**デプロイコマンド:**
```bash
cd infra/shared/iam/users

aws cloudformation deploy \
  --template-file github-actions-user.yaml \
  --stack-name nagiyu-shared-github-actions-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

**アクセスキー発行手順:**
1. AWS マネジメントコンソールにログイン
2. IAM → ユーザー → `nagiyu-github-actions` を選択
3. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」
4. アクセスキー ID とシークレットアクセスキーを安全に保存

**GitHub Secrets への登録:**
- `AWS_ACCESS_KEY_ID`: 発行したアクセスキー ID
- `AWS_SECRET_ACCESS_KEY`: 発行したシークレットアクセスキー
- `AWS_REGION`: `us-east-1`

### 3. ローカル開発ユーザー (`users/local-dev-user.yaml`)

**スタック名:** `nagiyu-shared-local-dev-user`

**概要:**
開発者がローカル環境から手動デプロイする際に使用する IAM ユーザー。

**ユーザー名:** `nagiyu-local-dev`

**アタッチされるポリシー:**
- `nagiyu-deploy-policy-core` (ImportValue で参照)
- `nagiyu-deploy-policy-container` (ImportValue で参照)
- `nagiyu-deploy-policy-application` (ImportValue で参照)
- `nagiyu-deploy-policy-integration` (ImportValue で参照)

**タグ:**
- `Application: nagiyu`
- `Purpose: Local developer (manual deploy)`

**デプロイコマンド:**
```bash
cd infra/shared/iam/users

aws cloudformation deploy \
  --template-file local-dev-user.yaml \
  --stack-name nagiyu-shared-local-dev-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

**アクセスキー発行手順:**
1. AWS マネジメントコンソールにログイン
2. IAM → ユーザー → `nagiyu-local-dev` を選択
3. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」
4. アクセスキー ID とシークレットアクセスキーを安全に保存

**ローカル環境への設定:**
```bash
aws configure --profile nagiyu-local-dev
```

使用時:
```bash
export AWS_PROFILE=nagiyu-local-dev
```

---

## デプロイ順序

IAM リソースは依存関係があるため、以下の順序でデプロイしてください。

### ステップ1: デプロイポリシー（4つ）

すべてのデプロイポリシーを先にデプロイします。順序は問いません。

```bash
cd infra/shared/iam/policies

# Core Policy
aws cloudformation deploy \
  --template-file deploy-policy-core.yaml \
  --stack-name nagiyu-shared-deploy-policy-core \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Container Policy
aws cloudformation deploy \
  --template-file deploy-policy-container.yaml \
  --stack-name nagiyu-shared-deploy-policy-container \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Application Policy
aws cloudformation deploy \
  --template-file deploy-policy-application.yaml \
  --stack-name nagiyu-shared-deploy-policy-application \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# Integration Policy
aws cloudformation deploy \
  --template-file deploy-policy-integration.yaml \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### ステップ2: IAM ユーザー

ポリシーのデプロイ完了後、IAM ユーザーをデプロイします。

```bash
cd infra/shared/iam/users

# GitHub Actions ユーザー
aws cloudformation deploy \
  --template-file github-actions-user.yaml \
  --stack-name nagiyu-shared-github-actions-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# ローカル開発ユーザー
aws cloudformation deploy \
  --template-file local-dev-user.yaml \
  --stack-name nagiyu-shared-local-dev-user \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

---

## セキュリティベストプラクティス

### 認証情報の管理

- **アクセスキーは手動発行**: CloudFormation で自動生成せず、AWS コンソールから手動発行
- **安全な保存**: GitHub Secrets、シークレットマネージャー、または暗号化されたローカルファイルで管理
- **定期的なローテーション**: アクセスキーは定期的に更新（推奨: 90日ごと）
- **最小限の共有**: 必要な人員のみがアクセスキーを保持

### 権限の最小化

- デプロイポリシーは必要最小限の権限のみを定義
- リソースごとに適切な Action を指定
- 可能な限り Resource を制限（現在は `*` だが、将来的に改善検討）

### アクセスの監視

- CloudTrail で IAM ユーザーの操作ログを記録
- 異常なアクセスパターンを検知
- 定期的な権限の見直し

---

## 運用手順

### アクセスキーのローテーション

#### 1. 新しいアクセスキーの発行

```bash
aws iam create-access-key --user-name nagiyu-github-actions
```

#### 2. GitHub Secrets / ローカル環境への更新

新しいアクセスキーで Secrets を更新。

#### 3. 動作確認

新しいアクセスキーでデプロイが正常に動作することを確認。

#### 4. 古いアクセスキーの削除

```bash
aws iam delete-access-key \
  --user-name nagiyu-github-actions \
  --access-key-id <古いアクセスキーID>
```

### ポリシーの更新

デプロイポリシーに権限を追加する場合:

1. 該当するポリシーファイルを編集
    - Core権限: `deploy-policy-core.yaml`
    - Container権限: `deploy-policy-container.yaml`
    - Application権限: `deploy-policy-application.yaml`
    - Integration権限: `deploy-policy-integration.yaml`

2. 該当するポリシーをデプロイ

```bash
cd infra/shared/iam/policies

# 例: Core Policy を更新
aws cloudformation deploy \
  --template-file deploy-policy-core.yaml \
  --stack-name nagiyu-shared-deploy-policy-core \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

3. 変更が自動的にアタッチされた IAM ユーザーに反映される

---

## トラブルシューティング

### ユーザー作成が失敗する

**エラー:** `Export with name 'nagiyu-deploy-policy-xxx-arn' does not exist.`

**原因:** デプロイポリシーが先にデプロイされていない。

**解決策:**
4つのデプロイポリシーをすべてデプロイしてください。

```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-core.yaml \
  --stack-name nagiyu-shared-deploy-policy-core \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

aws cloudformation deploy \
  --template-file deploy-policy-container.yaml \
  --stack-name nagiyu-shared-deploy-policy-container \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

aws cloudformation deploy \
  --template-file deploy-policy-application.yaml \
  --stack-name nagiyu-shared-deploy-policy-application \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

aws cloudformation deploy \
  --template-file deploy-policy-integration.yaml \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### デプロイ時に権限エラーが発生する

**エラー:** `User: arn:aws:iam::xxx:user/nagiyu-github-actions is not authorized to perform: xxx on resource: xxx`

**原因:** デプロイポリシーに必要な権限が不足している。

**解決策:**
1. 該当するポリシーファイルに必要な権限を追加
2. ポリシーを再デプロイ
3. 変更が反映されるまで数分待機

### ポリシーサイズ制限エラー

**エラー:** `Cannot exceed quota for PolicySize: 6144`

**原因:** 単一ポリシーが 6144 文字を超えている。

**解決策:**
ポリシーは既に4つに分割されています。さらに権限が必要な場合は、新しいポリシーファイルを作成してください。

### アクセスキーが無効化されている

**原因:** アクセスキーが非アクティブ化されている。

**解決策:**
```bash
aws iam update-access-key \
  --user-name nagiyu-github-actions \
  --access-key-id <アクセスキーID> \
  --status Active
```

---

## 関連ドキュメント

- [初回セットアップ](../setup.md) - IAM リソースの初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [アーキテクチャ](../architecture.md) - インフラ全体の設計
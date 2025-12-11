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
│   └── deploy-policy.yaml       # デプロイ用 ManagedPolicy
└── users/
    ├── github-actions-user.yaml # GitHub Actions 用 IAM ユーザー
    └── local-dev-user.yaml      # ローカル開発用 IAM ユーザー
```

---

## リソース詳細

### 1. デプロイポリシー (`policies/deploy-policy.yaml`)

**スタック名:** `nagiyu-shared-deploy-policy`

**概要:**
CloudFormation を使用したインフラデプロイに必要な権限を定義した ManagedPolicy。

**主な権限:**
- CloudFormation: スタックの作成、更新、削除
- ECR: Docker イメージのプッシュ/プル
- Lambda: 関数の作成、更新、削除
- DynamoDB: テーブルの作成、更新、削除
- CloudWatch Logs: ロググループの作成、管理
- S3: バケットの作成、オブジェクトの操作
- IAM: ロール、ポリシーの作成（PassRole 含む）
- API Gateway: API の作成、管理
- CloudFront: ディストリビューションの作成、管理
- その他: VPC、Security Groups、Batch など

**Export 値:**
- `nagiyu-deploy-policy-arn`: ポリシーの ARN（他のリソースから参照可能）

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy.yaml \
  --stack-name nagiyu-shared-deploy-policy \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### 2. GitHub Actions ユーザー (`users/github-actions-user.yaml`)

**スタック名:** `nagiyu-shared-github-actions-user`

**概要:**
CI/CD パイプライン（GitHub Actions）で使用する IAM ユーザー。

**ユーザー名:** `nagiyu-github-actions`

**アタッチされるポリシー:**
- `nagiyu-deploy-policy` (ImportValue で参照)

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
- `nagiyu-deploy-policy` (ImportValue で参照)

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

1. **デプロイポリシー** (`nagiyu-shared-deploy-policy`)
    - ポリシーの ARN を Export する

2. **GitHub Actions ユーザー** (`nagiyu-shared-github-actions-user`)
    - デプロイポリシーの ARN を ImportValue で参照

3. **ローカル開発ユーザー** (`nagiyu-shared-local-dev-user`)
    - デプロイポリシーの ARN を ImportValue で参照

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

1. `infra/shared/iam/policies/deploy-policy.yaml` を編集
2. デプロイ

```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy.yaml \
  --stack-name nagiyu-shared-deploy-policy \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

3. 変更が自動的にアタッチされた IAM ユーザーに反映される

---

## トラブルシューティング

### ユーザー作成が失敗する

**エラー:** `Export with name 'nagiyu-deploy-policy-arn' does not exist.`

**原因:** デプロイポリシーが先にデプロイされていない。

**解決策:**
```bash
cd infra/shared/iam/policies
aws cloudformation deploy \
  --template-file deploy-policy.yaml \
  --stack-name nagiyu-shared-deploy-policy \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

### デプロイ時に権限エラーが発生する

**エラー:** `User: arn:aws:iam::xxx:user/nagiyu-github-actions is not authorized to perform: xxx on resource: xxx`

**原因:** デプロイポリシーに必要な権限が不足している。

**解決策:**
1. `deploy-policy.yaml` に必要な権限を追加
2. ポリシーを再デプロイ
3. 変更が反映されるまで数分待機

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
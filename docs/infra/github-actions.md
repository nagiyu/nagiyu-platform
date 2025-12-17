# GitHub Actions CI/CD

本ドキュメントは、nagiyu-platform における GitHub Actions を使用した CI/CD の設定と運用について説明します。

---

## ワークフロー一覧

### インフラストラクチャ

- `deploy-acm.yml` - ACM 証明書のデプロイ
- `deploy-vpc.yml` - VPC インフラのデプロイ

### アプリケーション

- `tools-deploy.yml` - Tools アプリのビルド・デプロイ

---

## 初回セットアップ

### GitHub Actions 用 IAM ロールの作成 (OIDC)

GitHub Actions から AWS リソースにアクセスするには、OIDC (OpenID Connect) を使用した認証が推奨されます。
長期的なアクセスキーを使用せず、一時的な認証情報を取得できるため、セキュリティが向上します。

#### 1. AWS IAM で OIDC プロバイダーを作成

1. AWS マネジメントコンソールにログイン
2. IAM → ID プロバイダー → プロバイダーを追加
3. 以下の情報を入力:
   - プロバイダーのタイプ: `OpenID Connect`
   - プロバイダーの URL: `https://token.actions.githubusercontent.com`
   - 対象者: `sts.amazonaws.com`
4. 「プロバイダーを追加」をクリック

#### 2. デプロイ用 IAM ロールを作成

以下の Trust Policy を使用してロールを作成します:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:nagiyu/nagiyu-platform:*"
        }
      }
    }
  ]
}
```

**注意**: `<AWS_ACCOUNT_ID>` を実際の AWS アカウント ID に置き換えてください。

#### 3. ロールに権限を付与

以下の権限ポリシーをロールにアタッチします:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerUpload",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunctionConfiguration",
        "lambda:GetFunctionUrlConfig"
      ],
      "Resource": [
        "arn:aws:lambda:ap-northeast-1:<AWS_ACCOUNT_ID>:function:tools-app-dev",
        "arn:aws:lambda:ap-northeast-1:<AWS_ACCOUNT_ID>:function:tools-app-prod"
      ]
    }
  ]
}
```

**注意**: `<AWS_ACCOUNT_ID>` を実際の AWS アカウント ID に置き換えてください。

#### 4. GitHub Secrets の設定

1. GitHub リポジトリの Settings → Secrets and variables → Actions
2. `New repository secret` をクリック
3. 以下のシークレットを追加:

| Name | Value | 説明 |
|------|-------|------|
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::<AWS_ACCOUNT_ID>:role/github-actions-deploy-role` | 上記で作成した IAM ロールの ARN |

**注意**: `<AWS_ACCOUNT_ID>` を実際の AWS アカウント ID に置き換えてください。

---

## ワークフロー詳細

### Tools アプリのデプロイワークフロー

#### トリガー条件

以下のブランチへの push 時に自動実行されます:

- `develop` - 開発環境にデプロイ
- `integration/**` - 開発環境にデプロイ
- `master` - 本番環境にデプロイ

また、以下のパスに変更があった場合のみ実行されます:

- `services/tools/**`
- `infra/tools/**`
- `.github/workflows/tools-deploy.yml`

手動実行も可能です (Actions タブから `workflow_dispatch` を使用)。

#### ジョブ構成

1. **Build Job**
   - Docker イメージをビルド
   - ECR にプッシュ
   - イメージ URI を出力

2. **Deploy Job**
   - Lambda 関数のコードを更新
   - 更新完了を待機
   - ヘルスチェックで検証

#### デプロイ環境の判定

- `master` ブランチ → 本番環境 (`prod`)
- その他のブランチ → 開発環境 (`dev`)

---

## トラブルシューティング

### ワークフローが失敗する

#### ECR ログインエラー

- IAM ロールに ECR 権限が付与されているか確認
- OIDC プロバイダーが正しく設定されているか確認

#### Lambda 更新エラー

- Lambda 関数が存在するか確認 (`tools-app-dev` または `tools-app-prod`)
- IAM ロールに Lambda 更新権限が付与されているか確認

#### ヘルスチェック失敗

- Lambda 関数が正常に起動しているか確認
- `/api/health` エンドポイントが実装されているか確認
- Lambda Function URL が有効化されているか確認

### ワークフローが実行されない

- ブランチ名が `develop`, `integration/**`, `master` のいずれかであることを確認
- 変更されたファイルが `services/tools/**` または `infra/tools/**` 配下にあることを確認

---

## 参考資料

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)
- [ブランチ戦略](../branching.md) - デプロイフローと関連するブランチ戦略

---

## 関連ドキュメント

- [初回セットアップ](./setup.md) - IAM ユーザーとアクセスキーを使用した従来の設定方法
- [デプロイ手順](./deploy.md) - 日常的なインフラ更新とデプロイ操作

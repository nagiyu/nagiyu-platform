# IAM (Identity and Access Management)

本ドキュメントは、nagiyu-platform の IAM リソースの設計と運用について説明します。

---

## 概要

IAM リソースは以下の方針で管理されます。

- **最小権限の原則**: 必要最小限の権限のみを付与
- **ポリシーとユーザーの分離**: 再利用可能なポリシーを定義し、複数のユーザーで共有
- **認証情報の安全管理**: アクセスキーは手動発行し、CloudFormation/CDK で自動生成しない
- **IaC による管理**: AWS CDK で IAM リソースを管理（2026年1月移行完了）

---

## 管理方式

**現在の管理方式**: AWS CDK

IAM ポリシーと IAM ユーザーは AWS CDK で管理されています。

### ディレクトリ構造

```
infra/shared/
├── lib/iam/
│   ├── iam-core-policy-stack.ts             # デプロイポリシー: Core
│   ├── iam-application-policy-stack.ts      # デプロイポリシー: Application
│   ├── iam-container-policy-stack.ts        # デプロイポリシー: Container
│   ├── iam-integration-policy-stack.ts      # デプロイポリシー: Integration
│   ├── iam-claude-readonly-policy-stack.ts  # Claude 用閲覧専用ポリシー（共通閲覧ポリシー）
│   ├── iam-claude-access-stack.ts           # Claude 用ロール nagiyu-claude・キー保持ユーザー
│   └── iam-policies-stack.ts                # 旧（4 ポリシーまとめ。互換用）
├── iam/                         # 旧 CloudFormation テンプレート（バックアップ）
│   ├── policies/
│   │   ├── backup/              # YAML ファイルのバックアップ
│   │   ├── deploy-policy-core.yaml
│   │   ├── deploy-policy-container.yaml
│   │   ├── deploy-policy-application.yaml
│   │   └── deploy-policy-integration.yaml
│   └── users/
│       ├── backup/              # YAML ファイルのバックアップ
│       ├── github-actions-user.yaml
│       └── local-dev-user.yaml
└── bin/shared.ts                # CDK エントリーポイント
```

---

## リソース詳細

### 1. デプロイポリシー（4つに分割）

IAM マネージドポリシーのサイズ制限（6144文字）により、デプロイポリシーを4つに分割しています。

#### 1.1. Core Policy

**CDK スタック名:** `SharedIamPolicies`（NagiyuDeployPolicyCore リソース）

**概要:**
デプロイの中核となる権限を定義。必須のポリシー。

**主な権限:**
- **CloudFormation**: スタックの作成、更新、削除、ChangeSet 管理
- **CDK Bootstrap**: CDK デプロイロールの Assume
- **IAM**: ロール・ポリシー管理、PassRole、Service-linked role 作成
- **Network (VPC/EC2)**: VPC、Subnet、Internet Gateway、NAT Gateway、Route Table、Security Group、Network Interface の管理
- **CloudWatch Logs**: Log Group/Stream の作成、管理

**参照方法:**
- `arn:aws:iam::{account}:policy/nagiyu-deploy-policy-core`（`managedPolicyName` で固定）

#### 1.2. Application Policy

**CDK スタック名:** `SharedIamPolicies`（NagiyuDeployPolicyApplication リソース）

**概要:**
アプリケーション層のサービス権限を定義。

**主な権限:**
- **Lambda**: 関数管理、バージョニング、エイリアス、Function URL
- **S3**: バケット管理、オブジェクト操作、暗号化、ライフサイクル
- **DynamoDB**: テーブル管理、TTL、継続的バックアップ
- **API Gateway**: HTTP API/WebSocket API の管理
- **CloudFront**: ディストリビューション管理、キャッシュ無効化
- **ACM**: 証明書管理

**参照方法:**
- `arn:aws:iam::{account}:policy/nagiyu-deploy-policy-application`（`managedPolicyName` で固定）

#### 1.3. Container Policy

**CDK スタック名:** `SharedIamPolicies`（NagiyuDeployPolicyContainer リソース）

**概要:**
コンテナ関連サービスの権限を定義。

**主な権限:**
- **ECR**: リポジトリ管理、イメージのプッシュ/プル、ライフサイクルポリシー
- **ECS**: クラスター、タスク定義、サービス、タスクの管理
- **Batch**: Compute Environment、Job Queue、Job Definition の管理

**参照方法:**
- `arn:aws:iam::{account}:policy/nagiyu-deploy-policy-container`（`managedPolicyName` で固定）

#### 1.4. Integration Policy

**CDK スタック名:** `SharedIamPolicies`（NagiyuDeployPolicyIntegration リソース）

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

**参照方法:**
- `arn:aws:iam::{account}:policy/nagiyu-deploy-policy-integration`（`managedPolicyName` で固定）

**デプロイコマンド:**
```bash
cd infra/shared/iam/policies

aws cloudformation deploy \
  --template-file deploy-policy-integration.yaml \
  --stack-name nagiyu-shared-deploy-policy-integration \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

#### 1.5. Claude Read-Only Policy

**CDK スタック名:** `NagiyuSharedIamClaudeReadonly`

**概要:**
Claude Code on the web のリモート環境から AWS リソースを「閲覧のみ」で調査するためのポリシー。
デプロイポリシー（1.1〜1.4）とは独立した専用ポリシーで、List / Get / Describe / Scan / Query / Filter
系のみを許可する。

**主な許可（Allow）権限:**
- **CloudFormation / CloudWatch / Logs**: スタック状態、メトリクス、ログ本文の取得
- **Lambda / ECS / Batch / ECR**: 関数・コンテナ構成の閲覧、ECR イメージのメタデータ取得
- **CloudFront / API Gateway / ACM / Route53**: 配信・API・証明書・DNS の構成把握
- **DynamoDB / S3**: テーブル / バケットの構成と内容（後述の Deny 対象を除く）
- **EC2 / VPC**: ネットワーク構成の Describe
- **SNS / SQS / EventBridge**: メッセージング / イベント基盤の構成把握
- **SSM / KMS**: パラメータ / キーのメタデータ閲覧（Decrypt は禁止）
- **IAM**: 権限構成の Read（Get / List / SimulatePolicy）
- **STS**: `GetCallerIdentity` で自身の identity 確認
- **Cost Explorer**: コスト・使用量の閲覧（`ce:Get*` / `ce:Describe*` / `ce:List*`。書き込み系は含まない）

**明示 Deny:**
- `secretsmanager:GetSecretValue` / `secretsmanager:GetRandomPassword`
- `kms:Decrypt` / `kms:Encrypt` / `kms:ReEncrypt*` / `kms:GenerateDataKey*` / `kms:GenerateRandom`
    - **副次効果**: SSM SecureString パラメータの値取得もこの Deny で実質的に防がれる
- `dynamodb:GetItem` / `BatchGetItem` / `Scan` / `Query` を
  `arn:aws:dynamodb:*:*:table/nagiyu-auth-users-*`（GSI 含む）に対して Deny
    - PII（email / googleId / name 等）の閲覧経路を遮断

**参照方法:**
- `arn:aws:iam::{account}:policy/nagiyu-claude-readonly-policy`（`managedPolicyName` で固定）

### 2. GitHub Actions OIDC ロール

**CDK スタック名:** `NagiyuSharedIamGitHubOidc`

**概要:**
GitHub Actions から AWS への認証を、長期アクセスキーではなく GitHub OIDC + AssumeRole で行う。
GitHub OIDC プロバイダ（発行者: `token.actions.githubusercontent.com`）と、ワークフローの実行文脈ごとに
信頼条件を分けた 3 つのロールを作成する。旧 `nagiyu-github-actions` ユーザー（長期アクセスキー方式）は
全ワークフローの OIDC 移行と本番での稼働確認が済んだため撤去済み（#3820）。

**ロール一覧:**

| ロール名 | 信頼条件（OIDC トークンの `sub`） | 想定する利用者 |
| --- | --- | --- |
| `nagiyu-github-actions-dev` | `repo:nagiyu/nagiyu-platform:environment:dev` | GitHub Environment `dev` を指定する deploy 系 job |
| `nagiyu-github-actions-prod` | `repo:nagiyu/nagiyu-platform:environment:prod` | GitHub Environment `prod` を指定する deploy 系 job |
| `nagiyu-github-actions-pr` | `repo:nagiyu/nagiyu-platform:pull_request` | `pull_request` イベントで動く verify 系 job |

**アカウントスコープによるロールの絞り込み（マルチアカウント化・#3820）:**
上記 3 ロールは 1 つの AWS アカウントに全部作られるわけではなく、デプロイ先アカウントごとに作成対象を絞る
（`stack-plan.ts` の `getGitHubActionsOidcRoleIds`）。prod アカウントには `nagiyu-github-actions-prod` のみ、
dev アカウントには `nagiyu-github-actions-dev` / `-pr` のみを作成する。prod アカウントに dev / pr ロールを
置くと、dev Environment や pull_request の文脈から prod アカウントを操作できてしまい、アカウント分離の
効果を削るため。

**アタッチされるポリシー:**
当面は 3 ロールとも同じ 4 ポリシー（core / application / container / integration）を使う。
ロールごとの権限の絞り込みは今回のスコープ外。

**なぜロールを 3 つに分けたか:**
OIDC トークンの `sub` クレームで、ワークフローの実行文脈（GitHub Environment・pull_request）ごとに
引き受けられるロールを限定するため。たとえば pull_request のワークフローは prod ロールを引き受けられない。

**なぜ prod のデプロイ元ブランチを `master` に限定しているか:**
`nagiyu-github-actions-prod` の信頼条件は「GitHub Environment が `prod` であること」だけで、ブランチは問わない。
そのため、GitHub 側で prod Environment の Deployment branches を `master` のみに制限し、
任意のブランチから `environment: prod` を指定して prod ロールを引き受けられないようにしている。

**なぜロール ARN を Secrets ではなく Environment / リポジトリ変数（Variables）で持つか:**
ロール ARN 自体は機密情報ではないため Variables で足りる。加えて、後続 Phase（親 Issue #3816）で
dev / prod を別 AWS アカウントに分割する際、ワークフロー側のコードを変えずに変数の値を差し替えるだけで
済むようにするため。

**fork からの PR:**
fork からの pull_request では GitHub が `id-token: write` を付与しないため、PR ロールを引き受けられない
（意図した制限であり、フォールバック手段は用意しない）。

**ワークフロー側の設定:**
- deploy 系 job: GitHub Environment（`dev` / `prod`）を指定し、`role-to-assume: ${{ vars.AWS_ROLE_ARN }}` を使う
- `pull_request` 起動の verify 系 job: Environment は指定せず、`role-to-assume: ${{ vars.AWS_PR_ROLE_ARN }}` を使う
- どちらも `permissions.id-token: write` が必要

**GitHub 側に人が登録する変数（Secrets ではなく Variables）:**

| 登録先 | 変数名 | 値 |
| --- | --- | --- |
| Environment `dev` | `AWS_ROLE_ARN` | `nagiyu-github-actions-dev` の ARN |
| Environment `prod` | `AWS_ROLE_ARN` | `nagiyu-github-actions-prod` の ARN |
| リポジトリ変数 | `AWS_PR_ROLE_ARN` | `nagiyu-github-actions-pr` の ARN |

あわせて、prod Environment の Deployment branches を `master` のみに制限する（GitHub 側の設定）。

### 3. ローカル開発（IAM Identity Center へ移行済み）

人のローカル作業（手動デプロイ・調査）は IAM Identity Center（SSO）の一時認証情報で行う。
旧ローカル開発ユーザー `nagiyu-local-dev` は長期キーを避けるため削除した。
方式と設計判断は [AWS アカウント構成とアクセス管理](../aws-accounts.md) を参照。

### 4. Claude 用ロール `nagiyu-claude` とキー保持ユーザー

**CDK スタック名:** `NagiyuSharedIamClaude`

**概要:**
Claude Code on the web が dev / prod 両アカウントを扱うための構成。prod のキー保持ユーザー `nagiyu-claude-key` の長期キーで、各アカウントの `nagiyu-claude` ロールを AssumeRole する。構造の設計判断（身元を prod に置く理由、長期キーを残す理由、dev の追加ポリシーの基準）は [AWS アカウント構成とアクセス管理](../aws-accounts.md) を参照。

**アカウントごとの構成:**

| リソース | prod | dev |
| --- | --- | --- |
| ロール `nagiyu-claude` + 共通閲覧ポリシー（1.5.） | 作成 | 作成 |
| 追加ポリシー `nagiyu-claude-dev-operations-policy`（Lambda の実行のみ） | なし | 作成 |
| キー保持ユーザー `nagiyu-claude-key`（権限は両アカウントの `nagiyu-claude` への AssumeRole のみ） | 作成 | なし |

**信頼ポリシーをアカウント + `aws:PrincipalArn` 条件にしている理由:**
IAM は、信頼ポリシーの Principal に存在しないユーザーを直接書くと、ロールの作成時にエラーにする。dev のロールは prod のキー保持ユーザーより先にデプロイされうる（integration では dev にしかデプロイされない）ため、Principal は prod アカウントにして、`aws:PrincipalArn` の条件でキー保持ユーザーに絞っている。

**プロファイルを分けている理由（意図的な設計）:**
プロファイルを指定しないとキー保持ユーザーの権限（AssumeRole のみ）になり、何も見えない。これは、毎回どちらのアカウントかを明示させ、意図せず prod を操作する事故を防ぐための設計である。

**アクセスキー発行手順:**
1. AWS マネジメントコンソールにログイン（prod アカウント）
2. IAM → ユーザー → `nagiyu-claude-key` を選択
3. 「セキュリティ認証情報」タブ → 「アクセスキーを作成」
4. 用途は「サードパーティーサービス」を選択し、アクセスキー ID と
   シークレットアクセスキーを安全に保存
5. 発行後はユーザーごとに最大 2 本までしか保持できないため、不要になった旧キーは削除

**Claude Code on the web への登録:**

CDK / 設定ファイルではなく、**Claude Code on the web の環境設定（Setup Script）** から人が書き出す（リポジトリ外の設定）。

- 環境変数 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` に `nagiyu-claude-key` のキーを設定する
- `~/.aws/credentials` に名前付きプロファイル `[nagiyu-claude-key]` として同じキーを設定する
- `~/.aws/config` に `nagiyu-prod` / `nagiyu-dev` の 2 プロファイルを設定する。それぞれ `role_arn` を各アカウントの `nagiyu-claude` ロール、`source_profile = nagiyu-claude-key`、`role_session_name = claude-code-web`、`region = us-east-1` とする
- どちらにも既定プロファイル（`[default]`）は作らない

**動作確認:**

```bash
aws sts get-caller-identity --profile nagiyu-prod
aws sts get-caller-identity --profile nagiyu-dev
```

プロファイルを指定しない呼び出しは拒否されること（キー保持ユーザーは AssumeRole 権限しか持たない）。

```bash
aws secretsmanager get-secret-value --secret-id <任意のシークレット> --profile nagiyu-prod
aws dynamodb scan --table-name nagiyu-auth-users-dev --profile nagiyu-dev
```

上記は `AccessDenied` で失敗すること（保護が効いている証拠）。dev の許可済み Lambda 関数は、実行結果に影響を与えずに呼び出せることを `--invocation-type DryRun` で確認できる。

```bash
aws lambda invoke --function-name <許可済み関数名> --invocation-type DryRun --profile nagiyu-dev /dev/stdout
```

**注意:**
- このロールには **デプロイ権限を一切付与しない**（既存 4 ポリシーは添付しない）
- アクセスキーは Claude Code on the web 以外の環境にコピーしない

---

## デプロイ手順（CDK）

IAM リソースは依存関係があるため、以下の順序でデプロイしてください。

### 前提条件

- AWS CLI がインストールされている
- AWS 認証情報が設定されている（初回デプロイ時は管理者権限が必要）
- Node.js がインストールされている
- monorepo のルートで `npm ci` を実行済み

### ステップ1: ビルド

```bash
cd infra/shared
npm run build
```

### ステップ2: デプロイポリシーのデプロイ

```bash
cd infra/shared

# 差分確認
npx cdk diff SharedIamPolicies

# デプロイ
npx cdk deploy SharedIamPolicies --require-approval never
```

このコマンドで4つのポリシーが一度にデプロイされます:
- nagiyu-deploy-policy-core
- nagiyu-deploy-policy-application
- nagiyu-deploy-policy-container
- nagiyu-deploy-policy-integration

### ステップ2.5: Claude 閲覧専用ポリシーのデプロイ

```bash
cd infra/shared

# 差分確認
npx cdk diff NagiyuSharedIamClaudeReadonly

# デプロイ
npx cdk deploy NagiyuSharedIamClaudeReadonly --require-approval never
```

このコマンドで Claude 用の独立した閲覧専用ポリシー (`nagiyu-claude-readonly-policy`)
がデプロイされる。デプロイポリシー（ステップ2）には影響を与えない。

### ステップ3: Claude 用ロール・キー保持ユーザーのデプロイ

ポリシーのデプロイ完了後にデプロイします。

```bash
cd infra/shared

# 差分確認
npx cdk diff NagiyuSharedIamClaude

# デプロイ
npx cdk deploy NagiyuSharedIamClaude --require-approval never
```

このコマンドで dev/prod 両アカウントに `nagiyu-claude` ロールが（prod にはキー保持ユーザー
`nagiyu-claude-key` も）デプロイされます。

### ステップ4: 動作確認

```bash
# IAM ポリシー確認
aws iam get-policy --policy-arn arn:aws:iam::<account-id>:policy/nagiyu-deploy-policy-core --region us-east-1
aws iam get-policy --policy-arn arn:aws:iam::<account-id>:policy/nagiyu-deploy-policy-application --region us-east-1
aws iam get-policy --policy-arn arn:aws:iam::<account-id>:policy/nagiyu-deploy-policy-container --region us-east-1
aws iam get-policy --policy-arn arn:aws:iam::<account-id>:policy/nagiyu-deploy-policy-integration --region us-east-1
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

**注意**: GitHub Actions の認証は OIDC + AssumeRole で行い、アクセスキーを持たない。
以下は `nagiyu-claude-key` のアクセスキーのローテーション手順。

#### 1. 新しいアクセスキーの発行

```bash
aws iam create-access-key --user-name nagiyu-claude-key --profile nagiyu-prod
```

#### 2. 環境変数と Setup Script の差し替え

Claude Code on the web の環境変数（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`）と、
Setup Script が書き出す `~/.aws/credentials` の `[nagiyu-claude-key]` プロファイルを
新しいキーに差し替える。実行中のセッションには環境変数の変更が反映されないため、
新しいセッションを開始して確認する。

#### 3. 動作確認

新しいセッションで両プロファイル（`nagiyu-prod` / `nagiyu-dev`）の
`aws sts get-caller-identity` が成功することを確認する。

#### 4. 古いアクセスキーの削除

```bash
aws iam delete-access-key \
  --user-name nagiyu-claude-key \
  --access-key-id <古いアクセスキーID> \
  --profile nagiyu-prod
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

**エラー:** `NoSuchEntity: Policy arn:aws:iam::xxx:policy/nagiyu-deploy-policy-xxx does not exist.`

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

**エラー例:**
- `User: arn:aws:sts::xxx:assumed-role/AWSReservedSSO_xxx/... is not authorized to perform: xxx on resource: xxx`（IAM Identity Center の許可セット）
- `User: arn:aws:sts::xxx:assumed-role/nagiyu-github-actions-dev/... is not authorized to perform: xxx on resource: xxx`（GitHub Actions OIDC ロール）

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

対象は `nagiyu-claude-key` のみ。GitHub Actions OIDC ロールはアクセスキーを持たないため対象外。

**原因:** アクセスキーが非アクティブ化されている。

**解決策:**
```bash
aws iam update-access-key \
  --user-name nagiyu-claude-key \
  --access-key-id <アクセスキーID> \
  --status Active \
  --profile nagiyu-prod
```

---

## 関連ドキュメント

- [AWS アカウント構成とアクセス管理](../aws-accounts.md) - Organizations・IAM Identity Center
- [初回セットアップ](../setup.md) - IAM リソースの初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作
- [アーキテクチャ](../architecture.md) - インフラ全体の設計

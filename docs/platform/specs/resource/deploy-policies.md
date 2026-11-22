---
sources:
  - infra/shared/lib/iam/iam-core-policy-stack.ts
  - infra/shared/lib/iam/iam-application-policy-stack.ts
  - infra/shared/lib/iam/iam-container-policy-stack.ts
  - infra/shared/lib/iam/iam-integration-policy-stack.ts
  - infra/shared/lib/iam/iam-github-actions-oidc-stack.ts
  - infra/shared/bin/shared.ts
sources_hash: 79d2deb577761e75481eb6a2621581c5872934f91061d75e9bff1d0be5259eae
---

# デプロイの権限

CDK でスタックをデプロイする主体に付ける、IAM の管理ポリシー 4 本。CI のロールが付けて使う ([GitHub Actions のロール](./github-actions-oidc.md))。prod と dev の両アカウントに同じ 4 本を作る。

## リソース

| ポリシー名 | スタック | 受け持つ範囲 |
|---|---|---|
| `nagiyu-deploy-policy-core` | `NagiyuSharedIamCore` | CloudFormation、CDK ブートストラップのロールの引き受け、IAM、ネットワーク (VPC と EC2)、CloudWatch Logs |
| `nagiyu-deploy-policy-application` | `NagiyuSharedIamApplication` | S3、DynamoDB、Lambda、ACM、Route53、CloudFront、API Gateway (`apigatewayv2`) |
| `nagiyu-deploy-policy-container` | `NagiyuSharedIamContainer` | ECR、ECR Public (認証だけ)、ECS、Batch |
| `nagiyu-deploy-policy-integration` | `NagiyuSharedIamIntegration` | KMS、Secrets Manager、SSM (パラメータ)、SNS、SQS、EventBridge、Application Auto Scaling |

- ポリシー名は固定で、ARN は `arn:aws:iam::<アカウント>:policy/<ポリシー名>` になる。
- 4 本の Allow は、ほぼ `Resource: *` で、リソースを絞っていない。例外は、CDK ブートストラップのロールの引き受け (`arn:aws:iam::*:role/cdk-hnb659fds-*`。同じアカウントの主体に限る) と、`iam:PassRole` (渡す先のサービスを Lambda、Batch、ECS、ECS タスク、EventBridge、Application Auto Scaling、CloudFormation に限る)。
- どのポリシーにも Deny はない。

### public ECR の認証

`public.ecr.aws` のベースイメージを認証付きで pull するための `ecr-public:GetAuthorizationToken` と `sts:GetServiceBearerToken` は、Container ポリシーの `ECRPublicPull` の文にある。ECR (プライベート) の認証 `ecr:GetAuthorizationToken` は、同じポリシーの `ECROperations` の文にある。

## 権限

| 誰が | 付くポリシー |
|---|---|
| `nagiyu-github-actions-prod`、`nagiyu-github-actions-dev`、`nagiyu-github-actions-pr` | 4 本すべて。ロールごとの差はない |

Claude のロールには、デプロイのポリシーを付けない ([Claude の AWS アクセス](./claude-access.md))。

## 理由

- 4 本に分ける理由は、管理ポリシーのサイズに上限があるため ([デプロイ先](../deploy.md)の「理由」)。上限は 1 本あたり 6,144 文字で、超えると `Cannot exceed quota for PolicySize: 6144` で作成も更新も失敗する。
- 分け方は、AWS のサービスの組で切る。Core は、ほかのスタックの土台 (CloudFormation、IAM、ネットワーク、ログ) を受け持つ。

## 手順

### デプロイで権限エラーが出たとき

エラーの `is not authorized to perform: <サービス>:<操作>` から、足す先を決める。

1. 操作のサービスが、上の表のどのポリシーに当たるかを確かめる。
2. そのポリシーのスタック (`infra/shared/lib/iam/iam-<名前>-policy-stack.ts`) の、該当するサービスの文に、操作を足す。サービスの文がなければ、文ごと足す。
3. `NagiyuSharedIam<名前>` をデプロイする。4 本は `NagiyuSharedIamGitHubOidc` より先に作られるので、先にポリシーをデプロイしてから、もう一度デプロイを流す。
4. 確かめる: 同じデプロイを流し直して、エラーが消えること。

足してポリシーが上限 (6,144 文字) を超えるときは、受け持つ範囲の合うほかのポリシーに移す。どれにも収まらないときは、新しいポリシーを足す設計の判断になるので、ここでは決めない。

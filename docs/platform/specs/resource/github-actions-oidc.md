---
sources:
  - infra/shared/lib/iam/iam-github-actions-oidc-stack.ts
  - infra/shared/lib/stack-plan.ts
  - infra/shared/bin/shared.ts
  - .github/workflows/shared-deploy.yml
  - .github/workflows/admin-verify.yml
sources_hash: ab20972d2cc0fe63a6779ef553a9d083330f241f9ff5595058949fb01ae6ab41
---

# GitHub Actions のロール

GitHub Actions が AWS に入るための OIDC プロバイダーと IAM ロール。長期のアクセスキーは使わず、ワークフローの OIDC トークンでロールを引き受ける。スタックは `NagiyuSharedIamGitHubOidc` で、両アカウントに作る。

## リソース

| 名前 | 種類 | 置くアカウント | 用途 |
|---|---|---|---|
| `token.actions.githubusercontent.com` | OIDC プロバイダー (クライアント ID は `sts.amazonaws.com`) | prod、dev | GitHub のトークンの発行元 |
| `nagiyu-github-actions-prod` | IAM ロール | prod | prod へのデプロイ |
| `nagiyu-github-actions-dev` | IAM ロール | dev | dev へのデプロイ |
| `nagiyu-github-actions-pr` | IAM ロール | dev | PR の検証 |

- ロールの ARN は、スタックの出力 (`ProdRoleArnExport`、`DevRoleArnExport`、`PrRoleArnExport`) にある。
- 置くアカウントは、`infra/shared/lib/stack-plan.ts` の `getGitHubActionsOidcRoleIds` が決める (prod は prod のロールだけ、dev は dev と PR のロールだけ)。

## 設定値

| ロール | 信頼条件 (OIDC トークンの `sub`) | 最大セッション時間 | 付くポリシー |
|---|---|---|---|
| `nagiyu-github-actions-prod` | `repo:nagiyu/nagiyu-platform:environment:prod` | 4 時間 | [デプロイの権限](./deploy-policies.md)の 4 本 |
| `nagiyu-github-actions-dev` | `repo:nagiyu/nagiyu-platform:environment:dev` | 4 時間 | 同上 |
| `nagiyu-github-actions-pr` | `repo:nagiyu/nagiyu-platform:pull_request` | 4 時間 | 同上 |

- 信頼は `sts:AssumeRoleWithWebIdentity` で、`aud` が `sts.amazonaws.com` であり、`sub` が上の値と完全一致するときだけ通る (`StringEquals`)。
- 対象のリポジトリは `nagiyu/nagiyu-platform` の 1 つだけ。
- 3 つのロールの権限は同じで、違うのは信頼条件だけ。

## 使い方

ワークフローは、ジョブに `permissions.id-token: write` を付け、`aws-actions/configure-aws-credentials` に `role-to-assume` を渡す。

| ジョブ | GitHub Environment | `role-to-assume` |
|---|---|---|
| デプロイ | `dev` または `prod` を指定する | `vars.AWS_ROLE_ARN` |
| `pull_request` で動く検証 | 指定しない | `vars.AWS_PR_ROLE_ARN` |

Environment を選ぶ規則は[デプロイ先](../deploy.md)の「dev と prod の切り替え」にある。

fork からの PR では、GitHub が `id-token: write` を付与しないので、PR のロールは引き受けられない。AWS を使う検証は fork の PR では動かない。

## GitHub 側の設定

次の設定は GitHub の中にあり、リポジトリの外なので、値の写しを持たない。

| 設定 | 登録先 | 内容 |
|---|---|---|
| `AWS_ROLE_ARN` | Environment `dev` と `prod` の Variables | それぞれ、同じ名前の環境のロールの ARN |
| `AWS_PR_ROLE_ARN` | リポジトリの Variables | `nagiyu-github-actions-pr` の ARN |
| Deployment branches | Environment `prod` | `master` だけに限定する |

- 確かめる場所は、GitHub のリポジトリの Settings。Variables は Settings → Environments → (`dev` / `prod`) と、Settings → Secrets and variables → Actions → Variables。Deployment branches は Settings → Environments → `prod`。
- ARN は秘密ではないので、Secrets ではなく Variables にする。

## 理由

- ロールを 3 つに分けるのは、トークンの `sub` で、ワークフローの文脈ごとに引き受けられるロールを限るため。`pull_request` のワークフローは、prod のロールを引き受けられない。
- prod のロールを prod アカウントに、dev と PR のロールを dev アカウントに置く理由は[デプロイ先](../deploy.md)の「理由」にある。
- prod ロールの信頼条件は、Environment が `prod` であることだけで、ブランチは見ない。そのため Environment `prod` の Deployment branches を `master` に限り、任意のブランチから `environment: prod` を指定して prod のロールを引き受けられないようにする。この制限が外れると、信頼条件だけでは防げない。
- ARN を Variables に持つのは、ロールの ARN が機密ではないため。ワークフローのコードを変えずに、値の差し替えだけでロールを切り替えられる。
- fork の PR に代わりの経路を用意しないのは、fork から AWS に入れないことが意図した制限だから。

## 手順

### ロールがまだ無いときに、手元から shared をデプロイする

新しいアカウントや、このスタックを作る前は、ワークフローが引き受けるロールがない。最初の 1 回は、人が手元から shared をデプロイする。ワークフロー (`shared-deploy.yml`) と同じ呼び方で、認証だけが SSO になる。

1. [ローカルで AWS に入る](../../rules/aws-accounts.md)の手順で、対象のアカウントの `AdministratorAccess` のプロファイルに SSO でログインする。
2. infra-common をビルドする。shared は、そのビルド成果物 (`dist/`) を参照する。

    ```bash
    npm run build --workspace=@nagiyu/infra-common
    ```

3. 環境変数 `DOMAIN_NAME` に、ゾーンの親のドメイン (`nagiyu.com`) を入れる。ワークフローはリポジトリのシークレット `DOMAIN_NAME` を同じ名前の環境変数で渡している。dev アカウントでは、コードが `dev.` を付けてゾーン名にする。
4. アカウントを CDK のブートストラップの対象にし、全スタックをデプロイする。`env` は、prod アカウントには `prod`、dev アカウントには `dev` を渡す (dev アカウントに `prod` を渡すと合成が失敗する)。

    ```bash
    export DOMAIN_NAME=nagiyu.com
    npm run bootstrap --workspace=@nagiyu/infra-shared -- aws://<アカウント ID>/us-east-1 --profile <プロファイル名>
    npm run deploy --workspace=@nagiyu/infra-shared -- --all \
        --context env=<prod または dev> --require-approval never --profile <プロファイル名>
    ```

5. 確かめる: `NagiyuSharedIamGitHubOidc` のスタックが `CREATE_COMPLETE` か `UPDATE_COMPLETE` であること。

そのあとは、下の「Variables を登録する」に進む。

### Variables を登録する

ロールをデプロイしたあとに、人が GitHub に登録する。

1. 各アカウントの出力から、ロールの ARN を確かめる。

    ```bash
    aws iam get-role --role-name nagiyu-github-actions-prod --profile nagiyu-prod --query Role.Arn --output text
    aws iam get-role --role-name nagiyu-github-actions-dev --profile nagiyu-dev --query Role.Arn --output text
    aws iam get-role --role-name nagiyu-github-actions-pr --profile nagiyu-dev --query Role.Arn --output text
    ```

2. GitHub の Settings で、上の表のとおりに Variables を登録する。
3. Environment `prod` の Deployment branches を `master` だけにする。
4. 確かめる: PR の検証と、dev へのデプロイが、`Configure AWS credentials` の手順を通ること。

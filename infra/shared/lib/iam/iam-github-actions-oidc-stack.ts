import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * GitHub Actions が OIDC 連携する対象リポジトリ。
 * 将来的に他リポジトリを追加する場合はここを配列化する。
 */
const GITHUB_REPOSITORY = 'nagiyu/nagiyu-platform';

/** GitHub Actions OIDC のトークン発行者ホスト名 */
const GITHUB_OIDC_ISSUER_HOST = 'token.actions.githubusercontent.com';

/** AWS STS を呼び出す OIDC クライアント（オーディエンス） */
const STS_AUDIENCE = 'sts.amazonaws.com';

export interface IamGitHubActionsOidcStackProps extends cdk.StackProps {
  policies: {
    core: iam.IManagedPolicy;
    application: iam.IManagedPolicy;
    container: iam.IManagedPolicy;
    integration: iam.IManagedPolicy;
  };
}

/**
 * GitHub Actions が AssumeRoleWithWebIdentity で引き受けるロールの定義。
 *
 * `subClaim` は OIDC トークンの `sub` クレームと StringEquals で突き合わせる値。
 * 環境（dev/prod）ごと・pull_request ごとに信頼条件を絞ることで、
 * 各ワークフローが必要以上の文脈でロールを引き受けられないようにする。
 */
interface GitHubActionsRoleDefinition {
  /** Construct ID に使う識別子 */
  readonly id: string;
  /** IAM ロール名（固定値） */
  readonly roleName: string;
  /** OIDC トークンの sub クレーム（StringEquals で完全一致） */
  readonly subClaim: string;
  /** CfnOutput の説明文 */
  readonly description: string;
}

const GITHUB_ACTIONS_ROLE_DEFINITIONS: GitHubActionsRoleDefinition[] = [
  {
    id: 'DevRole',
    roleName: 'nagiyu-github-actions-dev',
    subClaim: `repo:${GITHUB_REPOSITORY}:environment:dev`,
    description: 'dev 環境（GitHub Environment: dev）向け GitHub Actions ロール ARN',
  },
  {
    id: 'ProdRole',
    roleName: 'nagiyu-github-actions-prod',
    subClaim: `repo:${GITHUB_REPOSITORY}:environment:prod`,
    description: 'prod 環境（GitHub Environment: prod）向け GitHub Actions ロール ARN',
  },
  {
    id: 'PrRole',
    roleName: 'nagiyu-github-actions-pr',
    subClaim: `repo:${GITHUB_REPOSITORY}:pull_request`,
    description: 'pull_request イベント向け GitHub Actions ロール ARN',
  },
];

/**
 * IAM GitHub Actions OIDC Stack
 *
 * GitHub Actions から AWS へ長期アクセスキーなしで認証するための
 * OIDC プロバイダと AssumeRole 用ロールを管理します。
 *
 * 設計意図（なぜ 3 分割か）:
 * - 信頼条件（`sub` クレーム）を GitHub Environment（dev/prod）と
 *   pull_request イベントで分けることで、ワークフローの実行文脈ごとに
 *   引き受けられるロールを限定する（例: PR ワークフローが prod ロールを
 *   引き受けられないようにする）。
 * - 権限（付与ポリシー）自体は当面すべてのロールで同一（既存の
 *   nagiyu-github-actions IAM ユーザーと同等の 4 ポリシー）とし、
 *   権限の絞り込みは後続対応のスコープとする。
 * - ロール定義を配列でデータ駆動にしているのは、将来 dev/prod を
 *   別 AWS アカウントに分割する際に、アカウントごとのロール差し替えを
 *   容易にするため（このスタック自体をアカウントごとにデプロイする、
 *   もしくは環境ごとに定義を絞り込む形を想定）。
 *
 * 既存の `IamUsersStack`（長期アクセスキー方式）には手を入れず、
 * 本スタックは並行稼働する形で追加する。旧ユーザーは全ワークフローの
 * 移行と本番での稼働確認が済んだ後に廃止する。
 */
export class IamGitHubActionsOidcStack extends cdk.Stack {
  public readonly oidcProvider: iam.IOidcProvider;
  public readonly roles: Record<string, iam.IRole> = {};

  constructor(scope: Construct, id: string, props: IamGitHubActionsOidcStackProps) {
    super(scope, id, props);

    // ==========================================
    // GitHub Actions OIDC Provider
    // ==========================================
    // Lambda カスタムリソースを使わないネイティブ実装（AWS::IAM::OIDCProvider）。
    this.oidcProvider = new iam.OidcProviderNative(this, 'GitHubActionsOidcProvider', {
      url: `https://${GITHUB_OIDC_ISSUER_HOST}`,
      clientIds: [STS_AUDIENCE],
    });

    // ==========================================
    // GitHub Actions Roles（環境・イベントごとに信頼条件を分離）
    // ==========================================
    for (const definition of GITHUB_ACTIONS_ROLE_DEFINITIONS) {
      const role = new iam.Role(this, definition.id, {
        roleName: definition.roleName,
        maxSessionDuration: cdk.Duration.hours(4),
        managedPolicies: [
          props.policies.core,
          props.policies.application,
          props.policies.container,
          props.policies.integration,
        ],
        assumedBy: new iam.FederatedPrincipal(
          this.oidcProvider.oidcProviderArn,
          {
            StringEquals: {
              [`${GITHUB_OIDC_ISSUER_HOST}:aud`]: STS_AUDIENCE,
              [`${GITHUB_OIDC_ISSUER_HOST}:sub`]: definition.subClaim,
            },
          },
          'sts:AssumeRoleWithWebIdentity'
        ),
      });

      this.roles[definition.id] = role;

      new cdk.CfnOutput(this, `${definition.id}ArnExport`, {
        value: role.roleArn,
        description: definition.description,
      });
    }
  }
}

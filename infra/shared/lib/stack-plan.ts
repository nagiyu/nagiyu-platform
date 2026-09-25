import { AccountScope } from './account-scope';

/** `bin/shared.ts` の `env` コンテキスト（VPC/ECS/エラーテーブル等の環境差分に使用） */
export type Environment = 'dev' | 'prod';

export const SHARED_STACK_PLAN_ERROR_MESSAGES = {
  DEV_SCOPE_REQUIRES_DEV_ENV:
    'dev アカウントスコープでは env=dev のみデプロイ可能です（env=prod は指定できません）',
} as const;

/**
 * `infra/shared` が作りうるスタックの識別キー。
 * `stackId` は実際の CDK スタック ID（`new XxxStack(app, stackId, ...)` の第二引数）と一致させる。
 */
export type SharedStackKey =
  | 'vpc'
  | 'acm'
  | 'route53'
  | 'route53Records'
  | 'iamCore'
  | 'iamApplication'
  | 'iamContainer'
  | 'iamIntegration'
  | 'iamClaudeReadonly'
  | 'iamUsers'
  | 'iamGitHubOidc'
  | 'ecsCluster'
  | 'dockerBuildLock'
  | 'errorEventsTable'
  | 'reportsHosting';

export interface SharedStackPlanEntry {
  readonly key: SharedStackKey;
  readonly stackId: string;
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * アカウントスコープ・環境から、作成すべきスタックの一覧（キー・スタック ID）を組み立てる。
 *
 * - `accountScope === 'prod'`: 現行と同じ全スタック（env は 'dev' / 'prod' どちらでもよい）。
 * - `accountScope === 'dev'`: dev アカウントに置く最小構成のみ（env は 'dev' 固定）。
 *   ACM / Route53Records / DockerBuildLock / ReportsHosting は後続対応で dev 版を用意するため、
 *   本 PR では作成しない。
 *
 * スタックの実際の構築（`new XxxStack(...)`）は `bin/shared.ts` が行う。この関数はその一覧を
 * テスト可能な純粋関数として切り出したもの。
 */
export function buildSharedStackPlan(
  accountScope: AccountScope,
  env: Environment
): SharedStackPlanEntry[] {
  if (accountScope === 'dev' && env !== 'dev') {
    throw new Error(SHARED_STACK_PLAN_ERROR_MESSAGES.DEV_SCOPE_REQUIRES_DEV_ENV);
  }

  const envSuffix = capitalize(env);

  const commonStacks: SharedStackPlanEntry[] = [
    { key: 'iamCore', stackId: 'NagiyuSharedIamCore' },
    { key: 'iamApplication', stackId: 'NagiyuSharedIamApplication' },
    { key: 'iamContainer', stackId: 'NagiyuSharedIamContainer' },
    { key: 'iamIntegration', stackId: 'NagiyuSharedIamIntegration' },
    { key: 'iamClaudeReadonly', stackId: 'NagiyuSharedIamClaudeReadonly' },
    { key: 'iamUsers', stackId: 'NagiyuSharedIamUsers' },
    { key: 'iamGitHubOidc', stackId: 'NagiyuSharedIamGitHubOidc' },
    { key: 'route53', stackId: 'NagiyuSharedRoute53' },
    { key: 'vpc', stackId: `NagiyuSharedVpc${envSuffix}` },
    { key: 'ecsCluster', stackId: `NagiyuSharedEcsCluster${envSuffix}` },
    { key: 'errorEventsTable', stackId: `NagiyuErrorEventsTable${envSuffix}` },
  ];

  if (accountScope === 'dev') {
    return commonStacks;
  }

  return [
    ...commonStacks,
    { key: 'acm', stackId: 'NagiyuSharedAcm' },
    { key: 'route53Records', stackId: 'NagiyuSharedRoute53Records' },
    { key: 'dockerBuildLock', stackId: 'NagiyuDockerBuildLock' },
    { key: 'reportsHosting', stackId: 'NagiyuE2eReportsHosting' },
  ];
}

/**
 * GitHub Actions 用 IAM ユーザー（長期アクセスキー方式）を作成するかどうか。
 * dev アカウントでは新設しない（Claude 閲覧ユーザーのみ作成する）。
 */
export function shouldCreateGitHubActionsUser(accountScope: AccountScope): boolean {
  return accountScope === 'prod';
}

/**
 * GitHub Actions OIDC ロールのうち、当該アカウントスコープで作成すべきロール ID。
 * `undefined` を返す場合は `IamGitHubActionsOidcStack` 側の既定（3 ロール全部）を使う。
 * dev アカウントでは prod ロールを作らない。
 */
export function getGitHubActionsOidcRoleIds(
  accountScope: AccountScope
): ('DevRole' | 'ProdRole' | 'PrRole')[] | undefined {
  return accountScope === 'dev' ? ['DevRole', 'PrRole'] : undefined;
}

/**
 * Route53 ホストゾーンに使うドメイン名。
 * dev アカウントでは `dev.<domainName>` のサブドメインでゾーンを作り、
 * prod ゾーンから NS 委任される想定（本 PR では URL 自体は変更しない）。
 */
export function getRoute53DomainName(accountScope: AccountScope, domainName: string): string {
  return accountScope === 'dev' ? `dev.${domainName}` : domainName;
}

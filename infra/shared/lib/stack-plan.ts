import { AccountScope } from './account-scope';

/** `bin/shared.ts` の `env` コンテキスト（VPC/ECS/エラーテーブル等の環境差分に使用） */
export type Environment = 'dev' | 'prod';

export const SHARED_STACK_PLAN_ERROR_MESSAGES = {
  DEV_SCOPE_REQUIRES_DEV_ENV:
    'dev アカウントスコープでは env=dev のみデプロイ可能です（env=prod は指定できません）',
} as const;

/**
 * アカウントスコープと env の組み合わせを検証する。
 * dev アカウントには dev 環境の資材しか置かないため、dev スコープで env=prod はエラーとする。
 */
export function assertScopeAllowsEnv(accountScope: AccountScope, env: Environment): void {
  if (accountScope === 'dev' && env !== 'dev') {
    throw new Error(SHARED_STACK_PLAN_ERROR_MESSAGES.DEV_SCOPE_REQUIRES_DEV_ENV);
  }
}

/**
 * prod アカウントにだけ置くスタック（ACM / Route53Records / DockerBuildLock / ReportsHosting）を作るかどうか。
 * dev アカウント向けの同等資材は後続対応で dev 用に別途用意する。
 */
export function includesProdOnlyStacks(accountScope: AccountScope): boolean {
  return accountScope === 'prod';
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
 * prod ゾーンから NS 委任する。
 */
export function getRoute53DomainName(accountScope: AccountScope, domainName: string): string {
  return accountScope === 'dev' ? `dev.${domainName}` : domainName;
}

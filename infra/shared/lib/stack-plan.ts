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
 * prod アカウントにだけ置くスタック（Route53Records / DevSyncSourceReader）を作るかどうか。
 * ACM / DockerBuildLock / ReportsHosting は dev/prod 双方に作成するため対象外
 * （バケット名・ドメイン名はアカウントスコープごとに `getDockerBuildLockBucketName` /
 * `getReportsBucketName` / `getRoute53DomainName` で出し分ける）。
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
 * ACM 証明書・ReportsHosting のドメインもこのドメイン名を基準にする
 * （dev アカウントでは `dev.<domainName>` 側の証明書・reports サブドメインになる）。
 */
export function getRoute53DomainName(accountScope: AccountScope, domainName: string): string {
  return accountScope === 'dev' ? `dev.${domainName}` : domainName;
}

/** Docker ビルドロック用 S3 バケット名（アカウントスコープごとに固定） */
export const DOCKER_BUILD_LOCK_BUCKET_NAMES: Record<AccountScope, string> = {
  prod: 'nagiyu-docker-build-lock',
  dev: 'nagiyu-docker-build-lock-dev',
} as const;

/** アカウントスコープに応じた Docker ビルドロック用 S3 バケット名を返す */
export function getDockerBuildLockBucketName(accountScope: AccountScope): string {
  return DOCKER_BUILD_LOCK_BUCKET_NAMES[accountScope];
}

/** E2E レポートホスティング用 S3 バケット名（アカウントスコープごとに固定） */
export const E2E_REPORTS_BUCKET_NAMES: Record<AccountScope, string> = {
  prod: 'nagiyu-e2e-reports',
  dev: 'nagiyu-e2e-reports-dev',
} as const;

/** アカウントスコープに応じた E2E レポートホスティング用 S3 バケット名を返す */
export function getReportsBucketName(accountScope: AccountScope): string {
  return E2E_REPORTS_BUCKET_NAMES[accountScope];
}

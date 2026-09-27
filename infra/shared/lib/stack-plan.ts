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
 * GitHub Actions OIDC ロールのうち、当該アカウントスコープで作成すべきロール ID。
 *
 * prod アカウントには ProdRole のみ、dev アカウントには DevRole / PrRole のみを作成する
 * （旧: prod アカウントでは絞り込みをせず 3 ロール全部を作成していたが、prod アカウントに
 * dev / pr ロールがあると dev Environment や pull_request の文脈から prod アカウントを
 * 操作できてしまい、アカウント分離の効果を削るため #3820 で撤去した）。
 */
export function getGitHubActionsOidcRoleIds(
  accountScope: AccountScope
): ('DevRole' | 'ProdRole' | 'PrRole')[] {
  return accountScope === 'dev' ? ['DevRole', 'PrRole'] : ['ProdRole'];
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

/**
 * Claude Code on the web が dev アカウントで実行を許可される Lambda 関数名（Issue #3861）。
 *
 * 対象は、外部の有料 API 呼び出し・外部送信・prod アカウントへのアクセスを伴わず、
 * dev アカウント内で完結する関数に限定している（dev-sync Lambda は prod テーブルへの
 * AssumeRole 経路を持つため対象外）。
 */
export const CLAUDE_INVOKABLE_FUNCTION_NAMES_DEV = [
  'nagiyu-portal-lambda-dev',
  'nagiyu-tools-lambda-dev',
  'nagiyu-auth-lambda-dev',
  'nagiyu-share-together-lambda-dev',
  'nagiyu-quick-clip-clip-regenerate-dev',
  'nagiyu-quick-clip-zip-generator-dev',
  'nagiyu-stock-tracker-batch-daily-dev',
  'nagiyu-stock-tracker-batch-evaluation-dev',
  'nagiyu-stock-tracker-batch-temporary-alert-expiry-dev',
  'nagiyu-livetalk-batch-learn-user-activity-dev',
] as const;

/**
 * アカウントスコープに応じた、Claude が実行を許可される Lambda 関数名の一覧を返す。
 * prod アカウントでは実行権限を一切与えないため空配列になる。
 */
export function getClaudeInvokableFunctionNames(accountScope: AccountScope): string[] {
  return accountScope === 'dev' ? [...CLAUDE_INVOKABLE_FUNCTION_NAMES_DEV] : [];
}

/**
 * Claude のキー保持ユーザー（`nagiyu-claude-key`）を作成するアカウントスコープかどうか。
 * 身元は prod アカウントにのみ置くため、prod スコープでのみ true を返す。
 */
export function includesClaudeKeyUser(accountScope: AccountScope): boolean {
  return accountScope === 'prod';
}

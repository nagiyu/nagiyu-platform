/**
 * AWS マルチアカウント化（Issue #3819）に伴う、デプロイ先アカウントの判定ロジック。
 *
 * `infra/shared` は prod アカウント・dev アカウントの両方にデプロイされる CDK アプリであり、
 * どちらのアカウントに向けて synth するかによって作成するスタックの構成が変わる。
 * ここでは CDK コンテキスト・環境変数からアカウントスコープ（'prod' | 'dev'）を
 * 純粋関数として解決する。実際のスタック組み立ては `stack-plan.ts` が担う。
 */

/** AWS アカウント ID（秘匿情報ではないため定数化する） */
export const ACCOUNT_IDS = {
  prod: '166562222746',
  dev: '253388243634',
} as const;

export type AccountScope = keyof typeof ACCOUNT_IDS;

export const ACCOUNT_SCOPE_ERROR_MESSAGES = {
  UNKNOWN_ACCOUNT_ID:
    'CDK_DEFAULT_ACCOUNT が未知の AWS アカウント ID です。prod/dev いずれのアカウントにも該当しません',
  ACCOUNT_SCOPE_MISMATCH:
    'CDK_DEFAULT_ACCOUNT から判定したアカウントスコープと accountScope コンテキストが一致しません',
  INVALID_CONTEXT_SCOPE:
    'accountScope コンテキストの値が不正です。prod または dev を指定してください',
} as const;

const isAccountScope = (value: string): value is AccountScope =>
  value === 'prod' || value === 'dev';

/**
 * AWS アカウント ID・CDK コンテキストから、デプロイ先のアカウントスコープを解決する。
 *
 * - `accountId` が prod/dev いずれかに一致する場合はそのスコープを採用する。
 *   `contextScope` も指定されていて食い違う場合はエラーとする。
 * - `accountId` が指定されているが prod/dev のどちらでもない場合はエラーとする。
 * - `accountId` が未指定（認証情報なしの synth 等）の場合は `contextScope` を採用する。
 *   `contextScope` も未指定なら現行構成と同じ `'prod'` を既定値とする。
 *   `contextScope` に不正な値が指定された場合はエラーとする。
 */
export function resolveAccountScope(
  accountId: string | undefined,
  contextScope: string | undefined
): AccountScope {
  if (accountId !== undefined) {
    const scopeFromAccountId = (Object.keys(ACCOUNT_IDS) as AccountScope[]).find(
      (scope) => ACCOUNT_IDS[scope] === accountId
    );

    if (!scopeFromAccountId) {
      throw new Error(ACCOUNT_SCOPE_ERROR_MESSAGES.UNKNOWN_ACCOUNT_ID);
    }

    if (contextScope !== undefined && contextScope !== scopeFromAccountId) {
      throw new Error(ACCOUNT_SCOPE_ERROR_MESSAGES.ACCOUNT_SCOPE_MISMATCH);
    }

    return scopeFromAccountId;
  }

  if (contextScope === undefined) {
    return 'prod';
  }

  if (!isAccountScope(contextScope)) {
    throw new Error(ACCOUNT_SCOPE_ERROR_MESSAGES.INVALID_CONTEXT_SCOPE);
  }

  return contextScope;
}

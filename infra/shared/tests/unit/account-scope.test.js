require('ts-node/register/transpile-only');
const {
  ACCOUNT_IDS,
  ACCOUNT_SCOPE_ERROR_MESSAGES,
  resolveAccountScope,
} = require('../../lib/account-scope');

describe('resolveAccountScope', () => {
  it('accountId が prod アカウント ID なら prod を返す', () => {
    expect(resolveAccountScope(ACCOUNT_IDS.prod, undefined)).toBe('prod');
  });

  it('accountId が dev アカウント ID なら dev を返す', () => {
    expect(resolveAccountScope(ACCOUNT_IDS.dev, undefined)).toBe('dev');
  });

  it('accountId とcontextScope が一致していれば、そのスコープを返す', () => {
    expect(resolveAccountScope(ACCOUNT_IDS.dev, 'dev')).toBe('dev');
    expect(resolveAccountScope(ACCOUNT_IDS.prod, 'prod')).toBe('prod');
  });

  it('accountId から判定したスコープと contextScope が食い違う場合はエラーになる', () => {
    expect(() => resolveAccountScope(ACCOUNT_IDS.prod, 'dev')).toThrow(
      ACCOUNT_SCOPE_ERROR_MESSAGES.ACCOUNT_SCOPE_MISMATCH
    );
    expect(() => resolveAccountScope(ACCOUNT_IDS.dev, 'prod')).toThrow(
      ACCOUNT_SCOPE_ERROR_MESSAGES.ACCOUNT_SCOPE_MISMATCH
    );
  });

  it('accountId が未知のアカウント ID の場合はエラーになる', () => {
    expect(() => resolveAccountScope('999999999999', undefined)).toThrow(
      ACCOUNT_SCOPE_ERROR_MESSAGES.UNKNOWN_ACCOUNT_ID
    );
  });

  it('accountId が未定義で contextScope が未指定の場合は prod を返す（現行構成と同一）', () => {
    expect(resolveAccountScope(undefined, undefined)).toBe('prod');
  });

  it('accountId が未定義で contextScope が指定されていれば、それを返す', () => {
    expect(resolveAccountScope(undefined, 'dev')).toBe('dev');
    expect(resolveAccountScope(undefined, 'prod')).toBe('prod');
  });

  it('accountId が未定義で contextScope が不正な値の場合はエラーになる', () => {
    expect(() => resolveAccountScope(undefined, 'staging')).toThrow(
      ACCOUNT_SCOPE_ERROR_MESSAGES.INVALID_CONTEXT_SCOPE
    );
  });
});

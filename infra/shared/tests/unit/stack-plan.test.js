require('ts-node/register/transpile-only');
const {
  assertScopeAllowsEnv,
  includesProdOnlyStacks,
  getDockerBuildLockBucketName,
  getGitHubActionsOidcRoleIds,
  getReportsBucketName,
  getRoute53DomainName,
  shouldCreateGitHubActionsUser,
  SHARED_STACK_PLAN_ERROR_MESSAGES,
} = require('../../lib/stack-plan');

describe('assertScopeAllowsEnv', () => {
  it('prod スコープでは env=dev / env=prod のどちらも許可する', () => {
    expect(() => assertScopeAllowsEnv('prod', 'dev')).not.toThrow();
    expect(() => assertScopeAllowsEnv('prod', 'prod')).not.toThrow();
  });

  it('dev スコープでは env=dev を許可する', () => {
    expect(() => assertScopeAllowsEnv('dev', 'dev')).not.toThrow();
  });

  it('dev スコープで env=prod を指定するとエラーになる', () => {
    expect(() => assertScopeAllowsEnv('dev', 'prod')).toThrow(
      SHARED_STACK_PLAN_ERROR_MESSAGES.DEV_SCOPE_REQUIRES_DEV_ENV
    );
  });
});

describe('includesProdOnlyStacks', () => {
  it('prod スコープでは true', () => {
    expect(includesProdOnlyStacks('prod')).toBe(true);
  });

  it('dev スコープでは false', () => {
    expect(includesProdOnlyStacks('dev')).toBe(false);
  });
});

describe('shouldCreateGitHubActionsUser', () => {
  it('prod スコープでは true', () => {
    expect(shouldCreateGitHubActionsUser('prod')).toBe(true);
  });

  it('dev スコープでは false', () => {
    expect(shouldCreateGitHubActionsUser('dev')).toBe(false);
  });
});

describe('getGitHubActionsOidcRoleIds', () => {
  it('prod スコープでは undefined（= 全ロール作成）', () => {
    expect(getGitHubActionsOidcRoleIds('prod')).toBeUndefined();
  });

  it('dev スコープでは DevRole/PrRole のみ', () => {
    expect(getGitHubActionsOidcRoleIds('dev')).toEqual(['DevRole', 'PrRole']);
  });
});

describe('getRoute53DomainName', () => {
  it('prod スコープではドメイン名をそのまま返す', () => {
    expect(getRoute53DomainName('prod', 'nagiyu.com')).toBe('nagiyu.com');
  });

  it('dev スコープでは dev. サブドメインを付与する', () => {
    expect(getRoute53DomainName('dev', 'nagiyu.com')).toBe('dev.nagiyu.com');
  });
});

describe('getDockerBuildLockBucketName', () => {
  it('prod スコープでは固定バケット名を返す', () => {
    expect(getDockerBuildLockBucketName('prod')).toBe('nagiyu-docker-build-lock');
  });

  it('dev スコープでは -dev サフィックス付きバケット名を返す', () => {
    expect(getDockerBuildLockBucketName('dev')).toBe('nagiyu-docker-build-lock-dev');
  });
});

describe('getReportsBucketName', () => {
  it('prod スコープでは固定バケット名を返す', () => {
    expect(getReportsBucketName('prod')).toBe('nagiyu-e2e-reports');
  });

  it('dev スコープでは -dev サフィックス付きバケット名を返す', () => {
    expect(getReportsBucketName('dev')).toBe('nagiyu-e2e-reports-dev');
  });
});

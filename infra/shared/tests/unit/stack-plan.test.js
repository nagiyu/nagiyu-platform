require('ts-node/register/transpile-only');
const {
  assertScopeAllowsEnv,
  includesProdOnlyStacks,
  getGitHubActionsOidcRoleIds,
  getReportsBucketName,
  getRoute53DomainName,
  getClaudeInvokableFunctionNames,
  CLAUDE_INVOKABLE_FUNCTION_NAMES_DEV,
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

describe('getGitHubActionsOidcRoleIds', () => {
  it('prod スコープでは ProdRole のみ', () => {
    expect(getGitHubActionsOidcRoleIds('prod')).toEqual(['ProdRole']);
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

describe('getReportsBucketName', () => {
  it('prod スコープでは固定バケット名を返す', () => {
    expect(getReportsBucketName('prod')).toBe('nagiyu-e2e-reports');
  });

  it('dev スコープでは -dev サフィックス付きバケット名を返す', () => {
    expect(getReportsBucketName('dev')).toBe('nagiyu-e2e-reports-dev');
  });
});

describe('getClaudeInvokableFunctionNames', () => {
  it('prod スコープでは空配列を返す（実行権限を一切与えない）', () => {
    expect(getClaudeInvokableFunctionNames('prod')).toEqual([]);
  });

  it('dev スコープでは定数と同じ内容の関数名一覧を返す', () => {
    expect(getClaudeInvokableFunctionNames('dev')).toEqual(CLAUDE_INVOKABLE_FUNCTION_NAMES_DEV);
  });

  it('dev スコープの許可対象は合意済みの 8 本に限る（意図しない拡張を検出する）', () => {
    expect(getClaudeInvokableFunctionNames('dev')).toEqual([
      'nagiyu-stock-tracker-batch-daily-dev',
      'nagiyu-stock-tracker-batch-temporary-alert-expiry-dev',
      'nagiyu-stock-tracker-batch-summary-dev',
      'nagiyu-stock-tracker-batch-forecast-dev',
      'nagiyu-livetalk-batch-learn-user-activity-dev',
      'nagiyu-livetalk-batch-acquire-dev',
      'nagiyu-livetalk-batch-consolidate-dev',
      'nagiyu-dev-sync-dev',
    ]);
  });

  it('prod スコープには dev-sync を含め、実行を許す関数が 1 つもない', () => {
    expect(getClaudeInvokableFunctionNames('prod')).toEqual([]);
  });

  it('返り値は呼び出しごとに独立した配列である（定数の参照を直接返さない）', () => {
    const names = getClaudeInvokableFunctionNames('dev');
    names.push('mutated');
    expect(getClaudeInvokableFunctionNames('dev')).toEqual(CLAUDE_INVOKABLE_FUNCTION_NAMES_DEV);
  });
});


require('ts-node/register/transpile-only');
const {
  buildSharedStackPlan,
  getGitHubActionsOidcRoleIds,
  getRoute53DomainName,
  shouldCreateGitHubActionsUser,
  SHARED_STACK_PLAN_ERROR_MESSAGES,
} = require('../../lib/stack-plan');

const planKeys = (plan) => plan.map((entry) => entry.key).sort();

describe('buildSharedStackPlan', () => {
  it('prod スコープ（env=prod）では現行と同一の全スタックを作成する', () => {
    const plan = buildSharedStackPlan('prod', 'prod');

    expect(planKeys(plan)).toEqual(
      [
        'acm',
        'ecsCluster',
        'dockerBuildLock',
        'errorEventsTable',
        'iamApplication',
        'iamClaudeReadonly',
        'iamContainer',
        'iamCore',
        'iamGitHubOidc',
        'iamIntegration',
        'iamUsers',
        'reportsHosting',
        'route53',
        'route53Records',
        'vpc',
      ].sort()
    );
  });

  it('prod スコープ（env=dev）でも現行と同一の全スタックを作成する', () => {
    const plan = buildSharedStackPlan('prod', 'dev');
    expect(planKeys(plan)).toEqual(planKeys(buildSharedStackPlan('prod', 'prod')));
  });

  it('prod スコープの env 依存スタックは env サフィックス付きの ID になる', () => {
    const plan = buildSharedStackPlan('prod', 'dev');
    const byKey = Object.fromEntries(plan.map((entry) => [entry.key, entry.stackId]));

    expect(byKey.vpc).toBe('NagiyuSharedVpcDev');
    expect(byKey.ecsCluster).toBe('NagiyuSharedEcsClusterDev');
    expect(byKey.errorEventsTable).toBe('NagiyuErrorEventsTableDev');
  });

  it('dev スコープでは最小構成のみ作成する（ACM/Route53Records/DockerBuildLock/ReportsHosting は含まない）', () => {
    const plan = buildSharedStackPlan('dev', 'dev');

    expect(planKeys(plan)).toEqual(
      [
        'ecsCluster',
        'errorEventsTable',
        'iamApplication',
        'iamClaudeReadonly',
        'iamContainer',
        'iamCore',
        'iamGitHubOidc',
        'iamIntegration',
        'iamUsers',
        'route53',
        'vpc',
      ].sort()
    );
  });

  it('dev スコープで env=prod を指定するとエラーになる', () => {
    expect(() => buildSharedStackPlan('dev', 'prod')).toThrow(
      SHARED_STACK_PLAN_ERROR_MESSAGES.DEV_SCOPE_REQUIRES_DEV_ENV
    );
  });

  it('同じスタック ID を prod/dev 両スコープで再利用するものがある（IAM/Route53 系）', () => {
    const devPlan = buildSharedStackPlan('dev', 'dev');
    const prodPlan = buildSharedStackPlan('prod', 'dev');

    const devById = Object.fromEntries(devPlan.map((entry) => [entry.key, entry.stackId]));
    const prodById = Object.fromEntries(prodPlan.map((entry) => [entry.key, entry.stackId]));

    expect(devById.iamUsers).toBe(prodById.iamUsers);
    expect(devById.iamGitHubOidc).toBe(prodById.iamGitHubOidc);
    expect(devById.route53).toBe(prodById.route53);
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

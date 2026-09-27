const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const iam = require('aws-cdk-lib/aws-iam');

require('ts-node/register/transpile-only');
const { IamClaudeAccessStack } = require('../../lib/iam/iam-claude-access-stack');
const { ACCOUNT_IDS } = require('../../lib/account-scope');

const DEV_INVOKABLE_FUNCTION_NAMES = [
  'nagiyu-portal-lambda-dev',
  'nagiyu-tools-lambda-dev',
];

describe('IamClaudeAccessStack', () => {
  const createTemplate = (accountScope, overrides = {}) => {
    const app = new cdk.App();

    const readonlyPolicy = iam.ManagedPolicy.fromManagedPolicyArn(
      app,
      `DummyReadonlyPolicy-${accountScope}`,
      'arn:aws:iam::123456789012:policy/dummy-readonly-policy'
    );

    const stack = new IamClaudeAccessStack(app, `TestIamClaudeAccessStack-${accountScope}`, {
      readonlyPolicy,
      invokableFunctionNames: accountScope === 'dev' ? DEV_INVOKABLE_FUNCTION_NAMES : [],
      createKeyUser: accountScope === 'prod',
      env: { account: ACCOUNT_IDS[accountScope], region: 'us-east-1' },
      ...overrides,
    });

    return Template.fromStack(stack);
  };

  describe('共通（dev/prod 両方）', () => {
    it.each(['dev', 'prod'])('%s: nagiyu-claude ロールを作成し readonly ポリシーを付与する', (accountScope) => {
      const template = createTemplate(accountScope);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'nagiyu-claude',
        ManagedPolicyArns: Match.arrayWith([
          'arn:aws:iam::123456789012:policy/dummy-readonly-policy',
        ]),
      });
    });

    it.each(['dev', 'prod'])(
      '%s: 信頼ポリシーは prod アカウントプリンシパル + nagiyu-claude-key への PrincipalArn 条件のみ',
      (accountScope) => {
        const template = createTemplate(accountScope);

        template.hasResourceProperties('AWS::IAM::Role', {
          RoleName: 'nagiyu-claude',
          AssumeRolePolicyDocument: {
            Statement: Match.arrayWith([
              Match.objectLike({
                Effect: 'Allow',
                Action: 'sts:AssumeRole',
                Principal: {
                  AWS: {
                    'Fn::Join': [
                      '',
                      ['arn:', { Ref: 'AWS::Partition' }, `:iam::${ACCOUNT_IDS.prod}:root`],
                    ],
                  },
                },
                Condition: {
                  ArnEquals: {
                    'aws:PrincipalArn': `arn:aws:iam::${ACCOUNT_IDS.prod}:user/nagiyu-claude-key`,
                  },
                },
              }),
            ]),
          },
        });
      }
    );

    it.each(['dev', 'prod'])('%s: ロール ARN を CfnOutput として公開する', (accountScope) => {
      const template = createTemplate(accountScope);
      const outputs = template.findOutputs('*');

      expect(Object.keys(outputs)).toEqual(
        expect.arrayContaining([expect.stringContaining('ClaudeRoleArnExport')])
      );
    });
  });

  describe('dev アカウント固有', () => {
    it('追加ポリシーの Action は lambda:InvokeFunction のみ', () => {
      const template = createTemplate('dev');
      const policies = template.findResources('AWS::IAM::ManagedPolicy');
      const operationsPolicy = Object.values(policies).find(
        (policy) => policy.Properties.ManagedPolicyName === 'nagiyu-claude-dev-operations-policy'
      );

      expect(operationsPolicy).toBeDefined();

      const allActions = new Set();
      for (const statement of operationsPolicy.Properties.PolicyDocument.Statement) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        actions.forEach((action) => allActions.add(action));
      }

      expect([...allActions]).toEqual(['lambda:InvokeFunction']);
    });

    it('追加ポリシーの Resource はワイルドカードを含まない列挙で、指定した関数のみを対象にする', () => {
      const template = createTemplate('dev');
      const policies = template.findResources('AWS::IAM::ManagedPolicy');
      const operationsPolicy = Object.values(policies).find(
        (policy) => policy.Properties.ManagedPolicyName === 'nagiyu-claude-dev-operations-policy'
      );

      const resources = [];
      for (const statement of operationsPolicy.Properties.PolicyDocument.Statement) {
        const statementResources = Array.isArray(statement.Resource)
          ? statement.Resource
          : [statement.Resource];
        resources.push(...statementResources);
      }

      // 単なる '*' は含まない
      expect(resources).not.toContain('*');

      for (const functionName of DEV_INVOKABLE_FUNCTION_NAMES) {
        expect(resources).toContain(
          `arn:aws:lambda:us-east-1:${ACCOUNT_IDS.dev}:function:${functionName}`
        );
        expect(resources).toContain(
          `arn:aws:lambda:us-east-1:${ACCOUNT_IDS.dev}:function:${functionName}:*`
        );
      }

      // 列挙した関数の数 × 2（本体 + バージョン/エイリアス修飾）のみ
      expect(resources.length).toBe(DEV_INVOKABLE_FUNCTION_NAMES.length * 2);
    });

    it('nagiyu-claude-key ユーザーは作成しない', () => {
      const template = createTemplate('dev');

      template.resourceCountIs('AWS::IAM::User', 0);
    });

    it('関数リストが空の場合は追加ポリシー自体を作らない', () => {
      const template = createTemplate('dev', { invokableFunctionNames: [] });
      const policies = template.findResources('AWS::IAM::ManagedPolicy', {
        Properties: { ManagedPolicyName: 'nagiyu-claude-dev-operations-policy' },
      });

      expect(Object.keys(policies)).toHaveLength(0);
    });
  });

  describe('prod アカウント固有', () => {
    it('dev-operations 追加ポリシーは作らない', () => {
      const template = createTemplate('prod');
      const policies = template.findResources('AWS::IAM::ManagedPolicy', {
        Properties: { ManagedPolicyName: 'nagiyu-claude-dev-operations-policy' },
      });

      expect(Object.keys(policies)).toHaveLength(0);
    });

    it('nagiyu-claude-key ユーザーを 1 つ作成する', () => {
      const template = createTemplate('prod');

      template.resourceCountIs('AWS::IAM::User', 1);
      template.hasResourceProperties('AWS::IAM::User', {
        UserName: 'nagiyu-claude-key',
      });
    });

    it('nagiyu-claude-key ユーザーの権限は両アカウントの nagiyu-claude ロールへの AssumeRole のみ', () => {
      const template = createTemplate('prod');
      const policies = template.findResources('AWS::IAM::Policy');

      const userPolicies = Object.values(policies).filter((policy) =>
        (Array.isArray(policy.Properties.Users) ? policy.Properties.Users : []).length > 0
      );
      expect(userPolicies).toHaveLength(1);

      const statements = userPolicies[0].Properties.PolicyDocument.Statement;
      expect(statements).toHaveLength(1);
      expect(statements[0].Effect).toBe('Allow');
      expect(statements[0].Action).toBe('sts:AssumeRole');
      expect(statements[0].Resource).toEqual(
        expect.arrayContaining([
          `arn:aws:iam::${ACCOUNT_IDS.prod}:role/nagiyu-claude`,
          `arn:aws:iam::${ACCOUNT_IDS.dev}:role/nagiyu-claude`,
        ])
      );
      expect(statements[0].Resource).toHaveLength(2);
    });

    it('ユーザー ARN・名前を CfnOutput として公開する', () => {
      const template = createTemplate('prod');
      const outputs = template.findOutputs('*');

      expect(Object.keys(outputs)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ClaudeKeyUserArnExport'),
          expect.stringContaining('ClaudeKeyUserNameExport'),
        ])
      );
    });
  });
});

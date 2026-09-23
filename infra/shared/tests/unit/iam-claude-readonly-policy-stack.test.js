const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const {
  IamClaudeReadonlyPolicyStack,
} = require('../../lib/iam/iam-claude-readonly-policy-stack');

describe('IamClaudeReadonlyPolicyStack', () => {
  const createTemplate = () => {
    const app = new cdk.App();
    const stack = new IamClaudeReadonlyPolicyStack(app, 'TestIamClaudeReadonlyPolicyStack');
    return Template.fromStack(stack);
  };

  const findAllowReadOnlyStatement = (template) => {
    const policies = template.findResources('AWS::IAM::ManagedPolicy');
    const [policy] = Object.values(policies);
    const statements = policy.Properties.PolicyDocument.Statement;
    return statements.find((s) => s.Sid === 'AllowReadOnlyOperations');
  };

  it('AllowReadOnlyOperations に CloudTrail の参照系アクションを許可する', () => {
    const template = createTemplate();
    const statement = findAllowReadOnlyStatement(template);

    expect(statement.Effect).toBe('Allow');
    expect(statement.Action).toEqual(
      expect.arrayContaining([
        'cloudtrail:LookupEvents',
        'cloudtrail:Describe*',
        'cloudtrail:Get*',
        'cloudtrail:List*',
      ])
    );
  });

  it('書き込み系・設定変更系の CloudTrail アクションを含めない', () => {
    const template = createTemplate();
    const statement = findAllowReadOnlyStatement(template);

    const forbiddenActions = [
      'cloudtrail:CreateTrail',
      'cloudtrail:DeleteTrail',
      'cloudtrail:StopLogging',
      'cloudtrail:StartLogging',
      'cloudtrail:UpdateTrail',
      'cloudtrail:PutEventSelectors',
      'cloudtrail:PutInsightSelectors',
    ];

    forbiddenActions.forEach((action) => {
      expect(statement.Action).not.toEqual(expect.arrayContaining([action]));
    });
  });

  it('既存の Deny ステートメントを維持する（Secrets / KMS / auth-users）', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'DenySecretRetrieval',
            Effect: 'Deny',
          }),
          Match.objectLike({
            Sid: 'DenyKmsDataOperations',
            Effect: 'Deny',
          }),
          Match.objectLike({
            Sid: 'DenyAuthUsersTableAccess',
            Effect: 'Deny',
          }),
        ]),
      },
    });
  });

  it('ManagedPolicy 名を nagiyu-claude-readonly-policy とする', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: 'nagiyu-claude-readonly-policy',
    });
  });
});

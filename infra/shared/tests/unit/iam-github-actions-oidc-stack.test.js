const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const iam = require('aws-cdk-lib/aws-iam');

require('ts-node/register/transpile-only');
const {
  IamGitHubActionsOidcStack,
} = require('../../lib/iam/iam-github-actions-oidc-stack');

describe('IamGitHubActionsOidcStack', () => {
  const createTemplate = () => {
    const app = new cdk.App();

    const policies = {
      core: iam.ManagedPolicy.fromManagedPolicyArn(
        app,
        'DummyCorePolicy',
        'arn:aws:iam::123456789012:policy/nagiyu-deploy-policy-core'
      ),
      application: iam.ManagedPolicy.fromManagedPolicyArn(
        app,
        'DummyApplicationPolicy',
        'arn:aws:iam::123456789012:policy/nagiyu-deploy-policy-application'
      ),
      container: iam.ManagedPolicy.fromManagedPolicyArn(
        app,
        'DummyContainerPolicy',
        'arn:aws:iam::123456789012:policy/nagiyu-deploy-policy-container'
      ),
      integration: iam.ManagedPolicy.fromManagedPolicyArn(
        app,
        'DummyIntegrationPolicy',
        'arn:aws:iam::123456789012:policy/nagiyu-deploy-policy-integration'
      ),
    };

    const stack = new IamGitHubActionsOidcStack(app, 'TestIamGitHubActionsOidcStack', {
      policies,
    });
    return Template.fromStack(stack);
  };

  it('token.actions.githubusercontent.com の OIDC プロバイダを作成する', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
    template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
  });

  it('3 つの GitHub Actions ロールを固定名で作成する', () => {
    const template = createTemplate();

    template.resourceCountIs('AWS::IAM::Role', 3);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-dev',
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-prod',
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-pr',
    });
  });

  it('各ロールの maxSessionDuration が 4 時間である', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-dev',
      MaxSessionDuration: 14400,
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-prod',
      MaxSessionDuration: 14400,
    });
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-pr',
      MaxSessionDuration: 14400,
    });
  });

  it('dev ロールは GitHub Environment: dev の sub クレームのみを信頼する', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-dev',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:nagiyu/nagiyu-platform:environment:dev',
              },
            },
          }),
        ]),
      },
    });
  });

  it('prod ロールは GitHub Environment: prod の sub クレームのみを信頼する', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-prod',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:nagiyu/nagiyu-platform:environment:prod',
              },
            },
          }),
        ]),
      },
    });
  });

  it('pr ロールは pull_request イベントの sub クレームのみを信頼する', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-github-actions-pr',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:nagiyu/nagiyu-platform:pull_request',
              },
            },
          }),
        ]),
      },
    });
  });

  it('各ロールに既存 4 ポリシー（core/application/container/integration）を付与する', () => {
    const template = createTemplate();
    const roles = template.findResources('AWS::IAM::Role');

    Object.values(roles).forEach((role) => {
      const managedPolicyArns = role.Properties.ManagedPolicyArns;
      expect(managedPolicyArns).toHaveLength(4);
    });
  });

  it('各ロール ARN を CfnOutput として公開する', () => {
    const template = createTemplate();
    const outputs = template.findOutputs('*');
    const outputKeys = Object.keys(outputs);

    expect(outputKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('DevRoleArnExport'),
        expect.stringContaining('ProdRoleArnExport'),
        expect.stringContaining('PrRoleArnExport'),
      ])
    );
  });
});

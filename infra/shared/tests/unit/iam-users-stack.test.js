const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');
const iam = require('aws-cdk-lib/aws-iam');

require('ts-node/register/transpile-only');
const { IamUsersStack } = require('../../lib/iam/iam-users-stack');

describe('IamUsersStack', () => {
  const createTemplate = () => {
    const app = new cdk.App();

    const policy = (id) =>
      iam.ManagedPolicy.fromManagedPolicyArn(app, id, `arn:aws:iam::123456789012:policy/${id}`);

    const policies = {
      claudeReadonly: policy('DummyClaudeReadonlyPolicy'),
    };

    const stack = new IamUsersStack(app, 'TestIamUsersStack', {
      policies,
    });
    return Template.fromStack(stack);
  };

  it('Claude 閲覧ユーザーのみを作成する（GitHub Actions 用の旧ユーザーは撤去済み）', () => {
    const template = createTemplate();

    template.resourceCountIs('AWS::IAM::User', 1);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'nagiyu-claude-readonly',
    });
  });

  it('GitHub Actions ユーザー用の CfnOutput は公開しない', () => {
    const template = createTemplate();
    const outputKeys = Object.keys(template.findOutputs('*'));

    expect(outputKeys).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('GitHubActionsUserArnExport'),
        expect.stringContaining('GitHubActionsUserNameExport'),
      ])
    );
  });

  it('Claude 閲覧ユーザーの CfnOutput は公開する', () => {
    const template = createTemplate();
    const outputKeys = Object.keys(template.findOutputs('*'));

    expect(outputKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ClaudeReadonlyUserArnExport'),
        expect.stringContaining('ClaudeReadonlyUserNameExport'),
      ])
    );
  });

  it('Claude 閲覧ユーザーには claudeReadonly ポリシーのみを付与する', () => {
    const template = createTemplate();

    const users = template.findResources('AWS::IAM::User');
    const claudeReadonlyUser = Object.values(users).find(
      (user) => user.Properties.UserName === 'nagiyu-claude-readonly'
    );
    expect(claudeReadonlyUser.Properties.ManagedPolicyArns).toHaveLength(1);
  });
});

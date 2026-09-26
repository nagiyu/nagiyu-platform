const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');
const iam = require('aws-cdk-lib/aws-iam');

require('ts-node/register/transpile-only');
const { IamUsersStack } = require('../../lib/iam/iam-users-stack');

describe('IamUsersStack', () => {
  const createTemplate = (extraProps = {}) => {
    const app = new cdk.App();

    const policy = (id) =>
      iam.ManagedPolicy.fromManagedPolicyArn(app, id, `arn:aws:iam::123456789012:policy/${id}`);

    const policies = {
      core: policy('DummyCorePolicy'),
      application: policy('DummyApplicationPolicy'),
      container: policy('DummyContainerPolicy'),
      integration: policy('DummyIntegrationPolicy'),
      claudeReadonly: policy('DummyClaudeReadonlyPolicy'),
    };

    const stack = new IamUsersStack(app, 'TestIamUsersStack', {
      policies,
      ...extraProps,
    });
    return Template.fromStack(stack);
  };

  it('createGitHubActionsUser 未指定時は現行どおり GitHub Actions ユーザーと Claude 閲覧ユーザーを作成する', () => {
    const template = createTemplate();

    template.resourceCountIs('AWS::IAM::User', 2);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'nagiyu-github-actions',
    });
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'nagiyu-claude-readonly',
    });
  });

  it('createGitHubActionsUser=false のとき Claude 閲覧ユーザーのみ作成する（マルチアカウント化対応）', () => {
    const template = createTemplate({ createGitHubActionsUser: false });

    template.resourceCountIs('AWS::IAM::User', 1);
    template.hasResourceProperties('AWS::IAM::User', {
      UserName: 'nagiyu-claude-readonly',
    });

    const outputKeys = Object.keys(template.findOutputs('*'));
    expect(outputKeys).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('GitHubActionsUserArnExport'),
        expect.stringContaining('GitHubActionsUserNameExport'),
      ])
    );
  });

  it('createGitHubActionsUser=false でも Claude 閲覧ユーザーの CfnOutput は公開する', () => {
    const template = createTemplate({ createGitHubActionsUser: false });
    const outputKeys = Object.keys(template.findOutputs('*'));

    expect(outputKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('ClaudeReadonlyUserArnExport'),
        expect.stringContaining('ClaudeReadonlyUserNameExport'),
      ])
    );
  });

  it('createGitHubActionsUser=true のとき GitHub Actions ユーザーに既存 4 ポリシーを付与する', () => {
    const template = createTemplate({ createGitHubActionsUser: true });

    const users = template.findResources('AWS::IAM::User');
    const githubActionsUser = Object.values(users).find(
      (user) => user.Properties.UserName === 'nagiyu-github-actions'
    );
    expect(githubActionsUser.Properties.ManagedPolicyArns).toHaveLength(4);
  });
});

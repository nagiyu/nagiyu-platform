const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const {
  DevSyncSourceReaderStack,
} = require('../../lib/iam/dev-sync-source-reader-stack');
const { ACCOUNT_IDS } = require('../../lib/account-scope');

describe('DevSyncSourceReaderStack', () => {
  const createTemplate = () => {
    const app = new cdk.App();
    const stack = new DevSyncSourceReaderStack(app, 'TestDevSyncSourceReaderStack', {
      env: { account: ACCOUNT_IDS.prod, region: 'us-east-1' },
    });
    return Template.fromStack(stack);
  };

  it('固定名の IAM ロールを 1 つだけ作成する', () => {
    const template = createTemplate();

    template.resourceCountIs('AWS::IAM::Role', 1);
    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-dev-sync-source-reader',
    });
  });

  it('信頼ポリシーは dev アカウントプリンシパル + PrincipalArn 条件で dev-sync 実行ロールのみを許可する', () => {
    const template = createTemplate();

    template.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'nagiyu-dev-sync-source-reader',
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Principal: {
              AWS: {
                'Fn::Join': [
                  '',
                  ['arn:', { Ref: 'AWS::Partition' }, `:iam::${ACCOUNT_IDS.dev}:root`],
                ],
              },
            },
            Condition: {
              ArnEquals: {
                'aws:PrincipalArn': `arn:aws:iam::${ACCOUNT_IDS.dev}:role/nagiyu-dev-sync-dev-execution`,
              },
            },
          }),
        ]),
      },
    });
  });

  it('許可アクションは Scan/Query/GetItem のみで、書き込み・削除系は含まない', () => {
    const template = createTemplate();
    const policies = template.findResources('AWS::IAM::Policy');

    const allActions = [];
    for (const policy of Object.values(policies)) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        allActions.push(...actions);
      }
    }

    const uniqueActions = [...new Set(allActions)].sort();
    expect(uniqueActions).toEqual(['dynamodb:GetItem', 'dynamodb:Query', 'dynamodb:Scan']);

    const forbidden = ['dynamodb:PutItem', 'dynamodb:DeleteItem', 'dynamodb:UpdateItem', 'dynamodb:BatchWriteItem'];
    for (const action of forbidden) {
      expect(uniqueActions).not.toContain(action);
    }
  });

  it('読み取り対象は 2 テーブル分（各テーブル本体 + /index/* の 2 リソース）になっている', () => {
    const template = createTemplate();
    const policies = template.findResources('AWS::IAM::Policy');

    const resources = [];
    for (const policy of Object.values(policies)) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        const statementResources = Array.isArray(statement.Resource)
          ? statement.Resource
          : [statement.Resource];
        resources.push(...statementResources);
      }
    }

    // 2 テーブル × (本体 ARN + /index/* ARN) = 4
    expect(resources.length).toBe(4);
  });

  it('対象テーブルは niconico-mylist-assistant と stock-tracker の prod テーブルのみ', () => {
    const template = createTemplate();
    const templateJson = JSON.stringify(template.toJSON());

    expect(templateJson).toContain('nagiyu-niconico-mylist-assistant-dynamodb-prod');
    expect(templateJson).toContain('nagiyu-stock-tracker-main-prod');
  });

  it('ロール ARN を CfnOutput として公開する', () => {
    const template = createTemplate();
    const outputs = template.findOutputs('*');

    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining([expect.stringContaining('SourceReaderRoleArnExport')])
    );
  });
});

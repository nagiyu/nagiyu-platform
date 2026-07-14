const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkBatchStack } = require('../../lib/batch-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment = 'dev', overrides = {}) => {
  const app = new cdk.App();
  const stack = new LiveTalkBatchStack(app, `TestLiveTalkBatch${environment}`, {
    environment,
    openAiApiKey: 'PLACEHOLDER_KEY',
    vapidPublicKey: 'PLACEHOLDER_VAPID_PUB',
    vapidPrivateKey: 'PLACEHOLDER_VAPID_PRIV',
    env: STACK_ENV,
    ...overrides,
  });
  return { template: Template.fromStack(stack), stack };
};

describe('LiveTalkBatchStack', () => {
  it('学習バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-learn-user-activity'),
    });
  });

  it('Lambda のタイムアウトは 15 分', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 900,
    });
  });

  it('Lambda のメモリは 512MB', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      MemorySize: 512,
    });
  });

  it('Lambda 環境変数に OPENAI_API_KEY が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          OPENAI_API_KEY: 'PLACEHOLDER_KEY',
        }),
      },
    });
  });

  it('学習バッチ Lambda 環境変数に TZ=Asia/Tokyo が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-learn-user-activity'),
      Environment: {
        Variables: Match.objectLike({
          TZ: 'Asia/Tokyo',
        }),
      },
    });
  });

  it('学習バッチ Lambda には OPENAI_API_KEY を含めない', () => {
    const { stack } = synth();
    const template = Template.fromStack(stack);
    const functions = template.findResources('AWS::Lambda::Function', {
      Properties: {
        FunctionName: Match.stringLikeRegexp('livetalk-batch-learn-user-activity'),
      },
    });
    const learnFn = Object.values(functions)[0];
    const vars = learnFn.Properties.Environment.Variables;
    expect(vars.OPENAI_API_KEY).toBeUndefined();
  });

  it('EventBridge ルールを 4 つ作成する（週次学習 + 毎時通知 + 毎時集約 + 毎時acquire）', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::Events::Rule', 4);
  });

  it('学習バッチの EventBridge スケジュールは週次（土曜 UTC 18:00）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 18 ? * SAT *)',
    });
  });

  it('SQS DLQ を 4 つ作成する（学習 + 通知 + 集約 + acquire で分離）', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::SQS::Queue', 4);
  });

  it('Lambda 実行ロールを作成する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Principal: { Service: 'lambda.amazonaws.com' },
          }),
        ]),
      },
    });
  });

  it('LearnActivityFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('LearnActivityFunctionArn', Match.anyValue());
  });

  it('通知バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-notify'),
    });
  });

  it('通知バッチ Lambda 環境変数に VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-notify'),
      Environment: {
        Variables: Match.objectLike({
          VAPID_PUBLIC_KEY: 'PLACEHOLDER_VAPID_PUB',
          VAPID_PRIVATE_KEY: 'PLACEHOLDER_VAPID_PRIV',
        }),
      },
    });
  });

  it('通知バッチの EventBridge スケジュールは毎時 30 分（cron(30 * * * ? *)）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(30 * * * ? *)',
    });
  });

  it('NotifyFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('NotifyFunctionArn', Match.anyValue());
  });

  it('集約バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-consolidate'),
    });
  });

  it('集約バッチ Lambda 環境変数に TZ=Asia/Tokyo と OPENAI_API_KEY が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-consolidate'),
      Environment: {
        Variables: Match.objectLike({
          TZ: 'Asia/Tokyo',
          OPENAI_API_KEY: 'PLACEHOLDER_KEY',
        }),
      },
    });
  });

  it('集約バッチの EventBridge スケジュールは毎時 15 分（cron(15 * * * ? *)）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(15 * * * ? *)',
    });
  });

  it('ConsolidateFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('ConsolidateFunctionArn', Match.anyValue());
  });

  it('ConsolidateDlqUrl を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('ConsolidateDlqUrl', Match.anyValue());
  });

  it('DynamoDB の grant に GSI1（index/*）への Query 権限が含まれる', () => {
    // batch ロールは GSI1 を Query してユーザーを列挙するため、IAM ポリシーの
    // Resource にテーブル本体に加えて `table/.../index/*` が含まれている必要がある（#3527）。
    const { template } = synth();
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:Query']),
            Resource: Match.arrayWith([
              Match.stringLikeRegexp('table/nagiyu-livetalk-dynamodb-dev/index/\\*'),
            ]),
          }),
        ]),
      },
    });
  });

  it('consolidate ロールの DynamoDB grant に GSI3（index/*）への Query 権限が含まれる（ADR-2.22）', () => {
    // dynamoTable の globalIndexes に GSI3 を追加していないと、consolidate ロールが
    // GSI3（GSI-TOPIC）を Query する権限（index/*）が IAM ポリシーに付与されない。
    const { template } = synth();
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        RoleName: Match.stringLikeRegexp('livetalk-consolidate-role'),
      },
    });
    const roleLogicalIds = Object.keys(roles);
    expect(roleLogicalIds.length).toBeGreaterThan(0);

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:Query']),
            Resource: Match.arrayWith([
              Match.stringLikeRegexp('table/nagiyu-livetalk-dynamodb-dev/index/\\*'),
            ]),
          }),
        ]),
      },
      Roles: Match.arrayWith([Match.objectLike({ Ref: roleLogicalIds[0] })]),
    });
  });

  it('acquire バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-acquire'),
    });
  });

  it('acquire バッチ Lambda 環境変数に TZ=Asia/Tokyo と OPENAI_API_KEY が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-acquire'),
      Environment: {
        Variables: Match.objectLike({
          TZ: 'Asia/Tokyo',
          OPENAI_API_KEY: 'PLACEHOLDER_KEY',
        }),
      },
    });
  });

  it('acquire バッチの EventBridge スケジュールは毎時 45 分（cron(45 * * * ? *)）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(45 * * * ? *)',
    });
  });

  it('AcquireFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('AcquireFunctionArn', Match.anyValue());
  });

  it('AcquireDlqUrl を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('AcquireDlqUrl', Match.anyValue());
  });

  it('acquire ロールの DynamoDB grant に GSI4（index/*）への Query 権限が含まれる（鮮度掃引用）', () => {
    const { template } = synth();
    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        RoleName: Match.stringLikeRegexp('livetalk-acquire-role'),
      },
    });
    const roleLogicalIds = Object.keys(roles);
    expect(roleLogicalIds.length).toBeGreaterThan(0);

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:Query']),
            Resource: Match.arrayWith([
              Match.stringLikeRegexp('table/nagiyu-livetalk-dynamodb-dev/index/\\*'),
            ]),
          }),
        ]),
      },
      Roles: Match.arrayWith([Match.objectLike({ Ref: roleLogicalIds[0] })]),
    });
  });

  it('prod 環境でも正しく生成する', () => {
    const { template } = synth('prod');
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          NODE_ENV: 'prod',
        }),
      },
    });
  });
});

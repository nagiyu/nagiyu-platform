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
    env: STACK_ENV,
    ...overrides,
  });
  return { template: Template.fromStack(stack), stack };
};

describe('LiveTalkBatchStack', () => {
  it('バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-compress'),
    });
  });

  it('学習バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-learn-user-activity'),
    });
  });

  it('バッチ Lambda を 2 つ作成する（圧縮 + 学習）', () => {
    // logRetention は LogRetention 用の provider Lambda を別途生成するため、
    // AWS::Lambda::Function の総数ではなく FunctionName で個別に検証する。
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-compress'),
    });
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

  it('EventBridge ルールを 3 つ作成する（日次圧縮 + 週次学習 + 毎時勉強）', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::Events::Rule', 3);
  });

  it('圧縮バッチの EventBridge スケジュールは cron(0 18 * * ? *)', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 18 * * ? *)',
    });
  });

  it('学習バッチの EventBridge スケジュールは週次（土曜 UTC 18:00）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 18 ? * SAT *)',
    });
  });

  it('SQS DLQ を 3 つ作成する（圧縮 + 学習 + 勉強で分離）', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::SQS::Queue', 3);
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

  it('勉強バッチ用 Lambda 関数が存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-study'),
    });
  });

  it('勉強バッチ Lambda 環境変数に TZ=Asia/Tokyo と OPENAI_API_KEY が含まれる', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: Match.stringLikeRegexp('livetalk-batch-study'),
      Environment: {
        Variables: Match.objectLike({
          TZ: 'Asia/Tokyo',
          OPENAI_API_KEY: 'PLACEHOLDER_KEY',
        }),
      },
    });
  });

  it('勉強バッチの EventBridge スケジュールは毎時（cron(0 * * * ? *)）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 * * * ? *)',
    });
  });

  it('BatchFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('BatchFunctionArn', Match.anyValue());
  });

  it('LearnActivityFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('LearnActivityFunctionArn', Match.anyValue());
  });

  it('StudyFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('StudyFunctionArn', Match.anyValue());
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

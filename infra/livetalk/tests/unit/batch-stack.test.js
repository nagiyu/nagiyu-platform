const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkBatchStack } = require('../../lib/batch-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment = 'dev', overrides = {}) => {
  const app = new cdk.App();
  const stack = new LiveTalkBatchStack(app, `TestLiveTalkBatch${environment}`, {
    environment,
    batchEcrRepositoryName: `nagiyu-livetalk-batch-${environment}`,
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

  it('EventBridge ルールを 1 つ作成する', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::Events::Rule', 1);
  });

  it('EventBridge スケジュールは cron(0 18 * * ? *)', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 18 * * ? *)',
    });
  });

  it('SQS DLQ を 1 つ作成する', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::SQS::Queue', 1);
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

  it('BatchFunctionArn を Outputs に出力する', () => {
    const { template } = synth();
    template.hasOutput('BatchFunctionArn', Match.anyValue());
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

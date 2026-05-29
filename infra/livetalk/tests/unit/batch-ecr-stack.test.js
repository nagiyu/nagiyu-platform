const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkBatchEcrStack } = require('../../lib/batch-ecr-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkBatchEcrStack(app, `TestLiveTalkBatchEcr${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkBatchEcrStack', () => {
  it('ECR リポジトリを 1 つ作成する', () => {
    const template = synth('dev');
    template.resourceCountIs('AWS::ECR::Repository', 1);
  });

  it('バッチ用リポジトリ名に livetalk-batch が含まれる', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: Match.stringLikeRegexp('livetalk-batch'),
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECR::Repository', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('SSM パラメータを作成しない（リポジトリ名は命名規則から導出する）', () => {
    const template = synth('dev');
    template.resourceCountIs('AWS::SSM::Parameter', 0);
  });

  it('prod でも正しく生成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: Match.stringLikeRegexp('livetalk-batch'),
    });
  });
});

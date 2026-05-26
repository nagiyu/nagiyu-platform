const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkSecretsStack, openAiSecretName } = require('../../lib/secrets-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkSecretsStack(app, `TestLiveTalkSecrets${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkSecretsStack', () => {
  it('OpenAI 用シークレットを命名規約どおりに作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/nagiyu/livetalk/dev/openai/api-key',
      Description: 'LiveTalk OpenAI API key (dev)',
    });
  });

  it('prod 環境でも正しい命名で生成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/nagiyu/livetalk/prod/openai/api-key',
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('OpenAI 用 Secret のみ作成する（Phase 2b は OpenAI 単独）', () => {
    const template = synth('dev');
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  });

  it('Outputs に Secret ARN / Name を出力する', () => {
    const template = synth('dev');
    template.hasOutput('OpenAiApiKeySecretArn', Match.anyValue());
    template.hasOutput('OpenAiApiKeySecretName', Match.anyValue());
  });
});

describe('openAiSecretName', () => {
  it('OpenAI のシークレット名を組み立てる', () => {
    expect(openAiSecretName('dev')).toBe('/nagiyu/livetalk/dev/openai/api-key');
    expect(openAiSecretName('prod')).toBe('/nagiyu/livetalk/prod/openai/api-key');
  });
});

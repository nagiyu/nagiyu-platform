const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkEcsServiceStack } = require('../../lib/ecs-service-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment, props = {}) => {
  const app = new cdk.App();
  const stack = new LiveTalkEcsServiceStack(app, `TestLiveTalkService${environment}`, {
    environment,
    env: STACK_ENV,
    ...props,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkEcsServiceStack', () => {
  it('Task Definition family を環境名込みで作成する（VOICEVOX 同居のため Memory 3072）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-dev',
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '1024',
      Memory: '3072',
    });
  });

  it('livetalk-web コンテナを Next.js port 3000 で定義する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 3000 })]),
        }),
      ]),
    });
  });

  it('VOICEVOX コンテナを port 50021 で定義し、healthCheck の startPeriod を 60 秒以上にする', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'voicevox',
          Image: 'voicevox/voicevox_engine:cpu-latest',
          Essential: true,
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 50021 })]),
          HealthCheck: Match.objectLike({
            StartPeriod: 60,
          }),
        }),
      ]),
    });
  });

  it('livetalk-web は VOICEVOX の HEALTHY を dependsOn し、VOICEVOX_URL を env で渡す', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          DependsOn: Match.arrayWith([
            Match.objectLike({
              ContainerName: 'voicevox',
              Condition: 'HEALTHY',
            }),
          ]),
          Environment: Match.arrayWith([
            { Name: 'VOICEVOX_URL', Value: 'http://localhost:50021' },
          ]),
        }),
      ]),
    });
  });

  it('ECS Service 名を環境名込みで作成し、VOICEVOX 起動待ちを含む 120 秒の grace period を持つ', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'nagiyu-livetalk-service-dev',
      DesiredCount: 1,
      LaunchType: 'FARGATE',
      HealthCheckGracePeriodSeconds: 120,
    });
  });

  it('Task Security Group が ALB SG からの 3000 番受け入れを設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupName: 'nagiyu-livetalk-task-sg-dev',
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 3000,
      ToPort: 3000,
      IpProtocol: 'tcp',
    });
  });

  it('SSM Parameter に ECS Service 名を出力する', () => {
    const template = synth('dev');
    // Value は CFN の Fn::GetAtt 参照になるため Name のみ検証する
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/ecs/service-name',
    });
  });

  it('CloudWatch Log Group を 7 日間保持で作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/ecs/nagiyu-livetalk-task-dev',
      RetentionInDays: 7,
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('APP_VERSION を container environment に注入する（明示指定）', () => {
    const template = synth('dev', { appVersion: '1.2.3' });
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([{ Name: 'APP_VERSION', Value: '1.2.3' }]),
        }),
      ]),
    });
  });

  it('APP_VERSION 未指定時は 1.0.0 をデフォルトで注入する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([{ Name: 'APP_VERSION', Value: '1.0.0' }]),
        }),
      ]),
    });
  });

  it('IMAGE_TAG 環境変数からイメージタグを取得する', () => {
    process.env.IMAGE_TAG = 'abc123';
    try {
      const template = synth('dev');
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'livetalk-web',
            Image: Match.stringLikeRegexp('.*:abc123$'),
          }),
        ]),
      });
    } finally {
      delete process.env.IMAGE_TAG;
    }
  });

  it('prod 環境でも正しい命名で生成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'nagiyu-livetalk-service-prod',
    });
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-prod',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/ecs/service-name',
    });
  });
});

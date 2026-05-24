const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkEcsServiceStack } = require('../../lib/ecs-service-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkEcsServiceStack(app, `TestLiveTalkService${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkEcsServiceStack', () => {
  it('Task Definition family を環境名込みで作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-dev',
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '1024',
      Memory: '2048',
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

  it('ECS Service 名を環境名込みで作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'nagiyu-livetalk-service-dev',
      DesiredCount: 1,
      LaunchType: 'FARGATE',
      HealthCheckGracePeriodSeconds: 60,
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

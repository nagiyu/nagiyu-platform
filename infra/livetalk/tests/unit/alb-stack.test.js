const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkAlbStack } = require('../../lib/alb-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkAlbStack(app, `TestLiveTalkAlb${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkAlbStack', () => {
  it('環境名を含む ALB 名で ApplicationLoadBalancer を作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Name: 'nagiyu-livetalk-alb-dev',
      Scheme: 'internet-facing',
      Type: 'application',
    });
  });

  it('ALB のアイドルタイムアウトを 120 秒に設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([
        { Key: 'idle_timeout.timeout_seconds', Value: '120' },
      ]),
    });
  });

  it('Target Group を /api/health で health check する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Name: 'nagiyu-livetalk-tg-dev',
      Port: 3000,
      Protocol: 'HTTP',
      TargetType: 'ip',
      HealthCheckPath: '/api/health',
    });
  });

  it('HTTP リスナー（port 80）を作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
    });
  });

  it('HTTPS リスナー（port 443）は Phase 1c では作成しない', () => {
    const template = synth('dev');
    template.resourcePropertiesCountIs(
      'AWS::ElasticLoadBalancingV2::Listener',
      { Port: 443 },
      0
    );
  });

  it('Security Group が 80 / 443 の inbound を許可する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupName: 'nagiyu-livetalk-alb-sg-dev',
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({ FromPort: 80, ToPort: 80, IpProtocol: 'tcp' }),
        Match.objectLike({ FromPort: 443, ToPort: 443, IpProtocol: 'tcp' }),
      ]),
    });
  });

  it('SSM Parameter に ALB の各種 ARN / DNS / Security Group を出力する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/alb/dns-name',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/alb/arn',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/alb/listener-arn',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/alb/target-group-arn',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/alb/security-group-id',
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('prod 環境でも正しい命名で生成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Name: 'nagiyu-livetalk-alb-prod',
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      Name: 'nagiyu-livetalk-tg-prod',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/alb/dns-name',
    });
  });
});

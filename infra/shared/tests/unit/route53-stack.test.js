const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { Route53Stack } = require('../../lib/route53-stack');

describe('Route53Stack', () => {
  const createStack = (domainName = 'example.com') => {
    const app = new cdk.App();
    return new Route53Stack(app, 'TestRoute53Stack', { domainName });
  };

  it('指定したドメイン名でパブリックホストゾーンを作成する', () => {
    const stack = createStack('nagiyu.com');
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::HostedZone', {
      Name: 'nagiyu.com.',
    });
    template.resourceCountIs('AWS::Route53::HostedZone', 1);
  });

  it('ホストゾーン ID を SSM パラメータに保存する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/shared/route53/hosted-zone-id',
      Type: 'String',
    });
  });

  it('ホストゾーン名を SSM パラメータに保存する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/shared/route53/hosted-zone-name',
      Type: 'String',
    });
  });

  it('ホストゾーン ID・名前・ネームサーバを CfnOutput として公開する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const outputs = template.findOutputs('*');
    const outputKeys = Object.keys(outputs);

    expect(outputKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('HostedZoneIdExport'),
        expect.stringContaining('HostedZoneNameExport'),
        expect.stringContaining('HostedZoneNameServersExport'),
      ])
    );
  });
});

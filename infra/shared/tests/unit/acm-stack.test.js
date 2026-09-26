const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const route53 = require('aws-cdk-lib/aws-route53');

require('ts-node/register/transpile-only');
const { AcmStack } = require('../../lib/acm-stack');

describe('AcmStack', () => {
  it('指定したドメイン名で証明書を作成する', () => {
    const app = new cdk.App();
    const stack = new AcmStack(app, 'TestAcmStack', {
      domainName: 'example.com',
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'example.com',
      SubjectAlternativeNames: ['*.example.com'],
    });
  });

  it('hostedZone 未指定時は DomainValidationOptions を含めない（手動 DNS 検証）', () => {
    const app = new cdk.App();
    const stack = new AcmStack(app, 'TestAcmStackNoZone', {
      domainName: 'example.com',
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainValidationOptions: Match.absent(),
    });
  });

  it('hostedZone 指定時は DomainValidationOptions に HostedZoneId を含める（自動 DNS 検証）', () => {
    const app = new cdk.App();
    const zoneStack = new cdk.Stack(app, 'TestZoneStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const hostedZone = new route53.HostedZone(zoneStack, 'Zone', {
      zoneName: 'dev.example.com',
    });

    const stack = new AcmStack(app, 'TestAcmStackWithZone', {
      domainName: 'dev.example.com',
      hostedZone,
      env: { account: '123456789012', region: 'us-east-1' },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'dev.example.com',
      SubjectAlternativeNames: ['*.dev.example.com'],
      DomainValidationOptions: Match.arrayWith([
        Match.objectLike({
          HostedZoneId: Match.anyValue(),
        }),
      ]),
    });
  });
});

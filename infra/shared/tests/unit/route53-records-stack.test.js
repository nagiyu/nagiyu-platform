const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { Route53RecordsStack } = require('../../lib/route53-records-stack');

const CLOUDFRONT_HOSTED_ZONE_ID = 'Z2FDTNDATAQYW2';

describe('Route53RecordsStack', () => {
  const createStack = (domainName = 'nagiyu.com') => {
    const app = new cdk.App();
    return new Route53RecordsStack(app, 'TestRoute53RecordsStack', { domainName });
  };

  it('CloudFront 向け CNAME を 8 件、Google Search Console / ACM 検証 / dev サブゾーン委任 NS を各 1 件、apex ALIAS を 1 件作成する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    // 8 (CloudFront) + 1 (Google) + 1 (ACM 検証) + 1 (dev 委任 NS) + 1 (apex ALIAS) = 12
    template.resourceCountIs('AWS::Route53::RecordSet', 12);
  });

  it('全 CNAME レコードに TTL 300 秒を設定する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const cnameRecords = template.findResources('AWS::Route53::RecordSet', {
      Properties: { Type: 'CNAME' },
    });

    // 8 (CloudFront) + 1 (Google) + 1 (ACM 検証) = 10 CNAME
    expect(Object.keys(cnameRecords).length).toBe(10);
    for (const [, resource] of Object.entries(cnameRecords)) {
      expect(resource.Properties.TTL).toBe('300');
    }
  });

  it('apex を CloudFront にエイリアスする A レコードを作成する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'nagiyu.com.',
      AliasTarget: {
        DNSName: 'd1k6ec293qn4f7.cloudfront.net',
        HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
      },
    });
  });

  it('代表的なサービスサブドメインの CNAME 値が正しい', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const expectations = [
      { name: 'tools.nagiyu.com.', target: 'dxsm9dplwcq8k.cloudfront.net' },
      { name: 'auth.nagiyu.com.', target: 'd34m95nq713g26.cloudfront.net' },
    ];

    for (const expected of expectations) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: 'CNAME',
        Name: expected.name,
        ResourceRecords: [expected.target],
      });
    }
  });

  it('旧 dev-* CNAME（旧 dev 環境向け CloudFront）は作成しない（Issue #3820）', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const devPrefixedNames = [
      'dev-tools.nagiyu.com.',
      'dev-auth.nagiyu.com.',
      'dev-admin.nagiyu.com.',
      'dev-quick-clip.nagiyu.com.',
      'dev-stock-tracker.nagiyu.com.',
      'dev-share-together.nagiyu.com.',
      'dev-niconico-mylist-assistant.nagiyu.com.',
      'dev-codec-converter.nagiyu.com.',
    ];

    for (const name of devPrefixedNames) {
      const matches = template.findResources('AWS::Route53::RecordSet', {
        Properties: { Type: 'CNAME', Name: name },
      });
      expect(Object.keys(matches).length).toBe(0);
    }
  });

  it('Google Search Console 検証 CNAME を含む', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'CNAME',
      Name: 'hnjg6vgudcwv.nagiyu.com.',
      ResourceRecords: ['gv-d6lr3lnlnk6zbu.dv.googlehosted.com'],
    });
  });

  it('ACM 検証 CNAME を含む（証明書の自動更新で参照される）', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'CNAME',
      Name: '_795cd11835618eae1172367526630b7f.nagiyu.com.',
      ResourceRecords: ['_09095adf08f7ad2742324041fb053779.zfyfvmchrl.acm-validations.aws'],
    });
  });

  it('dev.nagiyu.com は CNAME ではなく dev アカウントのゾーンへの NS 委任になる', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const devCnames = template.findResources('AWS::Route53::RecordSet', {
      Properties: { Type: 'CNAME', Name: 'dev.nagiyu.com.' },
    });
    expect(Object.keys(devCnames).length).toBe(0);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'dev.nagiyu.com.',
      Type: 'NS',
      TTL: '300',
      ResourceRecords: [
        'ns-179.awsdns-22.com',
        'ns-561.awsdns-06.net',
        'ns-1932.awsdns-49.co.uk',
        'ns-1237.awsdns-26.org',
      ],
    });
  });

  it('ホストゾーン参照は SSM パラメータから動的に解決する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const params = template.findParameters('*');
    const ssmRefs = Object.values(params).filter(
      (p) => p.Type === 'AWS::SSM::Parameter::Value<String>'
        && p.Default === '/nagiyu/shared/route53/hosted-zone-id',
    );
    expect(ssmRefs.length).toBeGreaterThan(0);
  });
});

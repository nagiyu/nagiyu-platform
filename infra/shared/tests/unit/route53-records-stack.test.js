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

  it('CloudFront 向け CNAME を 17 件、Google Search Console を 1 件、apex ALIAS を 1 件作成する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    // 17 (CloudFront subdomains) + 1 (Google Search Console) = 18 CNAME
    template.resourceCountIs('AWS::Route53::RecordSet', 19);
  });

  it('全 CloudFront 向け CNAME に TTL 300 秒を設定する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const cnameRecords = template.findResources('AWS::Route53::RecordSet', {
      Properties: { Type: 'CNAME' },
    });

    expect(Object.keys(cnameRecords).length).toBe(18);
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
      { name: 'dev-tools.nagiyu.com.', target: 'di5qiqkse31ld.cloudfront.net' },
      { name: 'auth.nagiyu.com.', target: 'd34m95nq713g26.cloudfront.net' },
      { name: 'dev.nagiyu.com.', target: 'd1p44g973egas4.cloudfront.net' },
    ];

    for (const expected of expectations) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Type: 'CNAME',
        Name: expected.name,
        ResourceRecords: [expected.target],
      });
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

  it('ACM 検証 CNAME は Phase 5 で自動化するため複製しない', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const records = template.findResources('AWS::Route53::RecordSet');
    const names = Object.values(records).map((r) => r.Properties.Name);

    // ACM 検証 CNAME (_xxxx.nagiyu.com) が含まれないこと
    expect(names.some((n) => /^_/.test(n))).toBe(false);
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

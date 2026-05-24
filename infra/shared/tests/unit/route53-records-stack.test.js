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

  it('CloudFront 向け CNAME を 17 件、Google Search Console / ACM 検証を各 1 件、apex ALIAS と LiveTalk dev ALIAS を各 1 件作成する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    // 17 (CloudFront CNAME) + 1 (Google) + 1 (ACM 検証) + 1 (apex ALIAS) + 1 (LiveTalk dev ALIAS) = 21
    template.resourceCountIs('AWS::Route53::RecordSet', 21);
  });

  it('全 CNAME レコードに TTL 300 秒を設定する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const cnameRecords = template.findResources('AWS::Route53::RecordSet', {
      Properties: { Type: 'CNAME' },
    });

    // 17 (CloudFront) + 1 (Google) + 1 (ACM 検証) = 19 CNAME
    expect(Object.keys(cnameRecords).length).toBe(19);
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

  it('ACM 検証 CNAME を含む（証明書の自動更新で参照される）', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'CNAME',
      Name: '_795cd11835618eae1172367526630b7f.nagiyu.com.',
      ResourceRecords: ['_09095adf08f7ad2742324041fb053779.zfyfvmchrl.acm-validations.aws'],
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

  it('LiveTalk dev は CloudFront ALIAS（CloudFront ホストゾーン ID）で登録する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: 'dev-live-talk.nagiyu.com.',
      AliasTarget: Match.objectLike({
        HostedZoneId: CLOUDFRONT_HOSTED_ZONE_ID,
      }),
    });
  });

  it('LiveTalk dev ALIAS の DNSName は LiveTalk CloudFront SSM パラメータから取得する', () => {
    const stack = createStack();
    const template = Template.fromStack(stack);

    const params = template.findParameters('*');
    const liveTalkSsmRef = Object.values(params).find(
      (p) => p.Type === 'AWS::SSM::Parameter::Value<String>'
        && p.Default === '/nagiyu/livetalk/dev/cloudfront/domain-name',
    );
    expect(liveTalkSsmRef).toBeDefined();
  });
});

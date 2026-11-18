import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Template } from 'aws-cdk-lib/assertions';
import { createCloudFrontAliasRecord } from '../../../src/cloudfront/alias-record';
import { SSM_PARAMETERS } from '../../../src/utils/ssm';

describe('createCloudFrontAliasRecord', () => {
  let stack: cdk.Stack;
  let distribution: cloudfront.Distribution;

  beforeEach(() => {
    stack = new cdk.Stack(new cdk.App(), 'TestStack');
    distribution = new cloudfront.Distribution(stack, 'Distribution', {
      defaultBehavior: { origin: new origins.HttpOrigin('example.com') },
    });
  });

  const ssmParameterNames = () =>
    Object.values(Template.fromStack(stack).toJSON().Parameters ?? {}).map(
      (p) => (p as { Default: string }).Default
    );

  const getRecord = () =>
    Object.values(Template.fromStack(stack).findResources('AWS::Route53::RecordSet'))[0].Properties;

  it('CloudFront 向けの ALIAS の A レコードをコメント付きで作る', () => {
    createCloudFrontAliasRecord(stack, 'AliasRecord', {
      distribution,
      recordName: 'app',
      comment: 'テスト用',
    });

    Template.fromStack(stack).resourceCountIs('AWS::Route53::RecordSet', 1);
    const record = getRecord();
    expect(record.Type).toBe('A');
    expect(record.Comment).toBe('テスト用');
    expect(record.AliasTarget.DNSName['Fn::GetAtt'][1]).toBe('DomainName');
  });

  it('recordName を指定するとゾーンルートからの相対名でレコードを作る', () => {
    createCloudFrontAliasRecord(stack, 'AliasRecord', {
      distribution,
      recordName: 'app',
      comment: 'テスト用',
    });

    // ゾーン名は SSM から解決されるトークンのため、Fn::Join の先頭に相対名が付く
    expect(JSON.stringify(getRecord().Name)).toContain('app.');
  });

  it('recordName を省略するとゾーン頂点にレコードを作る', () => {
    createCloudFrontAliasRecord(stack, 'AliasRecord', { distribution, comment: 'テスト用' });

    expect(JSON.stringify(getRecord().Name)).not.toContain('app.');
    expect(getRecord().Name).toBeDefined();
  });

  it('同じ scope に複数のレコードを作れる', () => {
    const first = createCloudFrontAliasRecord(stack, 'FirstRecord', {
      distribution,
      recordName: 'first',
      comment: 'テスト用',
    });
    const second = createCloudFrontAliasRecord(stack, 'SecondRecord', {
      distribution,
      recordName: 'second',
      comment: 'テスト用',
    });

    expect(first.node.id).toBe('FirstRecord');
    expect(second.node.id).toBe('SecondRecord');
    Template.fromStack(stack).resourceCountIs('AWS::Route53::RecordSet', 2);
  });

  it('既定では SSM のホストゾーン ID と名前を引く', () => {
    createCloudFrontAliasRecord(stack, 'AliasRecord', { distribution, comment: 'テスト用' });

    const names = ssmParameterNames();
    expect(names).toContain(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID);
    expect(names).toContain(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_NAME);
  });

  it('zoneName を指定すると SSM のホストゾーン名を引かず、その値を使う', () => {
    createCloudFrontAliasRecord(stack, 'AliasRecord', {
      distribution,
      recordName: 'app',
      comment: 'テスト用',
      zoneName: 'custom.example.com',
    });

    const names = ssmParameterNames();
    expect(names).toContain(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID);
    expect(names).not.toContain(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_NAME);
    Template.fromStack(stack).hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'app.custom.example.com.',
    });
  });
});

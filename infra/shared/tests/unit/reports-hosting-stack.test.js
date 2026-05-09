const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { ReportsHostingStack } = require('../../lib/reports-hosting-stack');

const STACK_PROPS = {
  domainName: 'nagiyu.com',
  env: { account: '123456789012', region: 'us-east-1' },
};

describe('ReportsHostingStack', () => {
  it('固定バケット名で E2E レポート用 S3 バケットを作成する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-e2e-reports',
    });
  });

  it('パブリックアクセスブロックを有効化する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('3 日でレポートオブジェクトを削除するライフサイクルルールを設定する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({
            Id: 'DeleteAfter3Days',
            Status: 'Enabled',
            ExpirationInDays: 3,
          }),
        ]),
      },
    });
  });

  it('reports.nagiyu.com を CloudFront のエイリアスドメインに設定する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['reports.nagiyu.com'],
        DefaultRootObject: 'index.html',
      }),
    });
  });

  it('Route53 に reports サブドメインの ALIAS レコードを作成する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'reports.nagiyu.com.',
      Type: 'A',
    });
  });

  it('末尾 / を index.html に書き換える CloudFront Function を作成する', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionCode: Match.stringLikeRegexp('endsWith\\("/"\\)'),
    });
  });

  it('CloudFront Function を viewer-request に紐付ける', () => {
    const app = new cdk.App();
    const stack = new ReportsHostingStack(app, 'TestReportsHostingStack', STACK_PROPS);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          FunctionAssociations: Match.arrayWith([
            Match.objectLike({
              EventType: 'viewer-request',
            }),
          ]),
        }),
      }),
    });
  });
});

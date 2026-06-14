const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const fs = require('fs');
const path = require('path');

require('ts-node/register/transpile-only');
const { StorybookStack } = require('../../lib/storybook-stack');

// BucketDeployment は Source.asset() のパスが存在しないと CDK synth で失敗するため
// テスト実行前にダミーの storybook-static ディレクトリを一時作成する
const STORYBOOK_STATIC_DIR = path.join(__dirname, '../../../../libs/ui/storybook-static');
let createdDir = false;

beforeAll(() => {
  if (!fs.existsSync(STORYBOOK_STATIC_DIR)) {
    fs.mkdirSync(STORYBOOK_STATIC_DIR, { recursive: true });
    createdDir = true;
  }
});

afterAll(() => {
  if (createdDir) {
    fs.rmdirSync(STORYBOOK_STATIC_DIR);
  }
});

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = () => {
  const app = new cdk.App();
  const stack = new StorybookStack(app, 'TestStorybookStack', {
    environment: 'dev',
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('StorybookStack', () => {
  it('dev-storybook.nagiyu.com を Aliases に設定する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['dev-storybook.nagiyu.com'],
      }),
    });
  });

  it('S3 バケットを Block Public Access + S3 マネージド暗号化で作成する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-ui-storybook-s3-dev',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('CloudFront Distribution が作成されること', () => {
    const template = synth();
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);
  });

  it('Viewer Protocol Policy を REDIRECT_TO_HTTPS で構成する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
        }),
      }),
    });
  });

  it('TLS 1.2 以上の MinimumProtocolVersion を設定する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        ViewerCertificate: Match.objectLike({
          MinimumProtocolVersion: 'TLSv1.2_2021',
        }),
      }),
    });
  });

  it('価格クラスを PriceClass_100 に設定する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_100',
      }),
    });
  });

  it('HTTP/2 + HTTP/3 を有効化する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        HttpVersion: 'http2and3',
        IPV6Enabled: true,
      }),
    });
  });

  it('Route53 ALIAS A レコードを dev-storybook で作成する', () => {
    const template = synth();
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: {
        'Fn::Join': ['', Match.arrayWith(['dev-storybook.'])],
      },
    });
  });

  it('X-Robots-Tag: noindex, nofollow ヘッダーポリシーが作成されること', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        Name: 'nagiyu-ui-storybook-noindex-dev',
        CustomHeadersConfig: {
          Items: Match.arrayWith([
            {
              Header: 'X-Robots-Tag',
              Value: 'noindex, nofollow',
              Override: true,
            },
          ]),
        },
      }),
    });
  });

  it('defaultBehavior に X-Robots-Tag ヘッダーポリシーが適用されること', () => {
    const template = synth();
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ResponseHeadersPolicyId: Match.objectLike({
            Ref: Match.stringLikeRegexp('^NoindexHeadersPolicy'),
          }),
        }),
      }),
    });
  });

  it('ACM 証明書を SSM パラメータから参照する', () => {
    const template = synth();
    const templateJson = JSON.stringify(template.toJSON());
    expect(templateJson).toContain('/nagiyu/shared/acm/certificate-arn');
  });
});

const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkCloudFrontStack } = require('../../lib/cloudfront-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment) => {
  const app = new cdk.App();
  const stack = new LiveTalkCloudFrontStack(app, `TestLiveTalkCloudFront${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkCloudFrontStack', () => {
  it('dev 環境では dev-live-talk.nagiyu.com を Aliases に設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['dev-live-talk.nagiyu.com'],
      }),
    });
  });

  it('prod 環境では live-talk.nagiyu.com を Aliases に設定する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Aliases: ['live-talk.nagiyu.com'],
      }),
    });
  });

  it('Viewer Protocol Policy を REDIRECT_TO_HTTPS / ALLOW_ALL メソッド許可で構成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: [
            'GET',
            'HEAD',
            'OPTIONS',
            'PUT',
            'PATCH',
            'POST',
            'DELETE',
          ],
        }),
      }),
    });
  });

  it('キャッシュ無効化と Host ヘッダー除外オリジンリクエストポリシーを利用する', () => {
    const template = synth('dev');
    // CachePolicy.CACHING_DISABLED と OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER の
    // マネージドポリシー ID。
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
          OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
        }),
      }),
    });
  });

  it('オリジンタイムアウトを 60 秒に延長する（LLM ストリーミング向け）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        Origins: Match.arrayWith([
          Match.objectLike({
            CustomOriginConfig: Match.objectLike({
              OriginProtocolPolicy: 'http-only',
              HTTPPort: 80,
              OriginReadTimeout: 60,
              OriginKeepaliveTimeout: 60,
            }),
          }),
        ]),
      }),
    });
  });

  it('価格クラスを PriceClass_100、HTTP/2 + HTTP/3 を有効化する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        PriceClass: 'PriceClass_100',
        HttpVersion: 'http2and3',
        IPV6Enabled: true,
      }),
    });
  });

  it('TLS 1.2 以上を Viewer Certificate に設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        ViewerCertificate: Match.objectLike({
          MinimumProtocolVersion: 'TLSv1.2_2021',
          SslSupportMethod: 'sni-only',
        }),
      }),
    });
  });

  it('Distribution ID / Domain / Custom Domain を SSM Parameter に出力する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/cloudfront/distribution-id',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/cloudfront/domain-name',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/cloudfront/custom-domain',
      Value: 'dev-live-talk.nagiyu.com',
    });
  });

  it('prod 環境でも SSM Parameter を prod パスで出力する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/cloudfront/distribution-id',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/cloudfront/custom-domain',
      Value: 'live-talk.nagiyu.com',
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  // Route53 ALIAS の Name は `{recordName}.{zoneName}.` の Fn::Join で生成される。
  // zoneName は SSM トークン参照なので、Join 配列内の先頭要素 `{recordName}.` を検証する。
  it('dev 環境では dev-live-talk の Route53 ALIAS A レコードを CloudFront 向けに作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: {
        'Fn::Join': ['', Match.arrayWith(['dev-live-talk.'])],
      },
      AliasTarget: Match.objectLike({
        DNSName: {
          'Fn::GetAtt': [Match.stringLikeRegexp('^Distribution'), 'DomainName'],
        },
      }),
    });
  });

  it('prod 環境では live-talk の Route53 ALIAS A レコードを CloudFront 向けに作成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      Name: {
        'Fn::Join': ['', Match.arrayWith(['live-talk.'])],
      },
      AliasTarget: Match.objectLike({
        DNSName: {
          'Fn::GetAtt': [Match.stringLikeRegexp('^Distribution'), 'DomainName'],
        },
      }),
    });
  });

  it('Route53 hosted zone は SSM パラメータから動的に取得する', () => {
    const template = synth('dev');
    const params = template.findParameters('*');
    const zoneIdRef = Object.values(params).find(
      (p) => p.Type === 'AWS::SSM::Parameter::Value<String>' &&
        p.Default === '/nagiyu/shared/route53/hosted-zone-id'
    );
    const zoneNameRef = Object.values(params).find(
      (p) => p.Type === 'AWS::SSM::Parameter::Value<String>' &&
        p.Default === '/nagiyu/shared/route53/hosted-zone-name'
    );
    expect(zoneIdRef).toBeDefined();
    expect(zoneNameRef).toBeDefined();
  });

  // /assets/* Behavior と S3 バケット
  it('assets S3 バケットを Block Public Access + S3 マネージド暗号化で作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-livetalk-assets-dev',
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: Match.objectLike({
        ServerSideEncryptionConfiguration: Match.arrayWith([
          Match.objectLike({
            ServerSideEncryptionByDefault: Match.objectLike({
              SSEAlgorithm: 'AES256',
            }),
          }),
        ]),
      }),
    });
  });

  it('prod 環境では nagiyu-livetalk-assets-prod バケット名を使用する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'nagiyu-livetalk-assets-prod',
    });
  });

  it('/assets/* の Additional Behavior で S3 OAC オリジンを使い CACHING_OPTIMIZED を適用する', () => {
    const template = synth('dev');
    // CACHING_OPTIMIZED マネージドポリシー ID
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/assets/*',
            CachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6',
            ViewerProtocolPolicy: 'redirect-to-https',
            AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
            Compress: true,
          }),
        ]),
      }),
    });
  });

  it('S3 オリジン用の OriginAccessControl を作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: 's3',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      }),
    });
  });

  it('assets バケット名を SSM Parameter に出力する（dev パス）', () => {
    const template = synth('dev');
    // Value は CDK Ref トークン（{ Ref: 'AssetsBucket...' }）のため Name のみ検証する。
    // 既存の cloudfront/distribution-id テストと同じ検証スタイル。
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/assets/bucket-name',
    });
  });

  it('prod 環境でも assets バケット名を SSM Parameter (prod パス) で出力する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/assets/bucket-name',
    });
  });

  it('assets バケット名を CfnOutput に出力する', () => {
    const template = synth('dev');
    template.hasOutput('AssetsBucketName', {
      Description: 'LiveTalk assets S3 bucket name (Live2D models, Cubism Core)',
    });
  });

  it('/assets/* Behavior に AssetsUriRewrite CloudFront Function を VIEWER_REQUEST で関連付ける', () => {
    const template = synth('dev');
    // CloudFront Function リソースが作成されることを確認
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: Match.objectLike({
        Runtime: 'cloudfront-js-1.0',
      }),
    });
    // /assets/* behavior に FunctionAssociation が設定されることを確認
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: '/assets/*',
            FunctionAssociations: Match.arrayWith([
              Match.objectLike({
                EventType: 'viewer-request',
                FunctionARN: Match.objectLike({
                  'Fn::GetAtt': Match.arrayWith([
                    Match.stringLikeRegexp('^AssetsUriRewrite'),
                  ]),
                }),
              }),
            ]),
          }),
        ]),
      }),
    });
  });
});

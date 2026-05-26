import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Environment, SSM_PARAMETERS } from '@nagiyu/infra-common';

export interface LiveTalkCloudFrontStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk 専用 CloudFront Distribution スタック
 *
 * - defaultBehavior: LiveTalk 専用 ALB（SSM `/nagiyu/livetalk/{env}/alb/dns-name` から取得）
 * - additionalBehavior `/assets/*`: Live2D モデルファイル / Cubism Core を配信する
 *   private S3 bucket（OAC 経由、CACHING_OPTIMIZED）
 * - 証明書: 共通ワイルドカード ACM（`*.nagiyu.com`、us-east-1）
 * - カスタムドメイン:
 *     - dev: `dev-live-talk.nagiyu.com`
 *     - prod: `live-talk.nagiyu.com`
 * - Route53 ALIAS レコードを同一スタック内で作成（`infra/ui-storybook` と同じパターン）。
 * - 後続 Phase の LLM ストリーミング向けにオリジンタイムアウトを 60s に延長。
 * - 出力:
 *     - CfnOutput: DistributionId / DistributionDomainName / CustomDomainName / AssetsBucketName
 *     - SSM Parameter:
 *         - `/nagiyu/livetalk/{env}/cloudfront/distribution-id`
 *         - `/nagiyu/livetalk/{env}/cloudfront/domain-name`
 *         - `/nagiyu/livetalk/{env}/cloudfront/custom-domain`
 *         - `/nagiyu/livetalk/{env}/assets/bucket-name`
 *
 * リージョンは CloudFront 用 ACM の都合で `us-east-1` 固定。
 */
export class LiveTalkCloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly assetsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: LiveTalkCloudFrontStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Live2D モデル・Cubism Core 配信用 private S3 バケット。
    // reports-hosting-stack / storybook-stack と同様に CloudFront スタック内で S3 + OAC を一体管理する。
    this.assetsBucket = new s3.Bucket(this, 'AssetsBucket', {
      bucketName: `nagiyu-livetalk-assets-${environment}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const certificateArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_CERTIFICATE_ARN
    );
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn
    );

    const albDnsName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_DNS_NAME(environment)
    );

    const customDomain =
      environment === 'prod' ? 'live-talk.nagiyu.com' : 'dev-live-talk.nagiyu.com';
    const recordName = environment === 'prod' ? 'live-talk' : 'dev-live-talk';

    // CloudFront behavior のパスパターン /assets/* にマッチしたリクエストは
    // URI がそのまま S3 キーになるため /assets/ prefix を除去する必要がある。
    // 例: /assets/cubism-core/foo.js → /cubism-core/foo.js (S3 キー)
    const assetsUriRewrite = new cloudfront.Function(this, 'AssetsUriRewrite', {
      comment: '/assets/* リクエストから /assets prefix を除去して S3 キーにマッピング',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          "  request.uri = request.uri.replace(/^\\/assets/, '');",
          '  return request;',
          '}',
        ].join('\n')
      ),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `LiveTalk Service Distribution (${environment})`,
      domainNames: [customDomain],
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
          // LLM ストリーミング向けに延長。HttpOrigin の最大値は 60 秒。
          readTimeout: cdk.Duration.seconds(60),
          keepaliveTimeout: cdk.Duration.seconds(60),
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        compress: true,
      },
      additionalBehaviors: {
        '/assets/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.assetsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          functionAssociations: [
            {
              function: assetsUriRewrite,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
    });

    // Route53 hosted zone を SSM 経由で参照し、CloudFront 向け ALIAS A レコードを作成
    const hostedZoneId = ssm.StringParameter.valueForStringParameter(
      this,
      '/nagiyu/shared/route53/hosted-zone-id'
    );
    const hostedZoneName = ssm.StringParameter.valueForStringParameter(
      this,
      '/nagiyu/shared/route53/hosted-zone-name'
    );
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName: hostedZoneName,
    });

    new route53.ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      comment: `LiveTalk (${environment}) - alias to CloudFront`,
    });

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'LiveTalk CloudFront Distribution ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'LiveTalk CloudFront Distribution domain name (d*.cloudfront.net)',
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: customDomain,
      description: 'LiveTalk custom domain name',
    });

    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: this.assetsBucket.bucketName,
      description: 'LiveTalk assets S3 bucket name (Live2D models, Cubism Core)',
    });

    new ssm.StringParameter(this, 'DistributionIdParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_CLOUDFRONT_DISTRIBUTION_ID(environment),
      stringValue: this.distribution.distributionId,
      description: 'LiveTalk CloudFront Distribution ID',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'DistributionDomainNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_CLOUDFRONT_DOMAIN_NAME(environment),
      stringValue: this.distribution.distributionDomainName,
      description: 'LiveTalk CloudFront Distribution domain name',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'CustomDomainParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_CLOUDFRONT_CUSTOM_DOMAIN(environment),
      stringValue: customDomain,
      description: 'LiveTalk custom domain name (mapped via Route53 to this CloudFront)',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'AssetsBucketNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ASSETS_BUCKET_NAME(environment),
      stringValue: this.assetsBucket.bucketName,
      description: 'LiveTalk assets S3 bucket name',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}

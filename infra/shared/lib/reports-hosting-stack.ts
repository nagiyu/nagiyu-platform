import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface ReportsHostingStackProps extends cdk.StackProps {
  domainName: string;
}

const REPORTS_SUBDOMAIN = 'reports';
const REPORTS_BUCKET_NAME = 'nagiyu-e2e-reports';
const REPORTS_LIFECYCLE_DAYS = 3;

/**
 * E2E HTML レポートを reports.nagiyu.com で公開するためのホスティング基盤
 *
 * - S3 バケットに各サービスの Playwright HTML レポートを GitHub Actions から sync
 * - CloudFront + OAC 経由で公開（バケット自体は非公開）
 * - 既存の wildcard ACM 証明書（*.nagiyu.com）を流用
 * - 3 日経過したオブジェクトは自動削除（CI 再実行で再生成する運用）
 *
 * URL 体系:
 *   https://reports.nagiyu.com/{service}/pr-{pr-number}/{run-id}/{project}/index.html
 */
export class ReportsHostingStack extends cdk.Stack {
  public readonly bucket: s3.IBucket;
  public readonly distribution: cloudfront.IDistribution;

  constructor(scope: Construct, id: string, props: ReportsHostingStackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, 'ReportsBucket', {
      bucketName: REPORTS_BUCKET_NAME,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: false,
      lifecycleRules: [
        {
          id: 'DeleteAfter3Days',
          enabled: true,
          expiration: cdk.Duration.days(REPORTS_LIFECYCLE_DAYS),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const certificateArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_CERTIFICATE_ARN
    );
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // CloudFront の defaultRootObject はディストリビューションの root (`/`) にしか
    // 効かないため、`/foo/bar/` のようにサブディレクトリで終わるリクエストでは
    // S3 にそのままキーが渡されて AccessDenied になる。
    // Playwright HTML レポートは各ディレクトリに index.html がある構造なので、
    // 末尾が `/` のとき index.html を補完する CloudFront Function を挟む。
    const rewriteToIndexHtml = new cloudfront.Function(this, 'RewriteToIndexHtml', {
      comment: 'Append index.html to URIs ending with /',
      code: cloudfront.FunctionCode.fromInline(
        [
          'function handler(event) {',
          '  var request = event.request;',
          '  if (request.uri.endsWith("/")) {',
          '    request.uri += "index.html";',
          '  }',
          '  return request;',
          '}',
        ].join('\n')
      ),
    });

    const reportsDomain = `${REPORTS_SUBDOMAIN}.${props.domainName}`;

    this.distribution = new cloudfront.Distribution(this, 'ReportsDistribution', {
      comment: 'E2E Playwright HTML reports hosting',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [
          {
            function: rewriteToIndexHtml,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: 'index.html',
      domainNames: [reportsDomain],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    const hostedZoneId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID
    );
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId,
      zoneName: props.domainName,
    });

    new route53.ARecord(this, 'ReportsAliasRecord', {
      zone: hostedZone,
      recordName: REPORTS_SUBDOMAIN,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      comment: 'E2E reports hosting (alias to CloudFront)',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket for E2E HTML reports',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain for E2E reports',
    });

    new cdk.CfnOutput(this, 'ReportsDomain', {
      value: reportsDomain,
      description: 'Public domain for E2E reports',
    });
  }
}

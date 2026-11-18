import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  SSM_PARAMETERS,
  createCloudFrontAliasRecord,
  createResponseHeadersPolicy,
} from '@nagiyu/infra-common';

/**
 * UI Storybook Stack
 *
 * `libs/ui/storybook-static/` をビルド済み成果物として S3 に配置し、
 * CloudFront 経由で `storybook.dev.nagiyu.com` で配信する。
 *
 * 共有 ACM 証明書（`*.nagiyu.com` ワイルドカード、`infra/shared/lib/acm-stack.ts`
 * で発行済み）を SSM Parameter Store 経由で参照することで、本スタック単体での
 * 証明書発行を不要にする。
 *
 * Route53 hosted zone（`infra/shared/lib/route53-stack.ts` で管理）を SSM 経由で
 * 参照し、CloudFront へ向ける ALIAS A レコードを本スタック内で自動生成する。
 *
 * 配信先ドメイン: storybook.dev.nagiyu.com
 * - dev 環境のみ提供（本番環境は不要のため未対応）
 */
export interface StorybookStackProps extends cdk.StackProps {
  /**
   * 環境（現状 dev のみ。将来 prod を追加する場合の拡張余地として保持）
   */
  environment: 'dev';
}

export class StorybookStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorybookStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const domainName = 'storybook.dev.nagiyu.com';

    // Storybook 静的サイト配信用の S3 バケット
    this.bucket = new s3.Bucket(this, 'StorybookBucket', {
      bucketName: `nagiyu-ui-storybook-s3-${environment}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 共有 ACM 証明書（`*.nagiyu.com` ワイルドカード）を SSM 経由で参照
    const certificateArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_CERTIFICATE_ARN
    );
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // セキュリティヘッダーを付け、検索エンジンにインデックスさせない（Portal 以外は常に noindex）。
    // Storybook はストーリーを同じオリジンの iframe（iframe.html）で描くため、
    // DENY だと表示できない。SAMEORIGIN にとどめる。
    const securityHeadersPolicy = createResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `nagiyu-ui-storybook-security-headers-${environment}`,
      comment: `Security headers for ui-storybook service (${environment})`,
      securityHeaders: true,
      frameOption: 'SAMEORIGIN',
      noindex: true,
    });

    // CloudFront ディストリビューション
    // - S3 オリジン (Origin Access Control 自動構成)
    // - 静的サイト用キャッシュ最適化
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `UI Storybook Distribution (${environment})`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
      },
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      // dev 用途のためコスト優先で北米・ヨーロッパのみ
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responsePagePath: '/index.html',
          responseHttpStatus: 404,
          ttl: cdk.Duration.minutes(5),
        },
      ],
    });

    // Storybook 静的サイトの S3 へのデプロイ + CloudFront キャッシュ無効化
    // libs/ui/storybook-static/ にビルド成果物が存在する前提
    new s3deploy.BucketDeployment(this, 'StorybookDeployment', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../libs/ui/storybook-static'))],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      // 失敗してもログに出るようにメモリ・タイムアウトを少し余裕を持たせる
      memoryLimit: 1024,
    });

    createCloudFrontAliasRecord(this, 'AliasRecord', {
      distribution: this.distribution,
      recordName: 'storybook',
      comment: 'UI Storybook (dev) - alias to CloudFront',
    });

    // タグ付け
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'ui-storybook');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');

    // 出力
    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'Storybook 静的サイト配信用 S3 バケット名',
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront ディストリビューション ID',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront 配布ドメイン名',
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: domainName,
      description: 'Storybook カスタムドメイン名（Route53 ALIAS で自動構成）',
    });
  }
}

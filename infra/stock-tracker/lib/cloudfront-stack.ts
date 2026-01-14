import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

/**
 * Stock Tracker CloudFront Stack
 *
 * CDN 配信を担当します。
 */
export class CloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const { environment, functionUrl } = props;

    // Lambda Function URL からオリジンドメインを抽出
    const functionUrlDomain = functionUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // ドメイン名の設定
    const domainName =
      environment === 'prod'
        ? 'stock-tracker.nagiyu.com'
        : `${environment}-stock-tracker.nagiyu.com`;

    // ACM 証明書の参照（共有インフラで管理されているワイルドカード証明書）
    // Export 値: nagiyu-shared-acm-certificate-arn
    const certificateArn = cdk.Fn.importValue('nagiyu-shared-acm-certificate-arn');
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn
    );

    // CloudFront Distribution の作成
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(functionUrlDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // SSR のためキャッシュ無効
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      domainNames: [domainName],
      certificate,
      httpVersion: cloudfront.HttpVersion.HTTP2,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // 北米・ヨーロッパのみ
    });

    // タグの追加
    cdk.Tags.of(this.distribution).add('Application', 'nagiyu');
    cdk.Tags.of(this.distribution).add('Service', 'stock-tracker');
    cdk.Tags.of(this.distribution).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
      exportName: `${this.stackName}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution Domain Name',
      exportName: `${this.stackName}-DistributionDomainName`,
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: domainName,
      description: 'Custom Domain Name',
      exportName: `${this.stackName}-CustomDomainName`,
    });
  }
}

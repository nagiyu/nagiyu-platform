import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

export class CloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const { environment, functionUrl } = props;

    // ドメイン名の構築
    const domainName =
      environment === 'prod'
        ? 'admin.nagiyu.com'
        : `admin-${environment}.nagiyu.com`;

    // Lambda 関数 URL から https:// を除去してドメイン名を取得
    // CDK Token の場合は Fn::Select を使用
    const functionUrlDomain = cdk.Fn.select(
      1,
      cdk.Fn.split('//', functionUrl)
    );

    // さらに末尾のスラッシュを除去
    const cleanFunctionUrlDomain = cdk.Fn.select(
      0,
      cdk.Fn.split('/', functionUrlDomain)
    );

    // ACM 証明書の参照 (us-east-1 リージョン)
    // 注: CloudFront用の証明書は us-east-1 に存在する必要がある
    // 共有インフラスタック (infra/shared/acm) からエクスポートされた証明書を使用
    const certificateArn = cdk.Fn.importValue('nagiyu-shared-acm-certificate-arn');
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn
    );

    // Response Headers Policy の作成 (セキュリティヘッダー)
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'SecurityHeadersPolicy',
      {
        responseHeadersPolicyName: `nagiyu-admin-security-headers-${environment}`,
        comment: `Security headers for Admin service (${environment})`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.seconds(63072000),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: {
            override: true,
          },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
        },
      }
    );

    // CloudFront ディストリビューション
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Admin Service Distribution (${environment})`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(cleanFunctionUrlDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // 管理画面のためキャッシュ無効
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: responseHeadersPolicy,
        compress: true,
      },
      domainNames: [domainName],
      certificate: certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableIpv6: true,
      // dev 環境ではコスト削減のため PRICE_CLASS_100 を使用
      priceClass:
        environment === 'prod'
          ? cloudfront.PriceClass.PRICE_CLASS_ALL
          : cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // タグの追加
    cdk.Tags.of(this.distribution).add('Application', 'nagiyu');
    cdk.Tags.of(this.distribution).add('Service', 'admin');
    cdk.Tags.of(this.distribution).add('Environment', environment);

    // Outputs
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

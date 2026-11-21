import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS, createResponseHeadersPolicy } from '@nagiyu/infra-common';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
}

export class CloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Import ACM certificate ARN from SSM Parameter Store
    const certificateArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_CERTIFICATE_ARN
    );

    // Import ALB DNS name from SSM Parameter Store
    const albDnsName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ALB_DNS_NAME(environment as 'dev' | 'prod')
    );

    // Create certificate reference from ARN
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      certificateArn
    );

    // Import domain name based on environment
    const domainName = environment === 'prod' ? 'nagiyu.com' : 'dev.nagiyu.com';

    // セキュリティヘッダーを付ける。portal の prod は検索エンジンに載せるため noindex にしない
    const securityHeadersPolicy = createResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
      responseHeadersPolicyName: `nagiyu-portal-security-headers-${environment}`,
      comment: `Security headers for portal service (${environment})`,
      securityHeaders: true,
      noindex: false,
    });

    // Create CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `CloudFront distribution for nagiyu root domain (${environment})`,
      domainNames: [domainName],
      certificate: certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // North America & Europe
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      // CDK の既定値が変わっても値が動かないよう、現行の値を明記する
      enableIpv6: true,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: new origins.HttpOrigin(albDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
          httpPort: 80,
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy: securityHeadersPolicy,
      },
    });

    // Add tags
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'root-domain');

    // Exports
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID for root domain',
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront Distribution domain name (d*.cloudfront.net)',
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: domainName,
      description: 'Custom domain name for CloudFront',
    });
  }
}

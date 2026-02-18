import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../common/src/utils/ssm';

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

    // Import domain name from SSM Parameter Store
    const domainName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.ACM_DOMAIN_NAME
    );

    // Create CloudFront Distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `CloudFront distribution for nagiyu root domain (${environment})`,
      domainNames: [domainName],
      certificate: certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // North America & Europe
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
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

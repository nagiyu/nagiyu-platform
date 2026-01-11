import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
  certificateExportName?: string;
}

export class CloudFrontStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    super(scope, id, props);

    const { environment, functionUrl, certificateExportName } = props;

    // ドメイン名の構築
    const domainName =
      environment === 'prod' ? 'tools.nagiyu.com' : `${environment}-tools.nagiyu.com`;

    // Lambda 関数 URL から https:// を除去してドメイン名を取得
    // CDK Token の場合は Fn::Select を使用
    const functionUrlDomain = cdk.Fn.select(1, cdk.Fn.split('//', functionUrl));

    // さらに末尾のスラッシュを除去
    const cleanFunctionUrlDomain = cdk.Fn.select(0, cdk.Fn.split('/', functionUrlDomain));

    // ACM 証明書の参照 (us-east-1 リージョン)
    // 注: CloudFront用の証明書は us-east-1 に存在する必要がある
    // 共有インフラスタック (infra/shared/acm) からエクスポートされた証明書を使用
    const certExportName = certificateExportName || 'nagiyu-shared-acm-certificate-arn';
    const certificateArn = cdk.Fn.importValue(certExportName);
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // CloudFront ディストリビューション
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Tools Service Distribution (${environment})`,
      defaultBehavior: {
        origin: new origins.HttpOrigin(cleanFunctionUrlDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          httpsPort: 443,
          originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        // 元の CloudFormation テンプレートと同じ AWS マネージドポリシー ID を使用
        cachePolicy: cloudfront.CachePolicy.fromCachePolicyId(
          this,
          'CachingDisabledPolicy',
          '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
        ),
        originRequestPolicy: cloudfront.OriginRequestPolicy.fromOriginRequestPolicyId(
          this,
          'AllViewerExceptHostHeaderPolicy',
          'b689b0a8-53d0-40ab-baf2-68738e2966ac'
        ),
        compress: true,
      },
      domainNames: [domainName],
      certificate: certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    // タグの追加
    cdk.Tags.of(this.distribution).add('Application', 'nagiyu');
    cdk.Tags.of(this.distribution).add('Service', 'tools');
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

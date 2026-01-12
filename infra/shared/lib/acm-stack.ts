import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { EXPORTS } from '../libs/utils/exports';

export interface AcmStackProps extends cdk.StackProps {
  domainName: string;
}

export class AcmStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: AcmStackProps) {
    super(scope, id, props);

    // ACM 証明書作成
    // 既存の CloudFormation テンプレートと同じ順序を維持
    // プライマリドメイン: example.com
    // SANs: *.example.com
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: acm.CertificateValidation.fromDns(),
    });

    // 既存テンプレートと同じタグを追加
    cdk.Tags.of(this.certificate).add('Application', 'nagiyu');
    cdk.Tags.of(this.certificate).add('Purpose', 'SSL/TLS certificate for CloudFront');
    cdk.Tags.of(this.certificate).add('ManagedBy', 'CloudFormation');

    // Export（既存の名前を維持）
    new cdk.CfnOutput(this, 'CertificateArnExport', {
      value: this.certificate.certificateArn,
      exportName: EXPORTS.ACM_CERTIFICATE_ARN,
      description: 'ARN of the ACM certificate',
    });

    new cdk.CfnOutput(this, 'DomainNameExport', {
      value: props.domainName,
      exportName: EXPORTS.ACM_DOMAIN_NAME,
      description: 'Primary domain name',
    });

    new cdk.CfnOutput(this, 'WildcardDomainExport', {
      value: `*.${props.domainName}`,
      exportName: EXPORTS.ACM_WILDCARD_DOMAIN,
      description: 'Wildcard domain name',
    });
  }
}

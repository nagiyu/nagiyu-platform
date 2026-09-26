import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { SSM_PARAMETERS } from '../libs/utils/ssm';

export interface AcmStackProps extends cdk.StackProps {
  domainName: string;
  /**
   * DNS 検証に使うホストゾーン。
   * 指定した場合はそのゾーンで自動 DNS 検証する（dev アカウント: 同一アカウント内の
   * Route53Stack のホストゾーンを渡し、手動での検証レコード追加を不要にする）。
   * 未指定の場合は現行どおり `CertificateValidation.fromDns()`（手動 DNS 検証）を使う。
   */
  hostedZone?: route53.IHostedZone;
}

export class AcmStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: AcmStackProps) {
    super(scope, id, props);

    // ACM 証明書作成
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: props.hostedZone
        ? acm.CertificateValidation.fromDns(props.hostedZone)
        : acm.CertificateValidation.fromDns(),
    });

    // Export
    new cdk.CfnOutput(this, 'CertificateArnExport', {
      value: this.certificate.certificateArn,
      description: 'ARN of the ACM certificate',
    });

    new cdk.CfnOutput(this, 'DomainNameExport', {
      value: props.domainName,
      description: 'Primary domain name',
    });

    new cdk.CfnOutput(this, 'WildcardDomainExport', {
      value: `*.${props.domainName}`,
      description: 'Wildcard domain name',
    });

    new ssm.StringParameter(this, 'CertificateArnParam', {
      parameterName: SSM_PARAMETERS.ACM_CERTIFICATE_ARN,
      stringValue: this.certificate.certificateArn,
      description: 'ARN of the ACM certificate',
      tier: ssm.ParameterTier.STANDARD,
    });

    new ssm.StringParameter(this, 'DomainNameParam', {
      parameterName: SSM_PARAMETERS.ACM_DOMAIN_NAME,
      stringValue: props.domainName,
      description: 'Primary domain name',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}

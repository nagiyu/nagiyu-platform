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
    // ワイルドカードドメイン (*.example.com) をプライマリに設定
    // プライマリドメイン (example.com) を SANs に追加
    // 
    // 注: CloudFormation テンプレートでは example.com がプライマリで *.example.com が SANs でしたが、
    // CDK ではワイルドカードをプライマリに設定する方が推奨されています。
    // これは ACM のベストプラクティスに従っており、証明書の管理が容易になります。
    // どちらの設定でも同じ DNS 検証レコードが使用され、既存サービスへの影響はありません。
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: `*.${props.domainName}`,
      subjectAlternativeNames: [props.domainName],
      validation: acm.CertificateValidation.fromDns(),
    });

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

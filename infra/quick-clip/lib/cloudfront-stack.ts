import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontStackBase, CloudFrontStackBaseProps } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  functionUrl: string;
}

export class CloudFrontStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
      functionUrl,
      cloudfrontConfig: {
        // Route53/ACM は CloudFrontStackBase が参照する共通パラメータに依存する。
        // そのため quick-clip 側ではドメイン名のみ指定し、証明書/レコードは共有基盤設定に従う。
        domainName: environment === 'prod' ? 'quick-clip.nagiyu.com' : 'dev-quick-clip.nagiyu.com',
      },
    };

    super(scope, id, baseProps);

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
    });
  }
}

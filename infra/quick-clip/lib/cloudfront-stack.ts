import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontStackBase, CloudFrontStackBaseProps } from '@nagiyu/infra-common';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

export class CloudFrontStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig: {
        domainName: environment === 'prod' ? 'quick-clip.nagiyu.com' : 'dev-quick-clip.nagiyu.com',
      },
    };

    super(scope, id, baseProps);

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
    });
  }
}

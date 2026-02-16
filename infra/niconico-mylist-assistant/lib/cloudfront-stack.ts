import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontStackBase, CloudFrontStackBaseProps } from '@nagiyu/infra-common';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

/**
 * niconico-mylist-assistant サービス用の CloudFront スタック
 *
 * Lambda Function URL を Origin として CloudFront ディストリビューションを構築します。
 */
export class CloudFrontStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'niconico-mylist-assistant',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig:
        environment === 'prod'
          ? {
              priceClass: 'PriceClass_All',
            }
          : undefined,
    };

    super(scope, id, baseProps);
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontStackBase, CloudFrontStackBaseProps } from '@nagiyu/infra-common';

export interface CloudFrontLambdaStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

/**
 * Portal サービス用の CloudFront スタック（Lambda Function URL オリジン）
 *
 * ポータルはルートドメインのため domainName をオーバーライドする:
 * - dev: dev.nagiyu.com
 * - prod: nagiyu.com
 */
export class CloudFrontLambdaStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontLambdaStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const domainName = environment === 'prod' ? 'nagiyu.com' : 'dev.nagiyu.com';

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'portal',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig: {
        domainName,
        enableSecurityHeaders: true,
      },
    };

    super(scope, id, baseProps);
  }
}

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CloudFrontStackBase, CloudFrontStackBaseProps } from '@nagiyu/infra-common';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: string;
  functionUrl: string;
}

/**
 * Stock Tracker CloudFront Stack
 *
 * CDN 配信を担当します。
 * 共通基盤の CloudFrontStackBase を使用してメンテナンス性を向上。
 */
export class CloudFrontStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'stock-tracker',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig: {
        // セキュリティヘッダーを有効化
        enableSecurityHeaders: true,
      },
      certificateArn: cdk.Fn.importValue('nagiyu-shared-acm-certificate-arn'),
    };

    super(scope, id, baseProps);
  }
}

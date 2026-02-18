import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
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
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig: {
        // セキュリティヘッダーを有効化（新規追加）
        enableSecurityHeaders: true,
      },
    };

    super(scope, id, baseProps);

    // 既存のキャッシュポリシーを使用するため、distributionをオーバーライド
    // 注: CloudFrontStackBaseが作成したdistributionをそのまま使用
    // AWS managed cache policy: CACHING_DISABLED
    // AWS managed origin request policy: ALL_VIEWER_EXCEPT_HOST_HEADER
  }
}

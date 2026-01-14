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
      serviceName: 'auth',
      environment: environment as 'dev' | 'prod',
      functionUrl,
      cloudfrontConfig: {
        // セキュリティヘッダーを有効化（既に有効だったものを維持）
        enableSecurityHeaders: true,
        // dev 環境ではコスト削減のため PRICE_CLASS_100 を使用
        priceClass: environment === 'prod' ? 'PriceClass_All' : 'PriceClass_100',
        // HTTP/3 を有効化（既存設定を維持）
        enableHttp3: true,
      },
    };

    super(scope, id, baseProps);
  }
}

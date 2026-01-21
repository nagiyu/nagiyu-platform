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
      cloudfrontConfig: {
        // セキュリティヘッダーを有効化
        enableSecurityHeaders: true,
        // dev 環境ではコスト削減のため PRICE_CLASS_100 を使用
        priceClass: environment === 'prod' ? 'PriceClass_All' : 'PriceClass_100',
        // HTTP/3 を有効化
        enableHttp3: true,
      },
    };

    super(scope, id, baseProps);
  }
}

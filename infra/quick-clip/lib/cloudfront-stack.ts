import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import {
  CloudFrontStackBase,
  CloudFrontStackBaseProps,
  getCloudFrontDomainName,
} from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

export interface CloudFrontStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  functionUrl: string;
}

/** 接続元 IP をオリジンへ渡すヘッダー名。web の client-ip.ts が同じ名前を読む */
export const VIEWER_IP_HEADER_NAME = 'x-nagiyu-viewer-ip';

export class CloudFrontStack extends CloudFrontStackBase {
  constructor(scope: Construct, id: string, props: CloudFrontStackProps) {
    const { environment, functionUrl, ...stackProps } = props;

    const baseProps: CloudFrontStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
      functionUrl,
      // Lambda Function URL がオリジンのため、Host を送らない ALL_VIEWER_EXCEPT_HOST_HEADER を使う。
      // このポリシーは CloudFront-Viewer-Address を送れないので、viewer-request で接続元 IP を
      // 専用ヘッダーに載せる。利用者が同名ヘッダーを送ってきても、ここで必ず上書きして偽装を防ぐ。
      createFunctionAssociations: (stack) => [
        {
          function: new cloudfront.Function(stack, 'ViewerIpFunction', {
            comment: '接続元 IP を専用ヘッダーに上書きしてオリジンへ渡す',
            code: cloudfront.FunctionCode.fromInline(
              [
                'function handler(event) {',
                '  var request = event.request;',
                `  request.headers['${VIEWER_IP_HEADER_NAME}'] = { value: event.viewer.ip };`,
                '  return request;',
                '}',
              ].join('\n')
            ),
          }),
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        },
      ],
      cloudfrontConfig: {
        // Route53/ACM は CloudFrontStackBase が参照する共通パラメータに依存する。
        // そのため quick-clip 側ではドメイン名のみ指定し、証明書/レコードは共有基盤設定に従う。
        domainName: getCloudFrontDomainName('quick-clip', environment),
        // 検索エンジンにインデックスさせない（Portal 以外は常に noindex）
        noindex: true,
      },
    };

    super(scope, id, baseProps);

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
    });
  }
}

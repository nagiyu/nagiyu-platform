import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export interface PortalLambdaStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Portal サービス用の Lambda スタック（Dev 環境専用）
 */
export class PortalLambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: PortalLambdaStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'portal',
      environment: environment as 'dev' | 'prod',
      lambdaConfig: {
        // CloudFormation 管理外の同名ロググループが既にあり、LogGroup を作ると名前が衝突するため
        // 既存のものを引き継ぐ。この関数が既存だから付けているもので、新しい関数では付けない。
        adoptExistingLogGroup: true,
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
        },
      },
      enableFunctionUrl: true,
      functionUrlCorsConfig: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    };

    super(scope, id, baseProps);
  }
}

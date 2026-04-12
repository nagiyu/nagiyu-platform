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

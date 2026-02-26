import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  appVersion: string;
}

/**
 * Tools サービス用の Lambda スタック
 */
export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, appVersion, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      lambdaConfig: {
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          APP_VERSION: appVersion,
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

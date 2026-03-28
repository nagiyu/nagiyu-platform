import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';
import type { QuickClipEnvironment } from './environment';

const QUICK_CLIP_ALLOWED_ORIGINS: Record<QuickClipEnvironment, string[]> = {
  prod: ['https://quick-clip.nagiyu.com'],
  dev: ['https://dev-quick-clip.nagiyu.com'],
};

export interface LambdaStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  appVersion: string;
  webEcrRepositoryName: string;
}

export class LambdaStack extends LambdaStackBase {
  public readonly webFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, appVersion, webEcrRepositoryName, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'quick-clip',
      environment,
      ecrRepositoryName: webEcrRepositoryName,
      lambdaConfig: {
        functionName: `nagiyu-quick-clip-web-${environment}`,
        logicalId: 'WebFunction',
        memorySize: 1024,
        timeout: 30,
        environment: {
          // NODE_ENV は Node.js/Next.js の最適化・挙動切替用（production/development 固定値）、
          // DEPLOY_ENV はアプリ内で dev/prod 判定を行うためのデプロイ環境識別子として利用する。
          NODE_ENV: environment === 'prod' ? 'production' : 'development',
          DEPLOY_ENV: environment,
          APP_VERSION: appVersion,
        },
      },
      enableFunctionUrl: true,
      functionUrlCorsConfig: {
        allowedOrigins: QUICK_CLIP_ALLOWED_ORIGINS[environment],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.days(1),
      },
    };

    super(scope, id, baseProps);

    this.webFunction = this.lambdaFunction;

    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
    });
  }
}

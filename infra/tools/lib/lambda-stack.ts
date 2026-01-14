import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Tools サービス用の Lambda スタック
 *
 * 既存の CloudFormation スタックとの互換性を保つため、
 * 論理ID を 'ToolsFunction' に指定しています。
 */
export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      ecrRepositoryName: `tools-app-${environment}`,
      lambdaConfig: {
        // リソース名を既存の `tools-app-{env}` から統一命名規則に移行
        // 注意: これによりリソース名が変更されます
        // tools-app-dev -> nagiyu-tools-lambda-dev
        functionName: `tools-app-${environment}`,
        // 既存の CloudFormation リソースとの互換性を保つため、論理IDと実行ロール名を指定
        logicalId: 'ToolsFunction',
        executionRoleName: `tools-lambda-execution-role-${environment}`,
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: 'production',
          APP_VERSION: '1.0.0',
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

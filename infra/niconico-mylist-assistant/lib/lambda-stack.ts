import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * niconico-mylist-assistant サービス用の Lambda スタック
 *
 * Next.js アプリケーションを Lambda 関数としてデプロイし、
 * DynamoDB へのアクセス権限を付与します。
 */
export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, ...stackProps } = props;

    // DynamoDB アクセス権限の定義
    const additionalPolicyStatements = [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [
          // DynamoDB テーブル
          `arn:aws:dynamodb:*:*:table/nagiyu-niconico-mylist-assistant-${environment}`,
          // GSI1 インデックス
          `arn:aws:dynamodb:*:*:table/nagiyu-niconico-mylist-assistant-${environment}/index/*`,
        ],
      }),
    ];

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'niconico-mylist-assistant-web',
      environment: environment as 'dev' | 'prod',
      ecrRepositoryName: `niconico-mylist-assistant-web-${environment}`,
      lambdaConfig: {
        functionName: `niconico-mylist-assistant-web-${environment}`,
        memorySize: 1024,
        timeout: 30,
        environment: {
          NODE_ENV: 'production',
          DYNAMODB_TABLE_NAME: `nagiyu-niconico-mylist-assistant-${environment}`,
        },
      },
      additionalPolicyStatements,
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

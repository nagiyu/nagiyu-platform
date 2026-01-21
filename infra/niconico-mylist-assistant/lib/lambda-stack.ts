import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps, getDynamoDBTableName } from '@nagiyu/infra-common';

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

    const env = environment as 'dev' | 'prod';
    const tableName = getDynamoDBTableName('niconico-mylist-assistant', env);

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
          `arn:aws:dynamodb:*:*:table/${tableName}`,
          // GSI1 インデックス
          `arn:aws:dynamodb:*:*:table/${tableName}/index/*`,
        ],
      }),
    ];

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'niconico-mylist-assistant-web',
      environment: env,
      lambdaConfig: {
        memorySize: 1024,
        environment: {
          NODE_ENV: 'production',
          DYNAMODB_TABLE_NAME: tableName,
        },
      },
      additionalPolicyStatements,
    };

    super(scope, id, baseProps);
  }
}

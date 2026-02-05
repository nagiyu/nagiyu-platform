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
 * Auth サービス用の Lambda スタック
 *
 * 既存の CloudFormation スタックとの互換性を保つため、
 * 論理ID を 'AuthFunction' に指定しています。
 */
export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, appVersion, ...stackProps } = props;

    // CDK context から secrets を取得（未指定の場合はプレースホルダーを使用）
    const googleClientId = scope.node.tryGetContext('googleClientId') || 'PLACEHOLDER_CLIENT_ID';
    const googleClientSecret =
      scope.node.tryGetContext('googleClientSecret') || 'PLACEHOLDER_CLIENT_SECRET';
    const nextAuthSecret =
      scope.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER_NEXTAUTH_SECRET';

    // NEXTAUTH_URL の構築
    const nextAuthUrl =
      environment === 'prod' ? 'https://auth.nagiyu.com' : `https://${environment}-auth.nagiyu.com`;

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
          // リージョンとアカウントIDは Lambda Stack 内で解決される
          `arn:aws:dynamodb:*:*:table/nagiyu-auth-users-${environment}`,
          `arn:aws:dynamodb:*:*:table/nagiyu-auth-users-${environment}/index/*`,
        ],
      }),
    ];

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'auth',
      environment: environment as 'dev' | 'prod',
      ecrRepositoryName: `nagiyu-auth-${environment}`,
      lambdaConfig: {
        // 既存のリソース名を維持: nagiyu-auth-{env}
        functionName: `nagiyu-auth-${environment}`,
        // 既存の CloudFormation リソースとの互換性を保つため、論理IDを指定
        logicalId: 'AuthFunction',
        memorySize: 512,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          DYNAMODB_TABLE_NAME: `nagiyu-auth-users-${environment}`,
          APP_VERSION: appVersion,
          // NextAuth v5 環境変数
          AUTH_URL: nextAuthUrl,
          AUTH_SECRET: nextAuthSecret,
          AUTH_TRUST_HOST: 'true',
          // Google OAuth
          GOOGLE_CLIENT_ID: googleClientId,
          GOOGLE_CLIENT_SECRET: googleClientSecret,
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

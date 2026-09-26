import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import {
  LambdaStackBase,
  LambdaStackBaseProps,
  grantErrorEventsWrite,
  getServiceUrl,
} from '@nagiyu/infra-common';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  appVersion: string;
}

/**
 * Auth サービス用の Lambda スタック
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
    const nextAuthUrl = getServiceUrl('auth', environment as 'dev' | 'prod');

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
      lambdaConfig: {
        memorySize: 512,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          // NAGIYU_ENV: NextAuth の Cookie ドメイン判定用。NODE_ENV は Next.js のビルド時に
          // 'production' へ静的置換されるため、デプロイ後の dev/prod 判定には使えない
          // （libs/nextjs/src/auth-config.ts 参照）。
          NAGIYU_ENV: environment,
          DYNAMODB_TABLE_NAME: `nagiyu-auth-users-${environment}`,
          APP_VERSION: appVersion,
          // NextAuth v5 環境変数
          AUTH_URL: nextAuthUrl,
          AUTH_SECRET: nextAuthSecret,
          AUTH_TRUST_HOST: 'true',
          // Google OAuth
          GOOGLE_CLIENT_ID: googleClientId,
          GOOGLE_CLIENT_SECRET: googleClientSecret,
          ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${environment}`,
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

    grantErrorEventsWrite(this, this.executionRole, environment as 'dev' | 'prod');
  }
}

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, ...stackProps } = props;

    // CDK context から secrets を取得
    // 未指定の場合はプレースホルダーを使用（deploy ジョブで実際の値に更新される）
    const nextAuthSecret = scope.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER';

    // Auth サービスの URL
    const authUrl =
      environment === 'prod'
        ? 'https://auth.nagiyu.com'
        : `https://${environment}-auth.nagiyu.com`;

    // Admin サービスの URL (自分自身)
    const adminUrl =
      environment === 'prod'
        ? 'https://admin.nagiyu.com'
        : `https://${environment}-admin.nagiyu.com`;

    // Secrets Manager アクセス権限の定義
    // Admin サービスが Auth サービスの NEXTAUTH_SECRET にアクセス
    const additionalPolicyStatements = [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          // リージョンとアカウントIDは Lambda Stack 内で解決される
          `arn:aws:secretsmanager:*:*:secret:nagiyu-auth-nextauth-secret-${environment}-*`,
        ],
      }),
    ];

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'admin',
      environment: environment as 'dev' | 'prod',
      ecrRepositoryName: `nagiyu-admin-${environment}`,
      lambdaConfig: {
        // 既存のリソース名を維持: nagiyu-admin-{env}
        functionName: `nagiyu-admin-${environment}`,
        memorySize: 512,
        timeout: 30,
        environment: {
          NODE_ENV: environment,
          // NextAuth v5 で使用される環境変数
          AUTH_SECRET: nextAuthSecret,
          // 自サービスのベース URL（callbackUrl 生成などに使用）
          APP_URL: adminUrl,
          // Auth サービスの URL（OAuth 認証のリダイレクト先）
          NEXT_PUBLIC_AUTH_URL: authUrl,
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

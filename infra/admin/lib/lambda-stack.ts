import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
}

export class LambdaStack extends cdk.Stack {
  public readonly lambdaFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { environment } = props;
    const region = this.region;
    const account = this.account;

    // CDK context から secrets を取得
    // 未指定の場合はプレースホルダーを使用（deploy ジョブで実際の値に更新される）
    const nextAuthSecret = scope.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER';

    // Lambda 実行ロールの作成
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for Admin Lambda function (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // Secrets Manager アクセス権限
    // Admin サービスが Auth サービスの NEXTAUTH_SECRET にアクセス
    // （Admin と Auth で同じ NextAuth シークレットを共有）
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${region}:${account}:secret:nagiyu-auth-nextauth-secret-${environment}-*`,
        ],
      })
    );

    // NEXTAUTH_URL の構築
    const nextAuthUrl =
      environment === 'prod'
        ? 'https://auth.nagiyu.com'
        : `https://${environment}-auth.nagiyu.com`;

    // NEXT_PUBLIC_AUTH_URL の構築
    const nextPublicAuthUrl = nextAuthUrl;

    // ECR リポジトリの参照
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      `nagiyu-admin-${environment}`
    );

    // Lambda 関数の作成
    this.lambdaFunction = new lambda.Function(this, 'AdminFunction', {
      functionName: `nagiyu-admin-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(repository, {
        tagOrDigest: 'latest',
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      architecture: lambda.Architecture.X86_64,
      role: lambdaRole,
      environment: {
        NODE_ENV: environment,
        // NextAuth v5 では AUTH_SECRET が必要
        AUTH_SECRET: nextAuthSecret,
        NEXT_PUBLIC_AUTH_URL: nextPublicAuthUrl,
      },
      description: `Admin Service Lambda function for ${environment} environment`,
    });

    // Lambda 関数 URL の作成
    this.functionUrl = this.lambdaFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });

    // Lambda Function URL への公開アクセスを許可
    this.lambdaFunction.addPermission('AllowPublicAccess', {
      principal: new iam.ServicePrincipal('*'),
      action: 'lambda:InvokeFunctionUrl',
      functionUrlAuthType: lambda.FunctionUrlAuthType.NONE,
    });

    // タグの追加
    cdk.Tags.of(this.lambdaFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.lambdaFunction).add('Service', 'admin');
    cdk.Tags.of(this.lambdaFunction).add('Environment', environment);

    // Outputs
    new cdk.CfnOutput(this, 'FunctionName', {
      value: this.lambdaFunction.functionName,
      description: 'Lambda Function Name',
      exportName: `${this.stackName}-FunctionName`,
    });

    new cdk.CfnOutput(this, 'FunctionArn', {
      value: this.lambdaFunction.functionArn,
      description: 'Lambda Function ARN',
      exportName: `${this.stackName}-FunctionArn`,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Lambda Function URL',
      exportName: `${this.stackName}-FunctionUrl`,
    });

    new cdk.CfnOutput(this, 'RoleArn', {
      value: lambdaRole.roleArn,
      description: 'Lambda Execution Role ARN',
      exportName: `${this.stackName}-RoleArn`,
    });
  }
}

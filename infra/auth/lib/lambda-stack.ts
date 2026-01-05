import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
    const googleClientId = scope.node.tryGetContext('googleClientId');
    const googleClientSecret = scope.node.tryGetContext('googleClientSecret');
    const nextAuthSecret = scope.node.tryGetContext('nextAuthSecret');

    // secrets が未指定の場合はエラー
    if (!googleClientId || !googleClientSecret || !nextAuthSecret) {
      throw new Error(
        'Missing required context: googleClientId, googleClientSecret, or nextAuthSecret. ' +
          'Please provide them via --context flags or cdk.json'
      );
    }

    // Lambda 実行ロールの作成
    const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for Auth Lambda function (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // DynamoDB アクセス権限
    lambdaRole.addToPolicy(
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
          `arn:aws:dynamodb:${region}:${account}:table/nagiyu-auth-users-${environment}`,
          `arn:aws:dynamodb:${region}:${account}:table/nagiyu-auth-users-${environment}/index/*`,
        ],
      })
    );

    // NEXTAUTH_URL の構築
    const nextAuthUrl =
      environment === 'prod'
        ? 'https://auth.nagiyu.com'
        : `https://${environment}-auth.nagiyu.com`;

    // ECR リポジトリの参照
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'EcrRepository',
      `nagiyu-auth-${environment}`
    );

    // Lambda 関数の作成
    this.lambdaFunction = new lambda.Function(this, 'AuthFunction', {
      functionName: `nagiyu-auth-${environment}`,
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
        DYNAMODB_TABLE_NAME: `nagiyu-auth-users-${environment}`,
        NEXTAUTH_URL: nextAuthUrl,
        // CDK context から取得した値を環境変数に設定
        NEXTAUTH_SECRET: nextAuthSecret,
        GOOGLE_CLIENT_ID: googleClientId,
        GOOGLE_CLIENT_SECRET: googleClientSecret,
      },
      description: `Auth Service Lambda function for ${environment} environment`,
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
    cdk.Tags.of(this.lambdaFunction).add('Service', 'auth');
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

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { WebRuntimePolicy } from './policies/web-runtime-policy';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  webEcrRepositoryName: string;
  dynamoTable: dynamodb.ITable;
  nextAuthSecret: string; // NextAuth Secret (Auth サービスから取得)
}

/**
 * Niconico Mylist Assistant Lambda Stack
 *
 * Web Lambda（Next.js）を作成します。
 * また、マネージドポリシー（WebRuntimePolicy）を作成し、
 * Lambda 実行ロールと開発用 IAM ユーザー（別スタック）で共有します。
 */
export class LambdaStack extends cdk.Stack {
  public readonly webFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;
  public readonly webRuntimePolicy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const { environment, webEcrRepositoryName, dynamoTable, nextAuthSecret } = props;

    // ECR リポジトリの参照
    const webRepository = ecr.Repository.fromRepositoryName(
      this,
      'WebRepository',
      webEcrRepositoryName
    );

    // マネージドポリシーの作成
    // Web Lambda と開発用 IAM ユーザーで共有
    this.webRuntimePolicy = new WebRuntimePolicy(this, 'WebRuntimePolicy', {
      dynamoTable,
      envName: environment,
    });

    // Web Lambda 用の実行ロール
    const webExecutionRole = new iam.Role(this, 'WebExecutionRole', {
      roleName: `niconico-mylist-assistant-web-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
        this.webRuntimePolicy,
      ],
    });

    // Web Lambda Function の作成
    this.webFunction = new lambda.Function(this, 'WebFunction', {
      functionName: `niconico-mylist-assistant-web-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(webRepository, {
        tagOrDigest: 'latest',
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: webExecutionRole,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: 'production',
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        AUTH_URL: environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
        NEXT_PUBLIC_AUTH_URL: environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
        APP_URL: environment === 'prod' ? 'https://niconico-mylist-assistant.nagiyu.com' : 'https://dev-niconico-mylist-assistant.nagiyu.com',
        AUTH_SECRET: nextAuthSecret,
      },
      tracing: lambda.Tracing.ACTIVE, // X-Ray トレーシング有効化
      logRetention: logs.RetentionDays.ONE_MONTH, // CloudWatch Logs 保持期間: 30日
    });

    // Function URL の作成（Lambda Web Adapter 用）
    this.functionUrl = this.webFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
        maxAge: cdk.Duration.seconds(86400),
      },
    });

    // タグの追加
    cdk.Tags.of(this.webFunction).add('Application', 'nagiyu');
    cdk.Tags.of(this.webFunction).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this.webFunction).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
      exportName: `${this.stackName}-WebFunctionArn`,
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Web Lambda Function URL',
      exportName: `${this.stackName}-FunctionUrl`,
    });

    // Runtime Policy (IAM スタックで参照するため Export)
    new cdk.CfnOutput(this, 'WebRuntimePolicyArn', {
      value: this.webRuntimePolicy.managedPolicyArn,
      description: 'Web Runtime Managed Policy ARN',
      exportName: `${this.stackName}-WebRuntimePolicyArn`,
    });
  }
}

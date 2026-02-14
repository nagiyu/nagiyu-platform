import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { WebRuntimePolicy } from './policies/web-runtime-policy';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  webEcrRepositoryName: string;
  dynamoTable: dynamodb.ITable;
  nextAuthSecret: string; // NextAuth Secret (Auth サービスから取得)
  batchJobQueueArn: string; // Batch Job Queue ARN
  batchJobDefinitionArn: string; // Batch Job Definition ARN
  encryptionSecretArn: string; // Encryption Secret ARN
  encryptionSecretName: string; // Encryption Secret Name
  vapidSecretArn: string; // VAPID Secret ARN
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

    const {
      environment,
      webEcrRepositoryName,
      dynamoTable,
      nextAuthSecret,
      batchJobQueueArn,
      batchJobDefinitionArn,
      encryptionSecretArn,
      encryptionSecretName,
      vapidSecretArn,
    } = props;

    // Auth URL configuration
    const authUrl =
      environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com';
    const appUrl =
      environment === 'prod'
        ? 'https://niconico-mylist-assistant.nagiyu.com'
        : 'https://dev-niconico-mylist-assistant.nagiyu.com';

    // VAPID Secret の参照
    const vapidSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'VapidSecret',
      vapidSecretArn
    );

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
      batchJobQueueArn,
      batchJobDefinitionArn,
      encryptionSecretArn,
      vapidSecretArn,
    });

    // Web Lambda 用の実行ロール
    const webExecutionRole = new iam.Role(this, 'WebExecutionRole', {
      roleName: `niconico-mylist-assistant-web-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
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
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        AUTH_URL: authUrl,
        NEXT_PUBLIC_AUTH_URL: authUrl,
        APP_URL: appUrl,
        AUTH_SECRET: nextAuthSecret,
        BATCH_JOB_QUEUE: batchJobQueueArn,
        BATCH_JOB_DEFINITION: batchJobDefinitionArn,
        ENCRYPTION_SECRET_NAME: encryptionSecretName,
        AWS_REGION_FOR_SDK: this.region,
        VAPID_PUBLIC_KEY: vapidSecret.secretValueFromJson('publicKey').unsafeUnwrap(),
        VAPID_PRIVATE_KEY: vapidSecret.secretValueFromJson('privateKey').unsafeUnwrap(),
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
    cdk.Tags.of(this.webFunction).add('Temp', 'Temp');

    // CloudFormation Outputs
    // Note: exportName is intentionally NOT used to allow flexible updates
    // CDK handles cross-stack references automatically
    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Web Lambda Function URL',
    });

    // Runtime Policy (IAM スタックで参照するため)
    new cdk.CfnOutput(this, 'WebRuntimePolicyArn', {
      value: this.webRuntimePolicy.managedPolicyArn,
      description: 'Web Runtime Managed Policy ARN',
    });
  }
}

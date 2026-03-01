import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { WebRuntimePolicy } from './policies/web-runtime-policy';
import { BatchRuntimePolicy } from './policies/batch-runtime-policy';

export interface LambdaStackProps extends cdk.StackProps {
  environment: string;
  appVersion: string;
  webEcrRepositoryName: string;
  batchEcrRepositoryName: string;
  dynamoTable: dynamodb.ITable;
  vapidSecret: secretsmanager.ISecret;
  vapidPublicKey: string; // VAPID 公開鍵（デプロイ時に Secrets Manager から取得）
  vapidPrivateKey: string; // VAPID 秘密鍵（デプロイ時に Secrets Manager から取得）
  nextAuthSecret: string; // NextAuth Secret (Auth サービスから取得)
}

/**
 * Stock Tracker Lambda Stack
 *
 * Web Lambda 1関数と Batch Lambda 4関数（minute, hourly, summary, daily）の合計5関数を作成します。
 * また、マネージドポリシー（WebRuntimePolicy, BatchRuntimePolicy）を作成し、
 * Lambda 実行ロールと開発用 IAM ユーザー（別スタック）で共有します。
 */
export class LambdaStack extends cdk.Stack {
  public readonly webFunction: lambda.Function;
  public readonly batchMinuteFunction: lambda.Function;
  public readonly batchHourlyFunction: lambda.Function;
  public readonly batchSummaryFunction: lambda.Function;
  public readonly batchDailyFunction: lambda.Function;
  public readonly functionUrl: lambda.FunctionUrl;
  public readonly webRuntimePolicy: iam.IManagedPolicy;
  public readonly batchRuntimePolicy: iam.IManagedPolicy;

  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const {
      environment,
      appVersion,
      webEcrRepositoryName,
      batchEcrRepositoryName,
      dynamoTable,
      vapidSecret,
      vapidPublicKey,
      vapidPrivateKey,
      nextAuthSecret,
    } = props;

    // ECR リポジトリの参照
    const webRepository = ecr.Repository.fromRepositoryName(
      this,
      'WebRepository',
      webEcrRepositoryName
    );
    const batchRepository = ecr.Repository.fromRepositoryName(
      this,
      'BatchRepository',
      batchEcrRepositoryName
    );

    // マネージドポリシーの作成
    // Web Lambda と開発用 IAM ユーザーで共有
    this.webRuntimePolicy = new WebRuntimePolicy(this, 'WebRuntimePolicy', {
      dynamoTable,
      vapidSecret,
      envName: environment,
    });

    // Batch Lambda と開発用 IAM ユーザーで共有
    this.batchRuntimePolicy = new BatchRuntimePolicy(this, 'BatchRuntimePolicy', {
      dynamoTable,
      vapidSecret,
      envName: environment,
    });

    // Web Lambda 用の実行ロール
    const webExecutionRole = new iam.Role(this, 'WebExecutionRole', {
      roleName: `nagiyu-stock-tracker-web-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        this.webRuntimePolicy,
      ],
    });

    // Web Lambda Function の作成
    this.webFunction = new lambda.Function(this, 'WebFunction', {
      functionName: `nagiyu-stock-tracker-web-${environment}`,
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
        APP_VERSION: appVersion,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        AUTH_URL:
          environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
        NEXT_PUBLIC_AUTH_URL:
          environment === 'prod' ? 'https://auth.nagiyu.com' : 'https://dev-auth.nagiyu.com',
        APP_URL:
          environment === 'prod'
            ? 'https://stock-tracker.nagiyu.com'
            : 'https://dev-stock-tracker.nagiyu.com',
        AUTH_SECRET: nextAuthSecret,
        STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME: `nagiyu-stock-tracker-batch-summary-${environment}`,
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

    // Batch Lambda 用の実行ロール
    const batchExecutionRole = new iam.Role(this, 'BatchExecutionRole', {
      roleName: `nagiyu-stock-tracker-batch-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        this.batchRuntimePolicy,
      ],
    });

    // Batch Lambda - Minute（1分間隔、MINUTE_LEVEL アラート処理）
    this.batchMinuteFunction = new lambda.Function(this, 'BatchMinuteFunction', {
      functionName: `nagiyu-stock-tracker-batch-minute-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/stock-tracker/batch/dist/minute.handler'],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: batchExecutionRole,
      memorySize: 512,
      timeout: cdk.Duration.seconds(50),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        BATCH_TYPE: 'MINUTE',
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Batch Lambda - Hourly（1時間間隔、HOURLY_LEVEL アラート処理）
    this.batchHourlyFunction = new lambda.Function(this, 'BatchHourlyFunction', {
      functionName: `nagiyu-stock-tracker-batch-hourly-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/stock-tracker/batch/dist/hourly.handler'],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: batchExecutionRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        BATCH_TYPE: 'HOURLY',
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Batch Lambda - Summary（1時間間隔、日次サマリー生成）
    this.batchSummaryFunction = new lambda.Function(this, 'BatchSummaryFunction', {
      functionName: `nagiyu-stock-tracker-batch-summary-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/stock-tracker/batch/dist/summary.handler'],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: batchExecutionRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(5),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        BATCH_TYPE: 'SUMMARY',
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // Batch Lambda - Daily（日次、データクリーンアップ）
    this.batchDailyFunction = new lambda.Function(this, 'BatchDailyFunction', {
      functionName: `nagiyu-stock-tracker-batch-daily-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/stock-tracker/batch/dist/daily.handler'],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: batchExecutionRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(10),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTable.tableName,
        BATCH_TYPE: 'DAILY',
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // タグの追加
    [
      this.webFunction,
      this.batchMinuteFunction,
      this.batchHourlyFunction,
      this.batchSummaryFunction,
      this.batchDailyFunction,
    ].forEach((fn) => {
      cdk.Tags.of(fn).add('Application', 'nagiyu');
      cdk.Tags.of(fn).add('Service', 'stock-tracker');
      cdk.Tags.of(fn).add('Environment', environment);
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'WebFunctionArn', {
      value: this.webFunction.functionArn,
      description: 'Web Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: this.functionUrl.url,
      description: 'Web Lambda Function URL',
    });

    new cdk.CfnOutput(this, 'BatchMinuteFunctionArn', {
      value: this.batchMinuteFunction.functionArn,
      description: 'Batch Minute Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'BatchHourlyFunctionArn', {
      value: this.batchHourlyFunction.functionArn,
      description: 'Batch Hourly Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'BatchSummaryFunctionArn', {
      value: this.batchSummaryFunction.functionArn,
      description: 'Batch Summary Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'BatchDailyFunctionArn', {
      value: this.batchDailyFunction.functionArn,
      description: 'Batch Daily Lambda Function ARN',
    });

    // Runtime Policies (IAM スタックで参照するため Export)
    new cdk.CfnOutput(this, 'WebRuntimePolicyArn', {
      value: this.webRuntimePolicy.managedPolicyArn,
      description: 'Web Runtime Managed Policy ARN',
    });

    new cdk.CfnOutput(this, 'BatchRuntimePolicyArn', {
      value: this.batchRuntimePolicy.managedPolicyArn,
      description: 'Batch Runtime Managed Policy ARN',
    });
  }
}

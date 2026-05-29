import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { getDynamoDBTableArn, getDynamoDBTableName, grantErrorEventsWrite } from '@nagiyu/infra-common';
import type { Environment } from '@nagiyu/infra-common';

export interface LiveTalkBatchStackProps extends cdk.StackProps {
  environment: Environment;
  batchEcrRepositoryName: string;
  openAiApiKey: string;
}

/**
 * LiveTalk バッチ処理スタック（Phase 3c / Issue #3281）
 *
 * 日次で全ユーザーの会話を圧縮要約する Lambda を作成する。
 * - EventBridge: JST 03:00（UTC 18:00）に日次実行
 * - Lambda: FROM_IMAGE / 512MB / 15 分タイムアウト
 * - DLQ: 失敗時のデッドレター保持（7 日）
 * - IAM: DynamoDB 読み書き + CloudWatch Logs
 */
export class LiveTalkBatchStack extends cdk.Stack {
  public readonly batchFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LiveTalkBatchStackProps) {
    super(scope, id, props);

    const { environment, batchEcrRepositoryName, openAiApiKey } = props;

    // ECR リポジトリの参照
    const batchRepository = ecr.Repository.fromRepositoryName(
      this,
      'BatchRepository',
      batchEcrRepositoryName
    );

    // DynamoDB テーブル
    const dynamoTableName = getDynamoDBTableName('livetalk', environment);
    const dynamoTableArn = getDynamoDBTableArn(this.region, this.account, dynamoTableName);
    const dynamoTable = dynamodb.Table.fromTableArn(this, 'DynamoTable', dynamoTableArn);

    // DLQ（失敗時の保持）
    const dlq = new sqs.Queue(this, 'BatchDlq', {
      queueName: `nagiyu-livetalk-batch-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
    });

    // Batch Lambda 実行ロール
    const executionRole = new iam.Role(this, 'BatchExecutionRole', {
      roleName: `nagiyu-livetalk-batch-execution-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // DynamoDB 読み書き権限
    dynamoTable.grantReadWriteData(executionRole);

    // DLQ 送信権限
    dlq.grantSendMessages(executionRole);

    // ErrorEvents 書き込み権限
    grantErrorEventsWrite(this, executionRole, environment);

    // Lambda 関数
    this.batchFunction = new lambda.Function(this, 'BatchFunction', {
      functionName: `nagiyu-livetalk-batch-compress-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: [
          'services/livetalk/batch/dist/src/handlers/compress-conversations.handler.handler',
        ],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: executionRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        OPENAI_API_KEY: openAiApiKey,
        ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${environment}`,
      },
      deadLetterQueue: dlq,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // EventBridge: 毎日 JST 03:00（= UTC 18:00 前日）に実行
    const dailyRule = new events.Rule(this, 'DailyCompressRule', {
      ruleName: `livetalk-batch-compress-${environment}`,
      description: 'LiveTalk 圧縮要約バッチ（日次 JST 03:00）',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '18',
        day: '*',
        month: '*',
        year: '*',
      }),
    });
    dailyRule.addTarget(
      new targets.LambdaFunction(this.batchFunction, {
        deadLetterQueue: dlq,
        maxEventAge: cdk.Duration.hours(2),
        retryAttempts: 1,
      })
    );

    // タグ
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'livetalk');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Component', 'livetalk-batch');

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'BatchFunctionArn', {
      value: this.batchFunction.functionArn,
      description: 'LiveTalk Batch Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'BatchDlqUrl', {
      value: dlq.queueUrl,
      description: 'LiveTalk Batch DLQ URL',
    });
  }
}

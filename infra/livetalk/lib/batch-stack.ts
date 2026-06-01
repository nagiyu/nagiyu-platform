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
import {
  getDynamoDBTableArn,
  getDynamoDBTableName,
  getEcrRepositoryName,
  grantErrorEventsWrite,
} from '@nagiyu/infra-common';
import type { Environment } from '@nagiyu/infra-common';

export interface LiveTalkBatchStackProps extends cdk.StackProps {
  environment: Environment;
  openAiApiKey: string;
}

/**
 * LiveTalk バッチ処理スタック（Phase 3c / Issue #3281、Phase 4c / Issue #3329）
 *
 * 圧縮要約バッチと活動時間学習バッチの 2 Lambda を管理する。
 * - compress: 日次 JST 03:00（UTC 18:00）
 * - learn-user-activity: 週次 JST 日曜 03:00（UTC 土曜 18:00）
 * - DLQ / IAM Role は Lambda ごとに独立（障害切り分け・権限最小化）
 */
export class LiveTalkBatchStack extends cdk.Stack {
  public readonly batchFunction: lambda.Function;
  public readonly learnActivityFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LiveTalkBatchStackProps) {
    super(scope, id, props);

    const { environment, openAiApiKey } = props;

    // ECR リポジトリの参照
    // リポジトリ名は命名規則から決定論的に導出する（SSM もクロススタック参照も
    // 介さないため、Batch ECR stack との deploy 順依存は発生しない）。
    const batchEcrRepositoryName = getEcrRepositoryName('livetalk-batch', environment);
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
        cmd: ['services/livetalk/batch/dist/src/handlers/compress-conversations.handler'],
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

    // ---- ユーザー活動時間学習バッチ（Phase 4c / Issue #3329）----

    // 学習バッチ専用 DLQ（compress バッチと障害切り分けのため独立）
    const learnActivityDlq = new sqs.Queue(this, 'LearnActivityDlq', {
      queueName: `nagiyu-livetalk-learn-activity-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
    });

    // 学習バッチ専用 IAM Role（OpenAI 権限不要、DynamoDB read/write のみ）
    const learnActivityRole = new iam.Role(this, 'LearnActivityExecutionRole', {
      roleName: `nagiyu-livetalk-learn-activity-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    dynamoTable.grantReadWriteData(learnActivityRole);
    learnActivityDlq.grantSendMessages(learnActivityRole);
    grantErrorEventsWrite(this, learnActivityRole, environment);

    // 学習バッチ Lambda
    this.learnActivityFunction = new lambda.Function(this, 'LearnActivityFunction', {
      functionName: `nagiyu-livetalk-batch-learn-user-activity-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/livetalk/batch/dist/src/handlers/learn-user-activity.handler'],
      }),
      handler: lambda.Handler.FROM_IMAGE,
      role: learnActivityRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${environment}`,
        TZ: 'Asia/Tokyo',
      },
      deadLetterQueue: learnActivityDlq,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // EventBridge: 週次 JST 日曜 03:00（= UTC 土曜 18:00）
    const weeklyLearnRule = new events.Rule(this, 'WeeklyLearnActivityRule', {
      ruleName: `livetalk-batch-learn-activity-${environment}`,
      description: 'LiveTalk ユーザー活動時間学習バッチ（週次 JST 日曜 03:00）',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '18',
        weekDay: 'SAT',
      }),
    });
    weeklyLearnRule.addTarget(
      new targets.LambdaFunction(this.learnActivityFunction, {
        deadLetterQueue: learnActivityDlq,
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

    new cdk.CfnOutput(this, 'LearnActivityFunctionArn', {
      value: this.learnActivityFunction.functionArn,
      description: 'LiveTalk Learn User Activity Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'LearnActivityDlqUrl', {
      value: learnActivityDlq.queueUrl,
      description: 'LiveTalk Learn User Activity DLQ URL',
    });
  }
}

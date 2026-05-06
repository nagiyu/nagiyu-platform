import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SnsEventSource, DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';

export interface BatchLambdaStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  /**
   * Admin Batch ECR リポジトリ名（同一スタック内の依存）
   */
  batchEcrRepositoryName: string;
}

/**
 * Admin Batch Lambda Stack
 *
 * - alarm-ingest: SNS (admin alarms) → DynamoDB (error-events) への取り込み
 * - stream-handler: error-events DynamoDB Streams → Web Push fan-out
 *
 * 既存リソース (admin の SNS / DynamoDB、error-events テーブル) は ARN / 名前で
 * 参照する。各 Lambda の IAM 権限はこのスタック内で最小限に絞って付与する。
 */
export class BatchLambdaStack extends cdk.Stack {
  public readonly alarmIngestFunction: lambda.Function;
  public readonly streamHandlerFunction: lambda.Function;
  public readonly streamHandlerDeadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: BatchLambdaStackProps) {
    super(scope, id, props);

    const { environment, batchEcrRepositoryName } = props;

    // 既存 ECR リポジトリの参照
    const batchRepository = ecr.Repository.fromRepositoryName(
      this,
      'BatchEcrRepository',
      batchEcrRepositoryName
    );

    // 既存テーブル / トピックの ARN
    const region = cdk.Stack.of(this).region;
    const account = cdk.Stack.of(this).account;
    const adminTableName = `nagiyu-admin-main-${environment}`;
    const errorEventsTableName = `nagiyu-error-events-${environment}`;
    const errorEventsTableArn = `arn:aws:dynamodb:${region}:${account}:table/${errorEventsTableName}`;
    const adminTableArn = `arn:aws:dynamodb:${region}:${account}:table/${adminTableName}`;
    const adminAlarmTopicArn = `arn:aws:sns:${region}:${account}:nagiyu-admin-alarms-${environment}`;

    // Admin Web の URL（自分自身、Push 通知の遷移先）
    const adminUrl =
      environment === 'prod'
        ? 'https://admin.nagiyu.com'
        : `https://${environment}-admin.nagiyu.com`;

    // VAPID キー（CDK context から渡される。未指定時はプレースホルダー）
    const vapidPublicKey = scope.node.tryGetContext('vapidPublicKey') || 'PLACEHOLDER';
    const vapidPrivateKey = scope.node.tryGetContext('vapidPrivateKey') || 'PLACEHOLDER';

    // ─────────────────────────────────────────
    // alarm-ingest Lambda
    // ─────────────────────────────────────────
    const alarmIngestRole = new iam.Role(this, 'AlarmIngestExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for alarm-ingest Lambda (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    alarmIngestRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:PutItem'],
        resources: [errorEventsTableArn],
      })
    );

    this.alarmIngestFunction = new lambda.Function(this, 'AlarmIngestFunction', {
      functionName: `nagiyu-admin-alarm-ingest-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/admin/batch/dist/src/alarm-ingest.handler'],
      }),
      role: alarmIngestRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: environment,
        ERROR_EVENTS_TABLE_NAME: errorEventsTableName,
      },
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      description: 'SNS (admin alarms) → DynamoDB (error-events) を仲介するイベント取り込み Lambda',
    });

    // 既存の admin alarm Topic を SNS Subscription で接続する
    const adminAlarmTopic = sns.Topic.fromTopicArn(this, 'AdminAlarmTopic', adminAlarmTopicArn);
    this.alarmIngestFunction.addEventSource(new SnsEventSource(adminAlarmTopic));

    // ─────────────────────────────────────────
    // stream-handler Lambda
    // ─────────────────────────────────────────
    this.streamHandlerDeadLetterQueue = new sqs.Queue(this, 'StreamHandlerDLQ', {
      queueName: `nagiyu-admin-stream-handler-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    const streamHandlerRole = new iam.Role(this, 'StreamHandlerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: `Execution role for stream-handler Lambda (${environment})`,
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    // DynamoDB Streams の購読権限
    streamHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:DescribeStream',
          'dynamodb:GetRecords',
          'dynamodb:GetShardIterator',
          'dynamodb:ListStreams',
        ],
        resources: [`${errorEventsTableArn}/stream/*`],
      })
    );
    // Push 購読情報の Read（Admin DynamoDB）
    streamHandlerRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:DeleteItem'],
        resources: [adminTableArn, `${adminTableArn}/index/*`],
      })
    );
    // DLQ への送信権限
    this.streamHandlerDeadLetterQueue.grantSendMessages(streamHandlerRole);

    this.streamHandlerFunction = new lambda.Function(this, 'StreamHandlerFunction', {
      functionName: `nagiyu-admin-stream-handler-${environment}`,
      runtime: lambda.Runtime.FROM_IMAGE,
      handler: lambda.Handler.FROM_IMAGE,
      code: lambda.Code.fromEcrImage(batchRepository, {
        tagOrDigest: 'latest',
        cmd: ['services/admin/batch/dist/src/stream-handler.handler'],
      }),
      role: streamHandlerRole,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: environment,
        DYNAMODB_TABLE_NAME: adminTableName,
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        APP_URL: adminUrl,
      },
      deadLetterQueue: this.streamHandlerDeadLetterQueue,
      tracing: lambda.Tracing.ACTIVE,
      logRetention: logs.RetentionDays.ONE_MONTH,
      description: 'error-events DynamoDB Streams を契機に Web Push を fan-out する Lambda',
    });

    // 既存 error-events テーブルの Streams ARN を CFN Import で取得
    const errorEventsStreamArn = cdk.Fn.importValue(
      `nagiyu-error-events-table-stream-arn-${environment}`
    );

    const errorEventsTable = dynamodb.Table.fromTableAttributes(this, 'ErrorEventsTable', {
      tableArn: errorEventsTableArn,
      tableStreamArn: errorEventsStreamArn,
    });

    this.streamHandlerFunction.addEventSource(
      new DynamoEventSource(errorEventsTable, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 100,
        maxBatchingWindow: cdk.Duration.seconds(5),
        retryAttempts: 2,
        bisectBatchOnError: true,
      })
    );

    // ─────────────────────────────────────────
    // タグ・Outputs
    // ─────────────────────────────────────────
    [this.alarmIngestFunction, this.streamHandlerFunction].forEach((fn) => {
      cdk.Tags.of(fn).add('Application', 'nagiyu');
      cdk.Tags.of(fn).add('Service', 'admin-batch');
      cdk.Tags.of(fn).add('Environment', environment);
    });

    new cdk.CfnOutput(this, 'AlarmIngestFunctionArn', {
      value: this.alarmIngestFunction.functionArn,
      description: 'alarm-ingest Lambda Function ARN',
    });
    new cdk.CfnOutput(this, 'StreamHandlerFunctionArn', {
      value: this.streamHandlerFunction.functionArn,
      description: 'stream-handler Lambda Function ARN',
    });
    new cdk.CfnOutput(this, 'StreamHandlerDLQUrl', {
      value: this.streamHandlerDeadLetterQueue.queueUrl,
      description: 'stream-handler DLQ URL',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import {
  createEcrImageFunction,
  getDynamoDBTableArn,
  getDynamoDBTableName,
  getEcrRepositoryName,
} from '@nagiyu/infra-common';
import type { Environment } from '@nagiyu/infra-common';

export interface LiveTalkBatchStackProps extends cdk.StackProps {
  environment: Environment;
  openAiApiKey: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

/**
 * LiveTalk バッチ処理スタック（Phase 3c / Issue #3281、Phase 4c / Issue #3329）
 *
 * 活動時間学習・通知・集約（consolidation）・acquire の各バッチ Lambda を管理する。
 * - learn-user-activity: 週次 JST 日曜 03:00（UTC 土曜 18:00）
 * - notify: 毎時 30 分
 * - consolidate: 毎時 15 分（リブトーク知識再設計 P1 / Issue #3697、shadow build）
 * - acquire: 毎時 45 分（リブトーク知識再設計 P3 / Issue #3699。Web「取得だけ」バッチ）
 * - 旧 compress（圧縮要約）・study（勉強）バッチはリブトーク知識・記憶再設計 P5 で撤去済み
 *   （consolidate・acquire が後継）。
 * - DLQ / IAM Role は Lambda ごとに独立（障害切り分け・権限最小化）。
 */
export class LiveTalkBatchStack extends cdk.Stack {
  public readonly learnActivityFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: LiveTalkBatchStackProps) {
    super(scope, id, props);

    const { environment, openAiApiKey, vapidPublicKey, vapidPrivateKey } = props;

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
    // GSI1（Profile 列挙用）・GSI3（Topic ヘッダ列挙用）への Query 権限を
    // grant に含めるため、インデックス情報付きでインポートする。`fromTableArn` だけだと
    // hasIndex=false となり grantReadWriteData が `table/.../index/*` を付与せず、
    // batch ロールが GSI を Query できず AccessDenied になる（#3527）。
    // globalIndexes を渡すことで grant にインデックス ARN を含める。
    // consolidate ロールと acquire ロールが GSI3（GSI-TOPIC）を
    // Query するため、ここに追加している（ADR-2.22 の教訓：後から grant だけ直しても
    // index/* が付与されないため、必ずここで宣言する）。
    const dynamoTable = dynamodb.Table.fromTableAttributes(this, 'DynamoTable', {
      tableArn: dynamoTableArn,
      globalIndexes: ['GSI1', 'GSI3'],
    });

    // ---- ユーザー活動時間学習バッチ（Phase 4c / Issue #3329）----

    // 学習バッチ専用 DLQ（他バッチと障害切り分けのため独立）
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

    // 学習バッチ Lambda
    this.learnActivityFunction = createEcrImageFunction(this, 'LearnActivityFunction', {
      functionName: `nagiyu-livetalk-batch-learn-user-activity-${environment}`,
      serviceName: 'livetalk',
      deployEnvironment: environment,
      repository: batchRepository,
      cmd: ['services/livetalk/batch/dist/src/handlers/learn-user-activity.handler'],
      role: learnActivityRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        LIVETALK_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        TZ: 'Asia/Tokyo',
      },
      deadLetterQueue: learnActivityDlq,
      // CloudFormation 管理外の同名ロググループが既にあり、LogGroup を作ると名前が衝突するため
      // 既存のものを引き継ぐ。この関数が既存だから付けているもので、新しい関数では付けない。
      adoptExistingLogGroup: true,
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

    // ---- 通知バッチ（Phase 5d / Issue #3346）----

    // 通知バッチ専用 DLQ
    const notifyDlq = new sqs.Queue(this, 'NotifyDlq', {
      queueName: `nagiyu-livetalk-notify-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
    });

    // 通知バッチ専用 IAM Role（OpenAI + VAPID が必要）
    const notifyRole = new iam.Role(this, 'NotifyExecutionRole', {
      roleName: `nagiyu-livetalk-notify-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    dynamoTable.grantReadWriteData(notifyRole);
    notifyDlq.grantSendMessages(notifyRole);

    // 通知バッチ Lambda
    const notifyFunction = createEcrImageFunction(this, 'NotifyFunction', {
      functionName: `nagiyu-livetalk-batch-notify-${environment}`,
      serviceName: 'livetalk',
      deployEnvironment: environment,
      repository: batchRepository,
      cmd: ['services/livetalk/batch/dist/src/handlers/notify.handler'],
      role: notifyRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        LIVETALK_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        OPENAI_API_KEY: openAiApiKey,
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        TZ: 'Asia/Tokyo',
      },
      deadLetterQueue: notifyDlq,
      // CloudFormation 管理外の同名ロググループが既にあり、LogGroup を作ると名前が衝突するため
      // 既存のものを引き継ぐ。この関数が既存だから付けているもので、新しい関数では付けない。
      adoptExistingLogGroup: true,
    });

    // EventBridge: 毎時 30 分に実行（consolidate=15分・acquire=45分と衝突回避。毎時 0 分は旧
    // study バッチの撤去により現在空きスロット）
    const hourlyNotifyRule = new events.Rule(this, 'HourlyNotifyRule', {
      ruleName: `livetalk-batch-notify-${environment}`,
      description: 'LiveTalk 通知バッチ（毎時 JST）',
      schedule: events.Schedule.cron({
        minute: '30',
        hour: '*',
        day: '*',
        month: '*',
        year: '*',
      }),
    });
    hourlyNotifyRule.addTarget(
      new targets.LambdaFunction(notifyFunction, {
        deadLetterQueue: notifyDlq,
        maxEventAge: cdk.Duration.hours(1),
        retryAttempts: 1,
      })
    );

    // ---- 集約（consolidation）バッチ（リブトーク知識再設計 P1 / Issue #3697、shadow build）----

    // 集約バッチ専用 DLQ
    const consolidateDlq = new sqs.Queue(this, 'ConsolidateDlq', {
      queueName: `nagiyu-livetalk-consolidate-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
    });

    // 集約バッチ専用 IAM Role（OpenAI 権限が必要。GSI3 Query は dynamoTable の
    // globalIndexes 宣言（本ファイル冒頭）に含めているため、ここでは grantReadWriteData だけでよい）
    const consolidateRole = new iam.Role(this, 'ConsolidateExecutionRole', {
      roleName: `nagiyu-livetalk-consolidate-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    dynamoTable.grantReadWriteData(consolidateRole);
    consolidateDlq.grantSendMessages(consolidateRole);

    // 集約バッチ Lambda
    const consolidateFunction = createEcrImageFunction(this, 'ConsolidateFunction', {
      functionName: `nagiyu-livetalk-batch-consolidate-${environment}`,
      serviceName: 'livetalk',
      deployEnvironment: environment,
      repository: batchRepository,
      cmd: ['services/livetalk/batch/dist/src/handlers/consolidate-conversations.handler'],
      role: consolidateRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        LIVETALK_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        OPENAI_API_KEY: openAiApiKey,
        TZ: 'Asia/Tokyo',
      },
      deadLetterQueue: consolidateDlq,
      // CloudFormation 管理外の同名ロググループが既にあり、LogGroup を作ると名前が衝突するため
      // 既存のものを引き継ぐ。この関数が既存だから付けているもので、新しい関数では付けない。
      adoptExistingLogGroup: true,
    });

    // EventBridge: 毎時 15 分に実行（notify=30分・acquire=45分と衝突回避）
    const hourlyConsolidateRule = new events.Rule(this, 'HourlyConsolidateRule', {
      ruleName: `livetalk-batch-consolidate-${environment}`,
      description: 'LiveTalk 集約バッチ（毎時 JST）',
      schedule: events.Schedule.cron({
        minute: '15',
        hour: '*',
        day: '*',
        month: '*',
        year: '*',
      }),
    });
    hourlyConsolidateRule.addTarget(
      new targets.LambdaFunction(consolidateFunction, {
        deadLetterQueue: consolidateDlq,
        maxEventAge: cdk.Duration.hours(1),
        retryAttempts: 1,
      })
    );

    // ---- acquire バッチ（リブトーク知識再設計 P3 / Issue #3699）----
    //
    // 既存 study を「取得だけ」に縮小した新バッチ。依頼（StudyTopic）・鮮度確認の
    // 依頼（FreshnessCheckRequest）・care 自発（GSI3 降順）の 3 種を Web 取得し WEBRAW を書く。
    // Topic への畳み込みは既存 consolidation に委ねる。

    // acquire バッチ専用 DLQ
    const acquireDlq = new sqs.Queue(this, 'AcquireDlq', {
      queueName: `nagiyu-livetalk-acquire-dlq-${environment}`,
      retentionPeriod: cdk.Duration.days(7),
    });

    // acquire バッチ専用 IAM Role（OpenAI 権限が必要。GSI3 Query は dynamoTable の
    // globalIndexes 宣言（本ファイル冒頭）に含めているため、ここでは grantReadWriteData だけでよい）
    const acquireRole = new iam.Role(this, 'AcquireExecutionRole', {
      roleName: `nagiyu-livetalk-acquire-role-${environment}`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });
    dynamoTable.grantReadWriteData(acquireRole);
    acquireDlq.grantSendMessages(acquireRole);

    // acquire バッチ Lambda
    const acquireFunction = createEcrImageFunction(this, 'AcquireFunction', {
      functionName: `nagiyu-livetalk-batch-acquire-${environment}`,
      serviceName: 'livetalk',
      deployEnvironment: environment,
      repository: batchRepository,
      cmd: ['services/livetalk/batch/dist/src/handlers/acquire.handler'],
      role: acquireRole,
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        NODE_ENV: environment,
        LIVETALK_ENV: environment,
        DYNAMODB_TABLE_NAME: dynamoTableName,
        OPENAI_API_KEY: openAiApiKey,
        TZ: 'Asia/Tokyo',
      },
      deadLetterQueue: acquireDlq,
      // CloudFormation 管理外の同名ロググループが既にあり、LogGroup を作ると名前が衝突するため
      // 既存のものを引き継ぐ。この関数が既存だから付けているもので、新しい関数では付けない。
      adoptExistingLogGroup: true,
    });

    // EventBridge: 毎時 45 分に実行（consolidate=15分・notify=30分と衝突回避）
    const hourlyAcquireRule = new events.Rule(this, 'HourlyAcquireRule', {
      ruleName: `livetalk-batch-acquire-${environment}`,
      description: 'LiveTalk acquire バッチ（毎時 JST）',
      schedule: events.Schedule.cron({
        minute: '45',
        hour: '*',
        day: '*',
        month: '*',
        year: '*',
      }),
    });
    hourlyAcquireRule.addTarget(
      new targets.LambdaFunction(acquireFunction, {
        deadLetterQueue: acquireDlq,
        maxEventAge: cdk.Duration.hours(1),
        retryAttempts: 1,
      })
    );

    // タグ
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'livetalk');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Component', 'livetalk-batch');

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'LearnActivityFunctionArn', {
      value: this.learnActivityFunction.functionArn,
      description: 'LiveTalk Learn User Activity Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'LearnActivityDlqUrl', {
      value: learnActivityDlq.queueUrl,
      description: 'LiveTalk Learn User Activity DLQ URL',
    });

    new cdk.CfnOutput(this, 'NotifyFunctionArn', {
      value: notifyFunction.functionArn,
      description: 'LiveTalk Notify Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'NotifyDlqUrl', {
      value: notifyDlq.queueUrl,
      description: 'LiveTalk Notify DLQ URL',
    });

    new cdk.CfnOutput(this, 'ConsolidateFunctionArn', {
      value: consolidateFunction.functionArn,
      description: 'LiveTalk Consolidate Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'ConsolidateDlqUrl', {
      value: consolidateDlq.queueUrl,
      description: 'LiveTalk Consolidate DLQ URL',
    });

    new cdk.CfnOutput(this, 'AcquireFunctionArn', {
      value: acquireFunction.functionArn,
      description: 'LiveTalk Acquire Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'AcquireDlqUrl', {
      value: acquireDlq.queueUrl,
      description: 'LiveTalk Acquire DLQ URL',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

export interface SelfMonitoringAlarmsStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
  /** 通知先となる自己監視 SNS Topic ARN */
  selfMonitoringTopicArn: string;
  /** alarm-ingest Lambda */
  alarmIngestFunction: lambda.IFunction;
  /** stream-handler Lambda */
  streamHandlerFunction: lambda.IFunction;
  /** stream-handler DLQ */
  streamHandlerDeadLetterQueue: sqs.IQueue;
}

/**
 * 新エラー通知システム自身の障害を監視するアラームを定義する。
 *
 * 通知先は本流とは別の `selfMonitoringTopic` に統一しており、
 * 新システムが障害中でも HTTPS subscription（`/api/notify/sns`）経由で
 * Web Push を Admin 管理者に届ける。
 */
export class SelfMonitoringAlarmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SelfMonitoringAlarmsStackProps) {
    super(scope, id, props);

    const {
      environment,
      selfMonitoringTopicArn,
      alarmIngestFunction,
      streamHandlerFunction,
      streamHandlerDeadLetterQueue,
    } = props;

    const topic = sns.Topic.fromTopicArn(this, 'SelfMonitoringTopic', selfMonitoringTopicArn);
    const action = new cwActions.SnsAction(topic);

    // alarm-ingest Lambda の Errors
    const alarmIngestErrorAlarm = new cloudwatch.Alarm(this, 'AlarmIngestErrorsAlarm', {
      alarmName: `admin-alarm-ingest-errors-${environment}`,
      alarmDescription: 'alarm-ingest Lambda の例外発生（5 分間で 1 件以上）',
      metric: alarmIngestFunction.metricErrors({
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarmIngestErrorAlarm.addAlarmAction(action);

    // stream-handler Lambda の Errors
    const streamHandlerErrorAlarm = new cloudwatch.Alarm(this, 'StreamHandlerErrorsAlarm', {
      alarmName: `admin-stream-handler-errors-${environment}`,
      alarmDescription: 'stream-handler Lambda の例外発生（5 分間で 1 件以上）',
      metric: streamHandlerFunction.metricErrors({
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    streamHandlerErrorAlarm.addAlarmAction(action);

    // stream-handler DLQ への滞留
    const dlqVisibleAlarm = new cloudwatch.Alarm(this, 'StreamHandlerDLQVisibleAlarm', {
      alarmName: `admin-stream-handler-dlq-visible-${environment}`,
      alarmDescription: 'stream-handler の DLQ にメッセージが滞留している',
      metric: streamHandlerDeadLetterQueue.metricApproximateNumberOfMessagesVisible({
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqVisibleAlarm.addAlarmAction(action);

    // error-events DynamoDB テーブルの SystemErrors / ThrottledRequests
    const errorEventsTableName = `nagiyu-error-events-${environment}`;
    const dynamoSystemErrorsAlarm = new cloudwatch.Alarm(this, 'ErrorEventsSystemErrorsAlarm', {
      alarmName: `admin-error-events-system-errors-${environment}`,
      alarmDescription: 'error-events DynamoDB テーブルの SystemErrors（5 分で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'SystemErrors',
        dimensionsMap: { TableName: errorEventsTableName },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dynamoSystemErrorsAlarm.addAlarmAction(action);

    const dynamoThrottledAlarm = new cloudwatch.Alarm(this, 'ErrorEventsThrottledAlarm', {
      alarmName: `admin-error-events-throttled-${environment}`,
      alarmDescription: 'error-events DynamoDB テーブルの ThrottledRequests（5 分で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: { TableName: errorEventsTableName },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dynamoThrottledAlarm.addAlarmAction(action);

    const allAlarms = [
      alarmIngestErrorAlarm,
      streamHandlerErrorAlarm,
      dlqVisibleAlarm,
      dynamoSystemErrorsAlarm,
      dynamoThrottledAlarm,
    ];
    allAlarms.forEach((alarm) => {
      cdk.Tags.of(alarm).add('Application', 'nagiyu');
      cdk.Tags.of(alarm).add('Service', 'admin');
      cdk.Tags.of(alarm).add('Component', 'self-monitoring');
      cdk.Tags.of(alarm).add('Environment', environment);
    });

    new cdk.CfnOutput(this, 'TotalAlarmsCount', {
      value: allAlarms.length.toString(),
      description: 'Total number of self-monitoring alarms created',
    });
  }
}

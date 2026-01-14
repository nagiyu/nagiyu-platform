import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface CloudWatchAlarmsStackProps extends cdk.StackProps {
  environment: string;
  webFunction: lambda.IFunction;
  batchMinuteFunction: lambda.IFunction;
  batchHourlyFunction: lambda.IFunction;
  batchDailyFunction: lambda.IFunction;
  dynamoTable: dynamodb.ITable;
  alarmTopic: sns.ITopic;
}

/**
 * Stock Tracker CloudWatch Alarms Stack
 *
 * Lambda と DynamoDB のメトリクスを監視し、異常時に SNS トピックに通知します。
 * 合計13個のアラームを設定します。
 */
export class CloudWatchAlarmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CloudWatchAlarmsStackProps) {
    super(scope, id, props);

    const {
      environment,
      webFunction,
      batchMinuteFunction,
      batchHourlyFunction,
      batchDailyFunction,
      dynamoTable,
      alarmTopic,
    } = props;

    const alarmAction = new cloudwatch_actions.SnsAction(alarmTopic);

    // Lambda Web - エラー率アラーム
    const webErrorAlarm = new cloudwatch.Alarm(this, 'WebLambdaErrorAlarm', {
      alarmName: `stock-tracker-web-error-rate-${environment}`,
      alarmDescription: 'Web Lambda error rate exceeds 5%',
      metric: webFunction.metricErrors({
        statistic: cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 0.05, // 5%
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    webErrorAlarm.addAlarmAction(alarmAction);

    // Lambda Web - 実行時間アラーム
    const webDurationAlarm = new cloudwatch.Alarm(this, 'WebLambdaDurationAlarm', {
      alarmName: `stock-tracker-web-duration-${environment}`,
      alarmDescription: 'Web Lambda duration exceeds 20 seconds',
      metric: webFunction.metricDuration({
        statistic: cloudwatch.Stats.AVERAGE,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 20000, // 20秒（ミリ秒）
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    webDurationAlarm.addAlarmAction(alarmAction);

    // Lambda Web - スロットリングアラーム
    const webThrottleAlarm = new cloudwatch.Alarm(this, 'WebLambdaThrottleAlarm', {
      alarmName: `stock-tracker-web-throttle-${environment}`,
      alarmDescription: 'Web Lambda throttling detected',
      metric: webFunction.metricThrottles({
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    webThrottleAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Minute - エラー率アラーム
    const batchMinuteErrorAlarm = new cloudwatch.Alarm(
      this,
      'BatchMinuteLambdaErrorAlarm',
      {
        alarmName: `stock-tracker-batch-minute-error-rate-${environment}`,
        alarmDescription: 'Batch Minute Lambda error rate exceeds 10%',
        metric: batchMinuteFunction.metricErrors({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0.1, // 10%
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchMinuteErrorAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Minute - 実行時間アラーム
    const batchMinuteDurationAlarm = new cloudwatch.Alarm(
      this,
      'BatchMinuteLambdaDurationAlarm',
      {
        alarmName: `stock-tracker-batch-minute-duration-${environment}`,
        alarmDescription: 'Batch Minute Lambda duration exceeds 40 seconds',
        metric: batchMinuteFunction.metricDuration({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 40000, // 40秒（ミリ秒）
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchMinuteDurationAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Minute - スロットリングアラーム
    const batchMinuteThrottleAlarm = new cloudwatch.Alarm(
      this,
      'BatchMinuteLambdaThrottleAlarm',
      {
        alarmName: `stock-tracker-batch-minute-throttle-${environment}`,
        alarmDescription: 'Batch Minute Lambda throttling detected',
        metric: batchMinuteFunction.metricThrottles({
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchMinuteThrottleAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Hourly - エラー率アラーム
    const batchHourlyErrorAlarm = new cloudwatch.Alarm(
      this,
      'BatchHourlyLambdaErrorAlarm',
      {
        alarmName: `stock-tracker-batch-hourly-error-rate-${environment}`,
        alarmDescription: 'Batch Hourly Lambda error rate exceeds 10%',
        metric: batchHourlyFunction.metricErrors({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0.1, // 10%
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchHourlyErrorAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Hourly - 実行時間アラーム
    const batchHourlyDurationAlarm = new cloudwatch.Alarm(
      this,
      'BatchHourlyLambdaDurationAlarm',
      {
        alarmName: `stock-tracker-batch-hourly-duration-${environment}`,
        alarmDescription: 'Batch Hourly Lambda duration exceeds 4 minutes',
        metric: batchHourlyFunction.metricDuration({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 240000, // 4分（ミリ秒）
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchHourlyDurationAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Hourly - スロットリングアラーム
    const batchHourlyThrottleAlarm = new cloudwatch.Alarm(
      this,
      'BatchHourlyLambdaThrottleAlarm',
      {
        alarmName: `stock-tracker-batch-hourly-throttle-${environment}`,
        alarmDescription: 'Batch Hourly Lambda throttling detected',
        metric: batchHourlyFunction.metricThrottles({
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchHourlyThrottleAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Daily - エラー率アラーム
    const batchDailyErrorAlarm = new cloudwatch.Alarm(
      this,
      'BatchDailyLambdaErrorAlarm',
      {
        alarmName: `stock-tracker-batch-daily-error-rate-${environment}`,
        alarmDescription: 'Batch Daily Lambda error rate exceeds 10%',
        metric: batchDailyFunction.metricErrors({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 0.1, // 10%
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchDailyErrorAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Daily - 実行時間アラーム
    const batchDailyDurationAlarm = new cloudwatch.Alarm(
      this,
      'BatchDailyLambdaDurationAlarm',
      {
        alarmName: `stock-tracker-batch-daily-duration-${environment}`,
        alarmDescription: 'Batch Daily Lambda duration exceeds 8 minutes',
        metric: batchDailyFunction.metricDuration({
          statistic: cloudwatch.Stats.AVERAGE,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 480000, // 8分（ミリ秒）
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchDailyDurationAlarm.addAlarmAction(alarmAction);

    // Lambda Batch Daily - スロットリングアラーム
    const batchDailyThrottleAlarm = new cloudwatch.Alarm(
      this,
      'BatchDailyLambdaThrottleAlarm',
      {
        alarmName: `stock-tracker-batch-daily-throttle-${environment}`,
        alarmDescription: 'Batch Daily Lambda throttling detected',
        metric: batchDailyFunction.metricThrottles({
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    batchDailyThrottleAlarm.addAlarmAction(alarmAction);

    // DynamoDB - Read Throttle Events アラーム
    const dynamoReadThrottleAlarm = new cloudwatch.Alarm(
      this,
      'DynamoDBReadThrottleAlarm',
      {
        alarmName: `stock-tracker-dynamodb-read-throttle-${environment}`,
        alarmDescription: 'DynamoDB read throttle events detected',
        metric: dynamoTable.metricSystemErrorsForOperations({
          operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY, dynamodb.Operation.SCAN],
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    dynamoReadThrottleAlarm.addAlarmAction(alarmAction);

    // DynamoDB - Write Throttle Events アラーム
    const dynamoWriteThrottleAlarm = new cloudwatch.Alarm(
      this,
      'DynamoDBWriteThrottleAlarm',
      {
        alarmName: `stock-tracker-dynamodb-write-throttle-${environment}`,
        alarmDescription: 'DynamoDB write throttle events detected',
        metric: dynamoTable.metricSystemErrorsForOperations({
          operations: [dynamodb.Operation.PUT_ITEM, dynamodb.Operation.UPDATE_ITEM, dynamodb.Operation.DELETE_ITEM],
          statistic: cloudwatch.Stats.SUM,
          period: cdk.Duration.minutes(5),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }
    );
    dynamoWriteThrottleAlarm.addAlarmAction(alarmAction);

    // タグの追加
    const allAlarms = [
      webErrorAlarm,
      webDurationAlarm,
      webThrottleAlarm,
      batchMinuteErrorAlarm,
      batchMinuteDurationAlarm,
      batchMinuteThrottleAlarm,
      batchHourlyErrorAlarm,
      batchHourlyDurationAlarm,
      batchHourlyThrottleAlarm,
      batchDailyErrorAlarm,
      batchDailyDurationAlarm,
      batchDailyThrottleAlarm,
      dynamoReadThrottleAlarm,
      dynamoWriteThrottleAlarm,
    ];

    allAlarms.forEach((alarm) => {
      cdk.Tags.of(alarm).add('Application', 'nagiyu');
      cdk.Tags.of(alarm).add('Service', 'stock-tracker');
      cdk.Tags.of(alarm).add('Environment', environment);
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'TotalAlarmsCount', {
      value: allAlarms.length.toString(),
      description: 'Total number of CloudWatch Alarms created',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface EventBridgeStackProps extends cdk.StackProps {
  environment: string;
  batchMinuteFunction: lambda.IFunction;
  batchHourlyFunction: lambda.IFunction;
  batchSummaryFunction: lambda.IFunction;
  batchDailyFunction: lambda.IFunction;
  batchTemporaryAlertExpiryFunction: lambda.IFunction;
}

/**
 * Stock Tracker EventBridge Stack
 *
 * バッチ処理の定期実行スケジュールを管理します。
 * - Minute: 1分間隔（MINUTE_LEVEL アラート処理）
 * - Hourly: 1時間間隔（HOURLY_LEVEL アラート処理）
 * - Temporary Alert Expiry: 1時間間隔（一時通知アラートの期限切れ無効化）
 * - Daily: 日次（データクリーンアップ）
 */
export class EventBridgeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EventBridgeStackProps) {
    super(scope, id, props);

    const {
      environment,
      batchMinuteFunction,
      batchHourlyFunction,
      batchSummaryFunction,
      batchDailyFunction,
      batchTemporaryAlertExpiryFunction,
    } = props;

    // EventBridge Rule - Minute（1分間隔）
    const minuteRule = new events.Rule(this, 'BatchMinuteRule', {
      ruleName: `stock-tracker-batch-minute-${environment}`,
      description: 'Trigger Stock Tracker Minute Batch every 1 minute',
      schedule: events.Schedule.rate(cdk.Duration.minutes(1)),
    });
    minuteRule.addTarget(new targets.LambdaFunction(batchMinuteFunction));

    // EventBridge Rule - Hourly（1時間間隔）
    const hourlyRule = new events.Rule(this, 'BatchHourlyRule', {
      ruleName: `stock-tracker-batch-hourly-${environment}`,
      description: 'Trigger Stock Tracker Hourly Batch every 1 hour',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });
    hourlyRule.addTarget(new targets.LambdaFunction(batchHourlyFunction));

    // EventBridge Rule - Summary（1時間間隔、日次サマリー生成）
    const summaryRule = new events.Rule(this, 'BatchSummaryRule', {
      ruleName: `stock-tracker-batch-summary-${environment}`,
      description: 'Trigger Stock Tracker Summary Batch every 1 hour',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });
    summaryRule.addTarget(new targets.LambdaFunction(batchSummaryFunction));

    // EventBridge Rule - Temporary Alert Expiry（1時間間隔、一時通知の期限切れ無効化）
    const temporaryAlertExpiryRule = new events.Rule(this, 'BatchTemporaryAlertExpiryRule', {
      ruleName: `stock-tracker-batch-temporary-alert-expiry-${environment}`,
      description: 'Trigger Stock Tracker Temporary Alert Expiry Batch every 1 hour',
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
    });
    temporaryAlertExpiryRule.addTarget(new targets.LambdaFunction(batchTemporaryAlertExpiryFunction));

    // EventBridge Rule - Daily（日次、UTC 0:00）
    const dailyRule = new events.Rule(this, 'BatchDailyRule', {
      ruleName: `stock-tracker-batch-daily-${environment}`,
      description: 'Trigger Stock Tracker Daily Batch at 0:00 UTC',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '0',
        day: '*',
        month: '*',
        year: '*',
      }),
    });
    dailyRule.addTarget(new targets.LambdaFunction(batchDailyFunction));

    // タグの追加
    [minuteRule, hourlyRule, summaryRule, temporaryAlertExpiryRule, dailyRule].forEach((rule) => {
      cdk.Tags.of(rule).add('Application', 'nagiyu');
      cdk.Tags.of(rule).add('Service', 'stock-tracker');
      cdk.Tags.of(rule).add('Environment', environment);
    });

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'MinuteRuleArn', {
      value: minuteRule.ruleArn,
      description: 'Minute Batch EventBridge Rule ARN',
    });

    new cdk.CfnOutput(this, 'HourlyRuleArn', {
      value: hourlyRule.ruleArn,
      description: 'Hourly Batch EventBridge Rule ARN',
    });

    new cdk.CfnOutput(this, 'SummaryRuleArn', {
      value: summaryRule.ruleArn,
      description: 'Summary Batch EventBridge Rule ARN',
    });

    new cdk.CfnOutput(this, 'TemporaryAlertExpiryRuleArn', {
      value: temporaryAlertExpiryRule.ruleArn,
      description: 'Temporary Alert Expiry Batch EventBridge Rule ARN',
    });

    new cdk.CfnOutput(this, 'DailyRuleArn', {
      value: dailyRule.ruleArn,
      description: 'Daily Batch EventBridge Rule ARN',
    });
  }
}

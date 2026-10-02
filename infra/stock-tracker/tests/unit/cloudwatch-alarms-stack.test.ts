/**
 * CloudWatchAlarmsStack の単体テスト
 *
 * forecast バッチのエラー率アラームが、他の batch と同じ流儀（閾値10%・5分周期）で
 * 作成されることを検証する。
 */

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sns from 'aws-cdk-lib/aws-sns';
import { CloudWatchAlarmsStack } from '../../lib/cloudwatch-alarms-stack';

function createTestStack(): { app: cdk.App; stack: CloudWatchAlarmsStack } {
  const app = new cdk.App();
  const env = { account: '123456789012', region: 'us-east-1' };

  // 依存リソースを保持する親スタック（CloudWatchAlarmsStack は別スタックで依存する構成）
  const parentStack = new cdk.Stack(app, 'ParentStack', { env });

  const createDummyFunction = (id: string): lambda.Function =>
    new lambda.Function(parentStack, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({});'),
    });

  const webFunction = createDummyFunction('WebFunction');
  const batchMinuteFunction = createDummyFunction('BatchMinuteFunction');
  const batchHourlyFunction = createDummyFunction('BatchHourlyFunction');
  const batchDailyFunction = createDummyFunction('BatchDailyFunction');
  const batchForecastFunction = createDummyFunction('BatchForecastFunction');

  const dynamoTable = new dynamodb.Table(parentStack, 'Table', {
    partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  });

  const alarmTopic = new sns.Topic(parentStack, 'AlarmTopic');

  const stack = new CloudWatchAlarmsStack(app, 'TestCloudWatchAlarmsStack', {
    environment: 'dev',
    webFunction,
    batchMinuteFunction,
    batchHourlyFunction,
    batchDailyFunction,
    batchForecastFunction,
    dynamoTable,
    alarmTopic,
    adminAlarmTopicArn: 'arn:aws:sns:us-east-1:123456789012:nagiyu-admin-alarms-dev',
    env,
  });

  return { app, stack };
}

describe('CloudWatchAlarmsStack', () => {
  let template: Template;

  beforeEach(() => {
    const { stack } = createTestStack();
    template = Template.fromStack(stack);
  });

  it('forecast のエラー率アラームが、他の batch と同じ流儀（閾値10%・5分周期）で作成される', () => {
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'stock-tracker-batch-forecast-error-rate-dev',
      Threshold: 0.1,
      Period: 300,
      ComparisonOperator: 'GreaterThanThreshold',
    });
  });

  it('forecast には実行時間・スロットリングのアラームを設けない（所要時間が実行内容で大きく変わるため）', () => {
    const durationAlarms = template.findResources('AWS::CloudWatch::Alarm', {
      Properties: { AlarmName: 'stock-tracker-batch-forecast-duration-dev' },
    });
    const throttleAlarms = template.findResources('AWS::CloudWatch::Alarm', {
      Properties: { AlarmName: 'stock-tracker-batch-forecast-throttle-dev' },
    });
    expect(Object.keys(durationAlarms)).toHaveLength(0);
    expect(Object.keys(throttleAlarms)).toHaveLength(0);
  });

  it('合計15個のアラームが作成される', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 15);
  });
});

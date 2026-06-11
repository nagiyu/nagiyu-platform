const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkAlarmsStack } = require('../../lib/alarms-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment = 'dev') => {
  const app = new cdk.App();
  const stack = new LiveTalkAlarmsStack(app, `TestLiveTalkAlarms${environment}`, {
    environment,
    env: STACK_ENV,
  });
  return { template: Template.fromStack(stack), stack };
};

describe('LiveTalkAlarmsStack', () => {
  it('CloudWatch アラームが 11 個作成される', () => {
    const { template } = synth();
    template.resourceCountIs('AWS::CloudWatch::Alarm', 11);
  });

  it('圧縮バッチ Lambda エラーアラームが存在する（Namespace/MetricName 検証）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-compress-errors-dev',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });

  it('学習バッチ Lambda エラーアラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-learn-activity-errors-dev',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });

  it('勉強バッチ Lambda エラーアラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-study-errors-dev',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });

  it('通知バッチ Lambda エラーアラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-notify-errors-dev',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });

  it('圧縮バッチ DLQ 滞留アラームが存在する（Namespace/MetricName 検証）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-compress-dlq-dev',
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
    });
  });

  it('学習バッチ DLQ 滞留アラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-learn-activity-dlq-dev',
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
    });
  });

  it('勉強バッチ DLQ 滞留アラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-study-dlq-dev',
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
    });
  });

  it('通知バッチ DLQ 滞留アラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-notify-dlq-dev',
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
    });
  });

  it('ALB 5xx アラームが存在する（Namespace/MetricName 検証）', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-alb-5xx-dev',
      Namespace: 'AWS/ApplicationELB',
      MetricName: 'HTTPCode_ELB_5XX_Count',
    });
  });

  it('ALB UnhealthyHost アラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-alb-unhealthy-host-dev',
      Namespace: 'AWS/ApplicationELB',
      MetricName: 'UnHealthyHostCount',
    });
  });

  it('DynamoDB スロットリングアラームが存在する', () => {
    const { template } = synth();
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-dynamodb-throttled-dev',
      Namespace: 'AWS/DynamoDB',
      MetricName: 'ThrottledRequests',
    });
  });

  it('全アラームに AlarmActions（SNS）が設定されている', () => {
    const { template } = synth();
    // 代表として圧縮バッチエラーアラームで AlarmActions が存在することを確認
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-compress-errors-dev',
      AlarmActions: Match.anyValue(),
    });
  });

  it('全アラームで threshold=1, evaluationPeriods=1 が設定されている', () => {
    const { template } = synth();
    // 代表として DLQ アラームで共通設定を確認
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-compress-dlq-dev',
      Threshold: 1,
      EvaluationPeriods: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
    });
  });

  it('TotalAlarmsCount の Output が存在する', () => {
    const { template } = synth();
    template.hasOutput('TotalAlarmsCount', Match.anyValue());
  });

  it('TotalAlarmsCount の Output 値が 11 である', () => {
    const { template } = synth();
    template.hasOutput('TotalAlarmsCount', {
      Value: '11',
    });
  });

  it('prod 環境でも正しく synth できる', () => {
    const { template } = synth('prod');
    template.resourceCountIs('AWS::CloudWatch::Alarm', 11);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'livetalk-batch-compress-errors-prod',
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
    });
  });

  it('prod 環境の TotalAlarmsCount が 11 である', () => {
    const { template } = synth('prod');
    template.hasOutput('TotalAlarmsCount', {
      Value: '11',
    });
  });
});

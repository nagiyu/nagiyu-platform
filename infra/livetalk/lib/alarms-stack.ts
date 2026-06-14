import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { Environment, SSM_PARAMETERS, getDynamoDBTableName } from '@nagiyu/infra-common';

export interface LiveTalkAlarmsStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk CloudWatch アラームスタック（Issue #3526）
 *
 * バッチ Lambda エラー・バッチ DLQ 滞留・ALB 5xx・ターゲット異常・DynamoDB スロットリングを監視する。
 * 通知先は admin 本流 SNS Topic（`nagiyu-admin-alarms-{env}`）。
 */
export class LiveTalkAlarmsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LiveTalkAlarmsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // 通知先 SNS Topic（admin 本流）
    const topicArn = this.formatArn({
      service: 'sns',
      resource: `nagiyu-admin-alarms-${environment}`,
    });
    const topic = sns.Topic.fromTopicArn(this, 'AdminAlarmTopic', topicArn);
    const action = new cwActions.SnsAction(topic);

    // アラーム共通設定
    const commonAlarmProps = {
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    };

    // ---- (A) バッチ Lambda Errors（4本）----

    const compressErrorAlarm = new cloudwatch.Alarm(this, 'CompressErrorsAlarm', {
      alarmName: `livetalk-batch-compress-errors-${environment}`,
      alarmDescription: '圧縮要約バッチ Lambda の例外発生（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: `nagiyu-livetalk-batch-compress-${environment}` },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    compressErrorAlarm.addAlarmAction(action);

    const learnActivityErrorAlarm = new cloudwatch.Alarm(this, 'LearnActivityErrorsAlarm', {
      alarmName: `livetalk-batch-learn-activity-errors-${environment}`,
      alarmDescription: '学習バッチ Lambda の例外発生（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: `nagiyu-livetalk-batch-learn-user-activity-${environment}`,
        },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    learnActivityErrorAlarm.addAlarmAction(action);

    const studyErrorAlarm = new cloudwatch.Alarm(this, 'StudyErrorsAlarm', {
      alarmName: `livetalk-batch-study-errors-${environment}`,
      alarmDescription: '勉強バッチ Lambda の例外発生（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: `nagiyu-livetalk-batch-study-${environment}` },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    studyErrorAlarm.addAlarmAction(action);

    const notifyErrorAlarm = new cloudwatch.Alarm(this, 'NotifyErrorsAlarm', {
      alarmName: `livetalk-batch-notify-errors-${environment}`,
      alarmDescription: '通知バッチ Lambda の例外発生（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: { FunctionName: `nagiyu-livetalk-batch-notify-${environment}` },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    notifyErrorAlarm.addAlarmAction(action);

    // ---- (B) バッチ DLQ 滞留（4本）----

    const compressDlqAlarm = new cloudwatch.Alarm(this, 'CompressDlqAlarm', {
      alarmName: `livetalk-batch-compress-dlq-${environment}`,
      alarmDescription: '圧縮要約バッチ DLQ にメッセージが滞留している',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: `nagiyu-livetalk-batch-dlq-${environment}` },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    compressDlqAlarm.addAlarmAction(action);

    const learnActivityDlqAlarm = new cloudwatch.Alarm(this, 'LearnActivityDlqAlarm', {
      alarmName: `livetalk-batch-learn-activity-dlq-${environment}`,
      alarmDescription: '学習バッチ DLQ にメッセージが滞留している',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: `nagiyu-livetalk-learn-activity-dlq-${environment}` },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    learnActivityDlqAlarm.addAlarmAction(action);

    const studyDlqAlarm = new cloudwatch.Alarm(this, 'StudyDlqAlarm', {
      alarmName: `livetalk-batch-study-dlq-${environment}`,
      alarmDescription: '勉強バッチ DLQ にメッセージが滞留している',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: `nagiyu-livetalk-study-dlq-${environment}` },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    studyDlqAlarm.addAlarmAction(action);

    const notifyDlqAlarm = new cloudwatch.Alarm(this, 'NotifyDlqAlarm', {
      alarmName: `livetalk-batch-notify-dlq-${environment}`,
      alarmDescription: '通知バッチ DLQ にメッセージが滞留している',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/SQS',
        metricName: 'ApproximateNumberOfMessagesVisible',
        dimensionsMap: { QueueName: `nagiyu-livetalk-notify-dlq-${environment}` },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    notifyDlqAlarm.addAlarmAction(action);

    // ---- (C) ALB（2本）----
    // ALB ARN と TargetGroup ARN を SSM から読み、CloudWatch の dimension 値を導出する
    const albArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_ARN(environment)
    );
    const targetGroupArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_TARGET_GROUP_ARN(environment)
    );

    // ALB ARN: arn:aws:elasticloadbalancing:region:account:loadbalancer/app/name/hash
    // LoadBalancer dimension = "app/name/hash"（"loadbalancer/" 以降）
    const albDim = cdk.Fn.select(1, cdk.Fn.split('loadbalancer/', albArn));

    // TG ARN: arn:aws:elasticloadbalancing:region:account:targetgroup/name/hash
    // TargetGroup dimension = "targetgroup/name/hash"（ARN の第 6 要素、0-indexed は index 5）
    const tgDim = cdk.Fn.select(5, cdk.Fn.split(':', targetGroupArn));

    const alb5xxAlarm = new cloudwatch.Alarm(this, 'Alb5xxAlarm', {
      alarmName: `livetalk-alb-5xx-${environment}`,
      alarmDescription: 'ALB の 5xx エラーが発生している（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'HTTPCode_ELB_5XX_Count',
        dimensionsMap: { LoadBalancer: albDim },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    alb5xxAlarm.addAlarmAction(action);

    const albUnhealthyAlarm = new cloudwatch.Alarm(this, 'AlbUnhealthyHostAlarm', {
      alarmName: `livetalk-alb-unhealthy-host-${environment}`,
      alarmDescription: 'ALB の UnhealthyHost が存在する（5 分間で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApplicationELB',
        metricName: 'UnHealthyHostCount',
        dimensionsMap: { LoadBalancer: albDim, TargetGroup: tgDim },
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    albUnhealthyAlarm.addAlarmAction(action);

    // ---- (D) DynamoDB スロットリング（1本）----

    const dynamoTableName = getDynamoDBTableName('livetalk', environment);
    const dynamoThrottledAlarm = new cloudwatch.Alarm(this, 'DynamoDBThrottledAlarm', {
      alarmName: `livetalk-dynamodb-throttled-${environment}`,
      alarmDescription:
        'livetalk DynamoDB テーブルのスロットリングが発生している（5 分で 1 件以上）',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: { TableName: dynamoTableName },
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(5),
      }),
      ...commonAlarmProps,
    });
    dynamoThrottledAlarm.addAlarmAction(action);

    // タグ付与
    const allAlarms = [
      compressErrorAlarm,
      learnActivityErrorAlarm,
      studyErrorAlarm,
      notifyErrorAlarm,
      compressDlqAlarm,
      learnActivityDlqAlarm,
      studyDlqAlarm,
      notifyDlqAlarm,
      alb5xxAlarm,
      albUnhealthyAlarm,
      dynamoThrottledAlarm,
    ];
    allAlarms.forEach((alarm) => {
      cdk.Tags.of(alarm).add('Application', 'nagiyu');
      cdk.Tags.of(alarm).add('Service', 'livetalk');
      cdk.Tags.of(alarm).add('Component', 'monitoring');
      cdk.Tags.of(alarm).add('Environment', environment);
    });

    // スタック全体へのタグ
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'livetalk');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('Component', 'livetalk-monitoring');

    // CloudFormation Output
    new cdk.CfnOutput(this, 'TotalAlarmsCount', {
      value: allAlarms.length.toString(),
      description: 'LiveTalk CloudWatch アラームの総数',
    });
  }
}

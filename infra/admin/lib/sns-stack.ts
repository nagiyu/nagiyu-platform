import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface SNSStackProps {
  environment: string;
}

/**
 * Admin の SNS Topic 群を管理する。
 *
 * - **alarmTopic（本流）**: 各サービスの CloudWatch Alarm を集約する Topic。
 *   Lambda subscription（alarm-ingest）が DynamoDB へ永続化し、その後
 *   stream-handler が Web Push を fan-out する。HTTPS subscription は
 *   持たない（本流の二重通知を防ぐ）。
 * - **selfMonitoringTopic（自己監視）**: 新システム自身（alarm-ingest /
 *   stream-handler / DLQ / error-events table）の障害アラームを受ける Topic。
 *   既存の `/api/notify/sns` HTTPS subscription をこちらに付け替え、
 *   新システムが障害中でも Push 通知が届く経路を確保する。
 */
export class SNSStack extends Construct {
  public readonly alarmTopic: sns.Topic;
  public readonly selfMonitoringTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SNSStackProps) {
    super(scope, id);

    const { environment } = props;
    const adminUrl =
      environment === 'prod'
        ? 'https://admin.nagiyu.com'
        : `https://${environment}-admin.nagiyu.com`;

    // 本流: 各サービスの CloudWatch Alarm 集約用
    // HTTPS subscription は意図的に付けない（alarm-ingest Lambda のみが subscribe する）
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `nagiyu-admin-alarms-${environment}`,
      displayName: `Admin Alarms (${environment})`,
    });

    // カスタム resource policy を1つでも付けると SNS のデフォルトポリシー
    // （所有アカウントに publish 等を許可）が置換されるため、既存の同一アカウント
    // publish を明示的に併記して回帰を防ぐ。これが無いと各サービスの CloudWatch Alarm
    // → SNS（デフォルトポリシー依存）が publish 拒否でサイレント停止する。
    this.alarmTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSameAccountPublish',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ['sns:Publish'],
        resources: [this.alarmTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceOwner': cdk.Stack.of(this).account,
          },
        },
      })
    );

    // 各サービスの EventBridge ルール（例: Batch Job State Change）が集約トピックへ
    // publish できるようにするための許可。同一アカウントに限定する。
    this.alarmTopic.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowEventBridgePublish',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('events.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [this.alarmTopic.topicArn],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      })
    );

    // 自己監視: 新システム自身の障害用
    // HTTPS subscription で /api/notify/sns に流し、新システムを介さず
    // Web Push を Admin 管理者へ届ける
    this.selfMonitoringTopic = new sns.Topic(this, 'SelfMonitoringTopic', {
      topicName: `nagiyu-admin-self-monitoring-${environment}`,
      displayName: `Admin Self-Monitoring (${environment})`,
    });
    this.selfMonitoringTopic.addSubscription(
      new subscriptions.UrlSubscription(`${adminUrl}/api/notify/sns`)
    );

    [this.alarmTopic, this.selfMonitoringTopic].forEach((topic) => {
      cdk.Tags.of(topic).add('Application', 'nagiyu');
      cdk.Tags.of(topic).add('Service', 'admin');
      cdk.Tags.of(topic).add('Environment', environment);
    });

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for Admin alarm notifications (mainstream)',
    });

    new cdk.CfnOutput(this, 'SelfMonitoringTopicArn', {
      value: this.selfMonitoringTopic.topicArn,
      description: 'SNS Topic ARN for self-monitoring of the error-events stack',
      exportName: `nagiyu-admin-self-monitoring-topic-arn-${environment}`,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

export interface SNSStackProps {
  environment: string;
}

export class SNSStack extends Construct {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SNSStackProps) {
    super(scope, id);

    const { environment } = props;
    const adminUrl =
      environment === 'prod'
        ? 'https://admin.nagiyu.com'
        : `https://${environment}-admin.nagiyu.com`;

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `nagiyu-admin-alarms-${environment}`,
      displayName: `Admin Alarms (${environment})`,
    });

    this.alarmTopic.addSubscription(
      new subscriptions.UrlSubscription(`${adminUrl}/api/notify/sns`)
    );

    cdk.Tags.of(this.alarmTopic).add('Application', 'nagiyu');
    cdk.Tags.of(this.alarmTopic).add('Service', 'admin');
    cdk.Tags.of(this.alarmTopic).add('Environment', environment);

    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for Admin alarm notifications',
    });
  }
}

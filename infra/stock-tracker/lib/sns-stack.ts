import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export interface SNSStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stock Tracker SNS Stack
 *
 * CloudWatch Alarms からの通知を受け取る SNS トピックを作成します。
 */
export class SNSStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SNSStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // SNS トピックの作成
    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `nagiyu-stock-tracker-alarms-${environment}`,
      displayName: `Stock Tracker Alarms (${environment})`,
    });

    // タグの追加
    cdk.Tags.of(this.alarmTopic).add('Application', 'nagiyu');
    cdk.Tags.of(this.alarmTopic).add('Service', 'stock-tracker');
    cdk.Tags.of(this.alarmTopic).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS Topic ARN for CloudWatch Alarms',
      exportName: `${this.stackName}-AlarmTopicArn`,
    });

    new cdk.CfnOutput(this, 'AlarmTopicName', {
      value: this.alarmTopic.topicName,
      description: 'SNS Topic Name for CloudWatch Alarms',
      exportName: `${this.stackName}-AlarmTopicName`,
    });
  }
}

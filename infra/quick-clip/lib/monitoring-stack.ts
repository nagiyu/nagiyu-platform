import * as cdk from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import type { QuickClipEnvironment } from './environment';

export interface MonitoringStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
  batchJobQueueArn: string;
}

/**
 * QuickClip 監視スタック（AWS Batch ジョブ失敗の安全網）
 *
 * quick-clip のアプリ内 try/catch（`runQuickClipBatch` / `withErrorReporting`）は
 * プロセスが生存している限りは Admin へエラーを報告できるが、AWS Batch のタイムアウト
 * による SIGKILL（exit 137）ではプロセスが即死し catch が走らない。
 *
 * これを埋めるため、EventBridge で Batch Job State Change イベント（status=FAILED）を
 * 直接検知し、プロセスの生死に依存しない経路で Admin の集約 SNS Topic に転送する。
 * 転送先の alarm-ingest Lambda が汎用ロジックで ErrorEvent に変換し error-events
 * テーブルへ永続化する（quick-clip 固有の変換ロジックは持たない）。
 */
export class MonitoringStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment, batchJobQueueArn } = props;

    // Admin が所有する集約 SNS Topic を ARN 参照でインポートする。
    // 注意: import したトピックには CDK からリソースポリシーを付与できないため、
    // EventBridge（events.amazonaws.com）からの sns:Publish 許可は
    // admin 側スタック（infra/admin/lib/sns-stack.ts）の topic resource policy で
    // 同一アカウント限定で付与している。ここでは付与しない。
    const topicArn = this.formatArn({
      service: 'sns',
      resource: `nagiyu-admin-alarms-${environment}`,
    });
    const topic = sns.Topic.fromTopicArn(this, 'AdminAlarmTopic', topicArn);

    const rule = new events.Rule(this, 'BatchJobFailedRule', {
      ruleName: `nagiyu-quick-clip-batch-job-failed-${environment}`,
      description: 'quick-clip Batch ジョブ失敗を Admin 集約 SNS に転送する',
      eventPattern: {
        source: ['aws.batch'],
        detailType: ['Batch Job State Change'],
        detail: {
          status: ['FAILED'],
          jobQueue: [batchJobQueueArn],
        },
      },
    });
    rule.addTarget(new targets.SnsTopic(topic));

    // タグ付与
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'quick-clip');
    cdk.Tags.of(this).add('Component', 'monitoring');
    cdk.Tags.of(this).add('Environment', environment);
  }
}

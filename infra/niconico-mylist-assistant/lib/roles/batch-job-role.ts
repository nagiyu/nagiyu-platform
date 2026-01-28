import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BatchJobRoleProps {
  /**
   * CloudWatch Logs のログストリームARN
   * 権限を特定のログストリームに限定するために使用
   */
  logGroupArn?: string;
}

/**
 * AWS Batch ジョブ用の実行ロール (コンテナランタイム用)
 *
 * このロールは Batch Worker コンテナの実行時に使用され、以下の最小権限を持つ:
 * - CloudWatch Logs への書き込み権限のみ
 *
 * Milestone 1 の現在の実装では、ダミー処理のみを実行するため、
 * CloudWatch Logs への書き込み権限のみを付与しています。
 *
 * 将来の拡張 (Milestone 5):
 * - DynamoDB への読み書き権限（動画データ取得、ジョブステータス更新）
 * - Secrets Manager への読み取り権限（暗号化キー取得）
 */
export class BatchJobRole extends iam.Role {
  constructor(scope: Construct, id: string, props?: BatchJobRoleProps) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for Batch job container runtime with minimal permissions (Milestone 1)',
    });

    // CloudWatch Logs への書き込み権限を付与
    // Note: awslogs ログドライバー使用時は executionRole が書き込むため、
    // jobRole には明示的なログ権限は不要だが、コンテナ内から直接ログAPIを
    // 呼び出す場合に備えて権限を付与
    const logResourceArn = props?.logGroupArn
      ? `${props.logGroupArn}:*`
      : 'arn:aws:logs:*:*:log-group:/aws/batch/niconico-mylist-assistant-*:*';

    this.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [logResourceArn],
      })
    );
  }
}

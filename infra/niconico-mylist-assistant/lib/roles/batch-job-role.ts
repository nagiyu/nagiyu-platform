import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * AWS Batch ジョブ用の実行ロール (コンテナランタイム用)
 *
 * このロールは Batch Worker コンテナの実行時に使用され、以下の最小権限を持つ:
 * - CloudWatch Logs への書き込み権限のみ
 *
 * 注: 将来的に DynamoDB への書き込み等が必要になった場合は、
 * このロールに権限を追加する必要があります。
 */
export class BatchJobRole extends iam.Role {
  constructor(scope: Construct, id: string) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for Batch job container runtime with minimal permissions',
    });

    // CloudWatch Logs への書き込み権限を付与
    // Note: awslogs ログドライバー使用時は executionRole が書き込むため、
    // jobRole には明示的なログ権限は不要だが、コンテナ内から直接ログAPIを
    // 呼び出す場合に備えて権限を付与
    this.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: ['*'],
      })
    );
  }
}

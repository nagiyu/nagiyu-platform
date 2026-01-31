import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * BatchRuntimePolicy のプロパティ
 */
export interface BatchRuntimePolicyProps {
  /**
   * DynamoDB テーブル名
   */
  dynamoTableName: string;

  /**
   * DynamoDB テーブル ARN
   */
  dynamoTableArn: string;

  /**
   * CloudWatch Logs ログ グループ名
   */
  logGroupName: string;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;
}

/**
 * Niconico Mylist Assistant Batch 実行時権限のマネージドポリシー
 *
 * このポリシーは以下の両方で使用される:
 * - Batch Job 実行ロール (AWS Batch ジョブ用)
 * - 開発用 IAM ユーザー (ローカル開発用)
 *
 * 同じポリシーを共有することで、開発者は本番環境の Batch と全く同じ権限で
 * テストでき、デプロイ前に権限ミスを防ぐことができる。
 *
 * 含まれる権限:
 * - DynamoDB: テーブルへの読み書きアクセス (Query, GetItem, PutItem, UpdateItem)
 *   - DeleteItem は不可（最小権限の原則）
 * - CloudWatch Logs: ログ書き込み
 *
 * Milestone 5 での拡張予定:
 * - Secrets Manager への読み取り権限（暗号化キー取得）
 */
export class BatchRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: BatchRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `niconico-mylist-assistant-batch-runtime-${props.envName}`,
      description:
        'Niconico Mylist Assistant Batch runtime permissions (shared by Batch Job and developers)',
    });

    // DynamoDB 権限: Query, GetItem, PutItem, UpdateItem のみ（最小権限）
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
        ],
        resources: [
          props.dynamoTableArn,
          `${props.dynamoTableArn}/index/*`, // GSI へのアクセス
        ],
      })
    );

    // CloudWatch Logs 権限: ログ書き込み
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'CloudWatchLogsAccess',
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`arn:aws:logs:*:*:log-group:${props.logGroupName}:*`],
      })
    );
  }
}

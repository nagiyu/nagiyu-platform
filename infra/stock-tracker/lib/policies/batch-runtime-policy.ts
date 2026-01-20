import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

/**
 * BatchRuntimePolicy のプロパティ
 */
export interface BatchRuntimePolicyProps {
  /**
   * DynamoDB テーブル
   */
  dynamoTable: dynamodb.ITable;

  /**
   * VAPID シークレット
   */
  vapidSecret: secretsmanager.ISecret;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;
}

/**
 * Stock Tracker Batch Lambda 実行時権限のマネージドポリシー
 *
 * このポリシーは以下の両方で使用される:
 * - Batch Lambda 実行ロール (バッチ処理用、3関数共通)
 * - 開発用 IAM ユーザー (ローカル開発用)
 *
 * 同じポリシーを共有することで、開発者は本番環境の Lambda と全く同じ権限で
 * テストでき、デプロイ前に権限ミスを防ぐことができる。
 *
 * 含まれる権限:
 * - DynamoDB: 読み取り専用に近いアクセス (Query, Scan, GetItem, UpdateItem のみ)
 *   - PutItem, DeleteItem は不可（最小権限の原則）
 * - Secrets Manager: VAPID キーの読み取り (Web Push 通知用)
 * - CloudWatch Logs: ログ書き込み（Lambda 実行ロールで自動付与されるため明示不要）
 */
export class BatchRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: BatchRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `stock-tracker-batch-runtime-${props.envName}`,
      description:
        'Stock Tracker Batch runtime permissions (shared by Lambda and developers)',
    });

    // DynamoDB 権限: Query, Scan, GetItem, UpdateItem のみ（最小権限）
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
        ],
        resources: [
          props.dynamoTable.tableArn,
          `${props.dynamoTable.tableArn}/index/*`, // GSI へのアクセス（AlertIndex）
        ],
      })
    );

    // Secrets Manager 権限: VAPID キー読み取り（Web Push 通知用）
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'SecretsManagerVapidAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.vapidSecret.secretArn],
      })
    );
  }
}

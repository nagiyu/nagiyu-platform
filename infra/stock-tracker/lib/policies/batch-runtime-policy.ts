import * as cdk from 'aws-cdk-lib';
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
 * Batch Lambda 実行ロール (バッチ処理用、3関数共通) が使用する。
 *
 * 含まれる権限:
 * - DynamoDB: バッチ実行に必要なアクセス (Query, Scan, GetItem, UpdateItem, PutItem)
 *   - PutItem は日次サマリーデータ保存（Summary バッチ）で使用
 *   - DeleteItem は不可（最小権限の原則）
 * - Secrets Manager: VAPID キーの読み取り (Web Push 通知用)
 * - Lambda: forecast バッチの非同期起動 (Summary バッチが完了時に呼び出す)
 * - CloudWatch Logs: ログ書き込み（Lambda 実行ロールで自動付与されるため明示不要）
 */
export class BatchRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: BatchRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `stock-tracker-batch-runtime-${props.envName}`,
      // 既存ポリシーの Description を変えると置き換えになり、固定名の衝突でデプロイが失敗するため据え置く
      description: 'Stock Tracker Batch runtime permissions (shared by Lambda and developers)',
    });

    // DynamoDB 権限: Query, Scan, GetItem, UpdateItem, PutItem（最小権限）
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:GetItem',
          'dynamodb:UpdateItem',
          'dynamodb:PutItem',
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

    // Lambda 権限: forecast バッチの非同期起動（Summary バッチの完了時に呼び出す）
    // forecast 関数は Lambda Stack 内で本ポリシーより後に作られるため、Web 側の
    // InvokeSummaryBatchFunction と同じく固定名の ARN を直接組み立てる。
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'InvokeForecastBatchFunction',
        effect: iam.Effect.ALLOW,
        actions: ['lambda:InvokeFunction'],
        resources: [
          `arn:aws:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:nagiyu-stock-tracker-batch-forecast-${props.envName}`,
        ],
      })
    );
  }
}

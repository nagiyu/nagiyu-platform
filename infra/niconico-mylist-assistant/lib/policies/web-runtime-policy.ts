import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * WebRuntimePolicy のプロパティ
 */
export interface WebRuntimePolicyProps {
  /**
   * DynamoDB テーブル
   */
  dynamoTable: dynamodb.ITable;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;

  /**
   * Batch Job Queue ARN
   */
  batchJobQueueArn: string;

  /**
   * Batch Job Definition ARN
   */
  batchJobDefinitionArn: string;

  /**
   * AWS リージョン
   */
  region: string;

  /**
   * AWS アカウント ID
   */
  accountId: string;
}

/**
 * Niconico Mylist Assistant Web Lambda 実行時権限のマネージドポリシー
 *
 * このポリシーは以下の両方で使用される:
 * - Web Lambda 実行ロール (Next.js アプリケーション用)
 * - 開発用 IAM ユーザー (ローカル開発用)
 *
 * 同じポリシーを共有することで、開発者は本番環境の Lambda と全く同じ権限で
 * テストでき、デプロイ前に権限ミスを防ぐことができる。
 *
 * 含まれる権限:
 * - DynamoDB: テーブルへの読み書きアクセス (Query, GetItem, PutItem, UpdateItem, DeleteItem, Scan, BatchGetItem, BatchWriteItem)
 * - AWS Batch: ジョブ投入 (SubmitJob)
 * - Secrets Manager: 暗号化キーの読み取り (GetSecretValue)
 * - CloudWatch Logs: ログ書き込み（Lambda 実行ロールで自動付与されるため明示不要）
 */
export class WebRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: WebRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `niconico-mylist-assistant-web-runtime-${props.envName}`,
      description:
        'Niconico Mylist Assistant Web runtime permissions (shared by Lambda and developers)',
    });

    // DynamoDB 権限: Query, GetItem, PutItem, UpdateItem, DeleteItem, Scan, BatchGetItem, BatchWriteItem
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [
          props.dynamoTable.tableArn,
          `${props.dynamoTable.tableArn}/index/*`, // GSI へのアクセス
        ],
      })
    );

    // AWS Batch 権限: SubmitJob
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'BatchJobSubmission',
        effect: iam.Effect.ALLOW,
        actions: ['batch:SubmitJob'],
        resources: [props.batchJobQueueArn, props.batchJobDefinitionArn],
      })
    );

    // Secrets Manager 権限: 暗号化キーの読み取り
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${props.region}:${props.accountId}:secret:niconico-mylist-assistant/shared-secret-key-*`,
        ],
      })
    );
  }
}

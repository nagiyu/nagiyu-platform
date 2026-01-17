import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
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
   * VAPID シークレット
   */
  vapidSecret: secretsmanager.ISecret;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;
}

/**
 * Stock Tracker Web Lambda 実行時権限のマネージドポリシー
 *
 * このポリシーは以下の両方で使用される:
 * - Web Lambda 実行ロール (Next.js アプリケーション用)
 * - 開発用 IAM ユーザー (ローカル開発用)
 *
 * 同じポリシーを共有することで、開発者は本番環境の Lambda と全く同じ権限で
 * テストでき、デプロイ前に権限ミスを防ぐことができる。
 *
 * 含まれる権限:
 * - DynamoDB: テーブルへの読み書きアクセス (Query, GetItem, PutItem, UpdateItem, DeleteItem)
 * - Secrets Manager: VAPID キーと Auth サービスの NextAuth Secret の読み取り
 * - CloudWatch Logs: ログ書き込み（Lambda 実行ロールで自動付与されるため明示不要）
 */
export class WebRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: WebRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `stock-tracker-web-runtime-${props.envName}`,
      description:
        'Stock Tracker Web runtime permissions (shared by Lambda and developers)',
    });

    // DynamoDB 権限: Query, GetItem, PutItem, UpdateItem, DeleteItem
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
          'dynamodb:Scan', // 取引所一覧取得で使用
        ],
        resources: [
          props.dynamoTable.tableArn,
          `${props.dynamoTable.tableArn}/index/*`, // GSI へのアクセス
        ],
      })
    );

    // Secrets Manager 権限: VAPID キー読み取り
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'SecretsManagerVapidAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [props.vapidSecret.secretArn],
      })
    );

    // Secrets Manager 権限: Auth サービスの NextAuth Secret 読み取り
    // Stock Tracker は Auth サービスから発行された JWT を検証するため、
    // Auth サービスと同じ NEXTAUTH_SECRET にアクセスする必要がある
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'SecretsManagerAuthAccess',
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          // リージョンとアカウントIDは Lambda Stack 内で解決される
          `arn:aws:secretsmanager:*:*:secret:nagiyu-auth-nextauth-secret-${props.envName}-*`,
        ],
      })
    );
  }
}

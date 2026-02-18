import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * AppRuntimePolicy のプロパティ
 */
export interface AppRuntimePolicyProps {
  /**
   * 入出力ファイル用の S3 バケット
   */
  storageBucket: s3.IBucket;

  /**
   * ジョブ管理用の DynamoDB テーブル
   */
  jobsTable: dynamodb.ITable;

  /**
   * AWS Batch ジョブキュー ARN
   */
  jobQueueArn: string;

  /**
   * AWS Batch ジョブ定義名のプレフィックス
   * 例: 'codec-converter-dev' → 'codec-converter-dev-small', 'codec-converter-dev-medium' など
   */
  jobDefinitionPrefix: string;

  /**
   * 環境名 (例: 'dev', 'prod')
   */
  envName: string;
}

/**
 * Codec Converter アプリケーション実行時権限のマネージドポリシー
 *
 * このポリシーは以下の両方で使用される:
 * - Lambda 実行ロール (Next.js アプリケーション用)
 * - 開発用 IAM ユーザー (ローカル開発用)
 *
 * 同じポリシーを共有することで、開発者は本番環境の Lambda と全く同じ権限で
 * テストでき、デプロイ前に権限ミスを防ぐことができる。
 *
 * 含まれる権限:
 * - S3: ストレージバケットへの読み書きアクセス (Presigned URL 用)
 * - DynamoDB: ジョブテーブルへの CRUD 操作
 * - Batch: ジョブの投入、確認、終了
 */
export class AppRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: AppRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `codec-converter-app-runtime-${props.envName}`,
      description:
        'Codec Converter application runtime permissions (shared by Lambda and developers)',
    });

    // S3 権限: Presigned URL 生成とファイル操作
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'S3BucketAccess',
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
        resources: [props.storageBucket.bucketArn, `${props.storageBucket.bucketArn}/*`],
      })
    );

    // DynamoDB 権限: ジョブ管理
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query',
          'dynamodb:Scan',
        ],
        resources: [props.jobsTable.tableArn],
      })
    );

    // AWS Batch 権限: ジョブ投入
    // Note: 複数のジョブ定義 (small, medium, large, xlarge) をサポートするためワイルドカードを使用
    // 例: codec-converter-dev-* → codec-converter-dev-small, codec-converter-dev-medium, etc.
    const jobDefinitionArnPattern = `arn:aws:batch:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:job-definition/${props.jobDefinitionPrefix}-*`;
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'BatchSubmitJob',
        effect: iam.Effect.ALLOW,
        actions: ['batch:SubmitJob'],
        resources: [
          props.jobQueueArn,
          jobDefinitionArnPattern, // All job definitions with the prefix (without version)
          `${jobDefinitionArnPattern}:*`, // All job definitions with the prefix (with version)
        ],
      })
    );

    // AWS Batch 権限: ジョブ管理
    // 注: ジョブ ARN は事前に判明しないため、ワイルドカードを使用
    this.addStatements(
      new iam.PolicyStatement({
        sid: 'BatchManageJobs',
        effect: iam.Effect.ALLOW,
        actions: ['batch:DescribeJobs', 'batch:TerminateJob'],
        resources: ['*'],
      })
    );
  }
}

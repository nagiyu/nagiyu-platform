import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * BatchJobRole のプロパティ
 */
export interface BatchJobRoleProps {
  /**
   * 入出力ファイル用の S3 バケット
   */
  storageBucket: s3.IBucket;

  /**
   * ジョブ管理用の DynamoDB テーブル
   */
  jobsTable: dynamodb.ITable;
}

/**
 * AWS Batch ジョブ用の実行ロール (コンテナランタイム用)
 *
 * このロールは Batch Worker コンテナの実行時に使用され、以下の権限を持つ:
 * - S3: ストレージバケットへの読み書き (ファイルのダウンロード・アップロード)
 * - DynamoDB: ジョブテーブルへの読み書き (ステータス更新)
 *
 * 注: Batch Job の実行ロールは、Lambda の実行ロールとは異なり、
 * 実際のファイル操作を行うため、Presigned URL ではなく直接的な S3 アクセスが必要。
 */
export class BatchJobRole extends iam.Role {
  constructor(scope: Construct, id: string, props: BatchJobRoleProps) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Role for Batch job container runtime',
    });

    // S3 バケットへの読み書き権限を付与
    props.storageBucket.grantReadWrite(this);

    // DynamoDB テーブルへの読み書き権限を付与
    props.jobsTable.grantReadWriteData(this);
  }
}

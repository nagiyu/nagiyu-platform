import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface ErrorEventsTableStackProps extends cdk.StackProps {
  environment: 'dev' | 'prod';
}

/**
 * プラットフォーム共通のエラーイベント永続化テーブルを管理するスタック。
 *
 * このテーブルは複数サービスから書き込まれ、Admin から読み取られる共有リソース。
 * Admin の既存テーブル (nagiyu-admin-main-{env}) とは分離し、
 * 時系列・TTL・Streams の運用要件に最適化したスキーマで構築する。
 */
export class ErrorEventsTableStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ErrorEventsTableStackProps) {
    super(scope, id, props);

    const { environment } = props;

    this.table = new dynamodb.Table(this, 'ErrorEventsTable', {
      tableName: `nagiyu-error-events-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      removalPolicy:
        environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // 全サービス横断の時系列クエリ用 GSI
    this.table.addGlobalSecondaryIndex({
      indexName: 'AllByOccurredAt',
      partitionKey: {
        name: 'GSI1PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI1SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    cdk.Tags.of(this.table).add('Application', 'nagiyu');
    cdk.Tags.of(this.table).add('Service', 'platform');
    cdk.Tags.of(this.table).add('Component', 'error-events');
    cdk.Tags.of(this.table).add('Environment', environment);

    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'Error Events DynamoDB Table Name',
      exportName: `nagiyu-error-events-table-name-${environment}`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'Error Events DynamoDB Table ARN',
      exportName: `nagiyu-error-events-table-arn-${environment}`,
    });

    new cdk.CfnOutput(this, 'TableStreamArn', {
      value: this.table.tableStreamArn ?? '',
      description: 'Error Events DynamoDB Table Stream ARN',
      exportName: `nagiyu-error-events-table-stream-arn-${environment}`,
    });
  }
}

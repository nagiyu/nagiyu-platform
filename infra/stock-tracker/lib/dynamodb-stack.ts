import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDBStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stock Tracker DynamoDB Stack
 *
 * Single Table Design with GSIs:
 * - GSI1 (UserIndex): ユーザーごとのデータ取得
 * - GSI2 (AlertIndex): バッチ処理用（頻度ごとのアラート一覧）
 * - GSI3 (ExchangeTickerIndex): 取引所ごとのティッカー一覧
 */
export class DynamoDBStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB テーブルの作成（Single Table Design）
    this.table = new dynamodb.Table(this, 'MainTable', {
      tableName: `nagiyu-stock-tracker-main-${environment}`,
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // オンデマンドキャパシティ
      pointInTimeRecovery: true, // PITR 有効（35日間保持）
      timeToLiveAttribute: 'TTL', // TTL 属性
      removalPolicy:
        environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      encryption: dynamodb.TableEncryption.AWS_MANAGED, // AWS マネージドキーで暗号化
    });

    // GSI1: UserIndex（ユーザーごとのデータ取得）
    this.table.addGlobalSecondaryIndex({
      indexName: 'UserIndex',
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

    // GSI2: AlertIndex（バッチ処理用、頻度ごとのアラート一覧）
    this.table.addGlobalSecondaryIndex({
      indexName: 'AlertIndex',
      partitionKey: {
        name: 'GSI2PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI2SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI3: ExchangeTickerIndex（取引所ごとのティッカー一覧）
    this.table.addGlobalSecondaryIndex({
      indexName: 'ExchangeTickerIndex',
      partitionKey: {
        name: 'GSI3PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'GSI3SK',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // タグの追加
    cdk.Tags.of(this.table).add('Application', 'nagiyu');
    cdk.Tags.of(this.table).add('Service', 'stock-tracker');
    cdk.Tags.of(this.table).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
      exportName: `${this.stackName}-TableName`,
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB Table ARN',
      exportName: `${this.stackName}-TableArn`,
    });
  }
}

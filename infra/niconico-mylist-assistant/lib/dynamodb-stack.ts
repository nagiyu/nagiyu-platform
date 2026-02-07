import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { getDynamoDBTableName } from '@nagiyu/infra-common';

export interface DynamoDBStackProps extends cdk.StackProps {
  environment: string;
}

export class DynamoDBStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB テーブル (Single Table Design)
    this.table = new dynamodb.Table(this, 'Table', {
      tableName: getDynamoDBTableName('niconico-mylist-assistant', environment as 'dev' | 'prod'),
      partitionKey: {
        name: 'PK',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'SK',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // GSI1: ユーザークエリ用
    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
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

    // タグ
    cdk.Tags.of(this.table).add('Application', 'nagiyu');
    cdk.Tags.of(this.table).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this.table).add('Environment', environment);

    // Outputs
    // Note: exportName is intentionally NOT used to allow flexible updates
    // CDK handles cross-stack references automatically
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB Table Name',
    });

    new cdk.CfnOutput(this, 'TableArn', {
      value: this.table.tableArn,
      description: 'DynamoDB Table ARN',
    });

    new cdk.CfnOutput(this, 'GSI1IndexName', {
      value: 'GSI1',
      description: 'GSI1 Index Name',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDBStackProps extends cdk.StackProps {
  environment: string;
}

export class DynamoDBStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // DynamoDB ユーザーテーブル
    this.table = new dynamodb.Table(this, 'AuthUsersTable', {
      tableName: `nagiyu-auth-users-${environment}`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy:
        environment === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
    });

    // GSI: googleId-index
    this.table.addGlobalSecondaryIndex({
      indexName: 'googleId-index',
      partitionKey: {
        name: 'googleId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // タグ
    cdk.Tags.of(this.table).add('Application', 'nagiyu');
    cdk.Tags.of(this.table).add('Service', 'auth');
    cdk.Tags.of(this.table).add('Environment', environment);

    // Outputs
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

    new cdk.CfnOutput(this, 'GoogleIdIndexName', {
      value: 'googleId-index',
      description: 'GoogleId GSI Name',
      exportName: `${this.stackName}-GoogleIdIndexName`,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import type { QuickClipEnvironment } from './environment';

export interface DynamoDBStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

export class DynamoDBStack extends cdk.Stack {
  public readonly jobsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    this.jobsTable = new dynamodb.Table(this, 'JobsTable', {
      tableName: `nagiyu-quick-clip-jobs-${props.environment}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'JobsTableName', {
      value: this.jobsTable.tableName,
    });
  }
}

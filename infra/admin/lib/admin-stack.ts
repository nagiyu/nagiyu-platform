import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SNSStack } from './sns-stack';
import { DynamoDBStack } from './dynamodb-stack';
import { SecretsStack } from './secrets-stack';

export interface AdminStackProps extends cdk.StackProps {
  environment: string;
}

export class AdminStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { environment } = props;

    new SNSStack(this, `Admin-SNS-${environment}`, {
      environment,
    });

    new DynamoDBStack(this, `Admin-DynamoDB-${environment}`, {
      environment,
    });

    new SecretsStack(this, `Admin-Secrets-${environment}`, {
      environment,
    });
  }
}

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

    new SNSStack(scope, `Admin-SNS-${environment}`, {
      ...props,
      environment,
    });

    new DynamoDBStack(scope, `Admin-DynamoDB-${environment}`, {
      ...props,
      environment,
    });

    new SecretsStack(scope, `Admin-Secrets-${environment}`, {
      ...props,
      environment,
    });
  }
}

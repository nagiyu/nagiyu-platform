import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoDBStack } from './dynamodb-stack';
import { SecretsStack } from './secrets-stack';
import { ECRStack } from './ecr-stack';

export interface AuthStackProps extends cdk.StackProps {
  environment: string;
}

export class AuthStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // 各スタックを作成
    const dynamoDBStack = new DynamoDBStack(
      scope,
      `Auth-DynamoDB-${environment}`,
      {
        ...props,
        environment,
      }
    );

    const secretsStack = new SecretsStack(scope, `Auth-Secrets-${environment}`, {
      ...props,
      environment,
    });

    const ecrStack = new ECRStack(scope, `Auth-ECR-${environment}`, {
      ...props,
      environment,
    });
  }
}

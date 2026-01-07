import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SecretsStack } from './secrets-stack';
import { ECRStack } from './ecr-stack';

export interface AdminStackProps extends cdk.StackProps {
  environment: string;
}

export class AdminStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Secrets スタックを作成
    const secretsStack = new SecretsStack(scope, `Admin-Secrets-${environment}`, {
      ...props,
      environment,
    });

    // ECR スタックを作成
    const ecrStack = new ECRStack(
      scope,
      `Admin-ECR-${environment}`,
      {
        ...props,
        environment,
      }
    );
  }
}

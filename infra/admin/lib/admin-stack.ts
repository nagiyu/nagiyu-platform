import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ECRStack } from './ecr-stack';

export interface AdminStackProps extends cdk.StackProps {
  environment: string;
}

export class AdminStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AdminStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // ECR スタックを作成
    // Note: Secrets Manager は Auth サービスで管理される nagiyu-auth-nextauth-secret を使用
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

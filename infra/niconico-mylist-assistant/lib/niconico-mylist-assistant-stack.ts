import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface NiconicoMylistAssistantStackProps extends cdk.StackProps {
  environment: string;
}

export class NiconicoMylistAssistantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: NiconicoMylistAssistantStackProps) {
    super(scope, id, props);

    // TODO: リソースを追加
    // Phase 1 以降で以下のリソースを実装予定:
    // - DynamoDB テーブル (dynamodb-stack.ts)
    // - Secrets Manager (secrets-stack.ts)
    // - ECR リポジトリ (ecr-stack.ts)
    // - Lambda 関数 (lambda-stack.ts)
    // - CloudFront ディストリビューション (cloudfront-stack.ts)
    // - AWS Batch (batch-stack.ts)
  }
}

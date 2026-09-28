import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface WebRuntimePolicyProps {
  dynamoTable: dynamodb.ITable;
  envName: string;
}

export class WebRuntimePolicy extends iam.ManagedPolicy {
  constructor(scope: Construct, id: string, props: WebRuntimePolicyProps) {
    super(scope, id, {
      managedPolicyName: `share-together-web-runtime-${props.envName}`,
      // 既存ポリシーの Description を変えると置き換えになり、固定名の衝突でデプロイが失敗するため据え置く
      description: 'Share Together Web runtime permissions (shared by Lambda and developers)',
    });

    this.addStatements(
      new iam.PolicyStatement({
        sid: 'DynamoDBTableAccess',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:Query',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Scan',
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
        ],
        resources: [props.dynamoTable.tableArn, `${props.dynamoTable.tableArn}/index/*`],
      })
    );
  }
}

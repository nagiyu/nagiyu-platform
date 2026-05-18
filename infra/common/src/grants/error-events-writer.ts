import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

/**
 * 指定の grantee に error-events テーブルへの書き込み権限を付与する。
 *
 * 内部で `nagiyu-error-events-table-arn-{environment}` を CloudFormation
 * cross-stack import で取得し、`dynamodb:PutItem` を付与する。
 */
export function grantErrorEventsWrite(
  _scope: Construct,
  grantee: iam.IGrantable,
  environment: 'dev' | 'prod'
): void {
  const tableArn = cdk.Fn.importValue(`nagiyu-error-events-table-arn-${environment}`);
  grantee.grantPrincipal.addToPrincipalPolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [tableArn],
    })
  );
}

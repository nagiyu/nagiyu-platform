import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * LambdaExecutionRole のプロパティ
 */
export interface LambdaExecutionRoleProps {
  /**
   * アプリケーション実行権限のマネージドポリシー
   */
  appRuntimePolicy: iam.IManagedPolicy;
}

/**
 * Codec Converter Lambda 関数用の実行ロール
 *
 * このロールは以下の権限を持つ:
 * - AWSLambdaBasicExecutionRole: CloudWatch Logs への書き込み
 * - AppRuntimePolicy: アプリケーション実行権限 (S3, DynamoDB, Batch)
 *
 * AppRuntimePolicy は開発用 IAM ユーザーと共有されるため、
 * Lambda と開発者が同じ権限でテストできる。
 */
export class LambdaExecutionRole extends iam.Role {
  constructor(scope: Construct, id: string, props: LambdaExecutionRoleProps) {
    super(scope, id, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for Codec Converter Lambda function',
      managedPolicies: [
        // CloudWatch Logs への書き込み権限
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        // アプリケーション実行権限 (開発用ユーザーと共有)
        props.appRuntimePolicy,
      ],
    });
  }
}

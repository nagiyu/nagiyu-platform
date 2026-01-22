import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IAMStackProps extends cdk.StackProps {
  environment: string;
  webRuntimePolicy: iam.IManagedPolicy;
  batchRuntimePolicy: iam.IManagedPolicy;
}

/**
 * Stock Tracker IAM Stack
 *
 * 開発用 IAM ユーザーを管理します。
 * 本番環境 (prod) では作成しません（Lambda 実行ロールのみ使用）。
 */
export class IAMStack extends cdk.Stack {
  public readonly devUser?: iam.IUser;

  constructor(scope: Construct, id: string, props: IAMStackProps) {
    super(scope, id, props);

    const { environment, webRuntimePolicy, batchRuntimePolicy } = props;

    // 開発環境のみ IAM ユーザーを作成
    if (environment === 'dev') {
      this.devUser = new iam.User(this, 'DevUser', {
        userName: `stock-tracker-dev-${environment}`,
        managedPolicies: [
          // Web Lambda と同じアプリケーション実行権限
          webRuntimePolicy,
          // Batch Lambda と同じアプリケーション実行権限
          batchRuntimePolicy,
        ],
      });

      // CloudFormation Outputs
      new cdk.CfnOutput(this, 'DevUserName', {
        value: this.devUser.userName,
        description: 'Development IAM User Name',
        exportName: `${this.stackName}-DevUserName`,
      });

      new cdk.CfnOutput(this, 'DevUserArn', {
        value: this.devUser.userArn,
        description: 'Development IAM User ARN',
        exportName: `${this.stackName}-DevUserArn`,
      });
    }
  }
}

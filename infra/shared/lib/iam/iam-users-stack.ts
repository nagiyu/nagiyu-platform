import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IamUsersStackProps extends cdk.StackProps {
  policies: {
    core: iam.IManagedPolicy;
    application: iam.IManagedPolicy;
    container: iam.IManagedPolicy;
    integration: iam.IManagedPolicy;
  };
}

/**
 * IAM Users Stack
 *
 * GitHub Actions と ローカル開発用の IAM ユーザーを管理します。
 * アクセスキーは手動発行するため、このスタックでは作成しません。
 */
export class IamUsersStack extends cdk.Stack {
  public readonly githubActionsUser: iam.IUser;
  public readonly localDevUser: iam.IUser;

  constructor(scope: Construct, id: string, props: IamUsersStackProps) {
    super(scope, id, props);

    // ==========================================
    // GitHub Actions User
    // ==========================================
    this.githubActionsUser = new iam.User(this, 'NagiyuGitHubActionsUser', {
      userName: 'nagiyu-github-actions',
      managedPolicies: [
        props.policies.core,
        props.policies.application,
        props.policies.container,
        props.policies.integration,
      ],
    });


    // ==========================================
    // Local Dev User
    // ==========================================
    this.localDevUser = new iam.User(this, 'NagiyuLocalDevUser', {
      userName: 'nagiyu-local-dev',
      managedPolicies: [
        props.policies.core,
        props.policies.application,
        props.policies.container,
        props.policies.integration,
      ],
    });


    // ==========================================
    // Exports
    // ==========================================
    // GitHub Actions User
    new cdk.CfnOutput(this, 'GitHubActionsUserArnExport', {
      value: this.githubActionsUser.userArn,
      description: 'GitHub Actions user ARN',
    });

    new cdk.CfnOutput(this, 'GitHubActionsUserNameExport', {
      value: this.githubActionsUser.userName,
      description: 'GitHub Actions user name',
    });

    // Local Dev User
    new cdk.CfnOutput(this, 'LocalDevUserArnExport', {
      value: this.localDevUser.userArn,
      description: 'Local developer user ARN',
    });

    new cdk.CfnOutput(this, 'LocalDevUserNameExport', {
      value: this.localDevUser.userName,
      description: 'Local developer user name',
    });
  }
}

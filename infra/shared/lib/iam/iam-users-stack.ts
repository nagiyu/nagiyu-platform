import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EXPORTS } from '../../libs/utils/exports';

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

    // タグの追加
    cdk.Tags.of(this.githubActionsUser).add('Application', 'nagiyu');
    cdk.Tags.of(this.githubActionsUser).add('Purpose', 'GitHub Actions CI/CD');

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

    // タグの追加
    cdk.Tags.of(this.localDevUser).add('Application', 'nagiyu');
    cdk.Tags.of(this.localDevUser).add('Purpose', 'Local developer');

    // ==========================================
    // Exports
    // ==========================================
    // GitHub Actions User
    new cdk.CfnOutput(this, 'GitHubActionsUserArnExport', {
      value: this.githubActionsUser.userArn,
      exportName: EXPORTS.GITHUB_ACTIONS_USER_ARN,
      description: 'GitHub Actions user ARN',
    });

    new cdk.CfnOutput(this, 'GitHubActionsUserNameExport', {
      value: this.githubActionsUser.userName,
      exportName: EXPORTS.GITHUB_ACTIONS_USER_NAME,
      description: 'GitHub Actions user name',
    });

    // Local Dev User
    new cdk.CfnOutput(this, 'LocalDevUserArnExport', {
      value: this.localDevUser.userArn,
      exportName: EXPORTS.LOCAL_DEV_USER_ARN,
      description: 'Local developer user ARN',
    });

    new cdk.CfnOutput(this, 'LocalDevUserNameExport', {
      value: this.localDevUser.userName,
      exportName: EXPORTS.LOCAL_DEV_USER_NAME,
      description: 'Local developer user name',
    });
  }
}

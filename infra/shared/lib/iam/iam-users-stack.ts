import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface IamUsersStackProps extends cdk.StackProps {
  policies: {
    claudeReadonly: iam.IManagedPolicy;
  };
}

/**
 * IAM Users Stack
 *
 * Claude Code on the web 用の IAM ユーザーを管理します。
 * GitHub Actions は GitHub OIDC + AssumeRole（`IamGitHubActionsOidcStack`）で認証するため、
 * ここには GitHub Actions 用の IAM ユーザーは作成しません（旧 `nagiyu-github-actions`
 * ユーザーは全ワークフローの OIDC 移行と本番での稼働確認が済んだため Issue #3820 で撤去済み）。
 * 人のローカル作業は IAM Identity Center（aws sso login）を使うため、ここでは管理しません。
 * アクセスキーは手動発行するため、このスタックでは作成しません。
 */
export class IamUsersStack extends cdk.Stack {
  public readonly claudeReadonlyUser: iam.IUser;

  constructor(scope: Construct, id: string, props: IamUsersStackProps) {
    super(scope, id, props);

    // ==========================================
    // Claude Read-Only User
    // ==========================================
    this.claudeReadonlyUser = new iam.User(this, 'NagiyuClaudeReadonlyUser', {
      userName: 'nagiyu-claude-readonly',
      managedPolicies: [props.policies.claudeReadonly],
    });

    // ==========================================
    // Exports
    // ==========================================
    // Claude Read-Only User
    new cdk.CfnOutput(this, 'ClaudeReadonlyUserArnExport', {
      value: this.claudeReadonlyUser.userArn,
      description: 'Claude readonly user ARN',
    });

    new cdk.CfnOutput(this, 'ClaudeReadonlyUserNameExport', {
      value: this.claudeReadonlyUser.userName,
      description: 'Claude readonly user name',
    });
  }
}

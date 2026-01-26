import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stock Tracker Secrets Stack
 *
 * VAPID キー（Web Push 通知用）と開発用 IAM 認証情報を Secrets Manager で管理します。
 * 初回デプロイ時は PLACEHOLDER 値で作成し、後で AWS Console から実際の値を上書きします。
 */
export class SecretsStack extends cdk.Stack {
  public readonly vapidSecret: secretsmanager.ISecret;
  public readonly devCredentialsSecret?: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // VAPID キーシークレット（初回は PLACEHOLDER 値）
    this.vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
      secretName: `nagiyu-stock-tracker-vapid-${environment}`,
      description: 'VAPID key pair for Web Push notifications',
      secretObjectValue: {
        publicKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
        privateKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
      },
    });

    // タグの追加
    cdk.Tags.of(this.vapidSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.vapidSecret).add('Service', 'stock-tracker');
    cdk.Tags.of(this.vapidSecret).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'VapidSecretArn', {
      value: this.vapidSecret.secretArn,
      description: 'VAPID Secret ARN',
      exportName: `${this.stackName}-VapidSecretArn`,
    });

    new cdk.CfnOutput(this, 'VapidSecretName', {
      value: this.vapidSecret.secretName,
      description: 'VAPID Secret Name',
      exportName: `${this.stackName}-VapidSecretName`,
    });

    // 開発用 IAM 認証情報シークレット（dev 環境のみ）
    if (environment === 'dev') {
      this.devCredentialsSecret = new secretsmanager.Secret(this, 'DevCredentialsSecret', {
        secretName: `nagiyu-stock-tracker-dev-credentials-${environment}`,
        description: 'IAM credentials for development user (used by E2E tests)',
        secretObjectValue: {
          accessKeyId: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
          secretAccessKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
        },
      });

      // タグの追加
      cdk.Tags.of(this.devCredentialsSecret).add('Application', 'nagiyu');
      cdk.Tags.of(this.devCredentialsSecret).add('Service', 'stock-tracker');
      cdk.Tags.of(this.devCredentialsSecret).add('Environment', environment);

      // CloudFormation Outputs
      new cdk.CfnOutput(this, 'DevCredentialsSecretArn', {
        value: this.devCredentialsSecret.secretArn,
        description: 'Development IAM Credentials Secret ARN',
        exportName: `${this.stackName}-DevCredentialsSecretArn`,
      });

      new cdk.CfnOutput(this, 'DevCredentialsSecretName', {
        value: this.devCredentialsSecret.secretName,
        description: 'Development IAM Credentials Secret Name',
        exportName: `${this.stackName}-DevCredentialsSecretName`,
      });
    }
  }
}

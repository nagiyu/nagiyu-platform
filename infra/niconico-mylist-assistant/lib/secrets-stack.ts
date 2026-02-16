import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Niconico Mylist Assistant Secrets Stack
 *
 * パスワード暗号化用の共有キーと VAPID キーを Secrets Manager で管理します。
 * - 暗号化キーは AES-256-GCM 用の32バイトランダム値を自動生成します。
 * - VAPID キーは PLACEHOLDER 値で作成し、後で実際の値に上書きします。
 */
export class SecretsStack extends cdk.Stack {
  public readonly encryptionSecret: secretsmanager.ISecret;
  public readonly vapidSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // 暗号化キーシークレット（自動生成）
    // AES-256-GCM で使用する32バイト（256ビット）のランダムキー
    // 32文字以上のランダム文字列を生成し、UTF-8バイト列として先頭32バイトを使用
    this.encryptionSecret = new secretsmanager.Secret(this, 'EncryptionSecret', {
      secretName: `niconico-mylist-assistant/shared-secret-key-${environment}`,
      description: 'Shared encryption key for password encryption (AES-256-GCM)',
      generateSecretString: {
        passwordLength: 32,
        excludeCharacters: '',
        requireEachIncludedType: false,
      },
    });

    // タグの追加
    cdk.Tags.of(this.encryptionSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.encryptionSecret).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this.encryptionSecret).add('Environment', environment);

    // CloudFormation Outputs
    // Note: exportName is intentionally NOT used to allow flexible updates
    // CDK handles cross-stack references automatically
    new cdk.CfnOutput(this, 'EncryptionSecretArn', {
      value: this.encryptionSecret.secretArn,
      description: 'Encryption Secret ARN',
    });

    new cdk.CfnOutput(this, 'EncryptionSecretName', {
      value: this.encryptionSecret.secretName,
      description: 'Encryption Secret Name',
    });

    // VAPID キーシークレット（初回は PLACEHOLDER 値）
    // Web Push 通知用の VAPID キーペア
    // デプロイ後に実際のキーに上書きする必要があります
    this.vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
      secretName: `nagiyu-niconico-mylist-assistant-vapid-${environment}`,
      description: 'VAPID key pair for Web Push notifications',
      secretObjectValue: {
        publicKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
        privateKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
      },
    });

    // タグの追加
    cdk.Tags.of(this.vapidSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.vapidSecret).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this.vapidSecret).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'VapidSecretArn', {
      value: this.vapidSecret.secretArn,
      description: 'VAPID Secret ARN',
    });

    new cdk.CfnOutput(this, 'VapidSecretName', {
      value: this.vapidSecret.secretName,
      description: 'VAPID Secret Name',
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Niconico Mylist Assistant Secrets Stack
 *
 * パスワード暗号化用の共有キーを Secrets Manager で管理します。
 * 暗号化キーは AES-256-GCM 用の32バイトランダム値を自動生成します。
 */
export class SecretsStack extends cdk.Stack {
  public readonly encryptionSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // 暗号化キーシークレット（自動生成）
    // AES-256-GCM で使用する32バイト（256ビット）のランダムキー
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
  }
}

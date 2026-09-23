import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { SECRET_NAMES, type Environment } from '@nagiyu/infra-common';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly googleOAuthSecret: secretsmanager.Secret;
  public readonly nextAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;
    // props.environment は string 型のため、共通レジストリに渡す際に Environment へ寄せる
    // （infra/root/alb-stack.ts と同じ扱い）。
    const secretEnvironment = environment as Environment;

    // Google OAuth credentials
    this.googleOAuthSecret = new secretsmanager.Secret(
      this,
      'GoogleOAuthSecret',
      {
        secretName: SECRET_NAMES.AUTH_GOOGLE_OAUTH(secretEnvironment),
        description: 'Google OAuth credentials for Auth service',
        secretObjectValue: {
          clientId: cdk.SecretValue.unsafePlainText('PLACEHOLDER_CLIENT_ID'),
          clientSecret: cdk.SecretValue.unsafePlainText(
            'PLACEHOLDER_CLIENT_SECRET'
          ),
        },
      }
    );

    // NextAuth.js secret
    this.nextAuthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
      secretName: SECRET_NAMES.AUTH_NEXTAUTH(secretEnvironment),
      description: 'NextAuth.js secret key for JWT signing',
      generateSecretString: {
        passwordLength: 32,
        excludeCharacters: '"@/\\',
      },
    });

    // タグ
    cdk.Tags.of(this.googleOAuthSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.googleOAuthSecret).add('Service', 'auth');
    cdk.Tags.of(this.googleOAuthSecret).add('Environment', environment);

    cdk.Tags.of(this.nextAuthSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.nextAuthSecret).add('Service', 'auth');
    cdk.Tags.of(this.nextAuthSecret).add('Environment', environment);

    // Outputs
    new cdk.CfnOutput(this, 'GoogleOAuthSecretArn', {
      value: this.googleOAuthSecret.secretArn,
      description: 'Google OAuth Secret ARN',
    });

    new cdk.CfnOutput(this, 'GoogleOAuthSecretName', {
      value: this.googleOAuthSecret.secretName,
      description: 'Google OAuth Secret Name',
    });

    new cdk.CfnOutput(this, 'NextAuthSecretArn', {
      value: this.nextAuthSecret.secretArn,
      description: 'NextAuth Secret ARN',
    });

    new cdk.CfnOutput(this, 'NextAuthSecretName', {
      value: this.nextAuthSecret.secretName,
      description: 'NextAuth Secret Name',
    });
  }
}

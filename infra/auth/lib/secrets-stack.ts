import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly googleOAuthSecret: secretsmanager.Secret;
  public readonly nextAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // Google OAuth credentials
    this.googleOAuthSecret = new secretsmanager.Secret(
      this,
      'GoogleOAuthSecret',
      {
        secretName: `nagiyu-auth-google-oauth-${environment}`,
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
      secretName: `nagiyu-auth-nextauth-secret-${environment}`,
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
      exportName: `${this.stackName}-GoogleOAuthSecretArn`,
    });

    new cdk.CfnOutput(this, 'GoogleOAuthSecretName', {
      value: this.googleOAuthSecret.secretName,
      description: 'Google OAuth Secret Name',
      exportName: `${this.stackName}-GoogleOAuthSecretName`,
    });

    new cdk.CfnOutput(this, 'NextAuthSecretArn', {
      value: this.nextAuthSecret.secretArn,
      description: 'NextAuth Secret ARN',
      exportName: `${this.stackName}-NextAuthSecretArn`,
    });

    new cdk.CfnOutput(this, 'NextAuthSecretName', {
      value: this.nextAuthSecret.secretName,
      description: 'NextAuth Secret Name',
      exportName: `${this.stackName}-NextAuthSecretName`,
    });
  }
}

import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly nextAuthSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // NextAuth.js secret
    this.nextAuthSecret = new secretsmanager.Secret(this, 'NextAuthSecret', {
      secretName: `nagiyu-admin-nextauth-secret-${environment}`,
      description: 'NextAuth.js secret key for JWT signing (Admin service)',
      generateSecretString: {
        passwordLength: 32,
        excludeCharacters: '"@/\\',
      },
    });

    // タグ
    cdk.Tags.of(this.nextAuthSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.nextAuthSecret).add('Service', 'admin');
    cdk.Tags.of(this.nextAuthSecret).add('Environment', environment);

    // Outputs
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

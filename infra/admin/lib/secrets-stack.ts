import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SecretsStackProps extends cdk.StackProps {
  environment: string;
}

export class SecretsStack extends cdk.Stack {
  public readonly vapidSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    this.vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
      secretName: `nagiyu-admin-vapid-${environment}`,
      description: 'VAPID key pair for Admin Web Push notifications',
      secretObjectValue: {
        publicKey: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
        privateKey: cdk.SecretValue.unsafePlainText('REPLACE_ME'),
      },
    });

    cdk.Tags.of(this.vapidSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.vapidSecret).add('Service', 'admin');
    cdk.Tags.of(this.vapidSecret).add('Environment', environment);

    new cdk.CfnOutput(this, 'VapidSecretArn', {
      value: this.vapidSecret.secretArn,
      description: 'VAPID Secret ARN',
    });
  }
}

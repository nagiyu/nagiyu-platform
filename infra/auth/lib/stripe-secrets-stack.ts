import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { SECRET_NAMES, type Environment } from '@nagiyu/infra-common';

export interface StripeSecretsStackProps extends cdk.StackProps {
  environment: string;
}

/**
 * Stripe の鍵の秘密情報。
 */
export class StripeSecretsStack extends cdk.Stack {
  public readonly stripeSecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StripeSecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;
    // props.environment は string 型のため、共通レジストリに渡す際に Environment へ寄せる
    const secretEnvironment = environment as Environment;

    this.stripeSecret = new secretsmanager.Secret(this, 'StripeSecret', {
      secretName: SECRET_NAMES.AUTH_STRIPE(secretEnvironment),
      description: 'Stripe API keys for Auth service',
      secretObjectValue: {
        secretKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER_SECRET_KEY'),
        webhookSecret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_WEBHOOK_SECRET'),
      },
    });

    cdk.Tags.of(this.stripeSecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.stripeSecret).add('Service', 'auth');
    cdk.Tags.of(this.stripeSecret).add('Environment', environment);

    new cdk.CfnOutput(this, 'StripeSecretArn', {
      value: this.stripeSecret.secretArn,
      description: 'Stripe Secret ARN',
    });

    new cdk.CfnOutput(this, 'StripeSecretName', {
      value: this.stripeSecret.secretName,
      description: 'Stripe Secret Name',
    });
  }
}

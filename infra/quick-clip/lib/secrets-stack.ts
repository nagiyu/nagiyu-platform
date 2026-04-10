import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { QuickClipEnvironment } from './environment';

export interface SecretsStackProps extends cdk.StackProps {
  environment: QuickClipEnvironment;
}

/**
 * Quick Clip Secrets Stack
 *
 * OpenAI API キーを Secrets Manager で管理します。
 * 初回デプロイ時は PLACEHOLDER 値で作成し、後で AWS Console から実際の値を上書きします。
 * 実行時は CDK デプロイ時に --context openAiApiKey=xxx でキーを渡し、Lambda 環境変数として注入します。
 */
export class SecretsStack extends cdk.Stack {
  public readonly openAiApiKeySecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    // OpenAI API キーシークレット（初回は PLACEHOLDER 値）
    this.openAiApiKeySecret = new secretsmanager.Secret(this, 'OpenAiApiKeySecret', {
      secretName: `nagiyu-quick-clip-openai-api-key-${environment}`,
      description: 'OpenAI API key for Quick Clip emotion score extraction',
      secretObjectValue: {
        apiKey: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
      },
    });

    // タグの追加
    cdk.Tags.of(this.openAiApiKeySecret).add('Application', 'nagiyu');
    cdk.Tags.of(this.openAiApiKeySecret).add('Service', 'quick-clip');
    cdk.Tags.of(this.openAiApiKeySecret).add('Environment', environment);

    // CloudFormation Outputs
    new cdk.CfnOutput(this, 'OpenAiApiKeySecretArn', {
      value: this.openAiApiKeySecret.secretArn,
      description: 'OpenAI API Key Secret ARN',
    });

    new cdk.CfnOutput(this, 'OpenAiApiKeySecretName', {
      value: this.openAiApiKeySecret.secretName,
      description: 'OpenAI API Key Secret Name',
    });
  }
}

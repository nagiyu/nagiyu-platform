import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import type { Environment } from '@nagiyu/infra-common';

export interface LiveTalkSecretsStackProps extends cdk.StackProps {
  environment: Environment;
}

/**
 * LiveTalk Secrets Stack（Phase 2b / Issue #3248）
 *
 * LLM Provider 用の API キーを Secrets Manager で管理する。
 * 初回デプロイ時は PLACEHOLDER で作成し、実際の値は AWS Console から上書き運用する。
 *
 * - シークレット命名: `/nagiyu/livetalk/{env}/openai/api-key`
 * - 値: プレーンテキスト（`SecretString` = API キーそのもの）
 * - アクセス: ECS Task Role に `secretsmanager:GetSecretValue` を付与（ecs-service-stack で実施）
 *
 * Phase 2b 時点では Provider は OpenAI のみ。別 Provider が必要になったら同じ
 * 命名規約（`/nagiyu/livetalk/{env}/{provider}/api-key`）でここに追加する。
 */
export class LiveTalkSecretsStack extends cdk.Stack {
  public readonly openAiApiKeySecret: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: LiveTalkSecretsStackProps) {
    super(scope, id, props);

    const { environment } = props;

    this.openAiApiKeySecret = new secretsmanager.Secret(this, 'OpenAiApiKeySecret', {
      secretName: openAiSecretName(environment),
      description: `LiveTalk OpenAI API key (${environment})`,
      secretStringValue: cdk.SecretValue.unsafePlainText('PLACEHOLDER'),
    });

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new cdk.CfnOutput(this, 'OpenAiApiKeySecretArn', {
      value: this.openAiApiKeySecret.secretArn,
      description: 'LiveTalk OpenAI API key Secret ARN',
    });

    new cdk.CfnOutput(this, 'OpenAiApiKeySecretName', {
      value: this.openAiApiKeySecret.secretName,
      description: 'LiveTalk OpenAI API key Secret Name',
    });
  }
}

export function openAiSecretName(environment: Environment): string {
  return `/nagiyu/livetalk/${environment}/openai/api-key`;
}

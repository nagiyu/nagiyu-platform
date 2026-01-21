#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(
    `Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`
  );
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// Phase 0: スケルトンのみ（空のスタック）
// Phase 1 以降で以下のスタックを実装予定:
// - DynamoDB スタック (NagiyuNiconicoMylistAssistantDynamoDB{Dev|Prod})
// - Secrets スタック (NagiyuNiconicoMylistAssistantSecrets{Dev|Prod})
// - ECR スタック (NagiyuNiconicoMylistAssistantECR{Dev|Prod})
// - Lambda スタック (NagiyuNiconicoMylistAssistantLambda{Dev|Prod})
// - CloudFront スタック (NagiyuNiconicoMylistAssistantCloudFront{Dev|Prod})
// - Batch スタック (NagiyuNiconicoMylistAssistantBatch{Dev|Prod})

// Phase 0: 空のプレースホルダースタック（CDK synth を成功させるため）
new cdk.Stack(app, `NagiyuNiconicoMylistAssistantPlaceholder${envSuffix}`, {
  env: stackEnv,
  description: `Niconico Mylist Assistant Placeholder - ${env} environment (Phase 0)`,
  tags: {
    Environment: env,
    Service: 'niconico-mylist-assistant',
  },
});

app.synth();

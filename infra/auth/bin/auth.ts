#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { SecretsStack } from '../lib/secrets-stack';
import { ECRStack } from '../lib/ecr-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

// 環境変数からバージョンを取得（デフォルト: '1.0.0'）
const appVersion = process.env.APP_VERSION || '1.0.0';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`);
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// DynamoDB スタックを作成
new DynamoDBStack(app, `NagiyuAuthDynamoDB${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Auth Service DynamoDB - ${env} environment`,
});

// Secrets スタックを作成
new SecretsStack(app, `NagiyuAuthSecrets${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Auth Service Secrets Manager - ${env} environment`,
});

// ECR スタックを作成
const ecrStack = new ECRStack(app, `NagiyuAuthECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Auth Service ECR - ${env} environment`,
});

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `NagiyuAuthLambda${envSuffix}`, {
  environment: env,
  appVersion: appVersion,
  env: stackEnv,
  description: `Auth Service Lambda - ${env} environment`,
});

// CloudFront スタックを作成
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

new CloudFrontStack(app, `NagiyuAuthCloudFront${envSuffix}`, {
  environment: env,
  functionUrl: lambdaStack.functionUrl.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 必須
  },
  crossRegionReferences: true,
  description: `Auth Service CloudFront - ${env} environment`,
});

app.synth();

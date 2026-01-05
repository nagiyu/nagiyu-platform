#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';

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

// Auth スタック (DynamoDB, Secrets, ECR) を作成
new AuthStack(app, `Auth-${env}`, {
  environment: env,
  env: stackEnv,
  description: `Auth Service Infrastructure - ${env} environment`,
});

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `Auth-Lambda-${env}`, {
  environment: env,
  env: stackEnv,
  description: `Auth Service Lambda - ${env} environment`,
});

// CloudFront スタックを作成
new CloudFrontStack(app, `Auth-CloudFront-${env}`, {
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

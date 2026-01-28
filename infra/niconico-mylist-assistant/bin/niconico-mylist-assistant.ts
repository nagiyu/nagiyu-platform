#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { WebECRStack, BatchECRStack } from '../lib/ecr-stacks';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import { BatchStack } from '../lib/batch-stack';

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

// DynamoDB スタックを作成
new DynamoDBStack(app, `NagiyuNiconicoMylistAssistantDynamoDB${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant DynamoDB - ${env} environment`,
});

// ECR スタックを作成（web用）
const webEcrStack = new WebECRStack(app, `NagiyuNiconicoMylistAssistantWebECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Web ECR - ${env} environment`,
});

// ECR スタックを作成（batch用）
const batchEcrStack = new BatchECRStack(app, `NagiyuNiconicoMylistAssistantBatchECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Batch ECR - ${env} environment`,
});

// Batch スタックを作成
const batchStack = new BatchStack(app, `NagiyuNiconicoMylistAssistantBatch${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Batch - ${env} environment`,
});

// Batch は Batch ECR に依存
batchStack.addDependency(batchEcrStack);

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `NagiyuNiconicoMylistAssistantLambda${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Lambda - ${env} environment`,
});

// Lambda は Web ECR に依存
lambdaStack.addDependency(webEcrStack);

// CloudFront スタックを作成
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

const cloudFrontStack = new CloudFrontStack(app, `NagiyuNiconicoMylistAssistantCloudFront${envSuffix}`, {
  environment: env,
  functionUrl: lambdaStack.functionUrl.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 必須
  },
  crossRegionReferences: true,
  description: `Niconico Mylist Assistant CloudFront - ${env} environment`,
});

// CloudFront は Lambda に依存
cloudFrontStack.addDependency(lambdaStack);

app.synth();

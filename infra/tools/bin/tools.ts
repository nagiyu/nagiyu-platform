#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../lib/ecr-stack';
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

// ECR スタックを作成
const ecrStack = new EcrStack(app, `Tools-Ecr-${env}`, {
  environment: env,
  env: stackEnv,
  description: `Tools Service ECR Repository - ${env} environment`,
});

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `Tools-Lambda-${env}`, {
  environment: env,
  env: stackEnv,
  description: `Tools Service Lambda - ${env} environment`,
});

// Lambda は ECR に依存
lambdaStack.addDependency(ecrStack);

// CloudFront スタックを作成
const cloudFrontStack = new CloudFrontStack(app, `Tools-CloudFront-${env}`, {
  environment: env,
  functionUrl: lambdaStack.functionUrl.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 必須
  },
  crossRegionReferences: true,
  description: `Tools Service CloudFront - ${env} environment`,
});

// CloudFront は Lambda に依存
cloudFrontStack.addDependency(lambdaStack);

app.synth();

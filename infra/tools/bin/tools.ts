#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../lib/ecr-stack';
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

// ECR スタックを作成
const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);
const ecrStack = new EcrStack(app, `NagiyuToolsEcr${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Tools Service ECR Repository - ${env} environment`,
});

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `NagiyuToolsLambda${envSuffix}`, {
  environment: env,
  appVersion: appVersion,
  env: stackEnv,
  description: `Tools Service Lambda - ${env} environment`,
});

// Lambda は ECR に依存
lambdaStack.addDependency(ecrStack);

// CloudFront スタックを作成
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

const cloudFrontStack = new CloudFrontStack(app, `NagiyuToolsCloudFront${envSuffix}`, {
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

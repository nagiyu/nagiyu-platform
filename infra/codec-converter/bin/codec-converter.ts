#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CodecConverterStack } from '../lib/codec-converter-stack';
import { BatchECRStack, WebECRStack } from '../lib/ecr-stacks';

const app = new cdk.App();

// Get environment name from context (default to 'dev')
const envName = app.node.tryGetContext('env') || 'dev';
const envSuffix = envName.charAt(0).toUpperCase() + envName.slice(1);

// 環境変数からバージョンを取得（デフォルト: '1.0.0'）
const appVersion = process.env.APP_VERSION || '1.0.0';

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// ECR スタックは本体と独立して先に deploy し、イメージを push できる状態にする。
new WebECRStack(app, `NagiyuCodecConverterECR${envSuffix}`, {
  environment: envName,
  env: stackEnv,
  description: `Codec Converter Web ECR - ${envName} environment`,
});

new BatchECRStack(app, `NagiyuCodecConverterBatchECR${envSuffix}`, {
  environment: envName,
  env: stackEnv,
  description: `Codec Converter Batch ECR - ${envName} environment`,
});

new CodecConverterStack(app, `NagiyuCodecConverter${envSuffix}`, {
  appVersion: appVersion,
  env: stackEnv,
  description: `Codec Converter Infrastructure Stack for ${envName} environment`,
});

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

if (!['dev', 'prod'].includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed: dev, prod`);
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// VPC スタックを作成
new VpcStack(app, `SharedVpc-${env}`, {
  environment: env as 'dev' | 'prod',
  env: stackEnv,
  description: `Shared VPC Infrastructure - ${env} environment`,
});

app.synth();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DevSyncEcrStack } from '../lib/ecr-stack.js';
import { DevSyncStack } from '../lib/dev-sync-stack.js';
import { MANIFEST } from '../lib/manifest.js';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(
    `無効な環境です: ${env}。許可された値: ${allowedEnvironments.join(', ')}`
  );
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// ECR スタックを作成
new DevSyncEcrStack(app, `NagiyuDevSyncECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `dev-sync ECR - ${env} 環境`,
});

// dev-sync メインスタックを作成
// Phase A: MANIFEST は空配列のためスケジュールは 0 個
new DevSyncStack(app, `NagiyuDevSync${envSuffix}`, {
  environment: env as 'dev' | 'prod',
  ecrRepositoryName: `nagiyu-dev-sync-ecr-${env}`,
  manifest: MANIFEST,
  env: stackEnv,
  description: `dev-sync Lambda + EventBridge Scheduler - ${env} 環境`,
});

app.synth();

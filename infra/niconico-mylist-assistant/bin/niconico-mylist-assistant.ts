#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NiconicoMylistAssistantStack } from '../lib/niconico-mylist-assistant-stack';

const app = new cdk.App();

// 環境パラメータを取得
const environment = app.node.tryGetContext('env') || 'dev';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(environment)) {
  throw new Error(
    `Invalid environment: ${environment}. Allowed values: ${allowedEnvironments.join(', ')}`
  );
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = environment.charAt(0).toUpperCase() + environment.slice(1);

// メインスタックを作成
new NiconicoMylistAssistantStack(app, `NagiyuNiconicoMylistAssistant${envSuffix}`, {
  environment,
  env: stackEnv,
  description: `Niconico Mylist Assistant - ${environment} environment`,
  tags: {
    Environment: environment,
    Service: 'niconico-mylist-assistant',
  },
});

app.synth();

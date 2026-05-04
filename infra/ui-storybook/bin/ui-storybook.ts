#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorybookStack } from '../lib/storybook-stack';

const app = new cdk.App();

// 環境パラメータ。現状 dev のみ提供。
const env = app.node.tryGetContext('env') || 'dev';

const allowedEnvironments = ['dev'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(
    `Invalid environment for ui-storybook: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`
  );
}

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// CloudFront / ACM 証明書は us-east-1 が必須
new StorybookStack(app, `NagiyuUiStorybook${envSuffix}`, {
  environment: env as 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: `UI Storybook Stack - ${env} (S3 + CloudFront, dev-storybook.nagiyu.com)`,
});

app.synth();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { QuickClipStack } from '../lib/quick-clip-stack';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';
const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);
const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

new QuickClipStack(app, `NagiyuQuickClip${envSuffix}`, {
  environment: env,
  env: stackEnv,
});

app.synth();

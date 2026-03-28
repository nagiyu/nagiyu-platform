#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { QuickClipStack } from '../lib/quick-clip-stack';

const app = new cdk.App();
const env = app.node.tryGetContext('env') || 'dev';

new QuickClipStack(app, `NagiyuQuickClip${env.charAt(0).toUpperCase()}${env.slice(1)}`, {
  environment: env,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

app.synth();

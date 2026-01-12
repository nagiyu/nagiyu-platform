#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CodecConverterStack } from '../lib/codec-converter-stack';

const app = new cdk.App();

// Get environment name from context (default to 'dev')
const envName = app.node.tryGetContext('env') || 'dev';
const envSuffix = envName.charAt(0).toUpperCase() + envName.slice(1);

new CodecConverterStack(app, `NagiyuCodecConverter${envSuffix}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `Codec Converter Infrastructure Stack for ${envName} environment`,
});

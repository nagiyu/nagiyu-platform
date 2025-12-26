#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CodecConverterStack } from '../lib/codec-converter-stack';

const app = new cdk.App();

// Get environment name from context (default to 'dev')
const envName = app.node.tryGetContext('env') || 'dev';

new CodecConverterStack(app, `CodecConverterStack-${envName}`, {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `Codec Converter Infrastructure Stack for ${envName} environment`,
});

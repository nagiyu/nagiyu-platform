#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

const app = new cdk.App();

// Create a minimal empty stack for setup verification
// This stack will not be deployed; it's only for validating the CDK setup
new cdk.Stack(app, 'NagiyuSetupVerification', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'Temporary stack for CDK setup verification - do not deploy',
});

// Real stacks will be added here in future phases

app.synth();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../shared/vpc/vpc-stack';

const app = new cdk.App();

// Environment configuration
const environment = 'prod'; // Starting with prod environment only
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// VPC Stack for root domain infrastructure
new VpcStack(app, `nagiyu-${environment}-vpc`, {
  env: { account, region },
  environment,
  description: `VPC infrastructure for nagiyu-platform ${environment} environment`,
});

app.synth();

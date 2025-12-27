#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsClusterStack } from '../root/ecs-cluster-stack';

const app = new cdk.App();

// Environment configuration
// Default to 'dev' to prevent accidental production deployments
const environment = process.env.ENVIRONMENT || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// ECS Cluster Stack for root domain
new EcsClusterStack(app, `nagiyu-root-ecs-cluster-${environment}`, {
  env: { account, region },
  environment,
  description: `ECS Cluster for nagiyu root domain (${environment})`,
});

app.synth();

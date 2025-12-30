#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsClusterStack } from '../root/ecs-cluster-stack';
import { AlbStack } from '../root/alb-stack';
import { EcsServiceStack } from '../root/ecs-service-stack';
import { CloudFrontStack } from '../root/cloudfront-stack';

const app = new cdk.App();

// Environment configuration
// Default to 'dev' to prevent accidental production deployments
const environment = process.env.ENVIRONMENT || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// ECS Cluster Stack for root domain
const ecsClusterStack = new EcsClusterStack(
  app,
  `nagiyu-root-ecs-cluster-${environment}`,
  {
    env: { account, region },
    environment,
    description: `ECS Cluster for nagiyu root domain (${environment})`,
  }
);

// ALB Stack for root domain
const albStack = new AlbStack(app, `nagiyu-root-alb-${environment}`, {
  env: { account, region },
  environment,
  description: `Application Load Balancer for nagiyu root domain (${environment})`,
});

// ECS Service Stack for root domain
const ecsServiceStack = new EcsServiceStack(
  app,
  `nagiyu-root-ecs-service-${environment}`,
  {
    env: { account, region },
    environment,
    description: `ECS Service for nagiyu root domain (${environment})`,
  }
);

// Set up dependencies
ecsServiceStack.addDependency(ecsClusterStack);
ecsServiceStack.addDependency(albStack);

// CloudFront Stack for root domain
const cloudFrontStack = new CloudFrontStack(
  app,
  `nagiyu-root-cloudfront-${environment}`,
  {
    env: { account, region },
    environment,
    description: `CloudFront Distribution for nagiyu root domain (${environment})`,
  }
);

// CloudFront depends on ALB
cloudFrontStack.addDependency(albStack);

app.synth();

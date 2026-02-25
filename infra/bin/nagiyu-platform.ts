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
const envSuffix = environment.charAt(0).toUpperCase() + environment.slice(1);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// ECS Cluster Stack for root domain
const ecsClusterStack = new EcsClusterStack(
  app,
  `NagiyuRootCluster${envSuffix}`,
  {
    env: { account, region },
    environment,
    description: `ECS Cluster for nagiyu root domain (${environment})`,
  }
);

// ALB Stack for root domain
const albStack = new AlbStack(app, `NagiyuRootAlb${envSuffix}`, {
  env: { account, region },
  environment,
  description: `Application Load Balancer for nagiyu root domain (${environment})`,
});

// ECS Service Stack for root domain
const ecsServiceStack = new EcsServiceStack(
  app,
  `NagiyuRootService${envSuffix}`,
  {
    env: { account, region },
    environment,
    description: `ECS Service for nagiyu root domain (${environment})`,
  }
);

// CloudFront Stack for root domain
const cloudFrontStack = new CloudFrontStack(
  app,
  `NagiyuRootCloudFront${envSuffix}`,
  {
    env: { account, region },
    environment,
    description: `CloudFront Distribution for nagiyu root domain (${environment})`,
  }
);

// Explicit stack dependencies (CDK does not detect SSM-based cross-stack dependencies automatically)
// EcsService reads Cluster SSM and ALB SSM → must wait for both
ecsServiceStack.addDependency(ecsClusterStack);
ecsServiceStack.addDependency(albStack);
// CloudFront reads ALB DNS SSM → must wait for ALB
cloudFrontStack.addDependency(albStack);

app.synth();

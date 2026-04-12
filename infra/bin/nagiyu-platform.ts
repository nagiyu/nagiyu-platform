#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcrStack } from '../root/ecr-stack';
import { EcsClusterStack } from '../root/ecs-cluster-stack';
import { AlbStack } from '../root/alb-stack';
import { EcsServiceStack } from '../root/ecs-service-stack';
import { CloudFrontStack } from '../root/cloudfront-stack';
import { PortalLambdaStack } from '../root/portal-lambda-stack';
import { CloudFrontLambdaStack } from '../root/cloudfront-lambda-stack';

const app = new cdk.App();

// Environment configuration
// Default to 'dev' to prevent accidental production deployments
const environment = process.env.ENVIRONMENT || 'dev';
const envSuffix = environment.charAt(0).toUpperCase() + environment.slice(1);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// Portal ECR Repository Stack（共通）
const ecrStack = new EcrStack(app, `NagiyuPortalEcr${envSuffix}`, {
  env: { account, region },
  environment,
  description: `Portal ECR Repository (${environment})`,
});

if (environment === 'dev') {
  // Dev 環境: Lambda + Function URL + CloudFront
  // Dev VPC はシングル AZ のため ALB 使用不可
  const lambdaStack = new PortalLambdaStack(app, `NagiyuPortalLambda${envSuffix}`, {
    env: { account, region },
    environment,
    description: `Portal Lambda Function (${environment})`,
  });
  lambdaStack.addDependency(ecrStack);

  const cloudFrontLambdaStack = new CloudFrontLambdaStack(
    app,
    `NagiyuRootCloudFront${envSuffix}`,
    {
      env: { account, region: 'us-east-1' },
      environment,
      functionUrl: lambdaStack.functionUrl!.url,
      crossRegionReferences: true,
      description: `CloudFront Distribution for nagiyu root domain (${environment})`,
    }
  );
  cloudFrontLambdaStack.addDependency(lambdaStack);
} else {
  // Prod 環境: ALB + ECS + CloudFront
  const ecsClusterStack = new EcsClusterStack(app, `NagiyuRootCluster${envSuffix}`, {
    env: { account, region },
    environment,
    description: `ECS Cluster for nagiyu root domain (${environment})`,
  });

  const albStack = new AlbStack(app, `NagiyuRootAlb${envSuffix}`, {
    env: { account, region },
    environment,
    description: `Application Load Balancer for nagiyu root domain (${environment})`,
  });

  const ecsServiceStack = new EcsServiceStack(app, `NagiyuRootService${envSuffix}`, {
    env: { account, region },
    environment,
    description: `ECS Service for nagiyu root domain (${environment})`,
  });

  const cloudFrontStack = new CloudFrontStack(app, `NagiyuRootCloudFront${envSuffix}`, {
    env: { account, region },
    environment,
    description: `CloudFront Distribution for nagiyu root domain (${environment})`,
  });

  // Explicit stack dependencies (CDK does not detect SSM-based cross-stack dependencies automatically)
  // EcsService reads Cluster SSM and ALB SSM → must wait for both
  ecsServiceStack.addDependency(ecsClusterStack);
  ecsServiceStack.addDependency(albStack);
  // EcsService uses portal ECR image → must wait for ECR
  ecsServiceStack.addDependency(ecrStack);
  // CloudFront reads ALB DNS SSM → must wait for ALB
  cloudFrontStack.addDependency(albStack);
}

app.synth();

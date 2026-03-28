#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { BatchStack } from '../lib/batch-stack';
import { EcrStack } from '../lib/ecr-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import type { QuickClipEnvironment } from '../lib/environment';

const app = new cdk.App();
const env = (app.node.tryGetContext('env') || 'dev') as string;
const appVersion = process.env.APP_VERSION || app.node.tryGetContext('appVersion') || '0.1.0';
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`);
}
const typedEnv = env as QuickClipEnvironment;
const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);
const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const storageStack = new StorageStack(app, `NagiyuQuickClipStorage${envSuffix}`, {
  environment: typedEnv,
  env: stackEnv,
  description: `QuickClip Storage - ${env} environment`,
});

const dynamoStack = new DynamoDBStack(app, `NagiyuQuickClipDynamoDB${envSuffix}`, {
  environment: typedEnv,
  env: stackEnv,
  description: `QuickClip DynamoDB - ${env} environment`,
});

const ecrStack = new EcrStack(app, `NagiyuQuickClipECR${envSuffix}`, {
  environment: typedEnv,
  env: stackEnv,
  description: `QuickClip ECR - ${env} environment`,
});

const batchStack = new BatchStack(app, `NagiyuQuickClipBatch${envSuffix}`, {
  environment: typedEnv,
  env: stackEnv,
  storageBucket: storageStack.storageBucket,
  jobsTable: dynamoStack.jobsTable,
  description: `QuickClip Batch - ${env} environment`,
});
batchStack.addDependency(storageStack);
batchStack.addDependency(dynamoStack);
batchStack.addDependency(ecrStack);

const lambdaStack = new LambdaStack(app, `NagiyuQuickClipLambda${envSuffix}`, {
  environment: typedEnv,
  appVersion,
  webEcrRepositoryName: `nagiyu-quick-clip-ecr-${typedEnv}`,
  env: stackEnv,
  description: `QuickClip Lambda - ${env} environment`,
});
lambdaStack.addDependency(ecrStack);

const cloudFrontStack = new CloudFrontStack(app, `NagiyuQuickClipCloudFront${envSuffix}`, {
  environment: typedEnv,
  functionUrl: lambdaStack.functionUrl!.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
  description: `QuickClip CloudFront - ${env} environment`,
});
cloudFrontStack.addDependency(lambdaStack);

app.synth();

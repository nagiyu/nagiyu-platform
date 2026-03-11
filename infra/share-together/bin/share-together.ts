#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { EcrStack } from '../lib/ecr-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { IAMStack } from '../lib/iam-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';

const app = new cdk.App();

const env = app.node.tryGetContext('env') || 'dev';
const appVersion = process.env.APP_VERSION || app.node.tryGetContext('appVersion') || '0.0.0';

const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`);
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

const dynamoStack = new DynamoDBStack(app, `NagiyuShareTogetherDynamoDB${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Share Together DynamoDB - ${env} environment`,
});

const ecrStack = new EcrStack(app, `NagiyuShareTogetherECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Share Together ECR - ${env} environment`,
});

const lambdaStack = new LambdaStack(app, `NagiyuShareTogetherLambda${envSuffix}`, {
  environment: env,
  appVersion,
  dynamoTable: dynamoStack.table,
  env: stackEnv,
  description: `Share Together Lambda - ${env} environment`,
});
lambdaStack.addDependency(dynamoStack);
lambdaStack.addDependency(ecrStack);

const iamStack = new IAMStack(app, `NagiyuShareTogetherIAM${envSuffix}`, {
  environment: env,
  webRuntimePolicy: lambdaStack.webRuntimePolicy,
  env: stackEnv,
  description: `Share Together IAM Resources - ${env} environment`,
});
iamStack.addDependency(lambdaStack);

if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

const cloudFrontStack = new CloudFrontStack(app, `NagiyuShareTogetherCloudFront${envSuffix}`, {
  environment: env,
  functionUrl: lambdaStack.functionUrl.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  crossRegionReferences: true,
  description: `Share Together CloudFront - ${env} environment`,
});
cloudFrontStack.addDependency(lambdaStack);

app.synth();

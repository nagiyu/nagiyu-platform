#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { SecretsStack } from '../lib/secrets-stack';
import { S3Stack } from '../lib/s3-stack';
import { WebECRStack, BatchECRStack } from '../lib/ecr-stacks';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import { BatchStack } from '../lib/batch-stack';
import { IAMStack } from '../lib/iam-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';
const appVersion = process.env.APP_VERSION || '1.0.0';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`);
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// 1. DynamoDB スタックを作成
const dynamoStack = new DynamoDBStack(app, `NagiyuNiconicoMylistAssistantDynamoDB${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant DynamoDB - ${env} environment`,
});

// 2. Secrets スタックを作成
const secretsStack = new SecretsStack(app, `NagiyuNiconicoMylistAssistantSecrets${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Secrets Manager - ${env} environment`,
});

// 3. S3 スタックを作成
const s3Stack = new S3Stack(app, `NagiyuNiconicoMylistAssistantS3${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant S3 - ${env} environment`,
});

// 4. ECR スタックを作成（web用）
const webEcrStack = new WebECRStack(app, `NagiyuNiconicoMylistAssistantWebECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Web ECR - ${env} environment`,
});

// 5. ECR スタックを作成（batch用）
const batchEcrStack = new BatchECRStack(app, `NagiyuNiconicoMylistAssistantBatchECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Niconico Mylist Assistant Batch ECR - ${env} environment`,
});

// 6. Batch スタックを作成
const batchStack = new BatchStack(app, `NagiyuNiconicoMylistAssistantBatch${envSuffix}`, {
  environment: env,
  dynamoTableArn: dynamoStack.table.tableArn,
  encryptionSecretArn: secretsStack.encryptionSecret.secretArn,
  encryptionSecretName: secretsStack.encryptionSecret.secretName,
  screenshotBucketArn: s3Stack.screenshotBucket.bucketArn,
  screenshotBucketName: s3Stack.screenshotBucketName,
  vapidSecretArn: secretsStack.vapidSecret.secretArn,
  env: stackEnv,
  description: `Niconico Mylist Assistant Batch - ${env} environment`,
});
// Batch は DynamoDB、Secrets、S3、Batch ECR に依存
batchStack.addDependency(dynamoStack);
batchStack.addDependency(secretsStack);
batchStack.addDependency(s3Stack);
batchStack.addDependency(batchEcrStack);

// 7. Lambda スタックを作成
// NextAuth Secret（Auth サービスから取得、未指定の場合はプレースホルダー）
const nextAuthSecret = app.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER';

const lambdaStack = new LambdaStack(app, `NagiyuNiconicoMylistAssistantLambda${envSuffix}`, {
  environment: env,
  appVersion: appVersion,
  webEcrRepositoryName: webEcrStack.repository.repositoryName,
  dynamoTable: dynamoStack.table,
  nextAuthSecret,
  batchJobQueueArn: batchStack.jobQueueArn,
  batchJobDefinitionArn: batchStack.jobDefinitionArn,
  encryptionSecretArn: secretsStack.encryptionSecret.secretArn,
  encryptionSecretName: secretsStack.encryptionSecret.secretName,
  vapidSecretArn: secretsStack.vapidSecret.secretArn,
  env: stackEnv,
  description: `Niconico Mylist Assistant Lambda - ${env} environment`,
});
// Lambda は DynamoDB、Secrets、Web ECR、Batch に依存
lambdaStack.addDependency(dynamoStack);
lambdaStack.addDependency(secretsStack);
lambdaStack.addDependency(webEcrStack);
lambdaStack.addDependency(batchStack);

// 8. IAM スタック（開発用 IAM ユーザー - dev 環境のみ）
const iamStack = new IAMStack(app, `NagiyuNiconicoMylistAssistantIAM${envSuffix}`, {
  environment: env,
  webRuntimePolicy: lambdaStack.webRuntimePolicy,
  batchRuntimePolicy: batchStack.batchRuntimePolicy,
  env: stackEnv,
  description: `Niconico Mylist Assistant IAM Resources - ${env} environment`,
});
iamStack.addDependency(lambdaStack);
iamStack.addDependency(batchStack);

// 9. CloudFront スタックを作成
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

const cloudFrontStack = new CloudFrontStack(
  app,
  `NagiyuNiconicoMylistAssistantCloudFront${envSuffix}`,
  {
    environment: env,
    functionUrl: lambdaStack.functionUrl.url,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1', // CloudFront は us-east-1 必須
    },
    crossRegionReferences: true,
    description: `Niconico Mylist Assistant CloudFront - ${env} environment`,
  }
);

// CloudFront は Lambda に依存
cloudFrontStack.addDependency(lambdaStack);

app.synth();

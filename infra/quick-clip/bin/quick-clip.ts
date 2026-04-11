#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { StorageStack } from '../lib/storage-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { BatchStack } from '../lib/batch-stack';
import { EcrStack } from '../lib/ecr-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import { SecretsStack } from '../lib/secrets-stack';
import type { QuickClipEnvironment } from '../lib/environment';
import { getBatchJobQueueArn } from '@nagiyu/infra-common';

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

// OpenAI API キー（デプロイ時に --context openAiApiKey=xxx で渡す、未指定の場合は PLACEHOLDER）
const openAiApiKey = app.node.tryGetContext('openAiApiKey') || 'PLACEHOLDER';

const secretsStack = new SecretsStack(app, `NagiyuQuickClipSecrets${envSuffix}`, {
  environment: typedEnv,
  env: stackEnv,
  description: `QuickClip Secrets - ${env} environment`,
});

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
  openAiApiKey,
  description: `QuickClip Batch - ${env} environment`,
});
batchStack.addDependency(storageStack);
batchStack.addDependency(dynamoStack);
batchStack.addDependency(ecrStack);

// Batch ARN を命名規則から直接計算し、CloudFormation Export/Import 依存を回避する
// batchStack.jobQueueArn / jobDefinitionArns (Fn::GetAtt トークン) を渡すと CDK が自動的に
// BatchStack に Export を作成し LambdaStack に Fn::ImportValue を生成する。
// Job Definition の更新（リビジョン変更）時に Export 値が変わり CF が更新を拒否するため、
// リテラル文字列で ARN を構築して Export/Import を使わない設計にする。
const batchJobQueueArn = getBatchJobQueueArn(
  stackEnv.region,
  stackEnv.account!,
  `nagiyu-quick-clip-${typedEnv}`
);

const lambdaStack = new LambdaStack(app, `NagiyuQuickClipLambda${envSuffix}`, {
  environment: typedEnv,
  appVersion,
  webEcrRepositoryName: `nagiyu-quick-clip-ecr-${typedEnv}`,
  clipLambdaEcrRepositoryName: `nagiyu-quick-clip-lambda-clip-ecr-${typedEnv}`,
  zipLambdaEcrRepositoryName: `nagiyu-quick-clip-lambda-zip-ecr-${typedEnv}`,
  jobsTableName: dynamoStack.jobsTable.tableName,
  jobsTableArn: dynamoStack.jobsTable.tableArn,
  storageBucketName: storageStack.storageBucket.bucketName,
  storageBucketArn: storageStack.storageBucket.bucketArn,
  batchJobQueueArn,
  batchJobDefinitionPrefix: batchStack.jobDefinitionPrefix,
  env: stackEnv,
  description: `QuickClip Lambda - ${env} environment`,
});
lambdaStack.addDependency(ecrStack);
lambdaStack.addDependency(storageStack);
lambdaStack.addDependency(dynamoStack);
lambdaStack.addDependency(secretsStack);

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

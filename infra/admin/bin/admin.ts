#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ECRStack } from '../lib/ecr-stack';
import { BatchEcrStack } from '../lib/batch-ecr-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { BatchLambdaStack } from '../lib/batch-lambda-stack';
import { SelfMonitoringAlarmsStack } from '../lib/self-monitoring-alarms-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import { AdminStack } from '../lib/admin-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

// 環境変数からバージョンを取得（デフォルト: '1.0.0'）
const appVersion = process.env.APP_VERSION || '1.0.0';

// 許可された環境値のチェック
const allowedEnvironments = ['dev', 'prod'];
if (!allowedEnvironments.includes(env)) {
  throw new Error(
    `Invalid environment: ${env}. Allowed values: ${allowedEnvironments.join(', ')}`
  );
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

const envSuffix = env.charAt(0).toUpperCase() + env.slice(1);

// ECR スタックを作成
// Note: Secrets Manager は Auth サービスで管理される nagiyu-auth-nextauth-secret を使用
const ecrStack = new ECRStack(app, `NagiyuAdminECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Admin Service ECR - ${env} environment`,
});

// Lambda スタックを作成
const lambdaStack = new LambdaStack(app, `NagiyuAdminLambda${envSuffix}`, {
  environment: env,
  appVersion: appVersion,
  env: stackEnv,
  description: `Admin Service Lambda - ${env} environment`,
});

// Admin インフラスタックを作成（SNS / DynamoDB / Secrets）
new AdminStack(app, `NagiyuAdminInfra${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Admin Service Infra - ${env} environment`,
});

// Admin Batch (alarm-ingest / stream-handler Lambda) ECR スタック
new BatchEcrStack(app, `NagiyuAdminBatchECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Admin Batch ECR - ${env} environment`,
});

// Admin Batch Lambda スタック
// - alarm-ingest: SNS (admin alarms) → DynamoDB (error-events)
// - stream-handler: error-events DynamoDB Streams → Web Push fan-out
const batchLambdaStack = new BatchLambdaStack(app, `NagiyuAdminBatchLambda${envSuffix}`, {
  environment: env as 'dev' | 'prod',
  batchEcrRepositoryName: `nagiyu-admin-batch-ecr-${env}`,
  env: stackEnv,
  description: `Admin Batch Lambda - ${env} environment`,
});

// 自己監視アラーム
// 新システム (alarm-ingest / stream-handler / DLQ / error-events table) の障害を
// 別 SNS Topic 経由で検知し、既存 /api/notify/sns へ HTTPS 配信する
const selfMonitoringTopicArn = `arn:aws:sns:${stackEnv.region}:${process.env.CDK_DEFAULT_ACCOUNT}:nagiyu-admin-self-monitoring-${env}`;
new SelfMonitoringAlarmsStack(app, `NagiyuAdminSelfMonitoring${envSuffix}`, {
  environment: env as 'dev' | 'prod',
  selfMonitoringTopicArn,
  alarmIngestFunction: batchLambdaStack.alarmIngestFunction,
  streamHandlerFunction: batchLambdaStack.streamHandlerFunction,
  streamHandlerDeadLetterQueue: batchLambdaStack.streamHandlerDeadLetterQueue,
  env: stackEnv,
  description: `Admin Self-Monitoring Alarms - ${env} environment`,
});

// CloudFront スタックを作成
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

new CloudFrontStack(app, `NagiyuAdminCloudFront${envSuffix}`, {
  environment: env,
  functionUrl: lambdaStack.functionUrl.url,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront は us-east-1 必須
  },
  crossRegionReferences: true,
  description: `Admin Service CloudFront - ${env} environment`,
});

app.synth();

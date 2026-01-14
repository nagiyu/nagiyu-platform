#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SecretsStack } from '../lib/secrets-stack';
import { EcrStack } from '../lib/ecr-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { SNSStack } from '../lib/sns-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { CloudFrontStack } from '../lib/cloudfront-stack';
import { EventBridgeStack } from '../lib/eventbridge-stack';
import { CloudWatchAlarmsStack } from '../lib/cloudwatch-alarms-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

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

// 1. Secrets スタック（VAPID キー用）
const secretsStack = new SecretsStack(app, `NagiyuStockTrackerSecrets${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Stock Tracker Secrets - ${env} environment`,
});

// 2. ECR スタック（Web/Batch 用リポジトリ）
const ecrStack = new EcrStack(app, `NagiyuStockTrackerECR${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Stock Tracker ECR Repositories - ${env} environment`,
});

// 3. DynamoDB スタック（Single Table Design）
const dynamoStack = new DynamoDBStack(app, `NagiyuStockTrackerDynamoDB${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Stock Tracker DynamoDB - ${env} environment`,
});

// 4. SNS スタック（アラーム通知用）
const snsStack = new SNSStack(app, `NagiyuStockTrackerSNS${envSuffix}`, {
  environment: env,
  env: stackEnv,
  description: `Stock Tracker SNS - ${env} environment`,
});

// 5. Lambda スタック（Web + Batch × 3関数）
// NextAuth Secret ARN（オプショナル）
const authSecretArn = app.node.tryGetContext('authSecretArn');

const lambdaStack = new LambdaStack(app, `NagiyuStockTrackerLambda${envSuffix}`, {
  environment: env,
  webEcrRepositoryName: `stock-tracker-web-${env}`,
  batchEcrRepositoryName: `stock-tracker-batch-${env}`,
  dynamoTable: dynamoStack.table,
  vapidSecret: secretsStack.vapidSecret,
  authSecretArn,
  env: stackEnv,
  description: `Stock Tracker Lambda Functions - ${env} environment`,
});
lambdaStack.addDependency(ecrStack);
lambdaStack.addDependency(secretsStack);
lambdaStack.addDependency(dynamoStack);

// 6. CloudFront スタック
if (!lambdaStack.functionUrl) {
  throw new Error('Lambda function URL is not available');
}

const cloudFrontStack = new CloudFrontStack(
  app,
  `NagiyuStockTrackerCloudFront${envSuffix}`,
  {
    environment: env,
    functionUrl: lambdaStack.functionUrl.url,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1', // CloudFront は us-east-1 必須
    },
    crossRegionReferences: true,
    description: `Stock Tracker CloudFront - ${env} environment`,
  }
);
cloudFrontStack.addDependency(lambdaStack);

// 7. EventBridge スタック（バッチ処理スケジューラ）
const eventBridgeStack = new EventBridgeStack(
  app,
  `NagiyuStockTrackerEventBridge${envSuffix}`,
  {
    environment: env,
    batchMinuteFunction: lambdaStack.batchMinuteFunction,
    batchHourlyFunction: lambdaStack.batchHourlyFunction,
    batchDailyFunction: lambdaStack.batchDailyFunction,
    env: stackEnv,
    description: `Stock Tracker EventBridge Scheduler - ${env} environment`,
  }
);
eventBridgeStack.addDependency(lambdaStack);

// 8. CloudWatch Alarms スタック（監視アラーム）
const alarmsStack = new CloudWatchAlarmsStack(
  app,
  `NagiyuStockTrackerAlarms${envSuffix}`,
  {
    environment: env,
    webFunction: lambdaStack.webFunction,
    batchMinuteFunction: lambdaStack.batchMinuteFunction,
    batchHourlyFunction: lambdaStack.batchHourlyFunction,
    batchDailyFunction: lambdaStack.batchDailyFunction,
    dynamoTable: dynamoStack.table,
    alarmTopic: snsStack.alarmTopic,
    env: stackEnv,
    description: `Stock Tracker CloudWatch Alarms - ${env} environment`,
  }
);
alarmsStack.addDependency(lambdaStack);
alarmsStack.addDependency(dynamoStack);
alarmsStack.addDependency(snsStack);

app.synth();

#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LiveTalkEcrStack } from '../lib/ecr-stack';
import { LiveTalkBatchEcrStack } from '../lib/batch-ecr-stack';
import { LiveTalkAlbStack } from '../lib/alb-stack';
import { LiveTalkDynamoDbStack } from '../lib/dynamodb-stack';
import { LiveTalkEcsServiceStack } from '../lib/ecs-service-stack';
import { LiveTalkCloudFrontStack } from '../lib/cloudfront-stack';
import { LiveTalkSecretsStack } from '../lib/secrets-stack';
import { LiveTalkBatchStack } from '../lib/batch-stack';

const app = new cdk.App();

// 環境設定
// 既定値は 'dev'。誤って本番にデプロイしないようガード
const rawEnvironment = process.env.ENVIRONMENT || 'dev';
if (rawEnvironment !== 'dev' && rawEnvironment !== 'prod') {
  throw new Error(`Invalid ENVIRONMENT: ${rawEnvironment}. Allowed: dev, prod`);
}
const environment = rawEnvironment as 'dev' | 'prod';
const envSuffix = environment.charAt(0).toUpperCase() + environment.slice(1);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';
const stackEnv = { account, region };

// CD ワークフローから渡されるアプリバージョン（package.json の version）
// ECS Task の APP_VERSION env として /api/health の version 表示に利用される
const appVersion = process.env.APP_VERSION || '1.0.0';

// LiveTalk ECR Repository Stack（dev / prod 別に作成、Component: livetalk）
new LiveTalkEcrStack(app, `NagiyuLiveTalkEcr${envSuffix}`, {
  env: stackEnv,
  environment,
  description: `LiveTalk ECR Repository (${environment})`,
});

// LiveTalk Batch ECR Repository Stack（Phase 3c / Issue #3281）
const batchEcrStack = new LiveTalkBatchEcrStack(app, `NagiyuLiveTalkBatchEcr${envSuffix}`, {
  env: stackEnv,
  environment,
  description: `LiveTalk Batch ECR Repository (${environment})`,
});

// LiveTalk Secrets Stack（Phase 2b / Issue #3248）
// OpenAI / Anthropic API キーを Secrets Manager で管理。
// ECS Service Stack の Task Role が読取権限を持つ前提。
new LiveTalkSecretsStack(app, `NagiyuLiveTalkSecrets${envSuffix}`, {
  env: stackEnv,
  environment,
  description: `LiveTalk Secrets (${environment})`,
});

// LiveTalk 専用 ALB Stack（共通 VPC + 個別 ALB / Target Group / Listener）
// 月額固定費 ~$22/月 が発生する点に留意
const albStack = new LiveTalkAlbStack(app, `NagiyuLiveTalkAlb${envSuffix}`, {
  env: stackEnv,
  environment,
  description: `LiveTalk ALB (${environment})`,
});

// LiveTalk DynamoDB Single Table Stack（Phase 2a で追加）
// 会話履歴・プロファイル・キャラ状態を 1 テーブルで保持する。
// テーブル名 / ARN は ECS Service Stack 側でも `getDynamoDBTableName('livetalk', env)`
// / `getDynamoDBTableArn(...)` を呼んで独立に組み立てる（SSM もクロススタック参照も
// 介さない方針）。両 stack の deploy 順序や export 依存は発生しない。
const dynamoDbStack = new LiveTalkDynamoDbStack(
  app,
  `NagiyuLiveTalkDynamoDB${envSuffix}`,
  {
    env: stackEnv,
    environment,
    description: `LiveTalk DynamoDB Single Table (${environment})`,
  }
);

// LiveTalk ECS Service Stack（共通 Cluster に Attach、ALB Target Group へ登録）
const ecsServiceStack = new LiveTalkEcsServiceStack(
  app,
  `NagiyuLiveTalkService${envSuffix}`,
  {
    env: stackEnv,
    environment,
    appVersion,
    description: `LiveTalk ECS Service (${environment})`,
  }
);

// LiveTalk CloudFront Distribution Stack（Phase 1d）
// dev / prod ともに登録。Route53 ALIAS レコードは CloudFront stack 内で同時作成する
// （`infra/ui-storybook` パターン）ため、cross-stack 依存・SSM 順序問題は発生しない。
// 実際の prod deploy タイミングはブランチ運用（master push）で制御する。
const cloudFrontStack = new LiveTalkCloudFrontStack(
  app,
  `NagiyuLiveTalkCloudFront${envSuffix}`,
  {
    env: stackEnv,
    environment,
    description: `LiveTalk CloudFront Distribution (${environment})`,
  }
);

// LiveTalk Batch Stack（Phase 3c / Issue #3281）
// EventBridge 日次トリガー + Lambda + DLQ + IAM
const openAiApiKey =
  app.node.tryGetContext('openAiApiKey') || 'PLACEHOLDER_OPENAI_API_KEY';

const batchStack = new LiveTalkBatchStack(app, `NagiyuLiveTalkBatch${envSuffix}`, {
  env: stackEnv,
  environment,
  batchEcrRepositoryName: batchEcrStack.repository.repositoryName,
  openAiApiKey,
  description: `LiveTalk Batch（圧縮要約 Lambda + EventBridge）(${environment})`,
});

// Batch stack は Batch ECR stack に依存する（リポジトリ名参照のため）
batchStack.addDependency(batchEcrStack);
// Batch stack は DynamoDB stack と同様に決定論的 ARN 参照で deploy 順序不問

// SSM 経由の参照のため CDK は自動的にスタック間依存を検出できない。
// 明示的に依存を宣言して deploy 順を保証する。
ecsServiceStack.addDependency(albStack);
// CloudFront は ALB DNS を SSM から参照する。明示的に依存を宣言。
cloudFrontStack.addDependency(albStack);
// DynamoDB stack は ECS Service stack と直接依存しない：
// ECS 側は `getDynamoDBTableName('livetalk', env)` で名前 / ARN を決定論的に
// 組み立てており、SSM もクロススタック参照も介さないため、deploy 順は不問。
// （IAM ポリシーが指す ARN は実テーブル作成より先に書き出されても問題なし）

app.synth();

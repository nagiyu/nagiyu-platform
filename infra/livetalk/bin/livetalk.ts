#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LiveTalkEcrStack } from '../lib/ecr-stack';
import { LiveTalkAlbStack } from '../lib/alb-stack';
import { LiveTalkEcsServiceStack } from '../lib/ecs-service-stack';

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

// LiveTalk 専用 ALB Stack（共通 VPC + 個別 ALB / Target Group / Listener）
// 月額固定費 ~$22/月 が発生する点に留意
const albStack = new LiveTalkAlbStack(app, `NagiyuLiveTalkAlb${envSuffix}`, {
  env: stackEnv,
  environment,
  description: `LiveTalk ALB (${environment})`,
});

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

// SSM 経由の参照のため CDK は自動的にスタック間依存を検出できない。
// 明示的に依存を宣言して deploy 順を保証する。
ecsServiceStack.addDependency(albStack);

app.synth();

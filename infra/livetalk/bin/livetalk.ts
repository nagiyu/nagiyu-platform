#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LiveTalkEcrStack } from '../lib/ecr-stack';

const app = new cdk.App();

// 環境設定
// 既定値は 'dev'。誤って本番にデプロイしないようガード
const environment = process.env.ENVIRONMENT || 'dev';
const envSuffix = environment.charAt(0).toUpperCase() + environment.slice(1);
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// LiveTalk ECR Repository Stack（dev / prod 別に作成、Component: livetalk）
new LiveTalkEcrStack(app, `NagiyuLiveTalkEcr${envSuffix}`, {
  env: { account, region },
  environment,
  description: `LiveTalk ECR Repository (${environment})`,
});

app.synth();

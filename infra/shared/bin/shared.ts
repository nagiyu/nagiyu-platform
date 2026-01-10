#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { AcmStack } from '../lib/acm-stack';
import { IamPoliciesStack } from '../lib/iam/iam-policies-stack';
import { IamUsersStack } from '../lib/iam/iam-users-stack';

const app = new cdk.App();

// 環境パラメータを取得
const env = app.node.tryGetContext('env') || 'dev';

if (!['dev', 'prod'].includes(env)) {
  throw new Error(`Invalid environment: ${env}. Allowed: dev, prod`);
}

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
};

// VPC スタックを作成（既存のスタック名に合わせる）
new VpcStack(app, `nagiyu-shared-vpc-${env}`, {
  environment: env as 'dev' | 'prod',
  env: stackEnv,
  description: `Shared VPC Infrastructure - ${env} environment`,
});

// ACM スタックを作成（環境非依存）
// CloudFront 用の証明書は us-east-1 リージョン必須
const domainName = process.env.DOMAIN_NAME || app.node.tryGetContext('domainName');
if (!domainName) {
  throw new Error('DOMAIN_NAME environment variable or domainName context is required');
}

new AcmStack(app, 'SharedAcm', {
  domainName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront 用証明書は us-east-1 必須
  },
  description: 'Shared ACM Certificate for CloudFront',
});

// IAM Policies スタックを作成（環境非依存）
const policiesStack = new IamPoliciesStack(app, 'SharedIamPolicies', {
  env: stackEnv,
  description: 'Shared IAM Managed Policies for Deployment',
});

// IAM Users スタックを作成（ポリシーに依存）
const usersStack = new IamUsersStack(app, 'SharedIamUsers', {
  policies: {
    core: policiesStack.corePolicy,
    application: policiesStack.applicationPolicy,
    container: policiesStack.containerPolicy,
    integration: policiesStack.integrationPolicy,
  },
  env: stackEnv,
  description: 'Shared IAM Users for GitHub Actions and Local Development',
});

// スタック間の依存関係を明示
usersStack.addDependency(policiesStack);

app.synth();

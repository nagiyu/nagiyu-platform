#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { VpcStack } from '../lib/vpc-stack';
import { AcmStack } from '../lib/acm-stack';
import { IamCorePolicyStack } from '../lib/iam/iam-core-policy-stack';
import { IamApplicationPolicyStack } from '../lib/iam/iam-application-policy-stack';
import { IamContainerPolicyStack } from '../lib/iam/iam-container-policy-stack';
import { IamIntegrationPolicyStack } from '../lib/iam/iam-integration-policy-stack';
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

// VPC スタックを作成
new VpcStack(app, `NagiyuSharedVpc${env.charAt(0).toUpperCase() + env.slice(1)}`, {
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

new AcmStack(app, 'NagiyuSharedAcm', {
  domainName,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1', // CloudFront 用証明書は us-east-1 必須
  },
  description: 'Shared ACM Certificate for CloudFront',
});

// IAM Policies スタックを作成（環境非依存）
// ポリシーサイズ制限対策のため4つに分割
const corePolicyStack = new IamCorePolicyStack(app, 'NagiyuSharedIamCore', {
  env: stackEnv,
  description: 'Shared IAM Core Deploy Policy (CloudFormation, IAM, Network, Logs)',
});

const applicationPolicyStack = new IamApplicationPolicyStack(app, 'NagiyuSharedIamApplication', {
  env: stackEnv,
  description: 'Shared IAM Application Deploy Policy (Lambda, S3, DynamoDB, API Gateway, CloudFront)',
});

const containerPolicyStack = new IamContainerPolicyStack(app, 'NagiyuSharedIamContainer', {
  env: stackEnv,
  description: 'Shared IAM Container Deploy Policy (ECR, ECS, Batch)',
});

const integrationPolicyStack = new IamIntegrationPolicyStack(app, 'NagiyuSharedIamIntegration', {
  env: stackEnv,
  description: 'Shared IAM Integration and Security Deploy Policy (KMS, Secrets, SSM, SNS, SQS, EventBridge, Auto Scaling)',
});

// IAM Users スタックを作成（ポリシーに依存）
const usersStack = new IamUsersStack(app, 'NagiyuSharedIamUsers', {
  policies: {
    core: corePolicyStack.policy,
    application: applicationPolicyStack.policy,
    container: containerPolicyStack.policy,
    integration: integrationPolicyStack.policy,
  },
  env: stackEnv,
  description: 'Shared IAM Users for GitHub Actions and Local Development',
});

// スタック間の依存関係を明示
usersStack.addDependency(corePolicyStack);
usersStack.addDependency(applicationPolicyStack);
usersStack.addDependency(containerPolicyStack);
usersStack.addDependency(integrationPolicyStack);

app.synth();

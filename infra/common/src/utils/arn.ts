import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { Environment } from '../types/environment';

export function getLambdaFunctionArn(region: string, account: string, name: string): string {
  return `arn:aws:lambda:${region}:${account}:function:${name}`;
}

export function getDynamoDBTableArn(region: string, account: string, name: string): string {
  return `arn:aws:dynamodb:${region}:${account}:table/${name}`;
}

export function getS3BucketArn(name: string): string {
  return `arn:aws:s3:::${name}`;
}

export function getEcrRepositoryArn(region: string, account: string, name: string): string {
  return `arn:aws:ecr:${region}:${account}:repository/${name}`;
}

export function getIamRoleArn(account: string, name: string): string {
  return `arn:aws:iam::${account}:role/${name}`;
}

export function getIamManagedPolicyArn(account: string, name: string): string {
  return `arn:aws:iam::${account}:policy/${name}`;
}

export function getSecretsManagerSecretArn(region: string, account: string, name: string): string {
  return `arn:aws:secretsmanager:${region}:${account}:secret:${name}-*`;
}

export function getEcsClusterArn(region: string, account: string, name: string): string {
  return `arn:aws:ecs:${region}:${account}:cluster/${name}`;
}

export function getBatchJobQueueArn(region: string, account: string, name: string): string {
  return `arn:aws:batch:${region}:${account}:job-queue/${name}`;
}

export function getBatchJobDefinitionArn(region: string, account: string, name: string): string {
  return `arn:aws:batch:${region}:${account}:job-definition/${name}`;
}

/**
 * admin の本流アラーム集約 SNS トピック名を返す。
 * 複数サービスが通知先として参照するため、名前の組み立てをここに一本化する。
 */
export function getAdminAlarmTopicName(environment: Environment): string {
  return `nagiyu-admin-alarms-${environment}`;
}

/**
 * admin の本流アラーム集約 SNS トピックの ARN を返す。
 * account / region はスタックの env から解決するため、アカウント未確定の合成でも
 * 偽のアカウントが入らず、トークンのまま CloudFormation に解決を委ねる。
 */
export function getAdminAlarmTopicArn(scope: Construct, environment: Environment): string {
  return cdk.Stack.of(scope).formatArn({
    service: 'sns',
    resource: getAdminAlarmTopicName(environment),
  });
}
